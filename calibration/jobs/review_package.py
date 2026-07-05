"""External-review package — Phase 3 Stage 2.6.

Assembles the manifest an independent psychometrician needs so that "they
never have to ask for a missing artifact": registry state, latest results +
memos, calibration runs, corpus counts, protocol docs, the frozen evidence
schema, the growth model doc, and the auditor-export endpoint. Renders
honestly when sections are pending. Read-only.
"""
from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime, timezone

from . import tech_manual
from ._base import connect, fetch_all, summarize

ARTIFACTS = [
    ("Evidence bundle schema (frozen)", "docs/evidence-bundle-schema-v1.json"),
    ("Growth model documentation", "server/psychometrics/GROWTH.md"),
    ("Pressure-probe registry", "docs/pressure-probes-v1.md"),
    ("S1 protocol", "docs/studies/STEERING_AB_PROTOCOL.md"),
    ("S2 protocol", "docs/studies/HUMAN_LLM_AGREEMENT_PROTOCOL.md"),
    ("S3 protocol", "docs/studies/TEST_RETEST_PROTOCOL.md"),
    ("S4 protocol", "docs/studies/ADVERSARIAL_PROTOCOL.md"),
    ("S5 protocol", "docs/studies/TRANSFER_PROTOCOL.md"),
    ("S6 protocol", "docs/studies/MULTILINGUAL_DIF_PROTOCOL.md"),
]


def render(data: dict, memos: list[dict], generated_at: str) -> str:
    lines = [
        "# Prism external-review package",
        "",
        f"*Assembled {generated_at} · read-only · every number renders from the database*",
        "",
        "## 1. How to verify independently",
        "- Auditor export (decision trails, votes, clamps, directives — PII-stripped):",
        "  `GET /api/credentials/audit-export?limit=N` (admin token from the founders).",
        "- Public credential verification incl. W3C VC form: `GET /api/credentials/{sessionId}/verify?format=vc`.",
        "- Signing public key: `GET /api/credentials/public-key`.",
        "",
        "## 2. Preregistered protocols (repo paths)",
    ]
    for label, path in ARTIFACTS:
        lines.append(f"- {label}: `{path}`")
    lines += ["", "## 3. Registry state (studies + immutable results)", ""]
    for key, title in tech_manual.STUDIES:
        s = data["studies"].get(key, {})
        results = s.get("results") or []
        if results:
            latest = results[-1]
            lines.append(f"- {title}: **{latest['metric_name']}** (n={latest['n']}, {latest['analysis_version']}, {str(latest['created_at'])[:10]})")
        else:
            lines.append(f"- {title}: PENDING — no result computed")
    lines += ["", "## 4. Analysis-run memos (latest per study job)", ""]
    if memos:
        for m in memos:
            lines.append(f"### {m['run_type']} ({str(m['created_at'])[:10]})")
            lines.append("")
            lines.append(m["memo"])
            lines.append("")
    else:
        lines.append("PENDING — no analysis runs with memos yet.")
    c = data.get("corpus") or {}
    lines += [
        "",
        "## 5. Corpus",
        f"- Real assessments: {c.get('real_assessments', 0)} · synthetic (excluded from all analyses): {c.get('synthetic_assessments', 0)}",
        f"- Item responses: {c.get('item_responses', 0)} · judge votes: {c.get('judge_votes', 0)} · human ratings: {c.get('human_ratings', 0)}",
        "",
        "_PENDING means exactly that. Nothing in this package is hand-written._",
    ]
    body = "\n".join(lines)
    return body + f"\n---\ncontent-hash: `{hashlib.sha256(body.encode()).hexdigest()[:16]}`\n"


def run(conn=None, seed: int = 42, out_path: str | None = None) -> dict:
    own = conn is None
    if own:
        conn = connect()
    data = tech_manual.gather(conn)
    memos = []
    if conn is not None:
        rows = fetch_all(conn, """
            SELECT run_type, outputs->>'memo' AS memo, created_at
              FROM calibration_runs
             WHERE outputs ? 'memo'
             ORDER BY created_at DESC LIMIT 10
        """)
        memos = [r for r in rows if r.get("memo")]
    page = render(data, memos, datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"))
    if out_path:
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(page)
    if own and conn:
        conn.close()
    return summarize("review_package", None, "ok", db=conn is not None,
                     memos=len(memos), pending=page.count("PENDING"),
                     package=page if not out_path else None, out_path=out_path)


if __name__ == "__main__":
    out = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else None
    result = run(out_path=out)
    print(result.pop("package") or json.dumps(result, indent=2, default=str))
