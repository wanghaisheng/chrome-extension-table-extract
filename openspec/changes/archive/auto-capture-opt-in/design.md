<!-- input: user request + current popup/store flows -->
<!-- output: design + Gate B checks -->
<!-- pos: change packet design doc (Gate B) -->
# Design: Auto-capture opt-in UX (SQLite)

## Problem Statement

- users expect “Add to SQLite” to be an opt-in that persists for the domain
- once opted in, opening the popup should store the current extraction automatically and reflect “Saved” status without manual clicks
- existing implementation risked double-writing if multiple layers attempted auto-capture

## ADR 1: Where auto-capture lives

Context:

- App owns fetching scrape results; Preview owns per-result actions and UI status.

Decision:

- implement auto-capture in Preview so it behaves like auto-clicking the existing “Add to SQLite” action:
  - same code path for manual and auto flows
  - status transitions are visible (Saving/Saved/Error)

Tradeoffs:

- Preview needs to query current web tab + domain-enabled flag
- must guard against multiple async triggers (state changes)

Validation impact:

- Playwright E2E should continue to pass for domain opt-in behavior
- add logging only as console warnings; no UX noise

## ADR 2: Persist opt-in before store

Context:

- popup close or store failures could prevent enabling auto-capture even after a user clicked the button.

Decision:

- in the “Add to SQLite” handler, persist `setDomainEnabled(domain, true)` before calling `storeExtraction`.

Tradeoffs:

- enables auto-capture even if the initial store fails; acceptable because user intent is explicit opt-in.

## Gate B pre-coding checks

- failure modes:
  - double store on a single popup open (fix via in-flight key guard)
  - focus/tab mismatch (handled by background “current web tab” endpoint)
- acceptance seeds:
  - after first click, subsequent popup opens store automatically without manual action
  - auto-capture does not double-write and UI reflects Saved

