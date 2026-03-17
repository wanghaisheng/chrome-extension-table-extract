# Scope Schemas by (Domain + URL Pattern)

## Status

- planned

## Source Context

- follow-up to local-first SQLite storage and schema versioning
- user requirement: prevent small page-type variations from bumping domain-wide active schema version

## Why This Change Exists

- many sites have multiple “page types” under the same domain (e.g. `/products/*` vs `/users/*`)
- current behavior scopes active schema/version to domain, so a single page-type variation can bump the active schema for the entire domain

## Proposed Direction

- treat schema scope as **(domain + url_pattern)** rather than domain-only
- use `schemas.url_pattern` as the “page type bucket” key
  - example: `/products/*` uses one schema stream; `/users/*` uses another
- schema versioning + active schema selection happen within the same bucket

## Validation Strategy

- Playwright E2E:
  - store extraction under `/products/*`
  - store extraction under `/users/*` with different headers
  - verify schema versions are independent per bucket and do not interfere
- reliability:
  - ensure `wa-sqlite` does not crash in “schema bump” paths (no `offset undefined` / WASM OOB)

