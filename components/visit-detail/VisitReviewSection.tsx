"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { saveVisitReview, unreviewVisit } from "@/app/actions/visit-review";
import { REVIEW_RATING_MAX, type VisitReviewState } from "@/lib/visit-review-types";

/**
 * Visit review panel: optional comment, optional 1–5 rating, "Needs follow-up" flag (creates an Action),
 * plus the immutable revision history. Reused by the visit detail page and the review queue drawer —
 * `onSaved` defaults to a page reload.
 */
export function VisitReviewSection({ visitId, review, onSaved }: {
  visitId: number;
  review: VisitReviewState;
  onSaved?: () => void;
}) {
  const { reviewed, canReview, flag } = review;
  const [editing, setEditing] = useState(!reviewed && canReview);
  const [note, setNote] = useState(review.note);
  const [rating, setRating] = useState<number | null>(review.rating);
  const [flagOn, setFlagOn] = useState(flag.open);
  const [flagDue, setFlagDue] = useState(review.defaultFlagDue);
  const [flagNote, setFlagNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const done = onSaved ?? (() => location.reload());

  const resetForm = () => { setNote(review.note); setRating(review.rating); setFlagOn(flag.open); setFlagNote(""); setErr(null); };
  const save = () => start(async () => {
    setErr(null);
    const r = await saveVisitReview(visitId, { note, rating, flag: flagOn, flagDueDate: flagDue, flagNote });
    if (r.ok) done(); else setErr(r.error ?? "Failed.");
  });
  const remove = () => start(async () => {
    setErr(null);
    const r = await unreviewVisit(visitId);
    if (r.ok) done(); else setErr(r.error ?? "Failed.");
  });

  const box = "rounded-2xl border p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]";
  const tone = !reviewed ? "border-[#F5CE8E] bg-[#FFFDF7]" : flag.open ? "border-[#F5CE8E] bg-[#FFFBF2]" : "border-[#E9F2CF] bg-[#F6FBF6]";

  return (
    <div className={`${box} ${!reviewed && !canReview ? "border-[#E3EAF0] bg-[#F7F9FB]" : tone}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[14px] font-bold text-[#1A1C1A]">Visit review</span>
        {reviewed ? (
          <span className="rounded-full bg-[#F5F9EA] px-2 py-0.5 text-[10.5px] font-bold text-[#7DA02E]">✓ Reviewed</span>
        ) : canReview ? (
          <span className="rounded-full bg-[#FFF3E0] px-2 py-0.5 text-[10.5px] font-bold text-[#E65100]">Pending review</span>
        ) : (
          <span className="rounded-full bg-[#ECEFF1] px-2 py-0.5 text-[10.5px] font-bold text-[#546E7A]">Awaiting RM sign-off</span>
        )}
        {flag.open && <FlagChip actionId={flag.actionId} due={flag.due} />}
        {!flag.open && flag.resolvedAt && (
          <span className="rounded-full bg-[#F1F8E9] px-2 py-0.5 text-[10.5px] font-semibold text-[#558B2F]">Follow-up resolved · {flag.resolvedAt}</span>
        )}
      </div>

      {/* Officer (or anyone who can't review) on a not-yet-reviewed visit */}
      {!reviewed && !canReview && (
        <p className="mt-1 text-[12.5px] text-[#607D8B]">Reviewing this visit is the Regional Manager’s task — nothing is pending on your side.</p>
      )}

      {/* Read view */}
      {reviewed && !editing && (
        <>
          {review.rating != null && <div className="mb-2"><Stars value={review.rating} /></div>}
          {review.note
            ? <div className="whitespace-pre-wrap rounded-[10px] bg-white/70 px-3.5 py-2.5 text-[13px] leading-relaxed text-[#33691E] ring-1 ring-[#F5F9EA]">{review.note}</div>
            : <div className="text-[12.5px] italic text-[#9E9E9E]">Signed off with no comment.</div>}
          <div className="mt-2 text-[11.5px] text-[#616161]">Reviewed by {review.reviewedBy}</div>
          {canReview && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => { resetForm(); setEditing(true); }} className="rounded-[10px] border border-[#7DA02E] px-3.5 py-1.5 text-[12px] font-semibold text-[#7DA02E] hover:bg-[#F5F9EA]">Edit review</button>
              <button type="button" onClick={remove} disabled={busy} className="rounded-[10px] border border-[#E0E0E0] px-3.5 py-1.5 text-[12px] font-semibold text-[#C62828] hover:bg-[#FDECEA] disabled:opacity-50">Remove review</button>
            </div>
          )}
        </>
      )}

      {/* Review / edit form */}
      {canReview && editing && (
        <div className="flex flex-col gap-3">
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase text-[#9E9E9E]">Comment (optional)</div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
              placeholder="Feedback for the officer — what was good, what to fix, what to follow up…"
              className="w-full resize-y rounded-[10px] border border-[#E0E0E0] bg-white px-3.5 py-2.5 text-[13px] outline-none focus:border-[#7DA02E]" />
          </div>

          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase text-[#9E9E9E]">Visit quality (optional)</div>
            <div className="flex items-center gap-2">
              <Stars value={rating} onChange={setRating} />
              {rating != null && <button type="button" onClick={() => setRating(null)} className="text-[11px] font-semibold text-[#9E9E9E] hover:text-[#616161]">Clear</button>}
            </div>
          </div>

          <div className={`rounded-[10px] border px-3.5 py-3 ${flagOn ? "border-[#F5CE8E] bg-[#FFF8EC]" : "border-[#E0E0E0] bg-white"}`}>
            <label className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-[#1A1C1A]">
              <input type="checkbox" checked={flagOn} onChange={(e) => setFlagOn(e.target.checked)} className="h-4 w-4 accent-[#E65100]" />
              🚩 Needs follow-up
            </label>
            {flagOn && !flag.open && (
              <div className="mt-2.5 grid gap-2 sm:grid-cols-[160px_1fr]">
                <div>
                  <div className="mb-1 text-[10.5px] font-semibold uppercase text-[#9E9E9E]">Due by</div>
                  <input type="date" value={flagDue} onChange={(e) => setFlagDue(e.target.value)}
                    className="w-full rounded-lg border border-[#E0E0E0] bg-white px-2.5 py-1.5 text-[13px]" />
                </div>
                <div>
                  <div className="mb-1 text-[10.5px] font-semibold uppercase text-[#9E9E9E]">What needs to happen</div>
                  <input value={flagNote} onChange={(e) => setFlagNote(e.target.value)} placeholder="Defaults to your comment"
                    className="w-full rounded-lg border border-[#E0E0E0] bg-white px-2.5 py-1.5 text-[13px]" />
                </div>
                <p className="text-[11px] text-[#8D6E00] sm:col-span-2">Saving creates a follow-up in the Action Registry for this store. The flag clears when that action is signed off.</p>
              </div>
            )}
            {flagOn && flag.open && (
              <p className="mt-1.5 text-[11.5px] text-[#8D6E00]">
                Open follow-up{flag.due ? ` due ${flag.due}` : ""} — <Link href="/action-registry" className="font-semibold underline">view in Action Registry</Link>. Untick to withdraw it.
              </p>
            )}
            {!flagOn && flag.open && (
              <p className="mt-1.5 text-[11.5px] font-semibold text-[#C62828]">Saving will close the linked follow-up action.</p>
            )}
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={busy} className="rounded-[10px] bg-[#7DA02E] px-4 py-2 text-[13px] font-bold text-white hover:bg-[#66852A] disabled:opacity-50">
              {busy ? "Saving…" : reviewed ? "Save changes" : "Mark reviewed"}
            </button>
            {reviewed && <button type="button" onClick={() => { resetForm(); setEditing(false); }} className="rounded-[10px] border border-[#E0E0E0] px-4 py-2 text-[13px] font-semibold text-[#616161]">Cancel</button>}
          </div>
        </div>
      )}

      {err && <div className="mt-2 text-[12px] font-semibold text-[#C62828]">{err}</div>}

      {review.history && review.history.length > 0 && <History rows={review.history} />}
    </div>
  );
}

function FlagChip({ actionId, due }: { actionId: number | null; due: string }) {
  return (
    <Link href="/action-registry" title={actionId ? `Action #${actionId}` : undefined}
      className="rounded-full bg-[#F5CE8E] px-2 py-0.5 text-[10.5px] font-bold text-[#E65100] hover:bg-[#EFC179]">
      🚩 Needs follow-up{due ? ` · due ${due}` : ""}
    </Link>
  );
}

/** 1–5 stars — read-only when no onChange; clicking the current value again clears it. */
function Stars({ value, onChange }: { value: number | null; onChange?: (v: number | null) => void }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={value ? `${value} of ${REVIEW_RATING_MAX}` : "Not rated"}>
      {Array.from({ length: REVIEW_RATING_MAX }, (_, i) => i + 1).map((n) => {
        const on = value != null && n <= value;
        const star = <span className={`text-[18px] leading-none ${on ? "text-[#EDA942]" : "text-[#E0E0E0]"}`}>★</span>;
        return onChange
          ? <button key={n} type="button" onClick={() => onChange(value === n ? null : n)} className="px-0.5 hover:scale-110" title={`${n} of ${REVIEW_RATING_MAX}`}>{star}</button>
          : <span key={n}>{star}</span>;
      })}
      {value != null && <span className="ml-1 text-[11.5px] font-semibold text-[#757575]">{value}/{REVIEW_RATING_MAX}</span>}
    </span>
  );
}

function History({ rows }: { rows: NonNullable<VisitReviewState["history"]> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4 border-t border-black/[0.06] pt-3">
      <button type="button" onClick={() => setOpen((o) => !o)} className="text-[12px] font-semibold text-[#616161] hover:text-[#7DA02E]">
        {open ? "▾" : "▸"} Review history ({rows.length})
      </button>
      {open && (
        <ol className="mt-2 flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-[10px] bg-white/80 px-3 py-2 ring-1 ring-black/[0.05]">
              <div className="flex flex-wrap items-baseline gap-x-2 text-[12px]">
                <span className="font-bold text-[#1A1C1A]">{r.label}</span>
                <span className="text-[#757575]">{r.actor}</span>
                <span className="ml-auto text-[11px] text-[#9E9E9E]">{r.when}</span>
              </div>
              {(r.action === "REVIEWED" || r.action === "EDITED") && (
                <div className="mt-1 text-[12px] text-[#424242]">
                  {r.rating != null && <span className="mr-2 font-semibold text-[#EDA942]">{"★".repeat(r.rating)}<span className="text-[#E0E0E0]">{"★".repeat(REVIEW_RATING_MAX - r.rating)}</span></span>}
                  {r.note ? <span className="whitespace-pre-wrap">{r.note}</span> : <span className="italic text-[#9E9E9E]">No comment</span>}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
