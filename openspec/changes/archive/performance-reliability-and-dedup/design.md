<!-- input: roadmap 0.3 goals + current wa-sqlite/IDB constraints -->
<!-- output: design + Gate B pre-coding checks -->
<!-- pos: change packet design doc (Gate B) -->
# Design: Performance, reliability, and dedup

## Problem Statement

- local-first storage is now central to the extension, but heavier use (large tables, frequent capture, long sessions) can stress:
  - write throughput (lots of cells/rows)
  - query latency for History filters
  - popup responsiveness during reads/writes
  - reliability when IndexedDB is unavailable or quotas are hit
- we need scalable primitives that keep behavior deterministic and testable:
  - optional dedup
  - write-path batching
  - indexes for common queries
  - backup/restore

## ADR 1: Dedup strategy baseline

Context:

- users may capture the same page repeatedly (pagination, refresh, auto-capture)
- storing identical data increases size and slows queries

Decision:

- introduce an optional “skip store if identical to last extraction in bucket” strategy (hash of normalized rows)

Tradeoffs:

- extra compute cost to hash rows
- must define normalization rules carefully to avoid false negatives/positives

Validation impact:

- add unit tests for hashing/normalization and “skip-store” behavior
- add/extend Playwright E2E to prove user-visible behavior remains correct

Migration and follow-up implications:

- may need a small schema addition for last-hash metadata or derived hash per extraction
- keep it optional and default-off until validated

## Pilot Gate B: Design-first validation (pre-coding checks)

Before coding, explicitly validate the design by answering:

- Edge cases and failure modes:
  - hashing unstable due to header order or whitespace differences
  - dedup incorrectly skipping a changed table (false positive)
  - IndexedDB unavailable/quota errors during store
- Determinism and scope:
  - unit of change: storage write path + query performance + backup/restore surfaces
  - unchanged: existing extraction UX + History/export correctness
- Stage Gate 1 seed (acceptance + trophy):
  - 2–3 core acceptance criteria seeds (testable statements):
    - when dedup is enabled, storing the same extraction twice does not increase extraction count
    - when table content changes, a new extraction is stored even with dedup enabled
    - when IndexedDB is unavailable, the UI shows a clear error and existing non-storage actions still work
  - Trophy candidate (or exemption):
    - proposed trophy test: Playwright extension E2E covering store → history count → store same again → count unchanged; then store changed table → count increments
    - command to run: `npm run test:pw`
- Verification plan:
  - unit: `npm run test:unit` for hash/dedup logic
  - E2E: `npm run test:pw` for end-to-end user behavior
  - governance: `npm run governance:readiness` when templates/packaging contracts change
- Fallback / rollback:
  - keep dedup behind a setting flag; default off; safe to disable without migrations

## Milestone Sizing Note

- one milestone should be one coherent WBS-style Level 3 execution slice
- one milestone should have one dominant validation story

## Milestone 1: Dedup baseline (pilot)

Goal:

- add optional dedup-by-identical-to-last per (domain + url pattern + schema) bucket

Execution slices:

- implement row normalization + hashing
- store/compare last-hash and skip writes when identical
- add unit tests + 1 trophy E2E path

Out of scope:

- primary-key-based dedup
- backup/restore

Touched systems:

- runtime
- tests

Entry context:

- `roadmap.md`
- `.codex/core/pilot-promotion.md`
- `.codex/core/validation-matrix.md`

Acceptance criteria:

- with dedup enabled, identical-to-last capture does not create a new extraction
- with dedup enabled, changed capture creates a new extraction

Validation package:

- runtime feature package + Playwright E2E

Persona review:

- none

Fallback note:

- ship behind flag; disable on any reliability regression

Next dependency:

- milestone 2 (batching + indexes)
