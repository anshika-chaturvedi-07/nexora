// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = any;

export interface StepEvent {
  type: "step";
  index: number;
  total: number;
  module: string;
  key: string;
  title: string;
  summary: string;
  data: Json;
}

export interface StartEvent {
  type: "start";
  total: number;
  steps: { module: string; key: string; title: string }[];
  focus_start: string;
  focus_end: string;
}

export type InvestigationEvent =
  | StartEvent
  | StepEvent
  | { type: "thinking"; index: number; module: string; title: string }
  | { type: "done"; report: Report };

export interface Report {
  headline: string;
  summary: string;
  findings: string[];
  recommendation: string;
  ruled_out: string[];
  next_steps: string[];
  evidence: string[];
  explained_share: number;
  author: string;
}

export async function getJSON<T = Json>(path: string): Promise<T> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

export async function postJSON<T = Json>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

export function streamInvestigation(onEvent: (e: InvestigationEvent) => void, delay = 1.1, onError?: () => void): () => void {
  const es = new EventSource(`/api/investigation/stream?delay=${delay}`);
  let finished = false;
  es.onmessage = (m) => {
    const e = JSON.parse(m.data) as InvestigationEvent;
    onEvent(e);
    if (e.type === "done") { finished = true; es.close(); }
  };
  es.onerror = () => {
    es.close();
    if (!finished) onError?.();
  };
  return () => { finished = true; es.close(); };
}

export function inr(x: number | null | undefined, digits = 2): string {
  if (x == null || Number.isNaN(x)) return "—";
  const ax = Math.abs(x);
  const sign = x < 0 ? "-" : "";
  if (ax >= 1e7) return `${sign}₹${(ax / 1e7).toFixed(digits)} Cr`;
  if (ax >= 1e5) return `${sign}₹${(ax / 1e5).toFixed(1)} L`;
  return `${sign}₹${Math.round(ax).toLocaleString("en-IN")}`;
}

export function pct(x: number | null | undefined, digits = 1, signed = true): string {
  if (x == null || Number.isNaN(x)) return "—";
  const r = Number((x * 100).toFixed(digits));
  const v = (r === 0 ? 0 : r).toFixed(digits); // avoid "-0.0%"
  return `${signed && r > 0 ? "+" : ""}${v}%`;
}

export function shortDate(s: string): string {
  return new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export const MODULES: Record<string, { color: string; label: string; blurb: string }> = {
  AETHER: { color: "#a78bfa", label: "Business Intelligence", blurb: "Baseline models, anomaly detection and driver decomposition." },
  SUPPLYMIND: { color: "#fbbf24", label: "Supply Chain Intelligence", blurb: "Inventory, stockouts, supplier delays and lead-lag analysis." },
  SENTINEL: { color: "#22d3ee", label: "Infrastructure Intelligence", blurb: "Service health incidents and their measured revenue impact." },
  INTELLEX: { color: "#34d399", label: "Knowledge Intelligence", blurb: "Retrieves cited evidence from internal documents." },
  MARKETVERSE: { color: "#fb7185", label: "Market Intelligence", blurb: "External demand context to separate market from execution." },
  DECISIONOS: { color: "#e879f9", label: "Decision Intelligence", blurb: "Causal attribution and Monte Carlo strategy simulation." },
  CYBERPULSE: { color: "#94a3b8", label: "Security Intelligence", blurb: "Authentication anomalies and threat correlation (roadmap)." },
  NEXORA: { color: "#ececf6", label: "Orchestrator", blurb: "Runs the investigation and writes the report." },
};
