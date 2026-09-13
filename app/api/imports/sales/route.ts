import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { importSalesMatrix, parseCsvMatrix } from "@/lib/sales-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // large monthly files can take a while (platform permitting)

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }
  const uploadedBy = session.name || "Admin";

  let filename = "upload";
  let fileType: "csv" | "xlsx" = "csv";
  let fileSizeKb: number | null = null;
  let importId: number | null = null;
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file received." }, { status: 400 });
    }
    filename = file.name || "upload";
    const isXlsx = /\.xlsx?$/i.test(filename);
    const isCsv = /\.csv$/i.test(filename);
    if (!isXlsx && !isCsv) {
      return NextResponse.json({ error: "Please upload a .csv or .xlsx file." }, { status: 400 });
    }
    fileType = isCsv ? "csv" : "xlsx";
    const buf = Buffer.from(await file.arrayBuffer());
    fileSizeKb = Math.round(buf.length / 1024);

    let rows: string[][];
    if (isCsv) {
      rows = parseCsvMatrix(buf.toString("utf-8"));
    } else {
      const wb = XLSX.read(buf, { type: "buffer" });
      const wsName = wb.SheetNames.find((n) => /sale/i.test(n)) ?? wb.SheetNames[0];
      const ws = wb.Sheets[wsName];
      rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: "" });
    }

    // Create the import record FIRST so its id can be stamped onto every Sale + new Farmer it creates
    // (that stamp is what lets the row's "Delete" button remove exactly this batch later).
    const imp = await prisma.salesImport.create({
      data: { filename, fileType, fileSizeKb, uploadedBy, status: "RUNNING" },
    });
    importId = imp.id;

    const summary = await importSalesMatrix(rows, uploadedBy, imp.id);

    await prisma.salesImport.update({
      where: { id: imp.id },
      data: {
        status: "SUCCESS",
        lineItems: summary.lineItems, bills: summary.bills,
        newCustomers: summary.newCustomers, salesInserted: summary.salesInserted,
        skipped: summary.skipped, rangeStart: summary.rangeStart, rangeEnd: summary.rangeEnd,
      },
    });
    await prisma.auditLog.create({
      data: {
        actor: uploadedBy, action: "IMPORT", entity: "Sale",
        detail: `Imported ${summary.salesInserted} sales (${summary.newCustomers} new customers) from ${filename}`,
      },
    }).catch(() => {});

    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Import failed.";
    if (importId != null) {
      await prisma.salesImport.update({ where: { id: importId }, data: { status: "FAILED", error: message.slice(0, 500) } }).catch(() => {});
    } else {
      await prisma.salesImport.create({
        data: { filename, fileType, fileSizeKb, uploadedBy, status: "FAILED", error: message.slice(0, 500) },
      }).catch(() => {});
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
