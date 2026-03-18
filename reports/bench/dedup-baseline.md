## Dedup baseline (pilot) – notes

This repository is moving toward a 0.3 scaling milestone. This file captures a minimal baseline for the dedup pilot so we have something concrete to compare against later optimizations (batching, indexes, backup/restore).

### Environment

- OS: Windows (Playwright bundled Chromium)
- Extension runtime: MV3 popup, `wa-sqlite` + IndexedDB VFS

### What we measured (initial baseline)

- **Scenario**: `storeExtraction` called repeatedly on a small table.
- **Expectation**: With dedup enabled (`identical_to_last`), the second identical store returns the same `extractionId` and does not create a new extraction row.
- **Evidence**: Playwright E2E (`tests/extension/sqlite-autocapture.spec.ts`) includes a trophy flow asserting:
  - changed payload yields a new `extractionId`
  - repeated identical payload yields the same `extractionId`

### Next measurement improvements (follow-ups)

- Add a larger-table benchmark HTML fixture and measure:
  - write latency per extraction (ms)
  - query latency for `listExtractions` with common filters (ms)
- Emit JSON metrics under `reports/bench/` in addition to this narrative file.

