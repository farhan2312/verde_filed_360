import type { OverallData, Tile, PersonRow } from "@/app/actions/overall-analytics";

/**
 * Pure presentation for the Overall dashboard — no hooks, so it can be server-rendered offline for
 * review. Colours come from the Tailwind design tokens (brand/ink/danger/orange/info/surface/line);
 * SVG uses Tailwind fill- and stroke- token utilities, never hardcoded hex. Light-only (no dark mode).
 */

const n = (x: number) => x.toLocaleString("en-IN");
// small averages need more decimals so "0.08" never prints as "0.0"
const favg = (x: number) => (x >= 100 ? n(Math.round(x)) : x >= 10 ? x.toFixed(1) : x.toFixed(2));
const fmed = (x: number) => (Number.isInteger(x) ? n(x) : x.toFixed(1));

type Tone = Tile["tone"];
const TONE_V: Record<Tone, string> = { good: "text-brand-700", bad: "text-danger", warn: "text-orange", neutral: "text-ink" };

function TileCard({ t, onTile }: { t: Tile; onTile?: (k: string) => void }) {
  return (
    <button type="button" onClick={onTile ? () => onTile(t.key) : undefined}
      className="ov-tile group w-full rounded-[14px] border border-line bg-white p-4 text-left shadow-card transition-colors hover:border-brand-200 hover:bg-brand-50/30">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.5px] text-ink-muted">{t.label}</div>
      <div className={`mt-1 text-[26px] font-bold leading-none tabular-nums ${TONE_V[t.tone]}`}>{n(t.value)}</div>
      {t.sub && <div className="mt-1 text-[11px] text-ink-muted">{t.sub}</div>}
      {t.naNote && <div className="mt-1 text-[10.5px] font-medium text-orange">{t.naNote}</div>}
      <div className="mt-1.5 text-[10px] font-semibold text-brand-600 opacity-0 transition-opacity group-hover:opacity-100">View list →</div>
    </button>
  );
}

function Section({ title, caption, right, children }: { title: string; caption?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <div className="mb-2.5 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-[14.5px] font-bold text-ink">{title}</h3>
          {caption && <p className="mt-0.5 max-w-[74ch] text-[11.5px] leading-[1.5] text-ink-muted">{caption}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function OverallView({ data, onTile }: { data: OverallData; onTile?: (k: string) => void }) {
  const { byDay, heatmap, heatmapMax } = data;
  const dayMax = Math.max(1, ...byDay.map((d) => d.total));

  // Day chart geometry
  const bw = 15, bgap = 4, chH = 150, chTop = 8;
  const chW = Math.max(byDay.length * (bw + bgap), 200);

  // Heatmap geometry
  const cw = 26, ch = 20, leftLbl = 34, topLbl = 16;

  const areaMax = Math.max(1, ...data.areas.map((a) => a.events));
  const AREA_FILL = ["fill-brand-500", "fill-info-600", "fill-purple"];
  const anyScored = data.people.some((p) => p.writeEvents > 0);

  return (
    <div>
      {/* 1 · Adoption */}
      <Section title="Adoption" caption="Real accounts against activity in the selected window. “Records touched” is counted as write-events (creates + edits) in the audit trail. Every tile opens the list behind it.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {data.adoption.map((t) => <TileCard key={t.key} t={t} onTile={onTile} />)}
        </div>
      </Section>

      {/* 2 · Day by day */}
      <Section title="Activity, day by day"
        caption="Write-events per day (■ creates, ■ edits). There is no time / session instrumentation in this system, so effort — hours spent — cannot be plotted beside output. This is volume of records written, not effort.">
        <div className="rounded-[14px] border border-line bg-white p-4 shadow-card">
          <div className="mb-2 flex items-center gap-4 text-[11px] text-ink-600">
            <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-brand-500" />Created</span>
            <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-info-600" />Edited</span>
            <span className="ml-auto tabular-nums text-ink-muted">peak {n(dayMax)}/day</span>
          </div>
          {byDay.length === 0 ? (
            <div className="py-10 text-center text-[12.5px] text-ink-muted">No activity in this window.</div>
          ) : (
            <div className="overflow-x-auto">
              <svg width={chW} height={chH + chTop + 22} className="block">
                {byDay.map((d, i) => {
                  const x = i * (bw + bgap);
                  const hC = (d.created / dayMax) * chH;
                  const hU = (d.updated / dayMax) * chH;
                  const label = i % 7 === 0 || i === byDay.length - 1;
                  return (
                    <g key={d.date}>
                      <rect x={x} y={chTop + chH - hU - hC} width={bw} height={hC} className="fill-brand-500" rx={1.5}><title>{`${d.date}: ${d.created} created`}</title></rect>
                      <rect x={x} y={chTop + chH - hU} width={bw} height={hU} className="fill-info-600" rx={1.5}><title>{`${d.date}: ${d.updated} edited`}</title></rect>
                      {label && <text x={x + bw / 2} y={chTop + chH + 14} textAnchor="middle" className="fill-ink-muted text-[8.5px]">{d.date.slice(5)}</text>}
                    </g>
                  );
                })}
              </svg>
            </div>
          )}
        </div>
      </Section>

      {/* 3 · When (heatmap) */}
      <Section title="When work happens"
        caption="Write-events by hour of day × weekday, in IST (the users’ timezone). Darker = busier. Device / browser split is unavailable — no user-agent is stored.">
        <div className="rounded-[14px] border border-line bg-white p-4 shadow-card">
          <div className="overflow-x-auto">
            <svg width={leftLbl + 24 * cw} height={topLbl + 7 * ch + 16} className="block">
              {Array.from({ length: 24 }).map((_, h) => (h % 3 === 0 ? <text key={h} x={leftLbl + h * cw + cw / 2} y={topLbl - 5} textAnchor="middle" className="fill-ink-muted text-[8.5px]">{h}</text> : null))}
              {heatmap.map((row, wd) => (
                <g key={wd}>
                  <text x={leftLbl - 6} y={topLbl + wd * ch + ch / 2 + 3} textAnchor="end" className="fill-ink-muted text-[9px]">{WD[wd]}</text>
                  {row.map((v, h) => (
                    <rect key={h} x={leftLbl + h * cw + 1} y={topLbl + wd * ch + 1} width={cw - 2} height={ch - 2} rx={2}
                      className={v > 0 ? "fill-brand-600" : "fill-surface-200"} style={v > 0 ? { opacity: 0.15 + 0.85 * (v / heatmapMax) } : undefined}>
                      <title>{`${WD[wd]} ${h}:00 — ${v} events`}</title>
                    </rect>
                  ))}
                </g>
              ))}
              <text x={leftLbl} y={topLbl + 7 * ch + 12} className="fill-ink-muted text-[9px]">hour of day (IST) →</text>
            </svg>
          </div>
        </div>
      </Section>

      {/* 4 · What the time goes on */}
      <Section title="What the work goes on"
        caption="Areas of work by audit entity (visits, farmer records, campaigns, SMS/WhatsApp sends, mass sends…) and the shape of writing (create / update / delete / send). Both break down the same write-events and each sums to the total.">
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-[14px] border border-line bg-white p-4 shadow-card">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.4px] text-ink-muted">Areas of work</div>
            {data.areas.length === 0 ? <div className="py-6 text-center text-[12px] text-ink-muted">No write-events in this window.</div> : (
              <div className="flex flex-col gap-3">
                {data.areas.map((a, i) => (
                  <div key={a.area}>
                    <div className="mb-1 flex items-baseline justify-between text-[12px]">
                      <span className="font-semibold text-ink">{a.area}</span>
                      <span className="tabular-nums font-bold text-ink">{n(a.events)}</span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-200">
                      <div className={`h-full rounded-full ${AREA_FILL[i % AREA_FILL.length].replace("fill-", "bg-")}`} style={{ width: `${Math.max(2, (a.events / areaMax) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-[14px] border border-line bg-white p-4 shadow-card">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.4px] text-ink-muted">Shape of writing</div>
            {data.shape.length === 0 ? <div className="py-6 text-center text-[12px] text-ink-muted">No write-events in this window.</div> : (
              <div className="flex flex-col gap-1.5">
                {data.shape.map((s) => (
                  <div key={s.key} className="flex items-center justify-between rounded-[8px] px-2.5 py-1.5 odd:bg-surface-50">
                    <span className="text-[12px] font-semibold text-ink">{s.label}</span>
                    <span className="tabular-nums text-[13px] font-bold text-ink">{n(s.value)}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-2 text-[10.5px] leading-[1.4] text-ink-muted">Only verbs the app records appear here. An absent verb (e.g. export) is not instrumented — a different finding from a count of zero.</p>
          </div>
        </div>
      </Section>

      {/* 5 · Who is doing the work */}
      <Section title="Who is doing the work"
        caption="One row per account. Activity (write-events / visits / follow-ups done) sits beside a denominator — open follow-ups assigned to their store. A rank shows only when someone scored; where average and median disagree, one person is carrying the group.">
        <div className="mb-2 flex flex-wrap gap-4 rounded-[12px] border border-line bg-surface-50 px-4 py-2.5 text-[11px]">
          {data.peopleStats.map((s) => (
            <div key={s.metric} className="tabular-nums">
              <span className="font-semibold text-ink-700">{s.metric}:</span>{" "}
              <span className="text-ink-600">avg <b className="text-ink">{favg(s.avg)}</b> · median <b className="text-ink">{fmed(s.median)}</b></span>{" "}
              <span className="text-ink-muted">({s.scored} of {data.people.length} scored)</span>
            </div>
          ))}
        </div>
        <div className="overflow-x-auto rounded-[14px] border border-line bg-white shadow-card">
          <table className="w-full min-w-[860px] text-[12.5px]">
            <thead>
              <tr className="border-b border-line text-left text-[10.5px] font-bold uppercase tracking-[0.4px] text-ink-muted">
                <th className="px-3 py-3">#</th><th className="px-3 py-3">Employee</th><th className="px-3 py-3">Role</th><th className="px-3 py-3">Territory</th>
                <th className="px-3 py-3 text-right">Write-events</th><th className="px-3 py-3 text-right">Visits</th><th className="px-3 py-3 text-right">Follow-ups done</th>
                <th className="px-3 py-3 text-right">Open assigned</th><th className="px-3 py-3">Last sign-in</th>
              </tr>
            </thead>
            <tbody>
              {data.people.length === 0
                ? <tr><td colSpan={9} className="px-3 py-10 text-center text-[13px] text-ink-muted">No accounts match this filter.</td></tr>
                : data.people.map((p, i) => <PersonTr key={p.id} p={p} rank={anyScored && p.writeEvents > 0 ? i + 1 : null} />)}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-[10.5px] text-ink-muted">
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-danger-50 ring-1 ring-danger/30" />never signed in</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-orange-50 ring-1 ring-orange/30" />dormant (idle &gt;30d)</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-surface-150 ring-1 ring-line" />deactivated</span>
        </div>
      </Section>

      {/* 6 · What came out of it */}
      <Section title="What came out of it" caption="Records the app produced in the window. Farmers and sales are bulk-imported reference data and are deliberately excluded. Every tile opens its list.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {data.outputs.map((t) => <TileCard key={t.key} t={t} onTile={onTile} />)}
        </div>
      </Section>

      {/* 7 · Needs attention */}
      <Section title="Needs attention" caption="Current-state problems — NOT limited to the selected window. These are what is not happening that should be.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {data.attention.map((t) => <TileCard key={t.key} t={t} onTile={onTile} />)}
        </div>
      </Section>

      <div className="mt-6 text-[10.5px] text-ink-muted">Window: {data.windowLabel} · generated in {data.generatedMs} ms · figures reconcile: day / heatmap / shape / per-person all sum to {n(data.totalWriteEvents)} write-events.</div>
    </div>
  );
}

function PersonTr({ p, rank }: { p: PersonRow; rank: number | null }) {
  const rowBg = p.neverSignedIn ? "bg-danger-50/50" : p.dormant ? "bg-orange-50/50" : !p.active ? "bg-surface-150/60" : "";
  const rel = (iso: string | null) => {
    if (!iso) return "never";
    const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
    return d <= 0 ? "today" : d === 1 ? "yesterday" : d < 30 ? `${d}d ago` : d < 365 ? `${Math.floor(d / 30)}mo ago` : `${Math.floor(d / 365)}y ago`;
  };
  return (
    <tr className={`border-b border-surface-200 last:border-0 ${rowBg}`}>
      <td className="px-3 py-2.5 tabular-nums text-ink-muted">{rank ?? "—"}</td>
      <td className="px-3 py-2.5">
        <div className="font-semibold text-ink">{p.name}</div>
        <div className="text-[10px] text-ink-muted">{p.code ?? "—"}{p.neverSignedIn ? " · never signed in" : p.dormant ? " · dormant" : !p.active ? " · deactivated" : ""}{p.sharedName ? " · shared name" : ""}</div>
      </td>
      <td className="px-3 py-2.5 text-ink-600">{p.roleLabel}</td>
      <td className="px-3 py-2.5 text-ink-600">{p.territory}</td>
      <td className="px-3 py-2.5 text-right tabular-nums font-bold text-ink">{n(p.writeEvents)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-ink-600">{n(p.visits)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-ink-600">{n(p.actionsDone)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-ink-500">{n(p.openAssigned)}</td>
      <td className="px-3 py-2.5 text-ink-600">{rel(p.lastLoginAt)}</td>
    </tr>
  );
}
