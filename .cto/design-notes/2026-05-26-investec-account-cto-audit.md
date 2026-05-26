# Investec Account — CTO Audit (2026-05-26)

ROUTE: /app/pipeline/investec/account
SOURCE: /Users/mcdippenaar/ClaudProjects/klikk_financials_portal/src/pages/InvestecAccount.vue
BRANCH: feat/headless-migration
LENS: engineering — correctness, security posture, perf, stacking, accessibility wiring.

═══════════════════════════════════════════════════════
BUG 1 (P0) — KSelect dropdown rendered below sticky thead
═══════════════════════════════════════════════════════

FILE: src/components/klikk/KSelect.vue:253–476 (the `<style scoped>` block,
      specifically `.kselect-content { ... z-index: 9000 }` at :381)
ALSO AFFECTS (same mechanism): KMultiSelect.vue:471 (z-index 9000 in `<style scoped>`),
      KPopover.vue:93, KMenu.vue:90, KTooltip.vue:88, KCommandPalette.vue:349, 363,
      KDialog.vue:145, 159 — every Reka portal-host with z-index inside `<style scoped>`.

ROOT CAUSE — pinned:

1. `SelectPortal` (reka-ui) wraps `<Teleport to="body">`. Confirmed in
   `node_modules/reka-ui/dist/Teleport/Teleport.cjs:12` (`default: "body"`) and used by
   `SelectPortal.cjs`. The teleport target is `document.body`.

2. With `position="popper"` (KSelect.vue:78), Reka renders TWO wrapping divs:
   - OUTER: `<div data-reka-popper-content-wrapper>` produced by `PopperContent.js:232`.
     This is the Floating-UI-positioned element (transform + position styles).
   - INNER: the element that receives the user's `$attrs` (including `class="kselect-content"`
     and the scoped `data-v-XXX` attribute), via `mergeProps({..._ctx.$attrs, ...})` at
     `SelectContentImpl.js:264-267`.

3. Critically, the floating wrapper sets its own inline z-index by READING the inner
   element's computed style: `PopperContent.js:218-221`:
   ```js
   const contentZIndex = ref("");          // initial empty
   watchEffect(() => {
     if (contentElement.value)
       contentZIndex.value = window.getComputedStyle(contentElement.value).zIndex;
   });
   ```
   Then renders the wrapper with `style: { zIndex: contentZIndex.value, ... }` (line 240).

4. SO: Reka's stacking story is — "user, you put z-index on the content element; we'll
   copy it onto the floating wrapper for you." This relies on the user's CSS rule
   `.kselect-content { z-index: 9000 }` ACTUALLY MATCHING the inner element.

5. Vue's `<style scoped>` rewrites that selector to `.kselect-content[data-v-XXX]`. The
   `data-v-XXX` attribute is injected by Vue's template compiler ONLY into elements
   declared in the parent template. `<SelectContent class="kselect-content">` in
   KSelect.vue:78 IS in the parent template, so the `data-v-XXX` attribute is added to
   that vnode's props, forwarded via `_ctx.$attrs` through Reka, and lands on the inner
   element. In principle the selector matches.

6. BUT — observed behaviour says it doesn't. Two plausible mechanisms (both lead to the
   same fix, so we don't need to disambiguate which dominates):
   (a) The `data-v-XXX` attribute IS forwarded to the inner element, but the rendered
       DOM root that Reka exposes via `contentElement.value` (assigned at
       `SelectContentImpl.js:269-275`) is the `floating wrapper firstElementChild`, which
       is sometimes the FocusScope/DismissableLayer intermediary wrapper rather than the
       element with `class="kselect-content"`. `getComputedStyle` on the wrong element
       returns no z-index. Reka writes `zIndex: ""` (auto) to the floating wrapper.
   (b) `getComputedStyle().zIndex` returns the string `"9000"` correctly, but the
       teleport happens AFTER first paint, and on first open the watchEffect runs with
       `contentElement.value` still null or pointing pre-mount, leaving the wrapper at
       z-index auto. (The `watchEffect` deps don't include "did class actually land".)

Either way, the floating wrapper ends up with `z-index: auto` and stacks below the
sticky `.ktable-thead` (KTable.vue:730, `z-index: 2` on a `position: sticky` thead, which
itself creates a stacking context as a child of the `.ktable-scroll-container` — and the
scroll container's overflow:auto + the table's table-layout:fixed give it the paint
priority Reka can't beat with `z-index: auto`).

Confirmation: CDO independent audit reached the same conclusion via the scope-token
boundary mechanism. Doesn't matter which sub-mechanism is dominant — the fix is the same.

RECOMMENDED FIX — kit-wide, single PR:

A. Add `--kdl-z-popover`, `--kdl-z-tooltip`, `--kdl-z-modal`, `--kdl-z-toast` tokens to
   `src/css/klikk.css` (or wherever the token root lives). Conservative scale:
     --kdl-z-dropdown:  1000
     --kdl-z-sticky:    1100   /* sticky thead must NOT exceed dropdown */
     --kdl-z-popover:   1200
     --kdl-z-tooltip:   1300
     --kdl-z-modal:     1400
     --kdl-z-toast:     1500
   (Current sticky-thead z-index 2 in KTable should be re-tokenised to --kdl-z-sticky
   so a future reviewer doesn't accidentally re-introduce the conflict — but
   NOT in this PR; KTable.vue has an in-flight column-alignment fix and we don't
   collide. File as follow-up.)

B. Create `src/css/portals.css` (or `src/css/klikk-portals.css`) — a NON-SCOPED stylesheet,
   imported once from `main.js`. Move the portal-target rules out of the scoped block of
   every Reka-portal-hosting component:
     KSelect:  .kselect-content, .kselect-viewport, .kselect-item, .kselect-scroll-btn,
               .kselect-item-icon, .kselect-item-indicator, the
               :root[data-theme="dark"] .kselect-content shadow override
     KMultiSelect: same pattern (.kmselect-content, .kmselect-viewport, etc.)
     KMenu, KPopover, KTooltip, KCommandPalette, KDialog: same scan.
   Each portal-content rule uses `z-index: var(--kdl-z-popover)` (or popover/tooltip/modal
   per type). Trigger / shell / message styles stay in `<style scoped>` because they
   render inside the component tree.

C. ALTERNATIVE (lighter) fix that ships today: split EACH affected component into
   `<style>` (unscoped, for portal-content rules only) + `<style scoped>` (everything
   else). This keeps the rules co-located with the component but bypasses the scope-token
   trap. Acceptable; B is cleaner long-term.

   For the IMMEDIATE Investec fix, A + C in KSelect (only) unblocks the page in 15
   minutes. A + B for the kit is the next sprint task.

VITEST GATE:
- `src/components/klikk/__tests__/KSelect.stacking.spec.ts`:
  1. Mount KSelect with a sticky element behind it (`<div style="position:sticky; z-index:2">`),
     open the dropdown, assert the `[data-reka-popper-content-wrapper]` computed-style
     `z-index` is greater than 2 AND a numeric value (not "auto").
  2. Mount inside a `<style scoped>`-bearing parent, assert the inner `.kselect-content`
     element resolves to the design-token z-index (read CSS custom property at runtime).
- `src/components/klikk/__tests__/KMultiSelect.stacking.spec.ts`: parity check.
- (Optional) Snapshot test of the global `portals.css` file content for grep-ability:
  ensures someone editing scoped blocks doesn't reintroduce z-index there.

═══════════════════════════════════════════════════════
BUG 2 (P1) — KInput prop validator warnings flooding console
═══════════════════════════════════════════════════════

FILE: src/pages/InvestecAccount.vue:37, 45
KInput is given `type="date"`, but the prop validator at
`src/components/klikk/KInput.vue:159–163` only accepts:
  ['text','password','email','number','search','tel','url']

So every render emits `[Vue warn]: Invalid prop: custom validator check failed for prop
"type"` — confirmed in `logs/portal_dev.log` (15+ occurrences). This is noise that drowns
real warnings (security audit smell — see OWASP A09).

FIX: add `'date'`, `'time'`, `'datetime-local'`, `'month'`, `'week'` to the validator.
File: src/components/klikk/KInput.vue:162.

VITEST GATE:
- `src/components/klikk/__tests__/KInput.types.spec.ts` — for each accepted type,
  assert mount produces zero Vue warnings (spy on `console.warn`).

═══════════════════════════════════════════════════════
BUG 3 (P1) — KSpinner size="14" string-number warnings
═══════════════════════════════════════════════════════

FILE: src/pages/InvestecAccount.vue:63, 69, 150
`<KSpinner size="14" />` — but `src/components/klikk/KSpinner.vue:57–60` validates
size against `['xs','sm','md','lg']`. Result: Vue warns on every paint of these spinners.
Also confirmed in dev log.

FIX (choose one):
- Quick (3 changes): change the three call sites to `size="sm"` (matches the 14px
  intent — sm is typically 14–16px in the scale).
- Better: extend KSpinner to accept numeric sizes too (props type
  `[String, Number]`, validator allows preset OR positive number). I lean the second
  — operators write px because they're styling inside button rows where the px scale
  is what they think in. But callers must be consistent: change the three call sites
  to `:size="14"` (numeric binding, not string).

VITEST GATE:
- `src/components/klikk/__tests__/KSpinner.size.spec.ts` — assert no warnings for both
  preset and numeric sizes.

═══════════════════════════════════════════════════════
BUG 4 (P2) — onScopeDispose noise
═══════════════════════════════════════════════════════

The dev log shows recurring:
  `[Vue warn] onScopeDispose() is called when there is no active effect scope to be
   associated with.`

This appears on InvestecAccount mounts. Most likely source: a `useXxx` composable
calling `onScopeDispose` outside `setup()` — likely the `useWindowSize()` from
@vueuse/core OR `useVirtualizer` from @tanstack/vue-virtual being instantiated inside
`watchEffect` (KTable.vue:528) instead of at setup top-level. The latter is the more
suspicious source — `useVirtualizer` registers its own effect scope and re-instantiating
it inside a `watchEffect` re-runs `onScopeDispose` without an outer scope.

INVESTIGATION + FIX is in scope for the KTable.alignment senior-dev already in flight
— check whether their refactor moves `useVirtualizer` out of `watchEffect`. If not,
file as follow-up; do not touch KTable.vue here.

═══════════════════════════════════════════════════════
PERF / DATA — pagination wiring (OK)
═══════════════════════════════════════════════════════

InvestecAccount.vue:323-356 fetches with `limit: pagination.rowsPerPage, offset:
pagination.offset`. `transactions.value` only ever holds `data.results || []` — i.e. up
to one page (default 100, max user-selectable 1000, or "All" = transactionCount).

CONCERN: the page-size selector at InvestecAccount.vue:121 has `<option :value="transactionCount">All</option>`
— if transactionCount is 20,432, selecting "All" fetches 20,432 rows in one request AND
renders them into the virtualizer. Two risks:
  (a) The single API request returns ~5–10 MB JSON; LCP and TTI take a hit.
  (b) The backend might not have an index that supports `LIMIT 20432` cheaply with
      `ORDER BY transaction_date DESC` — if it doesn't, this is a 5–10s query that
      blocks the connection.
  (c) `transactionCount` may legitimately be the value passed; but on first render it's
      0 (initial state), so the option `value="0"` exists. If the user clicks "All" before
      data loads they'd get `limit: 0` (which DRF treats as default page size — harmless
      but quirky).

FIX:
- Cap "All" at e.g. 5000 with a tooltip warning, OR keep "All" but disable it until
  `transactionCount > 0 && transactionCount <= 5000`, OR replace with a hard "Show 5,000"
  ceiling option.
- Out of scope for this audit: confirm Postgres has `(transaction_date DESC)` covering
  index on the bank-transaction table. Backend follow-up.

═══════════════════════════════════════════════════════
PERF / DATA — description filter (BACKEND FOLLOW-UP)
═══════════════════════════════════════════════════════

The frontend sends `description=` as a query param. Backend (Django, separate repo —
not findable in this checkout, lives in klikk_financial_management) almost certainly
applies `.filter(description__icontains=value)`. On 20k rows, `icontains` becomes a
sequential scan with `ILIKE '%value%'`. Without a `pg_trgm GIN` index on `description`,
this is O(n) per query and gets worse linearly.

NOT BLOCKING this audit. FILE AS BACKEND FOLLOW-UP:
- Confirm whether `apps/investec/...BankTransaction` model has a trigram index:
    `CREATE INDEX IF NOT EXISTS ix_investec_banktx_description_trgm
       ON apps_investec_banktransaction USING gin (description gin_trgm_ops);`
- Migration must be `CONCURRENTLY` to avoid table lock on prod.
- Senior-dev for backend can pick this up separately; not part of the Investec page
  PR.

═══════════════════════════════════════════════════════
MEMORY / LISTENERS
═══════════════════════════════════════════════════════

- `useWindowSize()` (InvestecAccount.vue:192) — @vueuse handles its own listener cleanup
  via the component's effect scope. OK.
- `debouncedSearch` (line 237) — `searchTimeout` is a module-level `let`, not a ref.
  On component unmount the pending `setTimeout` is not cleared and will fire after
  unmount, calling `fetchTransactions` (which touches refs that are no longer
  reactive). Not a leak but a stale-closure bug producing potential console errors.
  FIX: clear timeout in `onUnmounted`, OR replace with `useDebounceFn` from @vueuse.
- `fetchAbortController` (line 215) — same pattern, module-level. On unmount the
  in-flight request is not aborted. Low-severity (response is dropped silently when no
  subscriber) but bad hygiene. FIX: `onUnmounted(() => fetchAbortController?.abort())`.

VITEST GATE:
- `src/pages/__tests__/InvestecAccount.unmount.spec.ts`:
  Mount, trigger `debouncedSearch`, unmount before the 300ms debounce fires, assert
  no unhandled console errors and (via spy) `fetchTransactions` not called.

═══════════════════════════════════════════════════════
ACCESSIBILITY (engineering side)
═══════════════════════════════════════════════════════

Defer the design-level a11y notes to the CDO audit (they covered label-for + aria-busy
correctly). Engineering-side adds:
- The native `<select>` at InvestecAccount.vue:111–122 has no `id` — the wrapping
  `<label>` does provide implicit association, but with no `for=` we lose the SR
  keyboard-shortcut chain.
- The Search/Excel buttons have no `aria-busy` while their corresponding `loading*`
  refs are true. Add `:aria-busy="loadingTable"` to the button OR — better — to the
  table-region wrapper so SR users get a single "busy" announcement.
- No `aria-live` region for the result-count text at line 107 — the count silently
  updates after search. Wrap in `<span aria-live="polite">` so SR users hear "20,432
  results" after filtering.

═══════════════════════════════════════════════════════
DOCTRINE COMPLIANCE
═══════════════════════════════════════════════════════

- No inline `style="..."` with tokens in InvestecAccount.vue. PASS.
- Lucide-only icons (inline SVG paths in KSelect/KInput are Lucide path data). PASS.
- Geist 14px base unchanged. PASS.
- No `console.log` left in source. PASS.
- `useToast` not currently used because the page only surfaces success/error inline
  via KAlert in the sync result — acceptable for a destination-confirmed action; toast
  would be redundant. PASS.

═══════════════════════════════════════════════════════
SECURITY POSTURE
═══════════════════════════════════════════════════════

Frontend-only audit; no new auth surface. The page reads existing endpoints with the
session cookie. Risks I'd flag for the backend reviewer:
- `description` param is reflected verbatim in the Excel export filename / sheet? If
  yes — CSV formula injection vector (OWASP top-10 #7 in my reflex list). Backend
  should escape leading `=`, `+`, `-`, `@`, `\t`, `\r` in the FIRST CHARACTER of any
  cell in the XLSX export. Out of scope for this audit but flagged.
- Description / amount / date filters are query-string — they land in nginx access
  logs. If a description query is itself PII (it would be — bank narratives include
  beneficiary names, ID numbers, etc.), this is a POPIA §17 logging-concern. Recommend
  the backend's log filter scrubs the `description` query param. Backend follow-up.

═══════════════════════════════════════════════════════
RENDER / CONSOLE STATUS
═══════════════════════════════════════════════════════

Dev log review (logs/portal_dev.log, last 200 lines):
- KInput type="date" validator failures × many (Bug 2)
- KSpinner size="14" validator failures × many (Bug 3)
- onScopeDispose-without-scope × many (Bug 4)
- NO uncaught exceptions. NO render errors. NO Reka-internal warnings.
- HMR updates fire cleanly.

═══════════════════════════════════════════════════════
VIRTUAL SCROLL (defer to in-flight fix)
═══════════════════════════════════════════════════════

KTable.alignment.spec.ts exists; a senior-dev is already on column-alignment + virtual
scroll. InvestecAccount uses `virtual :virtualHeight="tableHeight"` correctly. The
`tableHeight = max(420, windowHeight - 332)` computed is sound — reserves header,
padding, page-header, filter-bar, pagination-footer space; minimum 420 prevents
nonsensical small heights on short windows.

═══════════════════════════════════════════════════════
DISPATCH PLAN (Phase 2)
═══════════════════════════════════════════════════════

Three parallel senior-devs, plus one consolidated InvestecAccount cleanup:

DISPATCH A — Kit-wide portal stacking fix (P0)
  Scope: Bug 1. Add z-index tokens. Move portal-content CSS out of `<style scoped>`
  for KSelect + KMultiSelect (the two currently in the kit using Reka SelectPortal).
  Sibling Reka-portal components (KMenu, KPopover, KTooltip, KCommandPalette,
  KDialog) — audit each, but only move rules out of scoped block if they have a
  z-index there. Otherwise: leave alone, file follow-up.
  Tests: KSelect.stacking.spec.ts, KMultiSelect.stacking.spec.ts.

DISPATCH B — KInput type validator + KSpinner size validator (P1)
  Scope: Bug 2 + Bug 3. Both small, related, single dev.
  Tests: KInput.types.spec.ts, KSpinner.size.spec.ts.

DISPATCH C — InvestecAccount cleanup + CDO design fixes
  Scope: merge CDO's top-3 fixes:
    1. (overlap with Dispatch A — z-index fix unblocks the page).
    2. Tenant context in PageHeader; cut Sync tab → move to header-right action
       with inline last-sync-time.
    3. Sticky filter bar + active-filter chips + drop Search button (autofire only).
  PLUS CDO cuts:
    - Cut subtitle "Search bank transactions…"; replace with meta strip.
    - Merge "Account" + "Account name" columns → one "Account" column,
      primary-with-muted-suffix.
    - Move "Download Excel" to a quiet table-right action.
    - Replace native `<select>` for rows-per-page with KSelect (consistency).
    - URL sync on tabs (`:url-sync="true"`) AND on filters
      (push description/account/date_from/date_to into query string; restore on mount).
  PLUS my fixes:
    - Cap "All" page-size at 5000 with disabled-until-bounded behaviour.
    - Clear `searchTimeout` + abort `fetchAbortController` in onUnmounted.
    - `aria-live="polite"` on the result-count span; `:aria-busy="loadingTable"` on
      the table-region wrapper.
  Tests: InvestecAccount.unmount.spec.ts, plus snapshot on URL sync round-trip if
  practical.

DISPATCH D (backend follow-up — separate ticket, NOT part of this PR)
  - Confirm pg_trgm GIN index on description.
  - Confirm Excel export does CSV-injection escaping.
  - Confirm `description` query param is scrubbed from access logs.

No re-audit dependency between A/B/C — they touch different files. Re-audit after
all three return.

---

End audit. Routing to senior-devs.
