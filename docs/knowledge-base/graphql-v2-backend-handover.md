# Klikk Web API v2 — GraphQL backend handover

Date: 21 August 2026  
Status: implementation brief for a backend agent  
Target backend: `michaelcdippenaar/klikk_financials_v4`, using current production `origin/main` as source truth

## Outcome

Add a web-application GraphQL boundary at:

```text
POST /api/v2/graphql/
```

The endpoint composes authenticated, entity-scoped data for the Vue portal. It is additive: existing REST endpoints remain in place for login, token refresh, ingestion jobs, exports, webhooks, Excel and MCP integrations.

The first implementation must support this path:

```text
REST login -> GraphQL viewer context -> user selects entity -> close overview -> receipt workbench
```

Do not expose a global receipt queue. Every finance query must resolve inside an entity the authenticated user is allowed to access.

## Repository warning

The ordinary backend working copy has previously been behind production and has omitted deployed apps. Before changing code:

1. Fetch `origin`.
2. Inspect current production `origin/main`.
3. Create a clean feature worktree from that commit.
4. Do not base this work on a stale local feature branch.

The production backend currently uses Django 5.1+, Django REST Framework, SimpleJWT and PostgreSQL. The project-wide DRF default is `IsAuthenticated`; do not weaken it.

## Technology choice

Use Strawberry GraphQL with its Django integration:

```text
strawberry-graphql-django
```

GraphQL is a good fit here because the close screen contains typed, stage-specific widgets and optional detail panels. GraphQL interfaces or unions let the client request fields for each concrete widget while keeping one strongly typed overview query.

Official references:

- Strawberry Django integration: <https://strawberry.rocks/docs/integrations/django>
- GraphQL type system: <https://spec.graphql.org/October2021/#sec-Type-System>

## Non-negotiable security boundary

### Authentication

Login stays REST:

```http
POST /api/auth/login/
Content-Type: application/json

{
  "username": "...",
  "password": "..."
}
```

The Vue client sends the returned access token on GraphQL requests:

```http
Authorization: Bearer <access-token>
```

The Strawberry view must authenticate the request before executing a resolver. Strawberry's Django view does not automatically inherit DRF's authentication stack, so add an explicit authenticated GraphQL view or equivalent middleware that:

1. accepts the existing SimpleJWT browser access token;
2. sets `request.user` and GraphQL context only after successful validation;
3. returns HTTP 401 for missing, expired or invalid browser credentials;
4. does not accept the Excel or MCP service credential by default;
5. preserves CSRF protection if session authentication is enabled.

In production:

- allow GraphQL operations by `POST` only;
- disable the GraphQL IDE;
- disable schema introspection for ordinary users unless operations tooling requires it;
- enforce query-depth, complexity, pagination and request-size limits;
- log operation name, user, entity, duration and outcome without logging document contents or financial values.

### Entity authorization

The selected entity is an input, not authorization. A resolver must prove membership before reading any finance data.

Required rule:

```text
requested entity_id must be present in the authenticated user's allowed entity set
```

Do not return every Xero tenant merely because the caller is authenticated. If a durable user-to-entity membership model is not yet present, add one before exposing this API. A suitable minimum contract is:

```text
UserEntityMembership
- user_id
- entity_id / Xero tenant UUID
- role
- active
- created_at
- updated_at
Unique(user_id, entity_id)
```

Use one shared `require_entity_access(info, entity_id)` function at the start of every entity-scoped resolver and mutation. Test it directly.

## First three GraphQL fields

GraphQL has one HTTP endpoint. The first deliverable consists of three query fields behind that endpoint.

### 1. `viewerContext`

Purpose: hydrate the authenticated shell after REST login and provide only the entities the user may select.

```graphql
type Query {
  viewerContext: ViewerContext!
}

type ViewerContext {
  user: Viewer!
  entities: [EntityOption!]!
  preferences: ViewerPreferences!
}

type Viewer {
  id: ID!
  username: String!
  displayName: String!
  email: String
}

type EntityOption {
  id: ID!
  name: String!
  role: EntityRole!
  active: Boolean!
}

type ViewerPreferences {
  defaultEntityId: ID
  defaultFinancialYear: Int
}
```

Acceptance:

- no token returns 401;
- a user sees only active memberships;
- the default entity is null when it is not in the allowed set;
- no Xero credentials, tokens or raw connection secrets are returned.

### 2. `closeOverview`

Purpose: hydrate the period selector, stage status and summary widgets for the selected entity.

Use ISO accounting periods. Do not infer a year from a label such as `FY 2026`; the current UI and some backend helpers disagree about start-year versus end-year naming.

```graphql
scalar DateTime
scalar Decimal

input CloseOverviewInput {
  entityId: ID!
  periods: [YearMonth!]!
}

scalar YearMonth

type Query {
  closeOverview(input: CloseOverviewInput!): CloseOverview!
}

type CloseOverview {
  context: CloseContext!
  periods: [ClosePeriod!]!
  stages: [CloseStage!]!
  sourceFreshness: SourceFreshnessSummary!
  widgets: [OverviewWidget!]!
  exceptionSummary: ExceptionSummary!
}

type CloseContext {
  entity: EntityOption!
  selectedPeriods: [YearMonth!]!
  asOf: DateTime!
  revision: String!
}

type ClosePeriod {
  period: YearMonth!
  completionPercent: Int!
  state: ClosePeriodState!
}

type CloseStage {
  key: CloseStageKey!
  completionPercent: Int!
  attentionCount: Int!
  state: CloseStageState!
}

interface OverviewWidget {
  id: ID!
  stage: CloseStageKey!
  title: String!
  status: WorkStatus!
  attentionCount: Int!
  updatedAt: DateTime
}
```

Initial concrete widget types:

- `XeroIngestWidget`
- `InvestecBankIngestWidget`
- `InvestmentHoldingsIngestWidget`
- `ShareTransactionsIngestWidget`
- `PlanningAnalyticsIngestWidget`
- `ReconciliationControlWidget`
- `AssignedReviewWidget`

Return raw values:

- decimal amounts, never preformatted `"R 388.00"` strings;
- UTC timestamps, never `"15 min ago"` strings;
- enums for state and severity;
- entity and period IDs;
- no CSS tone, icon name, Vue route name or button label from the API.

Input rules:

- `periods` must contain 1–12 unique ISO `YYYY-MM` values;
- validate, deduplicate and sort periods before application logic;
- reject inaccessible entities before any aggregate query runs;
- return data only from entity-scoped source rows.

### 3. `receiptWorkbench`

Purpose: open one receipt work item directly from Overview without loading or searching a global queue.

```graphql
input ReceiptWorkbenchInput {
  entityId: ID!
  receiptId: ID!
}

type Query {
  receiptWorkbench(input: ReceiptWorkbenchInput!): ReceiptWorkbench!
}

type ReceiptWorkbench {
  workItem: ReceiptWorkItem!
  sourceDocument: ReceiptDocument!
  extraction: ReceiptExtraction!
  correctionDraft: ReceiptCorrectionDraft
  supplierJournalCandidates(first: Int = 20, after: String): SupplierJournalCandidateConnection!
  auditTrail(first: Int = 20, after: String): WorkItemAuditEventConnection!
}

type ReceiptWorkItem {
  id: ID!
  entity: EntityOption!
  period: YearMonth!
  status: WorkStatus!
  severity: WorkSeverity!
  owner: Viewer
  reviewer: Viewer
  dueAt: DateTime
  financialImpact: Money
  revision: String!
}

type Money {
  currency: String!
  amount: Decimal!
}

type ReceiptDocument {
  filename: String!
  mediaType: String!
  viewUrl: String!
  capturedAt: DateTime
}

type ReceiptExtraction {
  supplier: ExtractedString
  invoiceNumber: ExtractedString
  receiptDate: ExtractedDate
  subtotal: ExtractedMoney
  vat: ExtractedMoney
  total: ExtractedMoney
  lineItems: [ReceiptExtractedLine!]!
}

type ExtractedString {
  value: String
  confidence: Int
  source: EvidenceReference
}
```

The extraction, user draft and committed accounting value are different states and must not be collapsed into one field.

Supplier journal candidates must be entity-scoped, read-only and sorted server-side by:

1. exact or closest amount;
2. closest transaction date;
3. newest transaction date.

Use cursor pagination. Do not return all 4,000+ journal lines in the initial response.

## Phase-two mutations

Do not include a broad `updateReceipt` mutation. Use explicit domain commands with optimistic concurrency.

```graphql
type Mutation {
  saveReceiptCorrectionDraft(input: SaveReceiptCorrectionDraftInput!): SaveReceiptCorrectionDraftPayload!
  confirmReceiptMissingFromXero(input: ConfirmReceiptMissingFromXeroInput!): ConfirmReceiptMissingFromXeroPayload!
  linkReceiptToXeroTransaction(input: LinkReceiptToXeroTransactionInput!): LinkReceiptToXeroTransactionPayload!
}
```

Every input must include:

- `entityId`;
- `receiptId`;
- the last-read `revision`;
- an idempotency key for confirmation/link actions.

`confirmReceiptMissingFromXero` updates Klikk's review/work-item state only. It must not create or change a Xero transaction.

Creating a Xero draft bill is a separate future mutation with a preview step, explicit entity/attachment scope, idempotency and immutable audit history.

## Suggested backend structure

Keep GraphQL as transport, not the business-logic layer:

```text
apps/web_api_v2/
  apps.py
  urls.py
  schema.py
  context.py
  auth.py
  errors.py
  scalars.py
  types/
    viewer.py
    close.py
    receipts.py
  queries/
    viewer_context.py
    close_overview.py
    receipt_workbench.py
  mutations/
    receipts.py
  loaders/
    users.py
    entities.py
    receipts.py
  tests/
```

Application services should live with the domain they coordinate, for example:

```text
apps/close_management/application/build_overview.py
apps/receipts/application/get_workbench.py
apps/receipts/application/save_correction_draft.py
```

Resolvers call these services and map their typed results to GraphQL types. They must not reproduce SQL, Xero calls or accounting rules.

## Existing-source mapping

Use current services where safe:

| GraphQL field | Existing source | Rule |
| --- | --- | --- |
| login/refresh | `/api/auth/login/`, `/api/auth/refresh/` | Keep REST |
| entities | `/xero/core/tenants/` plus user membership | Never return unscoped tenants |
| receipt queue/detail | `apps.receipts` services and review models | Add entity constraint before exposure |
| receipt document | current signed/HMAC viewer | Preserve expiry and authorization |
| supplier journal candidates | Xero PostgreSQL mirror/search service | Read-only, entity-scoped, paginated |
| source freshness | Xero sync, Investec sync, TM1 connection state | No live third-party call in overview resolver |
| close widgets | application-layer composition over local snapshots | No mutating reconcile endpoint in a query |

Do not call a reconcile or import endpoint with side effects from a GraphQL query. A GraphQL query must be safe and read-only.

## Dependencies discovered in the backend audit

These are implementation blockers, not optional future clean-up:

1. **Entity membership:** authentication exists, but the web API still needs an explicit, durable user-to-entity authorization rule. Do not use the selected entity ID as proof of access.
2. **Investec ownership:** current Investec account and transaction records are not reliably related to a Xero tenant/entity. Add an entity-source connection or equivalent relation before returning Investec data in an entity-scoped overview.
3. **Planning Analytics ownership:** TM1/Planning Analytics configuration is currently broader than one entity. Add entity scoping before returning its freshness or reconciliation state.
4. **Three-way reconciliation evidence:** existing validation primarily proves Xero against PostgreSQL. Persist Planning Analytics comparison evidence and source cut-off timestamps before claiming Xero, PostgreSQL and Planning Analytics agree.
5. **Financial-year convention:** current UI and backend helpers do not consistently use the same start-year/end-year label. Make ISO `YYYY-MM` periods authoritative and return explicit `startOn` and `endOn` dates wherever a financial-year label is shown.
6. **Query safety:** some legacy read-looking reconciliation flows can import reports or write comparison rows. The GraphQL query layer must call a read-only application service over persisted snapshots, never those side-effecting views.

Until the entity relations exist, return the affected source widget as `UNAVAILABLE` or `NOT_CONFIGURED`; never attach global source data to the selected entity by inference.

## First delivery pull-request checklist

The receiving agent's first pull request should be deliberately narrow:

- add `strawberry-graphql-django` and `apps.web_api_v2`;
- expose authenticated, POST-only `/api/v2/graphql/`;
- reuse the existing REST login and refresh endpoints without changing their response contract;
- implement `UserEntityMembership` or a reviewed equivalent authorization repository;
- implement `viewerContext` only;
- add a schema snapshot and the `ViewerContext` example operation;
- add tests for missing, expired and valid JWTs;
- add tests proving a user cannot enumerate or request another user's entity;
- confirm GraphQL variables and financial values are not written to application logs;
- leave `closeOverview`, `receiptWorkbench` and all mutations as schema/design follow-ups unless the membership boundary has passed review.

This first pull request is complete when the frontend can log in through REST, call `viewerContext` with the returned access token, display only permitted entities, select one, and persist only an allowed entity ID.

Example operation:

```graphql
query ViewerContext {
  viewerContext {
    user {
      id
      username
      displayName
      email
    }
    entities {
      id
      name
      role
      active
    }
    preferences {
      defaultEntityId
      defaultFinancialYear
    }
  }
}
```

## DataLoader and query performance

Create request-scoped loaders for repeated entity, user, receipt and source lookups. Batch by entity and IDs. Cache only for the lifetime of one request unless the domain service already owns a safe cache.

Performance target for the first release:

- `viewerContext`: p95 under 250 ms;
- `closeOverview`: p95 under 800 ms using local PostgreSQL snapshots;
- `receiptWorkbench`: p95 under 600 ms excluding document binary transfer;
- initial workbench response must not fetch the image/PDF bytes;
- resolver SQL count must stay bounded as widget/item counts grow.

## Error contract

Use stable GraphQL error extension codes:

```text
UNAUTHENTICATED
FORBIDDEN_ENTITY
INVALID_PERIOD
NOT_FOUND
CONFLICT
VALIDATION_ERROR
INTERNAL_ERROR
```

Do not expose tracebacks, SQL, tokens or upstream Xero/Investec error bodies. Include a safe correlation ID for server logs.

For stale write revisions return `CONFLICT` and the current revision. Do not silently overwrite another reviewer's work.

## Frontend handoff contract

The frontend will add:

```text
src/api/graphql/client.ts
src/api/graphql/operations/viewerContext.graphql
src/api/graphql/operations/closeOverview.graphql
src/api/graphql/operations/receiptWorkbench.graphql
src/stores/entityContext.ts
src/stores/closeOverview.ts
src/stores/receiptWorkbench.ts
```

Pinia owns selected entity, selected periods, normalized response data and request state. It must not own accounting rules or derive authorization.

Recommended request flow:

```text
auth store logs in via REST
-> entity context queries viewerContext
-> user selects an allowed entity
-> selected entity ID is persisted as a preference/cache
-> overview store queries closeOverview
-> Open workbench routes with receiptId
-> workbench store queries receiptWorkbench(entityId, receiptId)
```

Changing entity or financial period must clear entity/period-sensitive workbench data before the next query.

## Required tests

### Authentication and authorization

- missing token returns 401;
- invalid/expired JWT returns 401;
- authenticated user cannot request an unassigned entity;
- inaccessible receipt returns `NOT_FOUND` or `FORBIDDEN_ENTITY` without confirming its existence;
- user A's default entity cannot leak to user B;
- service tokens are rejected unless deliberately enabled for a separately reviewed operation.

### Query correctness

- `YearMonth` rejects malformed values;
- period lists are deduplicated and ordered;
- amounts are decimal-safe and never converted through binary float;
- entity filter is present in every receipt/journal/source query;
- widget types resolve deterministically;
- cursors do not skip or duplicate journal candidates.

### Safety and performance

- query depth/complexity limit is enforced;
- `first` is capped;
- GET queries are disabled in production;
- GraphQL IDE is disabled in production;
- representative overview and workbench queries have bounded SQL counts;
- GraphQL queries never trigger Xero import/reconcile mutations;
- logs redact variables and financial payloads.

### Contract

- snapshot/export the schema in CI;
- fail CI on unintended breaking schema changes;
- run example operations against realistic fixtures;
- verify REST v1 endpoints remain unchanged.

## Delivery sequence

1. Clean worktree from production `origin/main`.
2. Add Strawberry dependency and `apps.web_api_v2` transport app.
3. Add the authenticated POST-only GraphQL view and `/api/v2/graphql/` route.
4. Add entity membership enforcement and `viewerContext`.
5. Add custom scalars/enums and validation limits.
6. Add `closeOverview` over local snapshot/application services.
7. Add `receiptWorkbench` and paginated supplier journal candidates.
8. Add schema export and security/query-count tests.
9. Provide the frontend with the schema file and three working example operations.
10. Do not deploy until the migration, permissions and production settings have been reviewed.

## Definition of done

- Existing REST login returns a JWT accepted by GraphQL.
- `viewerContext` returns only entities assigned to the logged-in user.
- Entity selection is required before overview or workbench data is returned.
- `closeOverview` supports one, multiple or all periods through explicit ISO period IDs.
- `receiptWorkbench` opens one entity-scoped receipt with source evidence, extraction/draft separation and paginated supplier candidates.
- No GraphQL query mutates local or external state.
- The project-wide `IsAuthenticated` baseline remains intact.
- Security, schema, resolver and query-count tests pass.
- REST v1 behavior and existing clients remain unchanged.
