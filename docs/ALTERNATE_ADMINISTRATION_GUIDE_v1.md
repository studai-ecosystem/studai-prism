# ALTERNATE ADMINISTRATION GUIDE v1

Charter §13 companion to [ACCOMMODATIONS_POLICY_v1.md](./ACCOMMODATIONS_POLICY_v1.md).
**DRAFT — legal text pending DPDP review (HA-005).** Operational flow is LIVE.

## Modes (approved per candidate, per session)

| Mode | Effect |
| --- | --- |
| `textOnly` | Voice input disabled; typed responses only. Typing-cadence telemetry still applies; no scoring difference is claimed. |
| `noCamera` | Camera checks skipped, including the room scan step. Integrity tri-status computes from remaining signals. |
| `reducedProctoring` | Minimum proctoring surface for the session. |

## Operational flow

1. Candidate requests via the Briefing screen (free text, ≤2000 chars) —
   visible ONLY to admins holding `accommodations:read` (sensitive: may
   reference disability), never on buyer surfaces, erased with the session.
2. Admin decides (`accommodations:manage`): approve with modes, or deny with
   a note. Decisions are write-once.
3. At `/start`, approved modes apply automatically
   (`session.administrationMode`); the client adapts (e.g., VerifyIdentity
   skips the room scan on `noCamera`).
4. **Material judgment.** The deciding admin marks whether the alternate
   administration materially changes score interpretation. Only then does
   the report/bundle/verify surface carry the neutral disclosure sentence
   (`ALTERNATE_ADMINISTRATION_DISCLOSURE`) — never the type or reason
   (leak-tested in CI).

## Rules for buyers

Alternate administration is context, not signal: filtering, scoring or
inferring anything from it is prohibited (PROHIBITED_USES_POLICY_v1 §5).
