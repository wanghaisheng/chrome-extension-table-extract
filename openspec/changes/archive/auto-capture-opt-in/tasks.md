<!-- input: user request + current repo state -->
<!-- output: tasks + closeout contract -->
<!-- pos: change packet tasks -->
# Tasks

## Progress Snapshot

- current state: implemented in code; validated with Playwright E2E

## Packet Summary

- goal: domain opt-in auto-capture behaves like auto-clicking “Add to SQLite”
- in scope: Preview auto-capture + opt-in persistence ordering; remove duplicate App auto-capture
- out of scope: auto-pagination, scraper changes
- validation package:
  - `npx playwright test tests/extension/sqlite-autocapture.spec.ts -g "manual opt-in enables domain auto-capture"`

## M1. Preview auto-capture (auto-click) + in-flight guard

- [x] auto-capture in Preview when domain enabled
- [x] prevent duplicates via per-result in-flight key guard

## M2. Remove App auto-capture to prevent double writes

- [x] remove App-level results→store side effect

## Closeout

- tests run: Playwright E2E opt-in test
- evidence: test pass output

