<!-- input: openspec/PLAN.md + openspec/PLAN1.md -->
<!-- output: durable spec for History export correctness -->
<!-- pos: durable spec -->
# Export correctness spec

## Requirements

### R1. Bulk export includes all stored rows

Acceptance:

- for any extraction with N data rows, bulk export output includes N data rows (no implicit truncation at 20)
- History preview may still limit rows, but export/copy/download does not

### R2. Bulk export preserves added order baseline

Acceptance:

- bulk export processes extractions in “added order” (`extractions.id ASC`) regardless of UI sorting
- when seq/index ordering is not detected, merged export order is stable and deterministic (no dependence on `extracted_at DESC`)

### R3. If a seq/index column exists, merged export sorts by it ascending

Acceptance:

- when a seq/index column is detected reliably, merged export rows are sorted by numeric value ascending
- rows with missing/unparseable seq/index values appear after parseable rows and preserve their original relative order

## Non-Requirements

- no automatic pagination scraping (collecting multiple pages) as part of export
- no cross-domain global ordering
- no UI redesign beyond export correctness

## Validation Notes

- unit: `npm run test:unit` (seq/index detection + stable sort trophy)
- smoke: `npm run check:syntax`, `npm run build`
- optional: `npm run test:pw` when export flows are exercised end-to-end
