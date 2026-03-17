# History & Controls Spec

## Requirements

### R1. History List for Stored Extractions

Acceptance:

- the extension provides a History view listing recent stored extractions
- each item shows at minimum: domain, URL (or a shortened display), extracted timestamp, and row count
- the list order is deterministic (newest first)

### R2. Extraction Detail Preview

Acceptance:

- user can open a stored extraction from the history list
- detail view shows a preview of the stored data (first N rows) without re-scraping the page
- preview is consistent with what was stored (headers + rows)

### R3. Domain Auto-capture Controls

Acceptance:

- user can see domains that have been opted-in for auto-capture
- user can disable auto-capture for a domain; subsequent extractions on that domain are not auto-stored
- user can re-enable auto-capture for a domain
- domain control state persists across extension reloads

### R4. Deletion Controls

Acceptance:

- user can delete all stored data for a domain
- user can clear all locally stored data
- destructive actions require a clear confirmation UX

### R5. Optional Retention Policy

Acceptance:

- user can enable an optional retention policy (e.g., keep last N extractions per domain)
- retention runs deterministically (on write, on schedule, or via explicit action) and is testable
- retention never silently changes data unless the user has enabled it

## Non-Requirements

- no general SQL console
- no cross-device sync
- no cloud account requirement

## Validation Notes

- Playwright E2E should cover core user flows: store → history → detail; toggle domain; delete domain; clear all
- unit tests should cover retention selection logic and delete query correctness

