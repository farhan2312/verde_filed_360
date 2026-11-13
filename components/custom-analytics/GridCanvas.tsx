"use client";

import { useRef, useState } from "react";
import { GRID_COLS, ROW_PX, type Layout, type Visual, type PageFilters, type CrossFilter } from "@/lib/custom-analytics/types";
import { VisualCard } from "./VisualCard";
import { useWidth } from "./charts";

const GAP = 12;

const overlaps = (a: Layout, b: Layout) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Put `moved` at its new spot, push anything it overlaps downward (cascading), then float everything up. */
export function placeLayout(items: { id: string; layout: Layout }[], movedId: string, next: Layout): Record<string, Layout> {
  const L: Record<string, Layout> = Object.fromEntries(items.map((i) => [i.id, { ...i.layout }]));
  L[movedId] = { ...next };
  const order = [movedId, ...items.map((i) => i.id).filter((id) => id !== movedId)];
  // Push down until nothing overlaps the items placed before it.
  for (let pass = 0; pass < 50; pass++) {
    let changed = false;
    for (let i = 0; i < order.length; i++) for (let j = 0; j < order.length; j++) {
      if (i === j) continue;
      const a = L[order[i]], b = L[order[j]];
      if (order[j] === movedId) continue;
      if (overlaps(a, b) && (order[i] === movedId || a.y <= b.y)) { b.y = a.y + a.h; changed = true; }
    }
    if (!changed) break;
  }
  // Gravity: float every item up as far as it can go (keeps the page tidy).
  const ids = Object.keys(L).sort((a, b) => L[a].y - L[b].y || L[a].x - L[b].x);
  for (const id of ids) {
    while (L[id].y > 0) {
      const up = { ...L[id], y: L[id].y - 1 };
      if (ids.some((o) => o !== id && overlaps(up, L[o]))) break;
      L[id].y = up.y;
    }
  }
  return L;
}

/** Next free row at the bottom of the page. */
export const bottomRow = (visuals: Visual[]) => visuals.reduce((m, v) => Math.max(m, v.layout.y + v.layout.h), 0);

export function GridCanvas({ visuals, filters, cf, onCrossFilter, editing, selectedId, onSelect, onLayout, onRemove }: {
  visuals: Visual[]; filters: PageFilters; cf: CrossFilter | null; onCrossFilter: (cf: CrossFilter | null) => void;
  editing?: boolean; selectedId?: string | null; onSelect?: (id: string | null) => void;
  onLayout?: (layouts: Record<string, Layout>) => void; onRemove?: (id: string) => void;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [drag, setDrag] = useState<{ id: string; mode: "move" | "resize"; preview: Layout } | null>(null);
  const start = useRef<{ x: number; y: number; layout: Layout } | null>(null);
  const colW = width ? (width + GAP) / GRID_COLS : 0;
  const stacked = width > 0 && width < 640; // phones: one column, in reading order

  const begin = (e: React.PointerEvent, v: Visual, mode: "move" | "resize") => {
    if (!editing || stacked) return;
    e.preventDefault(); e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY, layout: { ...v.layout } };
    setDrag({ id: v.id, mode, preview: { ...v.layout } });
    onSelect?.(v.id);
  };
  const move = (e: React.PointerEvent) => {
    if (!drag || !start.current || !colW) return;
    const s = start.current;
    const dx = Math.round((e.clientX - s.x) / colW), dy = Math.round((e.clientY - s.y) / ROW_PX);
    const p = drag.mode === "move"
      ? { ...s.layout, x: Math.max(0, Math.min(GRID_COLS - s.layout.w, s.layout.x + dx)), y: Math.max(0, s.layout.y + dy) }
      : { ...s.layout, w: Math.max(2, Math.min(GRID_COLS - s.layout.x, s.layout.w + dx)), h: Math.max(2, Math.min(30, s.layout.h + dy)) };
    if (p.x !== drag.preview.x || p.y !== drag.preview.y || p.w !== drag.preview.w || p.h !== drag.preview.h) setDrag({ ...drag, preview: p });
  };
  const end = () => {
    if (drag && onLayout) onLayout(placeLayout(visuals, drag.id, drag.preview));
    setDrag(null); start.current = null;
  };

  const ordered = stacked ? [...visuals].sort((a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x) : visuals;
  const live = drag ? placeLayout(visuals, drag.id, drag.preview) : null;
  const heightRows = Math.max(bottomRow(visuals), live ? Math.max(...Object.values(live).map((l) => l.y + l.h)) : 0) + (editing ? 6 : 1);

  return (
    <div ref={ref} className="relative w-full" onPointerMove={move} onPointerUp={end} onPointerCancel={end}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onSelect?.(null); }}
      style={stacked ? undefined : { height: heightRows * ROW_PX, backgroundImage: editing ? `radial-gradient(circle, #dcdcd6 1px, transparent 1px)` : undefined, backgroundSize: editing && colW ? `${colW}px ${ROW_PX}px` : undefined }}>
      {width > 0 && (stacked ? (
        <div className="flex flex-col gap-3">
          {ordered.map((v) => (
            <div key={v.id} data-vid={v.id} style={{ height: Math.max(v.type === "kpi" ? 110 : 260, v.layout.h * ROW_PX - GAP) }}>
              <VisualCard visual={v} filters={filters} cf={cf} onCrossFilter={onCrossFilter} height={Math.max(v.type === "kpi" ? 110 : 260, v.layout.h * ROW_PX - GAP)}
                editing={editing} selected={selectedId === v.id} onSelect={() => onSelect?.(v.id)} onRemove={onRemove ? () => onRemove(v.id) : undefined} />
            </div>
          ))}
        </div>
      ) : ordered.map((v) => {
        const l = (live && live[v.id]) || v.layout;
        const isDragging = drag?.id === v.id;
        const h = l.h * ROW_PX - GAP;
        return (
          <div key={v.id} data-vid={v.id} className="absolute" style={{
            left: l.x * colW, top: l.y * ROW_PX, width: l.w * colW - GAP, height: h,
            transition: isDragging ? "none" : "left 120ms, top 120ms, width 120ms, height 120ms", zIndex: isDragging ? 20 : selectedId === v.id ? 10 : 1, opacity: isDragging ? 0.92 : 1,
          }}>
            <VisualCard visual={v} filters={filters} cf={cf} onCrossFilter={onCrossFilter} height={h}
              editing={editing} selected={selectedId === v.id} onSelect={() => onSelect?.(v.id)} onRemove={onRemove ? () => onRemove(v.id) : undefined}
              dragHandle={editing ? (
                <span onPointerDown={(e) => begin(e, v, "move")} title="Drag to move" className="shrink-0 cursor-grab select-none rounded px-0.5 text-[13px] leading-none text-[#BDBDBD] hover:text-[#616161] active:cursor-grabbing">⠿</span>
              ) : undefined} />
            {editing && (
              <span onPointerDown={(e) => begin(e, v, "resize")} title="Drag to resize"
                className="absolute bottom-0.5 right-0.5 z-10 h-4 w-4 cursor-se-resize rounded-br-[10px]"
                style={{ background: "linear-gradient(135deg, transparent 50%, #9E9E9E 50%, #9E9E9E 58%, transparent 58%, transparent 70%, #9E9E9E 70%, #9E9E9E 78%, transparent 78%)" }} />
            )}
          </div>
        );
      }))}
    </div>
  );
}
