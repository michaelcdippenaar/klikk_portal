# Design Note — Dispatch B — KTable a11y triad + magic-number extraction — 2026-05-26

## Goal
Land three a11y polish items (F5 kbd sort, F6 aria-controls, F8 empty-state announce) and one architectural-hygiene item (F7 — name the 372px viewport offset), all touching KTable + InvestecAccount. No new runtime features.

## Constraints
- Working dir: `/Users/mcdippenaar/ClaudProjects/klikk_financials_portal`. Branch: `feat/headless-migration`. Do NOT push.
- Vitest gate: every change must be accompanied by a Vitest assertion (per MC standing policy).
- No inline `style="..."` attrs — global memory rule. All styling via scoped `<style>` or `klikk.css` tokens.
- Build must remain clean (`npm run build`).
- Existing 180/180 tests must continue to pass.

## Approach

### F5 — Keyboard sortable headers (KTable.vue)
In the sortable `<th>` (currently click-only, lines ~131-141), add:
- `:tabindex="header.column.getCanSort() ? 0 : -1"`
- `@keydown.enter.prevent` and `@keydown.space.prevent` → call the same toggle handler as click
- A visible `:focus-visible` ring via scoped CSS using `var(--kdl-focus-ring)` (or `outline: 2px solid var(--kdl-accent)` if no token exists — use a token; do not inline-style)
- Keep existing `aria-sort` plumbing intact

### F6 — aria-controls (KTable.vue + InvestecAccount.vue)
- KTable: expose an `id` prop (default: auto-generated via `useId()` if available, else a `kt-` prefixed `Math.random` stable id from setup). Apply that id to the scrollable table region (`.ktable-scroll` or the `<table>` element — pick the region most semantically correct: the scroll/results container, not the wrapping toolbar).
- Re-emit / expose the resolved id via `defineExpose({ regionId })` so consumers can target it.
- InvestecAccount: bind a stable `tableRegionId` ref → pass to `<KTable :id="tableRegionId">`, and bind `aria-controls="tableRegionId"` on each filter `KInput` / `KSelect` / `KDateInput` in the filter bar.

### F8 — Empty state announcement (KTable.vue)
- The EmptyState wrapper inside KTable (currently passive) needs `role="status"` and `aria-live="polite"`. One-line addition.

### F7 — Name the 372 magic number (InvestecAccount.vue)
Two acceptable approaches; pick the simpler:
- (Preferred) Extract to a named constant at the top of `<script setup>`: `const TABLE_CHROME_OFFSET_PX = 372` with a brief comment listing what it sums (header + page-padding + page-header + filter-bar + pagination).
- (Optional upgrade — only if cheap) Introduce a CSS custom property `--kdl-table-chrome-offset: 372px` in `klikk.css` and reference via `getComputedStyle(document.documentElement).getPropertyValue('--kdl-table-chrome-offset')`. Skip if it adds complexity.

Stop at the named constant unless the CSS-var route is one line of effort.

## Acceptance criteria
- [ ] Sortable `<th>` is reachable via Tab and toggles sort with Enter and Space; focus ring is visible
- [ ] Each filter control in InvestecAccount has `aria-controls` pointing to the KTable region id
- [ ] EmptyState inside KTable carries `role="status"` and `aria-live="polite"`
- [ ] `372` literal is replaced by a named constant (`TABLE_CHROME_OFFSET_PX`) with explanatory comment
- [ ] New Vitest cases (minimum 4):
  - `KTable.spec.ts`: sortable header has tabindex=0; pressing Enter on a focused sortable header invokes toggleSorting
  - `KTable.spec.ts`: EmptyState region has role=status when data is empty
  - `KTable.spec.ts`: when `id` prop is passed, region carries that id; otherwise an id is auto-generated and exposed
  - `InvestecAccount.spec.ts` (or existing): filter inputs render `aria-controls` pointing to the table id
- [ ] `npm test` passes; `npm run build` clean
- [ ] No inline `style="..."` introduced

## Out of scope
- F4 dual-pagination collapse (skipped this round — backlog)
- F9 KSelect coercion (skipped — working today, backlog)
- Slot rename `row` → `rowData` (skipped — handled via docstring upgrade in Dispatch A)
- Column-size validator (backlog)
- Any change to the AbortController / fetch logic
- Visual redesign of hover/selected row CSS

## Security / compliance gates
- [ ] No new endpoints
- [ ] No new PII surface
- [ ] No migrations
- [ ] No new public surface

## Risks to watch
- `useId()` is Vue 3.5+. Confirm Vue version; fall back to a `kt-${Math.random().toString(36).slice(2,9)}` ref initialised in setup if unavailable.
- `aria-controls` on a control that does NOT have a focusable id target is silent — verify the target exists in the DOM.
- Adding tabindex to thead cells must not break existing click handlers — preserve `@click`.
- Focus ring must use a token, not an inline color.

## Vitest gate (mandatory)
At least 4 new assertions per the acceptance criteria above. Run `npm test` before claiming done. Report final test count.
