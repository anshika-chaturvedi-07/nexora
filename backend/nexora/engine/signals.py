"""Operational evidence scanners.

SUPPLYMIND  - inventory, stockouts, supplier performance
SENTINEL    - service health incidents and their measured revenue impact
MARKETVERSE - external demand context
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def _iso(d) -> str | None:
    return None if d is None or pd.isna(d) else pd.Timestamp(d).date().isoformat()


def change_point(
    weekly: pd.Series,
    baseline_end: pd.Timestamp,
    direction: str = "up",
    k: float = 3.0,
    min_rel: float = 0.10,
    sustain: int = 2,
    min_abs: float = 0.0,
):
    """First week on/after baseline_end that starts a sustained break from the (clean) baseline.

    A break must exceed k sigma AND a minimum relative change (so near-zero-variance
    series don't fire on noise), and must persist for `sustain` consecutive weeks.
    """
    base = weekly[weekly.index < baseline_end].tail(40)
    mu, sd = base.mean(), max(base.std(), 1e-9)
    margin = max(k * sd, min_rel * max(abs(mu), 1e-9), min_abs)
    after = weekly[weekly.index >= baseline_end]
    breach = after > mu + margin if direction == "up" else after < mu - margin
    run = breach.astype(int).groupby((~breach).cumsum()).cumsum()
    hits = run[run >= sustain]
    first = hits.index[0] - pd.Timedelta(weeks=sustain - 1) if len(hits) else None
    return first, float(mu), float(sd)


# --------------------------------------------------------------------------- supply
def supply_scan(ds, prev_start, focus_start, focus_end, products=None, regions=None) -> dict:
    inv = ds.inventory
    price = ds.products.set_index("sku")["price"] * 1.03
    inv = inv.assign(lost_revenue=(inv["demand_units"] - inv["fulfilled_units"]) * inv["product"].map(price))
    prev = inv[(inv["date"] >= prev_start) & (inv["date"] < focus_start)]
    foc = inv[(inv["date"] >= focus_start) & (inv["date"] <= focus_end)]

    so = pd.DataFrame(
        {
            "prev_rate": prev.groupby(["product", "region"])["stockout"].mean(),
            "focus_rate": foc.groupby(["product", "region"])["stockout"].mean(),
            "lost_prev": prev.groupby(["product", "region"])["lost_revenue"].sum(),
            "lost_focus": foc.groupby(["product", "region"])["lost_revenue"].sum(),
        }
    ).reset_index()
    so["rate_change"] = so["focus_rate"] - so["prev_rate"]
    so = so.sort_values("lost_focus", ascending=False)
    hotspots = [
        {
            "product": r["product"],
            "region": r["region"],
            "stockout_days_prev_pct": round(r.prev_rate, 4),
            "stockout_days_focus_pct": round(r.focus_rate, 4),
            "lost_revenue_focus": round(r.lost_focus),
        }
        for _, r in so.head(8).iterrows()
        if r.focus_rate > 0.05
    ]

    days_ratio = len(foc["date"].unique()) / max(len(prev["date"].unique()), 1)
    excess_lost = float(foc["lost_revenue"].sum() - prev["lost_revenue"].sum() * days_ratio)

    # Supplier performance (on-time = delivered within 1 day of promise)
    sh = ds.shipments.copy()
    sh["on_time"] = sh["delay_days"] <= 2  # within 2 days of the promised date
    sh["fill_rate"] = sh["qty_delivered"] / sh["qty_ordered"].clip(lower=1)
    sp = sh[(sh["order_date"] >= prev_start - pd.Timedelta(days=90)) & (sh["order_date"] < focus_start - pd.Timedelta(days=30))]
    sf = sh[(sh["order_date"] >= focus_start - pd.Timedelta(days=30)) & (sh["order_date"] <= focus_end)]
    perf = pd.DataFrame(
        {
            "delay_before": sp.groupby(["supplier", "region"])["delay_days"].mean(),
            "delay_after": sf.groupby(["supplier", "region"])["delay_days"].mean(),
            "on_time_before": sp.groupby(["supplier", "region"])["on_time"].mean(),
            "on_time_after": sf.groupby(["supplier", "region"])["on_time"].mean(),
            "fill_before": sp.groupby(["supplier", "region"])["fill_rate"].mean(),
            "fill_after": sf.groupby(["supplier", "region"])["fill_rate"].mean(),
        }
    ).reset_index()
    perf["delay_increase"] = perf["delay_after"] - perf["delay_before"]
    perf = perf.sort_values("delay_increase", ascending=False)
    suppliers = [
        {k: (round(float(v), 3) if isinstance(v, (float, np.floating)) else v) for k, v in r.items()}
        for r in perf.to_dict("records")
    ]

    # Focus on the hotspot lanes: products/regions where stockouts concentrate
    hot_products = products or list(dict.fromkeys(h["product"] for h in hotspots[:4]))
    hot_regions = regions or list(dict.fromkeys(h["region"] for h in hotspots[:4]))
    worst_supplier = (
        perf[perf["region"].isin(hot_regions)].iloc[0]["supplier"] if len(perf[perf["region"].isin(hot_regions)]) else None
    )

    # Timeline: supplier delay -> stockouts -> revenue, weekly
    lane_ship = sh[(sh["supplier"] == worst_supplier) & (sh["region"].isin(hot_regions))]
    w_delay = lane_ship.set_index("order_date")["delay_days"].resample("W-MON").mean().ffill()
    lane_inv = inv[inv["product"].isin(hot_products) & inv["region"].isin(hot_regions)]
    w_stock = lane_inv.set_index("date")["stockout"].resample("W-MON").mean()
    s = ds.sales
    lane_sales = s[s["product"].isin(hot_products) & s["region"].isin(hot_regions)]
    w_rev = lane_sales.set_index("date")["revenue"].resample("W-MON").sum()

    # Baseline ends at the start of the comparison period, so the disruption can't contaminate it
    cp_delay = change_point(w_delay, prev_start, "up")[0]
    cp_stock = change_point(w_stock, prev_start, "up", min_abs=0.10)[0]  # >=10 points more stockout days
    cp_rev = change_point(w_rev, prev_start, "down")[0]

    t0 = focus_start - pd.Timedelta(days=150)
    timeline = pd.DataFrame({"delay_days": w_delay, "stockout_rate": w_stock, "revenue": w_rev})
    timeline = timeline[(timeline.index >= t0) & (timeline.index <= focus_end)].ffill().fillna(0)
    timeline_rows = [
        {
            "week": d.date().isoformat(),
            "delay_days": round(float(r.delay_days), 2),
            "stockout_rate": round(float(r.stockout_rate), 3),
            "revenue": round(float(r.revenue)),
        }
        for d, r in timeline.iterrows()
    ]

    # Lagged correlation between supplier delay and stockout rate (delay leads)
    joined = pd.DataFrame({"d": w_delay, "s": w_stock}).dropna()
    lags = {lag: float(joined["d"].shift(lag).corr(joined["s"])) for lag in range(0, 6)}
    best_lag = max(lags, key=lambda k: -1 if np.isnan(lags[k]) else lags[k])

    on_time_by_supplier = sf.groupby("supplier")["on_time"].mean().round(3).to_dict()

    return {
        "hotspots": hotspots,
        "supplier_on_time": on_time_by_supplier,
        "excess_lost_revenue": excess_lost,
        "suppliers": suppliers[:8],
        "suspect_supplier": worst_supplier,
        "hot_products": hot_products,
        "hot_regions": hot_regions,
        "change_points": {
            "supplier_delay": _iso(cp_delay),
            "stockouts": _iso(cp_stock),
            "revenue": _iso(cp_rev),
        },
        "lead_lag": {"best_lag_weeks": int(best_lag), "correlation": round(lags[best_lag], 3)},
        "timeline": timeline_rows,
    }


# --------------------------------------------------------------------------- infra
def infra_scan(ds, prev_start, focus_start, focus_end, z_threshold: float = 4.0) -> dict:
    m = ds.service_metrics
    incidents = []
    for svc, g in m.groupby("service"):
        g = g.set_index("date").sort_index()
        base = g[(g.index >= prev_start) & (g.index < focus_start)]
        foc = g[(g.index >= focus_start) & (g.index <= focus_end)]
        lat_mu, lat_sd = base["p95_latency_ms"].mean(), base["p95_latency_ms"].std()
        err_mu, err_sd = base["error_rate"].mean(), base["error_rate"].std()
        z_lat = (foc["p95_latency_ms"] - lat_mu) / lat_sd
        z_err = (foc["error_rate"] - err_mu) / err_sd
        bad = (z_lat > z_threshold) | (z_err > z_threshold)
        # contiguous windows (allow 1-day gaps)
        days = list(foc.index[bad])
        windows = []
        for d in days:
            if windows and (d - windows[-1][1]).days <= 2:
                windows[-1][1] = d
            else:
                windows.append([d, d])
        for start, end in windows:
            if (end - start).days < 1:
                continue
            w = foc[(foc.index >= start) & (foc.index <= end)]
            incidents.append(
                {
                    "service": svc,
                    "start": _iso(start),
                    "end": _iso(end),
                    "days": (end - start).days + 1,
                    "p95_latency_before": round(float(lat_mu)),
                    "p95_latency_during": round(float(w["p95_latency_ms"].mean())),
                    "error_rate_before": round(float(err_mu), 4),
                    "error_rate_during": round(float(w["error_rate"].mean()), 4),
                    "peak_z": round(float(max(z_lat.loc[start:end].max(), z_err.loc[start:end].max())), 1),
                }
            )

    # Difference-in-differences impact on the Online channel, using offline channels as control
    s = ds.sales[(ds.sales["date"] >= focus_start) & (ds.sales["date"] <= focus_end)]
    daily = s.pivot_table(index="date", columns="channel", values="revenue", aggfunc="sum")
    offline = daily.drop(columns=["Online"]).sum(axis=1)
    for inc in incidents:
        in_w = (daily.index >= inc["start"]) & (daily.index <= inc["end"])
        ratio_normal = (daily.loc[~in_w, "Online"] / offline[~in_w]).mean()
        ratio_incident = (daily.loc[in_w, "Online"] / offline[in_w]).mean()
        expected_online = float((offline[in_w] * ratio_normal).sum())
        actual_online = float(daily.loc[in_w, "Online"].sum())
        inc["online_share_drop_pct"] = round(float(ratio_incident / ratio_normal - 1), 4)
        inc["estimated_lost_revenue"] = round(expected_online - actual_online)

    series = m[(m["service"] == "order-service") & (m["date"] >= focus_start - pd.Timedelta(days=60)) & (m["date"] <= focus_end)]
    chart = [
        {"date": _iso(r.date), "p95_latency_ms": float(r.p95_latency_ms), "error_rate": float(r.error_rate)}
        for r in series.itertuples()
    ]
    incidents.sort(key=lambda i: i.get("estimated_lost_revenue", 0), reverse=True)
    return {"incidents": incidents, "services_checked": int(m["service"].nunique()), "order_service_chart": chart}


# --------------------------------------------------------------------------- market
def market_scan(ds, prev_start, focus_start, focus_end) -> dict:
    mk = ds.market.set_index("date")["demand_index"]
    prev = mk[(mk.index >= prev_start) & (mk.index < focus_start)].mean()
    foc = mk[(mk.index >= focus_start) & (mk.index <= focus_end)].mean()
    return {"demand_index_prev": round(float(prev), 2), "demand_index_focus": round(float(foc), 2), "change_pct": round(float(foc / prev - 1), 4)}
