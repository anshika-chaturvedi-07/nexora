"""End-to-end checks: the engine must rediscover the incidents planted by the simulator
without being told about them, and the API must serve them."""

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from nexora.api import app
from nexora.data import generate as gen
from nexora.engine import investigation


@pytest.fixture(scope="module")
def steps():
    events = investigation.run_all(use_llm=False)
    return {e["key"]: e for e in events if e["type"] == "step"}


def test_runs_all_nine_steps(steps):
    assert len(steps) == 9


def test_detects_significant_drop(steps):
    d = steps["detect"]["data"]
    assert d["qoq_change"] < -0.05
    assert d["gap"] < 0
    assert d["z_score"] < -3


def test_drilldown_finds_planted_segment(steps):
    path = {p["dimension"]: set(p["hot_segments"]) for p in steps["drivers"]["data"]["drilldown"]}
    assert "Industrial Sensors" in path.get("category", set()) or "Kestrel Components" in path.get("supplier", set())
    assert path.get("region") == gen.SUPPLIER_INCIDENT_REGIONS


def test_price_effect_is_ruled_out(steps):
    assert abs(steps["drivers"]["data"]["price_volume"]["avg_price_change_pct"]) < 0.01


def test_supply_scan_names_the_right_supplier_and_order(steps):
    s = steps["supply"]["data"]
    assert s["suspect_supplier"] == "Kestrel Components"
    cp = s["change_points"]
    assert cp["supplier_delay"] <= cp["stockouts"] <= cp["revenue"]


def test_infra_scan_finds_the_outage_window(steps):
    incidents = steps["infra"]["data"]["incidents"]
    assert len(incidents) == 1
    inc = incidents[0]
    assert inc["service"] == "order-service"
    start, end = gen.API_INCIDENT
    assert abs((pd.Timestamp(inc["start"]) - start).days) <= 1
    assert abs((pd.Timestamp(inc["end"]) - end).days) <= 1


def test_attribution_ranks_supply_first(steps):
    causes = [c for c in steps["attribution"]["data"]["causes"] if c["key"] != "other"]
    assert max(causes, key=lambda c: -c["impact"])["key"] == "supply"
    assert causes[0]["confidence"] == "High"


def test_recommendation_beats_doing_nothing(steps):
    sc = steps["scenarios"]["data"]
    best = next(s for s in sc["strategies"] if s["key"] == sc["recommended"])
    assert sc["recommended"] != "do_nothing"
    assert best["net_impact"] > 0


def test_api_endpoints():
    client = TestClient(app)
    assert client.get("/api/health").json()["status"] == "ok"
    ov = client.get("/api/overview").json()
    assert ov["kpis"]["revenue"] > 0
    sc = client.post("/api/scenario", json={"onboarding_days": 30, "rebalance_share": 0.3, "switch_supplier": True}).json()
    assert {s["key"] for s in sc["strategies"]} == {"do_nothing", "custom"}
    hits = client.get("/api/documents/search", params={"q": "connection pool release"}).json()["results"]
    assert hits and "INC-2291" in hits[0]["title"]
