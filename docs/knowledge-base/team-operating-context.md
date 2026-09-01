# Team operating context

Date: 21 August 2026  
Owner: CTO/orchestrator  
Status: canonical coordination context for the current V2 build

## Mission

Klikk Financials is becoming a company financial-management and close operating system:

`Connect sources -> ingest and validate -> reconcile systems -> resolve exceptions -> review evidence -> sign off -> freeze the audit pack`

The product must make one entity and one or more reporting periods explicit, keep evidence traceable, and automate year-end audit preparation without hiding accountability.

## Active team

| Lead | Owns | Must hand off to |
| --- | --- | --- |
| CTO/orchestrator | requirement grouping, expert prompts, architecture decisions, dependency ordering | appropriate lead |
| FrondEndDevloper | Vue, Pinia, KDL UI, accessibility, frontend tests | QA |
| BackEnd Developer | auth, entity access, GraphQL/REST, persistence, auditability, backend tests | QA |
| Quality Assurance (QA) | independent functional, regression, responsive, contract, and release verification | responsible lead for defects; DevOps on pass |
| DevOps | commit/push, CI, containers, deploy, public checks, rollback | CTO/orchestrator |

Frontend and Backend leads should use junior/subagents for bounded investigation or implementation where it improves speed. QA may use juniors for independent test partitions. Leads remain responsible for every integrated result.

All leads report completion and material blockers to the CTO/orchestrator task `Klikk Portal V2 _ CTO` (`01a01ead-23e2-7013-ad73-3846b7660fd0`). Cross-agent work is not considered handed over until that report is delivered.

Agents load skills just in time according to the role map in `AGENTS.md`. This keeps task context small and prevents unrelated skill instructions from competing with the Klikk product rules.

## Environment map

- Active frontend source: `/Users/mcdippenaar/ClaudProjects/klikk_financials_portal`.
- V2 Git remote: `git@github.com:michaelcdippenaar/klikk_financials_portal_v2.git`.
- V2 server checkout: `/srv/klikk-financials/compose/klikk_portal_v2`.
- Container/service: `klikk-financials-v2-dev` / `frontend-v2`.
- Public staging: <https://auditors.8-bit.space/>.
- Public Overview preview: <https://auditors.8-bit.space/_close-overview-preview>.
- Protected application route: `/app`, which must redirect unauthenticated users to `/login?redirect=/app`.
- Production application: <https://console.8-bit.space>.
- Staging reaches the production backend through `/backend`; non-demo writes are real.

The deployed V2 checkout is currently a reviewed staging snapshot rather than a clean release commit. DevOps must reconcile it into a clean V2 commit instead of committing an entire dirty worktree blindly.

## Current product context

### Entity and period context

- The browser must authenticate, load only entities the user may access, and require or apply an allowed entity selection.
- Production entity options use stable IDs and contain `name`, membership role, active/status state, and capabilities.
- A default entity or financial year is a preference hint, not an authorization decision.
- Month selection supports one month, multiple months, or all months where the view supports aggregation.
- The backend distinguishes unauthenticated, no accessible entities, forbidden entity, and retryable temporary unavailability.

### Temporary preview entity

While the entity API is being completed, the Overview preview may inject `Klikk (Pty) Ltd` with ID `demo-klikk-pty-ltd` only when no real entities are available.

- It exists only on the preview/demo path.
- It is frontend/Pinia state, not a production backend DTO.
- Real API entities always take precedence.
- It is read-only and its ID must never reach a production mutation.
- `/app` keeps the real empty/select-entity behavior.

### Web API V2

- Login remains REST at `POST /api/auth/login/`.
- Authenticated web composition is GraphQL at `POST /api/v2/graphql/`.
- The first path is: login -> `viewerContext` -> entity selection -> `closeOverview` -> stage/workbench detail.
- Every finance resolver calls one shared entity-access guard.
- Prefer a compact bootstrap/summary query plus paginated, typed stage-specific reads over one unbounded response.
- Preserve REST for token refresh, ingestion actions, exports, webhooks, Excel, and MCP integrations where REST is operationally clearer.

## UX and architecture rules

- Use KDL global tokens; no hard-coded component design values.
- Reuse primitives and domain components.
- Pinia is the shared frontend state boundary.
- Ingest means source collection and validation: Xero, Investec, holdings, share transactions, WhatsApp, email, manual documents, and Planning Analytics inputs.
- Reconcile proves agreement between Xero, PostgreSQL, and Planning Analytics/TM1.
- Review is human evidence/exception work after reconciliation, not a duplicate reconciliation step.
- Workbench content should use typed, source/stage-specific widgets where workflows differ.
- Source freshness belongs in the global context area and must expose detailed connection state without consuming the main work surface.

## QA release gate

QA reviews work independently after the owning lead's tests pass.

Minimum QA coverage, selected according to risk:

- acceptance criteria and empty/loading/error states;
- authentication and entity isolation;
- demo-versus-production-write boundaries;
- API schema, error typing, pagination, and authorization;
- keyboard navigation, focus, readable status semantics, and responsive behavior;
- global token conformity and component reuse;
- explicit frontend architecture compliance for global stylesheet tokens, reusable components, and Pinia as the single shared-state boundary;
- focused unit/integration tests, lint, build, and browser smoke tests;
- staging route, backend proxy, container health, recent logs, and rollback evidence for a release candidate.

QA result is one of:

- `PASS`: acceptance criteria met; safe to hand to DevOps.
- `PASS WITH NOTED DEBT`: no release blocker; debt is documented with owner.
- `FAIL`: reproducible defect is sent to the responsible lead, who fixes and resubmits for retest.
- `BLOCKED`: test cannot be completed because an environment, fixture, permission, or dependency is unavailable.

DevOps does not release a normal change without a QA pass tied to the exact candidate commit or reviewed snapshot.

## Memory and handoff model

Use three layers:

1. **Canonical Git context**: code, tests, contracts, design rules, runbooks, ADRs, and this knowledge base.
2. **Structured coordination memory**: concise decisions, blockers, completed checks, deploy outcomes, and focused handoffs. Entries link back to canonical files or commits.
3. **Task conversations**: exploration and immediate implementation discussion. Do not copy full transcripts into durable memory.

Every lead starts by reading `AGENTS.md`, this document, `docs/knowledge-base/README.md`, and the references relevant to the scoped task. Every lead ends with the structured handoff defined in `AGENTS.md`.

## Current deployment facts

- Server base commit before the staging sync: `adaa48a`.
- Current rollback archive: `/srv/klikk-financials/backups/klikk_portal_v2/20260821-005341-before-portal-sync.tgz`.
- Last verified baseline: lint had zero errors and one pre-existing unused-variable warning; tests had 975 passes and one expected failure; local and in-container builds passed; container was healthy; public pages returned HTTP 200.
- Do not run `npm audit fix --force`; dependency findings require a separately reviewed upgrade.

## Maintained references

- [Knowledge-base index](README.md)
- [Product functionality](product-functionality.md)
- [System architecture](system-architecture.md)
- [Target architecture](target-architecture.md)
- [Design language](design-language.md)
- [GraphQL V2 backend handover](graphql-v2-backend-handover.md)
- [Implementation status](implementation-status.md)
- [Development container runbook](../development-container.md)
