# Dispatch C — InvestecAccount cleanup (CTO + CDO merged)

DATE: 2026-05-26
OWNER: senior-dev (full-stack, single component but multi-faceted)
PRIORITY: P1 — depends on Dispatch A (z-index) for the headline bug; everything else
is independent and can start immediately.
BRANCH: feat/headless-migration

## Goal
Bring `/app/pipeline/investec/account` to operator-quality: tenant-aware,
reconciliation-ready, sticky-filtered, URL-shareable, and free of memory-cleanup
sloppiness.

## Constraints
- No inline `style="..."` with tokens.
- KDL tokens only.
- Lucide icons only.
- useToast for transient notifications; KAlert for inline destination-confirmed
  results (existing pattern — keep).
- Geist 14px base.
- DO NOT touch KTable.vue (in-flight column-alignment fix).
- DO NOT change KSelect.vue (Dispatch A will land it first or in parallel — coordinate
  the merge; rebase if needed).

## Approach — merged from both audits

### Header refactor (CDO #2)
- Wire `tenantContext` slot of `PageHeader` (PageHeader.vue:14) with the active
  tenant name. Existing tenant state — check `useTenant`/`useActiveTenant`
  composable or the auth store.
- Cut subtitle "Search bank transactions across all Investec accounts" (filler).
- Replace with a meta strip: "Investec · {N} accounts · {M} transactions · synced
  {humanizedTime} ago" derived from existing `accounts`, `transactionCount`, and
  `lastSyncedAt`.
- Remove the Sync tab. Move the "Update from API" action to a header-right action
  button (`<button class="btn btn-ghost btn-sm">Sync from API</button>` with an
  inline tail "· last 12 min ago"). The sync-result KAlert keeps rendering inline
  below.

### Filter bar (CDO #3)
- Sticky-pin the FilterBar under the PageHeader (`position: sticky; top:
  {header-height};`). Confirm header height token in `src/css/klikk.css`.
- DROP the "Search" button. Filters already autofire via `debouncedSearch` (300ms)
  and `onFilterChange`. The button was decorative.
- Active-filter chip row directly under the FilterBar:
    - One chip per active filter showing "Description: salary ×", "From: 2024-01-01
      ×", "Account: 10010… ×", "Clear all" at the right.
    - Clicking × clears that filter and re-fires the search.
    - "Clear all" zeros every filter and re-fires.
  Use existing KChip primitive if it exists (search `src/components/klikk/KChip.vue`);
  otherwise inline a `.filter-chip` style in this page's scoped block (acceptable
  for one-off, OR raise a follow-up to create KChip).

### Column merge (CDO #cut)
- Merge `account_number` + `account_name` into ONE "Account" column at size 220.
  Cell renders two lines OR primary-with-muted-suffix:
    "10010123456"          (primary, 13px regular)
    "Primary Cheque"       (muted, 12px regular, var(--kdl-text-muted))
  Use a `<template #cell-account>` slot. Drop the separate `account_name` column
  from `kColumns`. Save ~290px of width that the description column needs.

### Pagination row (CDO #restructure)
- Replace native `<select>` (line 111-122) with `<KSelect>` for consistency.
  Options: 50/100/250/500/1000 (drop the "All" option per perf concerns below).
- Re-layout to Linear/Stripe convention:
    `[range + rows-per-page]   [< Previous   Page X of Y   Next >]`
  rather than the current `[Prev] [range + rows] [Next]`.

### URL sync (CDO #missing)
- `KTabs :url-sync="true"` for transactions/sync — but we're removing the sync tab,
  so this becomes moot. If we keep tabs at all, sync them.
- Filters: push `description`, `account`, `date_from`, `date_to` into the query
  string via `vue-router`'s `useRoute()` / `useRouter()`. On mount, hydrate filters
  from `route.query`. Debounce the route push so we don't spam history (use
  `router.replace`, not `router.push`, for filter updates — they shouldn't create
  back-button entries).

### Download Excel (CDO #cut)
- Move "Download Excel" out of the FilterBar's button-stack. Place it as a quiet
  top-right action on the table — either in KTable's `#toolbar` slot or as a
  sibling `<div>` above the table with right-alignment. Icon + text:
    `<button class="btn btn-ghost btn-sm"><DownloadIcon /> Export</button>`
- "Excel" is the format; the verb is "Export". Operators don't care about the
  format until the file lands.

### CTO #fixes
- Cap page-size at 1000 (drop "All" option). Operators who want all of it should
  click Export.
- `onUnmounted`:
    ```
    onUnmounted(() => {
      if (searchTimeout) clearTimeout(searchTimeout);
      fetchAbortController?.abort();
    });
    ```
- `<span aria-live="polite">` wrapping the result-count span at line 107.
- `:aria-busy="loadingTable"` on the table's SectionCard / region wrapper.

### Doctrine debt CDO flagged
- FilterBar chevron transition string (InvestecAccount.vue:43 if applicable —
  check FilterBar.vue if this is the issue) — move the transition declaration into
  the stylesheet. Inline `:style` keeps only the dynamic transform value.

## Acceptance criteria
- [ ] KSelect dropdown for "Account" renders ABOVE the sticky thead (post-Dispatch
      A landing).
- [ ] Tenant name visible in the header.
- [ ] Sync tab removed; sync action moved to header-right with last-sync-time inline.
- [ ] Filter bar pins under header on scroll.
- [ ] Active-filter chips render under filters; each clears with ×; Clear all works.
- [ ] Account number + name merged into one column.
- [ ] Pagination row uses KSelect (not native) + shows "Page X of Y".
- [ ] URL reflects active filters; reloading the page restores them.
- [ ] Export button moved to table-right.
- [ ] No "All" page-size option.
- [ ] `onUnmounted` clears timeout + aborts in-flight request.
- [ ] `aria-live` on count, `aria-busy` on table region.
- [ ] Zero Vue console warnings on this page (depends on Dispatch B).
- [ ] Test count up by at least 2 (unmount + URL round-trip).

## Vitest gates
File: `src/pages/__tests__/InvestecAccount.unmount.spec.ts`
  - Mount, fire input on description, unmount before 300ms debounce, assert
    `fetchTransactions` (mock) NOT called and no unhandled errors.
  - Mount with in-flight request, unmount, assert AbortController.abort spy called.

File: `src/pages/__tests__/InvestecAccount.url-sync.spec.ts`
  - Mount with `route.query = { description: 'salary', account: '10010' }`,
    assert filters hydrated AND fetchTransactions called with those params.
  - Set a filter, assert `router.replace` called with the new query.

## Out of scope
- Touching KTable.vue, KSelect.vue (Dispatch A), KInput/KSpinner (Dispatch B).
- Backend changes (description index, Excel injection escaping, log scrubbing —
  Dispatch D follow-up ticket).
- Total-row / footer summary (CDO #missing — defer to a follow-up if budget allows).
- Keyboard shortcuts / palette registration (CDO #missing — defer).
- Sort affordance on Amount/Account/Description columns (defer; backend ordering
  not confirmed for those fields).

## Risks
- Sticky FilterBar collides with sticky thead on tall viewports. Mitigation: set
  filter-bar z-index to `var(--kdl-z-sticky)` (or a higher band), thead stays at
  its own band. Verify both visible after scroll.
- URL sync on every keystroke spams history. Mitigation: debounce route updates
  with the same 300ms used for fetches.
- Removing the "All" page-size is a behavioural change. If MC wanted it for one-off
  export needs, the Export button covers the use case.
