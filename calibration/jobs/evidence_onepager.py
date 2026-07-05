"""Evidence one-pager — Phase 3 Stage 5 sales support.

A single sales-facing page rendered ENTIRELY from the study registry and
calibration runs: kappa, conformal coverage, test-retest reliability, evasion
rate, DIF status — each with study N and date, or the word PENDING. It reuses
the Technical Manual's gather() so the two artifacts can never disagree.

Never generates copy above the Stage 3 ceilings: absent evidence renders as
"PENDING — no claim is made", and the ceiling wording ships alongside each
metric so sales can only quote what the registry backs.
"""
from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime, timezone

from . import tech_manual
from ._base import connect, summarize

# metric rows: (study_key, label, ceiling claim once landed)
ROWS = [
    ("human_llm_agreement", "AI-human scoring agreement (weighted κ)",
     'unlocks: "AI evaluation with human-expert-level agreement (κ=X.XX, N=YYY)"'),
    ("test_retest", "Test-retest reliability",
     'unlocks: growth measurement claims per GROWTH.md thresholds'),
    ("steering_ab", "Adaptive steering efficacy (evidence density)",
     'unlocks: "validated to increase skill-evidence density in our published study"'),
    ("adversarial_evasion", "Adversarial robustness (evasion rate @5% FPR)",
     'unlocks: "published adversarial robustness: current evasion rate X% (open benchmark)"'),
    ("sim_to_real_transfer", "Sim-to-real transferability (r)",
     'unlocks: transferability claims with the published correlation'),
    ("multilingual_dif", "Multilingual fairness (DIF flags)",
     'unlocks: "fairness-tested across [languages]" — per language only'),
]


def render(data: dict, generated_at: str) -> str:
    lines = [
        "# Prism — Evidence One-Pager",
        "",
        f"*Generated {generated_at} · renders from the immutable study registry · a claim without a registry entry is a bug*",
        "",
        "**Standing claim (live today):** cryptographically verifiable evidence chain on every credential — nothing stronger.",
        "",
        "| Evidence | Status | N | Date |",
        "| --- | --- | --- | --- |",
    ]
    for key, label, ceiling in ROWS:
        s = data["studies"].get(key, {})
        results = s.get("results") or []
        if results:
            latest = results[-1]
            lines.append(f"| {label} | **{latest['metric_name']} = {latest['value']}** | {latest['n'] or '—'} | {str(latest['created_at'])[:10]} |")
        else:
            lines.append(f"| {label} | PENDING — no claim is made | — | — |")
        lines.append(f"| | _{ceiling}_ | | |")
    c = data.get("corpus") or {}
    lines += [
        "",
        f"Corpus: {c.get('real_assessments', 0)} real assessments · {c.get('human_ratings', 0)} human anchor ratings · "
        f"{c.get('external_ratings', 0)} external live-exercise ratings · {c.get('active_credentials', 0)} active signed credentials.",
        "",
        "_Every number above renders from the database. PENDING means exactly that._",
    ]
    body = "\n".join(lines)
    return body + f"\n---\ncontent-hash: `{hashlib.sha256(body.encode()).hexdigest()[:16]}`\n"


def run(conn=None, seed: int = 42, out_path: str | None = None) -> dict:
    own = conn is None
    if own:
        conn = connect()
    data = tech_manual.gather(conn)
    page = render(data, datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"))
    if out_path:
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(page)
    if own and conn:
        conn.close()
    return summarize("evidence_onepager", None, "ok", db=conn is not None,
                     pending=page.count("PENDING"), chars=len(page),
                     page=page if not out_path else None, out_path=out_path)


if __name__ == "__main__":
    out = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else None
    result = run(out_path=out)
    print(result.pop("page") or json.dumps(result, indent=2, default=str))
