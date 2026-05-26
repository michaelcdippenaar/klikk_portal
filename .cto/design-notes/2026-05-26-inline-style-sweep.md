# Design Note — Inline-style sweep across src/pages/ — 2026-05-26

## Goal
Bring `src/pages/` into compliance with the no-inline-CSS-tokens policy: no literal `style="..."` strings with hardcoded sizes/colors/typography. Replace with scoped classes (or shared design-token classes if appropriate).

## Mechanism (verified by grep)
Running:
```
grep -rEn 'style="[^"]*(max-width|min-width|width:|font-size:|color:|background:)' src --include="*.vue"
```

reveals that `FinancialInvestments.vue` (the file the prior audit flagged) is **already clean** — it isn't in the offender list. The remaining offenders are:

- **`KlikkPreview.vue`** — ~40 inline-style hits. This is the component showcase / preview page used to demonstrate the design system. Senior-dev: confirm with CTO whether this file is exempt from the policy (it's a docs/preview surface), OR migrate every hit to scoped utility classes. Default position: **NOT exempt** — even the showcase should model the policy. Migrate.
- **`KTable.vue` line 130** — `:style="header.column.columnDef.meta?.width ? { width: header.column.columnDef.meta.width } : {}"` — this is a `:style` (dynamic v-bind), policy-allowed. **Leave alone.**
- **`Dashboard.vue` line 171** — `:style="{ width: Math.min(...) + '%' }"` — dynamic v-bind. **Leave alone.**
- **`InvestecShareCodes.vue` line 249** — this is a COMMENT inside `<style scoped>` referring to a removed inline style. Not a violation, but the comment is now stale; tidy it to just describe what the class does without referencing the removed inline style. (Cosmetic, not blocking.)
- **`InvestecHoldings.vue` line 92** — same — stale comment in a scoped style block. Tidy.

## Approach
1. **`KlikkPreview.vue`** — replace every `style="..."` with `class="..."` referencing scoped classes defined in a single `<style scoped>` block at the bottom. Use existing design tokens (`var(--kdl-text-muted)`, `var(--kdl-text-primary)`, `var(--kdl-accent)`) — most of the inline styles already reference these tokens, so the migration is mechanical: pull the style attribute into a class with the same declarations.
   - Group repeating patterns into reusable classes: e.g. `.preview-row-grid-2col`, `.preview-fine-print`, `.preview-token-label`, etc. Don't proliferate one-shot classes per element.
2. **`InvestecShareCodes.vue` line 249 + `InvestecHoldings.vue` line 92** — clean up stale comments. Cosmetic only.
3. Run the grep again at the end — assert zero remaining literal-style hits in `src/pages/` other than dynamic `:style` bindings.

## Acceptance criteria
- [ ] `grep -rEn 'style="[^"]*(max-width|min-width|width:|font-size:|color:|background:)' src/pages --include="*.vue"` returns ZERO hits (after the sweep)
- [ ] `KlikkPreview.vue` still renders the showcase correctly (eyeball + Vitest static check below)
- [ ] No new untyped colors or sizes — every replaced value should reference a `--kdl-*` token where one exists
- [ ] Vitest spec `inline-style-policy.spec.ts` (new, under `src/__tests__/` or `src/pages/__tests__/`) that:
  - Reads every `.vue` file in `src/pages/`
  - Uses a regex to assert there are zero matches of `style="[^"]*(max-width|min-width|width:|font-size:|color:|background:)`
  - Allows `:style="..."` (dynamic bindings)
  - Fails the suite with a useful message naming the offending file + line if anything slips in later
- [ ] All existing tests still pass

## Out of scope
- Other directories outside `src/pages/`. KTable's `:style` is dynamic and allowed. Component-library files (`src/components/klikk/*`) aren't in scope for THIS sweep — file a follow-up if you find offenders.
- Refactoring the visual design of KlikkPreview — keep the appearance identical, only move declarations into classes.

## Security/compliance gates
- N/A

## Risks
- Visual regression on KlikkPreview if a declaration is missed in the move. Mitigation: do the migration in small commits, eyeball each section.
- The Vitest static check could be brittle if it scans `node_modules` or build artefacts. Scope the file glob tightly to `src/pages/**/*.vue`.

## File scope
- `src/pages/KlikkPreview.vue` (heavy migration)
- `src/pages/InvestecShareCodes.vue` (tidy stale comment)
- `src/pages/InvestecHoldings.vue` (tidy stale comment)
- `src/pages/__tests__/inline-style-policy.spec.ts` (new) — or `src/__tests__/` if that's the existing convention

## Branch
`feat/headless-migration`. Local commit only.

## Commit message guidance
`chore(pages): move inline styles to scoped classes; add Vitest guard`
