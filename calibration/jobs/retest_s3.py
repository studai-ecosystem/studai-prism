"""Study 3 analysis — test–retest reliability on equated forms.

Protocol: docs/studies/TEST_RETEST_PROTOCOL.md. Preregistered metric:
Pearson r per dimension between attempt-1 and attempt-2 (different scenario
form, same scale_version), SEM per dimension, and the mean attempt-2 −
attempt-1 shift (practice-effect estimate).

Exclusions: synthetic sessions; non-equated scale versions; candidates with
integrity flags on either attempt. Exits insufficient_data below the
protocol's 40 candidates. Success detail: all_dimensions_reliable = r >= 0.7
per dimension (feeds PRISM_VELOCITY's flag-map precondition).
"""
from __future__ import annotations

import json
import uuid
from collections import defaultdict

import numpy as np

from ._base import connect, fetch_all, insufficient, seed_everything, summarize, write_run

DIMENSIONS = ["criticalThinking", "communication", "collaboration", "problemSolving", "aiDigitalFluency"]
MIN_CANDIDATES = 40
RELIABILITY_TARGET = 0.7
ANALYSIS_VERSION = "s3-retest-v1"

INTEGRITY_EVENTS = ("tab_switch", "screenshot_attempt", "multiple_faces", "face_absent")


def compute_retest(pairs: dict) -> dict:
    """pairs: {candidate_id: [(attempt_no, {dim: theta}), (attempt_no, {dim: theta})]}."""
    per_dimension = {}
    all_reliable = True
    n_pairs = len(pairs)
    for d in DIMENSIONS:
        a1, a2 = [], []
        for attempts in pairs.values():
            attempts = sorted(attempts, key=lambda x: x[0])
            t1 = attempts[0][1].get(d)
            t2 = attempts[1][1].get(d)
            if t1 is not None and t2 is not None:
                a1.append(float(t1))
                a2.append(float(t2))
        if len(a1) >= 3 and np.std(a1) > 0 and np.std(a2) > 0:
            r = float(np.corrcoef(a1, a2)[0, 1])
            sd_pooled = float(np.sqrt((np.var(a1, ddof=1) + np.var(a2, ddof=1)) / 2))
            sem = round(sd_pooled * np.sqrt(max(0.0, 1 - r)), 4)
            shift = round(float(np.mean(np.array(a2) - np.array(a1))), 4)
            reliable = r >= RELIABILITY_TARGET
        else:
            r, sem, shift, reliable = None, None, None, False
        if not reliable:
            all_reliable = False
        per_dimension[d] = {"r": None if r is None else round(r, 4), "sem": sem,
                            "practice_shift": shift, "n": len(a1), "reliable": bool(reliable)}
    return {"candidates": n_pairs, "per_dimension": per_dimension,
            "reliability_target": RELIABILITY_TARGET,
            "all_dimensions_reliable": bool(all_reliable)}


def results_memo(m: dict) -> str:
    lines = [
        "# S3 results memo — test–retest reliability",
        "",
        f"Candidates with two equated attempts: {m['candidates']} · target r ≥ {m['reliability_target']}",
        "",
        "| Dimension | r | SEM | practice shift | reliable |",
        "| --- | --- | --- | --- | --- |",
    ]
    for d, v in m["per_dimension"].items():
        lines.append(f"| {d} | {v['r']} | {v['sem']} | {v['practice_shift']} | {'YES' if v['reliable'] else 'NO'} |")
    lines += [
        "",
        "## What this result does NOT support",
        "- Stability over horizons longer than the study window (14–28 days).",
        "- Growth interpretation by itself — velocity claims additionally require ≥3 points and the GROWTH.md slope threshold.",
        "- Any dimension below target keeps PRISM_VELOCITY dark for trajectories involving that dimension.",
    ]
    return "\n".join(lines)


def run(conn=None, seed: int = 42) -> dict:
    seed_everything(seed)
    own = conn is None
    if own:
        conn = connect()
    if conn is None:
        return summarize("retest_s3", None, "insufficient_data", reason="no database configured")

    rows = fetch_all(conn, """
        SELECT t.candidate_id, t.session_id, t.attempt_no, t.scale_version, t.final_theta
          FROM assessment_timeline t
          JOIN study_sessions ss ON ss.session_id = t.session_id AND ss.is_synthetic = FALSE
          JOIN studies s ON s.study_id = ss.study_id AND s.study_key = 'test_retest'
         WHERE t.is_synthetic = FALSE AND t.candidate_id IS NOT NULL AND t.final_theta IS NOT NULL
    """)
    flagged = set()
    if rows:
        flagged = {str(r["session_id"]) for r in fetch_all(
            conn,
            "SELECT DISTINCT session_id FROM audit_log WHERE event_type = ANY(%s)",
            (list(INTEGRITY_EVENTS),),
        )}

    by_candidate = defaultdict(list)
    scale_by_candidate = defaultdict(set)
    for r in rows:
        if str(r["session_id"]) in flagged:
            continue  # protocol exclusion: integrity flags on either attempt
        dims = (r["final_theta"] or {}).get("dimensions") or {}
        thetas = {d: dims.get(d, {}).get("theta") for d in DIMENSIONS}
        by_candidate[str(r["candidate_id"])].append((int(r["attempt_no"] or 0), thetas))
        scale_by_candidate[str(r["candidate_id"])].add(r["scale_version"])

    pairs = {c: a for c, a in by_candidate.items() if len(a) >= 2 and len(scale_by_candidate[c]) == 1}
    inputs = {"tagged_rows": len(rows), "eligible_pairs": len(pairs), "min_required": MIN_CANDIDATES}
    if len(pairs) < MIN_CANDIDATES:
        res = insufficient("retest_s3", conn, inputs,
                           f"need >= {MIN_CANDIDATES} candidates with two equated attempts (have {len(pairs)})")
        if own and conn:
            conn.close()
        return res

    metrics = compute_retest(pairs)
    with conn.cursor() as cur:
        cur.execute("SELECT study_id FROM studies WHERE study_key = 'test_retest'")
        row = cur.fetchone()
        if row:
            cur.execute(
                """INSERT INTO study_results (result_id, study_id, metric_name, value, detail, n, analysis_version)
                   VALUES (%s,%s,%s,%s,%s,%s,%s)""",
                (str(uuid.uuid4()), row[0], "test_retest_reliability", None,
                 json.dumps(metrics), metrics["candidates"], ANALYSIS_VERSION),
            )
    run_id = write_run(conn, "retest_s3", inputs, {"metrics": metrics, "memo": results_memo(metrics)})
    res = summarize("retest_s3", run_id, "ok",
                    all_dimensions_reliable=metrics["all_dimensions_reliable"], candidates=metrics["candidates"])
    if own and conn:
        conn.close()
    return res


if __name__ == "__main__":
    print(json.dumps(run(), indent=2, default=str))
