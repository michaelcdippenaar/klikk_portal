# Klikk Financials knowledge base

This is the maintained product and engineering map for Klikk Financials. It describes the current portal and the backend version deployed on 20 August 2026, then separates that current state from the proposed architecture.

## Snapshot

- Portal: `/Users/mcdippenaar/ClaudProjects/klikk_financials_portal`, `main`, baseline `90365ff`.
- Backend production baseline: `origin/main` at `6914d5b` from `/Users/mcdippenaar/ClaudProjects/klikk_financials_v4`.
- Production: `https://console.8-bit.space`.
- Frontend: Vue 3, Pinia, Vue Router, Axios, TanStack Table, Reka UI and the Klikk Design Language.
- Backend: Django, Django REST Framework, PostgreSQL/pgvector, SimpleJWT, Xero, Investec, IBM Planning Analytics/TM1 and an AI-agent subsystem.
- The ordinary backend working copy was on the deleted `feat/report1-cashflow` branch and did not contain the live `audit`, `receipts`, `kb` or `pricelist` apps. Architecture work must start from current `origin/main`, not that stale branch.

## Documents

- [Product functionality](product-functionality.md) — what each part of the app does and whether it is operational, partial or planned.
- [System architecture](system-architecture.md) — runtime, data flows, integrations, authentication and deployment.
- [Code and product audit](code-product-audit.md) — strengths, risks, evidence limits and priorities.
- [Design language](design-language.md) — visual tokens, component rules and interaction principles.
- [Target architecture](target-architecture.md) — the proposed finance operating model, bounded modules and staged refactor.
- [Implementation status](implementation-status.md) — completed low-risk changes, verification and production boundaries.
- [Wireframe directions](wireframe-directions.md) — three grounded product-architecture concepts awaiting selection.
- [Team operating context](team-operating-context.md) — lead ownership, environments, delivery/QA gate, active V2 contracts and shared-memory protocol.

## Source-of-truth order

When documents disagree, use this order:

1. Current production code on backend `origin/main` and portal `main`.
2. Database migrations and model constraints.
3. API and component tests.
4. This knowledge base.
5. Older handover and feature-branch documents.

The source code still contains useful but stale prose. Notably, `docs/receipts.md` says the project-wide DRF default is `AllowAny`; production `origin/main` now defaults to `IsAuthenticated` after the 20 August security lockdown.

## Product north star

Klikk should become a financial operating system for one company context and one reporting period at a time:

`Connect sources → ingest and validate → reconcile and close → resolve exceptions → review and approve → produce reports and a frozen audit pack`

Connectors are infrastructure. The user-facing product should be organised around finance jobs, accountability, evidence and period readiness.
