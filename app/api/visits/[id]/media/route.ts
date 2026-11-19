import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { getScope, visitScopeWhere } from "@/lib/scope";

/**
 * One photo or voice note from a visit, served as a real binary response.
 *
 * Visit media is stored as base64 data URIs on the Visit row. Inlining those into the page made the
 * visit detail HTML ~1.8 MB for a single visit with four photos: uncacheable, re-downloaded on every
 * view, and paid for again by every field officer on mobile data. Serving each item from its own URL
 * instead means the HTML carries a short `<img src>`, the browser fetches the images in parallel and
 * caches them, and the page query no longer has to de-TOAST multi-MB columns at all.
 *
 * Media is written once, when the visit is created, and never updated, so a given (visit, kind, index)
 * is immutable and can be cached hard. An ETag is sent as well, so a client that does revalidate gets
 * a cheap 304.
 *
 * RBAC is deliberately the SAME rule as the detail page: the id is AND-ed with `visitScopeWhere`, so
 * an out-of-store / out-of-region visit 404s here exactly as it does there. The response is marked
 * `private` so no shared cache or CDN may hold it.
 */

const MAX_INDEX = 199; // generous upper bound; keeps a silly ?i= from reaching the DB

/** `data:<mime>;base64,<payload>` -> bytes. Null for anything that is not a base64 data URI. */
function decodeDataUri(s: string): { mime: string; body: Buffer } | null {
  const comma = s.indexOf(",");
  if (!s.startsWith("data:") || comma < 0) return null;
  const header = s.slice(5, comma);
  if (!header.endsWith(";base64")) return null;
  const mime = header.slice(0, -";base64".length) || "application/octet-stream";
  // Only hand back types we are willing to let a browser render inline. Parameters are allowed because
  // the recorder stores voice notes as `audio/webm;codecs=opus`, and the charset-free parameter syntax
  // here also rules out whitespace, quotes and CR/LF, so this cannot inject a response header.
  if (!/^(image\/(png|jpe?g|webp|gif|avif)|audio\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+)(;[a-z0-9.+=_-]+)*$/i.test(mime)) return null;
  try {
    const body = Buffer.from(s.slice(comma + 1), "base64");
    return body.length ? { mime, body } : null;
  } catch {
    return null;
  }
}

const notFound = () => new Response("Not found", { status: 404 });

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") === "voice" ? "voice" : "photo";
  const i = Number(url.searchParams.get("i"));
  if (!Number.isInteger(id) || id <= 0) return notFound();
  if (!Number.isInteger(i) || i < 0 || i > MAX_INDEX) return notFound();

  const scope = await getScope();
  const visitScope = visitScopeWhere(scope);
  if (visitScope === "none") return notFound();

  let item: string | undefined;
  try {
    // Two branches rather than a conditional `select`, so only the column being served is read (and
    // therefore de-TOASTed) and so the row's type is known.
    const where = visitScope ? { AND: [{ id }, visitScope] } : { id };
    if (kind === "photo") {
      const row = await prisma.visit.findFirst({ where, select: { photos: true } });
      if (!row) return notFound();
      item = row.photos?.[i];
    } else {
      const row = await prisma.visit.findFirst({ where, select: { voiceNotes: true } });
      if (!row) return notFound();
      item = row.voiceNotes?.[i];
    }
  } catch {
    return new Response("Unavailable", { status: 503 });
  }
  if (!item) return notFound();

  // Already a URL (if media ever moves to blob storage, the rows become links) - send the client there.
  if (/^https?:\/\//i.test(item)) return Response.redirect(item, 307);

  const decoded = decodeDataUri(item);
  if (!decoded) return notFound();

  const etag = `"${createHash("sha1").update(decoded.body).digest("base64url")}"`;
  if (req.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": "private, max-age=31536000, immutable" } });
  }

  return new Response(new Uint8Array(decoded.body), {
    headers: {
      "Content-Type": decoded.mime,
      "Content-Length": String(decoded.body.length),
      "Cache-Control": "private, max-age=31536000, immutable",
      ETag: etag,
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}
