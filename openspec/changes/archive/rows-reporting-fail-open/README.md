<!-- input: incident: Uncaught (in promise) TypeError: Failed to fetch during Rows reporting -->
<!-- output: OpenSpec change packet for fail-open Rows reporting -->
<!-- pos: change packet README (Gate A) -->
# Rows reporting fail-open (no unhandled fetch)

## Status

- validated

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

- user report: popup/extension throws `Uncaught (in promise) TypeError: Failed to fetch` (Rows API telemetry path)

## Why This Change Exists

- reporting is non-critical telemetry and must never break extraction/export flows
- missing/undefined Rows config (API key / spreadsheet/table IDs) produced bad requests and noisy errors
- network errors can occur; they should be swallowed (best-effort)

## Pilot Gate A: Scope, Non-goals, Stop Conditions

Pilot scope (this change packet is the pilot unit):

- in scope boundaries:
  - Rows API wrapper returns `null` on errors and never throws
  - reporting functions short-circuit when config is missing
- out of scope boundaries:
  - changing what is reported or adding new analytics events
  - retry/backoff logic

Non-goals (avoid scope creep):

- do not block/slow down extraction to wait for telemetry
- do not add UI for telemetry configuration

Stop conditions (when to pause/rollback instead of expanding):

- any extraction path becomes dependent on Rows reporting success

## Execution Model

- degrade reporting to best-effort:
  - skip when env config is missing
  - swallow fetch/network failures
  - avoid unhandled promise rejections

## Validation Strategy

- typecheck + build
- manual: run extension without Rows env vars; ensure no console error and core flows still work

## Milestone Shape

1. M1. Fetch wrapper made fail-open (`null` on errors)
2. M2. Report functions guard on config and swallow errors

