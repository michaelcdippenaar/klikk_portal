# Design Note — KTable virtualizer crash fix — 2026-05-26

## Goal
Eliminate the runtime error `$setup.virtualizer.getTotalSize is not a function` that's preventing pages with KTable (InvestecShareCodes, FinancialInvestments, DataViewer, Processes, InvestecHoldings once it gets a table) from rendering.

## Mechanism (root cause)
`@tanstack/vue-virtual`'s `useVirtualizer(...)` returns a `Ref<Virtualizer>`. In `KTable.vue` line 513 it is wrapped in a `computed()`:

```ts
const virtualizer = computed(() => {
  if (!props.virtual) return null;
  return useVirtualizer({ ... });   // returns Ref<Virtualizer>
});
```

So `virtualizer` is `ComputedRef<Ref<Virtualizer> | null>`. In the template, auto-unwrap collapses ONE layer of ref — yielding the inner `Ref<Virtualizer>` itself (or `null`), NOT the `Virtualizer` instance. `virtualizer.getTotalSize` is therefore `undefined`, which is exactly the symptom.

The `v-if="virtual && virtualizer"` gate on line 202 doesn't help — `virtualizer` (the inner ref) is truthy, so the block renders, then crashes on `.getTotalSize()`.

Secondary risk hinted at by the prior senior-dev: `useVirtualizer` should not be called inside a `computed` — composables should run once during setup, not in reactive recomputes.

## Constraints
- Surgical only. Don't rewrite KTable. Don't reshape column/header/pagination logic.
- Non-virtual path (the vast majority of usages — InvestecShareCodes is ~70 rows, no `virtual` prop) must work with zero virtualizer initialisation.
- Virtual path must still work for the 1000-row case.
- Existing 43 KTable specs must still pass.

## Approach
Pick whichever is cleaner — senior-dev's call, but the recommended shape:

**Option A (preferred, smaller diff):** Replace the `computed()` with a `shallowRef<Virtualizer | null>(null)` populated by a `watchEffect` that only runs when `props.virtual === true`. Unwrap correctly so the template sees a `Virtualizer` instance, not a nested ref. All template references become `virtualizer?.getTotalSize()` etc., gated by `v-if="virtual && virtualizer"`.

**Option B:** Split the `<tbody>` into two completely separate `<template>` blocks — one for `virtual === true` (calls `useVirtualizer` in setup via `computed` ONLY when virtual is true at setup time), and one for non-virtual (the standard path). Accept that toggling `virtual` at runtime would require remount.

Senior-dev: pick A unless A reveals a hidden constraint. Document which you picked in the commit message.

## Acceptance criteria
- [ ] `npm run dev` and visit `/investec/share-codes` — page renders 70 rows, no console errors
- [ ] Visit `/financial/investments`, `/data-viewer`, `/processes` — all render their KTables, no console errors
- [ ] Existing 43 KTable specs still pass (`npm test`)
- [ ] New spec `KTable.virtualizer.spec.ts` passes — three cases:
  - non-virtual + 30 rows → no virtualizer errors, all 30 rows in DOM
  - virtual + virtualHeight 400 + 1000 rows → virtualizer initialised, `getTotalSize()` > 0, at least 5 rows rendered
  - flip `virtual` false→true reactively → no crash (acceptable to require nextTick / remount; just no thrown error)
- [ ] Final test count: 43 + 3 = 46 (or more if senior-dev adds defence-in-depth specs)

## Out of scope
- Pagination rewrites
- Column resizing
- Anything in the table other than the virtualizer wiring

## Security/compliance gates
- N/A — pure client-side rendering fix, no data surface change

## Risks the senior should watch for
- Option A: `watchEffect` re-running when `data` changes recreates the virtualizer — fine for correctness but check it doesn't thrash. If it does, key the watch on `() => [props.virtual, props.virtualHeight]` only, and have the virtualizer's own internal reactivity track `rows` via its `count` callback.
- `parentRef` / scroll container ref must be available BEFORE the virtualizer initialises. Use `onMounted` or guard on `parentRef.value` being non-null.
- Switching `virtual` false → true at runtime: if Option A, the watchEffect handles it. If Option B, document that runtime toggling is unsupported.

## File scope
- `src/components/klikk/KTable.vue` (modify)
- `src/components/klikk/__tests__/KTable.virtualizer.spec.ts` (new)

## Branch
`feat/headless-migration` (current). Local commit only — no push.

## Commit message guidance
`fix(ktable): gate virtualizer init behind virtual prop + unwrap ref correctly`

Body should name the bug (computed-wraps-ref double-wrap) and which option (A or B) was chosen.
