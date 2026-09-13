import { cn } from "@/lib/cn";

/**
 * Standard analytics card: white, rounded-[14px], soft shadow, hairline border.
 * Matches the original design's card style (lines 467, 488, 511, 527, 549, 566).
 */
export function AnalyticsCard({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[14px] bg-white p-[22px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03]",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-[15px] font-bold text-[#1A1C1A] mb-4">{children}</div>;
}
