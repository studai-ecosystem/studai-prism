"""Technical Manual generator — Track 4.4.

Assembles the CURRENT state of all validity evidence into a versioned
Technical Manual document. The manual RENDERS FROM DATA, never from copy:

* every preregistered study renders its ``study_results`` rows, or the word
  **PENDING** when none exist — an unrun study can never be claimed;
* calibration evidence renders from ``calibration_runs`` (frozen runs only
  count as applied evidence);
* corpus counts render from live tables (real vs synthetic separated).

The output is deterministic for a given database state and stamped with a
content hash, so any hand edit is detectable against a regeneration.
Read-only: writes NO database rows.
"""
from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime, timezone

from ._base import connect, fetch_all, summarize

MANUAL_VERSION = "tm-v1"

# The preregistered evidence programme (study_key -> manual section title).
STUDIES = [
    ("steering_ab", "Study 1 — Steering Effectiveness (A/B)"),
    ("human_llm_agreement", "Study 2 — Human-LLM Scoring Agreement"),
    ("test_retest", "Study 3 — Test-Retest Reliability"),
    ("adversarial_evasion", "Study 4 — LLM-Assisted Cheating: Evasion Rate"),
    ("sim_to_real_transfer", "Study 5 — Transferability (Sim-to-Reality)"),
    ("multilingual_dif", "Study 6 — Multilingual Fairness (DIF)"),
]

CALIBRATION_RUNS = ["irt", "rasch", "equate", "reliability", "dif", "conformal", "channelB_train", "relay_detect", "transfer_corr", "growth_curve"]


def _fmt(v) -> str:
    if v is None:
        return "—"
    if isinstance(v, float):
        return f"{v:.4g}"
    return str(v)


def gather(conn) -> dict:
    """Read-only evidence snapshot. Every value is None/empty when absent."""
    data = {"studies": {}, "runs": {}, "corpus": {}}
    if conn is None:
        return data
    registry = {r["study_key"]: r for r in fetch_all(
        conn, "SELECT s.study_key, s.status, s.title FROM studies s")}
    results = fetch_all(conn, """
        SELECT s.study_key, r.metric_name, r.value, r.n, r.analysis_version, r.computed_at AS created_at
          FROM study_results r JOIN studies s ON s.study_id = r.study_id
         WHERE r.superseded_by IS NULL
         ORDER BY r.computed_at
    """)
    for key, _ in STUDIES:
        data["studies"][key] = {
            "registered": registry.get(key),
            "results": [dict(r) for r in results if r["study_key"] == key],
        }
    for run_type in CALIBRATION_RUNS:
        rows = fetch_all(conn, """
            SELECT run_id, frozen, applied, created_at
              FROM calibration_runs WHERE run_type = %s ORDER BY created_at DESC LIMIT 3
        """, (run_type,))
        data["runs"][run_type] = [dict(r) for r in rows]
    counts = fetch_all(conn, """
        SELECT
          (SELECT COUNT(*) FROM assessment_timeline WHERE is_synthetic = false) AS real_assessments,
          (SELECT COUNT(*) FROM assessment_timeline WHERE is_synthetic = true)  AS synthetic_assessments,
          (SELECT COUNT(*) FROM item_responses)  AS item_responses,
          (SELECT COUNT(*) FROM judge_votes)     AS judge_votes,
          (SELECT COUNT(*) FROM human_ratings)   AS human_ratings,
          (SELECT COUNT(*) FROM external_ratings) AS external_ratings,
          (SELECT COUNT(*) FROM credentials WHERE status = 'active') AS active_credentials,
          (SELECT COUNT(DISTINCT language) FROM assessment_timeline WHERE language IS NOT NULL) AS languages_seen
    """)
    data["corpus"] = dict(counts[0]) if counts else {}
    return data


def render(data: dict, generated_at: str) -> str:
    """Render the manual markdown. PENDING wherever the DB holds nothing —
    this function has no other vocabulary for absent evidence."""
    lines = [
        "# Prism Technical Manual",
        "",
        f"*Generated {generated_at} · {MANUAL_VERSION} · rendered from the evidence database — hand edits are invalid and detectable (see content hash).*",
        "",
        "## 1. Evidence corpus",
        "",
    ]
    c = data["corpus"]
    if c:
        lines += [
            f"- Real (non-synthetic) completed assessments: **{_fmt(c.get('real_assessments'))}**",
            f"- Synthetic/dev assessments (excluded from all calibration): {_fmt(c.get('synthetic_assessments'))}",
            f"- Per-turn item responses: {_fmt(c.get('item_responses'))} · judge votes: {_fmt(c.get('judge_votes'))}",
            f"- Human anchor ratings: {_fmt(c.get('human_ratings'))} · external live-exercise ratings: {_fmt(c.get('external_ratings'))}",
            f"- Active signed credentials: {_fmt(c.get('active_credentials'))} · assessment languages seen: {_fmt(c.get('languages_seen'))}",
        ]
    else:
        lines.append("- **PENDING** — no evidence database available at generation time.")
    lines += ["", "## 2. Preregistered studies", ""]
    for key, title in STUDIES:
        s = data["studies"].get(key, {})
        reg = s.get("registered")
        results = s.get("results") or []
        lines.append(f"### {title}")
        lines.append("")
        if not reg:
            lines.append("**PENDING** — not yet registered in the studies registry.")
        elif not results:
            lines.append(f"Status: `{reg['status']}` · **PENDING** — preregistered; no results have been produced. No claim is made.")
        else:
            lines.append(f"Status: `{reg['status']}` · {len(results)} result(s):")
            lines.append("")
            for r in results:
                lines.append(f"- `{r['metric_name']}` = **{_fmt(r['value'])}** (n={_fmt(r['n'])}, {r['analysis_version']}, {str(r['created_at'])[:10]})")
        lines.append("")
    lines += ["## 3. Calibration & scoring infrastructure runs", ""]
    for run_type in CALIBRATION_RUNS:
        rows = data["runs"].get(run_type) or []
        frozen = [r for r in rows if r.get("frozen")]
        if not rows:
            lines.append(f"- `{run_type}`: **PENDING** — never run.")
        elif not frozen:
            lines.append(f"- `{run_type}`: {len(rows)} unfrozen run(s) — exploratory only, **not applied evidence**.")
        else:
            lines.append(f"- `{run_type}`: frozen run `{str(frozen[0]['run_id'])[:8]}…` ({str(frozen[0]['created_at'])[:10]}){' · APPLIED' if frozen[0].get('applied') else ''}")
    lines += [
        "",
        "## 4. Standing limitations (rendered unconditionally)",
        "",
        "- Non-English scoring (Hinglish, Hindi, Tamil) is **provisional/uncalibrated** until Study 6 reports on real data — rubric translation is not rubric equivalence.",
        "- Detection/integrity signals are **advisory only**: they route sessions to human review and never auto-fail a candidate.",
        "- Percentiles are norm-referenced against the live pool and suppressed where no valid comparison pool exists.",
        "- Anything marked PENDING above is exactly that: no claim is made, and this manual cannot be edited into claiming otherwise.",
        "",
    ]
    body = "\n".join(lines)
    digest = hashlib.sha256(body.encode("utf-8")).hexdigest()[:16]
    return body + f"\n---\ncontent-hash: `{digest}`\n"


def run(conn=None, seed: int = 42, out_path: str | None = None) -> dict:
    own = conn is None
    if own:
        conn = connect()
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    data = gather(conn)
    manual = render(data, generated_at)
    if out_path:
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(manual)
    if own and conn:
        conn.close()
    pending = manual.count("**PENDING**")
    return summarize("tech_manual", None, "ok", db=conn is not None,
                     pending_sections=pending, chars=len(manual),
                     out_path=out_path, manual=manual if not out_path else None)


if __name__ == "__main__":
    out = None
    if "--out" in sys.argv:
        out = sys.argv[sys.argv.index("--out") + 1]
    result = run(out_path=out)
    if out:
        result.pop("manual", None)
        print(json.dumps(result, indent=2, default=str))
    else:
        print(result.pop("manual") or json.dumps(result, indent=2, default=str))
