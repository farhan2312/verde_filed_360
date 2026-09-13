import type { StoreTagMeta } from "./types";

/** A tiny colored pill per tag — used in the store list and the tagging board. */
export function StoreTagPills({ tagIds, tagMap, size = "sm", max }: {
  tagIds: number[];
  tagMap: Map<number, StoreTagMeta>;
  size?: "sm" | "md";
  max?: number;
}) {
  const tags = tagIds.map((id) => tagMap.get(id)).filter((t): t is StoreTagMeta => !!t);
  if (tags.length === 0) return null;
  const shown = max ? tags.slice(0, max) : tags;
  const rest = tags.length - shown.length;
  const pad = size === "md" ? "px-2 py-0.5 text-[10.5px]" : "px-1.5 py-[1px] text-[9.5px]";
  return (
    <span className="flex flex-wrap items-center gap-1">
      {shown.map((t) => (
        <span key={t.id} title={t.name}
          className={`inline-flex items-center rounded-full font-bold leading-none ${pad}`}
          style={{ background: `${t.color}1A`, color: t.color, boxShadow: `inset 0 0 0 1px ${t.color}55` }}>
          {t.name}
        </span>
      ))}
      {rest > 0 && (
        <span className={`inline-flex items-center rounded-full bg-[#EEE] font-bold leading-none text-[#757575] ${pad}`}>+{rest}</span>
      )}
    </span>
  );
}
