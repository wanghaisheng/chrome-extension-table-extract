<!-- input: bug: title extraction loop can walk up DOM indefinitely -->
<!-- output: OpenSpec change packet for HTML table title loop safety -->
<!-- pos: change packet README (Gate A) -->
# HTML table title extraction safety (loop guard)

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

- observed risk: title inference for `<table>` can loop upward when title is empty / starts with `.` and no suitable caption/heading is found

## Why This Change Exists

- prevent pathological DOM structures from causing long/never-ending loops during scraping
- keep extraction deterministic and fast even on malformed pages

## Pilot Gate A: Scope, Non-goals, Stop Conditions

Pilot scope (this change packet is the pilot unit):

- in scope boundaries:
  - add a safety counter and null guard to the title search loop
- out of scope boundaries:
  - changing how titles are chosen when available (no behavior change when headings exist)
  - adding new heuristics for title inference

Non-goals (avoid scope creep):

- do not change table cell parsing or merge logic

Stop conditions (when to pause/rollback instead of expanding):

- any regression in table titles on common pages with valid captions/headings

## Execution Model

- cap the parent-walk attempts to a fixed upper bound (50) and break if the element chain ends

## Validation Strategy

- typecheck + build
- manual: scrape a page with tables lacking nearby headings; ensure extraction completes and still returns data

## Milestone Shape

1. M1. Add loop guard and null check to title discovery
