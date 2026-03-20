<!-- input: openspec/PLAN.md + openspec/PLAN1.md + current History/export implementation -->
<!-- output: design + Gate B pre-coding checks -->
<!-- pos: change packet design doc (Gate B) -->
# Design: History export correctness (order + full rows)

## Problem Statement

- exporting stored data must be deterministic and complete
- previously, callers attempted to read “all rows” by passing `undefined`, but `getExtractionTable` interpreted it as default `20`
- exports can appear “randomly ordered” when multiple extractions are merged (especially across pages)

## ADR 1: `getExtractionTable` limit semantics

Context:

- we need `getExtractionTable` for two distinct use cases:
  - preview: show a small slice (fast)
  - export/copy: return the full extraction (complete)

Decision:

- define API semantics as:
  - `getExtractionTable(id)` / `getExtractionTable(id, undefined)` → no limit (all rows)
  - `getExtractionTable(id, N)` where N is finite number → limit to N rows
- preview callers must explicitly pass `20` (or any desired limit)

Tradeoffs:

- requires updating call sites that previously relied on defaulting
- removes the “hidden” behavior that silently truncated exports

Validation impact:

- unit tests remain unchanged; correctness proven by:
  - exporting an extraction with >20 rows returns all rows
  - preview still limits rows when explicitly requested

## ADR 2: Bulk export ordering model

Context:

- users expect exports to preserve “added order”; if a seq/index column exists, numeric ascending order should be honored
- History UI ordering is currently driven by query defaults (e.g., latest-first), which is not always desirable for exports

Decision:

- define two ordering layers for merged export (CSV/TSV):
  1) extraction order baseline: `extractions.id ASC` (stable “added order”)
  2) optional row ordering: if a seq/index column can be detected reliably, sort merged rows by that numeric value ascending
     - rows with unparseable seq values go last, preserving original relative order
- JSON bulk export:
  - only reorder the extraction list to `id ASC`
  - do not perform global seq sorting across extractions (preserve per-extraction semantics)

Tradeoffs:

- seq detection can be ambiguous; must be conservative (prefer correctness over cleverness)
- global seq sorting changes cross-extraction ordering; acceptable only for merged export formats that already flatten data

Validation impact:

- add a pure unit-testable function for:
  - candidate header detection (`序号`, `编号`, `No`, `#`, `index`, and empty header)
  - “parseable ratio >= threshold” selection (default 80%)
  - stable sort behavior
- optional Playwright E2E verifies exported CSV/TSV order on a known fixture

## Pilot Gate B: Design-first validation (pre-coding checks)

- Edge cases and failure modes:
  - large exports: avoid O(n²) sorts or repeated parsing in hot paths
  - seq column missing: must fall back to insertion order (no reorder surprises)
  - seq column partially missing: missing/unparseable values must not break ordering (append to end)
- Determinism and scope:
  - unit of change: History export ordering and table read API semantics
  - unchanged: scraping logic, storage schema, History filter behavior
- Stage Gate 1 seed (acceptance + trophy):
  - AC seed 1: bulk CSV/TSV/JSON export includes all stored rows for each extraction (no implicit 20-row truncation)
  - AC seed 2: merged export is stable; baseline is “added order”, and when seq/index is present, rows sort numeric ascending
  - trophy candidate:
    - unit trophy: Jest test for seq detection + stable sort (new test file)
    - command to run: `npm run test:unit`
- Verification plan:
  - `npm run check:syntax`
  - `npm run test:unit`
  - `npm run test:pw` (optional when export behavior is exercised in extension E2E)
- Fallback / rollback:
  - keep seq sorting behind conservative detection; if detection is wrong, disable seq sorting and keep insertion order
