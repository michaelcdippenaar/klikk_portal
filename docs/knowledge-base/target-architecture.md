# Target architecture: Klikk Finance OS

## Product model

The target product is one financial operating cycle with optional specialist workspaces.

### Persistent shell context

Every finance route receives the same context object:

- company/entity;
- financial year;
- period or date range;
- data cutoff/snapshot;
- user role;
- source freshness.

Changing context is explicit and warns when unsaved work or a running process would be abandoned.

### Primary navigation

1. **Overview** — cash, performance, close readiness, source freshness and assigned work.
2. **Money** — bank, transactions, receivables/payables, receipts and document matching.
3. **Close** — checklist, reconciliations, journals, adjustments, approvals and period lock.
4. **Reporting & Planning** — governed reports, variance analysis, TM1 and exports.
5. **Audit** — readiness, runs, findings, evidence, review/sign-off and audit packs.
6. **Investments** — optional treasury/market workspace.
7. **Setup** — companies, connections, mappings, users, roles, credentials and policies.

## Shared domain contracts

### Work item

A single work item can represent a missing receipt, failed audit check, reconciliation break, evidence request or cube comment. Required fields:

- company and period;
- source type/id and linked financial figure;
- title, category, severity and status;
- owner, reviewer, due date and ageing;
- evidence links and attachments;
- proposed correction/action;
- resolution, approval and immutable history.

### Audit run

An audit run records company, FY, cutoff, source snapshot, check versions, results and rerun lineage. Findings never float free from the run that produced them.

### Service credential

A named credential belongs to an owner but is not a user account. It has scopes, expiry, last-used time, revocation and an audit actor label. Excel can then be `journals:read` and `cube-comments:write` without inheriting the owner's super-admin rights.

## Frontend module shape

```text
src/
  app/                 shell, context, route and navigation registry
  design-system/       tokens, primitives, patterns and preview
  domains/
    auth/
    companies/
    money/
    close/
    audit/
    reporting/
    investments/
    setup/
  shared/              formatters, API client, errors and generic composables
```

Each domain owns routes, pages, components, composables, API repository, types and tests. Pages orchestrate; they do not contain the whole data and styling stack.

Initial frontend splits:

- `AuditReceiptsV2.vue` → queue shell, review workspace, correction form, supplier journal panel and receipt API state.
- `AuditFindings.vue` → register shell, finding detail, evidence graph and query-state composable.
- `Reporting.vue`/`PivotExplorer.vue` → report chooser, view mode, build mode, pivot query model and table renderer.
- `FinancialInvestments.vue` → watchlist, symbol detail, refresh workflows and market-data repository.
- `MainLayout.vue`/`PipelineLayout.vue` → one navigation registry used by routes, sidebar and command palette.

## Backend module shape

Django apps remain bounded by business domain, but large modules split by application service and transport:

```text
apps/<domain>/
  api/                 urls, views, serializers and request parsing
  application/         use cases and orchestration
  domain/              policies, value objects and pure calculations
  infrastructure/      ORM repositories and external clients
  tests/
```

Do not perform a big-bang directory rewrite. Extract one use case at a time behind existing endpoints and keep response contracts stable.

Initial backend splits:

- `investec/views.py` by banking, portfolio, mapping, exports and cash-flow use cases;
- `ai_agent/views.py` by projects, corpora, sessions, credentials and monitoring;
- `xero_core/services.py` into client, token lifecycle, rate-limit/quota and endpoint repositories;
- `xero_data/views.py` into journals, documents, aged reports, invoices/quotes and analytical pivot APIs;
- `xero_data/transaction_processor.py` into normalisation, journal construction and persistence stages.

## Staged organisation plan

### Stage 1 — contracts and registries

- make the current production backend branch the development baseline;
- centralise route/navigation metadata; **completed for the portal shell, operations drawer and command palette on 20 August 2026**;
- introduce typed company/FY/period context;
- document API ownership and service identities.

### Stage 2 — extract without redesign

- move data/query logic from the largest pages into domain composables and repositories;
- split backend views/services while preserving URLs and payloads;
- add contract tests around each seam.

### Stage 3 — implement the selected UX direction

- rebuild Overview and the shared shell first;
- migrate Receipts V2 and Findings onto the unified work-item pattern;
- add Close and Audit Run workspaces;
- migrate remaining tools by domain priority.

### Stage 4 — governance

- scoped service credentials;
- roles and maker/checker approvals;
- immutable snapshots, period locks and audit-pack manifests;
- retention and evidence policies.

## Architectural rule

Organisation is successful only when it reduces cognitive load and preserves accounting truth. A smaller file is not automatically a better module; the seam must follow a stable business responsibility and have a tested contract.
