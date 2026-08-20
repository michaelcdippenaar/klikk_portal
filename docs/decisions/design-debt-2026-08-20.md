# Design-system debt — deferred from the Findings register deploy (2026-08-20)

A design-system audit of the Findings UI (`src/pages/AuditFindings.vue`,
`src/components/findings/*`) came back **on-system with one blocker**. The blocker and
three cheap fixes were done in that deploy. The items below were **consciously deferred**
— they are real, they are not urgent, and each is bigger than the deploy that found them.

What was cleared outright, for the record: zero hardcoded hex, AA contrast computed and
passing, `prefers-reduced-motion` covered, status never signalled by colour alone, focus
rings inherited from the system.

## Fixed at the time (context for what follows)

- **Blocker** — `FindingLinks.vue` used `<KBadge tone="success">`, but KBadge's validator
  is `['default','accent','muted']`. The unknown tone emitted a class with no matching
  rule, so the chip rendered as bare unstyled ~10px text. Replaced with
  `<StatusPill tone="success" label="Linked" size="sm" />` — StatusPill's validator
  includes `success`, and "Linked" is *state*, so it was also the semantically right
  primitive. **Prop validators fail silently in production Vue** — that is the whole
  lesson here, and it is why rule 1 below exists.
- Motion literals in `FindingAttachments.vue` → `var(--duration-short|--duration-medium)`
  + `var(--ease-standard)` (behaviour-identical: the tokens are defined as exactly
  `150ms` / `200ms` / `cubic-bezier(0.2, 0, 0, 1)`).
- `FindingCubeView.vue` depth indents `24/38/52/66` → `24/36/48/60` (12px step, on the
  4px grid; the old 14px step was on no scale).
- The `inline-style` CI guard was widened from `src/pages/` to `src/pages/` +
  `src/components/`. Extracting the findings UI into components had moved ~1,900 lines of
  styled markup outside the guard's blast radius.

## Deferred — worth doing, in rough priority order

### 1. Two phantom tokens (verify first, it is cheap)
`--kdl-surface-sunken` and `--kdl-font-mono` are **referenced but never defined**
(measured 2026-08-20: 9 and 10 references respectively, 0 definitions). Today they
degrade quietly because call sites pass a fallback —
`var(--kdl-surface-sunken, var(--kdl-hover-bg))` — so nothing looks broken, which is
exactly why this will rot unnoticed. Either define them properly in `src/css/klikk.css`
or delete them and use the fallback directly. Do not leave them half-alive.

### 2. `danger` / `warning` tokens — a *subtractive* change
Adding three `--kdl-*` status tokens would **net-DELETE six dark-override blocks** and
let the hardcoded status colours in `KFile` and `PivotExplorer` be reconciled onto the
system. This is the rare token addition that makes the system *smaller*. Sequence it
before any new surface needs a danger state.

### 3. `.label-upper` overline reconciliation
Multiple near-identical overline/label treatments have drifted apart. Consolidate to one.

### 4. Scar-tissue rules to encode
Three rules drafted by the audit, each earned from a real defect:
1. **Tone props must be validator-checked**, and a component must never be handed a tone
   its validator does not list. (From the blocker above — Vue's validator warning does not
   fire in production, so the failure is invisible until someone looks at the screen.)
2. **`@apply` in an SFC may only reference core utilities**, never project classes.
3. **Status colour is never a raw hex** — always a semantic token.
Encode these where the CI guard already lives, so they are enforced rather than remembered.

## Why deferred rather than done

The deploy that surfaced these shipped an audit-findings register MC needs for the FY2026
year-end wrap. Items 2–4 touch shared tokens and shared components across the whole
console; doing them inside a feature deploy would have put unrelated regression risk in
front of a working surface. They want their own pass, with the full console suite as the
gate.
