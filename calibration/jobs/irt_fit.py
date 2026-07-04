"""Graded-response IRT bootstrap.

Estimates a per-item difficulty ``b`` and discrimination ``a`` plus an infit
misfit statistic from the 0–4 micro-levels logged in ``item_responses``.

This is a dependency-light bootstrap estimator (deterministic, no marginal-MLE
solver) chosen so the pipeline runs on modest data; the public contract — read
``item_responses``, emit per-item {a, b, infit, status} into ``calibration_runs``
— is identical to a full GRM, so the estimator can be swapped later without
touching the Node side that consumes the frozen run.
"""
from __future__ import annotations

import math
from collections import defaultdict

import numpy as np

from ._base import DIMENSIONS, connect, fetch_all, insufficient, seed_everything, summarize, write_run

MIN_RESPONSES_PER_ITEM = 20
LEVEL_MAX = 4.0


def _safe_z(p: float) -> float:
    """Inverse-normal of a proportion, clamped away from the asymptotes."""
    p = min(max(p, 1e-3), 1 - 1e-3)
    # Acklam-style rational approximation via numpy is overkill; use erfcinv.
    return float(math.sqrt(2) * _erfinv(2 * p - 1))


def _erfinv(x: float) -> float:
    # Winitzki approximation — deterministic, no scipy dependency.
    a = 0.147
    ln = math.log(1 - x * x)
    t1 = 2 / (math.pi * a) + ln / 2
    return math.copysign(math.sqrt(math.sqrt(t1 * t1 - ln / a) - t1), x)


def item_difficulty(levels: list[float]) -> float:
    """Map mean item level (0–4) to an IRT-style difficulty on the logit scale.
    Easier items (high mean level) get lower b."""
    mean_p = float(np.mean(levels)) / LEVEL_MAX
    return round(-_safe_z(mean_p), 4)


def item_discrimination(item_levels: list[float], ability: list[float]) -> float:
    """Point-biserial-style slope: correlation of item level with session
    ability, mapped to a positive discrimination."""
    if len(item_levels) < 2 or np.std(item_levels) == 0 or np.std(ability) == 0:
        return 1.0
    r = float(np.corrcoef(item_levels, ability)[0, 1])
    r = max(min(r, 0.95), -0.95)
    # Bound to a sane IRT range (0.3 .. 2.5).
    return round(max(0.3, min(2.5, 0.3 + 2.2 * max(r, 0.0))), 4)


def infit(item_levels: list[float], ability: list[float], b: float, a: float) -> float:
    """Information-weighted mean-square fit. ~1.0 = good fit; >1.4 underfit."""
    if not item_levels:
        return 1.0
    resid_sq, weight = 0.0, 0.0
    for x, th in zip(item_levels, ability):
        p = 1.0 / (1.0 + math.exp(-a * (th - b)))  # expected proportion-correct
        expected = p * LEVEL_MAX
        var = max(LEVEL_MAX * LEVEL_MAX * p * (1 - p), 1e-6)
        resid_sq += (x - expected) ** 2
        weight += var
    return round(resid_sq / weight, 4) if weight else 1.0


def _session_ability(rows: list[dict]) -> dict[str, float]:
    """Mean numeric micro-level per session = crude ability proxy."""
    acc: dict[str, list[float]] = defaultdict(list)
    for r in rows:
        ml = r.get("micro_levels") or {}
        vals = [float(v) for v in ml.values() if isinstance(v, (int, float))]
        if vals:
            acc[str(r["session_id"])].extend(vals)
    return {sid: float(np.mean(v)) for sid, v in acc.items() if v}


def run(conn=None, seed: int = 42) -> dict:
    seed_everything(seed)
    own = conn is None
    if own:
        conn = connect()
    rows = []
    if conn is not None:
        rows = fetch_all(
            conn,
            """
            SELECT ir.session_id, ir.item_id, ir.micro_levels, i.dimension
            FROM item_responses ir LEFT JOIN items i ON i.item_id = ir.item_id
            WHERE ir.micro_levels IS NOT NULL
            """,
        )
    inputs = {"responses": len(rows), "min_per_item": MIN_RESPONSES_PER_ITEM}
    if len(rows) < MIN_RESPONSES_PER_ITEM:
        res = insufficient("irt", conn, inputs, f"only {len(rows)} rated responses")
        if own and conn:
            conn.close()
        return res

    ability = _session_ability(rows)
    by_item: dict[tuple, list[tuple]] = defaultdict(list)
    for r in rows:
        ml = r.get("micro_levels") or {}
        sid = str(r["session_id"])
        for dim in DIMENSIONS:
            if dim in ml and isinstance(ml[dim], (int, float)):
                by_item[(str(r["item_id"]), dim)].append((float(ml[dim]), ability.get(sid, np.nan)))

    items = []
    for (item_id, dim), pairs in by_item.items():
        pairs = [(x, th) for x, th in pairs if not math.isnan(th)]
        if len(pairs) < MIN_RESPONSES_PER_ITEM:
            continue
        levels = [x for x, _ in pairs]
        ab = [th for _, th in pairs]
        b = item_difficulty(levels)
        a = item_discrimination(levels, ab)
        fit = infit(levels, ab, b, a)
        items.append({
            "item_id": item_id, "dimension": dim, "n": len(levels),
            "difficulty_b": b, "discrimination_a": a, "infit": fit,
            "misfit": fit > 1.4 or fit < 0.6,
        })

    if not items:
        res = insufficient("irt", conn, inputs, "no item met the per-item response minimum")
        if own and conn:
            conn.close()
        return res

    outputs = {"items": items, "n_items": len(items), "n_misfit": sum(i["misfit"] for i in items)}
    run_id = write_run(conn, "irt", inputs, outputs)
    res = summarize("irt", run_id, "ok", n_items=len(items), n_misfit=outputs["n_misfit"])
    if own and conn:
        conn.close()
    return res


if __name__ == "__main__":
    run()
