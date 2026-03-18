# Tasks

## Packet Summary

- goal: improve popup UI clarity, safety, and accessibility for Extract + History flows
- in scope:
  - layout and visual polish
  - filter/export/data-management grouping
  - testability improvements (stable selectors)
  - minimal code refactors required by the UX changes
- out of scope:
  - new storage features
  - schema redesign
  - cloud sync or external services

## Success Criteria and Test Suite

- UX:
  - controls are visually grouped; primary actions are obvious
  - destructive actions are clearly labeled and require confirmation
  - long URLs/headers remain readable (wrap/ellipsis) without breaking layout
  - keyboard navigation works for key flows (filters, list open, export)
- tests:
  - `npm run test:unit` passes
  - `npm run test:pw` passes
  - Playwright selectors use roles/testids (no brittle CSS selectors)

## M1. Layout + Information Hierarchy

- [x] M1.1 redesign History layout into clear sections (Filters / Results / Details / Data management)
- [x] M1.2 add a Details “Scope” summary line (domain + pattern + schema) for user confidence
- [x] M1.3 standardize spacing + button hierarchy (primary/secondary/danger) across the popup
- [x] M1.4 ensure small popup behavior: stable scroll regions and long URL/header wrapping
- [x] M1.5 add bulk export for current Results (JSON + merged CSV/TSV)

## M2. Safety + Feedback

- [x] M2.1 add two-step confirmation UX for destructive actions (clear-all, delete domain data) with auto-expire
- [x] M2.2 improve status feedback (copy/download/saved/errors) and loading states (no silent failures)

## M3. Accessibility + Testability

- [x] M3.1 add/normalize labels, focus styles, and keyboard-friendly controls (tab order for filters → results → details)
- [x] M3.2 add `data-testid` for key UI controls (filters, results, details actions, confirm controls)
- [x] M3.3 update Playwright tests to rely on roles/testids; avoid brittle CSS selectors

## Closeout Rule

- commands that ran:
  - `npm run test:unit`
  - `npm run test:pw`
- pass or fail status:
  - pass
- residual risk:
  - popup rendering differences across OS scaling; mitigate with E2E and manual sanity

