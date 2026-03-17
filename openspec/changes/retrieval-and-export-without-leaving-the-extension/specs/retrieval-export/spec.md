# Retrieval & Export Spec

## Requirements

### R1. Search / Filter Saved Extractions

Acceptance:

- user can filter stored extractions by:
  - domain
  - URL substring
  - date range (start/end)
- filtering is deterministic and does not require re-scraping pages

### R2. Export a Stored Extraction

Acceptance:

- user can export a stored extraction in at least:
  - TSV
  - CSV
  - JSON
- export includes headers and rows as stored
- export works from local history (no navigation required)

### R3. Copy Stored Extraction to Clipboard

Acceptance:

- user can copy a stored extraction to clipboard (at minimum TSV)
- copy does not require re-scraping

### R4. Schema Evolution UX (Minimum)

Acceptance:

- schema version is visible for each extraction in list/detail UI

### R5. Optional Active Schema Pinning (Deferred by default)

Acceptance (optional / if implemented in this change):

- user can pin an “active schema” per domain for display and filtering
- pinning does not alter or delete existing stored data

### R6. Optional Schema Scope by Page Type using `url_pattern` (Design Direction)

Acceptance (optional / may be implemented in a follow-up change):

- schemas can be scoped to **(domain + url_pattern)** rather than domain-only
- example buckets:
  - `/products/*` has its own schema/version stream
  - `/users/*` has its own schema/version stream
- a schema bump in one `url_pattern` bucket does not affect other buckets under the same domain

## Non-Requirements

- no cloud sync
- no general SQL console

## Validation Notes

- Playwright should validate: filter → open → export/copy matches expected content
- unit tests should validate: serializer correctness and stable escaping rules (CSV)

