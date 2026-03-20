<!-- input: incident: popup returns empty results when script injection fails or wrong tab is selected -->
<!-- output: OpenSpec change packet for popup scrape reliability and clear errors -->
<!-- pos: change packet README (Gate A) -->
# Popup scrape reliability (tab selection + file:// + injection errors)

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

- user reports: same page sometimes extracts nothing; file-based fixtures (file://) always extract nothing; confusing silent failures

## Why This Change Exists

- MV3 `chrome.scripting.executeScript` failures surfaced as “no results” instead of a clear error
- on file:// pages, the extension cannot inject unless users enable “Allow access to file URLs”; we should tell them explicitly
- when popup is opened in atypical contexts (tests / extension tab focus), selecting the wrong web tab can cause extraction to run on the wrong page

## Pilot Gate A: Scope, Non-goals, Stop Conditions

Pilot scope (this change packet is the pilot unit):

- in scope boundaries:
  - background scrape: robustly select the intended http(s) tab
  - detect file:// and return a user-facing error message
  - catch script injection failures and return a user-facing error message
  - provide a background endpoint for popup to query the current web tab (debug + UX)
- out of scope boundaries:
  - new scraping logic, new site scrapers
  - crawling/multi-page extraction

Non-goals (avoid scope creep):

- do not attempt to auto-enable file:// permissions (Chrome requires user action)
- do not add new UI screens beyond existing “No results” messaging

Stop conditions (when to pause/rollback instead of expanding):

- any regression in existing extraction flows on normal http(s) pages

## Execution Model

- implement background tab selection and explicit error returns (ErrorCodes + messages)
- keep popup logic simple: show exception message via existing “No results” surface

## Validation Strategy

- Typecheck + build
- Playwright extension E2E smoke on core “open popup and extract” paths

## Milestone Shape

1. M1. Correct web tab selection and expose current-web-tab endpoint
2. M2. Clear failure messages for file:// and injection errors

