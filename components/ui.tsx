import { cn } from "@/lib/cn";
import { initials as toInitials } from "@/lib/format";

/* ── Card ── */
export function Card({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[14px] bg-white border border-black/[0.04] shadow-card",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function SectionCard({
  title,
  subtitle,
  action,
  className,
  bodyClassName,
  children,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={className}>
      {(title || action) && (
        <div className="flex items-center justify-between px-5 pt-[18px] pb-3">
          <div>
            {title && <div className="text-[15px] font-bold text-ink">{title}</div>}
            {subtitle && (
              <div className="mt-0.5 text-[11.5px] text-ink-muted">{subtitle}</div>
            )}
          </div>
          {action}
        </div>
      )}
      <div className={cn("px-5 pb-5", !title && "pt-5", bodyClassName)}>{children}</div>
    </Card>
  );
}

/* ── Badge (colored chip) ── */
export function Badge({
  bg,
  color,
  border,
  className,
  children,
}: {
  bg?: string;
  color?: string;
  border?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[20px] px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap",
        className,
      )}
      style={{ background: bg, color, border: border ? `1px solid ${border}` : undefined }}
    >
      {children}
    </span>
  );
}

/* ── Pill (filter / toggle pill) ── */
export function Pill({
  active,
  className,
  children,
  ...rest
}: { active?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "rounded-[20px] px-3.5 py-1.5 text-[12px] font-semibold transition-colors",
        active
          ? "bg-brand-900 text-white"
          : "bg-white text-ink-600 border border-line hover:bg-surface-150",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ── Avatar ── */
export function Avatar({
  name,
  initials,
  background,
  size = 36,
  className,
}: {
  name?: string;
  initials?: string;
  background?: string;
  size?: number;
  className?: string;
}) {
  const text = initials ?? (name ? toInitials(name) : "?");
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full font-bold text-white shrink-0",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        background: background ?? "#678722",
      }}
    >
      {text}
    </div>
  );
}

/* ── Progress bar ── */
export function ProgressBar({
  pct,
  color = "#678722",
  track = "#EEEEEE",
  height = 8,
  className,
}: {
  pct: number;
  color?: string;
  track?: string;
  height?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("w-full overflow-hidden rounded-full", className)}
      style={{ height, background: track }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }}
      />
    </div>
  );
}

/* ── KPI / stat tile ── */
export function StatTile({
  title,
  value,
  change,
  sub,
  accent = "#678722",
  bg = "#F3F8E6",
}: {
  title: string;
  value: React.ReactNode;
  change?: string;
  sub?: string;
  accent?: string;
  bg?: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div className="text-[12px] font-semibold text-ink-600">{title}</div>
        {change && (
          <span className="text-[11px] font-semibold" style={{ color: accent }}>
            {change}
          </span>
        )}
      </div>
      <div
        className="mt-2 text-[30px] font-bold leading-none animate-countUp"
        style={{ color: accent }}
      >
        {value}
      </div>
      {sub && <div className="mt-2 text-[11px] text-ink-muted">{sub}</div>}
      <div className="mt-3 h-1 w-full rounded-full" style={{ background: bg }} />
    </Card>
  );
}

/* ── Stepper (wizard) ── */
export function Stepper({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  return (
    <div className="flex items-center">
      {steps.map((label, i) => {
        const state = i < current ? "past" : i === current ? "current" : "future";
        const circleBg = state === "future" ? "#E0E0E0" : state === "current" ? "#678722" : "#B3D170";
        const textColor = state === "future" ? "#BDBDBD" : state === "current" ? "#678722" : "#8CB337";
        return (
          <div key={label} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold text-white"
                style={{ background: circleBg }}
              >
                {i + 1}
              </div>
              <div className="text-[10.5px] font-semibold" style={{ color: textColor }}>
                {label}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div
                className="mx-2 h-0.5 flex-1 rounded"
                style={{ background: i < current ? "#B3D170" : "#E8E8E8" }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Empty state ── */
export function EmptyState({
  title,
  hint,
  className,
}: {
  title: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-16 text-center", className)}>
      <div className="text-[14px] font-semibold text-ink-600">{title}</div>
      {hint && <div className="mt-1 text-[12px] text-ink-muted">{hint}</div>}
    </div>
  );
}

/* ── Online · Synced badge (header) ── */
export function SyncBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[20px] bg-brand-50 px-3.5 py-1.5 text-[11px] font-semibold text-brand-600">
      <span className="h-[7px] w-[7px] rounded-full bg-brand-600" />
      Online · Synced
    </span>
  );
}
