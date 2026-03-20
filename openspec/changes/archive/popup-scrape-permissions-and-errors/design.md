<!-- input: MV3 injection model + observed failure modes -->
<!-- output: design + Gate B pre-coding checks -->
<!-- pos: change packet design doc (Gate B) -->
# Design: Popup scrape reliability (tab selection + file:// + injection errors)

## Problem Statement

- the popup’s scrape action depends on selecting the correct target tab and successfully injecting scripts
- failures can be silent (empty results) and hard to debug

## ADR 1: Web tab selection strategy

Context:

- `chrome.tabs.query({ active: true, lastFocusedWindow: true })` can return the popup/extension tab during tests or certain focus scenarios

Decision:

- select the web target as:
  1) active tab if it is http(s)
  2) else, lastFocusedWindow’s active http(s) tab
  3) else, lastAccessed http(s) tab in lastFocusedWindow

Tradeoffs:

- heuristic, but safer than “first http(s) tab found”

## ADR 2: Fail-closed on file:// and injection errors

Context:

- file:// requires a user-enabled permission toggle
- injection failures can happen due to permissions or transient tab state

Decision:

- detect `file://` and return a specific error code/message
- wrap the injection call and return a specific error code/message on failure

Tradeoffs:

- users may see new error text instead of “No results”; this is intended for clarity

## Gate B checks

- ensure errors are handled without crashing the popup (already uses ExceptionMessage path)
- ensure http(s) extraction path unchanged when injection succeeds

