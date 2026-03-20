<!-- input: Rows telemetry should never break user flows -->
<!-- output: design notes + decisions -->
<!-- pos: change packet design (Gate B) -->
# Design: Rows reporting fail-open

## Goals

- reporting never throws/unhandled-rejects in user flows
- avoid making network calls when configuration is missing

## Decisions

### 1) Missing config => no-op

- If `VITE_SPREADSHEET_ID` / `VITE_TABLE_ID` / `VITE_TABLE_ID_USAGE` are missing, reporting returns early.
- If `VITE_ROWS_API_KEY` is missing, requests proceed without `Authorization` header (but callers already no-op without IDs).

Rationale:

- telemetry is optional and should not emit bad URLs like `.../undefined/...`.

### 2) Fetch wrapper returns `null` and swallows errors

- `makeRequest(...)` catches:
  - network errors
  - non-JSON bodies
  - empty bodies
- returns `null` in all failure cases.

Rationale:

- callers do not need response bodies; they only need to avoid user-visible breakage.

## Risks / Tradeoffs

- loss of telemetry fidelity when config is incomplete or network is unstable (acceptable for best-effort reporting).

