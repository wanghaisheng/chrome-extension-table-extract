<!-- pos: durable spec under OpenSpec change packet -->
# Spec: Wizard + custom YAML import

## Import

- Accept `.yml` / `.yaml` files
- Parse as YAML and validate it matches `ScrapperOptions`
- Store a normalized record in local extension storage

## Precedence

- If multiple custom scrapers match a URL, use the most recently imported (highest `addedAt`)
- If no custom scrapers match, use built-in YAML scrapers
- If no YAML scraper matches, use default extraction path

