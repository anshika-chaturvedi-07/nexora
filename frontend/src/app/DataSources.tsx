import { useEffect, useState } from "react";
import { FileText, Search, Table2 } from "lucide-react";
import { Card, ModuleBadge } from "../components/ui";
import { getJSON, type Json } from "../lib/api";
import { ErrorBox, Loading, PageHeader } from "./Overview";

export default function DataSources() {
  const [data, setData] = useState<Json | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [active, setActive] = useState("sales");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Json[] | null>(null);

  useEffect(() => {
    getJSON("/api/datasets").then(setData).catch((e) => setErr(String(e.message)));
  }, []);

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim().length < 2) return;
    getJSON(`/api/documents/search?q=${encodeURIComponent(q)}`).then((r) => setHits(r.results)).catch(() => setHits([]));
  };

  if (err) return <ErrorBox error={err} />;
  if (!data) return <><PageHeader title="Data & documents" /><Loading /></>;
  const table = data.tables.find((t: Json) => t.name === active);

  return (
    <div>
      <PageHeader title="Data & documents" sub="Everything NEXORA reads. All data is synthetic, produced by a mechanistic simulation of the company." />
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {data.tables.map((t: Json) => (
          <button key={t.name} onClick={() => setActive(t.name)} className={`glass rounded-2xl p-4 text-left transition ${active === t.name ? "ring-1 ring-violet/60" : "hover:border-white/15"}`}>
            <Table2 size={16} className="text-violet" />
            <div className="mt-2 font-mono text-sm">{t.name}</div>
            <div className="text-xs text-ink-400">{t.rows.toLocaleString("en-IN")} rows</div>
          </button>
        ))}
      </div>

      {table && (
        <Card className="mt-4 p-5">
          <div className="font-medium">{table.name}</div>
          <div className="text-sm text-ink-400">{table.description}</div>
          <div className="scrollbar-thin mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  {table.columns.map((c: Json) => (
                    <th key={c.name} className="whitespace-nowrap px-3 py-2 font-medium">
                      {c.name}
                      <div className="font-mono text-[10px] font-normal text-ink-400">{c.dtype}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.preview.map((row: Json, i: number) => (
                  <tr key={i} className="border-t border-white/5">
                    {table.columns.map((c: Json) => (
                      <td key={c.name} className="whitespace-nowrap px-3 py-2 font-mono text-xs text-ink-300">{String(row[c.name] ?? "").replace("T00:00:00.000", "")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 font-medium">Internal documents</div>
          <ul className="space-y-2">
            {data.documents.map((d: Json) => (
              <li key={d.name} className="flex items-center gap-3 rounded-xl bg-white/[0.02] px-3 py-2.5 text-sm">
                <FileText size={15} className="text-emerald" />
                <span className="flex-1">{d.title}</span>
                <span className="font-mono text-[10px] text-ink-400">{d.name}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="font-medium">Search documents</div>
            <ModuleBadge module="INTELLEX" />
          </div>
          <form onSubmit={search} className="flex gap-2">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. why were sensors late?" className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm outline-none placeholder:text-ink-400 focus:border-violet/50" />
            </div>
            <button className="rounded-xl bg-white px-4 text-sm font-semibold text-ink-950">Search</button>
          </form>
          <div className="mt-4 space-y-2">
            {hits?.length === 0 && <div className="text-sm text-ink-400">No matching passages.</div>}
            {hits?.map((h, i) => (
              <div key={i} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                <div className="flex justify-between text-sm font-medium"><span>{h.title}</span><span className="font-mono text-[10px] text-ink-400">{h.score}</span></div>
                <p className="mt-1 whitespace-pre-line text-xs text-ink-300">{h.text}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
