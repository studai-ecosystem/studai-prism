# Prism v2 (MASA-2) — Phase 3 calibration jobs

Offline psychometric calibration for Prism v2. Each job reads PostgreSQL
(the same DB the Node server writes telemetry to) and writes ONE
`calibration_runs` row. **Jobs never write to live scoring tables** — the Node
server reads frozen `calibration_runs` only.

> Per the System Spec, run these **after ≥ ~300 sessions** have accumulated.
> With less data the jobs run but emit `status: "insufficient_data"` and write a
> provisional (unfrozen) run row so the dashboard still renders.

## Jobs

| Script | Purpose | Writes run_type |
|---|---|---|
| `irt_fit.py` | Graded-response IRT on item micro-levels → per-item a, b + misfit flags | `irt` |
| `rasch_facets.py` | Many-facet Rasch: candidate θ + item difficulty + scenario severity | `rasch` |
| `equate.py` | Per-scenario equating constant κ (severity correction) | `equate` |
| `dif_audit.py` | Mantel–Haenszel DIF by gender / language-medium / college-tier | `dif` |
| `reliability.py` | Variance-components G-coefficient (person/scenario/residual) | `reliability` |
| `conformal_refresh.py` | Rebuild the conformal CI quantile table from human_ratings | `conformal` |
| `channelB_train.py` | LightGBM per-dimension on behavioral_features vs human_ratings (LOO-CV) | `channelB_train` |

## Setup

```bash
cd calibration
python -m venv .venv
.venv\Scripts\activate           # Windows
pip install -r requirements.txt
# DB connection (same as the server):
set DATABASE_URL=postgres://postgres:postgres@localhost:5432/prism
python -m jobs.irt_fit           # or any job module
python run_all.py                # run every job in order
```

Every job: deterministic seed (`PRISM_SEED`, default 42), prints a run-summary
JSON, and inserts an unfrozen `calibration_runs` row. A human freezes a run
(sets `frozen=true`) before the Node app will apply it (`PRISM_V2_EQUATING`).
