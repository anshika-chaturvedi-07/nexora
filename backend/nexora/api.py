"""NEXORA HTTP API (FastAPI)."""

from __future__ import annotations

import asyncio
import json
import math
import os
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from nexora.engine import anomaly as an
from nexora.engine import investigation, retrieval, scenarios, signals
from nexora.engine.loader import load

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except ImportError:  # pragma: no cover
    pass

FOCUS_START, FOCUS_END = "2026-07-01", "2026-09-30"

app = FastAPI(title="NEXORA API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def clean(obj):
    """Make analysis output JSON-safe (numpy scalars, NaN, timestamps)."""
    if isinstance(obj, dict):
        return {str(k): clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [clean(v) for v in obj]
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating, float)):
        f = float(obj)
        return None if math.isnan(f) or math.isinf(f) else f
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    if isinstance(obj, (pd.Timestamp,)):
        return obj.date().isoformat()
    return obj


_events: list[dict] | None = None
_lock = asyncio.Lock()


async def investigation_events() -> list[dict]:
    global _events
    async with _lock:
        if _events is None:
            events = await asyncio.to_thread(investigation.run_all, focus_start=FOCUS_START, focus_end=FOCUS_END)
            _events = [clean(e) for e in events]
    return _events


@app.get("/api/health")
def health():
    return {"status": "ok", "llm_enabled": bool(os.environ.get("ANTHROPIC_API_KEY"))}


@lru_cache(maxsize=1)
def _overview() -> dict:
    ds = load()
    s = ds.sales
    rev = an.daily_revenue(s)
    monthly = rev.resample("MS").sum()
    fs, fe = pd.Timestamp(FOCUS_START), pd.Timestamp(FOCUS_END)
    ps = pd.Timestamp("2026-04-01")
    q_now = s[(s["date"] >= fs) & (s["date"] <= fe)]
    q_prev = s[(s["date"] >= ps) & (s["date"] < fs)]
    base = an.fit_baseline(rev, fs)
    q4 = pd.date_range(fe + pd.Timedelta(days=1), periods=92)
    inf = signals.infra_scan(ds, ps, fs, fe)
    sup = signals.supply_scan(ds, ps, fs, fe)
    by_cat = (
        pd.DataFrame({"now": q_now.groupby("category")["revenue"].sum(), "prev": q_prev.groupby("category")["revenue"].sum()})
        .assign(change=lambda t: t["now"] / t["prev"] - 1)
        .sort_values("now", ascending=False)
    )
    by_region = q_now.groupby("region")["revenue"].sum().sort_values(ascending=False)
    by_channel = q_now.groupby("channel")["revenue"].sum().sort_values(ascending=False)
    alerts = [
        {"severity": "critical", "module": "AETHER", "title": "Revenue below expected range", "detail": "Q3 revenue is outside the model's 95% band for 8+ weeks."},
        *[
            {"severity": "high", "module": "SUPPLYMIND", "title": f"Stockouts: {h['product']} · {h['region']}", "detail": f"Out of stock {h['stockout_days_focus_pct']:.0%} of days in Q3."}
            for h in sup["hotspots"][:4]
        ],
        *[
            {"severity": "high", "module": "SENTINEL", "title": f"{i['service']} incident", "detail": f"{i['start']} → {i['end']}, p95 {i['p95_latency_during']} ms."}
            for i in inf["incidents"]
        ],
    ]
    return clean(
        {
            "company": "Veltrix Industries (synthetic)",
            "period": {"start": FOCUS_START, "end": FOCUS_END, "label": "Q3 2026"},
            "kpis": {
                "revenue": float(q_now["revenue"].sum()),
                "revenue_prev": float(q_prev["revenue"].sum()),
                "units": int(q_now["units"].sum()),
                "units_prev": int(q_prev["units"].sum()),
                "q4_forecast_healthy": float(base.expected(q4).sum()),
                "active_alerts": len(alerts),
                "data_sources": 6,
                "documents": len(ds.documents),
            },
            "monthly": [{"month": d.strftime("%b %y"), "revenue": float(v)} for d, v in monthly.items()],
            "by_category": [{"category": k, "revenue": float(r.now), "change": float(r.change)} for k, r in by_cat.iterrows()],
            "by_region": [{"region": k, "revenue": float(v)} for k, v in by_region.items()],
            "by_channel": [{"channel": k, "revenue": float(v)} for k, v in by_channel.items()],
            "alerts": alerts,
        }
    )


@app.get("/api/overview")
def overview():
    return _overview()


@app.get("/api/investigation")
async def investigation_full():
    events = await investigation_events()
    return {"events": events}


@app.get("/api/investigation/stream")
async def investigation_stream(delay: float = Query(1.1, ge=0, le=5)):
    events = await investigation_events()

    async def gen():
        for e in events:
            if e["type"] == "step":
                yield f"data: {json.dumps({'type': 'thinking', 'index': e['index'], 'module': e['module'], 'title': e['title']})}\n\n"
                await asyncio.sleep(delay)
            yield f"data: {json.dumps(e)}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


class ScenarioRequest(BaseModel):
    onboarding_days: int = Field(21, ge=7, le=90)
    rebalance_share: float = Field(0.45, ge=0, le=0.9)
    switch_supplier: bool = True


@app.post("/api/scenario")
async def scenario(req: ScenarioRequest):
    def compute():
        ds = load()
        a = an.detect(ds.sales, FOCUS_START, FOCUS_END)
        prev = a.prev_start
        sup = signals.supply_scan(ds, prev, a.focus_start, a.focus_end, products=["SNS-100", "SNS-220"], regions=["North", "West"])
        mk = signals.market_scan(ds, prev, a.focus_start, a.focus_end)
        custom = scenarios.custom_strategy(req.onboarding_days, req.rebalance_share, req.switch_supplier)
        return scenarios.simulate(ds, a, sup, mk, strategies=[scenarios.DEFAULT_STRATEGIES[0], custom], seed=11)

    return clean(await asyncio.to_thread(compute))


@app.get("/api/datasets")
def datasets():
    ds = load()
    tables = {
        "sales": ("Daily sales by region, channel and product", ds.sales),
        "inventory": ("Daily stock on hand, demand and fulfilment per DC", ds.inventory),
        "shipments": ("Supplier replenishment orders and delivery delays", ds.shipments),
        "service_metrics": ("Daily p95 latency and error rate per service", ds.service_metrics),
        "market": ("Industry demand index", ds.market),
        "products": ("Product catalogue", ds.products),
    }
    return clean(
        {
            "tables": [
                {
                    "name": name,
                    "description": desc,
                    "rows": len(df),
                    "columns": [{"name": c, "dtype": str(df[c].dtype)} for c in df.columns],
                    "preview": json.loads(df.head(6).to_json(orient="records", date_format="iso")),
                }
                for name, (desc, df) in tables.items()
            ],
            "documents": [{"name": k, "title": v.splitlines()[0].lstrip("# ").strip(), "chars": len(v)} for k, v in ds.documents.items()],
        }
    )


@app.get("/api/documents/search")
def doc_search(q: str = Query(..., min_length=2, max_length=200)):
    ds = load()
    return {"query": q, "results": retrieval.index(ds.documents).search(q, k=5, min_score=0.02)}


# Serve the built website (used by the Docker image)
DIST = Path(os.environ.get("NEXORA_WEB_DIST", Path(__file__).resolve().parents[2] / "frontend" / "dist"))
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        target = DIST / path
        if path and target.is_file():
            return FileResponse(target)
        return FileResponse(DIST / "index.html")
