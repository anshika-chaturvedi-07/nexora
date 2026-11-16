import { useId, type ReactNode } from "react";
import { MODULES } from "../lib/api";

export function Logo({ size = 28 }: { size?: number }) {
  const gid = `lg${useId().replace(/:/g, "")}`;
  return (
    <div className="flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8b5cf6" />
            <stop offset="1" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="16" fill="#11111d" stroke="rgba(255,255,255,0.08)" />
        <circle cx="32" cy="32" r="15" fill="none" stroke={`url(#${gid})`} strokeWidth="5" />
        <circle cx="32" cy="32" r="5" fill={`url(#${gid})`} />
        <circle cx="50" cy="16" r="4" fill="#22d3ee" />
      </svg>
      <span className="font-display text-lg font-semibold tracking-[0.18em]">NEXORA</span>
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`glass rounded-2xl ${className}`}>{children}</div>;
}

export function ModuleBadge({ module, className = "" }: { module: string; className?: string }) {
  const m = MODULES[module] ?? MODULES.NEXORA;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[10.5px] font-medium tracking-wider ${className}`}
      style={{ color: m.color, background: `${m.color}18`, border: `1px solid ${m.color}33` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.color }} />
      {module}
    </span>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "up" | "down" | "neutral" }) {
  const toneCls = tone === "down" ? "text-rose" : tone === "up" ? "text-emerald" : "text-ink-400";
  return (
    <Card className="p-5">
      <div className="text-xs font-medium uppercase tracking-wider text-ink-400">{label}</div>
      <div className="mt-2 font-display text-[28px] font-semibold leading-none tracking-tight">{value}</div>
      {sub && <div className={`mt-2 text-xs ${toneCls}`}>{sub}</div>}
    </Card>
  );
}

export function SectionTitle({ eyebrow, title, children }: { eyebrow?: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      {eyebrow && <div className="font-mono text-xs uppercase tracking-[0.25em] text-cyan">{eyebrow}</div>}
      <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-5xl">{title}</h2>
      {children && <p className="mt-4 text-base text-ink-300 sm:text-lg">{children}</p>}
    </div>
  );
}

export function Confidence({ level }: { level: string }) {
  const c = level === "High" ? "#34d399" : level === "Medium" ? "#fbbf24" : level === "Low" ? "#fb7185" : "#8a8aa8";
  return (
    <span className="rounded-md px-2 py-0.5 text-[11px] font-semibold" style={{ color: c, background: `${c}1a` }}>
      {level}
    </span>
  );
}

export const tooltipStyle = {
  contentStyle: { background: "#11111d", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12, color: "#ececf6" },
  labelStyle: { color: "#b4b4cc" },
  itemStyle: { color: "#ececf6" },
};
