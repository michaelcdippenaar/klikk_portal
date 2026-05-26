# Design Note — Holdings list view (backend + frontend) — 2026-05-26

## Goal
Surface the 52 imported `InvestecJsePortfolio` rows in the Holdings page. Today they're upload-only — invisible. Build a GET endpoint and a KTable below the existing upload section.

## Constraints
- Stay clear of the in-flight Aged Payables/Receivables fullstack work — that's in `apps/xero/*` and `src/pages/Processes.vue`. You touch `apps/investec/*` + `src/pages/InvestecHoldings.vue` only.
- Reuse `InvestecJsePortfolioSerializer` (already exists at `apps/investec/serializers.py:27`).
- Backend branch: `main` in `/Users/mcdippenaar/ClaudProjects/klikk_financials_v4`. Frontend branch: `feat/headless-migration` in `/Users/mcdippenaar/ClaudProjects/klikk_financials_portal`.
- KTable fix (separate senior-dev) may or may not be merged when you start. If your Vitest fails because the table is still broken, surface — don't fix KTable yourself.

## Approach

### Backend
1. Read `apps/investec/models.py` for `InvestecJsePortfolio` — confirm fields and whether it's tenant-scoped. If tenant-scoped, filter by request tenant.
2. Add a `PortfolioListView(generics.ListAPIView)` or extend an existing ViewSet — pattern-match how transactions are listed nearby in `views.py`. Use `InvestecJsePortfolioSerializer`. DRF default pagination (or whatever pagination the rest of the investec views use — match the project convention).
3. Route: `GET /api/investec/portfolio/` — add to `apps/investec/urls.py`. The existing upload route is `portfolio/upload/`, so this is the natural list at the resource root.
4. `permission_classes = [IsAuthenticated]` minimum. Match how `portfolio_upload_view` is currently authed.

### Frontend
1. In `src/pages/InvestecHoldings.vue`, below the existing upload card, add a section card containing a `KTable`.
2. Fetch on mount: hit the new endpoint via the existing axios/api client (look at how `InvestecShareCodes.vue` fetches its list — mirror that pattern).
3. Columns: match the InvestecJsePortfolio model fields — at minimum: share_code, share_name, quantity, price, total_value, portfolio_percent, as_at_date. Senior-dev picks final column set based on what's most useful at a glance.
4. `FreshnessChip` caption above the table showing the latest `as_at_date` from the rows (or a server-provided `last_updated`).
5. `EmptyState` for zero rows.
6. **No inline styles.** Per project policy — scoped classes only.

## Acceptance criteria
- [ ] `GET /api/investec/portfolio/` returns the 52 rows (or paginated page 1), authed
- [ ] InvestecHoldings page now shows a KTable below upload, populated
- [ ] FreshnessChip shows the latest `as_at_date`
- [ ] EmptyState renders if the tenant has zero portfolio rows
- [ ] No inline `style="..."` strings introduced
- [ ] Vitest spec: mount `InvestecHoldings.vue` with a mocked API response (3 sample rows) → assert all 3 share codes appear in the rendered DOM. Mock via `vi.mock` of the api client or `msw`-style — match existing test patterns under `src/pages/__tests__/` if any, otherwise `src/components/klikk/__tests__/` patterns.
- [ ] All existing tests still pass; total test count goes up by exactly 1 (or more if senior-dev adds API-client unit specs)

## Out of scope
- Edit / delete row actions
- Filtering UI beyond what KTable provides by default
- Chart / analytics view of holdings — list only
- Any backend mutation endpoint (POST/PUT/DELETE on portfolio)

## Security/compliance gates
- [ ] New endpoint has `permission_classes = [IsAuthenticated]` (or stricter)
- [ ] Tenant scoping enforced if model is tenant-bound — verify by reading the model first
- [ ] Serializer does not leak `internal_notes`, `cost_basis_source`, or any field tagged sensitive in the model

## Risks
- If the model is tenant-bound but the queryset isn't filtered, you ship IDOR (POPIA §19 violation). READ THE MODEL.
- The "52 imported rows" may all be on one test tenant — don't hard-code that.
- If the existing upload-success path doesn't trigger a refresh of the list, that's a UX miss — add a `refetch` after successful upload, but don't over-engineer.

## File scope
**Backend repo** (`klikk_financials_v4`, branch `main`):
- `apps/investec/views.py` (add view)
- `apps/investec/urls.py` (add route)
- `apps/investec/serializers.py` (read-only check; only modify if a field needs masking)
- `apps/investec/tests.py` (add backend test for the new endpoint — auth check + tenant scoping if applicable)

**Frontend repo** (`klikk_financials_portal`, branch `feat/headless-migration`):
- `src/pages/InvestecHoldings.vue` (modify)
- `src/pages/__tests__/InvestecHoldings.spec.ts` or `src/components/klikk/__tests__/InvestecHoldings.list.spec.ts` (new, senior-dev picks location)

## Commit message guidance
Two commits — one per repo:
- Backend: `feat(investec): add GET /api/investec/portfolio/ list endpoint`
- Frontend: `feat(holdings): show portfolio holdings table below upload`
