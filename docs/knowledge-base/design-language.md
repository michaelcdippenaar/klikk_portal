# Klikk Financials design language

![Current component language](screenshots/03-design-system-current.jpg)

## Character

Klikk is a restrained finance-administration interface: neutral paper-like surfaces, compact controls, precise tables, strong typography and selective colour. The product should feel calm, accountable and fast rather than decorative.

Core visual cues:

- Geist for interface text and tabular numerals for financial values;
- navy (`#2B2D6E`) for trust and primary action;
- pink (`#FF3D7F`) as a sparing accent, selection and focus signal;
- low-contrast grey-lilac page and card surfaces;
- 1px borders, 6/8/12px radii and soft shadows;
- 4px spacing grid with 8/12/16/20/24/32px steps;
- compact 32px desktop controls and 44px touch targets on mobile;
- Lucide-style icons at 1.75 stroke width;
- explicit success, warning, danger, information, running and neutral states.

## Token sources

The canonical implementation is `src/css/klikk.css`. It owns:

- typography sizes from 11px overline to 16px section headings;
- line heights, spacing, radii and control heights;
- light and dark surface/text/status tokens;
- portal z-index layers;
- motion durations and easing;
- shared button, input, card and typography classes.

Pages and components should consume semantic `--kdl-*` tokens. Raw hex values are acceptable in the token definition layer, not in feature CSS.

## Component grammar

Use these primitives before adding local equivalents:

- structure: `AppShell`, `AppDrawer`, `AppPage`, `PageHeader`, `SectionCard`;
- input: `KInput`, `KSelect`, `KMultiSelect`, `KCheckbox`, `KToggle`, `KRadioGroup`, `KFile`, `KForm`;
- feedback: `KAlert`, `KToast`, `KSpinner`, `EmptyState`, `ResultPanel`, `PersistentResultStrip`;
- state: `StatusPill`, `FreshnessChip`, `KBadge`, `KChip`, `MetricTile`;
- interaction: `KTabs`, `KDialog`, `KMenu`, `KPopover`, `KTooltip`, `KCommandPalette`;
- data: `KTable`, `KTablePagination`, `FilterBar`, `MonthCoverageStrip`;
- operations: `KOperationCard`.

`StatusPill` communicates state. `KBadge` communicates count, label or metadata. A tone passed to a component must exist in its prop validator.

## Interaction principles

1. Keep company, financial year and period visible in the shell.
2. Lead every page with the user's finance goal and the next accountable action.
3. Use progressive disclosure for expert filters and configuration.
4. Separate View, Edit and Run modes; do not show inactive authoring controls as if they work.
5. Keep source evidence beside the field or decision it supports.
6. AI suggestions are drafts until a human confirms them; show what will change before committing.
7. State must survive navigation: filters, selections, run results and correction drafts should not disappear unexpectedly.
8. Financial tables use right-aligned tabular numerals, explicit signs and consistent South African currency/date formatting.
9. Never rely on colour alone; pair it with text, icon and semantic role.
10. Every destructive, posting or approval action names its scope and provides a recoverable path where possible.

## Current debt

- The design primitives are coherent, but 347 raw `<button>` elements and 50 raw input/select/textarea elements remain across pages and components.
- Feature pages still carry significant local CSS and roughly 101 hardcoded colour literals outside the shared design source.
- Alias drift remains (`--kdl-status-error`, `--kdl-surface`, `--kdl-border-strong`, `--kdl-accent-soft`, `--kdl-selected-bg`) and should be reconciled with the canonical semantic tokens.
- Navigation is duplicated across route definitions, the operations sidebar and command palette.
- `KTablePagination` exposes a literal `Page {{ pageIndex + 1 }} of {{ pageCount }}` accessibility label.
- Large feature containers produce visual drift because local UI, data logic and styling evolve together.

## Design rule for new work

New screens should be assembled from the existing token and primitive language. Redesign effort should change information architecture, workflow, responsiveness and evidence visibility—not replace the brand with a generic dashboard theme.
