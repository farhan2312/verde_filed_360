/** Screen-specific inline SVGs for Farmer Clusters (verbatim from the original design). */

type P = { className?: string; size?: number };

/** Three connected circles — cluster motif (empty-state, 28×28 default). */
export function ClusterGlyph({ className, size = 28 }: P) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      stroke="#7DA02E"
      strokeWidth="2"
      strokeLinecap="round"
      className={className}
    >
      <circle cx="8" cy="14" r="5" />
      <circle cx="20" cy="8" r="5" />
      <circle cx="20" cy="20" r="5" />
      <line x1="12.5" y1="12.5" x2="15.5" y2="9.5" />
      <line x1="12.5" y1="15.5" x2="15.5" y2="18.5" />
    </svg>
  );
}

/** Small white plus for the primary button (13×13). */
export function PlusGlyph({ size = 13 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
      <path d="M6.5 1v11M1 6.5h11" />
    </svg>
  );
}

/** Filled circle-i info glyph (11×11, green). */
export function InfoGlyph({ size = 11 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 11 11" fill="#7DA02E">
      <path d="M5.5 1a4.5 4.5 0 100 9 4.5 4.5 0 000-9zm.5 6.5h-1V5h1v2.5zm0-3.5h-1V3h1v1z" />
    </svg>
  );
}

/** Single-person outline glyph for the count bar (14×14, green stroke). */
export function PersonGlyph({ size = 14 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="#7DA02E" strokeWidth="1.8">
      <circle cx="7" cy="4.5" r="2.5" />
      <path d="M1 12.5c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
    </svg>
  );
}
