import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, CircleCheck, CircleX, Download, FileText, Loader2, Play, RotateCcw, Zap } from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart,
  ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Card, Confidence, ModuleBadge, tooltipStyle } from "../components/ui";
import { inr, MODULES, pct, shortDate, streamInvestigation, type InvestigationEvent, type Json, type Report, type StepEvent } from "../lib/api";
import { PageHeader } from "./Overview";

type Status = "pending" | "thinking" | "done";

const axis = { tick: { fill: "#8a8aa8", fontSize: 11 }, tickLine: false, axisLine: false } as const;
const grid = <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />;

/* ---------------------------------------------------------------- step views */

function DetectView({ d }: { d: Json }) {
  const focusStart = d.chart.find((r: Json) => r.in_focus)?.date;
  const last = d.chart[d.chart.length - 1]?.date;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Actual Q3", inr(d.actual)],
          ["Expected Q3", inr(d.expected)],
          ["Gap", inr(d.gap)],
          ["Significance", `z = ${d.z_score}`],
        ].map(([l, v]) => (
          <div key={l} className="rounded-xl bg-white/[0.03] p-3">
            <div className="text-[11px] uppercase tracking-wider text-ink-400">{l}</div>
            <div className="mt-1 font-display text-lg">{v}</div>
          </div>
        ))}
      </div>
      <div className="h-60">
        <ResponsiveContainer>
          <LineChart data={d.chart} margin={{ left: 0, right: 8, top: 8 }}>
            {grid}
            <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={40} {...axis} />
            <YAxis tickFormatter={(v) => inr(v, 0)} width={62} {...axis} domain={[(min: number) => Math.floor(min * 0.85), "auto"]} />
            <Tooltip {...tooltipStyle} labelFormatter={(l) => shortDate(String(l))} formatter={(v, n) => [inr(Number(v)), n === "actual_7d" ? "Actual (7-day avg)" : "Expected (7-day avg)"]} />
            {focusStart && <ReferenceArea x1={focusStart} x2={last} fill="#fb7185" fillOpacity={0.06} />}
            {d.onset && <ReferenceLine x={d.onset} stroke="#fb7185" strokeDasharray="4 4" label={{ value: "onset", fill: "#fb7185", fontSize: 11, position: "insideTopLeft" }} />}
            <Line isAnimationActive={false} type="monotone" dataKey="expected_7d" stroke="#8a8aa8" strokeDasharray="5 5" dot={false} strokeWidth={1.5} />
            <Line isAnimationActive={false} type="monotone" dataKey="actual_7d" stroke="#a78bfa" dot={false} strokeWidth={2.2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-ink-400">
        Baseline: log-linear regression with trend, day-of-week and annual Fourier terms, trained only on data before Q3 (in-sample error {pct(d.model_mape, 1, false)}).
      </p>
    </div>
  );
}

function DriversView({ d }: { d: Json }) {
  const top = d.dimensions[0];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-lg bg-white/5 px-2.5 py-1 text-ink-300">All revenue</span>
        {d.drilldown.map((p: Json) => (
          <span key={p.dimension} className="flex items-center gap-2">
            <span className="text-ink-600">→</span>
            <span className="rounded-lg border border-violet/30 bg-violet/10 px-2.5 py-1">
              <span className="text-ink-400">{p.label}:</span> {p.hot_segments.join(", ")}
            </span>
          </span>
        ))}
        <span className="ml-1 rounded-lg bg-rose/10 px-2.5 py-1 font-semibold text-rose">{pct(d.drilldown_share_of_drop, 0, false)} of the drop</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-2 text-xs uppercase tracking-wider text-ink-400">Change by {top.label.toLowerCase()} (Q3 vs Q2)</div>
          <div className="h-52">
            <ResponsiveContainer>
              <BarChart data={top.segments} layout="vertical" margin={{ left: 8, right: 16 }}>
                <XAxis type="number" tickFormatter={(v) => inr(v, 0)} {...axis} />
                <YAxis type="category" dataKey="segment" width={118} {...axis} tick={{ fill: "#b4b4cc", fontSize: 11 }} />
                <Tooltip {...tooltipStyle} formatter={(v) => inr(Number(v))} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                <ReferenceLine x={0} stroke="#33334f" />
                <Bar dataKey="delta" radius={4}>
                  {top.segments.map((s: Json) => <Cell key={s.segment} fill={s.delta < 0 ? "#fb7185" : "#34d399"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <div className="mb-2 text-xs uppercase tracking-wider text-ink-400">How concentrated is the drop, by dimension?</div>
          <div className="space-y-2.5">
            {d.dimensions.map((dim: Json) => (
              <div key={dim.dimension}>
                <div className="flex justify-between text-sm"><span className="text-ink-300">{dim.label}</span><span className="font-mono text-xs">{dim.concentration.toFixed(2)}</span></div>
                <div className="mt-1 h-1.5 rounded-full bg-white/5">
                  <div className="h-full rounded-full bg-gradient-to-r from-violet to-cyan" style={{ width: `${Math.min(1, dim.concentration / d.dimensions[0].concentration) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl bg-white/[0.03] p-3 text-sm">
            <div className="text-xs uppercase tracking-wider text-ink-400">Price vs volume</div>
            <div className="mt-1">Units {pct(d.price_volume.units_change_pct)} · like-for-like price {pct(d.price_volume.avg_price_change_pct)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SupplyView({ d }: { d: Json }) {
  const cp = d.change_points;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Supplier delays broke", cp.supplier_delay, "#fbbf24"],
          ["Stockouts broke", cp.stockouts, "#fb7185"],
          ["Revenue broke", cp.revenue, "#a78bfa"],
        ].map(([l, v, c], i) => (
          <div key={l} className="relative rounded-xl bg-white/[0.03] p-3">
            <div className="font-mono text-[10px] text-ink-400">STEP {i + 1}</div>
            <div className="text-sm text-ink-300">{l}</div>
            <div className="mt-1 font-display text-lg" style={{ color: c }}>{v ? shortDate(v) : "—"}</div>
          </div>
        ))}
      </div>
      <div className="h-60">
        <ResponsiveContainer>
          <ComposedChart data={d.timeline} margin={{ left: 0, right: 0, top: 8 }}>
            {grid}
            <XAxis dataKey="week" tickFormatter={shortDate} minTickGap={30} {...axis} />
            <YAxis yAxisId="l" width={40} {...axis} tickFormatter={(v) => `${v}d`} />
            <YAxis yAxisId="r" orientation="right" width={44} {...axis} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
            <Tooltip {...tooltipStyle} labelFormatter={(l) => `Week of ${shortDate(String(l))}`} formatter={(v, n) => (n === "stockout_rate" ? [pct(Number(v), 0, false), "Stockout days"] : n === "delay_days" ? [`${Number(v).toFixed(1)} days`, `${d.suspect_supplier} delay`] : [inr(Number(v)), "Lane revenue"])} />
            <Legend formatter={(v) => (v === "delay_days" ? "Supplier delay (days)" : "Stockout days (%)")} wrapperStyle={{ fontSize: 12 }} />
            <Area isAnimationActive={false} yAxisId="r" type="monotone" dataKey="stockout_rate" stroke="#fb7185" fill="#fb7185" fillOpacity={0.15} />
            <Line isAnimationActive={false} yAxisId="l" type="monotone" dataKey="delay_days" stroke="#fbbf24" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-ink-400">
            <tr><th className="py-2 font-medium">Product · DC</th><th className="font-medium">Stockout days Q2 → Q3</th><th className="text-right font-medium">Lost demand Q3</th></tr>
          </thead>
          <tbody>
            {d.hotspots.slice(0, 5).map((h: Json) => (
              <tr key={h.product + h.region} className="border-t border-white/5">
                <td className="py-2">{h.product} · {h.region}</td>
                <td>{pct(h.stockout_days_prev_pct, 0, false)} → <span className="text-rose">{pct(h.stockout_days_focus_pct, 0, false)}</span></td>
                <td className="text-right font-mono">{inr(h.lost_revenue_focus)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InfraView({ d }: { d: Json }) {
  const inc = d.incidents[0];
  return (
    <div className="space-y-4">
      {inc && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Service", inc.service],
            ["Window", `${shortDate(inc.start)} – ${shortDate(inc.end)}`],
            ["p95 latency", `${inc.p95_latency_before} → ${inc.p95_latency_during} ms`],
            ["Revenue impact", inr(-inc.estimated_lost_revenue)],
          ].map(([l, v]) => (
            <div key={l} className="rounded-xl bg-white/[0.03] p-3"><div className="text-[11px] uppercase tracking-wider text-ink-400">{l}</div><div className="mt-1 text-sm font-medium">{v}</div></div>
          ))}
        </div>
      )}
      <div className="h-52">
        <ResponsiveContainer>
          <AreaChart data={d.order_service_chart} margin={{ left: 0, right: 8, top: 8 }}>
            {grid}
            <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={40} {...axis} />
            <YAxis width={52} {...axis} tickFormatter={(v) => `${v}ms`} />
            <Tooltip {...tooltipStyle} labelFormatter={(l) => shortDate(String(l))} formatter={(v) => [`${Math.round(Number(v))} ms`, "order-service p95"]} />
            {inc && <ReferenceArea x1={inc.start} x2={inc.end} fill="#22d3ee" fillOpacity={0.07} />}
            <Area isAnimationActive={false} type="monotone" dataKey="p95_latency_ms" stroke="#22d3ee" fill="#22d3ee" fillOpacity={0.15} strokeWidth={1.8} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-ink-400">Impact measured with difference-in-differences: the online channel’s share of sales during the incident vs. the rest of the quarter, with offline channels as the control.</p>
    </div>
  );
}

function MarketView({ d }: { d: Json }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {[["Demand index Q2", d.demand_index_prev.toFixed(1)], ["Demand index Q3", d.demand_index_focus.toFixed(1)], ["Change", pct(d.change_pct)]].map(([l, v]) => (
        <div key={l} className="rounded-xl bg-white/[0.03] p-3"><div className="text-[11px] uppercase tracking-wider text-ink-400">{l}</div><div className="mt-1 font-display text-lg">{v}</div></div>
      ))}
    </div>
  );
}

function EvidenceView({ d }: { d: Json }) {
  const seen = new Set<string>();
  const hits: Json[] = [];
  Object.entries(d.results as Record<string, Json[]>).forEach(([topic, list]) => {
    const h = list[0];
    if (h && !seen.has(h.doc)) { seen.add(h.doc); hits.push({ ...h, topic }); }
  });
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {hits.map((h) => (
        <div key={h.doc} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium"><FileText size={15} className="shrink-0 text-emerald" />{h.title}</div>
            <span className="shrink-0 font-mono text-[10px] text-ink-400">score {h.score}</span>
          </div>
          <p className="mt-2 line-clamp-4 whitespace-pre-line text-xs leading-relaxed text-ink-300">{h.text}</p>
          <div className="mt-2 font-mono text-[10px] uppercase tracking-wider text-ink-400">re: {h.topic}</div>
        </div>
      ))}
    </div>
  );
}

function AttributionView({ d }: { d: Json }) {
  const causes = d.causes as Json[];
  const max = Math.max(...causes.map((c) => Math.abs(c.impact)));
  return (
    <div className="space-y-4">
      {causes.map((c) => (
        <div key={c.key} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm">{c.module !== "—" && <ModuleBadge module={c.module} />}<span className="font-medium">{c.cause}</span></div>
            <div className="flex items-center gap-2"><span className="font-mono text-sm">{inr(-c.impact)}</span><span className="text-xs text-ink-400">{pct(c.share_of_gap, 0, false)}</span>{c.confidence !== "—" && <Confidence level={c.confidence} />}</div>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-white/5">
            <motion.div initial={{ width: 0 }} animate={{ width: `${(Math.abs(c.impact) / max) * 100}%` }} transition={{ duration: 0.9 }} className="h-full rounded-full" style={{ background: MODULES[c.module]?.color ?? "#33334f" }} />
          </div>
          {c.checks.length > 0 && (
            <ul className="mt-3 grid gap-1 sm:grid-cols-2">
              {c.checks.map((ch: Json) => (
                <li key={ch.label} className="flex items-start gap-1.5 text-xs text-ink-300">
                  {ch.passed ? <CircleCheck size={13} className="mt-0.5 shrink-0 text-emerald" /> : <CircleX size={13} className="mt-0.5 shrink-0 text-ink-600" />}
                  {ch.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

const SC_COLORS: Record<string, string> = { do_nothing: "#fb7185", rebalance: "#fbbf24", switch: "#22d3ee", combined: "#34d399", custom: "#a78bfa", healthy: "#8a8aa8" };

export function ScenarioChart({ chart, keys }: { chart: Json[]; keys: string[] }) {
  return (
    <div className="h-60">
      <ResponsiveContainer>
        <LineChart data={chart} margin={{ left: 0, right: 8, top: 8 }}>
          {grid}
          <XAxis dataKey="week" tickFormatter={shortDate} {...axis} />
          <YAxis tickFormatter={(v) => inr(v, 1)} width={68} {...axis} domain={["auto", "auto"]} />
          <Tooltip {...tooltipStyle} labelFormatter={(l) => `Week of ${shortDate(String(l))}`} formatter={(v, n) => [inr(Number(v)), String(n)]} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line dataKey="healthy" name="Healthy baseline" stroke={SC_COLORS.healthy} strokeDasharray="5 5" dot={false} isAnimationActive={false} />
          {keys.map((k) => <Line key={k} dataKey={k} name={k === "custom" ? "your plan" : k.replace("_", " ")} stroke={SC_COLORS[k] ?? "#a78bfa"} strokeWidth={2} dot={false} isAnimationActive={false} />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ScenariosView({ d }: { d: Json }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {d.strategies.map((s: Json) => {
          const best = s.key === d.recommended;
          return (
            <div key={s.key} className={`rounded-xl border p-4 ${best ? "border-emerald/40 bg-emerald/[0.07]" : "border-white/5 bg-white/[0.02]"}`}>
              <div className="flex items-center justify-between">
                <span className="h-2 w-2 rounded-full" style={{ background: SC_COLORS[s.key] }} />
                {best && <span className="rounded-full bg-emerald/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald">Recommended</span>}
              </div>
              <div className="mt-2 text-sm font-semibold">{s.name}</div>
              <div className="mt-3 text-[11px] uppercase tracking-wider text-ink-400">Net impact (P50)</div>
              <div className={`font-display text-xl ${s.net_impact > 0 ? "text-emerald" : "text-ink-300"}`}>{s.key === "do_nothing" ? "baseline" : inr(s.net_impact)}</div>
              {s.key !== "do_nothing" && <div className="text-[11px] text-ink-400">P10–P90 {inr(s.net_impact_p10)} – {inr(s.net_impact_p90)}</div>}
              <div className="mt-2 text-xs text-ink-300">Recovers {inr(s.recovered_revenue)} · cost {inr(s.cost)}</div>
            </div>
          );
        })}
      </div>
      <ScenarioChart chart={d.chart} keys={["do_nothing", "rebalance", "switch", "combined"]} />
      <p className="text-xs text-ink-400">
        {d.assumptions.simulations} Monte Carlo runs per strategy, varying daily demand noise, loss severity (±20%) and supplier onboarding time (±5 days).
        Net impact = recovered revenue × {pct(d.assumptions.gross_margin, 0, false)} margin − extra cost.
      </p>
    </div>
  );
}

function ReportView({ r }: { r: Report }) {
  const download = () => {
    const md = [
      `# NEXORA Investigation Report`, ``, `## ${r.headline}`, ``, r.summary, ``, `## Findings`, ...r.findings.map((f) => `- ${f}`), ``,
      `## Recommendation`, r.recommendation, ``, `## Ruled out`, ...r.ruled_out.map((f) => `- ${f}`), ``, `## Next steps`, ...r.next_steps.map((f) => `- ${f}`), ``,
      `## Evidence`, ...r.evidence.map((f) => `- ${f}`), ``, `_Written by ${r.author}._`,
    ].join("\n");
    const url = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url; a.download = "nexora-investigation-report.md"; a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-5">
      <p className="font-display text-xl leading-snug">{r.headline}</p>
      <p className="text-sm leading-relaxed text-ink-300">{r.summary}</p>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-emerald/30 bg-emerald/[0.06] p-4 md:col-span-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-emerald">Recommendation</div>
          <p className="mt-1 text-sm leading-relaxed">{r.recommendation}</p>
        </div>
        {([["Findings", r.findings], ["Ruled out", r.ruled_out], ["Next steps", r.next_steps], ["Evidence cited", r.evidence]] as const).map(([t, list]) => (
          <div key={t} className="rounded-xl bg-white/[0.03] p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-ink-400">{t}</div>
            <ul className="mt-2 space-y-1.5">
              {list.map((x) => <li key={x} className="flex gap-2 text-sm text-ink-300"><Check size={14} className="mt-0.5 shrink-0 text-cyan" />{x}</li>)}
            </ul>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-ink-400">Written by {r.author}</span>
        <button onClick={download} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10">
          <Download size={15} /> Download report (.md)
        </button>
      </div>
    </div>
  );
}

function StepBody({ step }: { step: StepEvent }) {
  const d = step.data;
  switch (step.key) {
    case "detect": return <DetectView d={d} />;
    case "drivers": return <DriversView d={d} />;
    case "supply": return <SupplyView d={d} />;
    case "infra": return <InfraView d={d} />;
    case "market": return <MarketView d={d} />;
    case "evidence": return <EvidenceView d={d} />;
    case "attribution": return <AttributionView d={d} />;
    case "scenarios": return <ScenariosView d={d} />;
    case "report": return <ReportView r={d as Report} />;
    default: return null;
  }
}

/* ---------------------------------------------------------------- page */

export default function Investigate() {
  const [plan, setPlan] = useState<{ module: string; key: string; title: string }[]>([]);
  const [status, setStatus] = useState<Record<number, Status>>({});
  const [steps, setSteps] = useState<StepEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [fast, setFast] = useState(false);
  const [failed, setFailed] = useState(false);
  const stopRef = useRef<() => void>(() => {});
  const bottomRef = useRef<HTMLDivElement>(null);

  const start = useCallback(() => {
    stopRef.current();
    setSteps([]); setStatus({}); setDone(false); setRunning(true);
    stopRef.current = streamInvestigation((e: InvestigationEvent) => {
      if (e.type === "start") setPlan(e.steps);
      else if (e.type === "thinking") setStatus((s) => ({ ...s, [e.index]: "thinking" }));
      else if (e.type === "step") {
        setStatus((s) => ({ ...s, [e.index]: "done" }));
        setSteps((prev) => [...prev, e]);
      } else if (e.type === "done") { setRunning(false); setDone(true); }
    }, fast ? 0.25 : 1.1, () => { setRunning(false); setFailed(true); });
    setFailed(false);
  }, [fast]);

  useEffect(() => {
    start();
    return () => stopRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (running) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [steps.length, status, running]);

  const progress = plan.length ? steps.length / plan.length : 0;

  return (
    <div>
      <PageHeader
        title="Investigation"
        sub="Why did Q3 2026 revenue fall? NEXORA runs 9 analytical steps across 6 modules."
        right={
          <div className="flex items-center gap-2">
            <button onClick={() => setFast((f) => !f)} className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm ${fast ? "border-cyan/40 bg-cyan/10 text-cyan" : "border-white/10 bg-white/5 text-ink-300"}`}>
              <Zap size={15} /> {fast ? "Fast replay" : "Normal speed"}
            </button>
            <button onClick={start} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-ink-950 hover:bg-ink-100">
              {running ? <Loader2 size={15} className="animate-spin" /> : done ? <RotateCcw size={15} /> : <Play size={15} />}
              {running ? "Investigating…" : done || failed ? "Run again" : "Run"}
            </button>
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[300px_1fr]">
        {/* timeline */}
        <div className="xl:sticky xl:top-8 xl:self-start">
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between text-xs text-ink-400">
              <span>Agent plan</span><span className="font-mono">{steps.length}/{plan.length || 9}</span>
            </div>
            <div className="mb-4 h-1 overflow-hidden rounded-full bg-white/5">
              <motion.div className="h-full bg-gradient-to-r from-violet to-cyan" animate={{ width: `${progress * 100}%` }} />
            </div>
            <ol className="space-y-1">
              {(plan.length ? plan : Array.from({ length: 9 }, () => null)).map((p, i) => {
                const st = status[i + 1] ?? "pending";
                return (
                  <li key={i}>
                    <a href={`#step-${i + 1}`} className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition ${st === "thinking" ? "bg-violet/10" : "hover:bg-white/[0.03]"}`}>
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                        {st === "done" ? <CircleCheck size={16} className="text-emerald" /> : st === "thinking" ? <Loader2 size={15} className="animate-spin text-cyan" /> : <span className="h-3 w-3 rounded-full border border-ink-600" />}
                      </span>
                      <span className={`min-w-0 flex-1 truncate ${st === "pending" ? "text-ink-400" : "text-ink-100"}`}>{p ? p.title : <span className="shimmer inline-block h-3 w-40 rounded" />}</span>
                      {p && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: MODULES[p.module]?.color }} />}
                    </a>
                  </li>
                );
              })}
            </ol>
          </Card>
        </div>

        {/* step results */}
        <div className="min-w-0 space-y-4">
          <AnimatePresence initial={false}>
            {steps.map((s) => (
              <motion.div key={s.index} id={`step-${s.index}`} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className="scroll-mt-6">
                <Card className={`p-5 sm:p-6 ${s.key === "report" ? "glow-border" : ""}`}>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-ink-400">{String(s.index).padStart(2, "0")}</span>
                    <ModuleBadge module={s.module} />
                    <h3 className="font-display text-lg font-semibold">{s.title}</h3>
                  </div>
                  {s.key !== "report" && <p className="mb-5 text-sm leading-relaxed text-ink-300">{s.summary}</p>}
                  <StepBody step={s} />
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
          {running && (
            <Card className="flex items-center gap-3 p-5 text-sm text-ink-300">
              <Loader2 size={16} className="animate-spin text-cyan" />
              {(() => {
                const cur = Object.entries(status).find(([, v]) => v === "thinking");
                const p = cur ? plan[Number(cur[0]) - 1] : null;
                return p ? <><ModuleBadge module={p.module} /> {p.title}…</> : "Connecting to the NEXORA engine…";
              })()}
            </Card>
          )}
          {failed && (
            <Card className="p-5 text-sm">
              <div className="font-semibold text-rose">Lost connection to the NEXORA engine</div>
              <p className="mt-1 text-ink-300">Make sure the backend is running on port 8200, then press <b>Run again</b>.</p>
            </Card>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
