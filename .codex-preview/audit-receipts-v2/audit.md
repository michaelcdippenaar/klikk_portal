# Receipts V2 design audit

Date: 2026-08-20

## Scope

Receipts V2 queue, Office Crew receipt review, correction form, and supplier journal entry point. Combined UX, visual consistency, and screenshot-level accessibility review.

## User goal

Review a receipt quickly, compare it with the extracted information, correct only what is wrong, search supplier journals, and make a controlled decision without changing Xero accidentally.

## Findings

- The workflow and side-by-side receipt comparison are sound, but local CSS values had drifted away from the Klikk component language.
- Spacing, type sizes, radii, finance-number styling, and semantic states were repeated as component-local values.
- Several semantic variables were referenced but never declared, including sunken surfaces, status colours, and the finance mono stack.
- The hand-built summary and supplier search duplicated existing Klikk components.
- Ten-pixel labels and inconsistent control heights made the page feel denser and less deliberate than the rest of the application.

## Changes completed

- Added shared typography, spacing, radius, control, finance-number, surface, and semantic-state tokens for light and dark themes.
- Replaced the queue summary with MetricTile components.
- Replaced the supplier search field with KInput and aligned its action height.
- Tokenized all Receipts V2 component colours, spacing, type sizes, borders, radii, and focus states.
- Increased small labels to the shared caption scale and reduced nested border noise.
- Added regression coverage preventing component-local colour literals from returning to Receipts V2.

## Flow health

1. Queue and summary — Healthy. Queue metrics now have a consistent hierarchy and finance-number treatment.
2. Receipt comparison and correction — Healthy. Image and information remain side by side, with clearer read-only surfaces and an explicit edit state.
3. Supplier journal search and decision — Healthy. Search uses the standard input primitive and retains the read-only Xero control boundary.

## Evidence limits

The production desktop state and Edit/Cancel transition were checked. Screenshot evidence cannot prove full WCAG compliance; keyboard traversal, screen-reader announcements, and zoom reflow still need a dedicated accessibility test pass.

## Evidence

- `01-current.png` — pre-cleanup audit capture.
- `02-refined.png` — deployed refined production capture.
