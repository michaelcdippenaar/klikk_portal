# Klikk Financials MCP Server

This repo-local MCP server lets an agent review and update Klikk Financials data through the existing Klikk Django API.

It started as the stock-market MCP, but now also exposes read-only health/status tools for Xero and Investec banking. Market refresh tools still call the backend yfinance-backed endpoints so Claude or Codex can update stored market data without bypassing the app.

## Run

Local stdio transport for Claude Desktop/Codex:

```bash
npm run mcp:financials
```

By default it talks to:

```text
http://127.0.0.1:8001
```

Override the backend or pass a bearer token if needed:

```bash
KLIKK_API_BASE_URL=http://127.0.0.1:8001 KLIKK_API_TOKEN=<token> npm run mcp:financials
```

Authenticated HTTP transport for remote/weekend access:

```bash
KLIKK_MCP_TRANSPORT=http \
KLIKK_MCP_HTTP_HOST=0.0.0.0 \
KLIKK_MCP_HTTP_PORT=8787 \
KLIKK_MCP_AUTH_TOKEN=<long-random-token> \
KLIKK_API_BASE_URL=https://console.8-bit.space/backend \
node mcp/stock-market/server.mjs
```

The HTTP endpoint is:

```text
POST /mcp
Authorization: Bearer <long-random-token>
```

Health check:

```text
GET /health
```

The server refuses to start HTTP transport without `KLIKK_MCP_AUTH_TOKEN` unless `KLIKK_MCP_ALLOW_UNAUTHENTICATED_HTTP=true` is set for local testing. Do not expose an unauthenticated financial MCP endpoint.

Docker image for staging:

```bash
docker build -f Dockerfile.mcp -t klikk-financials-mcp .
docker run --rm -p 8787:8787 \
  -e KLIKK_MCP_AUTH_TOKEN=<long-random-token> \
  -e KLIKK_API_BASE_URL=https://console.8-bit.space/backend \
  klikk-financials-mcp
```

## Codex or Claude MCP Config

```json
{
  "mcpServers": {
    "klikk-financials": {
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

## Tools

- `data_health_summary`: summarize Xero, Investec banking, Investec investments, and market-data availability.
- `xero_connection_status`: read Xero tenant/token/credential state.
- `xero_list_tenants`: list Xero tenants copied into the backend.
- `investec_bank_sync_status`: read the latest Investec bank sync timestamp.
- `investec_bank_list_accounts`: list Investec bank accounts copied into the backend.
- `investec_bank_search_transactions`: search copied Investec bank transactions by description, amount, date range, and account.
- `xero_search_journals`: search Xero journal lines to see which account/contact/tracking a receipt, payment, invoice, overpayment, or manual journal was posted to.
- `stock_market_list_symbols`: list tracked stocks from `/api/financial-investments/symbols/`.
- `market_list_symbols`: alias for stock-market symbol listing.
- `stock_market_review_symbol`: review one stock using price history, dividends, news, analyst data, and Investec buy transactions.
- `market_review_symbol`: alias for symbol review.
- `stock_market_review_portfolio`: review the latest Investec portfolio with normalized market values, income, ROI, and concentration.
- `market_review_portfolio`: alias for portfolio review.
- `stock_market_refresh_symbol`: refresh stored price history for one stock.
- `market_refresh_symbol`: alias for yfinance-backed price refresh.
- `stock_market_refresh_extra`: refresh dividends, splits, company info, financials, earnings, analyst data, ownership, news, and optionally vectorize articles.
- `market_refresh_extra`: alias for extra-data refresh.
- `stock_market_update_watchlist_information`: refresh and review multiple symbols in one agent call.
- `market_update_symbols`: alias for multi-symbol market refresh/review.
- `market_list_dividend_calendar`: list declared/paid dividend calendar entries with DPS, prior-year DPS, status, and TM1 fields.
- `market_check_declared_dividends`: guarded mutating tool that checks yfinance for newly declared dividends across held shares and saves new calendar entries.

The server intentionally uses the existing backend as the single source of truth. It does not scrape broker pages or bypass the portal data model.
