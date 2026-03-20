<!-- input: implement safety guard -->
<!-- output: tracked tasks -->
<!-- pos: change packet tasks (Gate C) -->
# Tasks: HTML table title extraction safety

## Done

- Add safety counter and null guard to the title search loop in `scrapHTMLTables`.

## Validation

- `npm run check:syntax`
- `npm run build`
- `npx playwright test tests/extension/popup-errors-and-telemetry.spec.ts -g "HTML table title inference does not hang"`
