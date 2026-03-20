<!-- input: user incident reports + implemented fixes -->
<!-- output: tasks + closeout evidence -->
<!-- pos: change packet tasks -->
# Tasks

## Progress Snapshot

- current state: implemented and validated

## Packet Summary

- goal: popup extraction is reliable and failures are user-actionable
- in scope:
  - background tab selection + explicit failure messages
  - background endpoint: `table-extract:get-current-web-tab`
- out of scope: scraper changes, multi-page crawling

## M1. Correct web tab selection and expose endpoint

- [x] select correct http(s) tab for scraping
- [x] add `table-extract:get-current-web-tab` message handler

## M2. Clear file:// + injection error messages

- [x] add error codes/messages for file:// and injection failures
- [x] show the message via existing exception → NoResults surface

## Closeout

- typecheck: `npm run check:syntax`
- build: `npm run build`
- E2E: `npx playwright test tests/extension/popup-errors-and-telemetry.spec.ts`
