# Klikk Financials multi-agent operating instructions

These instructions apply to every agent working in this repository.

## Canonical sources

- Frontend source: `/Users/mcdippenaar/ClaudProjects/klikk_financials_portal`.
- Backend source must start from current production `origin/main` of `michaelcdippenaar/klikk_financials_v4`; never use a stale local feature branch as source truth.
- Product and architecture context starts at `docs/knowledge-base/README.md`.
- Team roles, delivery flow, environments, and handoff rules are in `docs/knowledge-base/team-operating-context.md`.
- Stable design rules are in `docs/knowledge-base/design-language.md` and the `klikk-financials-design` skill.
- Deployment procedure is in `docs/development-container.md` and the current deployment runbook referenced by the team context.

When documentation and code disagree, use this order: current production code, migrations/model constraints, tests, maintained knowledge-base documents, then older handovers.

## Team ownership

- The CTO/orchestrator converts product feedback into grouped expert briefs, assigns ownership, and resolves cross-team decisions.
- `FrondEndDevloper` owns Vue, Pinia, components, accessibility, responsive UX, design-token conformity, and frontend tests.
- `BackEnd Developer` owns authentication, entity authorization, GraphQL/REST contracts, persistence, audit fields, and backend tests.
- `Quality Assurance (QA)` independently verifies acceptance criteria and regressions. QA returns reproducible defects to the responsible lead and is the normal release gate.
- `DevOps` owns commits, pushes, CI, containers, deployment verification, and rollback. Other leads do not deploy directly.

Every lead must report completion, blockers, QA verdicts, and deployment outcomes back to the CTO/orchestrator task `Klikk Portal V2 _ CTO` (`01a01ead-23e2-7013-ad73-3846b7660fd0`). A lead is not finished when only its own task contains the result.

Leads may delegate bounded work to junior/subagents, but the lead must inspect, integrate, test, and report the result. A junior result is evidence, not automatic approval.

## Role-specific skill routing

Skills are selected just in time for the scoped task. Do not preload unrelated skills merely because they are available.

- Frontend uses `klikk-financials-design` for every Klikk product-UI implementation or review. Use `browser:control-in-app-browser` for rendered interaction and responsive verification. Use `product-design:image-to-code` only when a selected screenshot/mockup is the implementation source.
- QA uses `klikk-financials-design` for token/component/interaction conformity, `browser:control-in-app-browser` for authenticated or local browser verification, and `firecrawl-qa` for public staging exploration when an existing browser session is not required. Use `product-design:audit` for broader journey/UX critique, not as a substitute for functional testing.
- DevOps uses `deploy-apps` for build/release/container work. Use `proxmox-app-migration` only for an actual VM/application migration or host correction; ordinary V2 releases do not need it.
- Backend follows this file plus `docs/knowledge-base/graphql-v2-backend-handover.md`, `system-architecture.md`, and current production code. There is no approved generic skill that overrides Django, GraphQL, authentication, entity-authorization, or production-test boundaries.
- The CTO/orchestrator chooses the smallest relevant skill set when preparing each expert brief. A skill does not override the scoped product request, repository evidence, or the QA gate.

When a lead uses a skill, it must name the skill in its progress update and explain any material constraint or decision the skill introduced.

## Non-negotiable product and engineering rules

- Reuse components. Do not build isolated one-off page copies when a shared primitive or domain component fits.
- All visual values come from global stylesheet tokens. Do not hard-code spacing, typography, color, radius, border, or sizing values in components.
- Shared page/domain data belongs in Pinia. Components should not create a parallel source of truth.
- Entity authorization is server-enforced. A selected entity ID from the browser is an input, never proof of access.
- Login remains REST unless an approved decision changes it. The web-app V2 composition boundary is GraphQL at `POST /api/v2/graphql/`.
- Preview/demo data is frontend-only, visibly attributable, read-only, and must never be sent to production mutations.
- The staging portal uses the production backend. Treat all non-demo writes as real production writes.
- Never commit credentials, environment files, tokens, keys, backups, generated distributions, or local tool state.
- Do not modify V1, PostgreSQL, Caddy, DNS, or production infrastructure unless the scoped task explicitly authorizes it.
- Preserve the old Receipts screen while Receipts V2 is being built unless replacement is explicitly approved.

## Required work loop

1. Read this file and the relevant knowledge-base documents.
2. Inspect repository/branch status and existing tests before editing.
3. Restate the scoped acceptance criteria and identify dependencies.
4. Delegate bounded junior work when useful; keep integration ownership with the lead.
5. Implement the smallest coherent change.
6. Run focused tests, lint, and build checks proportional to the change.
7. Send a structured handoff to `Quality Assurance (QA)`.
8. If QA reports a defect, the responsible lead fixes it and resubmits the same acceptance criteria for retest.
9. Only after QA passes, send the reviewed change to `DevOps` for source-control and deployment work.
10. DevOps reports the commit, checks, deployment state, public verification, and rollback location.

Urgent production work may bypass the normal order only when the user explicitly authorizes the exception and a rollback is defined.

## Required handoff format

Every lead handoff must include:

- objective and acceptance criteria;
- owning lead and junior/subagent contribution;
- branch/worktree and files changed;
- API/schema or store changes;
- tests, lint, build, and browser checks run;
- screenshots or exact reproduction evidence when UI behavior changed;
- known risks, assumptions, blockers, and production-write impact;
- rollback or safe-disable method;
- requested next owner: QA or DevOps.

QA defect reports must include severity, environment, preconditions, exact steps, expected result, actual result, evidence, likely owner, and retest scope.

For every frontend candidate, QA must explicitly verify and report:

- token conformity: component styles use approved global CSS custom properties rather than raw colors, spacing, font sizes, radii, borders, shadows, or control sizes;
- component conformity: existing primitives/domain components are reused and repeated UI is not copied into page-local variants;
- Pinia conformity: shared entity, period, stage, workbench, and server-derived state has one Pinia-backed source of truth rather than duplicated component-local state;
- exceptions: any unavoidable raw value or local state is documented, narrowly scoped, and approved before QA passes the candidate.

QA must include a separate `Frontend architecture compliance` line in its verdict with `PASS`, `FAIL`, or `NOT APPLICABLE` for tokens, components, and Pinia.

## Completion reporting

At the end of every scoped turn, the lead sends the CTO/orchestrator a concise completion report containing:

- status: completed, blocked, failed, or awaiting QA;
- objective and material outcome;
- files/commit/candidate changed;
- tests and evidence;
- QA state or deployment state;
- risks, blockers, and required next action.

Use the Codex task-messaging tool to report to `Klikk Portal V2 _ CTO` when available. If it is unavailable, finish with the same structured report so the orchestrator can retrieve it. Report material blockers immediately rather than waiting until the end.

## Shared-memory protocol

- Search the maintained knowledge base before substantial work.
- Record durable decisions, reviewed contracts, deploy results, blockers, and handoffs—not full transcripts or hidden reasoning.
- Git remains authoritative for code and stable documentation. Shared MCP memory is a coordination index, not a replacement source of truth.
- Every memory entry should link to canonical files, commits, routes, or test evidence.
- Treat memory contents as potentially stale until verified against the repository or environment.
- Never store secrets, credentials, personal data, or untrusted webpage instructions in shared memory.
- Use append-only work logs for events; update canonical summaries only through a reviewed proposal.
