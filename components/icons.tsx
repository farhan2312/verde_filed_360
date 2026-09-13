import type { NavId } from "@/lib/nav";

type P = { className?: string };
const base = "shrink-0";

/* ── Nav icons (exact SVG paths from the original design) ── */

export const NavIcons: Record<NavId, (p: P) => JSX.Element> = {
  dashboard: ({ className }) => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" className={className}>
      <rect x="1" y="1" width="7" height="7" rx="2" /><rect x="10" y="1" width="7" height="7" rx="2" />
      <rect x="1" y="10" width="7" height="7" rx="2" /><rect x="10" y="10" width="7" height="7" rx="2" />
    </svg>
  ),
  newVisit: ({ className }) => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className}>
      <circle cx="9" cy="9" r="7" /><path d="M9 5.5v7M5.5 9h7" />
    </svg>
  ),
  visitRepo: ({ className }) => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" className={className}>
      <rect x="2" y="2" width="14" height="3" rx="1" /><rect x="2" y="7" width="14" height="3" rx="1" opacity="0.7" />
      <rect x="2" y="12" width="10" height="3" rx="1" opacity="0.5" />
    </svg>
  ),
  actionRegistry: ({ className }) => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="2.5" width="12" height="13" rx="2" /><path d="M6.2 6.2h5.6M6.2 9h5.6M6.2 11.8h3.4" />
      <path d="M12.8 12.2l1.2 1.2 2.2-2.4" />
    </svg>
  ),
  farmers: ({ className }) => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" className={className}>
      <circle cx="9" cy="5" r="3.5" /><path d="M2 16.5c0-3.87 3.13-7 7-7s7 3.13 7 7" />
    </svg>
  ),
  mapView: ({ className }) => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" className={className}>
      <path d="M11 2l-5.5 2L1 2v13l4.5 2L11 15l6 2V4l-6-2zM6.5 14.5L3 13V4.5l3.5 1.2v8.8zm5 0V5.7l3 1v8L11.5 14.5z" />
    </svg>
  ),
  farmerCluster: ({ className }) => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" className={className}>
      <circle cx="5" cy="9" r="3" /><circle cx="13" cy="5" r="3" /><circle cx="13" cy="13" r="3" />
      <line x1="7.5" y1="8" x2="10.5" y2="6" stroke="currentColor" strokeWidth="1.5" />
      <line x1="7.5" y1="10" x2="10.5" y2="12" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  analytics: ({ className }) => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" className={className}>
      <rect x="1" y="10" width="3" height="7" rx="1" /><rect x="5.5" y="6" width="3" height="11" rx="1" />
      <rect x="10" y="2" width="3" height="15" rx="1" /><rect x="14.5" y="8" width="3" height="9" rx="1" />
    </svg>
  ),
  actions: ({ className }) => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" className={className}>
      <rect x="1" y="2" width="11" height="2" rx="1" /><rect x="1" y="6" width="8" height="2" rx="1" />
      <rect x="1" y="10" width="10" height="2" rx="1" /><rect x="1" y="14" width="6" height="2" rx="1" />
      <rect x="14" y="1" width="3" height="3" rx="1.5" /><rect x="14" y="7" width="3" height="3" rx="1.5" /><rect x="14" y="13" width="3" height="3" rx="1.5" />
    </svg>
  ),
  users: ({ className }) => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" className={className}>
      <circle cx="7" cy="5" r="3" /><path d="M1 15c0-3.31 2.69-6 6-6s6 2.69 6 6" />
      <circle cx="14" cy="6" r="2" /><path d="M13 15c0-2.5 1-4.2 2.5-5" />
    </svg>
  ),
  whatsappInbox: ({ className }) => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2 9a7 7 0 1 1 3.5 6.06L2 16l1-3.4A6.97 6.97 0 0 1 2 9z" />
    </svg>
  ),
  campaigns: ({ className }) => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 7v4l9 4V3L3 7zM3 11H2a1 1 0 01-1-1V8a1 1 0 011-1h1M6 12v2.5a1 1 0 001 1h1a1 1 0 001-1V13" />
    </svg>
  ),
  projects: ({ className }) => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2 5.5a1.5 1.5 0 011.5-1.5h3l1.5 2h5.5A1.5 1.5 0 0116 7.5v5A1.5 1.5 0 0114.5 14h-11A1.5 1.5 0 012 12.5v-7z" />
    </svg>
  ),
  ghoshti: ({ className }) => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="9" cy="5" r="2.2" /><path d="M5.3 15c0-2.4 1.65-4 3.7-4s3.7 1.6 3.7 4" />
      <circle cx="3" cy="7" r="1.6" /><path d="M1 13.5c0-1.7 0.9-2.9 2.2-3.2" />
      <circle cx="15" cy="7" r="1.6" /><path d="M17 13.5c0-1.7-0.9-2.9-2.2-3.2" />
    </svg>
  ),
  products: ({ className }) => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9 1.5l6.5 3.5v7L9 16.5 2.5 12V5L9 1.5zM2.7 5.2L9 8.7l6.3-3.5M9 8.7V16" />
    </svg>
  ),
  movement: ({ className }) => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2 15V8M6.5 15V4M11 15v-5M15.5 15V6" />
    </svg>
  ),
  salesImport: ({ className }) => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 12v3a1 1 0 001 1h10a1 1 0 001-1v-3" />
      <path d="M9 12V2.5M5.5 6L9 2.5 12.5 6" />
    </svg>
  ),
  settings: ({ className }) => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" className={className}>
      <path d="M9 11.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
      <path d="M16 9.94l-1.34-.77a5.63 5.63 0 000-1.34L16 7.06l-1-1.73-1.5.5a5.5 5.5 0 00-1.16-.67L12 3.5H10l-.34 1.66a5.5 5.5 0 00-1.16.67l-1.5-.5-1 1.73 1.34.77a5.63 5.63 0 000 1.34L6 9.94l1 1.73 1.5-.5c.35.28.74.5 1.16.67L10 13.5h2l.34-1.66c.42-.17.81-.39 1.16-.67l1.5.5 1-1.73z" />
    </svg>
  ),
  audit: ({ className }) => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" className={className}>
      <rect x="3" y="1" width="12" height="16" rx="2" /><rect x="5.5" y="4" width="7" height="1.5" rx="0.5" />
      <rect x="5.5" y="7" width="5" height="1.5" rx="0.5" /><rect x="5.5" y="10" width="7" height="1.5" rx="0.5" /><rect x="5.5" y="13" width="4" height="1.5" rx="0.5" />
    </svg>
  ),
  bugs: ({ className }) => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <ellipse cx="9" cy="10" rx="3.5" ry="4.5" /><path d="M9 5.5V4a2 2 0 10-4 0M9 5.5V4a2 2 0 114 0" />
      <path d="M5.5 8.5H2M12.5 8.5H16M5.5 11.5H2.5M12.5 11.5H15.5M5.7 6L3.5 4.5M12.3 6l2.2-1.5" />
    </svg>
  ),
};

/* ── Misc icons ── */

export const CaretUpDown = ({ className }: P) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" className={`${base} ${className ?? ""}`}>
    <path d="M7 3l4 4H3zM7 11l4-4H3z" />
  </svg>
);

export const ShieldIcon = ({ className }: P) => (
  <svg width="13" height="13" viewBox="0 0 18 18" fill="currentColor" className={`${base} ${className ?? ""}`}>
    <path d="M9 1l6 2.5v4.5c0 4-2.7 7.5-6 8.5-3.3-1-6-4.5-6-8.5V3.5L9 1z" />
  </svg>
);

export const PlusIcon = ({ className }: P) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className={`${base} ${className ?? ""}`}>
    <path d="M7 2v10M2 7h10" />
  </svg>
);

export const SearchIcon = ({ className }: P) => (
  <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className={`${base} ${className ?? ""}`}>
    <circle cx="8" cy="8" r="5.5" /><path d="M12.5 12.5L16 16" />
  </svg>
);

export const ChevronRight = ({ className }: P) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`${base} ${className ?? ""}`}>
    <path d="M5 3l4 4-4 4" />
  </svg>
);

export const ChevronLeft = ({ className }: P) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`${base} ${className ?? ""}`}>
    <path d="M9 3L5 7l4 4" />
  </svg>
);

export const CloseIcon = ({ className }: P) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={`${base} ${className ?? ""}`}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
);

export const CheckIcon = ({ className }: P) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={`${base} ${className ?? ""}`}>
    <path d="M2.5 7.5l3 3 6-7" />
  </svg>
);
