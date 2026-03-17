# Design: Add SQLite Storage for Extracted Data

## Problem Statement

- current extension only supports exporting extracted tables to Rows via TSV and `rows_x` localStorage payloads
- there is no durable, queryable local history of extractions across pages or sessions
- we want a way to store extracted tables per domain and URL in a wasm SQLite database without disrupting the existing Rows flow

## ADR 1: Use a Domain/Schema/Extraction Model in a Single SQLite Database

Context:

- each page extraction produces a table-like structure with headers and rows
- for a given domain, multiple URLs typically share the same column structure, but structures can evolve over time
- we are running SQLite in the browser via wasm, so schema changes and migrations should remain simple and robust

Decision:

- store all extracted data in a single SQLite database (e.g. `rows_x.sqlite`)
- model domains, schemas, extraction runs, and cells using a small set of normalized tables
- avoid dynamically creating one SQLite table per website or extraction; instead, use a generic `extraction_cells` table keyed by extraction and row/column indices

Tradeoffs:

- pros: simple migration story, fewer DDL operations, uniform query patterns
- pros: easier to add tooling and diagnostics around a single DB
- cons: cell-level table can grow large; may require pruning policies later
- cons: queries are slightly more verbose than `SELECT * FROM <site_table>`

Validation impact:

- validation can focus on a few well-defined queries (per-domain, per-URL, per-extraction)
- schema evolution becomes easier to test: we add new schemas rather than altering existing tables

Migration and follow-up implications:

- future changes can add retention policies or indexing strategies without breaking the current model
- future UI or API surfaces can treat this DB as the single source of truth for history and analytics

## Milestone Sizing Note

- one milestone should be one coherent WBS-style Level 3 execution slice
- one milestone should have one dominant validation story

## Milestone 1: Minimal Schema and Wasm SQLite Initialization

Goal:

- have a single wasm SQLite database with the core tables created and a programmatic write path that can persist one extraction from test data

Execution slices:

- choose and wire a wasm SQLite library into the extension build
- implement database initialization and table creation for the core schema
- add a small internal API that accepts headers and rows and writes them into the DB

Out of scope:

- UI integration and new buttons
- schema evolution or migration rules beyond initial creation

Touched systems:

- runtime

Entry context:

- extension README description of the current extraction and Rows export pipeline

Acceptance criteria:

- calling the internal API with a sample extraction writes records into all expected tables with correct relationships

Validation package:

- validation package for runtime feature changes, plus manual DB inspection

Persona review:

- none required beyond internal developer review

Fallback note:

- if wasm SQLite integration fails, we can temporarily guard the feature behind a flag without impacting current Rows behavior

Next dependency:

- Milestone 2, which connects the extraction flow and UI to the new storage path

