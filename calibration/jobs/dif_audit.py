"""Mantel-Haenszel DIF audit.

Flags items that function differently for a focal vs. reference group after
matching on overall ability. Grouping variables:

* ``language`` (Track 4.2) — the assessment language recorded on
  ``assessment_timeline`` (multilingual DIF study, study key ``multilingual_dif``).
  Synthetic sessions are excluded.
* ``gender`` / ``language_medium`` / ``college_tier`` — read from
  ``candidate_demographics``. Those fields are OPTIONAL and DEFAULT-OFF in the
  app (nothing populates them until market-specific legal approval exists —
  LL144-style analysis is a human/legal decision, not an engineering one).

Per item × dimension we dichotomise the micro-level at its median, stratify
candidates into ability bins, and compute the MH common odds ratio + chi-square.
Items are classified with the ETS A/B/C scheme via the MH-delta
(``-2.35 * ln(OR)``). Writes run_type='dif'.
"""
from __future__ import annotations

import math
from collections import defaultdict

import numpy as np

from ._base import connect, fetch_all, insufficient, seed_everything, summarize, write_run

GROUPS = ["language", "gender", "language_medium", "college_tier"]
MIN_PER_CELL = 5
N_ABILITY_BINS = 4
LEVEL_MAX = 4.0


def mh_odds_ratio(strata: list[tuple]) -> tuple[float, float]:
    """strata: list of (a, b, c, d, n) 2x2 cells (focal-correct, focal-wrong,
    ref-correct, ref-wrong, total). Returns (common OR, MH chi-square).

    Degenerate tables (a zero cell — e.g. an item NO focal candidate passes,
    which is maximal DIF, not negligible DIF) get the standard
    Haldane-Anscombe 0.5 continuity correction for the OR; the chi-square is
    always computed on the uncorrected counts."""
    zero_cell = any(n > 0 and (a == 0 or b == 0 or c == 0 or d == 0) for a, b, c, d, n in strata)
    k = 0.5 if zero_cell else 0.0
    num = den = 0.0
    chi_num = chi_den = 0.0
    for a, b, c, d, n in strata:
        if n == 0:
            continue
        aa, bb, cc, dd = a + k, b + k, c + k, d + k
        nn = aa + bb + cc + dd
        num += (aa * dd) / nn
        den += (bb * cc) / nn
        row1 = a + b
        row2 = c + d
        col1 = a + c
        exp_a = row1 * col1 / n
        var_a = (row1 * row2 * col1 * (n - col1)) / (n * n * (n - 1)) if n > 1 else 0.0
        chi_num += a - exp_a
        chi_den += var_a
    chi = (abs(chi_num) - 0.5) ** 2 / chi_den if chi_den > 0 else 0.0
    or_mh = num / den if den > 0 else float("inf")
    return or_mh, chi


def ets_class(or_mh: float, chi: float) -> str:
    """ETS DIF classification A (negligible) / B (moderate) / C (large).
    An infinite common OR is perfect separation — maximal DIF when
    statistically significant, never negligible."""
    if or_mh <= 0:
        return "A"
    if math.isinf(or_mh):
        return "C" if chi > 3.84 else "A"
    delta = -2.35 * math.log(or_mh)
    sig = chi > 3.84  # chi-square crit, df=1, p<0.05
    if abs(delta) < 1.0 or not sig:
        return "A"
    if abs(delta) < 1.5:
        return "B"
    return "C"


def _ability_bin(score: float, edges: list[float]) -> int:
    for i, e in enumerate(edges):
        if score <= e:
            return i
    return len(edges)


def run(conn=None, seed: int = 42) -> dict:
    seed_everything(seed)
    own = conn is None
    if own:
        conn = connect()
    rows = demo = langs = []
    if conn is not None:
        rows = fetch_all(
            conn,
            """
            SELECT ir.session_id, ir.item_id, ir.micro_levels, i.dimension
            FROM item_responses ir LEFT JOIN items i ON i.item_id = ir.item_id
            WHERE ir.micro_levels IS NOT NULL
            """,
        )
        demo = fetch_all(conn, "SELECT session_id, gender, language_medium, college_tier FROM candidate_demographics")
        # Track 4.2: language group membership from the timeline (never synthetic).
        langs = fetch_all(conn, "SELECT session_id, language FROM assessment_timeline WHERE is_synthetic = false AND language IS NOT NULL")

    demo_by_session = {str(d["session_id"]): dict(d) for d in demo}
    for l in langs:
        demo_by_session.setdefault(str(l["session_id"]), {})["language"] = l["language"]

    inputs = {"responses": len(rows), "demographics": len(demo), "language_sessions": len(langs)}
    if len(rows) < 30 or not demo_by_session:
        res = insufficient("dif", conn, inputs, "need rated responses with group membership")
        if own and conn:
            conn.close()
        return res

    findings = compute_dif(rows, demo_by_session)

    outputs = {"flags": findings, "n_flags": len(findings),
               "groups_audited": GROUPS}
    run_id = write_run(conn, "dif", inputs, outputs)
    res = summarize("dif", run_id, "ok", n_flags=len(findings))
    if own and conn:
        conn.close()
    return res


def compute_dif(rows: list[dict], demo_by_session: dict[str, dict]) -> list[dict]:
    """Pure DIF core — testable on synthetic data without a database."""
    # session ability = mean numeric micro-level.
    sess_vals: dict[str, list[float]] = defaultdict(list)
    item_dim_levels: dict[tuple, list[tuple]] = defaultdict(list)
    for r in rows:
        ml = r.get("micro_levels") or {}
        sid = str(r["session_id"])
        for dim, lv in ml.items():
            if isinstance(lv, (int, float)):
                sess_vals[sid].append(float(lv))
                item_dim_levels[(str(r["item_id"]), dim)].append((sid, float(lv)))
    ability = {s: float(np.mean(v)) for s, v in sess_vals.items() if v}

    abil_scores = sorted(ability.values())
    edges = [float(np.quantile(abil_scores, q)) for q in np.linspace(0, 1, N_ABILITY_BINS + 1)[1:-1]] if len(abil_scores) >= N_ABILITY_BINS else []

    findings = []
    for group_var in GROUPS:
        for (item_id, dim), pairs in item_dim_levels.items():
            vals = [lv for _, lv in pairs]
            if len(vals) < 2 * MIN_PER_CELL:
                continue
            cut = float(np.median(vals))
            # determine focal/reference as the two most common categories.
            cats = defaultdict(int)
            for sid, _ in pairs:
                g = demo_by_session.get(sid, {}).get(group_var)
                if g:
                    cats[g] += 1
            if len(cats) < 2:
                continue
            top = sorted(cats.items(), key=lambda kv: -kv[1])[:2]
            focal, ref = top[0][0], top[1][0]
            # build strata
            cells: dict[int, list[int]] = defaultdict(lambda: [0, 0, 0, 0])
            for sid, lv in pairs:
                g = demo_by_session.get(sid, {}).get(group_var)
                if g not in (focal, ref):
                    continue
                b = _ability_bin(ability.get(sid, 0.0), edges)
                correct = lv > cut
                if g == focal:
                    cells[b][0 if correct else 1] += 1
                else:
                    cells[b][2 if correct else 3] += 1
            strata = [(c[0], c[1], c[2], c[3], sum(c)) for c in cells.values() if sum(c) >= MIN_PER_CELL]
            if not strata:
                continue
            or_mh, chi = mh_odds_ratio(strata)
            cls = ets_class(or_mh, chi)
            if cls != "A":
                findings.append({
                    "group": group_var, "focal": focal, "reference": ref,
                    "item_id": item_id, "dimension": dim,
                    "odds_ratio": round(or_mh, 4) if math.isfinite(or_mh) else None,
                    "chi_square": round(chi, 4), "ets_class": cls,
                })

    return findings


if __name__ == "__main__":
    run()
