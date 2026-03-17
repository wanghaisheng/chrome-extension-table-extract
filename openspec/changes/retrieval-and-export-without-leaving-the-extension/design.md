# Design: Retrieval & Export without Leaving the Extension

## Problem Statement

- users can store history locally, but cannot efficiently **find** a prior extraction or **reuse** it without leaving the extension
- local-first value depends on easy retrieval and export/copy workflows

## ADR 1: Export from Stored Rows, Not Re-scrape

Decision:

- all export/copy flows read from SQLite `extraction_cells` + `schema_columns`
- do not depend on page content being available

Rationale:

- deterministic, works offline, aligns with local-first

## ADR 2: Keep Query API Bounded and Testable

Decision:

- implement small query primitives:
  - list/filter extractions (domain/url/date)
  - load full extraction table (already exists) for export
- implement pure serializers for TSV/CSV/JSON with unit tests

## UX Notes

- add basic filters in History view (domain dropdown or text, url substring, date range)
- add export actions in detail view: Copy / Download (TSV/CSV/JSON)

