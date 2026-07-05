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
    agreement_s2,
    bias_audit,
    channelB_train,
    conformal_refresh,
    dif_audit,
    equate,
    evidence_onepager,
    growth_curve,
    irt_fit,
    rasch_facets,
    relay_detect,
    reliability,
    retest_s3,
    review_package,
    tech_manual,
    transfer_corr,
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
    # Track 3.3 (dark): exits insufficient_data until the preregistered
    # adversarial study supplies labeled arms. Never deploys anything.
    ("relay_detect", relay_detect),
    # Track 4.3: prism-vs-external-rating correlation (sim-to-reality).
    ("transfer_corr", transfer_corr),
    # Track 1.2: latent growth curves from the candidate timeline (dark).
    ("growth_curve", growth_curve),
    # Phase 3 Stage 2: preregistered study analyses (insufficient until gated).
    ("agreement_s2", agreement_s2),
    ("retest_s3", retest_s3),
    # Phase 3 artifacts — render whatever the registry now holds, honestly.
    ("bias_audit", bias_audit),
    ("evidence_onepager", evidence_onepager),
    ("review_package", review_package),
    # Track 4.4: render the Technical Manual from whatever the DB now holds.
    ("tech_manual", tech_manual),
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
