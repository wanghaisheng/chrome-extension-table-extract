<!-- input: roadmap 0.3 + change packet README/design -->
<!-- output: durable, testable contract for scaling local-first -->
<!-- pos: durable spec under OpenSpec change packet -->
# Scaling (0.3): performance, reliability, and dedup

## Scope

This spec defines the contract for improving local-first scaling, covering:

- optional dedup strategies for repeated captures
- performance improvements for large tables (write batching, indexes)
- reliability behavior when IndexedDB is unavailable or quota is exceeded
- backup/restore of the local SQLite database

## Non-goals

- cloud sync
- external services/accounts
- a wholesale schema redesign (unless required by performance and explicitly approved)

## Requirements

### R1. Dedup (optional, default off)

- R1.1 user can enable/disable dedup (setting is persisted)
- R1.2 when enabled, storing an extraction identical to the last stored extraction in the same bucket does not create a new extraction record
- R1.3 when enabled, storing a changed extraction creates a new extraction record
- R1.4 dedup is scoped to the same bucket: (domain + url pattern + schema version)

### R2. Performance

- R2.1 large table inserts do not freeze the popup UI beyond an acceptable bound (define benchmark expectations in `reports/bench/`)
- R2.2 History queries for common filters remain fast under larger datasets (indexes as needed)

### R3. Reliability

- R3.1 if IndexedDB is unavailable/quota errors occur, the UI shows a clear error message
- R3.2 failures do not corrupt existing data; existing History/export flows remain usable when possible

### R4. Backup/restore

- R4.1 user can export a backup artifact of the local DB (download)
- R4.2 user can restore from a backup artifact (upload) and recover History + export correctness
- R4.3 restore has an explicit confirmation step and clear success/failure feedback

## Acceptance tests (high level)

- Trophy E2E: enable dedup → store → store same again → count unchanged → store changed → count increments.
- E2E: backup → clear all → restore → History shows prior items and export/copy works.
- Unit: normalization/hash stable across benign formatting differences; skips only when truly identical.

