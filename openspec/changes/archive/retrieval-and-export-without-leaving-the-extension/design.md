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

## ADR 3: Use `url_pattern` to Scope Schemas by Page Type (Future-proofing)

Context:

- some sites expose multiple “page types” under the same domain (e.g. `/products/*` vs `/users/*`)
- headers can legitimately differ by page type; if schema is scoped only to domain, a small page-type variation can bump the domain-wide active schema version and degrade UX

Decision:

- treat schema scope as **(domain + url_pattern)** rather than domain-only
- use `schemas.url_pattern` as the “page type bucket” key
  - example: `/products/*` uses one schema stream; `/users/*` uses another
- schema versioning and “active schema” selection should operate within the same bucket, so a change in one bucket does not affect the others

Notes:

- this does not change stored data semantics; it changes how we *choose* the schema id on write and how we filter/pin schemas in UI
- the `url_pattern` can be:
  - a heuristic derived from path prefix (default)
  - or later a user-configurable mapping rule per domain (stretch)

## UX Notes

- add basic filters in History view (domain dropdown or text, url substring, date range)
- add export actions in detail view: Copy / Download (TSV/CSV/JSON)

