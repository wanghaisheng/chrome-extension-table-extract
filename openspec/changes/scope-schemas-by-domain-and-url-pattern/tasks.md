# Tasks

## Packet Summary

- goal: scope schemas by (domain + url_pattern) to avoid cross-page-type schema bumps
- in scope:
  - write-path schema selection changes
  - query API updates to surface url_pattern
  - tests that cover multiple page-type buckets under same domain
  - reliability hardening for `wa-sqlite` binding/transactions during schema bumps

## M1. Reliability Hardening (wa-sqlite)

- [x] M1.1 ensure all `execWithParams` / `run` calls always pass params arrays (never undefined)
- [x] M1.2 serialize write transactions to avoid concurrent writes on one connection
- [x] M1.3 add E2E that reproduces schema bump scenarios reliably

## M2. Schema Scope by url_pattern

- [x] M2.1 derive a stable `url_pattern` bucket from URL path (default heuristic)
- [x] M2.2 scope active schema + version increment to (domain + url_pattern)
- [x] M2.3 update list/query APIs to include `url_pattern`

## Closeout

- commands ran:
  - `npm run test:unit`
  - `npm run test:pw`
- pass/fail:
  - pass
- residual risk:
  - `url_pattern` bucketing is heuristic (path prefix); future work may add per-domain mapping rules

