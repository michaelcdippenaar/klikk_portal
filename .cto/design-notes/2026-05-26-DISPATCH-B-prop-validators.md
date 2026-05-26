# Dispatch B — KInput + KSpinner prop validators

DATE: 2026-05-26
OWNER: senior-dev (small, single-stream)
PRIORITY: P1 — console noise drowns real warnings (OWASP A09 logging hygiene).
BRANCH: feat/headless-migration

## Goal
Eliminate every Vue prop-validator warning produced by the Investec Account page on
mount + re-render. Two primitives, two small validator changes, two tests.

## Constraints
- No API breakage — existing valid call sites must continue to work.
- Pattern parity across the kit — if other components have similar validator gaps,
  flag (but don't fix outside this dispatch).

## Approach
1. KInput.vue:159-163 — `type` prop validator currently accepts:
     ['text','password','email','number','search','tel','url']
   ADD: 'date', 'time', 'datetime-local', 'month', 'week'.
   (HTML5 input types that are reasonable for finance/admin forms.)

2. KSpinner.vue:57-60 — `size` prop validator currently accepts strings only
   (`['xs','sm','md','lg']`). InvestecAccount passes `size="14"` (string number).
   Two ways:
   (a) Change call sites in InvestecAccount.vue (3 occurrences: lines 63, 69, 150)
       to `size="sm"`. Minimal change.
   (b) Extend KSpinner: `type: [String, Number]`; validator:
       `v => typeof v === 'number' ? v > 0 : ['xs','sm','md','lg'].includes(v)`.
       Then update call sites to `:size="14"` (numeric binding).
   Recommend (b) — operators reach for pixel values when matching button-row spacing.
   But call sites MUST become `:size="14"` (with the colon — numeric binding), not
   `size="14"` (string). Fix both KSpinner + the 3 call sites.

## Acceptance criteria
- [ ] Investec Account page mounts and renders with ZERO Vue warnings from KInput
      or KSpinner (verified by clearing logs/portal_dev.log, reloading the page,
      and tailing it).
- [ ] Existing KInput call sites with type=text/email/number/etc. unaffected.
- [ ] Existing KSpinner call sites with preset sizes unaffected.
- [ ] Test count up by 2+.

## Vitest gates
File: `src/components/klikk/__tests__/KInput.types.spec.ts`
  - For each of ['text','password','email','number','search','tel','url','date',
    'time','datetime-local','month','week']:
      mount, assert `console.warn` spy not called with "Invalid prop".
  - For 'banana' (unknown): assert warning IS emitted (validator still rejects garbage).

File: `src/components/klikk/__tests__/KSpinner.size.spec.ts`
  - For each preset ['xs','sm','md','lg']: mount with `size="xs"` etc., assert no warn.
  - For numeric: mount with `:size="14"` and `:size="24"`, assert no warn.
  - For 0 / negative / non-numeric: assert warn.

## Out of scope
- Any other validator audit across the kit (file as follow-up if found).
- Restyling the spinner.

## Risks
- None material. Worst case: a future caller passes `size="14"` (string) thinking
  it's the same as `:size="14"` — validator (b) will reject string "14". Acceptable
  because that's actually a bug (string vs numeric).
