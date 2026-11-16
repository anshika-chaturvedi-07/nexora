"""DECISIONOS: forward simulation of recovery strategies with Monte Carlo uncertainty.

Every assumption is explicit and returned with the results so the UI can show it.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np
import pandas as pd

from nexora.engine.anomaly import daily_revenue, fit_baseline


@dataclass
class Assumptions:
    gross_margin: float = 0.40  # contribution margin on recovered revenue
    alt_supplier_premium: float = 0.06  # Arcwell unit-cost premium (from supply agreement)
    cogs_share: float = 0.60  # cost of goods as share of price
    transit_days: int = 7  # first shipment transit after onboarding
    rebalance_cost_share: float = 0.03  # logistics cost as share of rebalanced revenue
    rebalance_lead_days: int = 5
    simulations: int = 600


@dataclass
class Strategy:
    key: str
    name: str
    description: str
    switch_supplier: bool = False
    onboarding_days: int = 21
    rebalance_share: float = 0.0  # share of the lost demand recovered by moving stock from healthy regions
    supplier_recovers_day: int | None = None  # day index when the original supplier recovers (None = not in horizon)


DEFAULT_STRATEGIES = [
    Strategy("do_nothing", "Wait it out", "Keep the current supplier and wait for its plant to recover."),
    Strategy(
        "rebalance",
        "Rebalance stock",
        "Move sensor inventory from healthy South & East DCs to the North & West DCs every week.",
        rebalance_share=0.45,
    ),
    Strategy(
        "switch",
        "Switch to alternate supplier",
        "Activate the pre-qualified alternate supplier for the affected lanes (≈21 days onboarding, +6% unit cost).",
        switch_supplier=True,
    ),
    Strategy(
        "combined",
        "Rebalance now + switch supplier",
        "Rebalance stock immediately to stop the bleeding, while onboarding the alternate supplier.",
        switch_supplier=True,
        rebalance_share=0.45,
    ),
]


def _lane_rates(ds, hot_products, hot_regions, focus_end, window_days=28):
    inv = ds.inventory
    price = ds.products.set_index("sku")["price"] * 1.03
    lane = inv[inv["product"].isin(hot_products) & inv["region"].isin(hot_regions)]
    recent = lane[(lane["date"] > focus_end - pd.Timedelta(days=window_days)) & (lane["date"] <= focus_end)]
    lost = ((recent["demand_units"] - recent["fulfilled_units"]) * recent["product"].map(price)).sum() / window_days
    demand_value = (recent["demand_units"] * recent["product"].map(price)).sum() / window_days
    return float(lost), float(demand_value)


def _loss_multiplier(strategy: Strategy, days: int, onboarding: int, a: Assumptions) -> np.ndarray:
    """Fraction of the current daily loss still being incurred on each day of the horizon."""
    m = np.ones(days)
    if strategy.rebalance_share:
        m[a.rebalance_lead_days :] *= 1 - strategy.rebalance_share
    if strategy.switch_supplier:
        m[min(days, onboarding + a.transit_days) :] = 0.0
    if strategy.supplier_recovers_day is not None:
        m[min(days, strategy.supplier_recovers_day) :] = 0.0
    return m


def simulate(ds, anomaly, supply, market, strategies=None, assumptions: Assumptions | None = None, seed: int = 7) -> dict:
    a = assumptions or Assumptions()
    strategies = strategies or DEFAULT_STRATEGIES
    rng = np.random.default_rng(seed)

    fe = anomaly.focus_end
    horizon = pd.date_range(fe + pd.Timedelta(days=1), periods=92, freq="D")
    rev = daily_revenue(ds.sales)
    base = fit_baseline(rev, anomaly.focus_start)  # "healthy world" model
    healthy = base.expected(horizon) * (1 + market["change_pct"])
    loss_day, lane_demand_day = _lane_rates(ds, supply["hot_products"], supply["hot_regions"], fe)

    n, days = a.simulations, len(horizon)
    noise = rng.normal(0, base.sigma, size=(n, days))
    loss_scale = rng.normal(1.0, 0.2, size=(n, 1)).clip(0.4, 1.6)
    onboard_draw = rng.normal(0, 5, size=n).round().astype(int)

    results = []
    weekly_paths = {}
    for s in strategies:
        totals, costs = np.empty(n), np.empty(n)
        for i in range(n):
            ob = max(7, s.onboarding_days + onboard_draw[i])
            mult = _loss_multiplier(s, days, ob, a)
            daily_loss = loss_day * loss_scale[i, 0] * mult
            daily = healthy * np.exp(noise[i] - base.sigma**2 / 2) - daily_loss
            totals[i] = daily.sum()
            cost = 0.0
            if s.switch_supplier:
                switched_days = max(0, days - (ob + a.transit_days))
                cost += a.alt_supplier_premium * a.cogs_share * lane_demand_day * switched_days
            if s.rebalance_share:
                active = days - a.rebalance_lead_days
                recovered = loss_day * loss_scale[i, 0] * s.rebalance_share * active
                cost += a.rebalance_cost_share * recovered
            costs[i] = cost
        mult_mean = _loss_multiplier(s, days, s.onboarding_days, a)
        mean_path = pd.Series(healthy - loss_day * mult_mean, index=horizon).resample("W-MON", label="left", closed="left").sum()
        weekly_paths[s.key] = mean_path
        results.append(
            {
                "key": s.key,
                "name": s.name,
                "description": s.description,
                "revenue_p10": float(np.percentile(totals, 10)),
                "revenue_p50": float(np.percentile(totals, 50)),
                "revenue_p90": float(np.percentile(totals, 90)),
                "cost": float(np.mean(costs)),
                "_totals": totals,
                "_costs": costs,
                "days_to_recovery": int(np.argmax(mult_mean < 0.05)) if (mult_mean < 0.05).any() else None,
                "residual_loss_share": float(mult_mean.mean()),
            }
        )

    ref = next(r for r in results if r["key"] == "do_nothing")
    for r in results:
        recovered = r["_totals"] - ref["_totals"]
        net = recovered * a.gross_margin - (r["_costs"] - ref["_costs"])
        r["recovered_revenue"] = float(np.median(recovered))
        r["net_impact"] = float(np.median(net))
        r["net_impact_p10"] = float(np.percentile(net, 10))
        r["net_impact_p90"] = float(np.percentile(net, 90))
        r["prob_beats_do_nothing"] = float((net > 0).mean()) if r["key"] != "do_nothing" else None
    best = max(results, key=lambda r: r["net_impact"])
    # Probability the best option beats the runner-up
    others = [r for r in results if r is not best]
    runner = max(others, key=lambda r: r["net_impact"])
    best_net = best["_totals"] * a.gross_margin - best["_costs"]
    run_net = runner["_totals"] * a.gross_margin - runner["_costs"]
    p_best = float((best_net > run_net).mean())

    chart = []
    healthy_weekly = pd.Series(healthy, index=horizon).resample("W-MON", label="left", closed="left")
    full_weeks = healthy_weekly.count()
    healthy_weekly = healthy_weekly.sum()
    for wk in weekly_paths["do_nothing"].index:
        if full_weeks[wk] < 7:  # skip partial weeks at the edges of the horizon
            continue
        row = {"week": wk.date().isoformat(), "healthy": round(float(healthy_weekly[wk]))}
        for k, path in weekly_paths.items():
            row[k] = round(float(path[wk]))
        chart.append(row)

    for r in results:
        r.pop("_totals")
        r.pop("_costs")
        for k in ("revenue_p10", "revenue_p50", "revenue_p90", "cost", "recovered_revenue", "net_impact", "net_impact_p10", "net_impact_p90"):
            r[k] = round(r[k])

    return {
        "horizon_start": horizon[0].date().isoformat(),
        "horizon_end": horizon[-1].date().isoformat(),
        "healthy_revenue": round(float(healthy.sum())),
        "current_daily_loss": round(loss_day),
        "strategies": results,
        "recommended": best["key"],
        "confidence_best_vs_runner_up": round(p_best, 3),
        "runner_up": runner["key"],
        "assumptions": asdict(a),
        "chart": chart,
    }


def custom_strategy(onboarding_days: int, rebalance_share: float, switch_supplier: bool) -> Strategy:
    return Strategy(
        "custom",
        "Your scenario",
        f"Rebalance {round(rebalance_share * 100)}% of lost demand"
        + (f", switch supplier with {onboarding_days}-day onboarding" if switch_supplier else ", keep current supplier"),
        switch_supplier=switch_supplier,
        onboarding_days=onboarding_days,
        rebalance_share=rebalance_share,
    )
