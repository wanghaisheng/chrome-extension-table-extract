# Add SQLite Storage for Extracted Data

## Status

- done

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

- extension README table extraction flow, `rows_x:store` + TSV to Rows
- user request to persist extracted data into a wasm SQLite database

## Why This Change Exists

- current flow only sends extracted data to Rows, no local durable storage
- users cannot easily reuse, compare, or query past extraction runs
- adding local SQLite storage enables future features (history, diff, search) without changing the existing Rows integration

## Relationship To Existing Changes

- new change record; no known conflicting local changes yet
- complements existing extraction pipeline rather than replacing it

## Execution Model

- treat this as a BMM-style change with small, well-bounded milestones
- first land a minimal schema and write-path into a wasm SQLite database
- then integrate the flow behind a new UI button without breaking existing behavior
- optionally extend schema/versioning behavior in a follow-up milestone

## Validation Strategy

- validation package selected from `.codex/core/validation-matrix.md` for extension runtime changes
- manual verification of stored data via SQLite queries against the wasm-backed database
- regression check that `Open in Rows` behavior remains unchanged

## Milestone Shape

1. baseline schema and wasm SQLite initialization
2. integrate "Add extracted data to SQLite" button and write-path
3. optional schema evolution and documentation update

