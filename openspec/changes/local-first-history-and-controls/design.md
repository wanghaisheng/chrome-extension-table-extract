# Design: Local-first History and Domain Controls

## Problem Statement

- local capture exists, but management is missing:
  - users cannot review recent extractions from inside the extension
  - users cannot easily disable auto-capture for a domain after opt-in
  - users cannot delete stored extractions for a domain or clear local storage
- without visibility and controls, local-first storage can feel risky (especially with sensitive data)

## ADR 1: Add Read/Manage Surfaces Without Changing Storage Schema

Context:

- the existing storage schema (domains/schemas/extractions/cells) is sufficient for history views and deletion
- the near-term goal is to add **management**, not to redesign storage

Decision:

- keep the current schema as-is
- add a small query layer for:
  - listing recent extractions
  - listing domains and auto-capture enabled status
  - deleting by domain / deleting all
- keep domain opt-in state as the source for auto-capture status, surfaced in UI

Tradeoffs:

- pros: low risk; avoids migrations; faster delivery
- cons: the popup UI may become crowded; may need a dedicated history page later

Validation impact:

- E2E tests can validate flows via UI and confirm persisted state changes (history count, domain toggles)

## ADR 2: Deletion and Retention are First-class User Controls

Context:

- storage limits vary by browser and profile; repeated auto-capture can grow rapidly
- users may store PII and require quick deletion

Decision:

- provide:
  - delete all data for a domain
  - clear all local stored data
  - optional retention policy (default off initially or conservative)

Tradeoffs:

- pros: improves trust, safety, and reduces quota risk
- cons: requires careful UX and clear confirmation steps

## Milestone 1: History Queries + Minimal History UI

Goal:

- show recent extractions with enough metadata to be useful

Execution slices:

- query API: list recent extractions (domain/url/extracted_at/row_count)
- UI: a "History" view in popup with a list of recent items
- UI: extraction detail view showing a small preview (first N rows)

Acceptance criteria:

- after storing an extraction, it appears in the history list
- selecting an item shows a consistent preview

Validation package:

- Playwright E2E for store → visible in history → detail preview renders

## Milestone 2: Domain Controls + Per-domain Delete

Goal:

- let users control auto-capture and delete stored data per domain

Execution slices:

- UI: list domains with enabled/disabled toggle
- action: disable auto-capture for domain
- action: delete domain history (with confirmation)

Acceptance criteria:

- disabling a domain prevents auto-capture on subsequent pages under that domain
- deleting a domain removes its extractions from history

Validation package:

- Playwright E2E covering toggle + delete behavior

## Milestone 3: Retention + Clear All + UX Polish

Goal:

- prevent unbounded growth and provide safety controls

Execution slices:

- retention policy option (e.g., keep last N extractions per domain)
- clear all local data action
- UX polish: clear status messages, confirmations, and empty states

Acceptance criteria:

- retention reduces stored extractions as configured
- clear all removes all history and disables auto-capture defaults as specified

