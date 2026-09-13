import { avatarColor } from "@/lib/format";
import { EmptyState } from "@/components/ui";

/** Initials of every word in a name (e.g. "Ramesh Kumar" → "RK"). */
function fullInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

export function AssignedFarmersCard({ farmers }: { farmers: string[] }) {
  return (
    <div className="rounded-[14px] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03]">
      <div className="mb-3.5 text-[14px] font-bold text-[#1A1C1A]">
        Assigned Farmers
      </div>

      {farmers.length === 0 ? (
        <EmptyState title="No farmers assigned yet" className="py-8" />
      ) : (
        farmers.map((name, i) => (
          <div
            key={`${name}-${i}`}
            className="flex items-center gap-2.5 border-b border-[#F5F5F5] py-2.5"
          >
            <div
              className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-[11px] font-bold text-white"
              style={{ background: avatarColor(i) }}
            >
              {fullInitials(name)}
            </div>
            <div className="text-[13px] font-semibold text-[#1A1C1A]">{name}</div>
          </div>
        ))
      )}
    </div>
  );
}
