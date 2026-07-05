"""Study 1 analysis — Executive steering vs lite director: evidence density.

Protocol: docs/studies/STEERING_AB_PROTOCOL.md (Vantage replication A).
Preregistered metrics:
  1. mean non-NA micro-rater level rate per turn, per arm;
  2. fraction of sessions with >=1 scoreable (non-NA) turn per dimension, per arm.
Comparison: Mann-Whitney U on per-session evidence rates (no peeking-based
stopping). Exclusions: synthetic sessions; sessions with <3 candidate turns.
Guard: >=60 real sessions per arm.

Writes the result append-only to study_results with detail.conclusion in
{'positive','negative','inconclusive'} — the exact field the Stage 3 flag map
reads for PRISM_V2_EXECUTIVE — plus a results memo with the mandatory
"what this does NOT support" section. Reports either outcome identically.

Protocol caveat honored: if the lite arm lacks micro_levels (rater off), the
fallback is the deterministic behavioral-signal density, stated explicitly.
"""
from __future__ import annotations

import json
import uuid
from collections import defaultdict

import numpy as np

from ._base import connect, fetch_all, insufficient, seed_everything, summarize, write_run

DIMENSIONS = ["criticalThinking", "communication", "collaboration", "problemSolving", "aiDigitalFluency"]
MIN_PER_ARM = 60
MIN_TURNS = 3
ALPHA = 0.05
ANALYSIS_VERSION = "s1-steering-v1"


def mann_whitney_u(a: list[float], b: list[float]) -> tuple[float, float]:
    """Two-sided Mann-Whitney U via normal approximation (plain numpy).
    Returns (U, p). Adequate at the protocol's n>=60/arm."""
    x = np.asarray(a, dtype=float)
    y = np.asarray(b, dtype=float)
    n1, n2 = len(x), len(y)
    allv = np.concatenate([x, y])
    ranks = np.empty(len(allv))
    order = np.argsort(allv)
    sorted_v = allv[order]
    # average ranks for ties
    i = 0
    while i < len(sorted_v):
        j = i
        while j + 1 < len(sorted_v) and sorted_v[j + 1] == sorted_v[i]:
            j += 1
        ranks[order[i:j + 1]] = (i + j) / 2 + 1
        i = j + 1
    r1 = ranks[:n1].sum()
    u1 = r1 - n1 * (n1 + 1) / 2
    mu = n1 * n2 / 2
    sigma = np.sqrt(n1 * n2 * (n1 + n2 + 1) / 12.0)
    if sigma == 0:
        return float(u1), 1.0
    z = (u1 - mu - np.sign(u1 - mu) * 0.5) / sigma
    from math import erf, sqrt
    p = 2 * (1 - 0.5 * (1 + erf(abs(z) / sqrt(2))))
    return float(u1), round(float(p), 6)


def compute_steering(sessions: dict) -> dict:
    """Pure core. sessions: {session_id: {'arm': 'executive'|'lite',
    'turns': [{dim: 0-4|'NA'|None}], 'fallback': bool}}."""
    per_session_rate = {"executive": [], "lite": []}
    coverage_counts = {"executive": defaultdict(int), "lite": defaultdict(int)}
    n_sessions = {"executive": 0, "lite": 0}
    fallback_used = False
    for s in sessions.values():
        arm = s["arm"]
        turns = s["turns"]
        if arm not in per_session_rate or len(turns) < MIN_TURNS:
            continue  # protocol exclusion: abandoned sessions
        n_sessions[arm] += 1
        fallback_used = fallback_used or bool(s.get("fallback"))
        scoreable = 0
        total = 0
        dims_hit = set()
        for t in turns:
            for d in DIMENSIONS:
                total += 1
                lv = t.get(d)
                if isinstance(lv, (int, float)):
                    scoreable += 1
                    dims_hit.add(d)
        per_session_rate[arm].append(scoreable / total if total else 0.0)
        for d in dims_hit:
            coverage_counts[arm][d] += 1

    metrics = {"arms": {}}
    for arm in ("executive", "lite"):
        n = n_sessions[arm]
        metrics["arms"][arm] = {
            "sessions": n,
            "mean_evidence_rate": round(float(np.mean(per_session_rate[arm])), 4) if n else None,
            "coverage_fraction": {d: (round(coverage_counts[arm][d] / n, 4) if n else None) for d in DIMENSIONS},
        }
    e, l = per_session_rate["executive"], per_session_rate["lite"]
    if e and l:
        u, p = mann_whitney_u(e, l)
        diff = float(np.mean(e) - np.mean(l))
        if p < ALPHA and diff > 0:
            conclusion = "positive"
        elif p < ALPHA and diff < 0:
            conclusion = "negative"
        else:
            conclusion = "inconclusive"
        metrics.update({"mann_whitney_u": u, "p_value": p, "rate_difference": round(diff, 4), "conclusion": conclusion})
    else:
        metrics.update({"mann_whitney_u": None, "p_value": None, "rate_difference": None, "conclusion": "inconclusive"})
    metrics["fallback_metric_used"] = bool(fallback_used)
    metrics["alpha"] = ALPHA
    return metrics


def results_memo(m: dict) -> str:
    e = m["arms"]["executive"]
    l = m["arms"]["lite"]
    lines = [
        "# S1 results memo — steering efficacy (evidence density)",
        "",
        f"Executive: n={e['sessions']}, mean evidence rate {e['mean_evidence_rate']} · "
        f"Lite: n={l['sessions']}, mean evidence rate {l['mean_evidence_rate']}",
        f"Mann-Whitney p={m['p_value']} (α={m['alpha']}) · rate difference {m['rate_difference']}",
        "",
        f"**Preregistered conclusion: {m['conclusion'].upper()}** — reported identically whichever way it fell.",
    ]
    if m.get("fallback_metric_used"):
        lines.append("")
        lines.append("NOTE: behavioral-signal density fallback was used where micro-levels were unavailable (protocol caveat).")
    lines += [
        "",
        "## What this result does NOT support",
        "- It does not validate score ACCURACY (S2 governs agreement with human raters).",
        "- It compares evidence elicitation efficiency, not candidate outcomes.",
        "- It applies to this cohort, scenario bank, and prompt versions — drift re-opens the question.",
        "- A negative/inconclusive result keeps PRISM_V2_EXECUTIVE dark; it does not indicate harm.",
    ]
    return "\n".join(lines)


def run(conn=None, seed: int = 42) -> dict:
    seed_everything(seed)
    own = conn is None
    if own:
        conn = connect()
    if conn is None:
        return summarize("steering_s1", None, "insufficient_data", reason="no database configured")

    rows = fetch_all(conn, """
        SELECT ss.session_id, ss.arm, ir.exchange_no, ir.micro_levels
          FROM study_sessions ss
          JOIN studies s ON s.study_id = ss.study_id AND s.study_key = 'steering_ab'
          JOIN assessment_timeline t ON t.session_id = ss.session_id AND t.is_synthetic = FALSE
          LEFT JOIN item_responses ir ON ir.session_id = ss.session_id
         WHERE ss.is_synthetic = FALSE AND ss.arm IN ('executive','lite')
         ORDER BY ss.session_id, ir.exchange_no
    """)
    sessions: dict = {}
    for r in rows:
        sid = str(r["session_id"])
        entry = sessions.setdefault(sid, {"arm": r["arm"], "turns": [], "fallback": False})
        if r["exchange_no"] is not None:
            entry["turns"].append(r["micro_levels"] or {})
            if not r["micro_levels"]:
                entry["fallback"] = True

    n_exec = sum(1 for s in sessions.values() if s["arm"] == "executive" and len(s["turns"]) >= MIN_TURNS)
    n_lite = sum(1 for s in sessions.values() if s["arm"] == "lite" and len(s["turns"]) >= MIN_TURNS)
    inputs = {"executive": n_exec, "lite": n_lite, "min_per_arm": MIN_PER_ARM}
    if min(n_exec, n_lite) < MIN_PER_ARM:
        res = insufficient("steering_s1", conn, inputs,
                           f"need >= {MIN_PER_ARM} real sessions per arm (have exec={n_exec}, lite={n_lite})")
        if own and conn:
            conn.close()
        return res

    metrics = compute_steering(sessions)
    with conn.cursor() as cur:
        cur.execute("SELECT study_id FROM studies WHERE study_key = 'steering_ab'")
        row = cur.fetchone()
        if row:
            cur.execute(
                """INSERT INTO study_results (result_id, study_id, metric_name, value, detail, n, analysis_version)
                   VALUES (%s,%s,%s,%s,%s,%s,%s)""",
                (str(uuid.uuid4()), row[0], "evidence_density_comparison",
                 metrics.get("rate_difference"), json.dumps(metrics),
                 n_exec + n_lite, ANALYSIS_VERSION),
            )
    run_id = write_run(conn, "steering_s1", inputs, {"metrics": metrics, "memo": results_memo(metrics)})
    res = summarize("steering_s1", run_id, "ok", conclusion=metrics["conclusion"], n=n_exec + n_lite)
    if own and conn:
        conn.close()
    return res


if __name__ == "__main__":
    print(json.dumps(run(), indent=2, default=str))
