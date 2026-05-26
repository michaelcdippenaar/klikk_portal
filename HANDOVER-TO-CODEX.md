# Handover to Codex — Klikk Financials Portal

**Date:** 2026-05-26
**From:** Claude (orchestrator + fleet of sub-agents)
**To:** Codex
**Reason for handover:** MC lost confidence in Claude after a string of "ships passing audit" that broke in the browser. Codex's external review caught several bugs that Claude's audit chain (CTO + smoke specs + multiple senior-dev passes) missed. This document is honest about what's working, what's broken, and where Claude's process specifically failed.

---

## 1. Where the code lives

| Repo | Path | Branch | Pushed |
|---|---|---|---|
| Vue 3 portal (frontend) | `/Users/mcdippenaar/ClaudProjects/klikk_financials_portal` | `feat/headless-migration` | yes — github.com/michaelcdippenaar/klikk_portal |
| Django backend | `/Users/mcdippenaar/ClaudProjects/klikk_financials_v4` | `main` | locally only — pushed if `git status` says so |

**Frontend stack** (post Quasar removal):
- Vue 3 + Vite + plain `@vitejs/plugin-vue` (no Quasar CLI)
- Reka UI (behaviour primitives — Dialog/Menu/Tooltip/Popover/Select/Toast)
- TanStack Table v8 + `@tanstack/vue-virtual` (KTable engine)
- `@vueuse/core` (composables)
- Tailwind CSS + KDL token system (`src/css/klikk.css`, `portals.css`)
- Geist font (`@fontsource/geist` 400/500/600/700), Lucide inline SVG icons
- Pinia + Vue Router

**Dev servers:**
- Portal: `npm run dev` → port 9000
- Django: `python manage.py runserver 0.0.0.0:8001` with `.env` loaded (`set -a; source .env; set +a`)
- DB: local Postgres 15, role `klikk_user`, password `9eab84e6550a7ffad074156848d1129a8e0889cb16e2325d` (in `.env`)
- Login: `mc@tremly.com` / `Number55dip`

---

## 2. Known bugs Codex caught (not yet fixed)

### P1 — Token refresh hang on failure
**File:** `src/api/client.js` line 49 (queue success cb) + line 71 (clear subscribers without rejecting)
**Symptom:** When refresh-token endpoint returns 401, queued concurrent requests get no rejection. UI requests hang forever.
**Fix shape:** Add `rejectSubscribers(error)` path; call it before clearing the queue on refresh failure. Pattern:
```js
let subscribers = [];
function onTokenRefreshed(newToken) { subscribers.forEach(cb => cb(null, newToken)); subscribers = []; }
function onRefreshFailed(error) { subscribers.forEach(cb => cb(error, null)); subscribers = []; }
// queued requests do: subscribers.push((err, token) => err ? reject(err) : resolve(retry(token)))
```

### P2 — Lint broken
- `package.json` lint script includes `.ts` files but ESLint has no TS parser → 35 parser errors
- `.eslintrc.js` line 7: `ecmaVersion: 2020` chokes on numeric separators (`30_000`)
- `src/components/klikk/KLockup.vue` line 16: nested HTML comments inside a top-level comment (same bug class as the KOperationCard SLOT CONTRACT bug we hit earlier)

**Fix shape:**
- Install `@typescript-eslint/parser` + `@typescript-eslint/eslint-plugin`, configure `overrides: [{ files: ['*.ts'], parser: '@typescript-eslint/parser' }]`
- Bump `ecmaVersion` to `2022` (numeric separators are ES2021)
- Either strip the nested `<!-- -->` inside KLockup's leading comment OR convert leading comment to a JSDoc-style `/* */` block

### P3 — Document click listener leak
**File:** `src/components/klikk/KTable.vue` line ~689
**Symptom:** `document.addEventListener('click', handleOutsideClick)` added on mount, never removed on unmount. Memory leak per route change.
**Fix:** add `onUnmounted(() => document.removeEventListener('click', handleOutsideClick))`.

### New runtime error — `event.getModifierState is not a function`
**File:** `src/pages/Login.vue` line 122 in `handlePasswordKey`
**Symptom:** Caps-lock indicator throws on every keystroke in the password field.
**Cause:** KInput's `@keydown`/`@keyup` doesn't pass the native KeyboardEvent through cleanly — it's bound to the model-value update event. The handler receives a value string, not an Event object.
**Fix shape:** Either (a) listen to keydown on the underlying DOM input via `ref` + `addEventListener`, or (b) have KInput emit a typed `keydown` event carrying the native event.

---

## 3. What's working (don't break)

- **Quasar fully removed.** 0 `q-*` tags, 0 `quasar` imports, 0 `q-pa-*` utility classes. Anti-regression Vitest guard at `src/pages/__tests__/inline-style-policy.spec.ts`.
- **KDL primitives** under `src/components/klikk/`: KInput, KSelect, KMultiSelect, KCheckbox, KToggle, KRadioGroup, KFile, KForm, KAlert, KSpinner, KBadge, KChip, KTabs, KDialog, KMenu, KMenuItem, KMenuSeparator, KTooltip, KPopover, KToast, KToastRegion, KAccordion, KLockup, KOperationCard, KCommandPalette, KTable, KTablePagination, FreshnessChip, StatusPill, PersistentResultStrip, MetricTile, PageHeader, SectionCard, FilterBar, EmptyState, ResultPanel.
- **InvestecAccount page** (`/app/pipeline/investec/account`): 20,503 bank transactions, virtual scroll, sticky filter bar with chips, URL-sync filter state, merged Account column, right-aligned numerics, `Synced … ago` chip + Sync button in PageHeader, Export in SectionCard actions, accessibility (aria-controls, aria-live, aria-busy, keyboard sort).
- **Holdings page** (after the Codex fix landed): 911 portfolio rows, 25 per page, client paginated.
- **Bank data**: 20,500+ transactions Dec 2019 → May 2026 across 11 accounts. Pull via `python manage.py sync_investec_bank_transactions --from-date 2020-01-01`. Investec credentials in `.env`.
- **Stocks**: 50 JSE symbols + 24,458 price points. yfinance sync via `python manage.py sync_investec_symbols`.
- **Aged Payables / Receivables**: model + service + management command + DRF endpoint + KOperationCard buttons on Processes page. **Blocked**: Xero OAuth tokens are stale across all 4 tenants — user must re-auth via the portal before sync populates anything.
- **Tests**: `npm test` reports **291/291** passing across 16 files.
- **Build**: `npm run build` reports clean (some `@vueuse/core` PURE annotation warnings — not ours).

---

## 4. Where Claude's process failed (honest)

1. **Smoke specs tested TanStack directly, not the component.** 88 of the 291 tests are page smoke specs but they call `createTable()` from TanStack and assert column-def shape. They DO NOT mount the component, DO NOT verify that `data=` prop produces rendered rows. That's why the client-pagination bug (`pageIndex: undefined` → 0 rows) shipped — TanStack tests passed, real page rendered nothing.
2. **CTO audits read source, didn't run code.** Multiple "READY" verdicts were issued on source-comparison evidence while the live page errored in console. Doctrine update on 2026-05-26 added "MUST grep dev log before verdict" — that helped catch some, but only the *first* round of issues.
3. **No `npm run lint` ever run.** Discoverable in 5 seconds. 35 parser errors are sitting in the repo right now.
4. **Audit-and-fix loops added theatre.** CTO writes design notes → senior-dev executes → CTO re-audits → senior-dev re-fixes. Each layer trusted the previous. The Codex external review caught what every internal layer missed because it didn't have prior commitment to the audit chain.

If you're inheriting this, **trust nothing in the test layer** for KTable/KInput/page-level wiring. Mount the page yourself with mocked data and verify rows render.

---

## 5. Open follow-ups (catalogued, prioritised)

| Priority | Item | File / area |
|---|---|---|
| **P1** | Token refresh hang on failure (Codex) | `src/api/client.js` |
| **P1** | Lint suite broken (Codex) | `package.json`, `.eslintrc.js`, `KLockup.vue` |
| **P1** | Login `getModifierState` crash | `src/pages/Login.vue:122` + `KInput.vue` |
| **P2** | KTable document-click listener leak (Codex) | `src/components/klikk/KTable.vue` |
| **P2** | Switch smoke specs from TanStack-direct to mount-based | install `@vue/test-utils` + `happy-dom` or `jsdom`, rewrite the 13 `.smoke.spec.ts` files |
| **P2** | Xero OAuth re-auth required for Aged Payables / Receivables to populate | user-side action, no code |
| **P3** | KTable slot rename `row` → `rowData` (CTO cut, Codex hasn't weighed in) | breaking change; tradeoff is documentation vs ambiguity |
| **P3** | `tableRegionId` uses `Math.random()` — swap to `useId()` once Vue 3.5 lands or use `crypto.randomUUID()` | `InvestecAccount.vue` + `KTable.vue` |
| **P3** | Hub.vue + Investec.vue are unrouted dead code, KDL-passed | delete or wire into router |
| **P3** | `--kdl-section-card-body-padding` token to decouple InvestecAccount sticky-filter offset from SectionCard internals | KDL skill |

---

## 6. Operational quirks

### Postgres SCRAM drift
The local Postgres `klikk_user` role's stored password sometimes desynchronises from Django's connection pool. Symptoms: backend returns 500 on `/api/auth/login/`, Django log shows `password authentication failed for user "klikk_user"`. Permanent fix landed today: `pg_hba.conf` changed from `md5` → `scram-sha-256` (matches PG15's `password_encryption` default) + reload via `pg_reload_conf()`. **If it recurs, the actual fix is:**
```bash
/opt/homebrew/opt/postgresql@15/bin/psql -h /tmp -U mcdippenaar -d postgres \
  -c "ALTER ROLE klikk_user WITH LOGIN SUPERUSER PASSWORD '<password from .env>';"
pkill -f "manage.py runserver" && cd /Users/mcdippenaar/ClaudProjects/klikk_financials_v4 && \
  set -a && source .env && set +a && \
  DJANGO_SETTINGS_MODULE=klikk_business_intelligence.settings.development \
  .venv/bin/python manage.py runserver 0.0.0.0:8001 &
```
Worth scripting as `klikk_financials_v4/scripts/pg-reset.sh`.

### Vite port 9000
Sometimes binds IPv6-only (`[::1]`). Force IPv4 with `npm run dev -- --host 127.0.0.1 --port 9000`.

### HMR cache after KTable changes
KTable.vue changes that affect `setup()` (e.g. virtualizer scope rewrite, helper functions added) sometimes don't hot-reload cleanly. Symptom: console error `_ctx.someFunction is not a function` even though the file has it. **Restart Vite, not just hard-reload the browser.**

---

## 7. The KDL skill

`~/.claude/skills/klikk-design-language/SKILL.md` carries the design system — finance-admin variant (Geist 14px / 12px floor / Lucide stroke 1.75 / tokens / primitives table / operator-card doctrine / table doctrine / status-tone lexicon / no inline style policy / Quasar-free invariants). If Codex uses skill loading, this is the canonical reference.

The skill is updated to include the lessons from the 2026-05-26 KTable bug class but the lessons aren't yet enforced by tests.

---

## 8. CTO doctrine update (still relevant)

`~/.claude/agents/cto.md` — proactive cadence section now mandates dev-log grep before any post-dispatch verdict. **Codex inherits this if it spawns the CTO agent**, but obviously the doctrine alone didn't catch what Codex did. The real lesson: trust runtime evidence over source-comparison.

---

## 9. Files of note (absolute paths)

- `src/components/klikk/KTable.vue` — the primitive that's been at the centre of every recent bug
- `src/pages/InvestecAccount.vue` — most-touched operator page, reasonable reference for KTable consumption
- `src/pages/InvestecHoldings.vue` — simplest KTable-client-paginated consumer; reasonable smoke target
- `src/api/client.js` — axios interceptor with the token-refresh bug
- `src/css/klikk.css`, `src/css/portals.css` — token definitions + portal z-index scale
- `vite.config.js` — plain Vite, no proxy (API calls go cross-origin to :8001)
- `.cto/design-notes/*.md` — all the design notes from this session's audits

---

## 10. Suggested first actions for Codex

1. **Fix the lint suite** — without it there's no signal for the basics. 30 minutes.
2. **Fix P1 trio**: token refresh hang, login caps-lock crash, KTable listener leak. ~1 hour total.
3. **Run the app and click through every page** — that catches more than any audit doctrine. The pages: `/`, `/login`, `/_klikk-preview`, `/app/pipeline/processes`, `/app/pipeline/data`, `/app/pipeline/compare`, `/app/pipeline/investec/account|holdings|transactions|share-codes`, `/app/pipeline/financial-investments`, `/app/pipeline/dividend-forecast`, `/app/pipeline/planning-analytics`, `/setup/credentials|xero-connect|ai-agent|agent-monitor`.
4. **Decide on smoke-spec policy**: rewrite to mount-based (needs `@vue/test-utils` + `happy-dom`) OR replace with Playwright E2E. The TanStack-direct pattern has now demonstrably missed multiple bugs.
5. **Schedule a CDO review** — design language is mature but page-level information design is still mixed.

---

End of handover. Apologies for the state we're handing over in. The system worked; the audit chain didn't.
