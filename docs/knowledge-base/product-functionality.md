# Product functionality

## Global shell and context

The portal currently exposes 35 route declarations and 29 page components. The top navigation is Home, Operations, Reporting and Setup. Operations then opens a second, connector-led navigation with Xero, Investec, Financial Investments, Planning Analytics, Audit and Pricing.

The selected Xero tenant is stored in browser local storage and consumed through the Pinia data store. Company, financial year and period are not yet first-class global context, so screens repeatedly ask for or infer them.

## Authentication and identities

| Consumer | Credential | Current purpose |
| --- | --- | --- |
| Portal | SimpleJWT access and refresh tokens | Interactive application session. Access lifetime is one hour; refresh lifetime is seven days. |
| Portal edge | `klikk_token` cookie containing the access token | Nginx `auth_request` gate for PAW and protected routes. |
| Excel add-in | DRF authtoken for the `excel-addin` service user | Read-only journals, pivots and cube comments. Separate identity is intentional for revocation and audit. |
| MCP/machine clients | Shared service Bearer token | Machine access including selected write-capable functions. |

The current login failure has two independent causes: duplicate email rows make backend email lookup raise a 500, and the frontend sends login through the authenticated Axios interceptor, causing a normal 401 to be replaced by `No refresh token available`.

## Home and operating status

`Dashboard.vue` is now a period- and close-stage-led Overview. The month strip shows annual progress, the Ingest/Reconcile/Review/Sign off stages filter accountable work, source freshness remains available in the persistent header, and work, cube comments and exceptions open in contextual detail. Performance KPIs live under Reporting rather than competing with close work in Overview.

## Overview Ingest V1

Ingest is the controlled collection of source data and evidence before reconciliation. It currently models eight independent Pinia source jobs with source, method, owner, reviewer, close period, freshness, record count, validation result and status.

Existing operational routes remain the systems of action:

- Xero ledger and document processing opens Processes;
- Investec bank transactions open the bank import workspace;
- investment holdings and share transactions open their existing manual-upload workspaces;
- Planning Analytics is represented as a read-only target pull and opens the existing PA workspace;
- WhatsApp and email are explicitly not configured, with no fake action;
- the future consolidated manual-document uploader is disclosed as planned work.

The live Xero, Investec bank and TM1 connection checks update both persistent source freshness and their matching Ingest job. Outbound posting of actuals to Planning Analytics is not Ingest; it belongs under governed reporting or sign-off.

## Reconcile and Review boundary

Reconcile proves that Xero, the processed PostgreSQL ledger and Planning Analytics actuals agree for the selected period. Its controls open the existing Comparison, Data Viewer and Planning Analytics workspaces to identify completeness, mapping, timing and value differences.

Review begins after a reconciliation result or proposed accounting action exists. A person investigates the exception, checks evidence, corrects or confirms the draft and records approval. The same accountable work item moves from a reconciliation exception into Review; it must not be copied into both queues.

## Xero operations

The Xero domain is a pipeline:

1. OAuth credentials and organisation connections.
2. Tenant, API quota and token lifecycle management.
3. Metadata sync for accounts, contacts and tracking.
4. Transaction, journal, invoice, quote, aged report and document sync.
5. Raw-to-processed journal transformation.
6. Trial balance, balance sheet and P&L-by-tracking cube construction.
7. Reconciliation and validation.
8. Process status and scheduling.

The portal surfaces this through Processes, Data Viewer and Comparison. These are capable operator tools, but the user must translate accounting work into pipeline stages.

## Receipts and missing-document reconciliation

The receipt register reads the WhatsApp Slippies pipeline's `whatsapp.klikk_slips` table and adds review state without mutating the source register or Xero.

Current capabilities:

- search, financial-year, Xero-status, category, date, amount and work-queue filtering;
- sortable, paginated result sets and bulk selection;
- receipt image/PDF viewing through signed links;
- OCR supplier, date, amount, category, tax and line-item fields;
- Xero journal match context;
- reviewer notes, comments, to-process state and reversible archive;
- export to CSV/XLSX.

Receipts V2 adds a two-pane review surface, human confirmation, editable correction draft and supplier journal search. The correction is still local review state. Creating a draft Xero bill is explicitly future work and must remain a reviewed, traceable action.

## Audit and evidence

The backend now has a year-end audit registry with 45 seeded checks, runs and results. Findings add severity, status, ownership-adjacent workflow, comments, attachments and links to source/cube evidence. Cell comments preserve a figure's complete cube intersection and can also anchor to bank transactions.

Implemented pieces:

- check catalogue and deterministic SQL checks;
- individual/all-check execution contract;
- run and result persistence;
- findings register with comments, attachments and linked evidence;
- receipt/document exception workflow;
- signed source-document links;
- Excel cube comments and mention-driven notifications.

Still missing as one seamless journey:

- explicit company, FY, cutoff and snapshot selection;
- readiness gates before a run;
- dependency-aware close checklist;
- one work queue across findings, receipts, reconciliations and comments;
- maker/checker approvals and final sign-off;
- immutable audit-pack generation and rerun/delta comparison.

## Reporting and Planning Analytics

Reporting combines financial views, cost behaviour and report exploration. `PivotExplorer.vue` provides a rich TM1-like multidimensional workspace. Planning Analytics exposes TM1 connection tests, process execution, cube/dimension discovery, MDX queries, KPI targets, cost behaviour and tracking mappings.

The capability is deep but split between very large frontend containers and backend view modules. View and Build modes are not clearly separated, and some visible authoring controls do not yet have complete workflows.

## Investec, cash and personal expenses

Investec functionality covers bank accounts and transactions, bank-cost reporting, beneficiaries, JSE transaction and portfolio imports, share mappings, performance and cash-flow forecasting. Personal-expense rules classify bank transactions using longest matching tags while protecting manual overrides.

These functions belong under Money and Treasury in the target product, not under a connector name.

## Financial investments

The market-data domain tracks symbols, prices, dividends, splits, fundamentals, earnings, recommendations, price targets, ownership, news and dividend forecasts. It also writes selected forecast decisions into TM1.

This is a sizeable optional domain. It should be treated as a dedicated workspace rather than mixed into the company close path.

## Pricing

The rate card supports equipment items, effective-dated prices, customer overrides, quote calculation and exports. Quote calculation persists nothing; controlled writes affect only price-list tables and never Xero.

## AI agent and knowledge systems

The AI agent supports projects, corpora, vector search, sessions, memory, system documents, tools, approvals, monitoring and TM1 proxying. A separate read-only books knowledge base exposes allocation doctrine, supplier/customer rules, account meanings, tracking dictionaries and event windows from the PostgreSQL `kb` schema.

The AI layer should assist finance work but must not become the only place where state, approval or evidence exists. Audit procedures remain deterministic and versioned; retrieval explains them but does not execute them.

## Excel add-in

The add-in is a read-only journals and cube-analysis client, with controlled writes only to local cube comments. It depends on authenticated journal search/filter/pivot endpoints. Its dedicated service identity and token should be preserved until a proper named, scoped credential model replaces the user-shaped service account.
