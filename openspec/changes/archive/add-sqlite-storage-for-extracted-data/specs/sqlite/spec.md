# SQLite Storage Spec

## Requirements

### R1. Store Extracted Tables in a Wasm SQLite Database

Acceptance:

- when the user triggers the "Add extracted data to SQLite" action, the current extracted table is written into a wasm-backed SQLite database
- the write operation includes domain, URL, headers, and all cell values for the current extraction
- failures in SQLite initialization or writes do not break the existing Rows export flow

### R2. Keep a Stable Structure Per Domain with Optional Schema Versions

Acceptance:

- for a given domain, multiple URLs share a common column structure when headers match
- when headers change in a way that is incompatible with the existing schema, a new schema version is created instead of mutating old data
- it is possible to distinguish extractions by domain, URL, and schema version using SQLite queries

### R3. Use a Single Database and Generic Cell Storage

Acceptance:

- all extracted data is stored in a single SQLite database file managed by the extension
- the schema uses normalized tables for domains, schemas, extractions, and cell-level data rather than one table per site
- the database can be initialized from scratch without requiring migration from external tools

### R4. Domain-Level Auto Capture After First Opt-In

Acceptance:

- when the user manually triggers "Add extracted data to SQLite" for a given domain, that domain is marked as enabled for automatic capture
- for subsequent page loads under the same domain, once extraction succeeds, the extension automatically writes the extracted table into SQLite without requiring another button click
- automatic writes do not run for domains that have never been explicitly opted in by the user
- the user-visible "Add extracted data to SQLite" action is still available and behaves consistently with the automatic flow (no double writes or divergent behavior)

## Non-Requirements

- no requirement for a user-facing query or browsing UI in this change
- no requirement for cross-device sync or backup of the SQLite database
- no requirement for advanced indexing or performance tuning beyond basic correctness

## Validation Notes

- validation package should cover runtime feature changes for browser extensions
- manual inspection of the SQLite database to verify domain, schema, extraction, and cell records for at least two URLs under the same domain
- regression checks for the existing extraction/export flows to ensure they remain functional
- additional checks for R4:
- verify that, after a first manual opt-in on domain A, navigating to a second URL on domain A results in an automatic write when extraction succeeds
- verify that domains without prior opt-in never auto-write, even when extraction succeeds

