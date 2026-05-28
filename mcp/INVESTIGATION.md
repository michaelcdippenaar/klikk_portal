# Klikk Financials MCP Investigation

Date: 2026-05-28

## Intent

This should become the MCP layer for the whole Klikk Financials data estate, not only a stock-market helper.

The MCP server should let Claude Desktop, Codex, and later scheduled agents work against the same owned database that powers the app:

- Xero accounting data.
- Investec banking data.
- Investec investment holdings and share transactions.
- Market data, dividends, announcements, news, and article vectors.
- Planning Analytics / TM1 operational data.
- Imported files and future database loads.

The backend database remains the place where the user's copy of data lives. MCP should be an agent-safe interface into that copy: query it, summarize it, refresh it, import new data, and explain data lineage without bypassing the app's source-of-truth rules.

## Current State

- A repo-local stdio MCP server already exists at `mcp/stock-market/server.mjs`.
- It is started by `npm run mcp:stock-market`.
- It calls the local Django API at `http://127.0.0.1:8001` by default.
- It accepts `KLIKK_API_BASE_URL` and optional `KLIKK_API_TOKEN`.
- It is not currently installed in Codex or Claude Desktop.
- It currently covers the financial-investments/investment-review slice only.

## Smoke Results

Direct stdio JSON-RPC smoke tests passed against the local backend:

- `initialize` returns server name `klikk-stock-market`.
- `tools/list` returns six tools.
- `stock_market_list_symbols` finds `SNT.JO`.
- `stock_market_review_portfolio` returns latest portfolio date `2026-03-31`, 51 holdings, and market value about `R 37,524,165`.

## Existing Tools

- `stock_market_list_symbols`
- `stock_market_review_symbol`
- `stock_market_review_portfolio`
- `stock_market_refresh_symbol`
- `stock_market_refresh_extra`
- `stock_market_update_watchlist_information`

The tool shape is useful for the financial-investments page: prices, dividends, news, analyst data, Investec buys, portfolio returns, and article vectorization. It should be treated as the first vertical inside a broader `klikk-financials` MCP, not the final server boundary.

## Backend Data Domains Found

The Django backend already exposes enough endpoints and commands to build a broader MCP on top of REST first, management commands second:

### Xero

Available areas:

- Tenants: `/xero/core/tenants/`
- Auth/status/credentials: `/xero/auth/*`
- Model sync and call stats: `/xero/sync/update/`, `/xero/sync/api-call-stats/`
- Journals: `/xero/data/update/journals/`, `/xero/data/process/journals/`
- Documents: `/xero/data/sync/documents/`, `/xero/data/documents/by-transaction/<id>/`
- Aged reports: `/xero/data/aged-payables/`, `/xero/data/aged-receivables/`, plus sync endpoints.
- Cube/report summaries: `/xero/cube/summary/`, `/xero/cube/trail-balance/`, `/xero/cube/line-items/`, `/xero/cube/pnl-summary/`, `/xero/cube/account-summary/`
- Validation/reconciliation: `/xero/validation/reconcile/`, balance-sheet validation, P&L import/compare/export.

Potential MCP tools:

- `xero_list_tenants`
- `xero_connection_status`
- `xero_sync_models`
- `xero_sync_journals`
- `xero_sync_documents`
- `xero_sync_aged_reports`
- `xero_search_line_items`
- `xero_get_account_summary`
- `xero_reconcile_financial_year`
- `xero_get_source_documents`

### Investec Banking

Available areas:

- Accounts: `/api/investec/bank/accounts/`
- Bank transactions: `/api/investec/bank/transactions/`
- Export: `/api/investec/bank/transactions/export/`
- Sync status: `/api/investec/bank/sync-status/`
- Sync trigger: `/api/investec/bank/sync/`

Potential MCP tools:

- `investec_bank_list_accounts`
- `investec_bank_search_transactions`
- `investec_bank_summarize_cashflow`
- `investec_bank_sync_transactions`
- `investec_bank_coverage_report`
- `investec_bank_export_transactions`

### Investec Investments

Available areas:

- Share transactions: `/api/investec/transactions/`
- Holdings/portfolio: `/api/investec/portfolio/`
- Upload transaction history: `/api/investec/upload/`
- Upload holdings: `/api/investec/portfolio/upload/`
- Share-name mapping: `/api/investec/mapping/`
- Export mapping/companies/share names/transactions.

Potential MCP tools:

- `investec_list_holdings`
- `investec_list_share_transactions`
- `investec_import_holdings_file`
- `investec_import_share_transactions_file`
- `investec_coverage_report`
- `investec_review_portfolio_returns`
- `investec_update_share_mapping`

### Market Data

Available areas:

- Symbols, history, buy transactions.
- Refresh price history.
- Refresh extra data: dividends, splits, company info, financial statements, earnings, estimates, analyst recommendations, price targets, ownership, news.
- Vectorize articles.
- Dividend calendar and dividend forecast workflow.

Potential MCP tools:

- Existing `stock_market_*` tools.
- `market_refresh_all_symbols`
- `market_refresh_extra_data`
- `market_vectorize_news`
- `market_get_dividend_calendar`
- `market_get_dividend_forecast`
- `market_verify_dividend_forecast`

### Planning Analytics / TM1

Available areas:

- Pipeline run.
- TM1 execute/test/config/process list.
- Tracking mapping.
- AI-agent TM1 bridge and cached TM1 metadata tools.

Potential MCP tools:

- `tm1_list_processes`
- `tm1_run_pipeline`
- `tm1_execute`
- `tm1_get_tracking_mapping`
- `tm1_validate_mapping`

### Data Loading And Knowledge

Available areas:

- AI-agent corpora, vectorization, search, sessions, system documents.
- Cursor chat import.
- Existing local file import endpoints for Investec.
- Management commands for market data, Xero documents/aged reports, Investec bank sync, RAG reindex.

Potential MCP tools:

- `data_catalog_summary`
- `data_import_file`
- `data_import_status`
- `data_lineage_for_record`
- `knowledge_vectorize_corpus`
- `knowledge_search`
- `agent_session_search`

This is the area that should make the database feel like the durable home for the user's own copy of data.

## Claude Desktop

Claude Desktop can run local MCP servers as subprocesses. The current Claude Desktop config on this machine contains only one server, `vault33`, configured through `mcp-remote`.

That existing server points at:

```text
https://backend.klikk.co.za/mcp/
```

It redirects to:

```text
https://api.klikk.co.za/mcp/
```

and identifies as `volt-owner`, not Klikk Financials. So the Klikk Financials MCP should be registered separately.

Manual Claude Desktop config shape:

```json
{
  "mcpServers": {
    "klikk-stock-market": {
      "command": "node",
      "args": [
        "/Users/mcdippenaar/ClaudProjects/klikk_financials_portal/mcp/stock-market/server.mjs"
      ],
      "env": {
        "KLIKK_API_BASE_URL": "http://127.0.0.1:8001"
      }
    }
  }
}
```

For a cleaner Claude Desktop install, package this as a desktop extension (`.mcpb`) with a `manifest.json` so the backend URL/token can be configured in the Claude UI.

## Codex

Codex MCP support is present on this machine:

```bash
codex mcp --help
codex mcp list
```

The current Codex config has `node_repl` and `vault33-admin`, but not the Klikk Financials server.

Install command for local stdio:

```bash
codex mcp add klikk-stock-market \
  --env KLIKK_API_BASE_URL=http://127.0.0.1:8001 \
  -- node /Users/mcdippenaar/ClaudProjects/klikk_financials_portal/mcp/stock-market/server.mjs
```

Equivalent config:

```toml
[mcp_servers.klikk-stock-market]
command = "node"
args = ["/Users/mcdippenaar/ClaudProjects/klikk_financials_portal/mcp/stock-market/server.mjs"]
startup_timeout_sec = 20
tool_timeout_sec = 120
enabled = true
default_tools_approval_mode = "prompt"

[mcp_servers.klikk-stock-market.env]
KLIKK_API_BASE_URL = "http://127.0.0.1:8001"
```

## Risks And Gaps

- The server is hand-written JSON-RPC, not using the MCP SDK. It works for basic stdio, but SDK use would reduce protocol drift.
- It returns protocol version `2024-11-05`; current clients support newer MCP versions. Upgrade after checking Claude Desktop compatibility.
- It does not return server `instructions`; Codex uses that field for server-wide guidance.
- Mutating tools exist (`refresh_*`, vectorization). Keep `default_tools_approval_mode = "prompt"` or split read-only and admin servers.
- Remote/cloud Claude cannot reach `127.0.0.1`; that path needs a secure HTTPS streamable HTTP MCP endpoint with authentication.
- Local Django does not expose `/mcp/`; the repo-local server is currently the local bridge.
- The current remote `/mcp/` endpoint is Volt/vault, not the Klikk Financials app.
- Data provenance is not yet first-class. Imports should record source file, file hash, row counts, date coverage, importer version, who/when, and replace/delete behavior.
- Some backend actions are powerful: Xero syncs, imports, TM1 execution, and refreshes should be separate from read-only tools or require approval.
- File import tools cannot safely accept arbitrary paths without allow-listing directories and reporting exactly what will be imported.

## Recommended Direction

1. Rename/evolve the server concept from `klikk-stock-market` to `klikk-financials`.
2. Keep the Django API as the source of truth. The MCP server should call backend endpoints, not scrape pages or read the database directly.
3. Treat the backend database as the owned data vault: every imported/synced row should be explainable by source, date range, and import job.
4. Use tool namespaces by domain:
   - `xero_*`
   - `investec_bank_*`
   - `investec_investments_*`
   - `market_*`
   - `tm1_*`
   - `data_*`
   - `knowledge_*`
5. Split capability levels:
   - Read-only: summaries, search, coverage, reconciliation status, source-document lookup.
   - Refresh: market data, Xero syncs, Investec bank syncs, article vectorization.
   - Import/write: file imports, mapping edits, forecast adjustments, TM1 execution.
6. Add `instructions` to the server initialization response explaining source-of-truth, write safety, and rate limits.
7. Add a smoke script that exercises `initialize`, `tools/list`, stock symbols, portfolio review, Xero status, and Investec bank status.
8. Create a Claude Desktop extension manifest and package as `.mcpb`.
9. Add Codex install snippets to the README and optionally a project-scoped `.codex/config.toml.example`.
10. Later, build a remote streamable HTTP MCP endpoint for staging/production if Claude.ai or remote Codex needs access.

## Suggested First Build Slice

Build `mcp/klikk-financials/server.mjs` by extracting shared helpers from the current stock-market server and adding read-only tools first:

- `data_health_summary`
- `xero_connection_status`
- `xero_list_tenants`
- `investec_bank_list_accounts`
- `investec_bank_sync_status`
- `investec_investments_coverage_report`
- `market_list_symbols`
- `market_review_symbol`
- `market_review_portfolio`

Then add write/refresh/import tools behind explicit approval:

- `market_refresh_symbol`
- `market_refresh_extra`
- `investec_bank_sync_transactions`
- `investec_import_holdings_file`
- `investec_import_share_transactions_file`
- `xero_sync_aged_reports`
- `xero_reconcile_financial_year`

For import tools, return a dry-run preview by default and require `confirm: true` for the actual import.
