# Optimize Extension UI

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

- current popup UI includes extraction preview + History + retrieval/export + schema controls
- shipped local-first milestones:
  - `openspec/changes/archive/add-sqlite-storage-for-extracted-data/`
  - `openspec/changes/archive/local-first-history-and-controls/`
  - `openspec/changes/archive/retrieval-and-export-without-leaving-the-extension/`
  - `openspec/changes/archive/scope-schemas-by-domain-and-url-pattern/`

## Why This Change Exists

- as local-first features expanded (History, filters, export, schema pinning), the popup UI has grown denser
- we want clearer information hierarchy, fewer accidental destructive actions, and a more polished, consistent experience
- improved UX reduces support burden and makes local data management feel trustworthy

## Goals

- improve layout and information hierarchy for Extract + History views
- improve readability (spacing, alignment, typography) and reduce visual noise
- improve interaction safety for destructive actions (clear/delete) and feedback states
- improve accessibility basics (keyboard focus, labels, contrast)
- improve determinism and user confidence by making filter scope visible (domain + url pattern + schema)

## Non-goals

- redesign the data model, storage, or query APIs (unless strictly required by UI correctness)
- add new major features (this is polish + UX improvement)

## Validation Strategy

- Playwright E2E:
  - existing tests continue to pass (opt-in/auto-capture, History, filters, export, clear/delete)
  - add a small number of stable UI assertions for new structure (testids/roles)
- manual sanity:
  - popup view usable at common widths; long URLs/headers wrap gracefully

## Acceptance Criteria (user-visible)

- History is organized into clear sections: **Filters**, **Results**, **Details**, and **Data management**.
- Filtering a domain shows the selected **scope** (domain + url pattern + schema version) in the details view.
- Export actions are discoverable and grouped (copy/download), with clear success feedback.
- Destructive actions (delete domain, clear all) require an explicit confirmation step and are visually separated from everyday actions.

