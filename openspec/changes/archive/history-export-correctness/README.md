<!-- input: openspec/PLAN.md + openspec/PLAN1.md + current shipped History/export behavior -->
<!-- output: OpenSpec change packet for History export correctness -->
<!-- pos: change packet README (Gate A) -->
# History export correctness (order + full rows)

## Status

- archived

## Harness Alignment

- follows `.codex/core/wbs-planning.md`
- follows `.codex/core/work-breakdown.md`
- follows `.codex/core/task-sizing.md`
- follows `.codex/core/milestone-design.md`
- follows `.codex/core/validation-matrix.md`
- follows `.codex/core/adr-rules.md`
- follows `.codex/core/persona-review.md`
- follows `.codex/core/closeout-loop.md`

## Source Context

- plan: `openspec/PLAN1.md` (remove implicit 20-row export truncation)
- plan: `openspec/PLAN.md` (bulk export ordering; prefer seq/index asc when present)

## Why This Change Exists

- bulk export previously truncated each extraction to 20 rows due to `getExtractionTable(..., undefined)` defaulting to 20
- bulk export ordering is currently driven by UI/filter ordering (typically `extracted_at DESC`), which can produce confusing cross-page results
- users expect deterministic exports:
  - full data rows (not silently truncated)
  - stable ordering, and when a seq/index column exists, numeric ascending order

## Relationship To Existing Changes

- aligns with local-first History/SQLite shipped behavior (no new storage engine)
- adjacent to: `openspec/changes/performance-reliability-and-dedup/` (storage stability and export flows)

## Pilot Gate A: Scope, Non-goals, Stop Conditions

Pilot scope (this change packet is the pilot unit):

- in scope boundaries:
  - History export surfaces (bulk JSON/CSV/TSV, single extraction download/copy)
  - `getExtractionTable` API semantics (limit vs unlimited)
  - deterministic ordering rules for exported rows
- out of scope boundaries:
  - auto-pagination scraping (collecting multiple pages automatically)
  - new scrapers or site-specific DOM logic
  - cloud sync

Non-goals (avoid scope creep):

- do not change how tables are scraped or parsed (only how stored data is read/exported)
- do not add new UI filters unrelated to export correctness

Stop conditions (when to pause/rollback instead of expanding):

- any regression in History flows (preview, filters, download) or SQLite stability
- evidence that ordering rules cause data loss or reordering within a single extraction

## Execution Model

- milestone 1: fix truncation semantics and ensure export/copy paths read full rows
- milestone 2: implement deterministic export ordering (insertion order; optional seq/index ascending)

## Validation Strategy

- Unit tests (`npm run test:unit`) for pure sorting/detection logic
- Playwright E2E (`npm run test:pw`) for user-visible export flows when practical
- Smoke: `npm run check:syntax` and `npm run build`

## Milestone Shape

1. M1. Full-row export (remove implicit 20-row truncation)
2. M2. Stable export ordering (id asc, seq/index asc when present)

## Linked docs

- `openspec/changes/history-export-correctness/README.md`
- `openspec/changes/history-export-correctness/design.md`
- `openspec/changes/history-export-correctness/tasks.md`
- `openspec/changes/history-export-correctness/specs/export/spec.md`
