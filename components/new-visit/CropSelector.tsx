"use client";

import { OtherReveal } from "./OtherReveal";

/**
 * Clubbed Main + Other crop picker (R3).
 *
 * Single source of truth: `main` (the one main crop) + `others` (the rest).
 * Invariant: `main` is never also in `others`; if anything is selected, exactly
 * one crop is main. Tap a crop to add it; the first pick auto-becomes main. Tap
 * ★ on any selected crop to promote it to main (the old main is demoted to an
 * other). Deselecting the main promotes the first other. Every transition emits
 * one atomic onChange({ main, others }) so the parent does a single setState.
 */
export function CropSelector({
  options,
  main,
  others,
  onChange,
  otherText,
  onOtherText,
}: {
  options: string[];
  main: string;
  others: string[];
  onChange: (next: { main: string; others: string[] }) => void;
  otherText: string;
  onOtherText: (v: string) => void;
}) {
  // Defensive: never trust `others` to already exclude the main crop or hold
  // duplicates (an external autofill could inject an overlap). Everything below
  // works off this de-duped list, so the invariant holds even for odd input.
  const cleanOthers = others.filter((c, i) => c && c !== main && others.indexOf(c) === i);

  const isMain = (c: string) => c === main;
  const isOther = (c: string) => cleanOthers.includes(c);
  const isSel = (c: string) => isMain(c) || isOther(c);

  // Keep any selected label that isn't in the option list visible/removable
  // (e.g. a main crop autofilled from an existing farmer record).
  const extra = [main, ...cleanOthers].filter((c) => c && !options.includes(c));
  const list = [...options, ...extra];

  const add = (c: string) =>
    main
      ? onChange({ main, others: [...cleanOthers, c] })
      : onChange({ main: c, others: cleanOthers });

  const remove = (c: string) =>
    c === main
      ? onChange({ main: cleanOthers[0] ?? "", others: cleanOthers.slice(1) })
      : onChange({ main, others: cleanOthers.filter((x) => x !== c) });

  const makeMain = (c: string) =>
    onChange({
      main: c,
      others: [...cleanOthers.filter((x) => x !== c), main].filter(Boolean),
    });

  return (
    <div>
      <div className="mb-2 text-[11px] text-[#9E9E9E]">
        Tap a crop to add it. Tap{" "}
        <span className="font-semibold text-[#678722]">★</span> to mark the{" "}
        <span className="font-semibold text-[#616161]">main</span> crop.
      </div>

      <div className="flex flex-wrap gap-2">
        {list.map((c) => {
          const sel = isSel(c);
          const m = isMain(c);
          return (
            <div
              key={c}
              className="flex items-center gap-1.5 rounded-[20px] border-[1.5px] px-3.5 py-[7px] text-[12px] font-medium transition-colors"
              style={{
                background: sel ? "#F3F8E6" : "#FFFFFF",
                color: sel ? "#678722" : "#616161",
                borderColor: sel ? "#678722" : "#E0E0E0",
                boxShadow: m ? "0 0 0 1px #678722 inset" : undefined,
              }}
            >
              {sel && (
                <button
                  type="button"
                  aria-label={m ? `${c} is the main crop` : `Set ${c} as main crop`}
                  aria-pressed={m}
                  onClick={() => !m && makeMain(c)}
                  className="leading-none"
                  style={{ color: m ? "#678722" : "#BDBDBD", cursor: m ? "default" : "pointer" }}
                >
                  {m ? "★" : "☆"}
                </button>
              )}
              <button
                type="button"
                onClick={() => (sel ? remove(c) : add(c))}
                className="leading-none"
              >
                {c}
              </button>
              {sel && (
                <button
                  type="button"
                  aria-label={`Remove ${c}`}
                  onClick={() => remove(c)}
                  className="leading-none text-[#9E9E9E] hover:text-[#616161]"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>

      {main && (
        <div className="mt-2 text-[11px] text-[#678722]">
          Main: <b className="font-bold">{main}</b>
          {cleanOthers.length
            ? ` · +${cleanOthers.length} other${cleanOthers.length > 1 ? "s" : ""}`
            : ""}
        </div>
      )}

      <OtherReveal
        show={main === "Other" || cleanOthers.includes("Other")}
        value={otherText}
        onChange={onOtherText}
        placeholder="Specify other crop"
      />
    </div>
  );
}
