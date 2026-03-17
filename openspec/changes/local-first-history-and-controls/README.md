# Local-first History and Domain Controls

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

- `roadmap.md` "Next (0.1) – Make storage visible and manageable"
- existing local-first capture change: `openspec/changes/add-sqlite-storage-for-extracted-data/`

## Why This Change Exists

- users can currently save data locally, but cannot easily:
  - see what has been stored
  - control domain-level auto-capture after opt-in
  - delete stored data (per domain or globally)
- local-first storage needs first-class **visibility** and **control** to be trustworthy, especially for sensitive data

## Relationship To Existing Changes

- depends on: `add-sqlite-storage-for-extracted-data` (local persistence + opt-in + auto-capture)
- does not change the underlying storage schema; it adds management surfaces and lifecycle controls

## Execution Model

- implement one coherent milestone at a time:
  - establish minimal query APIs for history and domain status
  - add management UI in the extension popup (or a dedicated page if needed)
  - add deletion/retention primitives with safe defaults

## Validation Strategy

- Playwright E2E:
  - store at least one extraction
  - verify it appears in History UI
  - disable auto-capture for domain and verify new pages do not get stored
  - delete domain history and verify it is removed
- unit tests:
  - retention calculations and deletion query correctness

## Milestone Shape

1. history queries + minimal history UI
2. domain controls (enable/disable) + delete per domain
3. data lifecycle (retention + clear all) + UX polish

