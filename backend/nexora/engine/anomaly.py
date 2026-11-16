"""AETHER: revenue baseline model and anomaly detection.

We model daily revenue with a log-linear regression (trend + day-of-week + annual
seasonality) trained only on data *before* the period under review. The model's
prediction is what revenue "should" have been; the gap between actual and
expected is the unexplained loss that the rest of the investigation must explain.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge


def _features(dates: pd.DatetimeIndex, origin: pd.Timestamp) -> np.ndarray:
    t = (dates - origin).days.values / 365.25
    doy = dates.day_of_year.values
    dow = np.eye(7)[dates.day_of_week.values][:, 1:]  # drop Monday as reference
    fourier = np.column_stack(
        [np.sin(2 * np.pi * k * doy / 365.25) for k in (1, 2)]
        + [np.cos(2 * np.pi * k * doy / 365.25) for k in (1, 2)]
    )
    return np.column_stack([t, dow, fourier])


@dataclass
class BaselineModel:
    model: Ridge
    origin: pd.Timestamp
    sigma: float  # residual std in log space (daily)
    sigma7: float  # std of 7-day rolling mean residual
    train_mape: float

    def expected(self, dates: pd.DatetimeIndex) -> np.ndarray:
        """Mean-unbiased expected revenue for each date."""
        log_pred = self.model.predict(_features(dates, self.origin))
        return np.exp(log_pred + self.sigma**2 / 2)

    def band(self, dates: pd.DatetimeIndex, z: float = 1.96) -> tuple[np.ndarray, np.ndarray]:
        log_pred = self.model.predict(_features(dates, self.origin))
        return np.exp(log_pred - z * self.sigma), np.exp(log_pred + z * self.sigma)


def daily_revenue(sales: pd.DataFrame) -> pd.Series:
    return sales.groupby("date")["revenue"].sum().sort_index()


def fit_baseline(series: pd.Series, train_end: pd.Timestamp) -> BaselineModel:
    train = series[series.index < train_end]
    origin = train.index.min()
    X = _features(train.index, origin)
    y = np.log(train.values)
    model = Ridge(alpha=1e-3).fit(X, y)
    resid = y - model.predict(X)
    sigma = float(np.std(resid, ddof=X.shape[1]))
    sigma7 = float(pd.Series(resid).rolling(7).mean().std())
    pred = np.exp(model.predict(X))
    mape = float(np.mean(np.abs(train.values - pred) / train.values))
    return BaselineModel(model, origin, sigma, sigma7, mape)


@dataclass
class AnomalyResult:
    focus_start: pd.Timestamp
    focus_end: pd.Timestamp
    prev_start: pd.Timestamp
    actual_focus: float
    actual_prev: float
    expected_focus: float
    qoq_change: float
    gap_vs_expected: float
    gap_pct: float
    onset: pd.Timestamp | None
    worst_week: pd.Timestamp | None
    z_score: float
    model_mape: float
    chart: list[dict]


def detect(sales: pd.DataFrame, focus_start: str, focus_end: str, history_days: int = 270) -> AnomalyResult:
    fs, fe = pd.Timestamp(focus_start), pd.Timestamp(focus_end)
    months = (fe.year - fs.year) * 12 + fe.month - fs.month + 1
    ps = fs - pd.DateOffset(months=months)  # comparison period of equal length
    rev = daily_revenue(sales)
    base = fit_baseline(rev, fs)

    focus = rev[(rev.index >= fs) & (rev.index <= fe)]
    prev = rev[(rev.index >= ps) & (rev.index < fs)]
    exp_focus = base.expected(focus.index)

    actual_focus, actual_prev = float(focus.sum()), float(prev.sum())
    expected_focus = float(exp_focus.sum())
    gap = actual_focus - expected_focus

    # z-score of the quarter-level gap, treating daily log residuals as noise
    n = len(focus)
    z = float(np.log(actual_focus / expected_focus) / (base.sigma / np.sqrt(n)))

    # onset: first day whose 7-day rolling log-residual drops below -3 sigma7, sustained
    window = rev[rev.index >= fs - pd.Timedelta(days=45)]
    resid = np.log(window.values) - np.log(base.expected(window.index))
    roll = pd.Series(resid, index=window.index).rolling(7, min_periods=7).mean()
    flagged = roll < -3 * base.sigma7
    onset = None
    run = 0
    for d, f in flagged.items():
        run = run + 1 if f else 0
        if run >= 5:
            onset = d - pd.Timedelta(days=4 + 6)  # first day of the 5-day run, minus rolling lag
            break

    weekly = (focus - exp_focus).resample("W-MON", label="left", closed="left").sum()
    worst_week = weekly.idxmin() if len(weekly) else None

    hist = rev[rev.index >= fs - pd.Timedelta(days=history_days)]
    hist = hist[hist.index <= fe]
    lo, hi = base.band(hist.index)
    exp_hist = base.expected(hist.index)
    # Roll over the full series, then slice, so the first points use a full 7-day window
    roll_actual = rev.rolling(7, min_periods=1).mean().reindex(hist.index)
    roll_exp = pd.Series(base.expected(rev.index), index=rev.index).rolling(7, min_periods=1).mean().reindex(hist.index)
    chart = [
        {
            "date": d.date().isoformat(),
            "actual": round(float(a)),
            "expected": round(float(e)),
            "actual_7d": round(float(ra)),
            "expected_7d": round(float(re)),
            "lower": round(float(l)),
            "upper": round(float(h)),
            "in_focus": bool(d >= fs),
        }
        for d, a, e, ra, re, l, h in zip(hist.index, hist.values, exp_hist, roll_actual, roll_exp, lo, hi)
    ]

    return AnomalyResult(
        focus_start=fs,
        focus_end=fe,
        prev_start=ps,
        actual_focus=actual_focus,
        actual_prev=actual_prev,
        expected_focus=expected_focus,
        qoq_change=actual_focus / actual_prev - 1,
        gap_vs_expected=gap,
        gap_pct=gap / expected_focus,
        onset=onset,
        worst_week=worst_week,
        z_score=z,
        model_mape=base.train_mape,
        chart=chart,
    )
