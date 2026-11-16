"""Turns computed findings into an investigation report.

The template writer is always available and is the source of truth for every
number. If ANTHROPIC_API_KEY is set, Claude rewrites the executive summary in
plain business language, grounded strictly in the findings JSON. Any API
failure falls back silently to the template.
"""

from __future__ import annotations

import json
import os

import pandas as pd


def _cr(x: float) -> str:
    ax, sign = abs(x), "-" if x < 0 else ""
    return f"{sign}₹{ax / 1e7:.2f} Cr" if ax >= 1e7 else f"{sign}₹{ax / 1e5:.1f} L"


def _p(x: float) -> str:
    v = round(x * 100, 1)
    return f"{(v if v != 0 else 0.0):+.1f}%"


def _d(s: str | None) -> str:
    return pd.Timestamp(s).strftime("%d %b") if s else "n/a"


def template_report(f: dict) -> dict:
    a, sup, causes = f["anomaly"], f["supply"], f["causes"]
    best = next(s for s in f["scenarios"] if s["key"] == f["recommended"])
    sp = f.get("supplier_perf") or {}
    inc = f["incidents"][0] if f["incidents"] else None
    period = pd.Timestamp(f["period"]["start"])
    q = f"Q{(period.month - 1) // 3 + 1} {period.year}"

    headline = (
        f"{q} revenue fell {abs(a['qoq_change']):.1%}, driven mainly by {sup['suspect_supplier']} delays that caused stockouts "
        f"in {' & '.join(sup['hot_regions'])}"
        + (f", compounded by a {inc['days']}-day {inc['service']} incident." if inc else ".")
    )
    summary = (
        f"Revenue was {_cr(a['actual'])} in {q}, {abs(a['qoq_change']):.1%} below the previous quarter and "
        f"{_cr(-a['gap'])} below what the baseline model expected. {causes[0]['share_of_gap']:.0%} of that gap traces to "
        f"{sup['suspect_supplier']}: its deliveries to the {' and '.join(sup['hot_regions'])} distribution "
        f"{'centres' if len(sup['hot_regions']) > 1 else 'centre'} slipped from "
        f"~{sp.get('delay_before', 0):.0f} to ~{sp.get('delay_after', 0):.0f} days late, which caused repeated stockouts of "
        f"{', '.join(sup['hot_products'])}. "
        + (
            f"A further {causes[1]['share_of_gap']:.0%} came from the {inc['service']} incident ({_d(inc['start'])}–{_d(inc['end'])}), "
            f"when online checkout errors pushed customers away. "
            if inc
            else ""
        )
        + f"Softer market demand accounts for roughly {causes[2]['share_of_gap']:.0%}. Like-for-like prices were flat "
        f"({_p(f['price_volume']['avg_price_change_pct'])}), so this is a volume problem, not a pricing one."
    )
    findings = [
        f"{c['cause']}: {_cr(-c['impact'])} ({c['share_of_gap']:.0%} of the gap, {c['confidence']} confidence)"
        for c in causes
        if c["confidence"] != "—"
    ]
    recommendation = (
        f"{best['name']}. {best['description']} Expected to recover {_cr(best['recovered_revenue'])} of Q4 revenue "
        f"for a net benefit of {_cr(best['net_impact'])} (P10–P90: {_cr(best['net_impact_p10'])} to {_cr(best['net_impact_p90'])}) "
        f"after {_cr(best['cost'])} of extra cost."
    )
    others = {k: v for k, v in sup.get("supplier_on_time", {}).items() if k != sup["suspect_supplier"]}
    ruled_out = [
        f"Pricing: like-for-like prices moved {_p(f['price_volume']['avg_price_change_pct'])}; the drop is {_p(f['price_volume']['units_change_pct'])} in units.",
    ]
    if f.get("healthy_services"):
        ruled_out.append(f"Other services: {', '.join(f['healthy_services'])} stayed within normal ranges.")
    if others:
        ruled_out.append(
            f"Other suppliers: {', '.join(sorted(others))} kept on-time delivery at {min(others.values()):.0%} or better."
        )
    next_steps = [
        f"Activate the alternate sensor supplier for {' & '.join(sup['hot_regions'])} and start stock transfers this week.",
        f"Claim SLA penalty credits from {sup['suspect_supplier']} for missed on-time targets.",
        "Add a load-test gate to the release pipeline (postmortem follow-up) and alert on online-share drops.",
        "Add early-warning alerts on supplier delay and stockout rates so the next disruption is caught in days, not a quarter.",
    ]
    return {
        "headline": headline,
        "summary": summary,
        "findings": findings,
        "recommendation": recommendation,
        "ruled_out": ruled_out,
        "next_steps": next_steps,
        "evidence": f["evidence_titles"],
        "explained_share": f["explained_share"],
        "author": "NEXORA template writer",
    }


SYSTEM = (
    "You are the reporting layer of NEXORA, an enterprise investigation system. You receive findings computed "
    "by statistical models. Write for a busy executive. Use ONLY numbers present in the findings JSON; never invent "
    "figures, dates, names or causes. Express money in Indian rupees using crore (Cr) or lakh (L) as the input does. "
    "Return JSON with keys: headline (one sentence, max 30 words) and summary (one paragraph, max 110 words)."
)


def llm_summary(findings: dict, draft: dict) -> dict | None:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return None
    try:
        import anthropic
    except ImportError:
        return None
    try:
        client = anthropic.Anthropic(max_retries=1, timeout=45)
        resp = client.beta.messages.create(
            model="claude-opus-5-5",
            max_tokens=2000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            output_config={"effort": "low"},
            system=SYSTEM,
            messages=[
                {
                    "role": "user",
                    "content": "Findings JSON:\n" + json.dumps(findings, default=str) + "\n\nDraft (for reference, numbers are correct):\n"
                    + json.dumps({"headline": draft["headline"], "summary": draft["summary"]}),
                }
            ],
        )
        if resp.stop_reason == "refusal":
            return None
        text = "".join(b.text for b in resp.content if b.type == "text").strip()
        start, end = text.find("{"), text.rfind("}")
        data = json.loads(text[start : end + 1])
        if isinstance(data.get("headline"), str) and isinstance(data.get("summary"), str):
            return {"headline": data["headline"], "summary": data["summary"]}
    except (anthropic.AuthenticationError, anthropic.RateLimitError, anthropic.APIStatusError, anthropic.APIConnectionError):
        return None
    except (ValueError, KeyError):
        return None
    return None


def write_report(findings: dict, use_llm: bool = True) -> dict:
    report = template_report(findings)
    if use_llm:
        llm = llm_summary(findings, report)
        if llm:
            report.update(llm)
            report["author"] = "Claude (claude-opus-5-5), grounded in NEXORA findings"
    return report
