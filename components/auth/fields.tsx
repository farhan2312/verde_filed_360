export const inputClass =
  "w-full rounded-lg border border-line bg-surface-100 px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors placeholder:text-ink-400 focus:border-brand-400 focus:bg-white";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.4px] text-ink-600">
        {label}
        {hint && <span className="ml-1 font-normal normal-case text-ink-400">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function EyeToggle({
  shown,
  onToggle,
}: {
  shown: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={shown ? "Hide password" : "Show password"}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink-600"
    >
      {shown ? (
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z" />
          <circle cx="10" cy="10" r="2.5" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 10s3-6 8-6 8 6 8 6M3 3l14 14M8 8a2.5 2.5 0 003.5 3.5" />
        </svg>
      )}
    </button>
  );
}
