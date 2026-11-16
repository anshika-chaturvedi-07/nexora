import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Database, LayoutDashboard, Menu, SearchCode, SlidersHorizontal, X } from "lucide-react";
import { Logo } from "../components/ui";
import { getJSON } from "../lib/api";

const NAV = [
  { to: "/app", label: "Command center", icon: LayoutDashboard, end: true },
  { to: "/app/investigate", label: "Investigate", icon: SearchCode },
  { to: "/app/scenarios", label: "Scenario lab", icon: SlidersHorizontal },
  { to: "/app/data", label: "Data & documents", icon: Database },
];

export default function AppLayout() {
  const [open, setOpen] = useState(false);
  const [health, setHealth] = useState<{ status: string; llm_enabled: boolean } | null>(null);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    getJSON("/api/health").then(setHealth).catch(() => setHealth({ status: "down", llm_enabled: false }));
  }, []);

  const sidebar = (
    <div className="flex h-full flex-col">
      <Link to="/" className="px-2 py-1"><Logo size={26} /></Link>
      <div className="mt-6 rounded-xl border border-white/5 bg-white/[0.02] p-3">
        <div className="text-[11px] uppercase tracking-wider text-ink-400">Workspace</div>
        <div className="mt-1 text-sm font-medium">Veltrix Industries</div>
        <div className="text-xs text-ink-400">Synthetic demo dataset</div>
      </div>
      <nav className="mt-6 space-y-1">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${isActive ? "bg-white/[0.07] text-white" : "text-ink-300 hover:bg-white/[0.04] hover:text-white"}`
            }
          >
            <n.icon size={17} />
            {n.label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto space-y-2 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-ink-400">Engine</span>
          <span className={health?.status === "ok" ? "text-emerald" : "text-rose"}>{health ? (health.status === "ok" ? "● Online" : "● Offline") : "…"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-ink-400">AI summary</span>
          <span className={health?.llm_enabled ? "text-emerald" : "text-ink-400"}>{health?.llm_enabled ? "Claude" : "Template"}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-40 left-1/3 h-[420px] w-[620px] rounded-full bg-violet/10 blur-[140px]" />
      </div>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-white/5 bg-ink-950/80 p-4 backdrop-blur-xl lg:block">{sidebar}</aside>
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-white/5 bg-ink-950/80 px-4 py-3 backdrop-blur-xl lg:hidden">
        <Link to="/"><Logo size={24} /></Link>
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="rounded-lg p-2 hover:bg-white/5"><Menu size={20} /></button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-white/5 bg-ink-950 p-4">
            <button onClick={() => setOpen(false)} aria-label="Close menu" className="absolute right-3 top-3 rounded-lg p-2 hover:bg-white/5"><X size={18} /></button>
            {sidebar}
          </aside>
        </div>
      )}
      <main className="relative px-4 py-6 sm:px-6 lg:ml-64 lg:px-10 lg:py-8">
        <Outlet />
      </main>
    </div>
  );
}
