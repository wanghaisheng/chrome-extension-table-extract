<!-- input: roadmap 0.3 + existing local-first shipped state -->
<!-- output: OpenSpec change packet for scaling local-first -->
<!-- pos: change packet README (Gate A) -->
# Performance, reliability, and dedup

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

- roadmap: `roadmap.md` Mid-term (0.3)
- local-first already shipped: SQLite persistence + History + export + schema bucketing/pinning

## Why This Change Exists

- larger tables and frequent capture can stress the WASM SQLite path (insert volume, query latency, popup responsiveness)
- we need safe scaling primitives (dedup, batching, indexes) and better failure handling (IDB unavailable)
- we want backup/restore so local-first data is portable and recoverable

## Pilot Gate A: Scope, Non-goals, Stop Conditions

Pilot scope (this change packet is the pilot unit):

- in scope boundaries:
  - SQLite storage write path (dedup / batching)
  - query path performance improvements (indexes)
  - reliability handling when IndexedDB is unavailable
  - local DB backup/restore UX (download/upload)
- out of scope boundaries:
  - cloud sync
  - new extraction engine or scraper changes
  - external services or accounts

Non-goals (avoid scope creep):

- do not redesign schema wholesale unless required by performance
- do not add analytics dashboards

Stop conditions (when to pause/rollback instead of expanding):

- any regression in existing local-first E2E flows (store → history → export, clear/delete)
- any evidence of new wa-sqlite instability (crashes / corruption) introduced by the change

## Execution Model

- implement pilot-first: add one improvement slice, validate, then promote to broader changes
- keep each milestone independently shippable and reversible

## Validation Strategy

- Playwright E2E (`npm run test:pw`) for user-visible flows
- Unit tests (`npm run test:unit`) for dedup/batching logic
- add benchmark/stress surfaces and record results as artifacts under `reports/`

## Milestone Shape

1. M1. Dedup baseline (identical-to-last) + guardrails
2. M2. Write-path batching + indexes
3. M3. Reliability + backup/restore

## Linked docs

- `openspec/changes/performance-reliability-and-dedup/README.md`
- `openspec/changes/performance-reliability-and-dedup/design.md`
- `openspec/changes/performance-reliability-and-dedup/tasks.md`
- `openspec/changes/performance-reliability-and-dedup/specs/scaling/spec.md`

