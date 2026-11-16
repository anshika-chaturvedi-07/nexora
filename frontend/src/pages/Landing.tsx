import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import {
  Activity, ArrowRight, BrainCircuit, Boxes, ChartNoAxesCombined, CircleCheck, FileSearch, GitBranch,
  Globe, Layers, Radar, ShieldCheck, Sparkles, Workflow,
} from "lucide-react";

function Github({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.4-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}
import NetworkCanvas from "../components/NetworkCanvas";
import { Card, Confidence, Logo, ModuleBadge, SectionTitle } from "../components/ui";
import { getJSON, inr, MODULES, type InvestigationEvent, type StepEvent } from "../lib/api";

const fade = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
};

function useInvestigation() {
  const [steps, setSteps] = useState<StepEvent[] | null>(null);
  useEffect(() => {
    getJSON<{ events: InvestigationEvent[] }>("/api/investigation")
      .then((r) => setSteps(r.events.filter((e): e is StepEvent => e.type === "step")))
      .catch(() => setSteps([]));
  }, []);
  return steps;
}

function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="mx-auto mt-3 flex max-w-6xl items-center justify-between rounded-2xl border border-white/5 bg-ink-950/60 px-4 py-2.5 backdrop-blur-xl sm:px-5">
        <Link to="/"><Logo size={26} /></Link>
        <nav className="hidden items-center gap-7 text-sm text-ink-300 md:flex">
          <a href="#how" className="hover:text-white">How it works</a>
          <a href="#modules" className="hover:text-white">Modules</a>
          <a href="#science" className="hover:text-white">Data science</a>
          <a href="#case" className="hover:text-white">Case study</a>
        </nav>
        <Link to="/app" className="rounded-xl bg-white px-3.5 py-2 text-sm font-semibold text-ink-950 transition hover:bg-ink-100">
          Open workspace
        </Link>
      </div>
    </header>
  );
}

function HeroPreview({ steps }: { steps: StepEvent[] | null }) {
  const [active, setActive] = useState(0);
  const list = steps && steps.length ? steps.slice(0, 8) : null;
  useEffect(() => {
    if (!list) return;
    const t = setInterval(() => setActive((a) => (a + 1) % list.length), 2600);
    return () => clearInterval(t);
  }, [list]);

  return (
    <div className="glow-border glass relative mx-auto w-full max-w-xl rounded-3xl p-5 text-left shadow-2xl shadow-violet/10">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-ink-400">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald" />
          </span>
          Live investigation · Veltrix Industries · Q3 2026
        </div>
        <span className="font-mono text-[10px] text-ink-400">{list ? `${active + 1}/${list.length}` : "…"}</span>
      </div>
      <div className="space-y-2">
        {(list ?? Array.from({ length: 5 })).map((s, i) => {
          const step = s as StepEvent | undefined;
          const on = i === active;
          return (
            <motion.div
              key={i}
              className={`rounded-xl border px-3 py-2.5 transition-colors ${on ? "border-violet/40 bg-violet/10" : "border-white/5 bg-white/[0.02]"}`}
            >
              {step ? (
                <>
                  <div className="flex items-center gap-2">
                    {i < active ? <CircleCheck size={14} className="text-emerald" /> : on ? <Sparkles size={14} className="text-cyan" /> : <span className="h-3.5 w-3.5 rounded-full border border-ink-600" />}
                    <ModuleBadge module={step.module} />
                    <span className="truncate text-[13px] text-ink-100">{step.title}</span>
                  </div>
                  {on && (
                    <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-2 overflow-hidden text-[12.5px] leading-relaxed text-ink-300">
                      {step.summary}
                    </motion.p>
                  )}
                </>
              ) : (
                <div className="shimmer h-5 rounded" />
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

const STAGES = [
  { icon: Radar, title: "Detect", module: "AETHER", text: "A baseline model learns what revenue should be (trend, weekly and yearly seasonality) and flags when reality breaks out of its 95% band." },
  { icon: Layers, title: "Decompose", module: "AETHER", text: "Every dimension (category, region, channel, supplier) is scored for how concentrated the loss is, then the agent drills into the worst slice." },
  { icon: Workflow, title: "Diagnose", module: "SUPPLYMIND", text: "Operational signals are scanned for change points, lead-lag relationships and incidents, then corroborated with internal documents." },
  { icon: GitBranch, title: "Decide", module: "DECISIONOS", text: "The gap is attributed to causes with confidence levels, and recovery strategies are simulated thousands of times to rank them." },
];

const SCIENCE = [
  ["Log-linear baseline regression", "Expected revenue with trend + Fourier seasonality; quarter-level z-score", "AETHER"],
  ["Concentration scoring & greedy drill-down", "Finds where a drop is disproportionate, not just largest", "AETHER"],
  ["Price–volume decomposition", "Separates pricing effects from demand/volume effects", "AETHER"],
  ["Change-point detection", "Orders events in time: supplier delay → stockouts → revenue", "SUPPLYMIND"],
  ["Lead-lag correlation", "Tests whether a signal leads the outcome, and by how many weeks", "SUPPLYMIND"],
  ["Difference-in-differences", "Costs a platform incident using offline channels as a control group", "SENTINEL"],
  ["TF-IDF evidence retrieval", "Cites internal postmortems, scorecards and contracts", "INTELLEX"],
  ["Monte Carlo simulation", "P10/P50/P90 outcomes for each recovery strategy", "DECISIONOS"],
] as const;

const MODULE_ICONS: Record<string, typeof Activity> = {
  AETHER: ChartNoAxesCombined, SUPPLYMIND: Boxes, SENTINEL: Activity, INTELLEX: FileSearch,
  MARKETVERSE: Globe, DECISIONOS: BrainCircuit, CYBERPULSE: ShieldCheck,
};

function CaseStudy({ steps }: { steps: StepEvent[] | null }) {
  const attribution = steps?.find((s) => s.key === "attribution")?.data;
  const detect = steps?.find((s) => s.key === "detect")?.data;
  const report = steps?.find((s) => s.key === "report")?.data;
  if (!attribution || !detect) {
    return <Card className="p-8 text-center text-ink-400">Start the backend to load the live case study.</Card>;
  }
  const max = Math.max(...(attribution.causes as { impact: number }[]).map((c) => Math.abs(c.impact)));
  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <Card className="p-6 lg:col-span-2">
        <div className="font-mono text-xs uppercase tracking-widest text-ink-400">The question</div>
        <p className="mt-2 font-display text-2xl font-semibold leading-snug">“Why did Q3 revenue fall {Math.abs(detect.qoq_change * 100).toFixed(1)}%?”</p>
        <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-white/[0.03] p-3"><div className="text-ink-400">Actual</div><div className="mt-1 font-display text-xl">{inr(detect.actual)}</div></div>
          <div className="rounded-xl bg-white/[0.03] p-3"><div className="text-ink-400">Expected</div><div className="mt-1 font-display text-xl">{inr(detect.expected)}</div></div>
        </div>
        {report && <p className="mt-6 text-sm leading-relaxed text-ink-300">{report.headline}</p>}
      </Card>
      <Card className="p-6 lg:col-span-3">
        <div className="font-mono text-xs uppercase tracking-widest text-ink-400">NEXORA’s answer: where the {inr(-attribution.gap)} went</div>
        <div className="mt-5 space-y-4">
          {(attribution.causes as { key: string; cause: string; impact: number; share_of_gap: number; confidence: string; module: string }[]).map((c) => (
            <div key={c.key}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  {c.module !== "—" && <ModuleBadge module={c.module} />}
                  <span className="truncate text-ink-100">{c.cause}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-mono text-ink-300">{inr(-c.impact)}</span>
                  {c.confidence !== "—" && <Confidence level={c.confidence} />}
                </div>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/5">
                <motion.div
                  initial={{ width: 0 }}
                  whileInView={{ width: `${(Math.abs(c.impact) / max) * 100}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.1, ease: "easeOut" }}
                  className="h-full rounded-full"
                  style={{ background: c.module !== "—" ? MODULES[c.module]?.color : "#33334f" }}
                />
              </div>
            </div>
          ))}
        </div>
        <Link to="/app/investigate" className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-cyan hover:underline">
          Replay the full investigation <ArrowRight size={15} />
        </Link>
      </Card>
    </div>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-ink-300">{children}</span>;
}

export default function Landing() {
  const steps = useInvestigation();

  return (
    <div className="relative overflow-x-hidden">
      <Nav />

      {/* HERO */}
      <section className="relative min-h-[100svh] pt-28">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-40 top-10 h-[520px] w-[520px] rounded-full bg-violet/25 blur-[140px]" />
          <div className="absolute -right-40 top-40 h-[480px] w-[480px] rounded-full bg-cyan/15 blur-[140px]" />
          <div className="grid-bg absolute inset-0" />
          <NetworkCanvas className="absolute inset-0 opacity-70" />
        </div>
        <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 pb-20 lg:grid-cols-2">
          <motion.div className="min-w-0" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}>
            <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-violet/30 bg-violet/10 px-3 py-1 text-xs text-violet-200">
              <Sparkles size={13} /> Agentic investigation · real data science · no black boxes
            </div>
            <h1 className="mt-6 font-display text-5xl font-semibold leading-[1.02] tracking-tight sm:text-7xl">
              Know <span className="gradient-text">why</span> your numbers moved.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-300">
              Dashboards show <em>what</em> happened. NEXORA investigates <em>why</em>. It connects sales, inventory, suppliers,
              infrastructure and internal documents, traces a revenue drop to its root causes, and simulates what to do next.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link to="/app/investigate" className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet to-cyan px-5 py-3 font-semibold text-ink-950 shadow-lg shadow-violet/30 transition hover:brightness-110">
                Watch a live investigation <ArrowRight size={18} className="transition group-hover:translate-x-0.5" />
              </Link>
              <Link to="/app" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-3 font-semibold transition hover:bg-white/10">
                Explore the workspace
              </Link>
            </div>
            <div className="mt-10 flex flex-wrap gap-2">
              {["7 intelligence modules", "9-step investigation", "Monte Carlo decisions", "Cited evidence"].map((t) => <Pill key={t}>{t}</Pill>)}
            </div>
          </motion.div>
          <motion.div className="min-w-0" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.9, delay: 0.2 }}>
            <HeroPreview steps={steps} />
          </motion.div>
        </div>
      </section>

      {/* PROBLEM */}
      <section className="relative mx-auto max-w-6xl px-4 py-24">
        <motion.div {...fade}>
          <SectionTitle eyebrow="The problem" title={<>Signals live in silos. <span className="text-ink-400">Answers hide in the joins.</span></>}>
            When revenue drops, finance sees a number, ops sees stockouts, engineering sees an incident ticket and procurement
            sees a late supplier. Nobody sees the chain. NEXORA does.
          </SectionTitle>
        </motion.div>
        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {[
            ["Dashboards stop at “what”", "Charts flag that revenue fell. They don’t tell you which of a thousand segments caused it, or why."],
            ["Root causes cross teams", "A supplier delay becomes a stockout, which becomes lost revenue three weeks later. Each team sees one link."],
            ["Decisions lack uncertainty", "“Switch supplier” sounds right. But by how much, at what cost, and how sure are we?"],
          ].map(([t, d], i) => (
            <motion.div key={t} {...fade} transition={{ ...fade.transition, delay: i * 0.08 }}>
              <Card className="h-full p-6">
                <div className="font-mono text-xs text-cyan">0{i + 1}</div>
                <h3 className="mt-3 font-display text-xl font-semibold">{t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-300">{d}</p>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* HOW */}
      <section id="how" className="relative mx-auto max-w-6xl scroll-mt-24 px-4 py-24">
        <motion.div {...fade}>
          <SectionTitle eyebrow="How it works" title="From anomaly to decision in four stages">
            A code-orchestrated agent runs real analytical models at every step and passes findings forward, like a senior analyst would.
          </SectionTitle>
        </motion.div>
        <div className="relative mt-16 grid gap-4 md:grid-cols-4">
          <div className="absolute left-0 right-0 top-10 hidden h-px bg-gradient-to-r from-transparent via-violet/40 to-transparent md:block" />
          {STAGES.map((s, i) => (
            <motion.div key={s.title} {...fade} transition={{ ...fade.transition, delay: i * 0.1 }}>
              <Card className="relative h-full p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet/30 to-cyan/20 ring-1 ring-white/10">
                  <s.icon size={20} />
                </div>
                <div className="mt-5 flex items-center gap-2">
                  <span className="font-mono text-xs text-ink-400">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="font-display text-xl font-semibold">{s.title}</h3>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-ink-300">{s.text}</p>
                <ModuleBadge module={s.module} className="mt-4" />
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* MODULES */}
      <section id="modules" className="relative mx-auto max-w-6xl scroll-mt-24 px-4 py-24">
        <motion.div {...fade}>
          <SectionTitle eyebrow="The platform" title="Seven intelligence modules. One investigation.">
            Each module owns a domain. The orchestrator connects them, and that connection is the product.
          </SectionTitle>
        </motion.div>
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(MODULES).filter(([k]) => k !== "NEXORA").map(([key, m], i) => {
            const Icon = MODULE_ICONS[key];
            const roadmap = key === "CYBERPULSE";
            return (
              <motion.div key={key} {...fade} transition={{ ...fade.transition, delay: i * 0.05 }} className={i === 6 ? "lg:col-span-2" : ""}>
                <Card className="group h-full p-5 transition hover:-translate-y-0.5 hover:border-white/15">
                  <div className="flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: `${m.color}1f`, color: m.color }}>
                      <Icon size={19} />
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${roadmap ? "bg-white/5 text-ink-400" : "bg-emerald/10 text-emerald"}`}>
                      {roadmap ? "Roadmap" : "Live"}
                    </span>
                  </div>
                  <div className="mt-4 font-display text-lg font-semibold tracking-wide" style={{ color: m.color }}>{key}</div>
                  <div className="text-sm text-ink-100">{m.label}</div>
                  <p className="mt-2 text-sm text-ink-400">{m.blurb}</p>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* SCIENCE */}
      <section id="science" className="relative mx-auto max-w-6xl scroll-mt-24 px-4 py-24">
        <motion.div {...fade}>
          <SectionTitle eyebrow="Not an LLM wrapper" title="Every claim is computed, not generated.">
            Statistical models find the causes and put numbers on them. A language model (optional) only rewrites the summary,
            using numbers the models already produced.
          </SectionTitle>
        </motion.div>
        <motion.div {...fade}>
          <Card className="mt-14 overflow-hidden">
            <div className="hidden grid-cols-12 border-b border-white/5 px-6 py-3 text-xs uppercase tracking-wider text-ink-400 md:grid">
              <div className="col-span-4">Technique</div>
              <div className="col-span-6">What it does</div>
              <div className="col-span-2 text-right">Module</div>
            </div>
            {SCIENCE.map(([t, d, m]) => (
              <div key={t} className="grid gap-1 border-b border-white/5 px-6 py-4 last:border-0 md:grid-cols-12 md:items-center md:gap-0">
                <div className="font-medium md:col-span-4">{t}</div>
                <div className="text-sm text-ink-300 md:col-span-6">{d}</div>
                <div className="md:col-span-2 md:text-right"><ModuleBadge module={m} /></div>
              </div>
            ))}
          </Card>
        </motion.div>
      </section>

      {/* CASE */}
      <section id="case" className="relative mx-auto max-w-6xl scroll-mt-24 px-4 py-24">
        <motion.div {...fade}>
          <SectionTitle eyebrow="Case study" title="The Veltrix Q3 investigation">
            A synthetic manufacturer with 21 months of simulated operations and two hidden incidents. NEXORA is never told about them.
          </SectionTitle>
        </motion.div>
        <motion.div {...fade} className="mt-14">
          <CaseStudy steps={steps} />
        </motion.div>
      </section>

      {/* ARCHITECTURE */}
      <section className="relative mx-auto max-w-6xl px-4 py-24">
        <motion.div {...fade}>
          <SectionTitle eyebrow="Architecture" title="Simple to run. Built to scale." />
        </motion.div>
        <motion.div {...fade} className="mt-14 grid gap-3 text-sm md:grid-cols-3">
          {[
            ["Experience", "React · TypeScript · Tailwind · Motion · Recharts", "Streaming UI over Server-Sent Events"],
            ["Intelligence", "Python · FastAPI · pandas · scikit-learn · NumPy", "9-step orchestrated investigation agent"],
            ["Data & delivery", "Mechanistic data simulator · Docker · GitHub", "Optional Claude summary layer"],
          ].map(([t, a, b]) => (
            <Card key={t} className="p-6">
              <div className="font-mono text-xs uppercase tracking-widest text-cyan">{t}</div>
              <div className="mt-3 font-medium">{a}</div>
              <div className="mt-1 text-ink-400">{b}</div>
            </Card>
          ))}
        </motion.div>
      </section>

      {/* CTA */}
      <section className="relative mx-auto max-w-6xl px-4 pb-24 pt-8">
        <motion.div {...fade}>
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-violet/25 via-ink-900 to-cyan/15 p-10 text-center sm:p-16">
            <div className="grid-bg absolute inset-0 opacity-60" />
            <div className="relative">
              <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-5xl">See it find the root cause.</h2>
              <p className="mx-auto mt-4 max-w-xl text-ink-300">Nine steps, seven modules, one evidence-backed report. Takes about ten seconds.</p>
              <Link to="/app/investigate" className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 font-semibold text-ink-950 transition hover:bg-ink-100">
                Run the investigation <ArrowRight size={18} />
              </Link>
            </div>
          </div>
        </motion.div>
      </section>

      <footer className="border-t border-white/5">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-ink-400 sm:flex-row">
          <Logo size={22} />
          <div>Built by Anshika Chaturvedi · Data is synthetic, generated for demonstration.</div>
          <a href="https://github.com/anshika-chaturvedi-07" className="inline-flex items-center gap-1.5 hover:text-white" target="_blank" rel="noreferrer">
            <Github size={16} /> GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
