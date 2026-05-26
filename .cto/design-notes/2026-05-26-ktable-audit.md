# KTable Audit — `/app/pipeline/investec/account`

**Date:** 2026-05-26
**Auditor:** CTO
**Scope:** Diagnosis-only. Read-only inspection of current state after the day's fixes
(slot signature, colgroup widths, Account-cell single-inline, portal stacking).
**Mode:** No fixes dispatched. No senior-dev spawns.

---

## Files inspected

- `src/components/klikk/KTable.vue` (852 lines)
- `src/components/klikk/KTablePagination.vue` (237 lines)
- `src/pages/InvestecAccount.vue` (607 lines)
- `src/css/klikk.css` (z-index tokens, `.kdl-numeric`)
- `src/css/portals.css` (portal stacking layer)
- `logs/portal_dev.log` (last 100 entries, plus full grep for warnings/errors)

## Dev-log triage

- All `row.original.account_number` `TypeError` lines are **stale** — last occurrence 13:05:45, before the HMR update at 13:14 that landed the slot-signature fix. No regression.
- Most recent log activity (14:31 / 14:35) shows only repeated `[Vue warn] onScopeDispose() is called when there is no active effect scope to be associated with.` This warning is **real and current** — see F1 below.
- No `console.error`, no further unhandled rejections, no virtualizer crashes.

---

## Findings

### F1 — `useVirtualizer` invoked outside an active effect scope

```
ISSUE: onScopeDispose() warning fires on every route entry into the Investec page
LAYER: js
FILE:LINE: src/components/klikk/KTable.vue:528-539
MECHANISM: useVirtualizer() is a Vue composable; it internally registers an
  onScopeDispose() cleanup. It is being called from inside watchEffect(), not
  from setup(). watchEffect's callback runs without an owning component-effect
  scope after the first synchronous setup tick, so the composable's cleanup
  registration has nowhere to attach. Vue emits the warning on every re-init
  (and the cleanup leaks — old virtualizers are not guaranteed to be torn down).
  The comment at line 523 ("intentional — the virtualizer manages its own
  internal reactivity") is wrong about the consequence: virtualizer-internal
  reactivity is fine, but its dispose hook is not.
SEVERITY: P1 (visible bug in dev log; latent memory leak in prod)
FIX SIZE: small  (call useVirtualizer once at setup with reactive `count`, or wrap
  the call in effectScope() + onScopeDispose to dispose the previous scope)
```

### F2 — Numeric columns are NOT right-aligned (header OR body)

```
ISSUE: Amount (R) and Balance (R) columns render left-aligned despite the
  consumer declaring meta: { align: 'right' }
LAYER: css + template
FILE:LINE: src/components/klikk/KTable.vue:741 (text-align: left on .ktable-th),
           src/components/klikk/KTable.vue:826-833 (.ktable-td has no text-align)
           src/pages/InvestecAccount.vue:235,237 (consumer declares meta.align)
MECHANISM: The consumer correctly tagged Amount and Balance with
  `meta: { align: 'right' }`. KTable's th/td render code never reads
  `column.columnDef.meta?.align` — the only meta key it consults is `meta.width`
  (line 572). The `<span class="kdl-numeric">` wrapper around the value only
  sets `font-variant-numeric: tabular-nums` (klikk.css:117); it does not align.
  Result: every currency number is left-aligned, which is a finance-table
  cardinal sin (eyes cannot scan magnitudes when decimals are not stacked).
SEVERITY: P1 (visible bug — directly contradicts the design intent, and this
  is a finance-admin table where right-aligned currency is table stakes)
FIX SIZE: small  (read meta.align on th and td, apply text-align via class or
  inline style; also propagate to <colgroup> if column-level alignment desired)
```

### F3 — Description column will wrap; row height is NOT uniform in virtual mode

```
ISSUE: Long descriptions wrap to 2+ lines, overflowing the 44px virtual row
  estimateSize, causing visible overlap with the next absolutely-positioned row
LAYER: css
FILE:LINE: src/components/klikk/KTable.vue:826-833 (.ktable-td — no white-space,
           no overflow handling), :536 (estimateSize: () => dense ? 32 : 44)
MECHANISM: `.ktable-td` has no `white-space` declaration, so it inherits
  `normal`. With `table-layout: fixed` and the Description column constrained
  to 340px via the colgroup, any description string wider than ~40 chars wraps
  to a second line. The virtualizer fixes the row height to 44px (or 32px in
  dense mode) regardless. The `<tr>` for that row is `position: absolute;
  top: N*44px;` — its content now exceeds 44px, but the NEXT row is hard-pinned
  at `top: (N+1)*44px`, so they overlap. The user sees text from row N
  bleeding under row N+1.
  Sample data confirms wrap-prone strings: "FNB OB DEBIT CITRIX SYSTEMS, INC.
  ATLANTA GA", "FASTER PAYMENTS CR Klikk (Pty) Ltd …", and many EFT references
  pushing 50–80 chars.
SEVERITY: P0 — this IS the "table is a mess" complaint. With virtual scroll
  on and varied real-world descriptions, the rows will visually collide. On
  pageSize=100 (current default) this is highly likely to be reproducing.
FIX SIZE: small  (add white-space: nowrap + overflow: hidden + text-overflow:
  ellipsis to .ktable-td — same treatment .investec-account-cell already has
  on line 541-543; or `text-wrap: nowrap` per cell. With ellipsis the user
  loses information density — recommend a tooltip on hover via title attr
  or a KTooltip wrap on the description cell as the follow-up.)
```

### F4 — Page-size dropdown emits strings; consumer Number()-coerces, but KSelect option array shape may misalign with current selection display

```
ISSUE: pageSizeOptions are { value: '100', label: '100' } (string values) — the
  v-model is bound to `String(pagination.rowsPerPage)`. Coercion works on the
  way down, but if pagination.rowsPerPage is mutated programmatically (e.g.
  from URL hydration: line 328 sets it as Number), the KSelect's currently-
  selected option is `String(100)` → '100' which matches the option value '100'
  → fine. Just confirming the round-trip; no current bug, but it is fragile.
LAYER: js
FILE:LINE: src/pages/InvestecAccount.vue:152-157, 262-268
MECHANISM: Brittle by convention only. Working today.
SEVERITY: P3 (nit)
FIX SIZE: small  (use numeric option values; let KSelect pass numbers through)
```

### F5 — Two pagination footers render simultaneously

```
ISSUE: KTable renders KTablePagination at lines 313-324; the consumer also
  renders its own custom .investec-pagination footer at lines 145-178. Because
  the consumer passes `pagination="none"` to KTable, KTable's pagination is
  suppressed via the `showPagination` computed → only the consumer footer shows.
  So this is OK in practice — BUT it means KTable's own footer is dead code on
  this page, AND the page is replicating logic (page count, range label, page-
  size selector, prev/next) that the primitive already encapsulates.
LAYER: architecture
FILE:LINE: src/pages/InvestecAccount.vue:145-178 vs KTable.vue:313-324
MECHANISM: Server-side paginated mode in KTable (`pagination="server"` with
  v-model:serverPage + serverTotal) exists precisely for this use case but is
  not used. The consumer reinvents it inline. This is a doctrine drift, not
  a runtime bug.
SEVERITY: P2 (polish / debt — primitive duplication signals a primitive that
  doesn't fit. Either lean on KTable's server mode or accept that this page is
  not using the primitive's pagination at all.)
FIX SIZE: medium (collapse the consumer footer into pagination="server" mode,
  or document why the consumer footer was preferred — context: KSelect for
  the rows-per-page, which KTable's footer uses a plain <select> for.
  Resolution: probably upgrade KTablePagination to use KSelect, then collapse.)
```

### F6 — No keyboard sort affordance on sortable columns

```
ISSUE: The sortable header (only "Date" today, but the primitive supports more)
  responds to click only — no tabindex, no role=button, no keydown handler.
  AGENT_FLEET / Klikk a11y baseline expects WCAG AA — sortable headers must be
  keyboard-actionable.
LAYER: accessibility
FILE:LINE: src/components/klikk/KTable.vue:131-141 (the <th>)
MECHANISM: The <th> has aria-sort, which is good for screen readers reading
  current state, but provides no way to TRIGGER a sort change from keyboard.
  No tabindex="0", no @keydown.enter / @keydown.space.
SEVERITY: P2 (a11y gap; one column today, but it's a primitive — will
  multiply as more sortable columns are introduced)
FIX SIZE: small  (tabindex="0" on sortable th, @keydown.enter.prevent +
  @keydown.space.prevent calling the same toggleSorting; visible :focus-visible
  ring)
```

### F7 — `aria-busy` is on the wrapper, but the wrapper does not contain the loading state

```
ISSUE: InvestecAccount wraps KTable in <div :aria-busy="loadingTable">, which
  is correct, but KTable additionally renders its own loading overlay
  internally with `aria-hidden="true"` on the spinner. The aria-busy on the
  outer wrapper is the right pattern. However the empty state ("No data") is
  inside KTable and does not announce itself via aria-live; if a search yields
  no rows, an SR user gets silence.
LAYER: accessibility
FILE:LINE: src/components/klikk/KTable.vue:88-100 (empty state),
           src/pages/InvestecAccount.vue:148 (aria-live on count only)
MECHANISM: aria-live on the count text is good for "47 rows". But on "0 rows",
  the table region swaps to a static EmptyState component with no role=status
  or aria-live. Result: SR user hears the count change but not the empty
  state's body. Mild gap.
SEVERITY: P3 (a11y polish)
FIX SIZE: small  (add role="status" to EmptyState wrapper or rely on the count
  text — "0 of 0" — which is sufficient if phrased clearly)
```

### F8 — Hover state exists but is very subtle on dark theme; selected-row state has no consumer

```
ISSUE: Selected-row styling at .ktable-row--selected uses color-mix accent
  10% — present and correct. But this page does not render the selection
  column (selectable=false). The CSS is dead code on this page (acceptable —
  it's a primitive). The hover rule (line 809-811) uses var(--kdl-hover-bg).
  In dark mode the contrast versus card-bg is small; ought to be visually
  audited by CDO. Not a P0 from my chair.
LAYER: css
FILE:LINE: src/components/klikk/KTable.vue:809-811
SEVERITY: P3 (design polish — route to CDO if cosmetic)
FIX SIZE: n/a from CTO chair
```

### F9 — Filter inputs do not announce themselves as filtering the table

```
ISSUE: The filter bar inputs are not associated with the table region via
  aria-controls. An SR user filling in "From date" has no programmatic link to
  the table that will update.
LAYER: accessibility
FILE:LINE: src/pages/InvestecAccount.vue:52-94 (filter bar) and :113 (table
  region)
SEVERITY: P3 (a11y polish)
FIX SIZE: small  (add id to the table region; add aria-controls="<id>" to each
  filter KInput / KSelect)
```

### F10 — Hard-coded `tableHeight` magic-number offset (372px)

```
ISSUE: tableHeight calc is windowHeight − 372. The 372 is the eyeballed sum of
  header + page-padding + page-header + filter-bar + pagination-footer. If any
  of those layout pieces changes height (chip row appears, filter bar wraps on
  narrow viewport, pagination wraps), the table over- or under-fills the
  available space.
LAYER: js / layout
FILE:LINE: src/pages/InvestecAccount.vue:217
SEVERITY: P2 (will bite on viewport changes; not a P0 today but the comment
  on line 215-216 already admits "approximately")
FIX SIZE: medium  (measure the surrounding chrome via ResizeObserver, or move
  to a flex layout where the scroll container fills remaining flex space —
  cleaner long-term)
```

### F11 — Pre-fix errors are flushed but the original `row.original.X` bug shape is still latent in the slot API

```
ISSUE: The cell slot at KTable.vue:251 passes `:row="rows[virtualRow.index]?.original"`
  (already-unwrapped). The non-virtual slot at line 297 also passes
  `:row="row.original"`. Consistent. Good. But this is a per-primitive
  convention that is easy to get wrong in a consumer who reasonably expects
  TanStack's full Row object. Document this in the KTable docstring (it's
  not in the doc-comment at top).
LAYER: documentation
FILE:LINE: src/components/klikk/KTable.vue:10-29 (usage block)
SEVERITY: P3 (nit — but the fact that we hit this exact bug TWICE today says
  the doc-comment is undersized)
FIX SIZE: small (one-line note in the USAGE block: "Cell slots receive
  { value, row, cell } where `row` is the unwrapped data object — NOT
  TanStack's Row<T> wrapper.")
```

---

## What I did NOT find (positives worth noting)

- colgroup widths are sourced correctly from `meta.width || column.getSize()`
  and the consumer's six columns (110/220/90/140/340/140) are all integer
  `size:` props — they will land in colgroup `<col>` as expected.
- `table-layout: fixed` is set — column alignment between thead and tbody is
  structurally enforced.
- AbortController wired correctly in fetchTransactions — stale requests are
  cancelled.
- Cleanup in onUnmounted is correct (timeouts + abort).
- z-index stacking is sane: thead z=2, sticky filter bar z=10, KSelect portal
  uses var(--kdl-z-popover)=1000 → page-size dropdown WILL overlay thead and
  the sticky filter bar. Verified through portals.css token chain.

---

## TL;DR

After the day's fixes (slot signature, colgroup, Account-cell single-inline,
portal stacking), the table renders and the original `row.original.X` crash
is gone from the dev log since 13:14. **But it is not yet shippable.** Three
substantive findings stand out:

1. **F3 (P0) — Description cells wrap, breaking virtual-row alignment.** This
   is almost certainly part of what MC is still seeing as "a mess" — long
   transaction descriptions will overlap the next row in virtual mode. Needs
   `white-space: nowrap + ellipsis` on `.ktable-td` as the floor; tooltip
   on truncation as the follow-up.
2. **F2 (P1) — Amount/Balance columns are left-aligned despite the consumer
   asking for right-alignment.** The `meta.align` plumbing in KTable is
   missing; in a finance-admin table this is a credibility issue.
3. **F1 (P1) — `useVirtualizer` is called inside `watchEffect`**, throwing the
   `onScopeDispose()` warning on every entry and leaking the previous
   virtualizer instance. The fix exists in `2026-05-26-ktable-virtualizer-fix.md`
   per the directory listing — confirm whether that fix landed or whether
   the warning is from an older code path. Either way the warnings in the
   log are current (14:35 today).

The remaining items (F4–F11) are P2/P3 polish that should be queued but do
not block ship.

## Verdict

**NEEDS-P0-FIXES.**

F3 (description wrap → row overlap) is the headline blocker. F2 (numeric
alignment) is not technically P0 by the strict definition but in a finance
admin table I'd hold ship for it too — it's a one-line CSS fix and shipping
without it is shipping a financial table with left-aligned numbers.

Hand to senior-dev with these three findings (F1, F2, F3) as the scoped fix
package. F4–F11 are follow-ups, not blockers.
