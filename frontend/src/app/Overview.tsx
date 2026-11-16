import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { AlertTriangle, ArrowRight, Sparkles } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, ModuleBadge, Stat, tooltipStyle } from "../components/ui";
import { getJSON, inr, pct, type Json } from "../lib/api";

export function PageHeader({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {sub && <p className="mt-1 text-sm text-ink-400">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => <div key={i} className="shimmer h-28 rounded-2xl" />)}
      <div className="col-span-full text-sm text-ink-400">{label}</div>
    </div>
  );
}

export function ErrorBox({ error }: { error: string }) {
  return (
    <Card className="p-6 text-sm">
      <div className="font-semibold text-rose">Can’t reach the NEXORA engine</div>
      <p className="mt-1 text-ink-300">{error}. Start the backend with <code className="font-mono text-cyan">uvicorn nexora.api:app --port 8000</code> and refresh.</p>
    </Card>
  );
}

export default function Overview() {
  const [data, setData] = useState<Json | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    getJSON("/api/overview").then(setData).catch((e) => setErr(String(e.message)));
  }, []);

  if (err) return <ErrorBox error={err} />;
  if (!data) return <><PageHeader title="Command center" /><Loading /></>;
  const k = data.kpis;
  const change = k.revenue / k.revenue_prev - 1;

  return (
    <div>
      <PageHeader title="Command center" sub={`${data.company} · ${data.period.label}`} />

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <Link to="/app/investigate" className="glow-border group mb-6 flex flex-col items-start gap-4 rounded-2xl sm:flex-row sm:items-center border border-rose/20 bg-gradient-to-r from-rose/10 via-violet/10 to-transparent p-5 transition hover:from-rose/15">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose/15 text-rose"><AlertTriangle size={20} /></div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold">Anomaly detected: Q3 revenue {pct(change)} vs Q2</div>
            <div className="text-sm text-ink-300">NEXORA can trace this to its root causes across sales, supply chain, infrastructure and documents.</div>
          </div>
          <span className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-ink-950">
            <Sparkles size={15} /> Investigate <ArrowRight size={15} className="transition group-hover:translate-x-0.5" />
          </span>
        </Link>
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Q3 revenue" value={inr(k.revenue)} sub={`${pct(change)} vs Q2 (${inr(k.revenue_prev)})`} tone={change < 0 ? "down" : "up"} />
        <Stat label="Units sold" value={k.units.toLocaleString("en-IN")} sub={`${pct(k.units / k.units_prev - 1)} vs Q2`} tone={k.units < k.units_prev ? "down" : "up"} />
        <Stat label="Q4 forecast (healthy)" value={inr(k.q4_forecast_healthy)} sub="Baseline model, if causes are fixed" />
        <Stat label="Active alerts" value={k.active_alerts} sub={`${k.data_sources} data sources · ${k.documents} documents`} tone="neutral" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div className="font-medium">Monthly revenue</div>
            <ModuleBadge module="AETHER" />
          </div>
          <div className="h-64">
            <ResponsiveContainer>
              <AreaChart data={data.monthly} margin={{ left: 0, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#8b5cf6" stopOpacity={0.5} />
                    <stop offset="1" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: "#8a8aa8", fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={(v) => inr(v, 0)} tick={{ fill: "#8a8aa8", fontSize: 11 }} tickLine={false} axisLine={false} width={70} />
                <Tooltip {...tooltipStyle} formatter={(v) => inr(Number(v))} />
                <Area isAnimationActive={false} type="monotone" dataKey="revenue" stroke="#a78bfa" strokeWidth={2} fill="url(#rev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-4 font-medium">Alerts</div>
          <div className="scrollbar-thin max-h-64 space-y-2 overflow-auto pr-1">
            {data.alerts.map((a: Json, i: number) => (
              <div key={i} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                <div className="flex items-center justify-between gap-2">
                  <ModuleBadge module={a.module} />
                  <span className={`text-[10px] font-semibold uppercase ${a.severity === "critical" ? "text-rose" : "text-amber"}`}>{a.severity}</span>
                </div>
                <div className="mt-2 text-sm font-medium">{a.title}</div>
                <div className="text-xs text-ink-400">{a.detail}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <div className="mb-4 font-medium">Q3 revenue by category <span className="text-sm font-normal text-ink-400">· change vs Q2</span></div>
          <div className="space-y-3">
            {data.by_category.map((c: Json) => {
              const max = data.by_category[0].revenue;
              return (
                <div key={c.category} className="grid grid-cols-12 items-center gap-3 text-sm">
                  <div className="col-span-4 truncate text-ink-300 sm:col-span-3">{c.category}</div>
                  <div className="col-span-5 h-2 overflow-hidden rounded-full bg-white/5 sm:col-span-6">
                    <div className="h-full rounded-full bg-gradient-to-r from-violet to-cyan" style={{ width: `${(c.revenue / max) * 100}%` }} />
                  </div>
                  <div className="col-span-3 flex justify-end gap-3 font-mono text-xs sm:col-span-3">
                    <span className="hidden sm:inline">{inr(c.revenue)}</span>
                    <span className={c.change < -0.05 ? "text-rose" : c.change < 0 ? "text-amber" : "text-emerald"}>{pct(c.change)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
        <Card className="p-5">
          <div className="mb-4 font-medium">Q3 revenue by region</div>
          <div className="h-52">
            <ResponsiveContainer>
              <BarChart data={data.by_region} layout="vertical" margin={{ left: 8, right: 8 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="region" tick={{ fill: "#b4b4cc", fontSize: 12 }} tickLine={false} axisLine={false} width={50} />
                <Tooltip {...tooltipStyle} formatter={(v) => inr(Number(v))} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                <Bar dataKey="revenue" radius={[0, 6, 6, 0]}>
                  {data.by_region.map((_: Json, i: number) => <Cell key={i} fill={["#8b5cf6", "#7c6cf3", "#5a9bf0", "#22d3ee"][i % 4]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}
