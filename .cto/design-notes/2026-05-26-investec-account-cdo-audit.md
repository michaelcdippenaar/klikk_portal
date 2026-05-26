# Investec Account — CDO Audit (2026-05-26)

ROUTE: /app/pipeline/investec/account
SOURCE: /Users/mcdippenaar/ClaudProjects/klikk_financials_portal/src/pages/InvestecAccount.vue
BRANCH: feat/headless-migration
LENS: senior product designer, operator-screen quality (Mercury / Stripe Dashboard / Linear bar)

═══════════════════════════════════════════════════════
ROOT CAUSE — the dropdown-under-thead bug
═══════════════════════════════════════════════════════

The KSelect dropdown IS portalled to `document.body` (`<SelectPortal>` at KSelect.vue:77).
The selector that sets `z-index: 9000` on `.kselect-content` (KSelect.vue:381) lives inside
`<style scoped>` (KSelect.vue:253). Scoped styles inject a `data-v-<hash>` attribute and
generate selectors like `.kselect-content[data-v-<hash>]`. Reka-UI's SelectPortal teleports
the content node out of the component subtree to `document.body`, so the `data-v-<hash>`
attribute is NOT carried to the portalled node (Reka does not forward scope tokens through
portal boundaries).

Result: the rule does not match. `.kselect-content` falls back to `z-index: auto`. The
sticky `.ktable-thead` (KTable.vue:730, z-index: 2) inside the SectionCard's scroll context
ends up painting at or above the portalled options panel because the popper has no
positive z-index of its own and the stacking-context resolution favours the sticky element
when its containing block is positioned higher in the DOM-paint order.

Fix shape (route to CTO chain):
- Move the `.kselect-content`, `.kselect-item`, `.kselect-viewport`, `.kselect-scroll-btn`
  rules into a NON-scoped global stylesheet (e.g. `src/styles/kselect.css` or a `:global()`
  block, or split the file: `<style>` for portalled content, `<style scoped>` for trigger).
- Add `z-index: var(--kdl-z-popover)` (define if missing: 1000+) on the global rule.
- Audit every other Reka portal-host in the kit (KDropdown, KTooltip, KPopover, KMenu,
  KCommandPalette, KDialog) for the same scoped-CSS-vs-portal trap. Same class of bug,
  same fix.

CUTS:
- InvestecAccount.vue:3 — subtitle "Search bank transactions across all Investec accounts"
  is filler. The H1 + filter bar already says this. Cut or replace with operator-useful
  meta: tenant + last-sync-time + row count ("Investec · 11 accounts · 20,432 txns ·
  synced 12 min ago"). Mercury / Stripe-style breadcrumb-with-meta.
- InvestecAccount.vue:78 (sync tab title) — "Sync accounts and transactions from Investec
  API" duplicates the tab label "Update from API". Drop the title or rephrase the tab as
  "API sync". One or the other.
- InvestecAccount.vue:67 — "Download Excel" button next to "Search". Cut from the filter
  row. Belongs on the table's right edge as a quiet secondary action (icon + label).
  Putting an export verb in the search row tells operators they must click Search before
  exporting, which is false.
- InvestecAccount.vue:61 — "Search" button entirely. Filter bar already debounces on input
  and re-queries on KSelect/date change. The button is decorative — debouncedSearch /
  onFilterChange fire automatically. Either commit to autofire (Mercury / Linear pattern)
  and cut the button, or make filters require Enter-to-apply. Half-state is the worst.
- InvestecAccount.vue:200–209 columns — "Account name" at size: 160 is a near-duplicate of
  "Account" (account_number) at 130. Two columns to express one entity. Merge into a
  single "Account" column rendering "10010123456 · Primary Cheque" two-line or
  primary-with-muted-suffix. Saves ~290px of horizontal real estate that the description
  column desperately needs.

MISSING:
- Tenant context in the header. PageHeader.vue supports a `tenantContext` slot
  (PageHeader.vue:14) — InvestecAccount.vue:3 never uses it. A finance operator working
  multi-tenant Klikk needs the tenant name visible at all times next to "Investec
  Account". Critical for not-posting-to-the-wrong-books safety.
- Empty state. If filters return zero rows, KTable renders an empty body. No "No
  transactions match — clear filters" affordance, no quick-clear button. Empty state
  must teach (ADR §UX-empty-states).
- Sticky filter bar. With 25 visible rows + virtual scroll, an operator scrolled 800 rows
  deep cannot see the active filters. Filters should sticky-pin under the page header.
  This is the single biggest operator-quality miss.
- Active-filter chips / clear-all. With 6 filters, no way to see at-a-glance what's
  currently constraining the result set. Mercury / Linear pattern: chip row under the
  filter bar showing "Description: salary  ×    From: 2024-01-01  ×    Clear all".
- Total-row / footer summary. 20,432 transactions, parenthesised negatives — operators
  reconciling will want a sum of the filtered set (count + sum(amount) + opening / closing
  balance). Linear-tier finance UI shows this in a thin footer band above the pagination.
- Sort affordance on Amount, Account, Description columns. Only `transaction_date` has
  `enableSorting: true` (line 202). Operators reconciling will want amount-desc to find
  the big ones. Backend already orders by transaction_date (a65270b); extend.
- Keyboard discoverability. No visible shortcut hints. "/" to focus description, "f" to
  jump to filter bar, "j/k" row nav, "x" to clear filters. KCommandPalette is in the kit;
  this page doesn't register any actions to it.
- URL sync on tabs. `:url-sync="false"` (InvestecAccount.vue:11) — operators lose deep
  links and refresh state. KTabs supports it; turn it on.
- URL sync on filters. Description/account/date_from should round-trip through the URL so
  operators can share a filtered view with the finance team in Slack.
- Last-updated timestamp on the transactions tab. Sync status is hidden behind the
  "Update from API" tab. The "transactions" tab needs an unobtrusive "Synced 12 min ago"
  pill — it changes how an operator interprets the data they're staring at.

RESTRUCTURE:
- InvestecAccount.vue:50–59 → unwrap the KSelect from its `<div class="flex-1 min-w-48">`.
  Other KInputs apply `flex-1 min-w-48` directly. The wrapper adds nothing and breaks the
  symmetry — and means KSelect can't grow its own label/error region naturally. Apply
  classes to KSelect via :class.
- InvestecAccount.vue:60–73 button group → move "Download Excel" to a table-row toolbar
  (right-aligned, above thead, alongside a future "Columns" visibility menu). Drop
  "Search" entirely. Single-button row is denser and clearer.
- InvestecAccount.vue:97–132 pagination footer → current layout is `[Previous] [range +
  rows-per-page] [Next]`. Linear/Stripe convention is `[range + rows]   [< Previous   1 of
  204   Next >]`. Page number is the missing primitive — "1–100 of 20,432" tells you
  position but not how many pages remain or which page you're on. Either show "Page 2 of
  205" or use an offset-as-page input.
- InvestecAccount.vue:111–122 `<select class="input input-sm">` → this is a raw native
  `<select>`, not KSelect. Inconsistent with the filter-bar KSelect three feet above it.
  Either both native (fine for a power-user-only page) or both KSelect. Currently it
  reads as a slip.
- InvestecAccount.vue:5–13 tabs → "Transactions" and "Update from API" are an awkward
  binary. The sync action belongs on the transactions view itself as a header-right
  action ("Sync from API · last 12 min ago"), not as a sibling tab that hides the data.
  Tabs should split sibling VIEWS of the same data (e.g. "All / Unreconciled / Flagged"),
  not data + action.
- InvestecAccount.vue:88–94 amount cell → `<span class="kdl-numeric">` wraps but no
  per-cell muted styling for zero/null. Negative parens render correctly per ADR §1.
  However: running_balance is going to dominate visually because every row has a large
  number. Consider muting (`color: var(--kdl-text-muted)`) the running balance column or
  right-aligning with a slightly lighter weight so amount remains the focal column.

ACCESSIBILITY:
- The native `<select>` on line 111 has no label-for; the wrapping `<label>` provides
  accessible name via implicit association, but the visible text "Rows" is small (default
  text-sm) and far from the control. Acceptable but not great.
- The `<button class="btn btn-primary">` "Search" (line 61) shows "Searching…" with a
  KSpinner but no `aria-busy="true"` on the surrounding form / table. Screen readers
  won't announce the table is reloading.
- Focus order on the filter bar is correct (DOM order matches reading order). Good.
- Date inputs (`type="date"`) — native styling differs across browsers; on Safari the
  placeholder isn't shown. Not a blocker, document it.

VUE / DOCTRINE COMPLIANCE:
- InvestecAccount.vue:43 (FilterBar) — chevron transform uses inline `:style` with
  transform + transition. Transform is dynamic (rotates on toggle), so inline is allowed
  by doctrine for the transform value. The transition string should move to the
  stylesheet.
- KTable.vue:212, 223 — virtual-row positioning uses inline `style` for `height` and
  `transform`. Genuinely dynamic — passes doctrine.
- No hex literals or magic px in InvestecAccount.vue itself. Filter-bar / table
  components consume tokens. Good.
- `<script setup>`, typed-ish props, computed for derived state, watch for tab side
  effect (InvestecAccount.vue:377). Good Vue idiom.

VERDICT: needs work

Floor is mostly there (tokens, semantics, Vue idiom). Headline z-index bug + missing
sticky filters + missing tenant context + the search-button-that-shouldn't-exist drag
this below "ready". None of these are redesigns — they're a focused half-day of cuts
and one cross-cutting CSS-scope fix.

TOP-3 FIXES BY LEVERAGE

1. Fix the scoped-CSS-vs-portal bug ONCE across the kit.
   Move portal-target styles (KSelect content, KDropdown content, KTooltip content,
   KPopover content, KMenu content, KCommandPalette content, KDialog content) out of
   `<style scoped>` into a global `src/styles/portals.css` or unscoped block. Define
   `--kdl-z-popover` (and z-tooltip, z-modal) tokens so we never argue about stacking
   again. This unblocks the Investec page and prevents the same bug recurring on every
   future page that puts a KSelect above a KTable.

2. Promote tenant context + sync status into the page header; cut the Sync tab.
   InvestecAccount.vue:3 gets a `tenantContext` slot wired up; "Update from API" becomes
   a header-right action with inline last-sync-time. Operators stop tab-toggling, stop
   guessing which tenant they're in, and stop wondering whether the data they're staring
   at is fresh. This is the single highest operator-value change on the page.

3. Sticky filter bar + active-filter chip row + autofire (drop Search button).
   The filter strip pins below PageHeader; chips render directly underneath showing
   active constraints with × to clear each; "Clear all" sits at the right. Drop the
   Search button entirely (debounce + onChange already cover it). This page becomes a
   reconciliation tool an operator can actually live inside for hours instead of a form
   they keep submitting.

---
Read-only audit. No code touched. Routes to CTO + senior-devs.
