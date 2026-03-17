# Retrieval & Export without Leaving the Extension

## Status

- planned

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

- `roadmap.md` "Next (0.2) – Retrieval & export without leaving the extension"
- archived prerequisites:
  - `openspec/changes/archive/add-sqlite-storage-for-extracted-data/`
  - `openspec/changes/archive/local-first-history-and-controls/`

## Why This Change Exists

- history storage is useful only if users can **reuse** it: find the right extraction and export/copy it without revisiting the page
- users need basic retrieval tools (search/filter) and export formats (TSV/CSV/JSON) from inside the popup

## Relationship To Existing Changes

- builds on the existing SQLite schema and History UI
- adds retrieval/export APIs + UI flows; no storage schema rewrite required

## Validation Strategy

- Playwright E2E:
  - store at least one extraction
  - filter history and open a stored extraction
  - export to at least one format and verify contents
- unit tests:
  - export formatting (TSV/CSV/JSON)
  - filtering/query logic (domain/url/date)

