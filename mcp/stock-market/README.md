# Klikk Financials MCP Server

This repo-local MCP server lets an agent review and update Klikk Financials data through the existing Klikk Django API.

It started as the stock-market MCP, but now also exposes read-only health/status tools for Xero and Investec banking. Market refresh tools still call the backend yfinance-backed endpoints so Claude or Codex can update stored market data without bypassing the app.

## Run

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

The server intentionally uses the existing backend as the single source of truth. It does not scrape broker pages or bypass the portal data model.
