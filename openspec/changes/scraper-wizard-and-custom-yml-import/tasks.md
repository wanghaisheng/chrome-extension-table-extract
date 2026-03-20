<!-- output: OpenSpec change packet tasks (Gate C) -->
# Tasks

1) Add OpenSpec packet + WAL entry
2) Implement custom YAML parse/validate/store/list/delete
3) Add Wizard panel UI and wire import/management
4) Make background matching async and custom-first
5) Add Playwright E2E covering import → scrape → delete → fallback
6) Run `npm run build` + `npm run test:pw`

## Validation Matrix

- Unit:
  - YAML validation rejects unsupported types / missing fields
  - glob URL matching treats `? .` literally and `*` as wildcard
- E2E:
  - import custom scholar YAML → scrape fixture → preview header matches YAML
  - delete custom YAML → scrape again → falls back (header differs or built-in used)

