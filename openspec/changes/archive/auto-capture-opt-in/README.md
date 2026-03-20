<!-- input: user request: auto-capture across url patterns after first opt-in -->
<!-- output: OpenSpec change packet for auto-capture opt-in UX -->
<!-- pos: change packet README (Gate A) -->
# Auto-capture opt-in UX (SQLite)

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

- user request: after clicking “Add to SQLite” once, future captures on the same domain (even different url patterns) should auto-import on popup open

## Why This Change Exists

- current opt-in behavior was easy to misunderstand:
  - user clicks “Add to SQLite” once, but later pages still require manual clicks
  - auto-capture was previously implicit and could double-write or not reflect UI button state

## Pilot Gate A: Scope, Non-goals, Stop Conditions

Pilot scope (this change packet is the pilot unit):

- in scope boundaries:
  - popup UX: “Add to SQLite” acts as opt-in + store
  - after opt-in, popup open auto-stores (behaves like auto-clicking the button and shows Saved)
  - avoid duplicate writes and keep status stable in UI
- out of scope boundaries:
  - auto-pagination crawling
  - storage schema changes beyond existing domain enable flag

Non-goals (avoid scope creep):

- do not add new settings UI for per-pattern opt-in; domain-level opt-in only
- do not change scraper behavior

Stop conditions (when to pause/rollback instead of expanding):

- any evidence of duplicate writes per popup open
- regressions in existing Playwright E2E flows involving domain enable/disable

## Execution Model

- migrate auto-capture responsibility from App-level side effect to Preview-level “auto-click” logic
- ensure opt-in is persisted before storing to prevent losing the toggle on popup close

## Validation Strategy

- Playwright E2E: `manual opt-in enables domain auto-capture on subsequent URLs`
- Unit tests unchanged

## Milestone Shape

1. M1. Preview auto-capture (auto-click) + in-flight guard
2. M2. Remove old App auto-capture to prevent double writes

## Linked docs

- `openspec/changes/auto-capture-opt-in/README.md`
- `openspec/changes/auto-capture-opt-in/design.md`
- `openspec/changes/auto-capture-opt-in/tasks.md`

