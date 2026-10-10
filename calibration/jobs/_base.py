"""Shared plumbing for Prism v2 calibration jobs.

Every job:
  * seeds numpy with PRISM_SEED (default 42) for determinism,
  * reads PostgreSQL (DATABASE_URL) read-only,
  * writes exactly ONE unfrozen ``calibration_runs`` row (never a live table),
  * prints a run-summary JSON to stdout.

If DATABASE_URL is unset or psycopg is unavailable, ``connect()`` returns None
and jobs emit ``status='insufficient_data'`` so the package stays importable and
smoke-testable without a database.
"""
from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone

import numpy as np

DEFAULT_SEED = int(os.environ.get("PRISM_SEED", "42"))

# The five Prism dimensions (must match server/scoring/dualScorerConfig.js).
DIMENSIONS = [
    "structured_problem_solving",
    "adaptive_decisioning",
    "interpersonal_calibration",
    "metacognition",
    "integrity_under_pressure",
]


def seed_everything(seed: int = DEFAULT_SEED) -> np.random.Generator:
    """Seed global + return a dedicated Generator for reproducible draws."""
    np.random.seed(seed)
    return np.random.default_rng(seed)


def _normalize_dburl(url: str) -> str:
    # Node uses PGSSLMODE separately; strip any sslmode in the URL so psycopg
    # and node agree, then re-apply from PGSSLMODE if present.
    return url


def connect():
    """Return a psycopg connection, or None when no DB is configured."""
    url = os.environ.get("DATABASE_URL")
    if not url:
        return None
    try:
        import psycopg  # lazy: package stays importable without the driver
    except ImportError:
        return None
    kwargs = {}
    sslmode = os.environ.get("PGSSLMODE")
    if sslmode:
        kwargs["sslmode"] = sslmode
    return psycopg.connect(_normalize_dburl(url), autocommit=True, **kwargs)


# PROD-READY Phase 8: synthetic demo organizations (server/db/seedDemoOrg.js,
# migration 0061) must never enter a calibration run. Every row a job reads
# through fetch_all() that names a session owned by a demo account is dropped
# here, whatever the job's own SQL says. The demo session list is the
# database view ``demo_session_ids``; a database without it (before 0061)
# has no demo data.
SESSION_KEYS = ("session_id", "source_session_id", "candidate_session_id", "member_session_id")


def demo_session_ids(conn) -> frozenset:
    """Session ids owned by synthetic demo accounts (empty without the view)."""
    if conn is None:
        return frozenset()
    with conn.cursor() as cur:
        cur.execute("SELECT to_regclass('public.demo_session_ids') IS NOT NULL")
        (exists,) = cur.fetchone()
        if not exists:
            return frozenset()
        cur.execute("SELECT session_id FROM demo_session_ids")
        return frozenset(str(r[0]) for r in cur.fetchall())


def exclude_demo(rows: list, demo: frozenset) -> list:
    """Drop every row that names a demo session in any session column."""
    if not demo:
        return rows
    return [
        r for r in rows
        if not any(r.get(k) is not None and str(r.get(k)) in demo for k in SESSION_KEYS)
    ]


def fetch_all(conn, sql: str, params: tuple = ()):
    with conn.cursor() as cur:
        cur.execute(sql, params)
        cols = [d[0] for d in cur.description]
        rows = [dict(zip(cols, row)) for row in cur.fetchall()]
    return exclude_demo(rows, demo_session_ids(conn))


def write_run(conn, run_type: str, inputs_summary: dict, outputs: dict) -> str:
    """Insert one unfrozen calibration_runs row; return run_id (or a synthetic
    id when there is no DB so callers always have something to log)."""
    run_id = str(uuid.uuid4())
    if conn is None:
        return run_id
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO calibration_runs (run_id, run_type, inputs_summary, outputs, frozen)
            VALUES (%s, %s, %s, %s, false)
            """,
            (run_id, run_type, json.dumps(inputs_summary), json.dumps(outputs)),
        )
    return run_id


def summarize(run_type: str, run_id: str | None, status: str, **extra) -> dict:
    out = {
        "run_type": run_type,
        "run_id": run_id,
        "status": status,
        "ts": datetime.now(timezone.utc).isoformat(),
        **extra,
    }
    print(json.dumps(out))
    return out


def insufficient(run_type: str, conn, inputs_summary: dict, reason: str) -> dict:
    """Write a provisional run row and return an insufficient-data summary."""
    run_id = write_run(conn, run_type, inputs_summary, {"status": "insufficient_data", "reason": reason})
    return summarize(run_type, run_id, "insufficient_data", reason=reason)
