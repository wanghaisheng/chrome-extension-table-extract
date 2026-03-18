# UI Optimization Spec

## Scope

This spec covers UX/UI improvements to the extension popup, focusing on:

- History filters + results list + detail preview
- export actions (copy/download)
- domain controls and lifecycle actions (delete/clear/retention)

## Requirements

### R1. Clear grouping and hierarchy

- UI groups controls into clear sections with headings:
  - Filters
  - Results
  - Preview / Details
  - Data management (destructive)
- Filters are “progressively disclosed”:
  - basic filters visible by default (domain/url/date)
  - advanced filters (pattern/schema/pin) behind an explicit affordance

### R2. Safe destructive actions

- Clear-all and delete-domain require confirmation.
- Confirmation is explicit and cannot be triggered by accidental double-clicks.
- Recommended implementation: two-step confirm within popup (Confirm + Cancel) with auto-expire.

### R3. Deterministic scope display

- When filters include `domain`, `url_pattern`, `schema version`, UI must show the current scope clearly.
- Pinning state reflects bucketed scope: (domain + url pattern).
- Details view displays a scope summary line (domain + pattern + schema vX + pinned indicator if applicable).

### R4. Accessible and testable UI

- Interactive elements have accessible names (labels/aria) or clear roles.
- Key elements have stable selectors (`data-testid`) used by Playwright.
- Minimum keyboard path supported:
  - enter domain → choose pattern/schema (optional) → Apply → Open result → Copy TSV

## Acceptance tests (high level)

- Store → History → Filter to a domain + pattern → open → export → verify output.
- Clear-all requires confirmation and clears history.
- Delete-domain requires domain scope and confirmation; only that domain’s data is removed.

## Rendering constraints

- Must remain usable within MV3 popup size constraints:
  - no essential action hidden off-screen without scroll
  - long URLs and headers do not break layout (wrap or ellipsis with copy affordance)

