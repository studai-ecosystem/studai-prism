"""Run every calibration job in dependency order against one DB connection.

  python run_all.py            # uses DATABASE_URL
  python run_all.py --seed 7

Each job writes its own unfrozen ``calibration_runs`` row. Nothing is frozen
automatically — a human reviews the dashboard and freezes a run before the Node
app (``PRISM_V2_EQUATING``) will apply it.
"""
from __future__ import annotations

import argparse
import json

from jobs import (
    channelB_train,
    conformal_refresh,
    dif_audit,
    equate,
    irt_fit,
    rasch_facets,
    reliability,
)
from jobs._base import connect

ORDER = [
    ("irt", irt_fit),
    ("rasch", rasch_facets),
    ("equate", equate),
    ("reliability", reliability),
    ("dif", dif_audit),
    ("conformal", conformal_refresh),
    ("channelB_train", channelB_train),
]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    conn = connect()
    results = []
    try:
        for name, mod in ORDER:
            try:
                results.append(mod.run(conn=conn, seed=args.seed))
            except Exception as exc:  # one job failing must not abort the rest
                results.append({"run_type": name, "status": "error", "error": str(exc)})
    finally:
        if conn is not None:
            conn.close()

    print(json.dumps({"runs": results, "db": conn is not None}, indent=2))


if __name__ == "__main__":
    main()
