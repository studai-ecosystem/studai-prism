# ECOSYSTEM SEPARATION POLICY v1 — conflict of interest (charter §18)

**DRAFT — pending founder adoption and external-advisory review.** The
technical controls below are LIVE and test-enforced; the policy text awaits
formal adoption.

## The conflict

StudAI builds both learning products (Loop, Career) and Prism, an assessment.
If the assessor also sells the remedy, both lose credibility. This policy
separates them.

## Rules

1. **Item security.** Prism scenarios, anchor probes, scoring rubrics and
   calibration data are access-restricted (admin RBAC: `scenarios:*`,
   `items:*`, `prompts:*`, `calibrations:*` — psychometric roles only) and
   every read of the item bank or prompt content writes an immutable
   `admin_audit_events` row (`item_bank_accessed`, `prompt_content_accessed`)
   — live since Phase 3.
2. **No training on live items.** StudAI Loop, Career or any other product
   may not train models, generate content, or derive practice material
   directly from live Prism items, transcripts or rubrics. There is no
   shared datastore; any future data sharing requires a written decision
   recorded in the human-action register.
3. **Training materials may not reveal anchors.** No StudAI product may
   publish or hint at anchor-probe wording or scoring signals.
4. **No guaranteed-improvement marketing.** Learning-product marketing may
   not claim guaranteed Prism-score improvement; Prism reports and marketing
   may not automatically recommend a StudAI training product as the remedy
   for a low profile (no cross-sell on report surfaces — CI-scanned copy).
5. **Science governance.** Prism science decisions (flag flips, claims,
   study conclusions) require Prism science governance with external
   advisory participation (HA-008, HA-013, HA-014) — never a product/growth
   decision.
6. **Independent validation preferred.** Where practical, validation studies
   engage external raters/reviewers rather than StudAI staff.

## Enforcement points (existing, verifiable)

- RBAC role catalogue (`server/lib/adminRbac.js`) — no cross-product roles.
- Read-audit rows on bank/prompt access (governance tests).
- Claims-ceiling CI suite bans improvement-guarantee language on all public
  copy.
- ONE LAW: agents flip no flags; science claims gated by flip-check.
