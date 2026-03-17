# Tasks

## Progress Snapshot

- source inputs: `roadmap.md` Next (0.2)
- current state: change record created; ready to implement retrieval + export primitives

## Packet Summary

- goal: make local storage reusable via search/filter + export/copy flows in the popup
- in scope:
  - filter/query APIs (domain/url/date)
  - export serializers (TSV/CSV/JSON)
  - popup UI to filter and export stored extractions
  - automated tests
- out of scope:
  - cloud sync
  - full SQL console
  - complex schema pinning UX (optional, can be deferred)
- upstream dependencies:
  - `openspec/changes/archive/local-first-history-and-controls/`
- linked docs:
  - `README.md`, `design.md`, `specs/retrieval-export/spec.md`

## Success Criteria and Test Suite

- retrieval:
  - user can filter by domain/url/date and results are deterministic
- export:
  - user can export/copy a stored extraction without re-scraping
  - TSV/CSV/JSON outputs are correct (headers + rows) and stable
- tests:
  - unit tests for serializers + filter predicate behavior
  - Playwright E2E: store → filter → open → export/copy and validate output

## Milestone Execution Loop

1. read the active change and relevant `.codex/core` docs
2. confirm the milestone fits the sizing rule
3. implement one bounded milestone only
4. select the validation package from `validation-matrix.md`
5. run commands, inspect first failure, fix, and repeat
6. self-review against the active change and spec
7. update ADR content when durable decisions change
8. record what ran, what passed, and what remains unverified

## M1. Query + Export Primitives

- [ ] M1.1 add filtered listing API: by domain/url/date range
- [ ] M1.2 add export serializers: TSV/CSV/JSON (pure functions)
- [ ] M1.3 unit tests for serializers and filter behavior

## M2. Popup UX: Filter + Export

- [ ] M2.1 add History filters UI (domain/url/date range)
- [ ] M2.2 add export actions in detail view (copy + download)
- [ ] M2.3 add Playwright E2E: filter → export correctness

## M3. Schema Evolution UX (Optional / Stretch)

- [ ] M3.1 show schema version consistently in list + detail (if gaps exist)
- [ ] M3.2 optional: pin an “active schema” per domain (defer by default)

## Closeout Rule

- selected validation package
- commands that ran
- pass or fail status
- residual risk
- ADR or doc follow-up required

