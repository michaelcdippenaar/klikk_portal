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

## Backend authentication (KLIKK_API_TOKEN)

There are **two different tokens** and they are not interchangeable. Swapping the values silently breaks backend writes (the MCP endpoint keeps answering, the pricelist mutations start returning 401).

| Variable | Direction | What it guards | Required? |
| --- | --- | --- | --- |
| `KLIKK_MCP_AUTH_TOKEN` | Inbound — clients send it to this server | `POST /mcp` on this server's own HTTP transport | Yes for HTTP transport (already set on the live container) |
| `KLIKK_API_TOKEN` | Outbound — this server sends it to Django | Pricelist write endpoints on the Klikk backend | Yes for pricelist writes (currently **not** set on the live container) |

The server only sends the outbound header when the variable is set: `requestHeaders()` in `server.mjs` adds `Authorization: Bearer ${apiToken}` when `KLIKK_API_TOKEN` is truthy, and every backend call goes through `apiRequest()`, which spreads those headers. No code change is needed — set the variable and the header appears.

### Which endpoints require it

On branch `feature/pricelist` the backend requires `Authorization: Bearer <KLIKK_API_TOKEN>` (matching the Django `KLIKK_API_TOKEN` setting) for:

```text
POST   /api/pricelist/items/
PATCH  /api/pricelist/items/<code>/
POST   /api/pricelist/items/<code>/prices/
```

Reads and `POST /api/pricelist/quote/` stay open. The rest of the backend is still unauthenticated — see `SECURITY-NOTE.md` in the backend repo root.

### Generate a token

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

Use the output as the value of `<token>` below. Do not commit it, and do not paste it into this repo.

### Where it lives on VM 133

Set the **same value** in both places:

- `.env` next to `/srv/klikk-financials/compose/docker-compose.yml` (alongside the existing `postgres.env`), `chmod 600`
- the Django service env file: `/srv/klikk-financials/compose/klikk_financials_v4/.env.app-docker`

If the two sides disagree, pricelist writes get 401.

### Recreate the live container

The live `klikk-financials-mcp` container is currently started by a bare `docker run`, not by compose. To add the outbound token, recreate it with the same flags plus `-e KLIKK_API_TOKEN`:

```bash
docker rm -f klikk-financials-mcp
docker run -d --name klikk-financials-mcp \
  --restart unless-stopped \
  -p 8787:8787 \
  -e KLIKK_MCP_TRANSPORT=http \
  -e KLIKK_MCP_HTTP_HOST=0.0.0.0 \
  -e KLIKK_MCP_HTTP_PORT=8787 \
  -e KLIKK_API_BASE_URL=http://192.168.1.133:8001 \
  -e KLIKK_MCP_AUTH_TOKEN=<inbound-token> \
  -e KLIKK_API_TOKEN=<outbound-token> \
  klikk-financials-mcp:latest
```

The repo `docker-compose.yml` now carries an equivalent `mcp` service as the documented target state for migrating off `docker run`.

### Verify

Call the `pricelist_upsert_item` MCP tool (with `confirm=true`) and confirm it no longer returns 401 from the backend.

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
- `xero_get_document`: find mirrored Xero source documents (invoice PDFs, receipts, bank-transaction attachments) by invoice number, amount, free text, or date range; returns a signed `view_url` per file. Read-only, served entirely from the local Postgres mirror — never calls the Xero API.
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
- `pricelist_list_items`: list Klikk's event-gear rate card (d&b / Pioneer / Epson hire kit) from `/api/pricelist/items/` — code, category, unit, current list price, optional customer-specific rate when `customer` is passed.
- `pricelist_get_price`: resolve one item's price for a date / customer / price type (LIST, TRADE, SPECIAL); reports `fallback_to_list` when no negotiated rate exists.
- `pricelist_price_history`: newest-first price history for one item (`valid_to` null = still current, `set_by` = who changed it).
- `pricelist_build_quote`: price a job from `lines [{code, qty, days}]` with optional customer / date / discount / VAT rate. Calculation only — nothing is persisted; `warnings` lists unknown or unpriced codes.
- `pricelist_set_price`: guarded mutating tool (`confirm=true`) that adds a price row effective from `valid_from` and closes the previous open row; recorded with `set_by=claude-mcp`.
- `pricelist_upsert_item`: guarded mutating tool (`confirm=true`) that creates a rate-card item or, with `replace=true`, updates an existing one.

Price-list notes: all prices are ex VAT in ZAR and returned as 2-decimal strings; the mutating tools require `confirm=true`; the price list is Klikk's own table and none of these tools ever read from or write to Xero.

The server intentionally uses the existing backend as the single source of truth. It does not scrape broker pages or bypass the portal data model.
