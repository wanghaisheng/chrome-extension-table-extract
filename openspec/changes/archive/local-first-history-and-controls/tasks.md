# Tasks

## Progress Snapshot

- source inputs: `roadmap.md` Next (0.1) + existing local-first capture implementation
- current state: change record created; ready to implement management surfaces

## Packet Summary

- goal: make local-first storage visible and manageable inside the extension
- in scope:
  - history list + extraction detail preview
  - per-domain auto-capture enable/disable controls
  - delete domain data and clear all data
  - optional retention policy (bounded, safe defaults)
- out of scope:
  - advanced analytics or full SQL console UI
  - cross-device sync
- upstream dependencies:
  - `openspec/changes/archive/add-sqlite-storage-for-extracted-data/`
- interface or delivery list:
  - query/delete APIs
  - popup UI (or dedicated extension page if needed)
  - automated tests
- acceptance criteria:
  - users can see stored extractions and control/delete them
  - auto-capture can be disabled per domain and takes effect immediately
- validation package:
  - Playwright extension E2E + unit tests for core logic
- linked docs:
  - `README.md`, `design.md`, `specs/history/spec.md`

## Success Criteria and Test Suite

- history:
  - storing an extraction makes it appear in History UI with correct metadata
  - user can open a stored extraction and see a preview
- controls:
  - domain auto-capture can be toggled on/off and is persisted
  - delete domain removes that domain’s extractions
  - clear all removes all stored extractions and resets controls as specified
- tests:
  - Playwright E2E covering:
    - store → history visible → detail preview
    - disable domain → no further auto-capture
    - delete domain / clear all
  - unit tests for retention and deletion query logic

## Milestone Execution Loop

1. read the active change and relevant `.codex/core` docs
2. confirm the milestone still fits the sizing rule
3. implement one bounded milestone only
4. select the validation package from `validation-matrix.md`
5. run commands, inspect first failure, fix, and repeat
6. self-review against the active change and spec
7. update ADR content when durable decisions change
8. record what ran, what passed, and what remains unverified

## M1. History Queries + Minimal History UI

- [x] M1.1 add query APIs to list recent extractions and load preview rows
- [x] M1.2 build a History view in the popup UI
- [x] M1.3 build an Extraction detail view with preview
- [x] M1.4 add Playwright E2E test: store → history visible → detail preview

## M2. Domain Controls + Per-domain Delete

- [x] M2.1 add domain list + auto-capture toggle UI
- [x] M2.2 implement disable/enable domain behavior (persistent)
- [x] M2.3 implement delete domain data (with confirmation)
- [x] M2.4 add Playwright E2E tests for toggle + delete domain

## M3. Retention + Clear All + UX Polish

- [x] M3.1 implement optional retention policy (keep last N per domain)
- [x] M3.2 implement clear all local data (with confirmation)
- [x] M3.3 polish UX: empty states, success/error feedback
- [x] M3.4 unit tests for retention and deletion behavior

## Closeout Rule

- selected validation package:
  - Playwright extension E2E
  - Jest unit tests (core + retention logic)
- commands that ran:
  - `npm run test:unit`
  - `npm run test:pw`
- pass or fail status:
  - pass
- residual risk:
  - IndexedDB / extension popup timing can be flaky under automation; E2E uses polling/waits to reduce flakes
  - destructive actions rely on browser confirmation dialogs
- ADR or doc follow-up required:
  - none

