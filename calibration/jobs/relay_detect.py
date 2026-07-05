"""Relay-detection classifier scaffolding (Track 3.3 — DARK).

Trains a logistic-regression classifier that separates ``honest`` from
``assisted`` (LLM-relay) sessions using the Track 3.1 behavioral features
(``behavioral_features.features``): latency distribution, latency-vs-complexity
residuals, typing cadence / revision counts, speech-onset delay.

HARD RULES (Track 3.3 / RULE 3 — never fabricate, never deploy):
  * Labels come ONLY from the preregistered adversarial study
    (``docs/studies/ADVERSARIAL_PROTOCOL.md``): sessions explicitly recruited
    into an honest or assisted arm, ``is_synthetic=true``. There is NO real
    labeled data before that study runs — with a real DB this job exits
    ``insufficient_data``.
  * ``--synthetic`` proves the pipeline end-to-end on GENERATED data that is
    marked synthetic in the output. It never touches the database.
  * Nothing here is wired into scoring. Detection output, when it ever exists,
    is ADVISORY: it routes a session to human review; it never auto-fails a
    candidate (Track 3.5).

Preregistered metric: evasion rate at 5%% false-positive rate (the fraction of
assisted sessions the classifier misses at a threshold set so at most 5%% of
honest sessions are flagged), plus ROC-AUC as the secondary.
"""
from __future__ import annotations

import json
import sys

import numpy as np

from ._base import connect, fetch_all, insufficient, seed_everything, summarize, write_run

MIN_LABELLED_PER_ARM = 30

# Feature vector pulled from the behavioral_features rollup (t3.1-v1 shape).
FEATURE_KEYS = [
    "latency.mean", "latency.median", "latency.sd", "latency.max",
    "latencyResiduals.absMean", "latencyResiduals.absMax",
    "typing.meanInterKeyMs.mean", "typing.revisionRatio",
    "typing.backspaceTotal", "typing.longPauseTotal",
    "voice.speechOnsetMs.mean", "voice.silenceGapTotal",
]


def _dig(d: dict, dotted: str):
    cur = d or {}
    for part in dotted.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return 0.0
        cur = cur[part]
    return float(cur) if isinstance(cur, (int, float)) else 0.0


def feature_vector(features: dict) -> list[float]:
    return [_dig(features, k) for k in FEATURE_KEYS]


# ── plain-numpy logistic regression (no extra deps, deterministic) ────────────
def train_logistic(X: np.ndarray, y: np.ndarray, lam: float = 1e-2, iters: int = 500):
    mu, sd = X.mean(axis=0), X.std(axis=0)
    sd[sd == 0] = 1.0
    Xs = np.hstack([np.ones((len(X), 1)), (X - mu) / sd])
    w = np.zeros(Xs.shape[1])
    for _ in range(iters):  # Newton-ish gradient steps
        p = 1 / (1 + np.exp(-Xs @ w))
        grad = Xs.T @ (p - y) / len(y) + lam * np.r_[0, w[1:]]
        w -= 0.5 * grad
    return {"w": w, "mu": mu, "sd": sd}


def predict_proba(model: dict, X: np.ndarray) -> np.ndarray:
    Xs = np.hstack([np.ones((len(X), 1)), (X - model["mu"]) / model["sd"]])
    return 1 / (1 + np.exp(-Xs @ model["w"]))


def evasion_at_fpr(y_true: np.ndarray, scores: np.ndarray, fpr_budget: float = 0.05) -> dict:
    """Threshold at <=5% of honest sessions flagged; report missed assisted."""
    honest = np.sort(scores[y_true == 0])[::-1]
    k = int(np.floor(fpr_budget * len(honest)))
    threshold = honest[k] + 1e-12 if k < len(honest) else -np.inf
    flagged = scores > threshold
    assisted = y_true == 1
    caught = int((flagged & assisted).sum())
    total = int(assisted.sum())
    return {
        "threshold": float(threshold),
        "evasion_rate_at_5fpr": round(1 - caught / total, 4) if total else None,
        "caught": caught,
        "assisted_total": total,
        "honest_flagged": int((flagged & ~assisted).sum()),
        "honest_total": int((~assisted).sum()),
    }


def roc_auc(y_true: np.ndarray, scores: np.ndarray) -> float:
    pos, neg = scores[y_true == 1], scores[y_true == 0]
    if not len(pos) or not len(neg):
        return float("nan")
    greater = (pos[:, None] > neg[None, :]).sum() + 0.5 * (pos[:, None] == neg[None, :]).sum()
    return round(float(greater / (len(pos) * len(neg))), 4)


def _split(X, y, rng, holdout=0.3):
    idx = rng.permutation(len(y))
    cut = int(len(y) * (1 - holdout))
    return X[idx[:cut]], y[idx[:cut]], X[idx[cut:]], y[idx[cut:]]


# ── synthetic self-test (no DB, no artifacts, marked synthetic) ───────────────
def synthetic_dataset(rng: np.random.Generator, n_per_arm: int = 120):
    """Generated feature rows exercising every pipeline stage. The separations
    encode the HYPOTHESISED relay signatures (assisted = slower, flatter,
    later speech onset) purely so the pipeline has structure to find — they
    are stand-ins, not findings."""
    def arm(n, latency_mu, resid_mu, onset_mu, revision_mu):
        rows = []
        for _ in range(n):
            lat = max(3000, rng.normal(latency_mu, 6000))
            rows.append({
                "latency": {"mean": lat, "median": lat * rng.uniform(0.85, 1.1),
                            "sd": abs(rng.normal(6000, 2000)), "max": lat * rng.uniform(1.3, 2.2)},
                "latencyResiduals": {"absMean": abs(rng.normal(resid_mu, resid_mu * 0.4)),
                                     "absMax": abs(rng.normal(resid_mu * 2.2, resid_mu * 0.7))},
                "typing": {"meanInterKeyMs": {"mean": abs(rng.normal(180, 60))},
                           "revisionRatio": min(0.9, abs(rng.normal(revision_mu, 0.05))),
                           "backspaceTotal": int(abs(rng.normal(revision_mu * 200, 25))),
                           "longPauseTotal": int(abs(rng.normal(3 if resid_mu > 9000 else 1, 1.2)))},
                "voice": {"speechOnsetMs": {"mean": abs(rng.normal(onset_mu, 700))},
                          "silenceGapTotal": int(abs(rng.normal(2 if onset_mu > 2500 else 1, 1)))},
            })
        return rows
    honest = arm(n_per_arm, latency_mu=24000, resid_mu=5000, onset_mu=1200, revision_mu=0.18)
    assisted = arm(n_per_arm, latency_mu=52000, resid_mu=16000, onset_mu=3400, revision_mu=0.05)
    X = np.array([feature_vector(r) for r in honest + assisted])
    y = np.array([0] * len(honest) + [1] * len(assisted))
    return X, y


def run(conn=None, seed: int = 42, synthetic: bool = False) -> dict:
    rng = seed_everything(seed)

    if synthetic:
        X, y = synthetic_dataset(rng)
        Xtr, ytr, Xte, yte = _split(X, y, rng)
        model = train_logistic(Xtr, ytr)
        scores = predict_proba(model, Xte)
        metrics = evasion_at_fpr(yte, scores)
        metrics["roc_auc"] = roc_auc(yte, scores)
        # Marked synthetic; nothing persisted, nothing deployable.
        return summarize("relay_detect", None, "synthetic_selftest_ok",
                         is_synthetic=True, n_train=len(ytr), n_test=len(yte),
                         feature_keys=FEATURE_KEYS, **metrics)

    own = conn is None
    if own:
        conn = connect()
    if conn is None:
        return summarize("relay_detect", None, "insufficient_data", reason="no database configured")

    # Labels ONLY from the preregistered adversarial study arms.
    rows = fetch_all(conn, """
        SELECT bf.session_id, bf.features, ss.arm
          FROM behavioral_features bf
          JOIN study_sessions ss ON ss.session_id = bf.session_id
          JOIN studies s ON s.study_id = ss.study_id
         WHERE s.study_key = 'adversarial_evasion'
           AND ss.arm IN ('honest', 'assisted')
           AND bf.features IS NOT NULL
    """)
    n_honest = sum(1 for r in rows if r["arm"] == "honest")
    n_assisted = sum(1 for r in rows if r["arm"] == "assisted")
    inputs = {"honest": n_honest, "assisted": n_assisted, "min_per_arm": MIN_LABELLED_PER_ARM}
    if min(n_honest, n_assisted) < MIN_LABELLED_PER_ARM:
        return insufficient("relay_detect", conn, inputs,
                            f"need >= {MIN_LABELLED_PER_ARM} labeled sessions per arm from the adversarial study")

    X = np.array([feature_vector(r["features"]) for r in rows])
    y = np.array([1 if r["arm"] == "assisted" else 0 for r in rows])
    Xtr, ytr, Xte, yte = _split(X, y, rng)
    model = train_logistic(Xtr, ytr)
    scores = predict_proba(model, Xte)
    metrics = evasion_at_fpr(yte, scores)
    metrics["roc_auc"] = roc_auc(yte, scores)
    run_id = write_run(conn, "relay_detect", inputs,
                       {"metrics": metrics, "feature_keys": FEATURE_KEYS,
                        "weights": [round(float(v), 6) for v in model["w"]]})
    return summarize("relay_detect", run_id, "ok", **metrics)


if __name__ == "__main__":
    result = run(synthetic="--synthetic" in sys.argv)
    print(json.dumps(result, indent=2, default=str))
