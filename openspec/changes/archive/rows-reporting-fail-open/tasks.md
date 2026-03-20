<!-- input: implement fail-open telemetry -->
<!-- output: tracked tasks -->
<!-- pos: change packet tasks (Gate C) -->
# Tasks: Rows reporting fail-open

## Done

- Update Rows fetch wrapper to return `null` on errors and avoid throwing.
- Guard `createNewReportEntryRow` and `reportUsage` on required env config.
- Ensure no unhandled promise rejections from telemetry paths.

## Validation

- `npm run check:syntax`
- `npm run build`
- `npx playwright test tests/extension/popup-errors-and-telemetry.spec.ts -g "Rows telemetry is fail-open"`
