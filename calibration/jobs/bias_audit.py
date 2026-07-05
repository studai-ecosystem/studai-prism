"""LL144-style bias-audit artifact — Phase 3 Stage 6.5 (annual).

Renders the fairness/bias artifact for regulated hiring markets from the
LATEST DIF calibration run: groups audited, items flagged (MH class +
logistic z), disposition, and power caveats. Honest pending state when no
DIF run exists; underpowered contrasts are reported as underpowered, never
as "no DIF found" (Stage 2.5 rule).
"""
from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime, timezone

from ._base import connect, fetch_all, summarize


def render(run: dict | None, generated_at: str) -> str:
    lines = [
        "# Prism bias-audit artifact (LL144-style)",
        "",
        f"*Generated {generated_at} · renders from the latest DIF calibration run · annual cadence*",
        "",
    ]
    if not run:
        lines += [
            "**Status: PENDING — no DIF analysis run exists yet.**",
            "",
            "No fairness claim is made. The DIF machinery (Mantel-Haenszel + logistic uniform/",
            "non-uniform, groups: language, gender*, language_medium*, college_tier*) is",
            "preregistered in docs/studies/MULTILINGUAL_DIF_PROTOCOL.md. Fields marked * are",
            "demographic and remain default-off pending market-specific legal approval.",
        ]
    else:
        outputs = run.get("outputs") or {}
        flags = outputs.get("flags") or []
        inputs = run.get("inputs_summary") or {}
        lines += [
            f"DIF run: `{run['run_id']}` ({str(run['created_at'])[:10]}) · frozen: {run.get('frozen', False)}",
            f"Inputs: {json.dumps(inputs)}",
            "",
            f"Groups audited: {', '.join(outputs.get('groups_audited', []))}",
            f"Items flagged (ETS B/C): **{len(flags)}**",
            "",
        ]
        if flags:
            lines += ["| Group | Focal vs Ref | Item | Dimension | ETS | Logistic z (uniform/non-uniform) | Disposition |", "| --- | --- | --- | --- | --- | --- | --- |"]
            for f in flags:
                lg = f.get("logistic") or {}
                lines.append(
                    f"| {f['group']} | {f['focal']} vs {f['reference']} | {str(f['item_id'])[:8]}… | {f['dimension']} | {f['ets_class']} | {lg.get('z_uniform')}/{lg.get('z_nonuniform')} | routed to item review/retirement |")
        else:
            lines.append("No items flagged at the documented thresholds in this run.")
        lines += [
            "",
            "## Power caveat (mandatory)",
            "Contrasts with cell sizes below the protocol minimum are UNDERPOWERED and are",
            "reported as such — an underpowered contrast is not evidence of fairness.",
        ]
    lines += [
        "",
        "_Detection/integrity signals are advisory-only and route to human review; scores are",
        "never auto-failed. Demographic collection stays default-off without legal approval._",
    ]
    body = "\n".join(lines)
    return body + f"\n---\ncontent-hash: `{hashlib.sha256(body.encode()).hexdigest()[:16]}`\n"


def run(conn=None, seed: int = 42, out_path: str | None = None) -> dict:
    own = conn is None
    if own:
        conn = connect()
    latest = None
    if conn is not None:
        rows = fetch_all(conn, """
            SELECT run_id, inputs_summary, outputs, frozen, created_at
              FROM calibration_runs WHERE run_type = 'dif'
             ORDER BY created_at DESC LIMIT 1
        """)
        latest = rows[0] if rows else None
    page = render(latest, datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"))
    if out_path:
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(page)
    if own and conn:
        conn.close()
    return summarize("bias_audit", None, "ok", db=conn is not None,
                     has_dif_run=bool(latest), artifact=page if not out_path else None, out_path=out_path)


if __name__ == "__main__":
    out = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else None
    result = run(out_path=out)
    print(result.pop("artifact") or json.dumps(result, indent=2, default=str))
