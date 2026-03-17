# Tasks

## Progress Snapshot

- source inputs: extension README and current extraction → Rows pipeline
- current state: change record created; design and schema direction drafted

## Packet Summary

- goal: add a wasm SQLite-backed storage path for extracted table data
- in scope: database schema, wasm SQLite initialization, write path, and UI button wiring
- out of scope: advanced querying UI, cross-device sync, complex retention logic
- upstream dependencies: `.codex/core` harness docs for milestone design and validation
- interface or delivery list: internal storage API and a user-facing "Add extracted data to SQLite" button
- acceptance criteria: extracted data is durably stored and can be retrieved via SQLite queries; existing Rows behavior is preserved
- validation package: runtime feature package from `validation-matrix.md`
- fallback note: if storage fails, feature can be disabled without affecting existing export
- linked docs: `openspec/changes/add-sqlite-storage-for-extracted-data/README.md`, `design.md`, `specs/sqlite/spec.md`

## Success Criteria and Test Suite

- end-to-end:
  - user can extract a table, click "Add extracted data to SQLite", and later query the wasm SQLite database to see matching domain, URL, headers, and cell values
  - "Open in Rows" continues to behave as documented in the project README (no regressions)
- SQLite behavior:
  - for two different URLs under the same domain with the same headers, data is stored under a shared schema
  - when headers change incompatibly, a new schema version is created and old data remains queryable and unchanged
- error handling:
  - when SQLite initialization or writes fail, the feature surfaces a clear error and does not block the existing Rows export pipeline
- test suite:
  - introduce an automated or scriptable test suite (e.g., Playwright or extension harness tests) that:
    - spins up a test page with deterministic table content
    - drives the extension to perform extraction and "Add to SQLite"
    - opens the wasm SQLite database and asserts on:
      - presence of domain, schema, extraction, and cell records
      - correct mapping between headers and cell values
    - runs at least one regression scenario covering "Open in Rows"

## Milestone Execution Loop

1. read the active change and relevant `.codex/core` docs
2. confirm the milestone still fits the sizing rule
3. implement one bounded milestone only
4. select the validation package from `validation-matrix.md`
5. run commands, inspect first failure, fix, and repeat
6. self-review against the active change and spec
7. apply persona review when required
8. update ADR content when durable decisions change
9. record what ran, what passed, and what remains unverified

## M1. Baseline SQLite Schema and Integration

- [x] M1.1 select and integrate a wasm SQLite library into the extension
- [x] M1.2 implement initialization logic to create the core tables if they do not exist
- [x] M1.3 add an internal storage API that accepts headers and row data and writes one extraction into the database
- [x] M1.4 validate stored data via automated E2E + debug query APIs
- [x] M1.5 add a basic automated test (or scriptable test harness) that writes a known extraction and asserts on the resulting SQLite records

## M2. Wire Extraction Flow and UI Button

- [x] M2.1 add a "Add extracted data to SQLite" button near the existing export UI
- [x] M2.2 connect the button to the storage API using the current extraction result structure
- [x] M2.3 handle storage errors gracefully and surface user-friendly messages
- [x] M2.4 verify that existing extraction → copy/export behavior remains unchanged
- [x] M2.5 extend the test suite to cover:
  - end-to-end click on the new button in a browser-like environment
  - failures in SQLite initialization or writes that fall back cleanly

## M3. Optional Schema Evolution and Documentation

- [x] M3.1 define how header changes produce new schema versions per domain
- [x] M3.2 implement schema version detection and creation logic
- [x] M3.3 document SQLite storage behavior and schema rules in the project README or a dedicated doc
- [x] M3.4 add test cases that:
  - simulate header changes for the same domain and assert that new schema versions are created
  - confirm old extractions remain queryable with the original schema definition

## Closeout Rule

- selected validation package:
  - Playwright extension E2E
  - Jest unit tests (sqlite core)
- commands that ran:
  - `npm run test:unit`
  - `npm run test:pw`
- pass or fail status:
  - pass
- residual risk:
  - extension automation can be timing-sensitive (popup reload / IndexedDB warmup); E2E uses polling/waits to reduce flakes
- ADR or doc follow-up required:
  - none

