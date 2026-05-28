---
name: klikk-financials-deploy
description: Deploy, rebuild, and verify the Klikk Financials staging environment. Use when the user says "rebuild in staging", asks to deploy portal/backend changes, refresh staging after a push, verify console.8-bit.space, check staging data after imports, or coordinate Codex/Claude deployment handoffs for the Klikk portal and Django backend.
---

# Klikk Financials Deploy

## Quick Context

Use this skill for Klikk Financials staging deployments and post-deploy checks.

Key locations:

- Local portal repo: `/Users/mcdippenaar/ClaudProjects/klikk_financials_portal`
- Local backend repo: `/Users/mcdippenaar/ClaudProjects/klikk_financials_v4`
- Staging host: `mc@192.168.1.133`
- Staging compose dir: `/srv/klikk-financials/compose`
- Staging portal checkout: `/srv/klikk-financials/compose/klikk_portal`
- Staging backend checkout: `/srv/klikk-financials/compose/klikk_financials_v4`
- Frontend service: `klikk-financials-console`
- Backend service: `klikk-financials`
- Backend container name often shown by Docker: `klikk-financials-v4`
- Public console: `https://console.8-bit.space`

## Before Deploy

Check local git state first:

```bash
git -C /Users/mcdippenaar/ClaudProjects/klikk_financials_portal status --short --branch
git -C /Users/mcdippenaar/ClaudProjects/klikk_financials_v4 status --short --branch
```

If there are uncommitted changes, do not discard them. Commit/push only the changes the user asked to ship.

Current branch conventions:

- Portal staging branch: `feat/headless-migration`
- Backend staging branch: usually `main`

## Deploy Portal

Use this when portal UI, MCP scaffolding under the portal repo, frontend routes, Dockerfile, or report page changes have been pushed.

```bash
ssh mc@192.168.1.133 'cd /srv/klikk-financials/compose/klikk_portal && git fetch origin && git checkout feat/headless-migration && git pull --ff-only origin feat/headless-migration'
ssh mc@192.168.1.133 'cd /srv/klikk-financials/compose && docker compose build --no-cache klikk-financials-console && docker compose up -d klikk-financials-console'
```

The portal Dockerfile should build with Vite:

- `RUN npm run build`
- `COPY --from=builder /app/dist /usr/share/nginx/html`

If it refers to Quasar or `/app/dist/spa`, fix the Dockerfile before rebuilding.

## Deploy Backend

Use this when backend Django/API/MCP/data import code has been pushed.

```bash
ssh mc@192.168.1.133 'cd /srv/klikk-financials/compose/klikk_financials_v4 && git fetch origin && git checkout main && git pull --ff-only origin main'
ssh mc@192.168.1.133 'cd /srv/klikk-financials/compose && docker compose build klikk-financials && docker compose up -d klikk-financials'
ssh mc@192.168.1.133 'cd /srv/klikk-financials/compose && docker compose exec -T klikk-financials python manage.py migrate'
```

Prefer non-destructive migrations and idempotent management commands. Do not restore local database dumps over staging unless the user explicitly asks.

## Verify

Run these checks after every rebuild:

```bash
curl -I https://console.8-bit.space/app/reporting
curl -I https://console.8-bit.space/app/pipeline/processes
curl -sS https://console.8-bit.space/backend/api/financial-investments/symbols/ | head
ssh mc@192.168.1.133 'cd /srv/klikk-financials/compose && docker compose ps'
```

For backend logs:

```bash
ssh mc@192.168.1.133 'cd /srv/klikk-financials/compose && docker compose logs --tail=80 klikk-financials'
```

For frontend logs:

```bash
ssh mc@192.168.1.133 'cd /srv/klikk-financials/compose && docker compose logs --tail=80 klikk-financials-console'
```

## Data Checks

When the user says staging is missing development data, compare counts before assuming a code issue:

```bash
ssh mc@192.168.1.133 'cd /srv/klikk-financials/compose && docker compose exec -T klikk-financials python manage.py shell < /tmp/klikk_db_counts.py'
```

Important staging data families:

- Xero tenants and synced Xero report data
- Investec bank accounts and bank transactions
- Investec JSE holdings, share transactions, and share name mappings
- Financial investment symbols, prices, dividends, dividend calendar, news, and symbol info

Market data is populated from yfinance via backend management commands. Prefer `import_yfinance_tickers` with the mapping workbook because it respects the `yfinance_Ticker` column for US shares and skips blank/cash rows better than blindly appending `.JO`.

## Report Back

Summarize exactly what was deployed and verified:

- Local branch/commit pushed
- Staging branch/commit pulled
- Services rebuilt/restarted
- Smoke URLs checked
- Any data imports or refreshes run
- Any known warnings, especially yfinance missing data for delisted JSE symbols
