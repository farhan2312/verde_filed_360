"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Modal, ModalHeader } from "@/components/interactive";
import { createBug } from "@/app/actions/bugs";
import { BUG_SEVERITIES } from "@/lib/bug-constants";

const KIND_TABS: { key: string; label: string; color: string }[] = [
  { key: "BUG", label: "🐞 Bug", color: "#C62828" },
  { key: "FEATURE", label: "💡 Feature", color: "#6A1B9A" },
];

const SEV_LABEL: Record<string, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High", CRITICAL: "Critical" };

/** Downscale an image file to a small JPEG data URL (max 1200px, ~0.7 quality) so it fits the action body. */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const max = 1200;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("no canvas"));
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("bad image")); };
    img.src = url;
  });
}

export function ReportBugButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [kind, setKind] = useState("BUG");
  const [severity, setSeverity] = useState("MEDIUM");
  const [page, setPage] = useState("");
  const [shot, setShot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const openModal = () => {
    setTitle(""); setDesc(""); setKind("BUG"); setSeverity("MEDIUM"); setPage(pathname || ""); setShot(null);
    setErr(null); setDone(false); setOpen(true);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try { setShot(await fileToDataUrl(file)); } catch { setErr("Couldn't read that image."); }
  };

  // While the modal is open, a pasted image (e.g. a clipboard screenshot) becomes the attachment.
  // Only images are intercepted, so pasting text into the description still works normally.
  useEffect(() => {
    if (!open) return;
    const onPaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.type.startsWith("image/")) {
          const file = it.getAsFile();
          if (file) {
            e.preventDefault();
            try { setShot(await fileToDataUrl(file)); setErr(null); } catch { setErr("Couldn't read the pasted image."); }
          }
          return;
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [open]);

  const submit = async () => {
    if (!title.trim()) { setErr("Please add a short title."); return; }
    setBusy(true); setErr(null);
    const res = await createBug({ title, description: desc, kind, severity, page, screenshot: shot });
    setBusy(false);
    if (res.ok) { setDone(true); setTimeout(() => setOpen(false), 1100); }
    else setErr(res.error ?? "Could not submit.");
  };

  const input = "w-full rounded-[10px] border border-[#E0E0E0] bg-white px-3 py-2 text-[13px] outline-none focus:border-[#7DA02E]";
  const label = "mb-1 block text-[11.5px] font-semibold text-[#616161]";

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        title="Report a problem with this page"
        className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#E0E0E0] bg-white px-3 py-[7px] text-[12px] font-semibold text-[#616161] transition-colors hover:border-[#C62828] hover:text-[#C62828]"
      >
        <span aria-hidden>🐞</span>
        <span className="hidden sm:inline">Report a Bug</span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} className="max-w-[520px]">
        <ModalHeader eyebrow="🐞 Report a Bug" eyebrowColor="#C62828" title="Report a Bug"
          subtitle="Tell us what went wrong — it goes straight to the admin's Bug Tracker." onClose={() => setOpen(false)} />
        <div className="px-6 py-5">
          {done ? (
            <div className="py-6 text-center">
              <div className="text-[28px]">✅</div>
              <div className="mt-2 text-[15px] font-bold text-[#1A1C1A]">Thanks — bug reported!</div>
              <div className="mt-1 text-[12.5px] text-[#9E9E9E]">The admin can now see and triage it.</div>
            </div>
          ) : (
            <div className="flex flex-col gap-3.5">
              <div>
                <span className={label}>Type</span>
                <div className="inline-flex rounded-[10px] border border-[#E0E0E0] bg-[#F5F7F5] p-1">
                  {KIND_TABS.map((k) => (
                    <button key={k.key} type="button" onClick={() => setKind(k.key)}
                      className="rounded-[8px] px-4 py-1.5 text-[12.5px] font-semibold transition-colors"
                      style={{ background: kind === k.key ? "#fff" : "transparent", color: kind === k.key ? k.color : "#9E9E9E", boxShadow: kind === k.key ? "0 1px 3px rgba(0,0,0,0.12)" : "none" }}>
                      {k.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className={label}>Title <span className="text-[#C62828]">*</span></span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short summary of the issue" className={input} autoFocus />
              </div>
              <div>
                <span className={label}>What happened?</span>
                <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={4}
                  placeholder="Steps to reproduce, what you expected, what actually happened…" className={`${input} resize-y`} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className={label}>Severity</span>
                  <select value={severity} onChange={(e) => setSeverity(e.target.value)} className={input}>
                    {BUG_SEVERITIES.map((s) => <option key={s} value={s}>{SEV_LABEL[s]}</option>)}
                  </select>
                </div>
                <div>
                  <span className={label}>Page / where</span>
                  <input value={page} onChange={(e) => setPage(e.target.value)} className={input} />
                </div>
              </div>
              <div>
                <span className={label}>Screenshot (optional)</span>
                <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
                {shot ? (
                  <div className="flex items-center gap-3 rounded-[10px] border border-[#E0E0E0] bg-[#FAFAFA] p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={shot} alt="screenshot" className="h-12 w-16 rounded object-cover" />
                    <button type="button" onClick={() => setShot(null)} className="text-[12px] font-semibold text-[#C62828] hover:underline">Remove</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => fileRef.current?.click()}
                    className="w-full rounded-[10px] border border-dashed border-[#C5CAD3] bg-[#EEF1F6] py-3 text-[12.5px] font-semibold text-[#5A6473] hover:bg-[#E7ECF3]">
                    📎 Click to attach — or paste a screenshot (Ctrl/⌘+V)
                  </button>
                )}
              </div>
              {err && <div className="text-[12px] font-semibold text-[#C62828]">{err}</div>}
              <div className="mt-1 flex justify-end gap-2">
                <button type="button" onClick={() => setOpen(false)} disabled={busy}
                  className="rounded-[10px] border border-[#E0E0E0] bg-white px-[18px] py-[9px] text-[13px] font-semibold text-[#616161] hover:bg-[#F5F5F5] disabled:opacity-50">Cancel</button>
                <button type="button" onClick={submit} disabled={busy}
                  className="rounded-[10px] bg-[#1E3A5F] px-[22px] py-[9px] text-[13px] font-semibold text-white hover:bg-[#152C49] disabled:opacity-50">
                  {busy ? "Submitting…" : kind === "FEATURE" ? "Submit Feature" : "Submit Bug"}</button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
