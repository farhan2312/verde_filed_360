/**
 * URLs for a visit's photos and voice notes.
 *
 * The bytes live on the Visit row as base64 data URIs, but nothing should put those in a page: one
 * visit with four photos is ~1.8 MB of HTML that no browser can cache. Pages pass these URLs to
 * <img> / <audio> instead and let app/api/visits/[id]/media serve each item, which it does with an
 * immutable cache header. The counts come from Visit.photoCount / voiceNoteCount, so building these
 * needs no access to the heavy columns at all.
 */
export interface VisitMediaUrls {
  photos: string[];
  voiceNotes: string[];
}

const list = (visitId: number, kind: "photo" | "voice", n: number): string[] =>
  Array.from({ length: Math.max(0, n | 0) }, (_, i) => `/api/visits/${visitId}/media?kind=${kind}&i=${i}`);

export function visitMediaUrls(visitId: number, photoCount: number | null | undefined, voiceNoteCount: number | null | undefined): VisitMediaUrls {
  return {
    photos: list(visitId, "photo", photoCount ?? 0),
    voiceNotes: list(visitId, "voice", voiceNoteCount ?? 0),
  };
}
