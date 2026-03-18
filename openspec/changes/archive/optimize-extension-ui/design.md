# Design

## Problem framing

The extension popup now combines:

- extraction preview + save actions
- History list + detail preview
- filters (domain/url/date/url pattern/schema version)
- export actions (copy/download)
- lifecycle controls (retention, clear-all, delete per domain)

This density increases:

- cognitive load (too many controls at once)
- discoverability issues (filters/export/pinning are easy to miss)
- risk of misclick on destructive actions

## Principles

- **Progressive disclosure**: keep the default view simple; advanced controls behind clear affordances.
- **Consistency**: consistent spacing, button hierarchy, and terminology across panels.
- **Safety**: destructive actions require clear confirmation and are visually de-emphasized.
- **Determinism**: UI state reflects exact filter scope (domain + url pattern + schema version).
- **Testability**: important UI elements have stable selectors (`data-testid`) and semantic roles.

## Proposed UX changes

### 1) Navigation & layout

- keep current two-panel model (Extract / History), but:
  - ensure the header actions are consistent and have clear active state
  - keep content area scroll behavior predictable (history list scrolls; detail panel scrolls independently if needed)

#### Text wireframe (History)

```
[Header: Extract | History]

History
  [Filters]
    Domain: [__________]   URL contains: [__________]
    After:  [____-__-__]   Before:       [____-__-__]
    [Advanced ▾]
      Pattern: [ /products v ]   Schema: [ (any) v ]   [Pin active schema] [Clear pin]
    [Apply] [Reset]

  [Results]
    - Title / URL tail
      domain · /path... · date · rows   [pattern badge] [schema badge]
      [Open]
    ...

  [Details]
    Scope: example.test · /products · schema v2 (pinned)
    [Copy TSV]  [Download JSON] [Download CSV] [Download TSV]
    status text...
    table preview...

  [Data management]
    Retention: (toggle) keep last [ N ] per domain
    Delete domain data: [Delete…] -> [Confirm] [Cancel]
    Clear all local data: [Clear…] -> [Confirm] [Cancel]
```

### 2) Filters + schema controls grouping

- group filters into a compact “Filters” section:
  - domain + url substring + date range
  - advanced: url pattern + schema version + pinning
- reduce accidental “filter scope mismatch” by always showing selected pattern/schema in the list row metadata (already present) and ensuring pin label reflects the bucket

### 3) Export section

- make export actions visually grouped in the detail view:
  - primary: Copy TSV
  - secondary: Download JSON/CSV/TSV
- show brief inline status messages (copied, downloaded) with timeouts

### 4) Lifecycle & destructive actions

- move “delete domain data” and “clear all local data” into a dedicated “Data management” section
- require confirm step for destructive actions (prefer two-step confirm inside popup for stability)
- keep “delete domain” scoped: must have domain selected/entered

#### Confirmation interaction (recommended)

- user clicks a destructive action → button switches to **Confirm** state + shows **Cancel**
- confirm state auto-expires (e.g. 10s) to avoid “stuck in danger mode”
- confirm state is per-action (clear-all and delete-domain are separate)

## Visual system

- keep current styling approach (existing CSS) but standardize:
  - spacing scale
  - button variants (primary/secondary/danger)
  - pill/badge style for schema/version/pattern
  - typography for headings and dense metadata

## Compatibility constraints

- MV3 popup size constraints: design must work within small widths/heights
- avoid heavy dependencies; keep bundle size small
- avoid breaking Playwright: add testids where needed and update tests accordingly

## Testability contract (selectors)

Key interactive elements should have stable testids, e.g.:

- filters: `filter-domain`, `filter-url`, `filter-after`, `filter-before`, `filter-pattern`, `filter-schema-version`
- results: `results-list`, `result-row`, `open-result`
- details: `details-scope`, `copy-tsv`, `download-json`, `download-csv`, `download-tsv`
- data management: `delete-domain`, `delete-domain-confirm`, `clear-all`, `clear-all-confirm`

