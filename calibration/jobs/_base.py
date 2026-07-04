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


def fetch_all(conn, sql: str, params: tuple = ()):  # pragma: no cover - thin
    with conn.cursor() as cur:
        cur.execute(sql, params)
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


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
