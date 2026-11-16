import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, ModuleBadge, Stat } from "../components/ui";
import { inr, pct, postJSON, type Json } from "../lib/api";
import { ErrorBox, PageHeader } from "./Overview";
import { ScenarioChart } from "./Investigate";

function Slider({ label, value, min, max, step, onChange, format }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format: (v: number) => string }) {
  return (
    <label className="block">
      <div className="flex items-center justify-between text-sm">
        <span className="text-ink-300">{label}</span>
        <span className="font-mono text-cyan">{format(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-2 w-full accent-violet-500" />
    </label>
  );
}

export default function Scenarios() {
  const [onboarding, setOnboarding] = useState(21);
  const [rebalance, setRebalance] = useState(0.45);
  const [switchSupplier, setSwitch] = useState(true);
  const [res, setRes] = useState<Json | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setLoading(true);
      postJSON("/api/scenario", { onboarding_days: onboarding, rebalance_share: rebalance, switch_supplier: switchSupplier })
        .then((r) => { setRes(r); setErr(null); })
        .catch((e) => setErr(String(e.message)))
        .finally(() => setLoading(false));
    }, 250);
  }, [onboarding, rebalance, switchSupplier]);

  const custom = res?.strategies.find((s: Json) => s.key === "custom");
  const base = res?.strategies.find((s: Json) => s.key === "do_nothing");

  return (
    <div>
      <PageHeader title="Scenario lab" sub="Design your own recovery plan for Q4 2026. Every change re-runs the Monte Carlo simulation." right={<ModuleBadge module="DECISIONOS" />} />
      {err && <div className="mb-4"><ErrorBox error={err} /></div>}
      <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
        <Card className="space-y-6 p-5 xl:self-start">
          <Slider label="Stock rebalancing (share of lost demand recovered)" value={rebalance} min={0} max={0.9} step={0.05} onChange={setRebalance} format={(v) => pct(v, 0, false)} />
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="text-ink-300">Switch to alternate supplier</span>
            <button
              role="switch"
              aria-checked={switchSupplier}
              onClick={() => setSwitch((s) => !s)}
              className={`relative h-6 w-11 rounded-full transition ${switchSupplier ? "bg-violet" : "bg-ink-700"}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${switchSupplier ? "left-5.5" : "left-0.5"}`} />
            </button>
          </label>
          <div className={switchSupplier ? "" : "pointer-events-none opacity-40"}>
            <Slider label="Supplier onboarding time" value={onboarding} min={7} max={60} step={1} onChange={setOnboarding} format={(v) => `${v} days`} />
          </div>
          {res && (
            <div className="rounded-xl bg-white/[0.03] p-3 text-xs leading-relaxed text-ink-400">
              <div className="mb-1 font-semibold uppercase tracking-wider">Assumptions</div>
              Gross margin {pct(res.assumptions.gross_margin, 0, false)} · alternate supplier premium {pct(res.assumptions.alt_supplier_premium, 0, false)} on COGS ·
              rebalancing logistics {pct(res.assumptions.rebalance_cost_share, 0, false)} of recovered revenue · {res.assumptions.simulations} simulations.
            </div>
          )}
        </Card>

        <div className="min-w-0 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Q4 revenue (your plan)" value={custom ? inr(custom.revenue_p50) : "…"} sub={custom ? `P10–P90 ${inr(custom.revenue_p10)} – ${inr(custom.revenue_p90)}` : ""} />
            <Stat label="Recovered vs waiting" value={custom ? inr(custom.recovered_revenue) : "…"} tone="up" sub={base ? `Waiting: ${inr(base.revenue_p50)}` : ""} />
            <Stat label="Extra cost" value={custom ? inr(custom.cost) : "…"} tone="neutral" sub="Supplier premium + logistics" />
            <Stat
              label="Net impact"
              value={custom ? <span className={custom.net_impact > 0 ? "text-emerald" : "text-rose"}>{inr(custom.net_impact)}</span> : "…"}
              sub={custom ? `Beats waiting in ${pct(custom.prob_beats_do_nothing, 0, false)} of runs` : ""}
              tone={custom && custom.net_impact > 0 ? "up" : "down"}
            />
          </div>
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="font-medium">Weekly revenue projection · Q4 2026</div>
              {loading && <Loader2 size={16} className="animate-spin text-cyan" />}
            </div>
            {res ? <ScenarioChart chart={res.chart} keys={["do_nothing", "custom"]} /> : <div className="shimmer h-60 rounded-xl" />}
            {res && <p className="mt-2 text-xs text-ink-400">Current loss rate if nothing changes: {inr(res.current_daily_loss)} per day.</p>}
          </Card>
        </div>
      </div>
    </div>
  );
}
