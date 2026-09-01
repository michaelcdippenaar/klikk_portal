# Implementation status

Date: 20 August 2026

## Completed in the audit branch/workspaces

### Frontend

- Login now uses a plain Axios request with the configured API base URL. A normal 401 can no longer enter the authenticated refresh interceptor and become `No refresh token available`.
- Header navigation, operations drawer and command palette now consume one canonical registry at `src/app/navigation.js`.
- The registry covers every visible operations destination, including Audit, Receipts V2, Financial Investments, Planning Analytics and Pricing.
- Registry contract tests prove that destinations exist, IDs are unique and commands are executable.
- Overview now has a componentised Ingest V1 workspace backed by Pinia and global design tokens.
- Eight independent source jobs cover Xero, Investec bank, holdings, share transactions, WhatsApp, email, manual documents and Planning Analytics targets.
- Existing operational pages are reused for configured sources; unconfigured integrations do not expose fake actions.

Verification:

- 4 focused Vitest tests passed across navigation and authentication.
- The production Vite build passed; existing Sass-import and third-party pure-annotation warnings remain non-blocking.

### Backend login fix

A production-current worktree and branch were created so the fix is not based on the stale feature branch:

- path: `/Users/mcdippenaar/ClaudProjects/klikk_financials_v4_login_fix`;
- branch: `codex/fix-login-duplicate-email`;
- baseline: current `origin/main` at `6914d5b`.

The login endpoint now:

- prefers an exact username, including usernames containing `@`;
- treats historical duplicate email addresses as candidates instead of raising `MultipleObjectsReturned`;
- selects the account whose password matches;
- returns 409 with a username instruction only if more than one duplicate account shares the submitted password;
- continues to return 401 for invalid credentials and preserves inactive-user handling.

Five isolated Django API tests passed against SQLite with only the authentication apps loaded. The full project migration suite is PostgreSQL-specific and cannot run on SQLite because audit migrations create schemas explicitly.

## Deliberately not changed

- Production was not deployed or mutated.
- No user or service account was deleted.
- The Excel identity was not merged with the interactive account. Its separate token is currently a deliberate least-privilege and revocation boundary.
- The approved Overview direction and Ingest V1 have been implemented in the local preview; production has not been deployed or mutated.

## Next safe gates

1. Select one wireframe direction or request a combined revision.
2. Implement the selected shell/primary workflow against the existing KDL tokens.
3. Review the login diff, then deploy it only with explicit production approval.
