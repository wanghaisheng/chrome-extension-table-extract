# Roadmap (Local-first strategy)

This roadmap focuses on a **local-first** workflow: extracted data is persisted locally (SQLite on IndexedDB VFS), users explicitly opt-in per domain, and subsequent pages under the same domain can be auto-captured.

## Guiding principles

- **Local-first by default**: store on-device first; avoid requiring external accounts/services.
- **User control**: opt-in per domain; visible status; easy disable / delete.
- **Deterministic storage**: stable schema per domain with versioning when headers change.
- **Testable**: key flows covered by automated tests (Playwright E2E + unit tests).

## Now (shipped / current)

- Local persistence using SQLite (WASM) with IndexedDB VFS.
- "Add to SQLite" action in the popup UI.
- Domain opt-in + same-domain auto-capture on subsequent pages when extraction succeeds.
- Playwright E2E coverage for opt-in + auto-capture.

## Next (0.1) – Make storage visible and manageable

**Goal**: users can understand what is being stored, and control it.

- **History UI**
  - list recent extractions (domain, URL, timestamp, row count)
  - open an extraction detail view (preview first N rows)
- **Domain controls**
  - show per-domain auto-capture status (enabled/disabled)
  - disable auto-capture for a domain
  - delete all data for a domain
- **Data lifecycle**
  - optional retention policy (e.g., keep last N extractions per domain)
  - "Clear all local data" action
- **Validation**
  - Playwright: manage UI toggles + verify DB reflects changes

## Near-term (0.2) – Retrieval & export without leaving the extension

**Goal**: local storage becomes useful for reuse, not just archiving.

- **Search / filter**
  - filter by domain
  - filter by URL substring
  - filter by date range
- **Export**
  - export a stored extraction to TSV/CSV/JSON
  - copy stored extraction to clipboard
- **Schema evolution UX**
  - show schema version for each extraction
  - allow users to pin an “active schema” per domain (optional)
- **Validation**
  - unit tests for schema versioning scenarios
  - Playwright: export correctness for at least one domain

## Mid-term (0.3) – Performance, reliability, and dedup

**Goal**: safe scaling for heavier use.

- **Dedup strategy**
  - optional "skip storing if identical to last extraction" (hash rows)
  - optional "dedup by primary key column" per domain (user-configurable)
- **Performance**
  - batch insertion for large tables
  - indexes for common queries (domain/time/url)
- **Reliability**
  - graceful handling when IndexedDB is unavailable
  - backup/restore local DB (download/upload)
- **Validation**
  - benchmark page with large tables
  - stress tests for repeated pagination capture

## Longer-term (0.4+) – Extensibility & integrations (optional)

**Goal**: keep local-first, but allow optional power-ups.

- **Pluggable destinations**
  - add more exporters (e.g., local file, webhook, API)
- **Domain profiles**
  - per-domain mapping rules (rename columns, drop columns, normalize values)
  - per-domain capture policies (auto-capture conditions, retention)
- **Optional sync (explicit)**
  - export/import profiles
  - user-triggered sync to cloud (not default)

## Risks & decisions to track

- **MV3 CSP**: WebAssembly requires `wasm-unsafe-eval` for extension pages; keep this documented and reviewed.
- **Storage limits**: IndexedDB quotas vary; retention and clear controls should be first-class.
- **Data sensitivity**: local data may contain PII; provide clear messaging and deletion controls.

