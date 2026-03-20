<!-- input: openspec/PLAN.md + openspec/PLAN1.md + current repo state -->
<!-- output: milestone tasks + closeout contract -->
<!-- pos: change packet tasks -->
# Tasks

## Progress Snapshot

- source inputs:
  - `openspec/PLAN1.md` (remove default 20-row truncation)
  - `openspec/PLAN.md` (bulk export ordering)
- current state:
  - M1 implemented in code (export/copy read full rows; preview remains limited)
  - M2 not yet implemented (ordering rules not applied in merged export)

## Packet Summary

- goal: exports are complete and deterministic
- in scope:
  - `getExtractionTable` default semantics (no limit unless explicit)
  - History export ordering (added order; seq/index asc when detectable)
- out of scope:
  - scraping changes and auto-pagination
  - new UI beyond export correctness
- acceptance criteria:
  - bulk exports do not truncate at 20 rows
  - merged export ordering is stable and predictable; honors seq/index when present
- validation package:
  - `npm run test:unit`
  - `npm run check:syntax`
  - `npm run build`
  - optional: `npm run test:pw`
- linked docs:
  - `openspec/changes/history-export-correctness/README.md`
  - `openspec/changes/history-export-correctness/design.md`
  - `openspec/changes/history-export-correctness/specs/export/spec.md`

## Milestone Execution Loop

1. read the active change and relevant `.codex/core` docs
2. confirm the milestone still fits the sizing rule
3. implement one bounded milestone only
4. select the validation package from `validation-matrix.md`
5. run commands, inspect first failure, fix, and repeat
6. self-review against the active change and spec
7. update ADR content when durable decisions change
8. record what ran, what passed, and what remains unverified

## M1. Full-row export (remove implicit 20-row truncation)

- [x] M1.1 change `getExtractionTable` to default unlimited (limit only when explicit)
- [x] M1.2 update History export/copy/download call sites to omit `undefined`
- [x] M1.3 run `npm run test:unit` and `npm run build`

## M2. Stable export ordering (id asc, seq/index asc when present)

- [x] M2.1 sort bulk export extractions by `id ASC` regardless of UI ordering
- [x] M2.2 implement merged export stable sort with conservative seq/index detection
- [x] M2.3 add unit tests for seq detection + stable sorting
- [x] M2.4 optional: E2E export verification in Playwright extension tests

## Closeout Rule

- selected validation package
- commands that ran
- pass/fail status
- trophy evidence (at least 1 trophy, or explicit exemption)
  - trophy test: Jest unit for merged ordering
  - command: `npm run test:unit`
  - evidence: test suite pass output + file path
- acceptance criteria mapping (2 core AC seeds → evidence)
  - AC: full rows exported → evidence: unit or E2E assertion + manual spot-check
  - AC: stable ordering → evidence: unit test + sample CSV inspection
- Pilot Gate D (WAL updated):
  - `.codex/wal/entries/2026/2026-03-19_history-export-correctness.json`
