"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { Modal } from "@/components/interactive";

export type ConfirmOpts = {
  title: string;
  message?: ReactNode;
  confirmLabel?: string; // default "Delete"
  /** If set, the user must type this exact word/name to enable the confirm button (extra-strict). */
  confirmWord?: string;
};

/**
 * Strict confirmation dialog for destructive actions. Returns `confirm()` (a promise that resolves
 * true/false) and `dialog` (render it once in the component). Red, deliberate two-step; pass
 * `confirmWord` to require the user to type a name before the button unlocks. Example:
 *   const { confirm, dialog } = useConfirm();
 *   onClick={async () => { if (await confirm({ title: "Delete X?" })) doDelete(); }}
 *   ... return (<>{dialog}{rest}</>)
 */
export function useConfirm() {
  const [opts, setOpts] = useState<ConfirmOpts | null>(null);
  const [typed, setTyped] = useState("");
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((o: ConfirmOpts) => {
    setTyped("");
    setOpts(o);
    return new Promise<boolean>((res) => { resolver.current = res; });
  }, []);

  const close = (v: boolean) => { resolver.current?.(v); resolver.current = null; setOpts(null); };

  const need = opts?.confirmWord?.trim();
  const canConfirm = !need || typed.trim().toLowerCase() === need.toLowerCase();

  const dialog = (
    <Modal open={!!opts} onClose={() => close(false)} className="max-w-[440px]">
      {opts && (
        <div className="px-5 py-5">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#FDECEA] text-[20px]">⚠️</div>
            <div className="min-w-0">
              <div className="text-[15.5px] font-bold text-[#1A1C1A]">{opts.title}</div>
              {opts.message && <div className="mt-1 text-[13px] leading-relaxed text-[#616161]">{opts.message}</div>}
            </div>
          </div>
          {need && (
            <div className="mt-3.5">
              <label className="text-[11px] font-semibold text-[#9E9E9E]">Type <span className="font-mono font-bold text-[#C62828]">{need}</span> to confirm</label>
              <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && canConfirm) close(true); }}
                className="mt-1 w-full rounded-[10px] border border-[#E0E0E0] px-3 py-2 text-[13px] outline-none focus:border-[#C62828]" />
            </div>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => close(false)}
              className="rounded-[10px] border border-[#E0E0E0] px-4 py-2 text-[13px] font-semibold text-[#616161] hover:bg-[#F5F5F5]">Cancel</button>
            <button type="button" onClick={() => close(true)} disabled={!canConfirm}
              className="rounded-[10px] bg-[#C62828] px-5 py-2 text-[13px] font-bold text-white hover:bg-[#B71C1C] disabled:cursor-not-allowed disabled:opacity-50">
              {opts.confirmLabel ?? "Delete"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );

  return { confirm, dialog };
}
