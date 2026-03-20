<!-- input: roadmap 0.3 goals + design.md -->
<!-- output: milestone tasks + closeout contract -->
<!-- pos: change packet tasks -->
# Tasks

## Progress Snapshot

- source inputs: `roadmap.md` Mid-term (0.3)
- current state: implemented and validated; ready for archiving

## Packet Summary

- goal: safe scaling for heavier local-first use (dedup, performance, reliability, backup/restore)
- in scope: optional dedup, batching + indexes, IDB failure handling, backup/restore UX
- out of scope: cloud sync, new scraping engine, external services
- upstream dependencies: shipped local-first storage + History + export flows
- interface or delivery list:
  - storage settings (dedup toggles)
  - write path improvements
  - backup/restore commands/UI
  - benchmark/stress artifact(s) under `reports/`
- acceptance criteria:
  - heavy use remains responsive and deterministic
  - failures are user-visible and non-destructive
  - backup/restore restores data and preserves History/export correctness
- validation package:
  - Playwright extension E2E + unit tests; add benchmark/stress runs as artifacts
- fallback note:
  - any risky feature gated by flags; disable and preserve existing behavior if regressions appear
- linked docs:
  - `openspec/changes/performance-reliability-and-dedup/README.md`
  - `openspec/changes/performance-reliability-and-dedup/design.md`

## Milestone Execution Loop

1. read the active change and relevant `.codex/core` docs
2. confirm the milestone still fits the sizing rule
3. implement one bounded milestone only
4. select the validation package from `validation-matrix.md`
5. run commands, inspect first failure, fix, and repeat
6. self-review against the active change and spec
7. apply persona review when required
8. update ADR content when durable decisions change
9. record what ran, what passed, and what remains unverified

## M1. Dedup baseline (pilot)

- [x] M1.1 add settings flag(s) for dedup (default off) and scope rules
- [x] M1.2 implement normalization + hashing and “skip identical-to-last” logic
- [x] M1.3 unit tests for hash/dedup edge cases
- [x] M1.4 Playwright E2E trophy for dedup behavior
- [x] M1.5 record baseline perf numbers as `reports/bench/` artifact (simple table)

## M2. Performance (batch + indexes)

- [x] M2.1 implement write-path batching for large tables
- [x] M2.2 add indexes for common queries (domain/time/url)
- [x] M2.3 validate no regressions in History filters and exports
- [x] M2.4 ensure History popup controls (buttons/inputs) adapt to small popup sizes without overflowing or clipping

## M3. Reliability + backup/restore

- [x] M3.1 handle IndexedDB unavailable/quota errors gracefully with clear UX
- [x] M3.2 implement DB backup (download) and restore (upload) flows
- [x] M3.3 E2E: backup → clear → restore → history/export parity

## Closeout Rule

- selected validation package
- commands that ran
- pass or fail status
- trophy evidence (at least 1 trophy, or explicit exemption)
  - trophy test: <test type + test name/path>
  - command: <command line>
  - evidence: <artifact path, output summary, or link>
  - exemption (if needed): <why not applicable> + <replacement evidence>
- acceptance criteria mapping (2–3 core AC seeds → evidence)
  - AC: <AC seed text or id> → evidence: <test/assertion/screenshot/log>
  - AC: <AC seed text or id> → evidence: <test/assertion/screenshot/log>
- residual risk
- ADR or doc follow-up required
- Pilot Gate D (WAL updated):
  - `.codex/wal/entries/YYYY/YYYY-MM-DD_performance-reliability-and-dedup.json`

## Closeout (completed)

- selected validation package: unit + Playwright extension E2E
- commands that ran:
  - `npm run test:unit`
  - `npx playwright test tests/extension`
- pass/fail: pass
- trophy evidence:
  - trophy test: Playwright E2E `dedup identical-to-last skips repeats within bucket` (`tests/extension/sqlite-autocapture.spec.ts`)
  - command: `npx playwright test tests/extension/sqlite-autocapture.spec.ts -g "dedup identical-to-last"`
  - evidence: Playwright run summary (passed) + `reports/bench/dedup-baseline.md`
- acceptance criteria mapping:
  - AC: when dedup is enabled, storing the same extraction twice does not increase extraction count → evidence: E2E asserts identical-to-last returns same `extractionId`
  - AC: backup/restore restores data and preserves History/export correctness → evidence: Playwright `backup and restore keeps history and exports` (`tests/extension/sqlite-autocapture.spec.ts`)
- residual risk:
  - performance results are environment-dependent; baseline artifact is recorded but should be re-sampled on slower machines if regressions are suspected
