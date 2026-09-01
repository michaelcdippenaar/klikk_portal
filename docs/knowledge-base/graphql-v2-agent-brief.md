# Agent brief — Klikk Web API v2 foundation

## Assignment

Implement the first secure backend foundation for the Klikk Financials Vue web application.

The first milestone is intentionally small:

```text
Existing REST login
-> authenticated GraphQL request
-> return the current user and only the entities they may access
-> frontend can select one permitted entity
```

Do not implement the full Overview or Receipt Workbench in the first pull request. Establish and test the authentication and entity-authorization boundary first.

## Repositories

Backend:

```text
/Users/mcdippenaar/ClaudProjects/klikk_financials_v4
```

Frontend, for contract reference only:

```text
/Users/mcdippenaar/ClaudProjects/klikk_financials_portal
```

Before editing the backend:

1. Fetch `origin`.
2. Inspect the current production `origin/main`.
3. Create a clean feature worktree from that commit.
4. Do not use a stale local feature branch as source truth.

## Architectural decision

Add one GraphQL v2 boundary for the Vue web application:

```http
POST /api/v2/graphql/
Authorization: Bearer <existing SimpleJWT access token>
```

Use Strawberry GraphQL with Django:

```text
strawberry-graphql-django
```

Keep REST for:

- login and token refresh;
- logout/token invalidation if supported;
- binary uploads and downloads;
- ingestion, synchronization and other long-running operational commands;
- existing Excel, MCP, webhook and legacy clients.

Do not build duplicate REST and GraphQL versions of Overview or Workbench reads.

## Existing REST contract

Preserve the current behavior of:

```text
POST /api/auth/login/
POST /api/auth/refresh/
```

Do not rename fields or change their response contract in this task. The access token returned by login must authenticate the GraphQL endpoint.

An additional `GET /api/v2/entities/` endpoint is not required. `viewerContext` is the entity-selection contract.

## First GraphQL contract

Implement this query:

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

Example HTTP request:

```http
POST /api/v2/graphql/
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "operationName": "ViewerContext",
  "query": "query ViewerContext { viewerContext { user { id username displayName email } entities { id name role active } preferences { defaultEntityId defaultFinancialYear } } }"
}
```

## Authentication requirements

Strawberry's Django view does not automatically inherit the Django REST Framework authentication stack. Add an explicit authenticated GraphQL view or middleware that:

1. validates the existing SimpleJWT browser access token;
2. sets `request.user` and the GraphQL context only after validation;
3. returns HTTP 401 for a missing, invalid or expired token;
4. rejects Excel/MCP service credentials unless they are deliberately enabled in a separately reviewed change;
5. does not log authorization headers, GraphQL variables or financial values.

Production requirements:

- GraphQL operations use `POST` only;
- the GraphQL IDE is disabled;
- introspection is disabled for ordinary production users unless operations tooling requires it;
- request size, query depth, query complexity and pagination are limited;
- log operation name, authenticated user ID, duration, correlation ID and outcome only.

## Entity-authorization requirements

The entity selected by the browser is input, not authorization.

Every entity-scoped resolver must enforce:

```text
requested entity_id is in the authenticated user's active allowed-entity set
```

Do not return all Xero tenants to every authenticated user.

Implement or formalize a durable membership boundary, for example:

```text
UserEntityMembership
- user
- entity / Xero tenant
- role
- active
- created_at
- updated_at

Unique(user, entity)
```

Create one shared service such as:

```python
require_entity_access(info, entity_id)
```

All future finance queries and mutations must call the same authorization service. Test it directly.

`defaultEntityId` must be returned as `null` if that entity is not in the user's active allowed set.

Never expose:

- Xero access or refresh tokens;
- client secrets;
- Investec credentials;
- TM1 credentials;
- raw connection configuration;
- entity IDs the user cannot access.

## Suggested code layout

Keep GraphQL as a transport adapter rather than the business-logic layer:

```text
apps/web_api_v2/
  apps.py
  urls.py
  schema.py
  context.py
  auth.py
  errors.py
  types/
    viewer.py
  queries/
    viewer_context.py
  services/
    entity_access.py
  tests/
    test_auth.py
    test_viewer_context.py
    test_entity_access.py
```

Resolvers should call services/repositories. Do not put authorization SQL or future accounting logic directly in resolvers.

## Error contract

Use stable GraphQL extension codes:

```text
UNAUTHENTICATED
FORBIDDEN_ENTITY
NOT_FOUND
VALIDATION_ERROR
INTERNAL_ERROR
```

Do not expose tracebacks, SQL, credentials or upstream response bodies. Return a safe correlation ID for server-side investigation.

For an inaccessible entity or receipt, do not reveal whether the resource exists outside the user's permitted entity set.

## Required tests for the first milestone

Authentication:

- missing bearer token returns HTTP 401;
- malformed token returns HTTP 401;
- expired token returns HTTP 401;
- a valid REST login token authenticates GraphQL;
- a service credential is rejected by default.

Entity isolation:

- a user receives only their active memberships;
- inactive memberships are excluded;
- user A cannot enumerate user B's entities;
- a stale/default entity outside the allowed set returns as `null`;
- the shared entity-access service rejects an unassigned entity.

Security and contract:

- production accepts GraphQL by `POST` only;
- production IDE is disabled;
- logs do not contain tokens or operation variables;
- export/snapshot the GraphQL schema in CI;
- existing REST login and refresh behavior remains unchanged.

## Acceptance criteria

The first milestone is complete only when:

1. the existing REST login returns an access token accepted by GraphQL;
2. `viewerContext` returns the authenticated user;
3. `viewerContext.entities` contains only entities assigned to that user;
4. the frontend has enough information to render the entity selector;
5. a selected entity cannot be used to bypass membership authorization;
6. the required authentication and entity-isolation tests pass;
7. existing REST clients continue working without contract changes;
8. the schema file and a working `ViewerContext` example operation are included in the handback.

## Explicitly out of scope for the first milestone

Do not add yet:

- `closeOverview` implementation;
- `receiptWorkbench` implementation;
- receipt correction mutations;
- Xero draft-bill creation;
- reconciliation writes;
- live Xero, Investec or Planning Analytics calls from GraphQL queries;
- a duplicate REST Overview API;
- frontend UI changes.

## Planned second milestone

After the authentication and entity boundary is approved, implement:

```graphql
closeOverview(input: CloseOverviewInput!): CloseOverview!
receiptWorkbench(input: ReceiptWorkbenchInput!): ReceiptWorkbench!
```

Both must require `entityId`. Overview must read from local PostgreSQL snapshots only. Receipt Workbench must open one entity-scoped receipt and keep source extraction, human correction draft and committed accounting state separate.

Before second-milestone work begins, resolve these backend dependencies:

- relate Investec source records to an entity;
- relate Planning Analytics configuration/results to an entity;
- persist three-way reconciliation evidence for Xero, PostgreSQL and Planning Analytics;
- settle financial-year naming and make ISO `YYYY-MM` periods authoritative;
- ensure no query path calls legacy reconcile/import flows with side effects.

## Handback required from the implementing agent

Return:

1. feature branch/worktree and commit hash;
2. changed-file list;
3. migration summary;
4. exact login and `ViewerContext` test commands;
5. test results;
6. exported GraphQL schema path;
7. a working curl request using a redacted token;
8. any unresolved security or data-model concern;
9. confirmation that production `origin/main` was the implementation base.

## Detailed reference

The complete design for later Overview, Receipt Workbench, typed widgets, mutations, pagination and performance is here:

```text
/Users/mcdippenaar/ClaudProjects/klikk_financials_portal/docs/knowledge-base/graphql-v2-backend-handover.md
```

