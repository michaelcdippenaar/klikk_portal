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

- `list_audit_findings`: list the audit findings register (ref, severity, status, category, owner, 2-decimal-string amount, check_code) filtered by fy / status / severity / category / owner / check_code / free-text `q`; totals cover the whole filter, not just the page.
- `get_audit_finding`: one finding by id with its full detail, comment thread, attachments and resolved evidence links (`links` capped at 200 with `link_count` / `links_truncated`).
- `add_audit_finding`: guarded mutating tool (`confirm=true`) that raises a new finding; the backend allocates the permanent `FY26-013`-style ref and `fy` defaults to the current FY.
- `update_audit_finding`: guarded mutating tool (`confirm=true`) that patches status / owner / due_date / amount / severity / category; a `note` is recorded as a comment, not a field change, and `fy` / `ref` are immutable.
- `comment_audit_finding`: guarded mutating tool (`confirm=true`) that appends a comment to a finding's thread.
- `audit_findings_summary`: per-FY aggregates of the findings register — count, open count, total amount, and by-severity / by-status / by-category / by-owner breakdowns.
- `list_audit_finding_attachments`: list one finding's uploaded attachments — filename, content type, size, note, uploader, signed `view_url`.
- `get_audit_finding_cube`: run the cube view saved on a finding and return the live cross-tab; `has_cube: false` when none is saved (a normal state, not an error).
- `set_audit_finding_cube`: guarded mutating tool (`confirm=true`) that saves/replaces a finding's cube view; the `{spec, query}` is built with the same rules as `preview_cube` / `save_cube_view`, so it stays byte-compatible with the Excel add-in.
- `link_audit_finding`: guarded mutating tool (`confirm=true`) that links evidence to a finding by reference — kind `slip` / `xero_document` / `bank_transaction` / `journal` / `invoice` / `asana`. `journal` and `invoice` refs are tenant-qualified `<tenant_uuid>:<number>` (Klikk `41ebfa0e-012e-4ff1-82ba-a9a7585c536c`, Tremly `0415e61e-f78c-4216-ac54-7933a6f63a5d`, Dippenaar Family `27806be4-62dd-4c50-9eb9-c8b79231f6a1`); a bare number is canonicalised to the KLIKK tenant, which is the wrong record for a Tremly / Dippenaar document — 31,071 journal numbers and 448 invoice numbers exist in more than one organisation. Duplicate links are idempotent (`created: false`).
- `unlink_audit_finding`: guarded mutating tool (`confirm=true`) that removes one evidence link by `link_id`; the finding and the referenced record are untouched.
- `audit_finding_graph`: the findings-evidence graph (nodes + edges). With `node_type`/`node_id` (supplied together) it traverses BOTH directions from that node — "which findings cite this slip" — and spans ALL financial years when `fy` is omitted; `depth` is capped at 2 and the edge list at 500 (`truncated: true`).

Audit-findings notes: the findings register is Klikk's own Postgres table served by the Django backend at `/audit/findings/` — Klikk FY N runs 1 Jul (N-1) – 30 Jun N (FY2026 = 2025-07-01..2026-06-30); amounts are 2-decimal strings and must be passed through verbatim; the mutating tools require `confirm=true`; none of these tools ever read from or write to Xero.

There is deliberately NO attachment-upload MCP tool: an agent has no local file to upload — it has references, and references are links (`link_audit_finding`, kind `xero_document` / `slip` / `bank_transaction` / ...). Uploads are a human action through the console (or a direct multipart POST with the service token). Do not add one.

The server intentionally uses the existing backend as the single source of truth. It does not scrape broker pages or bypass the portal data model.
