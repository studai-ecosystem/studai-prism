"""Channel-B (behavioral) model training.

Trains one gradient-boosted regressor per dimension that maps the behavioral
feature vector (``behavioral_features.features``) to the gold human rating, with
leave-one-out cross-validation so small anchor sets do not overstate accuracy.
LightGBM is used when available; otherwise a deterministic ridge-regression
fallback keeps the job runnable. The Node app keeps Channel B in SHADOW until a
run here is frozen. Writes run_type='channelB_train'.
"""
from __future__ import annotations

from collections import defaultdict

import numpy as np

from ._base import DIMENSIONS, connect, fetch_all, insufficient, seed_everything, summarize, write_run

MIN_LABELLED = 25


def _flatten(features: dict) -> dict[str, float]:
    flat = {}
    for k, v in (features or {}).items():
        if isinstance(v, (int, float)):
            flat[k] = float(v)
        elif isinstance(v, dict):
            for k2, v2 in v.items():
                if isinstance(v2, (int, float)):
                    flat[f"{k}.{k2}"] = float(v2)
    return flat


def _design_matrix(rows: list[dict]):
    keys = sorted({k for r in rows for k in _flatten(r["features"])})
    X = np.array([[_flatten(r["features"]).get(k, 0.0) for k in keys] for r in rows], dtype=float)
    return X, keys


def _loo_predict(X: np.ndarray, y: np.ndarray, seed: int) -> np.ndarray:
    """Leave-one-out predictions; LightGBM if present, else ridge."""
    n = len(y)
    preds = np.zeros(n)
    try:
        import lightgbm as lgb  # noqa
        have_lgb = True
    except ImportError:
        have_lgb = False
    for i in range(n):
        mask = np.arange(n) != i
        Xtr, ytr, xte = X[mask], y[mask], X[i:i + 1]
        if have_lgb and len(ytr) >= 8:
            model = lgb.LGBMRegressor(n_estimators=80, max_depth=3, learning_rate=0.08,
                                      random_state=seed, verbose=-1)
            model.fit(Xtr, ytr)
            preds[i] = float(model.predict(xte)[0])
        else:
            preds[i] = _ridge_predict(Xtr, ytr, xte)
    return preds


def _ridge_predict(Xtr, ytr, xte, lam: float = 1.0) -> float:
    Xb = np.hstack([np.ones((len(Xtr), 1)), Xtr])
    xb = np.hstack([[1.0], xte.ravel()])
    A = Xb.T @ Xb + lam * np.eye(Xb.shape[1])
    w = np.linalg.solve(A, Xb.T @ ytr)
    return float(xb @ w)


def run(conn=None, seed: int = 42) -> dict:
    seed_everything(seed)
    own = conn is None
    if own:
        conn = connect()
    feats = ratings = []
    if conn is not None:
        feats = fetch_all(conn, "SELECT session_id, features FROM behavioral_features WHERE features IS NOT NULL")
        ratings = fetch_all(conn, "SELECT session_id, dimension, score FROM human_ratings")

    feat_by_session = {str(f["session_id"]): f["features"] for f in feats}
    labels: dict[str, dict[str, float]] = defaultdict(dict)
    for r in ratings:
        if r.get("score") is not None and r.get("dimension"):
            labels[str(r["session_id"])][r["dimension"]] = float(r["score"])

    inputs = {"feature_sessions": len(feat_by_session), "labelled_sessions": len(labels),
              "min_labelled": MIN_LABELLED}
    joined = [(sid, feat_by_session[sid], labels[sid]) for sid in labels if sid in feat_by_session]
    if len(joined) < MIN_LABELLED:
        res = insufficient("channelB_train", conn, inputs,
                           f"only {len(joined)} sessions with both features and labels")
        if own and conn:
            conn.close()
        return res

    metrics = {}
    for dim in DIMENSIONS:
        rows = [{"features": f, "y": lab[dim]} for _, f, lab in joined if dim in lab]
        if len(rows) < MIN_LABELLED:
            metrics[dim] = {"status": "insufficient", "n": len(rows)}
            continue
        X, keys = _design_matrix(rows)
        y = np.array([r["y"] for r in rows], dtype=float)
        preds = _loo_predict(X, y, seed)
        mae = float(np.mean(np.abs(preds - y)))
        rmse = float(np.sqrt(np.mean((preds - y) ** 2)))
        ss_res = float(np.sum((preds - y) ** 2))
        ss_tot = float(np.sum((y - np.mean(y)) ** 2)) or 1.0
        metrics[dim] = {"status": "ok", "n": len(rows), "loo_mae": round(mae, 4),
                        "loo_rmse": round(rmse, 4), "loo_r2": round(1 - ss_res / ss_tot, 4),
                        "n_features": len(keys)}

    outputs = {"dimensions": metrics,
               "trained": [d for d, m in metrics.items() if m.get("status") == "ok"]}
    run_id = write_run(conn, "channelB_train", inputs, outputs)
    res = summarize("channelB_train", run_id, "ok", trained=len(outputs["trained"]))
    if own and conn:
        conn.close()
    return res


if __name__ == "__main__":
    run()
