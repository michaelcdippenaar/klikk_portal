# ADR — Negative number presentation in Klikk Financials Console

**Date:** 2026-05-25
**Status:** Accepted
**Owner:** CTO
**Applies to:** all numeric tables, KPI cards, exports, and detail views in the portal.

## Decision

1. **In accounting / financial tables (DataViewer, trial balance, ledger views, balance sheet, P&L, comparison views, Investec transactions):** negatives are rendered in **parentheses** with no minus sign. Example: `(1,234.56)`. Positives render bare: `1,234.56`. Zero renders as `–` (en-dash) when the column is sparse, `0.00` when dense.

2. **Outside accounting tables (process result counters, dashboard deltas, sync diff badges, AI agent metrics, log lines):** negatives are rendered with a **leading minus sign**. Example: `-12 records`. This is the form users expect in operational / engineering contexts.

3. **Colour is a secondary signal, never the primary one.** Negatives are not coloured red by default. Red (`klikk-danger`) is reserved for:
   - explicit variance/delta cells where the sign of the change is the whole point of the cell (e.g. period-over-period comparison columns);
   - error / warning states unrelated to sign.
   A black-on-cream negative reading `(1,234.56)` must be unambiguous on its own — never let colour carry the semantic load (a11y; print exports; colour-blind users).

4. **Tabular figures are mandatory** on every numeric cell: apply `.kdl-numeric` (which sets `font-variant-numeric: tabular-nums`). Columns must right-align. Thousands separator is the comma. Decimal is the point. Currency symbol (`R`) lives in the column header, not in every cell, except for mixed-currency reports.

5. **CSV / XLSX exports use raw signed values** (`-1234.56`), not parentheses. Parentheses are a presentation-layer convention only; downstream consumers expect machine-readable signed numbers.

## Why

Finance/accounting users in South Africa read parenthesised negatives by reflex — it is the SAICA / IFRS-aligned convention used in every audited financial statement they see. Operational counters (sync stats, process runner output) are not financial statements and would feel weird parenthesised. Reserving red for explicit delta columns means a calm, dense table doesn't strobe red the moment a tenant has any negative balance — the table stays readable at a glance and red still means something specific when it appears.

## How

A single Vue composable `useFormatCurrency()` (to be implemented by senior-dev during DataViewer conversion) takes `(value, { mode: 'accounting' | 'operational' })` and returns the formatted string. All currency cells in DataViewer pass `mode: 'accounting'`. ProcessCard result panels pass `mode: 'operational'`. No component formats numbers inline.

## Out of scope

- Multi-currency formatting beyond ZAR — defer until a non-ZAR tenant ships.
- Locale-aware separators — defer; SA convention is comma-thousands, point-decimal, matches the en-ZA default.
- Per-tenant override of negative convention — not requested; not building.
