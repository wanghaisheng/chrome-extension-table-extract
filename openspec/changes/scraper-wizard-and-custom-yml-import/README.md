<!-- output: OpenSpec change packet for scraper wizard + custom YAML import -->
<!-- pos: change packet README (Gate A) -->
# Scraper Wizard + custom scrapper.yml import

## Status

- active

## Why This Change Exists

We want a faster path to support sites where “tables” are actually lists/cards (e.g. CNKI / Google Scholar / PubMed) by:

1) providing a **Scraper Wizard** surface in the extension UI (later: connect to Chrome built-in AI for YAML generation)
2) supporting **import of custom `scrapper.yml`** files so users/developers can add/iterate site support without rebuilding the extension

## Pilot Gate A: Scope, Non-goals, Stop Conditions

In scope:

- add a new `Wizard` panel in the popup UI
- import `.yml/.yaml` scrapper config, validate, store in `chrome.storage.local`
- custom scrappers take precedence over built-in scrappers during matching
- minimal management: list imported scrappers + delete

Out of scope (this packet):

- full AI-driven “generate selectors” pipeline (we only add availability/status placeholder)
- online editing of imported scrappers (no enable/disable/priority UI)
- auto-pagination / infinite-scroll aggregation

Stop conditions:

- any regression in core extraction flows (Extract/History)
- imported scrappers can crash scraping (must fail-safe and fall back)

## Acceptance Criteria

- user can import a `.yml/.yaml` file in Wizard panel
- imported scrapper appears in list; can be deleted
- when visiting a matching URL, the imported scrapper is used (custom-first)
- when deleted, behavior falls back to built-in scrappers/default extraction

