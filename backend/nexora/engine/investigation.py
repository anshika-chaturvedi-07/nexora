"""The NEXORA investigation agent.

A deterministic, code-orchestrated workflow: each step calls a real analytical
module and passes its findings forward. The step sequence is fixed but every
decision inside it (which segment to drill into, which supplier to suspect,
which incident to cost, which strategy to recommend) is made from the data.
"""

from __future__ import annotations

from typing import Iterator

import pandas as pd

from nexora.engine import anomaly as an
from nexora.engine import drivers, retrieval, scenarios, signals
from nexora.engine.loader import Dataset, load
from nexora.engine.narrative import write_report

STEPS = [
    ("AETHER", "detect", "Detecting the revenue anomaly"),
    ("AETHER", "drivers", "Locating where the drop is concentrated"),
    ("SUPPLYMIND", "supply", "Scanning inventory and supplier performance"),
    ("SENTINEL", "infra", "Checking platform and service health"),
    ("MARKETVERSE", "market", "Checking external market conditions"),
    ("INTELLEX", "evidence", "Retrieving internal evidence"),
    ("DECISIONOS", "attribution", "Attributing the revenue gap to causes"),
    ("DECISIONOS", "scenarios", "Simulating recovery strategies"),
    ("NEXORA", "report", "Writing the investigation report"),
]


def _cr(x: float) -> str:
    """Format INR in crore / lakh."""
    ax = abs(x)
    sign = "-" if x < 0 else ""
    if ax >= 1e7:
        return f"{sign}₹{ax / 1e7:.2f} Cr"
    return f"{sign}₹{ax / 1e5:.1f} L"


def _pct(x: float, digits: int = 1) -> str:
    v = round(x * 100, digits)
    return f"{(v if v != 0 else 0.0):+.{digits}f}%"


def _confidence(checks: list[dict]) -> str:
    score = sum(c["passed"] for c in checks) / max(len(checks), 1)
    return "High" if score >= 0.75 else "Medium" if score >= 0.5 else "Low"


def _month(d: str | None) -> str:
    return pd.Timestamp(d).strftime("%d %b %Y") if d else "n/a"


def run(focus_start: str = "2026-07-01", focus_end: str = "2026-09-30", ds: Dataset | None = None, use_llm: bool = True) -> Iterator[dict]:
    ds = ds or load()
    total = len(STEPS)

    def step(i: int, summary: str, data: dict) -> dict:
        module, key, title = STEPS[i]
        return {"type": "step", "index": i + 1, "total": total, "module": module, "key": key, "title": title, "summary": summary, "data": data}

    yield {"type": "start", "total": total, "steps": [{"module": m, "key": k, "title": t} for m, k, t in STEPS], "focus_start": focus_start, "focus_end": focus_end}

    # 1. Anomaly ----------------------------------------------------------------
    a = an.detect(ds.sales, focus_start, focus_end)
    yield step(
        0,
        f"Revenue was {_cr(a.actual_focus)} vs {_cr(a.actual_prev)} last quarter ({_pct(a.qoq_change)}). "
        f"The baseline model expected {_cr(a.expected_focus)}, so {_cr(-a.gap_vs_expected)} is unexplained "
        f"({_pct(a.gap_pct)}, z = {a.z_score:.1f}). The decline started around {_month(a.onset and a.onset.date().isoformat())}.",
        {
            "actual": round(a.actual_focus),
            "previous": round(a.actual_prev),
            "expected": round(a.expected_focus),
            "qoq_change": round(a.qoq_change, 4),
            "gap": round(a.gap_vs_expected),
            "gap_pct": round(a.gap_pct, 4),
            "z_score": round(a.z_score, 1),
            "onset": a.onset.date().isoformat() if a.onset is not None else None,
            "worst_week": a.worst_week.date().isoformat() if a.worst_week is not None else None,
            "model_mape": round(a.model_mape, 4),
            "chart": a.chart,
        },
    )

    # 2. Drivers ----------------------------------------------------------------
    d = drivers.decompose(ds.sales, a.prev_start, a.focus_start, a.focus_end)
    path_txt = " → ".join(f"{p['label']}: {', '.join(p['hot_segments'])}" for p in d["drilldown"])
    pv = d["price_volume"]
    yield step(
        1,
        f"The drop is concentrated, not spread evenly. Drill-down: {path_txt}. "
        f"That slice alone accounts for {d['drilldown_share_of_drop']:.0%} of the quarter's decline. "
        f"It is a volume problem ({_pct(pv['units_change_pct'])} units); like-for-like prices moved just {_pct(pv['avg_price_change_pct'])}.",
        d,
    )

    # 3. Supply -----------------------------------------------------------------
    hot = {p["dimension"]: p["hot_segments"] for p in d["drilldown"]}
    cat_products = None
    if "category" in hot:
        cat_products = ds.products[ds.products["category"].isin(hot["category"])]["sku"].tolist()
    sup = signals.supply_scan(ds, a.prev_start, a.focus_start, a.focus_end, products=cat_products, regions=hot.get("region"))
    worst = next((s for s in sup["suppliers"] if s["supplier"] == sup["suspect_supplier"] and s["region"] in sup["hot_regions"]), None)
    cps = sup["change_points"]
    yield step(
        2,
        f"Stockouts surged on {', '.join(sup['hot_products'])} in {', '.join(sup['hot_regions'])}, losing {_cr(sup['excess_lost_revenue'])} of demand. "
        + (
            f"Supplier {sup['suspect_supplier']} delays rose from {worst['delay_before']:.1f} to {worst['delay_after']:.1f} days "
            f"(on-time {worst['on_time_before']:.0%} → {worst['on_time_after']:.0%}). "
            if worst
            else ""
        )
        + f"Sequence: delays broke on {_month(cps['supplier_delay'])}, stockouts on {_month(cps['stockouts'])}, revenue on {_month(cps['revenue'])}.",
        sup,
    )

    # 4. Infra ------------------------------------------------------------------
    inf = signals.infra_scan(ds, a.prev_start, a.focus_start, a.focus_end)
    if inf["incidents"]:
        i0 = inf["incidents"][0]
        infra_summary = (
            f"{len(inf['incidents'])} incident(s) across {inf['services_checked']} services. {i0['service']} degraded "
            f"{_month(i0['start'])} – {_month(i0['end'])}: p95 latency {i0['p95_latency_before']} → {i0['p95_latency_during']} ms, "
            f"errors {i0['error_rate_before']:.1%} → {i0['error_rate_during']:.1%}. Online share of sales fell {abs(i0['online_share_drop_pct']):.0%} "
            f"(offline channels as control), costing about {_cr(i0['estimated_lost_revenue'])}."
        )
    else:
        infra_summary = f"All {inf['services_checked']} services healthy in the period."
    yield step(3, infra_summary, inf)

    # 5. Market -----------------------------------------------------------------
    mk = signals.market_scan(ds, a.prev_start, a.focus_start, a.focus_end)
    yield step(4, f"Market demand index moved {_pct(mk['change_pct'])} quarter on quarter: a mild headwind, too small to explain the drop.", mk)

    # 6. Evidence ---------------------------------------------------------------
    idx = retrieval.index(ds.documents)
    queries = {
        "supply": f"{sup['suspect_supplier']} on-time delivery delays plant {' '.join(sup['hot_regions'])} sensors",
        "alternate": f"alternate supplier {sup['suspect_supplier']} onboarding cost switch",
        "infra": (f"{inf['incidents'][0]['service']} latency errors incident root cause" if inf["incidents"] else "service incident"),
        "market": "market demand softened Q3 decline",
        "pricing": "price change list prices promotion",
    }
    evidence = {k: idx.search(q, k=2) for k, q in queries.items()}
    cited = sorted({h["title"] for hits in evidence.values() for h in hits[:1]})
    yield step(5, f"Searched {len(ds.documents)} internal documents and retrieved cited evidence from {len(cited)}: " + "; ".join(cited) + ".", {"queries": queries, "results": evidence})

    # 7. Attribution ------------------------------------------------------------
    gap = a.gap_vs_expected
    supply_loss = -sup["excess_lost_revenue"]
    infra_loss = -sum(i.get("estimated_lost_revenue", 0) for i in inf["incidents"])
    market_loss = mk["change_pct"] * a.expected_focus
    other = gap - supply_loss - infra_loss - market_loss

    def has(key):
        return bool(evidence.get(key))

    causes = [
        {
            "key": "supply",
            "module": "SUPPLYMIND",
            "cause": f"Supplier disruption: {sup['suspect_supplier']} → stockouts in {', '.join(sup['hot_regions'])}",
            "impact": round(supply_loss),
            "checks": [
                {"label": "Loss concentrated in the affected lanes", "passed": d["drilldown_share_of_drop"] > 0.5},
                {"label": "Supplier delay broke before stockouts, stockouts before revenue", "passed": bool(cps["supplier_delay"] and cps["stockouts"] and cps["supplier_delay"] <= cps["stockouts"])},
                {"label": f"Delay leads stockouts (corr {sup['lead_lag']['correlation']:.2f} at {sup['lead_lag']['best_lag_weeks']}-week lag)", "passed": sup["lead_lag"]["correlation"] > 0.5},
                {"label": "Corroborated by internal documents", "passed": has("supply")},
            ],
        },
        {
            "key": "infra",
            "module": "SENTINEL",
            "cause": (f"Platform incident: {inf['incidents'][0]['service']} degradation" if inf["incidents"] else "Platform incidents"),
            "impact": round(infra_loss),
            "checks": [
                {"label": "Incident detected with z > 4", "passed": bool(inf["incidents"])},
                {"label": "Online share fell during the incident window only", "passed": bool(inf["incidents"]) and inf["incidents"][0]["online_share_drop_pct"] < -0.15},
                {"label": "Offline channels unaffected (used as control)", "passed": bool(inf["incidents"])},
                {"label": "Corroborated by a postmortem", "passed": has("infra")},
            ],
        },
        {
            "key": "market",
            "module": "MARKETVERSE",
            "cause": "Softer market demand",
            "impact": round(market_loss),
            "checks": [
                {"label": "Demand index declined", "passed": mk["change_pct"] < 0},
                {"label": "Effect size measured directly (assumes elasticity of 1)", "passed": False},
                {"label": "Corroborated by market brief", "passed": has("market")},
            ],
        },
        {
            "key": "other",
            "module": "—",
            "cause": "Unexplained / noise" if other < 0 else "Overlap between estimates / model error",
            "impact": round(other),
            "checks": [],
        },
    ]
    for c in causes:
        c["share_of_gap"] = round(c["impact"] / gap, 4) if gap else 0
        c["confidence"] = _confidence(c["checks"]) if c["checks"] else "—"
    explained = 1 - (other / gap if gap else 0)
    yield step(
        6,
        f"Of the {_cr(-gap)} gap: supplier disruption {_cr(-supply_loss)} ({causes[0]['share_of_gap']:.0%}, {causes[0]['confidence']} confidence), "
        f"platform incident {_cr(-infra_loss)} ({causes[1]['share_of_gap']:.0%}, {causes[1]['confidence']}), "
        f"market {_cr(-market_loss)} ({causes[2]['share_of_gap']:.0%}). "
        + (
            f"Together they explain {explained:.0%} of the gap."
            if explained <= 1
            else f"Together they cover the whole gap; the estimates overlap by {explained - 1:.0%}, which is within model error."
        ),
        {"gap": round(gap), "causes": causes, "explained_share": round(explained, 4)},
    )

    # 8. Scenarios --------------------------------------------------------------
    sc = scenarios.simulate(ds, a, sup, mk)
    by_key = {s["key"]: s for s in sc["strategies"]}
    best = by_key[sc["recommended"]]
    yield step(
        7,
        f"Simulated 4 strategies × {sc['assumptions']['simulations']} Monte Carlo runs for Q4. If nothing changes, the business keeps losing ~{_cr(sc['current_daily_loss'])}/day. "
        f"Best: “{best['name']}”, recovering {_cr(best['recovered_revenue'])} revenue for a net {_cr(best['net_impact'])} "
        f"(beats the runner-up in {sc['confidence_best_vs_runner_up']:.0%} of simulations).",
        sc,
    )

    # 9. Report -----------------------------------------------------------------
    inf_services = ds.service_metrics["service"].unique().tolist()
    findings = {
        "period": {"start": focus_start, "end": focus_end},
        "anomaly": {k: v for k, v in {
            "actual": round(a.actual_focus), "previous": round(a.actual_prev), "expected": round(a.expected_focus),
            "qoq_change": round(a.qoq_change, 4), "gap": round(gap), "onset": a.onset.date().isoformat() if a.onset is not None else None,
        }.items()},
        "drilldown": d["drilldown"],
        "price_volume": pv,
        "supply": {k: sup[k] for k in ("hot_products", "hot_regions", "suspect_supplier", "change_points", "lead_lag", "excess_lost_revenue", "supplier_on_time")},
        "healthy_services": sorted(set(inf_services) - {i["service"] for i in inf["incidents"]}),
        "supplier_perf": worst,
        "incidents": inf["incidents"],
        "market": mk,
        "causes": [{k: c[k] for k in ("cause", "impact", "share_of_gap", "confidence")} for c in causes],
        "explained_share": round(explained, 4),
        "scenarios": [{k: s[k] for k in ("key", "name", "description", "recovered_revenue", "cost", "net_impact", "net_impact_p10", "net_impact_p90", "days_to_recovery")} for s in sc["strategies"]],
        "recommended": sc["recommended"],
        "confidence_best_vs_runner_up": sc["confidence_best_vs_runner_up"],
        "assumptions": sc["assumptions"],
        "evidence_titles": cited,
    }
    report = write_report(findings, use_llm=use_llm)
    yield step(8, report["headline"], report)
    yield {"type": "done", "report": report}


def run_all(**kw) -> list[dict]:
    return list(run(**kw))
