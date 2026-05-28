# Klikk Stock Market MCP Server

This repo-local MCP server lets an agent review and update stock market information through the existing Klikk Django API.

## Run

```bash
npm run mcp:stock-market
```

By default it talks to:

```text
http://127.0.0.1:8001
```

Override the backend or pass a bearer token if needed:

```bash
KLIKK_API_BASE_URL=http://127.0.0.1:8001 KLIKK_API_TOKEN=<token> npm run mcp:stock-market
```

## Codex or Claude MCP Config

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

## Tools

- `stock_market_list_symbols`: list tracked stocks from `/api/financial-investments/symbols/`.
- `stock_market_review_symbol`: review one stock using price history, dividends, news, analyst data, and Investec buy transactions.
- `stock_market_review_portfolio`: review the latest Investec portfolio with normalized market values, income, ROI, and concentration.
- `stock_market_refresh_symbol`: refresh stored price history for one stock.
- `stock_market_refresh_extra`: refresh dividends, splits, company info, financials, earnings, analyst data, ownership, news, and optionally vectorize articles.
- `stock_market_update_watchlist_information`: refresh and review multiple symbols in one agent call.

The server intentionally uses the existing backend as the single source of truth. It does not scrape broker pages or bypass the portal data model.
