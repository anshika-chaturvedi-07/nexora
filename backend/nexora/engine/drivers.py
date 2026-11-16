"""AETHER: driver decomposition.

Answers "where is the drop concentrated?" by comparing two periods across every
business dimension, scoring how far each dimension's losses deviate from a
uniform drop, and greedily drilling into the worst segment.
"""

from __future__ import annotations

import pandas as pd

DIMENSIONS = ["category", "region", "channel", "supplier", "product"]
LABELS = {
    "category": "Product category",
    "region": "Region",
    "channel": "Sales channel",
    "supplier": "Supplier",
    "product": "Product",
}


def _segment_table(a: pd.DataFrame, b: pd.DataFrame, dim: str) -> pd.DataFrame:
    ra = a.groupby(dim)["revenue"].sum()
    rb = b.groupby(dim)["revenue"].sum()
    t = pd.DataFrame({"before": ra, "after": rb}).fillna(0.0)
    t["delta"] = t["after"] - t["before"]
    total_before, total_delta = t["before"].sum(), t["delta"].sum()
    t["share_of_revenue"] = t["before"] / total_before
    t["share_of_drop"] = t["delta"] / total_delta if total_delta else 0.0
    t["change_pct"] = t["delta"] / t["before"].where(t["before"] > 0)
    t["excess"] = t["delta"] - t["share_of_revenue"] * total_delta
    return t.sort_values("delta")


def concentration(t: pd.DataFrame) -> float:
    """0 = drop spread evenly; higher = drop concentrated in a few segments."""
    total = abs(t["delta"].sum())
    return float(t["excess"].abs().sum() / (2 * total)) if total else 0.0


def price_volume(a: pd.DataFrame, b: pd.DataFrame) -> dict:
    """Split revenue change into volume effect and price effect (per product)."""
    ga = a.groupby("product").agg(units=("units", "sum"), revenue=("revenue", "sum"))
    gb = b.groupby("product").agg(units=("units", "sum"), revenue=("revenue", "sum"))
    pa = ga["revenue"] / ga["units"]
    pb = gb["revenue"] / gb["units"]
    volume = float(((gb["units"] - ga["units"]) * pa).sum())
    price = float(((pb - pa) * gb["units"]).sum())
    return {
        "volume_effect": volume,
        "price_effect": price,
        # like-for-like: each product's own price change, weighted by current units (mix-neutral)
        "avg_price_change_pct": float(price / (pa * gb["units"]).sum()),
        "mix_adjusted": True,
        "units_change_pct": float(gb["units"].sum() / ga["units"].sum() - 1),
    }


def _rows(t: pd.DataFrame, limit: int = 12) -> list[dict]:
    return [
        {
            "segment": str(idx),
            "before": round(float(r.before)),
            "after": round(float(r.after)),
            "delta": round(float(r.delta)),
            "change_pct": None if pd.isna(r.change_pct) else round(float(r.change_pct), 4),
            "share_of_revenue": round(float(r.share_of_revenue), 4),
            "share_of_drop": round(float(r.share_of_drop), 4),
        }
        for idx, r in t.head(limit).iterrows()
    ]


def decompose(sales: pd.DataFrame, prev_start, focus_start, focus_end, depth: int = 2) -> dict:
    a = sales[(sales["date"] >= prev_start) & (sales["date"] < focus_start)]
    b = sales[(sales["date"] >= focus_start) & (sales["date"] <= focus_end)]
    total_delta = float(b["revenue"].sum() - a["revenue"].sum())

    dims = []
    for dim in DIMENSIONS:
        t = _segment_table(a, b, dim)
        dims.append({"dimension": dim, "label": LABELS[dim], "concentration": round(concentration(t), 4), "segments": _rows(t)})
    dims.sort(key=lambda d: d["concentration"], reverse=True)

    # Greedy drill-down: follow the segment with the largest absolute loss.
    path = []
    cur_a, cur_b = a, b
    remaining = [d for d in DIMENSIONS if d != "product"]
    for _ in range(depth):
        best = None
        for dim in remaining:
            t = _segment_table(cur_a, cur_b, dim)
            score = concentration(t)
            if best is None or score > best[1]:
                best = (dim, score, t)
        if best is None:
            break
        dim, score, t = best
        worst = t.index[0]
        row = t.iloc[0]
        # Include sibling segments that are also clearly over-indexed on the loss
        hot = [str(s) for s, r in t.iterrows() if r["excess"] < 0 and r["share_of_drop"] > r["share_of_revenue"] * 1.5]
        path.append(
            {
                "dimension": dim,
                "label": LABELS[dim],
                "segment": str(worst),
                "hot_segments": hot or [str(worst)],
                "concentration": round(score, 4),
                "delta": round(float(row["delta"])),
                "change_pct": round(float(row["change_pct"]), 4),
                "share_of_drop_global": round(float(row["delta"]) / total_delta, 4) if total_delta else 0,
            }
        )
        keep = hot or [worst]
        cur_a, cur_b = cur_a[cur_a[dim].isin(keep)], cur_b[cur_b[dim].isin(keep)]
        remaining = [d for d in remaining if d != dim and not (dim == "category" and d == "supplier")]

    focus_delta = float(cur_b["revenue"].sum() - cur_a["revenue"].sum())
    return {
        "total_delta": round(total_delta),
        "dimensions": dims,
        "drilldown": path,
        "drilldown_delta": round(focus_delta),
        "drilldown_share_of_drop": round(focus_delta / total_delta, 4) if total_delta else 0,
        "price_volume": price_volume(a, b),
    }
