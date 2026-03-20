<!-- output: OpenSpec change packet design (Gate B) -->
# Design: Scraper Wizard + custom YAML import

## Data model

Stored in `chrome.storage.local` under `table_extract_custom_scrapers_v1`:

```ts
type CustomScraperRecord = {
  id: string;          // stable id
  name: string;        // from file name
  addedAt: number;     // ms epoch
  yamlText: string;    // original text (for export/debug)
  options: ScrapperOptions; // normalized ScrapperOptions
};
```

Constraints:

- max 50 records (soft limit); imports beyond the limit must show a user error
- matching order: `addedAt DESC` (latest import wins among customs)

## Matching precedence

`custom scrapers > built-in scrapers > default table/structured extraction`.

Matching uses glob semantics:

- `*` matches any substring
- all other characters are literal

## UI

New popup tab: `Wizard`.

Wizard sections:

- **AI status** (placeholder): show whether browser exposes a built-in AI API and link to guidance
- **Import custom YAML**: file picker → parse/validate → success/error message
- **Manage imported scrapers**: list + delete

## Failure modes

- invalid YAML / invalid schema → show error, do not store
- storage read/write fails → show error, do not block extraction (fallback continues)
- background matching errors → catch and fallback to built-in/default

