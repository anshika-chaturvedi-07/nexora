"""Loads the enterprise dataset into memory (generating it on first run)."""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import pandas as pd

from nexora.data import generate as gen


@dataclass
class Dataset:
    sales: pd.DataFrame
    inventory: pd.DataFrame
    shipments: pd.DataFrame
    service_metrics: pd.DataFrame
    market: pd.DataFrame
    products: pd.DataFrame
    documents: dict[str, str]


def _ensure_generated() -> None:
    if not (gen.RAW_DIR / "sales.csv").exists() or not any(gen.DOCS_DIR.glob("*.md")):
        gen.main()


@lru_cache(maxsize=1)
def load() -> Dataset:
    _ensure_generated()
    raw = gen.RAW_DIR

    def read(name: str, dates: tuple[str, ...] = ("date",)) -> pd.DataFrame:
        return pd.read_csv(raw / f"{name}.csv", parse_dates=list(dates))

    docs = {p.name: p.read_text(encoding="utf-8") for p in sorted(Path(gen.DOCS_DIR).glob("*.md"))}
    return Dataset(
        sales=read("sales"),
        inventory=read("inventory"),
        shipments=read("shipments", ("order_date", "expected_date", "delivered_date")),
        service_metrics=read("service_metrics"),
        market=read("market"),
        products=pd.read_csv(raw / "products.csv"),
        documents=docs,
    )
