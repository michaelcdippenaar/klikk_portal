# Design Note — Dispatch A — KTable consumer smoke-spec layer + docstring upgrade — 2026-05-26

## Goal
Introduce a "smoke" Vitest per KTable consumer page (12 pages) that mounts the page with API mocks and asserts at least one row renders. Plus upgrade the KTable.vue docstring with an explicit slot-shape note (root cause of the `row.original.X` bug shipping twice today).

## Constraints
- Working dir: `/Users/mcdippenaar/ClaudProjects/klikk_financials_portal`. Branch: `feat/headless-migration`. Do NOT push.
- This dispatch runs AFTER Dispatch B lands (so smoke specs assert on the post-B contract — kbd sort, aria-controls, empty-state role=status).
- Tests live in `src/pages/__tests__/<Page>.smoke.spec.ts` (one per consumer).
- Use `@vue/test-utils` + `vitest` + `msw` (or whatever HTTP-mock layer the repo already uses — inspect existing specs first; do NOT introduce a new mocking layer).
- Each smoke spec is intentionally tiny (~5 assertions or fewer): page mounts, API is called, at least one row renders, no Vue warnings emitted, no unhandled rejection.

## Approach

### Consumer list (12)
From `grep -rln "KTable" src/pages` minus KTable.vue itself:
1. `InvestecAccount.vue` (already has spec — extend or supplement)
2. `Comparison.vue`
3. `InvestecShareCodes.vue`
4. `PlanningAnalytics.vue`
5. `InvestecTransactions.vue`
6. `InvestecHoldings.vue`
7. `Investec.vue`
8. `KlikkPreview.vue`
9. `DataViewer.vue`
10. `AgentMonitor.vue`
11. `FinancialInvestments.vue`
12. `DividendForecast.vue`

For each: produce `<Page>.smoke.spec.ts` with the harness pattern documented in step "Smoke harness" below.

### Smoke harness pattern (single file template)
```ts
// src/pages/__tests__/<Page>.smoke.spec.ts
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import <Page> from '../<Page>.vue'
// ... mock the API service this page uses (inspect the page first)

describe('<Page> — smoke', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>
  let errSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('mounts and renders at least one KTable row from mocked data', async () => {
    // mock the api call(s) the page makes — return a 1-3 row payload
    const wrapper = mount(<Page>, { global: { stubs: { /* RouterLink, etc. */ } } })
    await flushPromises()
    expect(wrapper.findAll('tbody tr').length).toBeGreaterThan(0)
  })

  it('emits no Vue warnings or unhandled rejections', () => {
    const vueWarnings = warnSpy.mock.calls.filter(c => String(c[0]).includes('[Vue warn]'))
    expect(vueWarnings).toEqual([])
    expect(errSpy.mock.calls).toEqual([])
  })
})
```

- ~5 assertions per page × 12 pages = ~60 new test cases minimum.
- Inspect each page's API layer first — use whatever mocking pattern the existing InvestecAccount spec uses for consistency.
- If a page is gated by a router param / store hydration the spec cannot satisfy in <50 lines, document the skip with a `it.skip(...)` + one-sentence reason — but no more than 2 skips total across the 12.

### KTable docstring upgrade
At the top of `src/components/klikk/KTable.vue` (lines 10-29 block), insert a new `SLOT CONTRACT` section:

```
  SLOT CONTRACT (cell slots):
    Cell slots receive { value, row, cell } where:
      - `value` is the cell's rendered value (column.accessorKey or accessorFn result)
      - `row`   is the UNWRAPPED data object — i.e. TanStack's `row.original`,
                NOT TanStack's Row<T> wrapper. Access fields directly: `row.account_number`.
                Do NOT write `row.original.account_number` — it will be undefined.
      - `cell` is the TanStack Cell<T> object for advanced use (rare).

    Example:
      <template #cell-account_name="{ row, value }">
        <strong>{{ value }}</strong> ({{ row.account_number }})
      </template>
```

Do NOT rename the slot prop `row` to `rowData` in this dispatch. (CTO call: docstring + smoke-spec layer is the chosen mitigation for the slot-confusion class of bug; a rename touches 12 consumers and is rejected as not worth the surface-area churn this round.)

## Acceptance criteria
- [ ] 12 smoke specs created under `src/pages/__tests__/*.smoke.spec.ts` (1 per consumer)
- [ ] Each spec asserts: page mounts, ≥1 KTable row renders from mocked API, no Vue warnings, no unhandled rejection
- [ ] Total new test cases ≥ 50 (target ~60; floor is 50 to account for ≤2 documented skips)
- [ ] KTable.vue docstring contains a SLOT CONTRACT section as specified
- [ ] `npm test` passes
- [ ] `npm run build` clean
- [ ] No inline `style="..."` introduced
- [ ] Final test count reported in completion message (expect ~240+: 180 baseline + Dispatch B's ~4 + ~60 smoke)

## Out of scope
- Slot prop rename (rejected by CTO this round)
- Column-size validator (backlog)
- Any change to KTable.vue beyond the docstring comment block
- Any production code changes in the 12 consumer pages — smoke specs only

## Security / compliance gates
- [ ] No new endpoints
- [ ] No new PII surface
- [ ] No migrations
- [ ] No new public surface

## Risks to watch
- Some consumers may have heavy setup (router, pinia, auth, websocket). The harness must stub these — DO NOT mount the full app shell.
- If a page uses `defineAsyncComponent` for KTable, the spec must await loading.
- The "no Vue warnings" assertion is strict — it will catch any new `[Vue warn]` introduced by Dispatch B. That is intentional: smoke specs are the safety net for the a11y dispatch.
- If existing fixture/mocking infrastructure does not exist, do not invent a heavy one — keep mocks inline per spec.

## Vitest gate (mandatory)
~60 new cases. Report final count in completion. Confirm `npm test` is green.
