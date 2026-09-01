#!/usr/bin/env node

import readline from 'node:readline';
import crypto from 'node:crypto';
import { createServer } from 'node:http';
import { stdin as input, stdout as output } from 'node:process';

const SERVER_NAME = 'klikk-financials';
const SERVER_VERSION = '0.9.0';
const PROTOCOL_VERSION = '2025-06-18';
const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8001';
const SERVER_INSTRUCTIONS = [
  'Use this server as the agent interface to the user-owned Klikk Financials database.',
  'The Django API remains the source of truth; do not scrape the web app or bypass import/sync endpoints.',
  'Read-only review tools are safe to call for analysis.',
  'Refresh/import/vectorization tools mutate local data copied from Xero, Investec, yfinance, and related sources; ask for confirmation before running them unless the user explicitly requested an update.',
  'When giving financial analysis, distinguish market price, market value, cost, income, and ROI.',
  'Year-end audit: when MC says "audit for financial year end", "run the year-end audit" or "check the books", call run_yearend_audit(fy) and reason over the findings; list_audit_checks / run_audit_check / audit_history / add_audit_check manage the registry. These never write to Xero.',
  'Equipment price list: pricelist_list_items / pricelist_get_price / pricelist_price_history read Klikk\'s event-gear rate card (ex VAT, ZAR); pricelist_build_quote prices a job without persisting anything; pricelist_set_price and pricelist_upsert_item mutate the local price list and require confirm=true. Never writes to Xero.',
  'Books knowledge base: the kb_* tools are the allocation doctrine for Klikk\'s Xero books — kb_search / kb_read_document serve the doctrine docs (processing rules, transaction flows, chart-of-accounts taxonomy), kb_lookup_supplier / kb_lookup_customer / kb_lookup_account / kb_list_tracking give expected codings with rule strength, and kb_list_events is the gig register: pass the transaction date (on=YYYY-MM-DD) and if it falls in an event window the spend is an EVENT cost, not personal. Consult these BEFORE proposing any transaction allocation or audit verdict. All read-only; never touches Xero.',
  'Excel cube comments: MC pins notes to figures in his Excel cube/PivotTable sheets, and list_cube_comments is that human->agent to-do queue -- check it when MC says "what did I flag", "my Excel comments" or "what needs looking at"; get_comment_transactions drills one comment down to the journal lines that make its number up, and set_cube_comment_status closes it off. Comments can carry TAGS relating them to a workstream -- tag what you write and pull your own queue back with list_cube_comments(tag=\"audit\") instead of reading the whole register -- and an @mention in the text emails that person, so always report an unresolved or failed mention rather than assuming they were told. Never writes to Xero.',
  'WhatsApp slips (receipts): slips_list / slips_get read the Slippies register — the receipt images MC WhatsApps in, OCR\'d and matched against Xero journals. slips_list filters by supplier/date/status/category and returns whole-filter totals; slips_get drills one slip to its full OCR, line items, matched journal and review comments; slips_file returns the actual receipt image/PDF so you can read it directly. Archived slips are hidden unless archived="all" or "true". Read-only; never touches Xero.',
  'WhatsApp messages: whatsapp_list_chats / whatsapp_search_messages / whatsapp_message_context / whatsapp_get_attachment read MC\'s WhatsApp mirror (synced daily 06:00 SAST). Search by chat, text, sender or date; drill a hit to its surrounding conversation; fetch an attachment\'s actual file. This is personal correspondence — read it only to answer what MC asked, and never quote beyond what the task needs. Strictly read-only: there is deliberately NO send tool here.',
  'THE ONE XERO WRITE: xero_create_draft_invoice creates a single DRAFT invoice (sits in Xero\'s Drafts queue until a human approves it there — it touches no ledger). Call it ONLY when MC has explicitly instructed that specific invoice in the current conversation, pass his instruction verbatim in `instruction`, and never call it speculatively, in bulk, or to "fix" the books. Every call is pre-logged to audit.xero_writes with a reversal hint. Contacts are never auto-created and account codes must exist in the chart. Everything else on this server remains read-only toward Xero.',
].join(' ');
const DEFAULT_EXTRA_TYPES = [
  'dividends',
  'splits',
  'company_info',
  'financial_statements',
  'earnings',
  'earnings_estimate',
  'analyst_recommendations',
  'analyst_price_target',
  'ownership',
  'news',
];

const apiBaseUrl = (process.env.KLIKK_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
const apiToken = process.env.KLIKK_API_TOKEN || '';
const transport = (process.env.KLIKK_MCP_TRANSPORT || 'stdio').toLowerCase();
const httpHost = process.env.KLIKK_MCP_HTTP_HOST || '127.0.0.1';
const httpPort = Number(process.env.KLIKK_MCP_HTTP_PORT || 8787);
const httpAuthToken = process.env.KLIKK_MCP_AUTH_TOKEN || '';
const allowUnauthenticatedHttp = process.env.KLIKK_MCP_ALLOW_UNAUTHENTICATED_HTTP === 'true';

// OAuth 2.1 layer for claude.ai / Cowork custom connectors. claude.ai's
// connector dialog only speaks OAuth (dynamic client registration + PKCE) and
// has no field for a static token, so alongside the static KLIKK_MCP_AUTH_TOKEN
// this server can act as its own authorization server — same pattern as the
// Hydrawise and vault33 connectors on this edge. All three env vars must be set
// for the OAuth endpoints to exist; without them behaviour is unchanged.
//   KLIKK_MCP_PUBLIC_URL      e.g. https://console.8-bit.space (no trailing /)
//   KLIKK_MCP_OAUTH_PASSWORD  the one shared password gating /mcp/authorize
//   KLIKK_MCP_JWT_SECRET      >=32 chars, signs issued access/refresh tokens
const oauthPublicUrl = (process.env.KLIKK_MCP_PUBLIC_URL || '').replace(/\/+$/, '');
const oauthPassword = process.env.KLIKK_MCP_OAUTH_PASSWORD || '';
const oauthJwtSecret = process.env.KLIKK_MCP_JWT_SECRET || '';
const oauthEnabled = Boolean(oauthPublicUrl && oauthPassword && oauthJwtSecret);
const OAUTH_ACCESS_TTL = 3600 * 12; // 12h; claude.ai refreshes silently via the refresh token
const OAUTH_REFRESH_TTL = 3600 * 24 * 90;

const tools = [
  {
    name: 'data_health_summary',
    description: 'Summarize available Klikk Financials data domains: Xero, Investec banking, Investec investments, and market symbols.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'xero_connection_status',
    description: 'Read Xero connection status, tenants, token expiry state, and credential presence.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'xero_list_tenants',
    description: 'List Xero tenants known to the Klikk backend.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'investec_jse_list_holdings',
    description: 'List Investec JSE investment portfolio holdings (share positions) copied into the Klikk database. Read-only. Defaults to the latest available snapshot; pass date=YYYY-MM-DD for a specific month-end.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Optional YYYY-MM-DD portfolio snapshot date.' },
        limit: { type: 'number', description: 'Max rows.', default: 100 },
        offset: { type: 'number', description: 'Pagination offset.', default: 0 },
      },
    },
  },
  {
    name: 'investec_jse_list_transactions',
    description: 'List Investec JSE share transactions (Buy/Sell/Dividend etc.) copied into the Klikk database. Read-only. Filter by account number, share name, or type.',
    inputSchema: {
      type: 'object',
      properties: {
        account_number: { type: 'string', description: 'Filter by Investec account number.' },
        share_name: { type: 'string', description: 'Filter by share name (contains match).' },
        type: { type: 'string', description: 'Filter by transaction type (Buy, Sell, Dividend, etc.).' },
        include_ttm_summary: { type: 'boolean', description: 'Include synthetic TTM-summary rows (default false).', default: false },
        limit: { type: 'number', description: 'Max rows.', default: 100 },
        offset: { type: 'number', description: 'Pagination offset.', default: 0 },
      },
    },
  },
  {
    name: 'investec_jse_upload_holdings',
    description: 'Mutating tool: import an Investec JSE portfolio HOLDINGS export (.xlsx/.xls) into the Klikk database. The month/year is read from the file and ALL holdings for that month are REPLACED (one version per month). Pass the file as base64. Requires confirm=true.',
    inputSchema: {
      type: 'object',
      properties: {
        file_base64: { type: 'string', description: 'Base64-encoded .xlsx/.xls holdings export.' },
        filename: { type: 'string', description: 'Original filename; must end in .xlsx or .xls.' },
        confirm: { type: 'boolean', description: 'Must be true — writes/overwrites local holdings for the file’s month.' },
      },
      required: ['file_base64', 'filename', 'confirm'],
    },
  },
  {
    name: 'investec_jse_upload_transactions',
    description: 'Mutating tool: import an Investec JSE share TRANSACTION-history export (.xlsx/.xls) into the Klikk database. Pass the file as base64. Requires confirm=true.',
    inputSchema: {
      type: 'object',
      properties: {
        file_base64: { type: 'string', description: 'Base64-encoded .xlsx/.xls transaction-history export.' },
        filename: { type: 'string', description: 'Original filename; must end in .xlsx or .xls.' },
        confirm: { type: 'boolean', description: 'Must be true — writes local transaction rows.' },
      },
      required: ['file_base64', 'filename', 'confirm'],
    },
  },
  {
    name: 'investec_bank_sync_status',
    description: 'Read the latest Investec banking sync timestamp/status.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'investec_bank_sync',
    description: 'Mutating tool: pull Investec bank accounts and transactions LIVE from the Investec Open API into the Klikk database. Incremental from the last sync date to today (or the last 180 days if never synced); idempotent. Requires confirm=true.',
    inputSchema: {
      type: 'object',
      properties: {
        confirm: {
          type: 'boolean',
          description: 'Must be true — this calls the live Investec Open API and writes local bank rows.',
        },
      },
      required: ['confirm'],
    },
  },
  {
    name: 'investec_bank_list_accounts',
    description: 'List Investec bank accounts copied into the Klikk database.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum accounts to return.',
          default: 100,
        },
      },
    },
  },
  {
    name: 'investec_bank_list_beneficiaries',
    description: 'List Investec payment beneficiaries copied into the Klikk database (name, bank, account number, branch code, last payment amount/date). Read-only. Beneficiaries are created in Investec Online; run investec_bank_sync_beneficiaries first if the copy is stale or empty.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Filter by name, beneficiary name, bank, account number, or reference fragment.',
        },
        active: {
          type: 'boolean',
          description: 'true = only beneficiaries currently on the Investec profile; false = only ones no longer returned by the API. Omit for all.',
        },
        limit: {
          type: 'number',
          description: 'Maximum rows to return.',
          default: 200,
        },
        offset: {
          type: 'number',
          description: 'Pagination offset.',
          default: 0,
        },
      },
    },
  },
  {
    name: 'investec_bank_sync_beneficiaries',
    description: 'Mutating tool: pull the Investec beneficiary list LIVE from the Investec Open API into the Klikk database (read-only against Investec — never creates or pays beneficiaries). Idempotent upsert; rows no longer on the profile are marked inactive. Requires confirm=true.',
    inputSchema: {
      type: 'object',
      properties: {
        confirm: {
          type: 'boolean',
          description: 'Must be true — this calls the live Investec Open API and writes local beneficiary rows.',
        },
      },
      required: ['confirm'],
    },
  },
  {
    name: 'investec_bank_search_transactions',
    description: 'Search Investec bank transactions across all copied accounts by description, exact amount, date range, and account number.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Description text to search for, such as LUAN SWART or 18 Dr Malan.',
        },
        amount: {
          type: 'string',
          description: 'Exact transaction amount, e.g. 2136.51.',
        },
        date_from: {
          type: 'string',
          description: 'Optional YYYY-MM-DD start date.',
        },
        date_to: {
          type: 'string',
          description: 'Optional YYYY-MM-DD end date.',
        },
        account: {
          type: 'string',
          description: 'Optional Investec account number or API account id. Comma-separated values are allowed.',
        },
        limit: {
          type: 'number',
          description: 'Maximum rows to return.',
          default: 100,
        },
        offset: {
          type: 'number',
          description: 'Pagination offset.',
          default: 0,
        },
      },
    },
  },
  {
    name: 'xero_search_journals',
    description: 'Search Xero journal lines to see what account/contact/tracking a receipt, payment, invoice, overpayment, or manual journal was posted to.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Text search across description, reference, contact, account code/name, and tenant.',
        },
        amount: {
          type: 'string',
          description: 'Exact amount; matches signed amount, debit, and credit.',
        },
        date_from: {
          type: 'string',
          description: 'Optional YYYY-MM-DD start date.',
        },
        date_to: {
          type: 'string',
          description: 'Optional YYYY-MM-DD end date.',
        },
        tenant: {
          type: 'string',
          description: 'Optional tenant id or tenant name fragment.',
        },
        account: {
          type: 'string',
          description: 'Optional Xero account code or name fragment.',
        },
        contact: {
          type: 'string',
          description: 'Optional Xero contact name fragment.',
        },
        reference: {
          type: 'string',
          description: 'Optional reference fragment.',
        },
        description: {
          type: 'string',
          description: 'Optional description fragment.',
        },
        limit: {
          type: 'number',
          description: 'Maximum rows to return.',
          default: 100,
        },
        offset: {
          type: 'number',
          description: 'Pagination offset.',
          default: 0,
        },
      },
    },
  },
  {
    name: 'stock_market_list_symbols',
    description: 'List tracked financial investment symbols from the Klikk portal.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Optional symbol, share code, or company text filter.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of symbols to return.',
          default: 100,
        },
      },
    },
  },
  {
    name: 'market_list_symbols',
    description: 'Alias for stock_market_list_symbols. List tracked financial investment symbols from the Klikk portal.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Optional symbol, share code, or company text filter.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of symbols to return.',
          default: 100,
        },
      },
    },
  },
  {
    name: 'stock_market_review_symbol',
    description: 'Review one tracked stock using prices, dividends, news, analyst data, and Investec buys.',
    inputSchema: {
      type: 'object',
      required: ['symbol'],
      properties: {
        symbol: {
          type: 'string',
          description: 'Tracked symbol such as SNT.JO or share code such as SNT.',
        },
        days: {
          type: 'number',
          description: 'Number of recent calendar days of price history to review.',
          default: 365,
        },
        news_limit: {
          type: 'number',
          description: 'Maximum news rows to include.',
          default: 10,
        },
      },
    },
  },
  {
    name: 'market_review_symbol',
    description: 'Alias for stock_market_review_symbol. Review one tracked stock using prices, dividends, news, analyst data, and Investec buys.',
    inputSchema: {
      type: 'object',
      required: ['symbol'],
      properties: {
        symbol: {
          type: 'string',
          description: 'Tracked symbol such as SNT.JO or share code such as SNT.',
        },
        days: {
          type: 'number',
          description: 'Number of recent calendar days of price history to review.',
          default: 365,
        },
        news_limit: {
          type: 'number',
          description: 'Maximum news rows to include.',
          default: 10,
        },
      },
    },
  },
  {
    name: 'stock_market_review_portfolio',
    description: 'Review latest Investec portfolio holdings, normalized market values, income, ROI, and concentration.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum Investec portfolio rows to fetch before selecting the latest date.',
          default: 1000,
        },
        top: {
          type: 'number',
          description: 'Number of largest holdings and weakest holdings to return.',
          default: 10,
        },
      },
    },
  },
  {
    name: 'market_review_portfolio',
    description: 'Alias for stock_market_review_portfolio. Review latest Investec portfolio holdings, market values, income, ROI, and concentration.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum Investec portfolio rows to fetch before selecting the latest date.',
          default: 1000,
        },
        top: {
          type: 'number',
          description: 'Number of largest holdings and weakest holdings to return.',
          default: 10,
        },
      },
    },
  },
  {
    name: 'stock_market_refresh_symbol',
    description: 'Refresh stored price history for one tracked symbol through the Klikk backend.',
    inputSchema: {
      type: 'object',
      required: ['symbol'],
      properties: {
        symbol: {
          type: 'string',
          description: 'Tracked symbol such as SNT.JO or share code such as SNT.',
        },
        start_date: {
          type: 'string',
          description: 'Optional YYYY-MM-DD start date.',
        },
        end_date: {
          type: 'string',
          description: 'Optional YYYY-MM-DD end date.',
        },
      },
    },
  },
  {
    name: 'market_refresh_symbol',
    description: 'Alias for stock_market_refresh_symbol. Refresh yfinance-backed stored price history for one tracked symbol through the Klikk backend.',
    inputSchema: {
      type: 'object',
      required: ['symbol'],
      properties: {
        symbol: {
          type: 'string',
          description: 'Tracked symbol such as SNT.JO or share code such as SNT.',
        },
        start_date: {
          type: 'string',
          description: 'Optional YYYY-MM-DD start date.',
        },
        end_date: {
          type: 'string',
          description: 'Optional YYYY-MM-DD end date.',
        },
      },
    },
  },
  {
    name: 'stock_market_refresh_extra',
    description: 'Refresh dividends, financials, earnings, analyst, ownership, news, and optionally vectorize articles.',
    inputSchema: {
      type: 'object',
      required: ['symbol'],
      properties: {
        symbol: {
          type: 'string',
          description: 'Tracked symbol such as SNT.JO or share code such as SNT.',
        },
        types: {
          type: 'array',
          items: { type: 'string' },
          description: `Optional extra-data types. Defaults to ${DEFAULT_EXTRA_TYPES.join(', ')}.`,
        },
        vectorize_articles: {
          type: 'boolean',
          description: 'When true, call the article vectorization endpoint after refreshing extras.',
          default: false,
        },
        article_limit: {
          type: 'number',
          description: 'Maximum articles to vectorize.',
          default: 30,
        },
      },
    },
  },
  {
    name: 'market_refresh_extra',
    description: 'Alias for stock_market_refresh_extra. Refresh dividends, financials, earnings, analyst, ownership, news, and optionally vectorize articles.',
    inputSchema: {
      type: 'object',
      required: ['symbol'],
      properties: {
        symbol: {
          type: 'string',
          description: 'Tracked symbol such as SNT.JO or share code such as SNT.',
        },
        types: {
          type: 'array',
          items: { type: 'string' },
          description: `Optional extra-data types. Defaults to ${DEFAULT_EXTRA_TYPES.join(', ')}.`,
        },
        vectorize_articles: {
          type: 'boolean',
          description: 'When true, call the article vectorization endpoint after refreshing extras.',
          default: false,
        },
        article_limit: {
          type: 'number',
          description: 'Maximum articles to vectorize.',
          default: 30,
        },
      },
    },
  },
  {
    name: 'stock_market_update_watchlist_information',
    description: 'Refresh and review multiple symbols so an agent can keep market information current.',
    inputSchema: {
      type: 'object',
      required: ['symbols'],
      properties: {
        symbols: {
          type: 'array',
          items: { type: 'string' },
          description: 'Symbols or share codes to update.',
        },
        refresh_prices: {
          type: 'boolean',
          default: true,
        },
        refresh_extra: {
          type: 'boolean',
          default: true,
        },
        extra_types: {
          type: 'array',
          items: { type: 'string' },
        },
        vectorize_articles: {
          type: 'boolean',
          default: false,
        },
        news_limit: {
          type: 'number',
          default: 5,
        },
      },
    },
  },
  {
    name: 'market_update_symbols',
    description: 'Alias for stock_market_update_watchlist_information. Refresh and review multiple symbols so an agent can keep yfinance-backed market data current.',
    inputSchema: {
      type: 'object',
      required: ['symbols'],
      properties: {
        symbols: {
          type: 'array',
          items: { type: 'string' },
          description: 'Symbols or share codes to update.',
        },
        refresh_prices: {
          type: 'boolean',
          default: true,
        },
        refresh_extra: {
          type: 'boolean',
          default: true,
        },
        extra_types: {
          type: 'array',
          items: { type: 'string' },
        },
        vectorize_articles: {
          type: 'boolean',
          default: false,
        },
        news_limit: {
          type: 'number',
          default: 5,
        },
      },
    },
  },
  {
    name: 'market_list_dividend_calendar',
    description: 'List declared/paid dividend calendar entries copied into Klikk Financials, including DPS, prior-year DPS, status, and TM1 workflow fields.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Optional symbol filter such as SNT.JO.',
        },
        share_code: {
          type: 'string',
          description: 'Optional Investec share code filter such as SNT.',
        },
        status: {
          type: 'string',
          description: 'Optional calendar status filter supported by the backend.',
        },
        dividend_category: {
          type: 'string',
          description: 'Optional category filter: regular, special, or foreign.',
        },
        pending_tm1: {
          type: 'boolean',
          description: 'When true, return entries not yet written to TM1.',
          default: false,
        },
        limit: {
          type: 'number',
          description: 'Maximum entries to return.',
          default: 100,
        },
      },
    },
  },
  {
    name: 'market_check_declared_dividends',
    description: 'Mutating tool: check yfinance for newly declared dividends for all held shares and save entries to the dividend calendar. Requires confirm=true.',
    inputSchema: {
      type: 'object',
      required: ['confirm'],
      properties: {
        confirm: {
          type: 'boolean',
          description: 'Must be true to run the backend dividend-calendar check because it mutates local data and may call yfinance for many symbols.',
        },
        include_calendar_preview: {
          type: 'boolean',
          description: 'When true, include recent dividend calendar entries after the check completes.',
          default: true,
        },
      },
    },
  },
  {
    name: 'xero_list_quotes',
    description: 'List Xero quotes (sales pipeline) for a tenant. Filter by status (DRAFT/SENT/DECLINED/ACCEPTED/INVOICED), contact, date range, or text. Read-only.',
    inputSchema: {
      type: 'object',
      required: ['tenant_id'],
      properties: {
        tenant_id: { type: 'string', description: 'Xero tenant UUID (use xero_list_tenants to find it).' },
        status: { type: 'string', description: 'Optional: DRAFT, SENT, DECLINED, ACCEPTED, INVOICED, DELETED.' },
        contact_id: { type: 'string', description: 'Optional Xero ContactID (UUID) to filter by.' },
        date_from: { type: 'string', description: 'Optional YYYY-MM-DD quote-date lower bound.' },
        date_to: { type: 'string', description: 'Optional YYYY-MM-DD quote-date upper bound.' },
        query: { type: 'string', description: 'Optional text across quote number, reference, title, contact name.' },
        limit: { type: 'number', description: 'Max rows.', default: 100 },
        offset: { type: 'number', description: 'Pagination offset.', default: 0 },
      },
    },
  },
  {
    name: 'xero_get_quote',
    description: 'Get a single Xero quote with full line items (account code, tracking, tax, discount per line). Read-only.',
    inputSchema: {
      type: 'object',
      required: ['tenant_id', 'quote_id'],
      properties: {
        tenant_id: { type: 'string', description: 'Xero tenant UUID.' },
        quote_id: { type: 'string', description: 'Xero QuoteID (UUID).' },
      },
    },
  },
  {
    name: 'xero_sync_quotes',
    description: 'Mutating tool: pull quotes from Xero into the Klikk database for a tenant. Requires confirm=true.',
    inputSchema: {
      type: 'object',
      required: ['tenant_id', 'confirm'],
      properties: {
        tenant_id: { type: 'string', description: 'Xero tenant UUID.' },
        confirm: { type: 'boolean', description: 'Must be true — this calls the Xero API and writes local rows.' },
        modified_since: { type: 'string', description: 'Optional YYYY-MM-DD — only quotes updated since.' },
        full: { type: 'boolean', description: 'When true, ignore modified_since and pull everything.', default: false },
      },
    },
  },
  {
    name: 'xero_list_invoices',
    description: 'List Xero invoices (ACCREC sales / ACCPAY bills) for a tenant. Filter by type, status, contact, date, due date, minimum amount due (e.g. open AR/AP), or text. Read-only.',
    inputSchema: {
      type: 'object',
      required: ['tenant_id'],
      properties: {
        tenant_id: { type: 'string', description: 'Xero tenant UUID.' },
        type: { type: 'string', description: 'Optional: ACCREC (sales invoice) or ACCPAY (bill).' },
        status: { type: 'string', description: 'Optional: DRAFT, SUBMITTED, AUTHORISED, PAID, VOIDED, DELETED.' },
        contact_id: { type: 'string', description: 'Optional Xero ContactID (UUID).' },
        date_from: { type: 'string', description: 'Optional YYYY-MM-DD invoice-date lower bound.' },
        date_to: { type: 'string', description: 'Optional YYYY-MM-DD invoice-date upper bound.' },
        due_date_from: { type: 'string', description: 'Optional YYYY-MM-DD due-date lower bound.' },
        due_date_to: { type: 'string', description: 'Optional YYYY-MM-DD due-date upper bound.' },
        min_amount_due: { type: 'string', description: 'Optional: only invoices with amount_due >= this (e.g. "0.01" for outstanding).' },
        query: { type: 'string', description: 'Optional text across invoice number, reference, contact name.' },
        limit: { type: 'number', description: 'Max rows.', default: 100 },
        offset: { type: 'number', description: 'Pagination offset.', default: 0 },
      },
    },
  },
  {
    name: 'xero_get_invoice',
    description: 'Get a single Xero invoice with full line items. Read-only.',
    inputSchema: {
      type: 'object',
      required: ['tenant_id', 'invoice_id'],
      properties: {
        tenant_id: { type: 'string', description: 'Xero tenant UUID.' },
        invoice_id: { type: 'string', description: 'Xero InvoiceID (UUID).' },
      },
    },
  },
  {
    name: 'xero_get_document',
    description: 'Find mirrored Xero source documents (invoice PDFs, receipts, bank-transaction attachments) already copied into the Klikk database. Search by invoice number, amount, free text (contact name / journal description / file name), or date range. Read-only — never calls the Xero API. Each result carries a signed view_url that opens the file directly, so you can hand MC a clickable link or fetch the bytes yourself.',
    inputSchema: {
      type: 'object',
      properties: {
        invoice_number: { type: 'string', description: 'Invoice number, partial match (e.g. "INV-0263").' },
        amount: { type: 'string', description: 'Amount to match against the invoice total or a journal debit line (tolerance 0.01).' },
        q: { type: 'string', description: 'Free text across contact name, journal description, and file name.' },
        date_from: { type: 'string', description: 'Optional YYYY-MM-DD lower bound on the invoice date.' },
        date_to: { type: 'string', description: 'Optional YYYY-MM-DD upper bound on the invoice date.' },
        tenant_id: { type: 'string', description: 'Optional Xero tenant UUID to restrict the search.' },
        limit: { type: 'number', description: 'Max rows (max 100).', default: 20 },
      },
    },
  },
  {
    name: 'xero_sync_invoices',
    description: 'Mutating tool: pull invoices (sales + bills) from Xero into the Klikk database for a tenant. Does NOT affect the trial balance (parallel tables). Requires confirm=true.',
    inputSchema: {
      type: 'object',
      required: ['tenant_id', 'confirm'],
      properties: {
        tenant_id: { type: 'string', description: 'Xero tenant UUID.' },
        confirm: { type: 'boolean', description: 'Must be true — calls the Xero API and writes local rows.' },
        type: { type: 'string', description: 'Optional ACCREC or ACCPAY to limit the pull.' },
        statuses: { type: 'array', items: { type: 'string' }, description: 'Optional list e.g. ["AUTHORISED","PAID"].' },
        modified_since: { type: 'string', description: 'Optional YYYY-MM-DD — only invoices updated since.' },
        full: { type: 'boolean', description: 'When true, ignore modified_since and pull everything.', default: false },
      },
    },
  },
  {
    name: 'xero_list_contacts',
    description: 'List Xero contacts for a tenant. Filter by supplier/customer flag or text. Read-only.',
    inputSchema: {
      type: 'object',
      required: ['tenant_id'],
      properties: {
        tenant_id: { type: 'string', description: 'Xero tenant UUID.' },
        query: { type: 'string', description: 'Optional text across name and contact id.' },
        is_supplier: { type: 'boolean', description: 'Optional: only suppliers when true.' },
        is_customer: { type: 'boolean', description: 'Optional: only customers when true.' },
        limit: { type: 'number', description: 'Max rows.', default: 100 },
        offset: { type: 'number', description: 'Pagination offset.', default: 0 },
      },
    },
  },
  {
    name: 'xero_list_tracking',
    description: 'List Xero tracking categories/options for a tenant (e.g. cost centres, properties). Read-only.',
    inputSchema: {
      type: 'object',
      required: ['tenant_id'],
      properties: {
        tenant_id: { type: 'string', description: 'Xero tenant UUID.' },
        active: { type: 'boolean', description: 'Optional: only ACTIVE options when true.' },
        limit: { type: 'number', description: 'Max rows.', default: 200 },
        offset: { type: 'number', description: 'Pagination offset.', default: 0 },
      },
    },
  },
  {
    name: 'xero_list_accounts',
    description: 'List the Xero chart of accounts for a tenant. Filter by account type or text. Read-only.',
    inputSchema: {
      type: 'object',
      required: ['tenant_id'],
      properties: {
        tenant_id: { type: 'string', description: 'Xero tenant UUID.' },
        query: { type: 'string', description: 'Optional text across account code and name.' },
        type: { type: 'string', description: 'Optional Xero account type (e.g. REVENUE, EXPENSE, CURRENT).' },
        limit: { type: 'number', description: 'Max rows.', default: 200 },
        offset: { type: 'number', description: 'Pagination offset.', default: 0 },
      },
    },
  },
  {
    name: 'xero_list_aged_payables',
    description: 'List aged payables (what the business owes suppliers) by contact for a tenant, bucketed Current/1/2/3-month/Older. Read-only.',
    inputSchema: {
      type: 'object',
      required: ['tenant_id'],
      properties: {
        tenant_id: { type: 'string', description: 'Xero tenant UUID.' },
        limit: { type: 'number', description: 'Max rows.', default: 500 },
      },
    },
  },
  {
    name: 'xero_list_aged_receivables',
    description: 'List aged receivables (what customers owe the business) by contact for a tenant, bucketed Current/1/2/3-month/Older. Read-only.',
    inputSchema: {
      type: 'object',
      required: ['tenant_id'],
      properties: {
        tenant_id: { type: 'string', description: 'Xero tenant UUID.' },
        limit: { type: 'number', description: 'Max rows.', default: 500 },
      },
    },
  },
  {
    name: 'xero_sync_aged_payables',
    description: 'Mutating tool: refresh aged payables by contact from Xero for a tenant (iterates suppliers — can take ~30-60s). Requires confirm=true.',
    inputSchema: {
      type: 'object',
      required: ['tenant_id', 'confirm'],
      properties: {
        tenant_id: { type: 'string', description: 'Xero tenant UUID.' },
        confirm: { type: 'boolean', description: 'Must be true — calls the Xero API per supplier contact.' },
      },
    },
  },
  {
    name: 'xero_sync_aged_receivables',
    description: 'Mutating tool: refresh aged receivables by contact from Xero for a tenant (iterates customers — can take ~30-60s). Requires confirm=true.',
    inputSchema: {
      type: 'object',
      required: ['tenant_id', 'confirm'],
      properties: {
        tenant_id: { type: 'string', description: 'Xero tenant UUID.' },
        confirm: { type: 'boolean', description: 'Must be true — calls the Xero API per customer contact.' },
      },
    },
  },
  {
    name: 'list_audit_checks',
    description: 'Read-only: list the year-end audit check registry (Postgres audit.checks) — code, title, category (RDY data-readiness, DOC documents, BNK bank↔books, SUP supplier integrity, BAL balance-sheet lifecycle, ALC allocation & tax, PRC process/intake), severity, expected (zero_rows | list | value), owner_action and description. Use to discover which checks exist before run_audit_check / audit_history, or when MC asks "what does the year-end audit cover?".',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Optional category filter: RDY, DOC, BNK, SUP, BAL, ALC or PRC.' },
        include_sql: { type: 'boolean', description: 'Include each check\'s SQL text (default false).', default: false },
        active_only: { type: 'boolean', description: 'Only active checks (default false = all).', default: false },
      },
    },
  },
  {
    name: 'run_audit_check',
    description: 'Read-only: execute ONE year-end audit check (by code, e.g. BAL-01) against the Klikk Financials mirror for a financial year and return status (PASS / WARN / FAIL / ERROR), row_count and up to 50 sample rows. The SQL is a guarded SELECT run in a READ ONLY transaction; the result is stored in audit.check_results. Use when MC asks about one specific procedure ("was any deposit left unrecovered?", "re-run SUP-05").',
    inputSchema: {
      type: 'object',
      required: ['code'],
      properties: {
        code: { type: 'string', description: 'Check code, e.g. BAL-01, SUP-05, RDY-03.' },
        fy: { type: 'number', description: 'Financial year = the calendar year it ENDS in (Klikk FY runs 1 Jul–30 Jun, so 2026 = 2025-07-01..2026-06-30). Defaults to the current FY.' },
        tenant_id: { type: 'string', description: 'Xero tenant UUID (default Klikk (Pty) Ltd 41ebfa0e-012e-4ff1-82ba-a9a7585c536c).' },
      },
    },
  },
  {
    name: 'run_yearend_audit',
    description: 'Use when MC says \'audit for financial year end\' / \'run the year-end audit\' / \'check the books\'. Read-only: runs EVERY active check in the year-end audit registry (45 seed checks: data-readiness, document completeness, bank↔books, supplier integrity, balance-sheet lifecycle, allocation & tax, process) for a financial year, stores a run in audit.check_runs / audit.check_results, and returns the summary (PASS/WARN/FAIL/ERROR counts, by category, findings) plus per-check results with sample rows. Reason over the findings afterwards: group by owner_action (MC / bookkeeper / accountant / supplier / engineering) and surface the top items. Never writes to Xero.',
    inputSchema: {
      type: 'object',
      properties: {
        fy: { type: 'number', description: 'Financial year = the calendar year it ENDS in (2026 = 2025-07-01..2026-06-30). Defaults to the current FY.' },
        tenant_id: { type: 'string', description: 'Xero tenant UUID (default Klikk (Pty) Ltd).' },
        codes: { type: 'string', description: 'Optional comma-separated subset of check codes to run instead of all active checks.' },
        sample_limit: { type: 'number', description: 'Sample rows to return per non-PASS check (0-50, default 10). Full 50-row samples are always stored in audit.check_results.', default: 10 },
      },
    },
  },
  {
    name: 'audit_history',
    description: 'Read-only: past results of one year-end audit check (status, row_count, duration, sample rows per run, newest first) from audit.check_results — use to see whether a finding is new, recurring, or cleared since the last run, or to diff an opening vs closing run.',
    inputSchema: {
      type: 'object',
      required: ['code'],
      properties: {
        code: { type: 'string', description: 'Check code, e.g. BAL-01.' },
        fy: { type: 'number', description: 'Optional: only runs for this financial year.' },
        limit: { type: 'number', description: 'Maximum runs to return (default 20).', default: 20 },
      },
    },
  },
  {
    name: 'add_audit_check',
    description: 'Registry-only write (never Xero): add a NEW year-end audit check to audit.checks. The SQL must be a single read-only SELECT/WITH parameterised with :fy_start, :fy_end and :tenant_id (no INSERT/UPDATE/DELETE/DROP/ALTER, no semicolons); the backend rejects anything else and validates it with EXPLAIN, then smoke-runs it for the current FY and returns that result. Use when MC raises a new issue and wants it generalised into a permanent check ("add a check for X"). Conventions: journals in xero_data_xerojournals (journal_type=transaction for contact analysis, journal for GL balances; credits are negative), accounts xero_metadata_xeroaccount, contacts xero_metadata_xerocontacts.contacts_id, bank investec_investecbanktransaction (type DEBIT = outflow, use transaction_date), slips whatsapp.v_slips_xero. For expected=value the SQL must return a boolean column named ok.',
    inputSchema: {
      type: 'object',
      required: ['code', 'title', 'category', 'severity', 'description', 'sql_text', 'expected', 'owner_action'],
      properties: {
        code: { type: 'string', description: 'Unique code, e.g. BAL-08 (prefix = category).' },
        title: { type: 'string', description: 'Short title.' },
        category: { type: 'string', description: 'RDY | DOC | BNK | SUP | BAL | ALC | PRC (or a new one).' },
        severity: { type: 'string', description: 'critical | high | medium | low.' },
        description: { type: 'string', description: 'What it catches, how to interpret, and any data GAP / proxy used.' },
        sql_text: { type: 'string', description: 'Read-only SELECT using :fy_start, :fy_end, :tenant_id.' },
        expected: { type: 'string', description: 'zero_rows (any row = finding) | list (rows for review) | value (rows with boolean ok).' },
        owner_action: { type: 'string', description: 'Who acts: MC | bookkeeper | accountant | supplier | engineering.' },
        rationale: { type: 'string', description: 'Optional: the incident / reason the check was born from.' },
        replace: { type: 'boolean', description: 'Set true to overwrite an existing code (default false → 409 if it exists).', default: false },
      },
    },
  },
  {
    name: 'list_audit_findings',
    description: 'Read-only: list the AUDIT FINDINGS REGISTER — the tracked findings raised by the year-end / internal audits (ref e.g. FY26-012, title, severity CRITICAL|HIGH|MEDIUM|LOW|INFO, status OPEN|IN_PROGRESS|RESOLVED|ACCEPTED|WITHDRAWN, category, amount as a 2-decimal string, owner, due_date, source, check_code, comment/attachment counts). Filter by fy (Klikk FY N = 1 Jul N-1 .. 30 Jun N, so FY2026 = 2025-07-01..2026-06-30; omit for the backend default = current FY), status, severity, category, owner, check_code or free-text q; totals cover the WHOLE filter, not just the returned page. Use when MC asks "what audit findings are open", "show the findings register", "what is outstanding for the bookkeeper / accountant", "how big is the VAT finding". The register is Klikk\'s own table — this never reads from or writes to Xero.',
    inputSchema: {
      type: 'object',
      properties: {
        fy: { type: 'number', description: 'Financial year = the calendar year it ENDS in (FY N = 1 Jul N-1 .. 30 Jun N). Omit for the backend default (current FY).' },
        status: { type: 'string', description: 'Comma-separated filter: OPEN, IN_PROGRESS, RESOLVED, ACCEPTED, WITHDRAWN.' },
        severity: { type: 'string', description: 'Comma-separated filter: CRITICAL, HIGH, MEDIUM, LOW, INFO.' },
        category: { type: 'string', description: 'Comma-separated category filter, e.g. SUP, BNK, DOC, ALC, BAL, PRC, VAT, PAYROLL, OTHER.' },
        owner: { type: 'string', description: 'Owner contains-match, e.g. bookkeeper, accountant, MC.' },
        check_code: { type: 'string', description: 'Exact audit-registry check code the finding came from, e.g. BNK-05.' },
        q: { type: 'string', description: 'Free text across ref, title, description, owner, source and evidence.' },
        limit: { type: 'number', description: 'Maximum findings to return (1-200, default 50).', default: 50 },
      },
    },
  },
  {
    name: 'get_audit_finding',
    description: 'Read-only: one audit finding by numeric id — the full finding dict plus its comment thread and attachments. Use when MC says "show me finding FY26-004", "what is the story on the Wandeli finding", or before updating / commenting on one (find the id with list_audit_findings first). Klikk FY N = 1 Jul N-1 .. 30 Jun N. The register is Klikk\'s own table — never touches Xero.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'number', description: 'Finding id (from list_audit_findings).' },
      },
    },
  },
  {
    name: 'add_audit_finding',
    description: 'Guarded mutating tool (confirm=true): raise a NEW finding in the audit findings register — Klikk\'s OWN Postgres table, NEVER Xero. The backend allocates the permanent ref (FY26-013 style) and stamps created_by; fy defaults to the current FY (Klikk FY N = 1 Jul N-1 .. 30 Jun N, so FY2026 = 2025-07-01..2026-06-30). Use when an audit or analysis surfaces a new issue MC wants tracked to closure ("log a finding for X", "add that to the findings register"). Always name the source (which audit run / analysis raised it) and pass amounts as decimal STRINGS exactly as given — never invent or round figures.',
    inputSchema: {
      type: 'object',
      required: ['fy', 'title', 'severity', 'category', 'description', 'source', 'confirm'],
      properties: {
        fy: { type: 'number', description: 'Financial year the finding belongs to (default: current FY).' },
        title: { type: 'string', description: 'Short one-line title of the finding.' },
        severity: { type: 'string', description: 'CRITICAL | HIGH | MEDIUM | LOW | INFO.' },
        category: { type: 'string', description: 'Category, e.g. SUP, BNK, DOC, ALC, BAL, PRC, VAT, PAYROLL, OTHER.' },
        description: { type: 'string', description: 'Plain-English criteria / condition / effect paragraph.' },
        source: { type: 'string', description: 'Where the finding came from, e.g. "internal-audit run 13". Sent verbatim.' },
        amount: { type: 'string', description: 'Decimal ZAR amount as a STRING, e.g. "45644.00" — strings preserve precision. Omit when there is no amount.' },
        owner: { type: 'string', description: 'Who must act: MC, bookkeeper, accountant, ...' },
        due_date: { type: 'string', description: 'YYYY-MM-DD.' },
        evidence: { type: 'array', description: 'Evidence list: [{type: journal|slip|invoice|bank|file|url|note, ref, note}].' },
        check_code: { type: 'string', description: 'Audit-registry check code that raised it, e.g. DOC-03.' },
        asana_gid: { type: 'string', description: 'Linked Asana task gid, if one exists.' },
        confirm: { type: 'boolean', description: 'Must be true — writes to Klikk\'s own findings register (not Xero).' },
      },
    },
  },
  {
    name: 'update_audit_finding',
    description: 'Guarded mutating tool (confirm=true): update an existing audit finding in the register — Klikk\'s OWN table, NEVER Xero. Patch any of status (OPEN|IN_PROGRESS|RESOLVED|ACCEPTED|WITHDRAWN), owner, due_date, amount, severity, category; a note is recorded as a COMMENT on the finding\'s thread, not a field change — a note-only call just adds the comment. fy and ref are immutable. Use when MC says "mark FY26-003 resolved", "reassign that finding to the accountant", "push the due date", "note on the finding that ...". Klikk FY N = 1 Jul N-1 .. 30 Jun N. Pass amounts as decimal strings to preserve precision.',
    inputSchema: {
      type: 'object',
      required: ['id', 'confirm'],
      properties: {
        id: { type: 'number', description: 'Finding id (from list_audit_findings).' },
        status: { type: 'string', description: 'OPEN | IN_PROGRESS | RESOLVED | ACCEPTED | WITHDRAWN.' },
        owner: { type: 'string', description: 'Who must act next.' },
        due_date: { type: 'string', description: 'YYYY-MM-DD, or null to clear.' },
        amount: { type: 'string', description: 'Decimal ZAR amount as a STRING, e.g. "429110.39", or null to clear.' },
        severity: { type: 'string', description: 'CRITICAL | HIGH | MEDIUM | LOW | INFO.' },
        category: { type: 'string', description: 'Category, e.g. SUP, BNK, DOC, VAT, PAYROLL.' },
        note: { type: 'string', description: 'Recorded as a comment on the finding, NOT as a field change.' },
        confirm: { type: 'boolean', description: 'Must be true — writes to Klikk\'s own findings register (not Xero).' },
      },
    },
  },
  {
    name: 'comment_audit_finding',
    description: 'Guarded mutating tool (confirm=true): append a comment to an audit finding\'s thread in the register — Klikk\'s OWN table, NEVER Xero. Use for progress notes, evidence trails and "what we found" updates ("note on FY26-007 that the bookkeeper confirmed X"). Comments are append-only; status / owner changes go through update_audit_finding. Klikk FY N = 1 Jul N-1 .. 30 Jun N.',
    inputSchema: {
      type: 'object',
      required: ['id', 'text', 'confirm'],
      properties: {
        id: { type: 'number', description: 'Finding id (from list_audit_findings).' },
        text: { type: 'string', description: 'The comment text.' },
        confirm: { type: 'boolean', description: 'Must be true — writes to Klikk\'s own findings register (not Xero).' },
      },
    },
  },
  {
    name: 'audit_findings_summary',
    description: 'Read-only: aggregate the audit findings register for one financial year — count, open count, total amount (2-decimal string), and breakdowns by severity (worst first), status, category and owner, plus which FYs have findings. Klikk FY N = 1 Jul N-1 .. 30 Jun N (FY2026 = 2025-07-01..2026-06-30); omit fy for the current FY. Use when MC asks "how are we doing on the findings", "how much money is still open", "summarise the findings register", or to open a status report before drilling in with list_audit_findings. Never touches Xero.',
    inputSchema: {
      type: 'object',
      properties: {
        fy: { type: 'number', description: 'Financial year = the calendar year it ENDS in. Omit for the current FY.' },
      },
    },
  },
  {
    name: 'list_audit_finding_attachments',
    description: 'Read-only: list the file attachments on one audit finding — original filename, content type, size, optional note, uploader and a signed view_url that opens without auth. Attachments are FILES a human uploaded through the console; an agent citing evidence should add a REFERENCE with link_audit_finding instead (there is deliberately no upload tool — an agent has no local file, it has references). Use when MC asks "what documents are on FY26-006" or before opening one via its view_url. The register is Klikk\'s own table — never touches Xero.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'number', description: 'Finding id (from list_audit_findings).' },
      },
    },
  },
  {
    name: 'get_audit_finding_cube',
    description: 'Read-only: run the CUBE VIEW saved on an audit finding and return the live cross-tab — the same {spec, query} pivot shape the Excel add-in uses, executed against the journal mirror right now (not a cached snapshot). Returns has_cube=false when the finding has no saved cube; that is a normal state, not an error. Use when MC says "show me the numbers behind FY26-001", "open the finding\'s cube", or to ground a findings discussion in the actual ledger figures. Amounts in the cross-tab are strings/numbers from the pivot — quote them verbatim, never round. Save or replace the cube with set_audit_finding_cube. Never touches Xero.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'number', description: 'Finding id (from list_audit_findings).' },
      },
    },
  },
  {
    name: 'set_audit_finding_cube',
    description: 'Guarded mutating tool (confirm=true): save (or replace) the cube view stored ON an audit finding — a {spec, query} pivot built with exactly the same rules as preview_cube / save_cube_view, so it stays byte-compatible with the Excel add-in\'s Cube panel. rows is required (dimension KEYS from list_cube_dimensions); a dimension cannot sit on both axes. Remember the journal mirror double-counts across journal_type — pass query {journal_type: "transaction"} (or "journal") unless you mean every mirror of an entry. Preview with preview_cube FIRST so the numbers say what you intend — a wrong dimension gives a plausible view MC only catches by opening it. Use when MC says "pin the numbers behind this finding", "save that view on FY26-004". Writes to Klikk\'s own findings register only, never Xero.',
    inputSchema: {
      type: 'object',
      required: ['id', 'rows', 'confirm'],
      properties: {
        id: { type: 'number', description: 'Finding id (from list_audit_findings).' },
        rows: { type: 'array', description: 'Row dimension KEYS in outline order, e.g. ["supplier"] (see list_cube_dimensions).' },
        cols: { type: 'array', description: 'Column dimension keys, e.g. ["fin_period"]. A key cannot appear in both rows and cols.' },
        measure: { type: 'string', description: 'Measure key (default "amount").' },
        filters: { type: 'object', description: 'Dimension filters: {dimension: [values]}, e.g. {"account_class": ["Expense"]}.' },
        totals: { type: 'object', description: 'Per-dimension subtotal toggles {dimension: boolean}; defaults: parent totals ON for rows, OFF for cols.' },
        suppress: { type: 'boolean', description: 'Suppress all-zero rows (default true).' },
        query: { type: 'object', description: 'Journal filter context: q, tenant, account, contact, journal_type, date_from, date_to.' },
        name: { type: 'string', description: 'Display name for the saved cube, e.g. "FY26-001 payments-before-bill".' },
        cube_note: { type: 'string', description: 'One line of context on what the cube shows and why it matters to this finding.' },
        confirm: { type: 'boolean', description: 'Must be true — writes to Klikk\'s own findings register (not Xero).' },
      },
    },
  },
  {
    name: 'link_audit_finding',
    description: 'Guarded mutating tool (confirm=true): LINK a piece of evidence to an audit finding by reference. kind is one of slip (ref = slip sha256), xero_document (document id), bank_transaction (transaction id), journal (journal_number), invoice (invoice_number) or asana (task gid). For kind journal and invoice the ref is TENANT-QUALIFIED: "<tenant_uuid>:<number>" — Klikk 41ebfa0e-012e-4ff1-82ba-a9a7585c536c, Tremly 0415e61e-f78c-4216-ac54-7933a6f63a5d, Dippenaar Family 27806be4-62dd-4c50-9eb9-c8b79231f6a1. A bare number is accepted but is canonicalised server-side to the KLIKK tenant; measured on this database 31,071 journal numbers and 448 invoice numbers exist in more than one organisation, so a bare number for a Tremly or Dippenaar document silently links the WRONG entity\'s record — always qualify unless you mean Klikk. Linking the same (kind, ref) twice is idempotent: created=false with the existing link, never an error. Links are references, not uploads — file uploads are a human action through the console. Use when an audit cites a slip / journal / invoice / bank line / document / Asana task as evidence ("attach that slip to FY26-009"). Writes to Klikk\'s own register only, never Xero.',
    inputSchema: {
      type: 'object',
      required: ['id', 'kind', 'ref', 'confirm'],
      properties: {
        id: { type: 'number', description: 'Finding id (from list_audit_findings).' },
        kind: { type: 'string', description: 'slip | xero_document | bank_transaction | journal | invoice | asana.' },
        ref: { type: 'string', description: 'The reference: slip sha256 / document id / bank txn id / journal_number / invoice_number / asana gid. journal + invoice refs should be "<tenant_uuid>:<number>" — a bare number means the Klikk tenant.' },
        label: { type: 'string', description: 'Optional human label, e.g. "Aurras statement 31 Oct — shows R0 due".' },
        confirm: { type: 'boolean', description: 'Must be true — writes to Klikk\'s own findings register (not Xero).' },
      },
    },
  },
  {
    name: 'unlink_audit_finding',
    description: 'Guarded mutating tool (confirm=true): remove ONE evidence link from an audit finding by its link_id (from get_audit_finding\'s links array, list output, or the link returned by link_audit_finding). Only the link row is deleted — the finding and the referenced slip / journal / document are untouched. Use when a link was attached to the wrong finding or the wrong entity\'s document ("remove that journal link from FY26-003"). Writes to Klikk\'s own findings register only, never Xero.',
    inputSchema: {
      type: 'object',
      required: ['link_id', 'confirm'],
      properties: {
        link_id: { type: 'number', description: 'The link id to remove (NOT the finding id).' },
        confirm: { type: 'boolean', description: 'Must be true — writes to Klikk\'s own findings register (not Xero).' },
      },
    },
  },
  {
    name: 'audit_finding_graph',
    description: 'Read-only: the findings-evidence GRAPH — nodes and edges connecting findings to their evidence (slip / xero_document / bank_transaction / journal / invoice / asana / attachment / check). With no node it returns every finding in the FY plus its depth-1 edges (fy defaults to the most recent FY with findings). With node_type + node_id (must be supplied TOGETHER, else 400) it traverses BOTH directions from that node — "which findings cite this slip" is the reverse walk — and when fy is omitted it deliberately spans ALL financial years: a caller naming a slip is asking who cites it, not "in some default year". depth is 1 or 2, hard-capped at 2 (depth 2 from a slip reaches the other evidence of the findings that cite it). Capped at 500 edges with truncated=true when the cap bites. Use when MC asks "which findings cite this slip / journal", "map the evidence around FY26-008", "what hangs off check BNK-05". Read-only over Klikk\'s own tables — never Xero.',
    inputSchema: {
      type: 'object',
      properties: {
        fy: { type: 'number', description: 'Financial year = the calendar year it ENDS in (FY N = 1 Jul N-1 .. 30 Jun N). Omit with a node to span ALL years; omit without a node for the most recent FY with findings.' },
        node_type: { type: 'string', description: 'finding | slip | xero_document | bank_transaction | journal | invoice | asana | attachment | check. Requires node_id.' },
        node_id: { type: 'string', description: 'The node\'s id: finding id / slip sha256 / document id / bank txn id / journal_number / invoice_number / asana gid / attachment id / check code. Requires node_type.' },
        depth: { type: 'number', description: 'Traversal depth from the node: 1 (default) or 2 (hard cap).' },
      },
    },
  },
  {
    name: 'pricelist_list_items',
    description: 'Read-only: list Klikk\'s EVENT-GEAR RATE CARD — the hire price list for d&b audio, Pioneer DJ, Epson projection and related event kit (code, name, category, unit e.g. per day, qty_owned, active flag, current LIST price and valid_from, price_count, Xero account / tracking / purchase-line / fixed-asset links, notes). Prices are ex VAT in ZAR. Pass customer= (Xero contacts_id or contact name) to see that customer\'s negotiated rate (customer_price / customer_price_type) alongside the list price; pass date= to see the prices in force on a given day. Filter by category, free-text q (matches code/name/description) and active_only. Use when MC asks "what do we charge for X", "show the price list", "list the d&b / Pioneer / Epson rates", "what gear do we hire out", "what does <customer> pay for Y", or before building a quote with pricelist_build_quote. The price list is Klikk\'s own table — this never reads from or writes to Xero.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Optional category filter. Allowed values: PA, AMP, DJ, PROJECTOR, LENS, LIGHTING, STAGING, RIGGING, CABLING, OTHER. (See the categories array in the result for the ones actually in use.)' },
        active_only: { type: 'boolean', description: 'Only active items (default true). Set false to include retired / sold gear.', default: true },
        q: { type: 'string', description: 'Free-text search across code, name and description (e.g. "V-Series", "CDJ-3000", "EB-L").' },
        customer: { type: 'string', description: 'Optional Xero contacts_id or contact name — adds customer_price / customer_price_type per item where a TRADE/SPECIAL rate exists.' },
        date: { type: 'string', description: 'Optional price-effective date YYYY-MM-DD (default today).' },
      },
    },
  },
  {
    name: 'pricelist_get_price',
    description: 'Read-only: resolve the price of ONE rate-card item (by code) for a date and optionally a customer / price type. Returns price (ex VAT, ZAR, as a 2-decimal string), price_type actually used (LIST / TRADE / SPECIAL), valid_from / valid_to, note, set_by, and fallback_to_list=true when no TRADE/SPECIAL row existed for that customer/type and the LIST price was returned instead. Use when MC asks "what is the day rate for <code>", "what does <customer> pay for <item>", "what was the price of X on <date>", "do we have a trade price for Y". Klikk\'s own event-gear price list — never touches Xero.',
    inputSchema: {
      type: 'object',
      required: ['code'],
      properties: {
        code: { type: 'string', description: 'Item code, e.g. DB-V10P, DB-VGSUB, DB-D40, PIO-CDJ3000, EPSON-PU2220B.' },
        date: { type: 'string', description: 'Price-effective date YYYY-MM-DD (default today).' },
        customer: { type: 'string', description: 'Optional Xero contacts_id or contact name for a customer-specific rate.' },
        type: { type: 'string', description: 'Requested price type: LIST (default), TRADE or SPECIAL. Falls back to LIST when absent (see fallback_to_list).' },
      },
    },
  },
  {
    name: 'pricelist_price_history',
    description: 'Read-only: full price history of ONE rate-card item (by code), newest first — every LIST / TRADE / SPECIAL row with price (ex VAT, ZAR), valid_from, valid_to (null = still current), customer, note, set_by and created_at. Use when MC asks "when did we last change the price of X", "what did we charge for Y last year", "who set this price", "show the price changes on <code>", or to audit a rate before changing it with pricelist_set_price. Klikk\'s own table — never touches Xero.',
    inputSchema: {
      type: 'object',
      required: ['code'],
      properties: {
        code: { type: 'string', description: 'Item code, e.g. DB-V10P.' },
        limit: { type: 'number', description: 'Maximum rows to return, newest first (1-200, default 50).', default: 50 },
      },
    },
  },
  {
    name: 'pricelist_build_quote',
    description: 'Read-only calculator — NOTHING IS PERSISTED, no quote is created in Klikk or Xero. Prices a job from the event-gear rate card: give lines [{code, qty, days}], optional customer (Xero contacts_id or name — applies their TRADE/SPECIAL rates), date (price-effective date), discount_pct (0-100) and vat_rate (default 0.15). Returns per-line unit_price / price_type / priced / line_total, then subtotal, discount, ex_vat, vat, incl_vat (all ZAR, 2-decimal strings) plus warnings for unknown codes or lines with no price (those lines are NOT in the totals — fix them before quoting the client). Use when MC says "quote <customer> for ...", "what would 2x V8 + 4x CDJ for 3 days cost", "price this job", "build a quote", "how much for the Epson setup over the weekend". To actually issue the quote, MC uses Xero quotes (xero_list_quotes / xero_get_quote are read-only views); this tool only computes numbers.',
    inputSchema: {
      type: 'object',
      required: ['lines'],
      properties: {
        lines: {
          type: 'array',
          minItems: 1,
          description: 'Quote lines. Each: {code (required), qty (default 1), days (default 1)}.',
          items: {
            type: 'object',
            required: ['code'],
            properties: {
              code: { type: 'string', description: 'Rate-card item code.' },
              qty: { type: 'number', description: 'Quantity of units (default 1).', default: 1 },
              days: { type: 'number', description: 'Hire days (default 1).', default: 1 },
            },
          },
        },
        customer: { type: 'string', description: 'Optional Xero contacts_id or contact name — applies that customer\'s negotiated rates.' },
        date: { type: 'string', description: 'Price-effective date YYYY-MM-DD (default today).' },
        discount_pct: { type: 'number', description: 'Optional overall discount percentage 0-100 applied to the subtotal before VAT.' },
        vat_rate: { type: 'number', description: 'VAT rate as a fraction (default 0.15 = 15%).', default: 0.15 },
      },
    },
  },
  {
    name: 'pricelist_set_price',
    description: 'Mutating tool (Klikk price list only — NEVER Xero): add a new price row for a rate-card item effective from valid_from, automatically closing the previous open row of the same type/customer (valid_to = day before). price is ex VAT in ZAR. price_type LIST (default) changes the public rate; TRADE or SPECIAL with customer= sets a negotiated rate for one Xero contact. Use when MC says "change the price of X to R…", "set the day rate for <code>", "give <customer> a trade price of R… on Y from <date>", "bump the V8 rate from 1 Sep". Check pricelist_price_history first if unsure of the current rate. Requires confirm=true; recorded with set_by=claude-mcp.',
    inputSchema: {
      type: 'object',
      required: ['code', 'price', 'valid_from', 'confirm'],
      properties: {
        code: { type: 'string', description: 'Item code, e.g. DB-V10P.' },
        price: { type: ['number', 'string'], description: 'New price ex VAT in ZAR (number or numeric string), must be >= 0.' },
        valid_from: { type: 'string', description: 'Effective date YYYY-MM-DD.' },
        price_type: { type: 'string', description: 'LIST (default), TRADE or SPECIAL.' },
        customer: { type: 'string', description: 'Xero contacts_id or contact name — required in practice for TRADE / SPECIAL rates.' },
        note: { type: 'string', description: 'Optional reason / context for the change (e.g. "2026 rate review", "agreed with client on WhatsApp 12 Aug").' },
        confirm: { type: 'boolean', description: 'Must be true — writes a price row to Klikk\'s local price list (not Xero).' },
      },
    },
  },
  {
    name: 'pricelist_upsert_item',
    description: 'Mutating tool (Klikk price list only — NEVER Xero): create a new rate-card item (code + name, optional category, unit, qty_owned, description, active, Xero account code / tracking option / purchase-line link, notes) or, with replace=true, update an existing item\'s details by code. Returns 409 guidance if the code already exists and replace is not true. Use when MC says "add <new gear> to the price list", "create item X", "retire / deactivate Y" (active=false, replace=true), "link Z to its Xero purchase line", "we now own 6 of these" (qty_owned, replace=true). To set the PRICE of an item use pricelist_set_price. Requires confirm=true; recorded with set_by=claude-mcp.',
    inputSchema: {
      type: 'object',
      required: ['code', 'name', 'confirm'],
      properties: {
        code: { type: 'string', description: 'Unique item code, e.g. DB-V10P, PIO-CDJ3000, EPSON-PU2220B (prefix = brand convention).' },
        name: { type: 'string', description: 'Display name, e.g. "d&b V8 line-array cabinet".' },
        category: { type: 'string', description: 'Category — must be one of: PA, AMP, DJ, PROJECTOR, LENS, LIGHTING, STAGING, RIGGING, CABLING, OTHER.' },
        unit: { type: 'string', description: 'Pricing unit — must be one of: DAY, EVENT, WEEK, SEASON (default DAY).' },
        qty_owned: { type: 'number', description: 'How many units Klikk owns (for availability sanity checks).' },
        description: { type: 'string', description: 'Longer description / spec.' },
        active: { type: 'boolean', description: 'Active flag (default true). Set false to retire without deleting.' },
        xero_account_code: { type: 'string', description: 'Optional Xero revenue account code this item bills to.' },
        xero_tracking_option_id: { type: 'string', description: 'Optional Xero tracking option id.' },
        xero_purchase_line_id: { type: 'string', description: 'Optional Xero purchase invoice line id this asset was bought on.' },
        notes: { type: 'string', description: 'Free-text notes.' },
        replace: { type: 'boolean', description: 'Set true to update an existing code (default false → error if it exists).', default: false },
        confirm: { type: 'boolean', description: 'Must be true — writes to Klikk\'s local price list (not Xero).' },
      },
    },
  },
  {
    name: 'list_cube_dimensions',
    description: "The dimensions and measures a cube view can be built from. CALL THIS FIRST before save_cube_view — the spec must use exact dimension KEYS (account_class, fin_year, supplier, ...) and inventing one is rejected. Read-only.",
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'preview_cube',
    description: "Run a cube layout and return the resulting grid WITHOUT saving it or touching MC's workbook. Use this to check a view actually says what you think before you save it for him — wrong dimensions produce a valid-looking but useless view, and MC finds out by opening it. Returns rows (with keys, depth, is_total, cells), column headers, column totals and the grand total.",
    inputSchema: {
      type: 'object',
      required: ['rows'],
      properties: {
        rows: { type: 'array', items: { type: 'string' }, description: 'Row dimension keys, outermost first. At least one.' },
        cols: { type: 'array', items: { type: 'string' }, description: 'Column dimension keys, outermost first.' },
        measure: { type: 'string', description: 'amount | debit | credit | tax | count. Default amount.' },
        filters: { type: 'object', description: 'Dimension subsets as {dimension: [values]}. ORDER IS THE LAYOUT ORDER — the rows/columns come out in the order listed.' },
        totals: { type: 'object', description: 'Per-dimension totals as {dimension: true|false}. Rows default true, columns default false.' },
        suppress: { type: 'boolean', description: 'Drop all-zero rows. Default true.' },
        query: { type: 'object', description: 'Journal filter context: tenant, journal_type, date_from, date_to, account, contact, reference, description, amount, q.' },
        limit_rows: { type: 'number', description: 'Cap rows in the RESPONSE only (default 60). The totals always reflect the whole cube.' },
      },
    },
  },
  {
    name: 'save_cube_view',
    description: "Save a named cube view that MC can open in Excel. This is how an agent hands over an ANALYSIS rather than a paragraph: build the layout, preview it, save it, and tell MC the name — he picks it from 'Saved views' in the add-in and clicks Open, and the sheet builds itself. Upserts by name. Preview it first. Writes only to app.cube_views in our own Postgres; it cannot touch Xero and it does not modify any workbook.",
    inputSchema: {
      type: 'object',
      required: ['name', 'rows'],
      properties: {
        name: { type: 'string', description: "What MC will see in the dropdown. Make it say what the view SHOWS, e.g. 'FY2026 overheads by supplier', not 'analysis 3'." },
        rows: { type: 'array', items: { type: 'string' }, description: 'Row dimension keys, outermost first. At least one.' },
        cols: { type: 'array', items: { type: 'string' }, description: 'Column dimension keys, outermost first.' },
        measure: { type: 'string', description: 'amount | debit | credit | tax | count. Default amount.' },
        filters: { type: 'object', description: 'Dimension subsets as {dimension: [values]}; the order given is the order they appear.' },
        totals: { type: 'object', description: '{dimension: true|false} — which stacked fields carry a total.' },
        suppress: { type: 'boolean', description: 'Drop all-zero rows. Default true.' },
        outline: { type: 'boolean', description: 'Collapsible groups in the sheet. Default true.' },
        query: { type: 'object', description: 'Journal filter context saved WITH the view, so it renders the same numbers whenever it is opened.' },
        author: { type: 'string', description: "Who built it, e.g. 'claude:year-end-audit'." },
      },
    },
  },
  {
    name: 'delete_cube_view',
    description: 'Remove a saved cube view by name. Sheets already built from it are untouched — this only removes the saved layout.',
    inputSchema: {
      type: 'object',
      required: ['name'],
      properties: { name: { type: 'string' } },
    },
  },
  {
    name: 'add_cube_comment',
    description: "Write a comment onto a figure, so it appears in MC's Excel cube/PivotTable sheet exactly where a comment he typed himself would. Use this to hand a finding back to MC ANCHORED TO THE NUMBER it is about, instead of burying it in chat -- e.g. after an audit check or a drill, comment on the cell that is wrong. Identify the cell by `coordinates` ({dimension: value}), the same map list_cube_comments returns; the anchor is axis-independent, so a comment you write lands on that figure whichever way MC has dragged the fields. ALWAYS pass `author` naming yourself (e.g. 'claude:year-end-audit') -- the MCP signs in with a shared service credential that names the tool, not the writer. Re-posting the same coordinates as the same author EDITS your comment rather than adding a second; posting an empty comment retracts it. Writes only to app.cube_comments in our own Postgres -- it can never reach Xero. Do NOT use this to leave routine chatter on MC's sheets: one comment per real finding.",
    inputSchema: {
      type: 'object',
      required: ['coordinates', 'comment', 'author'],
      properties: {
        coordinates: {
          type: 'object',
          description: 'The cell as {dimension: value}, e.g. {"account_class":"EXPENSE","account":"406 — Consulting - Software Design","fin_year":"FY2023"}. Copy the shape from list_cube_comments or get_comment_transactions rather than inventing dimension names.',
        },
        comment: { type: 'string', description: 'The note. Empty string retracts your comment on that cell.' },
        author: { type: 'string', description: "Who is writing, e.g. 'claude:year-end-audit'. Required: the shared service credential cannot identify you." },
        measure: { type: 'string', description: 'Measure the figure is (amount, debit, credit, tax, count). Default amount.', default: 'amount' },
        filters: {
          type: 'object',
          description: 'The journal filter context that produced the number (tenant, date_from, date_to, journal_type, account, ...). Part of the anchor: the same coordinates under a different date window is a different figure. Copy filter_context from the comment or cube you are commenting on; omit only when the figure was unfiltered.',
        },
        cell_value: { type: 'number', description: 'The value you are commenting on, if known. Stored so a later drill can show whether the figure has moved since.' },
        status: { type: 'string', description: 'open (default) | actioned | dismissed.' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: "Tags relating this comment to a piece of work rather than to a cell, e.g. [\"audit\",\"fy2026\"]. Tag what you write so it can be pulled back as a queue: list_cube_comments(tag=\"audit\") returns exactly the audit's own comments instead of the whole register. Normalised server-side (lowercased, trimmed, de-duplicated, bounded); a leading # is optional.",
        },
      },
    },
  },
  {
    name: 'add_comment',
    description: "Comment on ANY subject in the register — a bank transaction from the Investec feed, a journal line, a slip. (For a cube cell use add_cube_comment, which builds the anchor from coordinates.) The classic use: an Investec transaction that never made it into Xero — flag it where MC will see it, with a tag like 'unprocessed', instead of describing it in chat. Identify it by an id that SURVIVES A RESYNC: for a bank transaction that is the uuid from investec_bank_search_transactions, never a row number or a position in a list. Re-posting the same subject as the same author edits your comment; an empty comment retracts it. Writes only to our own Postgres — it cannot reach Xero or the bank.",
    inputSchema: {
      type: 'object',
      required: ['subject_type', 'subject_key', 'comment', 'author'],
      properties: {
        subject_type: { type: 'string', description: "bank_txn | journal_line | slip | invoice. Use bank_txn for an Investec feed transaction." },
        subject_key: { type: 'string', description: "The subject's stable id — for bank_txn, Investec's transaction uuid." },
        subject_label: { type: 'string', description: "Human-readable, e.g. '2026-08-17 Santam R-10,570.41'. Shown in queues so a mixed list is readable without looking each one up." },
        comment: { type: 'string', description: 'The note. Empty retracts yours.' },
        author: { type: 'string', description: "Who is writing, e.g. 'claude:bank-recon'. Required — the MCP uses a shared credential that names the tool, not the writer." },
        tags: { type: 'array', items: { type: 'string' }, description: "Lowercased and de-duplicated, e.g. ['unprocessed','fy2026']." },
        value: { type: 'number', description: 'The amount in question, if there is one.' },
        context: { type: 'object', description: 'Anything needed to find it again — account number, date, tenant.' },
        status: { type: 'string', description: 'open (default) | actioned | dismissed.' },
      },
    },
  },
  {
    name: 'list_comments',
    description: "The comment queue across EVERY kind of subject — bank transactions, cube cells, and anything else in the register. Filter by subject_type, subject_key, tag(s), author or status. Use this to pick up work ('what is tagged unprocessed?') or to check whether something has already been raised before raising it again.",
    inputSchema: {
      type: 'object',
      properties: {
        subject_type: { type: 'string', description: 'bank_txn | cube_cell | journal_line | slip | invoice' },
        subject_key: { type: 'string', description: 'Everything said about one specific subject.' },
        tag: { type: 'string', description: 'Single tag.' },
        tags: { type: 'string', description: 'Comma-separated; a comment must carry ALL of them.' },
        author: { type: 'string' },
        status: { type: 'string', description: 'open (default) | actioned | dismissed | all' },
        limit: { type: 'number', default: 500 },
      },
    },
  },
  {
    name: 'list_cube_comments',
    description: 'Read-only: the comments MC has pinned to cells in Excel (app.cube_comments), newest first. This is the human->agent to-do queue: MC right-clicks a figure in a cube or PivotTable sheet, writes what is wrong or what he wants checked, and it lands here anchored to the exact intersection — the measure, a flat {dimension: value} coordinates object, and the filter_context that produced the number. The coordinates are deliberately axis-independent: a cell is identified by which dimension holds which value, NOT by whether the field sat on rows or on columns, so the same figure never reads as two different figures. Default status=open. Use when MC says "what did I flag", "my Excel comments", "what needs looking at", "the cube comments". Read the anchor to know WHICH figure is meant, pull the underlying lines with get_comment_transactions, investigate with xero_search_journals / run_audit_check, then close it with set_cube_comment_status. Never touches Xero.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'open (default) | actioned | dismissed | all.' },
        measure: { type: 'string', description: 'Optional: only comments on this measure (amount, debit, credit, tax, count).' },
        tenant: { type: 'string', description: 'Optional: only comments whose filter context named this tenant.' },
        author: { type: 'string', description: 'Optional: only comments written by this author.' },
        tag: { type: 'string', description: 'Optional: only comments carrying this tag, e.g. "audit". This is how an agent pulls its OWN queue — tag="audit" during a year-end audit rather than reading every comment in the register.' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: only comments carrying ALL of these tags, e.g. ["audit","fy2026"]. Narrows, never widens — a comment tagged only "audit" is NOT returned.',
        },
        limit: { type: 'number', description: 'Max comments (1-5000, default 500).', default: 500 },
      },
    },
  },
  {
    name: 'set_cube_comment_status',
    description: 'Mark one Excel cube comment actioned or dismissed without touching its text or its anchor. Use after acting on an item from list_cube_comments — "actioned" when you have dealt with it, "dismissed" when it needs no action, and say why to MC either way. Writes ONLY to app.cube_comments in Klikk\'s own Postgres — never to Xero.',
    inputSchema: {
      type: 'object',
      required: ['id', 'status'],
      properties: {
        id: { type: 'number', description: 'Comment id from list_cube_comments.' },
        status: { type: 'string', description: 'open | actioned | dismissed.' },
      },
    },
  },
  {
    name: 'get_comment_transactions',
    description: 'Read-only: answers "which transactions make up this number" for ONE Excel cube comment. Resolves the comment by id, rebuilds its axis-independent {dimension: value} coordinates, and drills the journal ledger at exactly that intersection under exactly the filters the comment was written with — returning the individual journal lines (date, journal number and type, tenant, account, supplier, description, reference, amount / debit / credit, source document type + id) plus line_total. It also checks line_total back to the cell_value stored on the comment (0.005 tolerance) and reports reconciled true/false: a MISMATCH is meaningful, not noise — it means the underlying ledger moved since MC wrote the comment, so report it plainly rather than quietly using the new figure. Use whenever MC asks "what is in this number", "show me the transactions behind this", "break this comment down", or before answering any flagged figure. Never touches Xero.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'number', description: 'Comment id from list_cube_comments.' },
        limit: { type: 'number', description: 'Max journal lines to return (1-5000, default 500).', default: 500 },
      },
    },
  },
  {
    name: 'kb_list_documents',
    description: 'Books KB: list the allocation-doctrine documents (processing rules, chart-of-accounts taxonomy, supplier knowledge, tracking categories, data-quality watchlist, transaction flows, event register). Read one with kb_read_document. Read-only.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'kb_read_document',
    description: "Books KB: read one doctrine document (markdown) by slug, e.g. '01-processing-rules', '06-transaction-flows', '07-event-register'. Read 01 before doing any allocation work.",
    inputSchema: {
      type: 'object',
      required: ['slug'],
      properties: { slug: { type: 'string', description: 'Document slug from kb_list_documents.' } },
    },
  },
  {
    name: 'kb_search',
    description: "Books KB: full-text search across the doctrine documents. Natural-language queries, e.g. 'personal groceries loan account' or 'municipal split water electricity'. Returns matching docs with highlighted snippets.",
    inputSchema: {
      type: 'object',
      required: ['q'],
      properties: {
        q: { type: 'string', description: 'websearch-style query.' },
        limit: { type: 'number', description: 'Max documents (1-50, default 5).', default: 5 },
      },
    },
  },
  {
    name: 'kb_lookup_supplier',
    description: "Books KB: a supplier's expected coding (account, tax, tracking) from 2016-2025 observed history. rule_strength hard (>=80% consistency, safe to auto-code) / soft (verify) / info (line-level judgement). reviewed_by_mc=false means observed, not MC-confirmed. Partial name match.",
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Supplier name or fragment, e.g. herotel.' },
        strength: { type: 'string', description: 'Optional filter: hard | soft | info.' },
        limit: { type: 'number', description: 'Max rules (1-50, default 20).', default: 20 },
      },
    },
  },
  {
    name: 'kb_lookup_customer',
    description: 'Books KB: a customer\'s expected income coding (account, tax, tracking). Same strength semantics as kb_lookup_supplier. Partial name match.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Customer name or fragment.' },
        limit: { type: 'number', description: 'Max rules (1-50, default 20).', default: 20 },
      },
    },
  },
  {
    name: 'kb_lookup_account',
    description: "Books KB: chart-of-accounts dictionary — look up accounts by code or name fragment (e.g. 'PM--SE01', '883', 'security') with usage stats and documented meaning. The prefix taxonomy is doctrine doc '02-accounts'.",
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Account code or name fragment.' },
        limit: { type: 'number', description: 'Max accounts (1-50, default 25).', default: 25 },
      },
    },
  },
  {
    name: 'kb_list_tracking',
    description: 'Books KB: tracking options. Slot 1 = Profit Center (segment/location — every P&L line needs one), slot 2 = Room, slot 3 = Custom Tracking (Personal-*, Stefanie-*, Event-*, Flexibond-*).',
    inputSchema: {
      type: 'object',
      properties: {
        slot: { type: 'number', description: 'Optional: 1, 2 or 3.' },
        q: { type: 'string', description: 'Optional option-name filter.' },
      },
    },
  },
  {
    name: 'kb_list_events',
    description: "Books KB: the event/gig register with date windows. Pass on=YYYY-MM-DD (the transaction date) — if an event window covers it, food/fuel/accommodation/travel in that window is an EVENT cost (Event-* tracking, ER/EE accounts, or a recharge when Dippenaar Family invoiced the gig), NOT Personal-*. Check this BEFORE classifying consumer-merchant spend as personal.",
    inputSchema: {
      type: 'object',
      properties: {
        on: { type: 'string', description: 'Date YYYY-MM-DD to screen against event windows.' },
        q: { type: 'string', description: 'Optional event-name filter, e.g. earthdance.' },
      },
    },
  },
  {
    name: 'slips_list',
    description: 'WhatsApp slips: list the Slippies receipt register (receipt images MC WhatsApps in, OCR\'d and matched to Xero journals) with filters, ordering, pagination, and whole-filter totals (count + sum over EVERYTHING matching, not just the page). Each row carries supplier, total, category, slip timestamp, Xero match status (status_group), matched journal fields (j_*), and a signed public view_url for the receipt image. Archived ("dealt with") slips are hidden unless archived is passed. Read-only; never touches Xero.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Full-text search over OCR text, filename and supplier.' },
        status: { type: 'string', description: 'Status group filter, e.g. MATCHED | UNMATCHED (see status_group values in results).' },
        synced: { type: 'boolean', description: 'Filter on synced-to-Xero flag.' },
        fy: { type: 'string', description: 'Financial year filter, e.g. 2026.' },
        date_from: { type: 'string', description: 'Slip date >= YYYY-MM-DD (local time).' },
        date_to: { type: 'string', description: 'Slip date <= YYYY-MM-DD (local time).' },
        to_process: { type: 'boolean', description: 'Only slips flagged to-process (true) or not flagged (false).' },
        archived: { type: 'string', description: 'Three-way: omit/false = hide archived (default), true = only archived, all = both.' },
        decision: { type: 'string', description: 'Review decision filter; UNDECIDED for slips with no decision yet.' },
        category: { type: 'string', description: 'OCR category (exact, case-insensitive).' },
        min_total: { type: 'number', description: 'Minimum slip total.' },
        max_total: { type: 'number', description: 'Maximum slip total.' },
        ordering: { type: 'string', description: 'One of slip_ts, -slip_ts (default), total, -total, supplier, -supplier, xero_status, -xero_status.' },
        page: { type: 'number', description: 'Page number (1-based).', default: 1 },
        page_size: { type: 'number', description: 'Rows per page.', default: 50 },
        ids_only: { type: 'boolean', description: 'Return only matching sha256 ids — no rows, no pagination.' },
      },
    },
  },
  {
    name: 'slips_get',
    description: 'WhatsApp slips: one slip by sha256 — full OCR payload (supplier, totals, VAT, line items), the matched Xero journal fields, review state (to_process / decision / note / archived) and comments, plus the signed view_url for the receipt image. Use after slips_list. Read-only; never touches Xero.',
    inputSchema: {
      type: 'object',
      required: ['sha256'],
      properties: {
        sha256: { type: 'string', description: 'Slip sha256 from slips_list.' },
      },
    },
  },
  {
    name: 'slips_file',
    description: 'WhatsApp slips: the actual receipt file for one slip. Images (jpg/png/webp) come back as viewable image content; PDFs come back as an embedded base64 resource (if your client cannot open it, slips_get carries the full OCR text of the same document). Read-only.',
    inputSchema: {
      type: 'object',
      required: ['sha256'],
      properties: {
        sha256: { type: 'string', description: 'Slip sha256 from slips_list.' },
      },
    },
  },
  {
    name: 'whatsapp_list_chats',
    description: "WhatsApp: list/search MC's chats (name, jid, last message time), most recently active first. Personal correspondence — read only what the task needs.",
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Chat name or jid fragment, e.g. Slippies or Tanja.' },
        limit: { type: 'number', description: 'Max chats (1-200, default 50).', default: 50 },
        offset: { type: 'number', description: 'Pagination offset.', default: 0 },
      },
    },
  },
  {
    name: 'whatsapp_search_messages',
    description: 'WhatsApp: search/list messages across all chats or within one (chat_jid from whatsapp_list_chats). Filter by text, sender, date range, or media-only. Rows carry has_attachment — fetch the file with whatsapp_get_attachment, and surrounding conversation with whatsapp_message_context. Newest first. Personal correspondence — read only what the task needs.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Message text fragment (case-insensitive).' },
        chat_jid: { type: 'string', description: 'Restrict to one chat (jid from whatsapp_list_chats).' },
        sender: { type: 'string', description: 'Sender fragment.' },
        date_from: { type: 'string', description: 'Message date >= YYYY-MM-DD.' },
        date_to: { type: 'string', description: 'Message date <= YYYY-MM-DD.' },
        media_only: { type: 'boolean', description: 'Only messages carrying media.' },
        limit: { type: 'number', description: 'Max messages (1-500, default 50).', default: 50 },
        offset: { type: 'number', description: 'Pagination offset.', default: 0 },
      },
    },
  },
  {
    name: 'whatsapp_message_context',
    description: 'WhatsApp: one message with the surrounding conversation (N before and after, chronological). Use after whatsapp_search_messages to read a hit in context.',
    inputSchema: {
      type: 'object',
      required: ['chat_jid', 'message_id'],
      properties: {
        chat_jid: { type: 'string', description: 'Chat jid the message belongs to.' },
        message_id: { type: 'string', description: 'Message id from whatsapp_search_messages.' },
        before: { type: 'number', description: 'Messages before (0-50, default 5).', default: 5 },
        after: { type: 'number', description: 'Messages after (0-50, default 5).', default: 5 },
      },
    },
  },
  {
    name: 'xero_create_draft_invoice',
    description: 'THE ONE XERO WRITE. Creates a single DRAFT invoice (ACCREC sales invoice or ACCPAY bill) in Xero — it sits in the Drafts queue and touches NO ledger until a human approves it in Xero. Preconditions: MC has explicitly instructed this specific invoice in the current conversation (quote his words in `instruction` — the call is refused without it), the contact already exists (resolved against the mirror; never auto-created — on ambiguity you get candidates back), and every account_code exists in the chart (kb_lookup_account finds codes). Every call is pre-logged to audit.xero_writes with instructed_by, the instruction quote, and a reversal hint; report the returned write_log_id and invoice number to MC. One invoice per call, no bulk, never speculative, never to "fix" the books.',
    inputSchema: {
      type: 'object',
      required: ['confirm', 'instruction', 'tenant_id', 'line_items'],
      properties: {
        confirm: { type: 'boolean', description: 'Must be literally true — acknowledges this writes a DRAFT invoice to Xero.' },
        instruction: { type: 'string', description: "MC's authorising words for THIS invoice, quoted verbatim from the current conversation." },
        tenant_id: { type: 'string', description: 'Xero tenant id (xero_list_tenants).' },
        type: { type: 'string', description: 'ACCREC (sales invoice, default) or ACCPAY (bill).' },
        contact_id: { type: 'string', description: 'Xero ContactID (preferred when known).' },
        contact_name: { type: 'string', description: 'Exact contact name — must resolve to exactly one mirrored contact, otherwise candidates are returned.' },
        date: { type: 'string', description: 'Invoice date YYYY-MM-DD (default today).' },
        due_date: { type: 'string', description: 'Due date YYYY-MM-DD.' },
        reference: { type: 'string', description: 'Reference text.' },
        currency_code: { type: 'string', description: 'Default ZAR.' },
        line_amount_types: { type: 'string', description: 'Exclusive (default, amounts ex VAT) | Inclusive | NoTax.' },
        line_items: {
          type: 'array',
          description: 'Invoice lines (max 50). Each: {description, unit_amount, account_code, quantity?, tax_type?, tracking?: [{name, option}]}. Klikk doctrine: P&L lines need slot-1 Profit Center tracking (kb_list_tracking).',
          items: {
            type: 'object',
            required: ['description', 'unit_amount', 'account_code'],
            properties: {
              description: { type: 'string' },
              quantity: { type: 'number', default: 1 },
              unit_amount: { type: 'number' },
              account_code: { type: 'string' },
              tax_type: { type: 'string' },
              tracking: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, option: { type: 'string' } } } },
            },
          },
        },
      },
    },
  },
  {
    name: 'whatsapp_get_attachment',
    description: 'WhatsApp: the actual file attached to one message (has_attachment=true in whatsapp_search_messages). Images come back viewable; PDFs and other types as an embedded base64 resource. Serves up to 8MB. Read-only.',
    inputSchema: {
      type: 'object',
      required: ['chat_jid', 'message_id'],
      properties: {
        chat_jid: { type: 'string', description: 'Chat jid the message belongs to.' },
        message_id: { type: 'string', description: 'Message id from whatsapp_search_messages.' },
      },
    },
  },
];

function send(message) {
  output.write(`${JSON.stringify(message)}\n`);
}

function jsonRpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function jsonRpcError(id, code, message, data = undefined) {
  const error = data === undefined ? { code, message } : { code, message, data };
  return { jsonrpc: '2.0', id, error };
}

function sendResult(id, result) {
  send(jsonRpcResult(id, result));
}

function sendError(id, code, message, data = undefined) {
  send(jsonRpcError(id, code, message, data));
}

function textResult(value, isError = false) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return {
    content: [{ type: 'text', text }],
    isError,
  };
}

function fileResult({ base64, mimeType, uri, note }) {
  // Images ride the MCP image content type (clients render them inline);
  // anything else (PDFs mostly) rides an embedded blob resource.
  const content = [{ type: 'text', text: note || '' }];
  if (String(mimeType || '').startsWith('image/')) {
    content.push({ type: 'image', data: base64, mimeType });
  } else {
    content.push({ type: 'resource', resource: { uri: uri || 'klikk-file://unnamed', mimeType, blob: base64 } });
  }
  return { content, isError: false };
}

function clampNumber(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function round(value, places = 2) {
  const factor = 10 ** places;
  return Math.round(toNumber(value) * factor) / factor;
}

function pctChange(start, end) {
  const startNumber = toNumber(start);
  if (!startNumber) return 0;
  return ((toNumber(end) - startNumber) / startNumber) * 100;
}

function signedLabel(value, suffix = '%') {
  const numeric = round(value, 2);
  const sign = numeric > 0 ? '+' : '';
  return `${sign}${numeric}${suffix}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function normalizeLookup(value) {
  return String(value || '')
    .trim()
    .toUpperCase();
}

function normalizeSymbolInput(symbol, symbols = []) {
  const raw = normalizeLookup(symbol);
  if (!raw) throw new Error('symbol is required');

  const exact = symbols.find((row) => normalizeLookup(row.symbol) === raw);
  if (exact) return exact.symbol;

  const byShareCode = symbols.find((row) => normalizeLookup(row.share_name_mapping?.share_code) === raw);
  if (byShareCode) return byShareCode.symbol;

  if (!raw.includes('.') && symbols.some((row) => normalizeLookup(row.symbol) === `${raw}.JO`)) {
    return `${raw}.JO`;
  }

  return symbol;
}

function requestHeaders() {
  const headers = { Accept: 'application/json' };
  if (apiToken) headers.Authorization = `Bearer ${apiToken}`;
  return headers;
}

async function apiRequest(path, options = {}) {
  const url = `${apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = {
    ...requestHeaders(),
    ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    const rawDetail = typeof payload === 'string' ? payload : payload?.detail || payload?.error || JSON.stringify(payload);
    const detail = rawDetail.length > 1200 ? `${rawDetail.slice(0, 1200)}...` : rawDetail;
    const error = new Error(`Klikk API ${response.status}: ${detail}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function safeApiRequest(path, options = {}) {
  try {
    return { ok: true, data: await apiRequest(path, options) };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      status: error.status,
      payload: error.payload,
    };
  }
}

async function listSymbols() {
  return apiRequest('/api/financial-investments/symbols/');
}

async function dataHealthSummary() {
  const [
    xeroStatus,
    xeroTenants,
    bankSyncStatus,
    bankAccounts,
    bankTransactions,
    investecPortfolio,
    investecTransactions,
    symbols,
  ] = await Promise.all([
    safeApiRequest('/xero/auth/status/'),
    safeApiRequest('/xero/core/tenants/'),
    safeApiRequest('/api/investec/bank/sync-status/'),
    safeApiRequest('/api/investec/bank/accounts/?limit=500'),
    safeApiRequest('/api/investec/bank/transactions/?limit=1'),
    safeApiRequest('/api/investec/portfolio/?limit=1'),
    safeApiRequest('/api/investec/transactions/?limit=1'),
    safeApiRequest('/api/financial-investments/symbols/'),
  ]);

  const tenantRows = xeroTenants.ok && Array.isArray(xeroTenants.data) ? xeroTenants.data : [];
  const statusTenants = xeroStatus.ok && Array.isArray(xeroStatus.data?.tenants) ? xeroStatus.data.tenants : [];
  const bankAccountRows = bankAccounts.ok
    ? topArrayRows(bankAccounts.data, 500)
    : [];
  const symbolRows = symbols.ok && Array.isArray(symbols.data) ? symbols.data : [];

  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    xero: {
      connected: Boolean(xeroStatus.data?.connected),
      has_credentials: Boolean(xeroStatus.data?.has_credentials),
      tenant_count: tenantRows.length || statusTenants.length,
      expired_token_count: statusTenants.filter((tenant) => tenant.token_expired).length,
      status: xeroStatus.ok ? xeroStatus.data : null,
      error: xeroStatus.ok ? null : xeroStatus.error,
    },
    investec_bank: {
      account_count: bankAccountRows.length,
      last_synced_at: bankSyncStatus.ok ? bankSyncStatus.data?.last_synced_at ?? null : null,
      transaction_count: bankTransactions.ok ? bankTransactions.data?.count ?? null : null,
      error: [bankSyncStatus, bankAccounts, bankTransactions].filter((result) => !result.ok).map((result) => result.error),
    },
    investec_investments: {
      holdings_count: investecPortfolio.ok ? investecPortfolio.data?.count ?? null : null,
      holdings_coverage: investecPortfolio.ok ? investecPortfolio.data?.coverage ?? null : null,
      transaction_count: investecTransactions.ok ? investecTransactions.data?.count ?? null : null,
      transaction_coverage: investecTransactions.ok ? investecTransactions.data?.coverage ?? null : null,
      error: [investecPortfolio, investecTransactions].filter((result) => !result.ok).map((result) => result.error),
    },
    market_data: {
      symbol_count: symbolRows.length,
      stale_or_unlinked_hint: 'Use market_update_symbols to refresh selected yfinance-backed symbols and optional extra data.',
      error: symbols.ok ? null : symbols.error,
    },
    agent_brief: [
      `Xero tenants: ${tenantRows.length || statusTenants.length}; expired tokens: ${statusTenants.filter((tenant) => tenant.token_expired).length}.`,
      `Investec bank accounts: ${bankAccountRows.length}; last bank sync: ${bankSyncStatus.ok ? bankSyncStatus.data?.last_synced_at || 'n/a' : 'error'}.`,
      `Investec holdings rows: ${investecPortfolio.ok ? investecPortfolio.data?.count ?? 'n/a' : 'error'}.`,
      `Market symbols tracked: ${symbolRows.length}.`,
    ],
  };
}

async function xeroConnectionStatus() {
  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    status: await apiRequest('/xero/auth/status/'),
  };
}

async function xeroListTenants() {
  const tenants = await apiRequest('/xero/core/tenants/');
  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    count: Array.isArray(tenants) ? tenants.length : 0,
    tenants,
  };
}

async function investecBankSyncStatus() {
  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    status: await apiRequest('/api/investec/bank/sync-status/'),
  };
}

async function investecBankSync(args = {}) {
  if (args.confirm !== true) {
    throw new Error('Refusing to sync Investec bank without confirm=true (this calls the live Investec Open API and writes local bank rows).');
  }
  // Backend POST /api/investec/bank/sync/ is incremental (last_synced_at -> today,
  // or last 180 days if never synced) and idempotent; it ignores the request body.
  const data = await apiRequest('/api/investec/bank/sync/', { method: 'POST', body: {} });
  return { generated_at: new Date().toISOString(), api_base_url: apiBaseUrl, result: data };
}

async function investecBankListAccounts(args) {
  const limit = clampNumber(args.limit, 100, 1, 500);
  const data = await apiRequest(`/api/investec/bank/accounts/?limit=${limit}`);
  const accounts = topArrayRows(data, limit);
  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    count: data?.count ?? accounts.length,
    accounts,
  };
}

async function investecBankListBeneficiaries(args = {}) {
  const limit = clampNumber(args.limit, 200, 1, 1000);
  const offset = clampNumber(args.offset, 0, 0, 100000);
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  if (args.query) params.set('q', String(args.query));
  if (args.active === true) params.set('active', 'true');
  if (args.active === false) params.set('active', 'false');
  const data = await apiRequest(`/api/investec/bank/beneficiaries/?${params}`);
  const rows = topArrayRows(data, limit);
  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    count: data?.count ?? rows.length,
    beneficiaries: rows,
    agent_brief: [
      `${data?.count ?? rows.length} Investec beneficiar(y/ies) in the local copy.`,
      rows.length
        ? 'These are the beneficiaries as captured in Investec Online. Check name vs bank_name vs account_number to verify a beneficiary was captured correctly.'
        : 'No beneficiaries in the local copy — run investec_bank_sync_beneficiaries (confirm=true) to pull them from the Investec API.',
    ],
  };
}

async function investecBankSyncBeneficiaries(args = {}) {
  if (args.confirm !== true) {
    throw new Error('Refusing to sync Investec beneficiaries without confirm=true (this calls the live Investec Open API and writes local beneficiary rows).');
  }
  const data = await apiRequest('/api/investec/bank/beneficiaries/sync/', { method: 'POST', body: {} });
  return { generated_at: new Date().toISOString(), api_base_url: apiBaseUrl, result: data };
}

function appendSearchParam(params, key, value) {
  if (value === undefined || value === null || value === '') return;
  params.set(key, String(value));
}

async function investecBankSearchTransactions(args) {
  const limit = clampNumber(args.limit, 100, 1, 1000);
  const offset = clampNumber(args.offset, 0, 0, 100000);
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  appendSearchParam(params, 'description', args.query);
  appendSearchParam(params, 'amount', args.amount);
  appendSearchParam(params, 'date_from', args.date_from);
  appendSearchParam(params, 'date_to', args.date_to);
  appendSearchParam(params, 'account', args.account);

  const data = await apiRequest(`/api/investec/bank/transactions/?${params}`);
  const rows = topArrayRows(data, limit);
  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    filters: {
      query: args.query || null,
      amount: args.amount || null,
      date_from: args.date_from || null,
      date_to: args.date_to || null,
      account: args.account || null,
    },
    count: data?.count ?? rows.length,
    limit: data?.limit ?? limit,
    offset: data?.offset ?? offset,
    transactions: rows,
    agent_brief: [
      `${data?.count ?? rows.length} Investec bank transaction row(s) matched.`,
      rows.length ? 'Use account_number, transaction_date, type, amount, and description to identify the bank movement.' : 'No matching Investec bank transactions found.',
    ],
  };
}

// ---- Investec JSE (investment) share holdings & transactions ----

async function apiUpload(path, { fieldName = 'file', filename, base64, contentType = 'application/octet-stream' }) {
  const url = `${apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const bytes = Buffer.from(base64, 'base64');
  const form = new FormData();
  form.append(fieldName, new Blob([bytes], { type: contentType }), filename);
  // Do NOT set Content-Type — fetch sets the multipart boundary automatically for FormData bodies.
  const response = await fetch(url, { method: 'POST', headers: requestHeaders(), body: form });
  const ct = response.headers.get('content-type') || '';
  const payload = ct.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const rawDetail = typeof payload === 'string' ? payload : payload?.detail || payload?.error || JSON.stringify(payload);
    const detail = rawDetail.length > 1200 ? `${rawDetail.slice(0, 1200)}...` : rawDetail;
    const error = new Error(`Klikk API ${response.status}: ${detail}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function investecJseListHoldings(args = {}) {
  const limit = clampNumber(args.limit, 100, 1, 1000);
  const offset = clampNumber(args.offset, 0, 0, 100000);
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  appendSearchParam(params, 'date', args.date);
  const data = await apiRequest(`/api/investec/portfolio/?${params}`);
  const rows = topArrayRows(data?.results ?? data, limit);
  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    count: data?.count ?? rows.length,
    limit: data?.limit ?? limit,
    offset: data?.offset ?? offset,
    holdings: rows,
  };
}

async function investecJseListTransactions(args = {}) {
  const limit = clampNumber(args.limit, 100, 1, 1000);
  const offset = clampNumber(args.offset, 0, 0, 100000);
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  appendSearchParam(params, 'account_number', args.account_number);
  appendSearchParam(params, 'share_name', args.share_name);
  appendSearchParam(params, 'type', args.type);
  if (args.include_ttm_summary !== undefined) params.set('include_ttm_summary', String(args.include_ttm_summary));
  const data = await apiRequest(`/api/investec/transactions/?${params}`);
  const rows = topArrayRows(data?.results ?? data, limit);
  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    count: data?.count ?? rows.length,
    limit: data?.limit ?? limit,
    offset: data?.offset ?? offset,
    transactions: rows,
  };
}

function requireInvestecUpload(args, what) {
  if (args.confirm !== true) {
    throw new Error(`Refusing to ${what} without confirm=true (this writes/overwrites local Investec investment data).`);
  }
  const base64 = (args.file_base64 || '').trim();
  if (!base64) throw new Error('file_base64 is required: base64-encoded .xlsx/.xls file content.');
  const filename = (args.filename || '').trim();
  if (!/\.(xlsx|xls)$/i.test(filename)) throw new Error('filename is required and must end in .xlsx or .xls.');
  return { base64, filename };
}

async function investecJseUploadHoldings(args = {}) {
  const { base64, filename } = requireInvestecUpload(args, 'upload Investec JSE holdings');
  // Backend reads the month/year from the file and REPLACES all holdings for that month (one version per month).
  const data = await apiUpload('/api/investec/portfolio/upload/', {
    fieldName: 'file',
    filename,
    base64,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  return { generated_at: new Date().toISOString(), api_base_url: apiBaseUrl, result: data };
}

async function investecJseUploadTransactions(args = {}) {
  const { base64, filename } = requireInvestecUpload(args, 'upload Investec JSE transactions');
  const data = await apiUpload('/api/investec/upload/', {
    fieldName: 'file',
    filename,
    base64,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  return { generated_at: new Date().toISOString(), api_base_url: apiBaseUrl, result: data };
}

async function xeroSearchJournals(args) {
  const limit = clampNumber(args.limit, 100, 1, 1000);
  const offset = clampNumber(args.offset, 0, 0, 100000);
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  appendSearchParam(params, 'q', args.query);
  appendSearchParam(params, 'amount', args.amount);
  appendSearchParam(params, 'date_from', args.date_from);
  appendSearchParam(params, 'date_to', args.date_to);
  appendSearchParam(params, 'tenant', args.tenant);
  appendSearchParam(params, 'account', args.account);
  appendSearchParam(params, 'contact', args.contact);
  appendSearchParam(params, 'reference', args.reference);
  appendSearchParam(params, 'description', args.description);

  const data = await apiRequest(`/xero/data/journals/search/?${params}`);
  const rows = topArrayRows(data, limit);
  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    filters: {
      query: args.query || null,
      amount: args.amount || null,
      date_from: args.date_from || null,
      date_to: args.date_to || null,
      tenant: args.tenant || null,
      account: args.account || null,
      contact: args.contact || null,
      reference: args.reference || null,
      description: args.description || null,
    },
    count: data?.count ?? rows.length,
    limit: data?.limit ?? limit,
    offset: data?.offset ?? offset,
    journals: rows,
    agent_brief: [
      `${data?.count ?? rows.length} Xero journal line(s) matched.`,
      rows.length ? 'Use account_code/account_name plus debit/credit to explain where Xero posted the transaction.' : 'No matching Xero journals found.',
    ],
  };
}

function filterSymbols(symbols, query, limit) {
  const normalizedQuery = normalizeLookup(query);
  const rows = normalizedQuery
    ? symbols.filter((row) => {
      const mapping = row.share_name_mapping || {};
      return [
        row.symbol,
        row.name,
        row.exchange,
        mapping.share_code,
        mapping.company,
        mapping.share_name,
        mapping.share_name2,
        mapping.share_name3,
      ].some((value) => normalizeLookup(value).includes(normalizedQuery));
    })
    : symbols;

  return rows.slice(0, limit).map((row) => ({
    symbol: row.symbol,
    name: row.name,
    exchange: row.exchange,
    share_code: row.share_name_mapping?.share_code || '',
    company: row.share_name_mapping?.company || row.name || '',
    last_close: row.last_close,
    change: row.change,
    change_pct: row.change_pct,
    recommendation: row.recommendation,
    dividend_yield: row.dividend_yield,
    updated_at: row.updated_at,
  }));
}

function summarizeHistory(history) {
  const points = (Array.isArray(history) ? history : [])
    .map((point) => ({
      date: point.date,
      close: toNumber(point.adjusted_close ?? point.close),
      volume: toNumber(point.volume),
    }))
    .filter((point) => point.date && point.close > 0)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  if (!points.length) {
    return {
      points: 0,
      latest: null,
      return_pct: 0,
      high: null,
      low: null,
      average_volume: 0,
      trend: 'No price history found.',
    };
  }

  const first = points[0];
  const latest = points[points.length - 1];
  const high = points.reduce((best, point) => (point.close > best.close ? point : best), first);
  const low = points.reduce((best, point) => (point.close < best.close ? point : best), first);
  const averageVolume = points.reduce((sum, point) => sum + point.volume, 0) / points.length;
  const returnPct = pctChange(first.close, latest.close);
  const trend = returnPct > 10
    ? 'Uptrend over selected period.'
    : returnPct < -10
      ? 'Downtrend over selected period.'
      : 'Range-bound over selected period.';

  return {
    points: points.length,
    start: first,
    latest,
    return_pct: round(returnPct, 2),
    high,
    low,
    average_volume: round(averageVolume, 0),
    trend,
  };
}

function topArrayRows(data, limit = 5) {
  if (Array.isArray(data)) return data.slice(0, limit);
  if (Array.isArray(data?.results)) return data.results.slice(0, limit);
  return data ? [data].slice(0, limit) : [];
}

function summarizeDividends(data, limit = 10) {
  const dividends = Array.isArray(data)
    ? data
    : Array.isArray(data?.dividends)
      ? data.dividends
      : Array.isArray(data?.results)
        ? data.results
        : [];

  return {
    trailing_dividend_yield_pct: data?.trailing_dividend_yield_pct ?? null,
    dividends: dividends.slice(0, limit).map((row) => ({
      date: row.date,
      paid_on: row.paid_on,
      amount: row.amount,
      currency: row.currency,
      yield_pct: row.yield_pct,
      price_on_date: row.price_on_date,
    })),
  };
}

async function reviewSymbol(args) {
  const symbols = await listSymbols();
  const symbol = normalizeSymbolInput(args.symbol, symbols);
  const symbolRow = symbols.find((row) => normalizeLookup(row.symbol) === normalizeLookup(symbol)) || null;
  const days = clampNumber(args.days, 365, 1, 3650);
  const newsLimit = clampNumber(args.news_limit, 10, 1, 50);
  const startDate = daysAgoIso(days);

  const [
    historyResult,
    dividendsResult,
    newsResult,
    infoResult,
    analystResult,
    priceTargetResult,
    buysResult,
  ] = await Promise.all([
    safeApiRequest(`/api/financial-investments/symbols/${encodeURIComponent(symbol)}/history/?start_date=${startDate}`),
    safeApiRequest(`/api/financial-investments/symbols/${encodeURIComponent(symbol)}/dividends/`),
    safeApiRequest(`/api/financial-investments/symbols/${encodeURIComponent(symbol)}/news/?limit=${newsLimit}`),
    safeApiRequest(`/api/financial-investments/symbols/${encodeURIComponent(symbol)}/info/`),
    safeApiRequest(`/api/financial-investments/symbols/${encodeURIComponent(symbol)}/analyst-recommendations/`),
    safeApiRequest(`/api/financial-investments/symbols/${encodeURIComponent(symbol)}/analyst-price-target/`),
    safeApiRequest(`/api/financial-investments/symbols/${encodeURIComponent(symbol)}/buy-transactions/`),
  ]);

  const historySummary = summarizeHistory(historyResult.ok ? historyResult.data : []);
  const dividendSummary = dividendsResult.ok ? summarizeDividends(dividendsResult.data, 10) : {
    trailing_dividend_yield_pct: null,
    dividends: [],
  };
  const news = newsResult.ok ? topArrayRows(newsResult.data, newsLimit) : [];
  const buys = buysResult.ok ? topArrayRows(buysResult.data?.results ?? buysResult.data, 10) : [];
  const errors = [
    historyResult,
    dividendsResult,
    newsResult,
    infoResult,
    analystResult,
    priceTargetResult,
    buysResult,
  ].filter((result) => !result.ok).map((result) => result.error);

  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    symbol,
    share_code: symbolRow?.share_name_mapping?.share_code || '',
    company: symbolRow?.share_name_mapping?.company || symbolRow?.name || '',
    snapshot: symbolRow ? {
      last_close: symbolRow.last_close,
      change: symbolRow.change,
      change_pct: symbolRow.change_pct,
      pe_ratio: symbolRow.pe_ratio,
      forward_pe: symbolRow.forward_pe,
      dividend_yield: symbolRow.dividend_yield,
      recommendation: symbolRow.recommendation,
      updated_at: symbolRow.updated_at,
    } : null,
    price_review: historySummary,
    dividends: dividendSummary.dividends,
    trailing_dividend_yield_pct: dividendSummary.trailing_dividend_yield_pct,
    recent_news: news.map((item) => ({
      title: item.title,
      publisher: item.publisher,
      published_at: item.published_at,
      link: item.link,
    })),
    recent_buys: buys,
    company_info: infoResult.ok ? infoResult.data : null,
    analyst_recommendations: analystResult.ok ? analystResult.data : null,
    analyst_price_target: priceTargetResult.ok ? priceTargetResult.data : null,
    agent_brief: [
      `${symbol}: ${historySummary.trend}`,
      `Selected-period return: ${signedLabel(historySummary.return_pct)} from ${historySummary.start?.date || 'n/a'} to ${historySummary.latest?.date || 'n/a'}.`,
      news.length ? `${news.length} recent news item(s) available for context.` : 'No recent news returned by the backend.',
      dividendSummary.dividends.length ? `${dividendSummary.dividends.length} dividend row(s) returned.` : 'No dividend rows returned.',
    ],
    errors,
  };
}

function portfolioValueScale(row) {
  const currency = normalizeLookup(row?.currency);
  if (currency === 'USD') return toNumber(row.exchange_rate) || 1;
  if (currency === 'ZAR') return 100;
  return toNumber(row.exchange_rate) || 1;
}

function normalizePortfolioValue(row, value) {
  return toNumber(value) * portfolioValueScale(row);
}

function isCashHolding(row) {
  return normalizeLookup(row.company) === 'CASH';
}

async function reviewPortfolio(args) {
  const limit = clampNumber(args.limit, 1000, 1, 5000);
  const top = clampNumber(args.top, 10, 1, 50);
  const data = await apiRequest(`/api/investec/portfolio/?limit=${limit}`);
  const rows = Array.isArray(data.results) ? data.results : [];
  const latestDate = rows.reduce((latest, row) => (!latest || row.date > latest ? row.date : latest), '');
  const latestRows = rows.filter((row) => row.date === latestDate && !isCashHolding(row));

  const holdings = latestRows.map((row) => {
    const totalValue = normalizePortfolioValue(row, row.total_value);
    const totalCost = normalizePortfolioValue(row, row.total_cost);
    const profitLoss = row.profit_loss === null || row.profit_loss === undefined || row.profit_loss === ''
      ? totalValue - totalCost
      : toNumber(row.profit_loss);
    const annualIncome = toNumber(row.annual_income_zar);
    return {
      date: row.date,
      company: row.company,
      share_code: row.share_code,
      quantity: toNumber(row.quantity),
      currency: row.currency,
      unit_price: round(toNumber(row.price) * portfolioValueScale(row), 4),
      market_value: round(totalValue, 2),
      cost_value: round(totalCost, 2),
      profit_loss: round(profitLoss, 2),
      annual_income_zar: round(annualIncome, 2),
      portfolio_percent: toNumber(row.portfolio_percent),
      roi_pct: round(((profitLoss + annualIncome) / (totalCost || 1)) * 100, 2),
      dividend_yield_pct: round((annualIncome / (totalValue || 1)) * 100, 2),
    };
  });

  const totals = holdings.reduce((acc, row) => {
    acc.market_value += row.market_value;
    acc.cost_value += row.cost_value;
    acc.profit_loss += row.profit_loss;
    acc.annual_income_zar += row.annual_income_zar;
    return acc;
  }, {
    market_value: 0,
    cost_value: 0,
    profit_loss: 0,
    annual_income_zar: 0,
  });

  totals.market_value = round(totals.market_value, 2);
  totals.cost_value = round(totals.cost_value, 2);
  totals.profit_loss = round(totals.profit_loss, 2);
  totals.annual_income_zar = round(totals.annual_income_zar, 2);
  totals.roi_pct = round(((totals.profit_loss + totals.annual_income_zar) / (totals.cost_value || 1)) * 100, 2);
  totals.dividend_yield_pct = round((totals.annual_income_zar / (totals.market_value || 1)) * 100, 2);

  const largestHoldings = holdings
    .slice()
    .sort((a, b) => b.market_value - a.market_value)
    .slice(0, top);
  const weakestHoldings = holdings
    .slice()
    .sort((a, b) => a.roi_pct - b.roi_pct)
    .slice(0, top);
  const incomeHoldings = holdings
    .slice()
    .sort((a, b) => b.annual_income_zar - a.annual_income_zar)
    .slice(0, top);

  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    latest_date: latestDate,
    holdings_count: holdings.length,
    totals,
    largest_holdings: largestHoldings,
    weakest_holdings: weakestHoldings,
    top_income_holdings: incomeHoldings,
    agent_brief: [
      `Latest Investec portfolio date: ${latestDate || 'n/a'}.`,
      `Market value: R ${Math.round(totals.market_value).toLocaleString('en-ZA')}.`,
      `ROI including annual income: ${signedLabel(totals.roi_pct)}.`,
      `Dividend yield on market value: ${round(totals.dividend_yield_pct, 2)}%.`,
    ],
  };
}

async function refreshSymbol(args) {
  const symbols = await listSymbols();
  const symbol = normalizeSymbolInput(args.symbol, symbols);
  const body = {
    start_date: args.start_date || undefined,
    end_date: args.end_date || undefined,
  };
  const data = await apiRequest(`/api/financial-investments/symbols/${encodeURIComponent(symbol)}/refresh/`, {
    method: 'POST',
    body,
  });
  return {
    symbol,
    result: data,
    refreshed_at: new Date().toISOString(),
  };
}

async function refreshExtra(args) {
  const symbols = await listSymbols();
  const symbol = normalizeSymbolInput(args.symbol, symbols);
  const types = Array.isArray(args.types) && args.types.length ? args.types : DEFAULT_EXTRA_TYPES;
  const result = await apiRequest(`/api/financial-investments/symbols/${encodeURIComponent(symbol)}/refresh-extra/`, {
    method: 'POST',
    body: { types },
  });

  let vectorizeResult = null;
  if (args.vectorize_articles) {
    vectorizeResult = await apiRequest(`/api/financial-investments/symbols/${encodeURIComponent(symbol)}/vectorize-articles/`, {
      method: 'POST',
      body: {
        vectorize: true,
        limit: clampNumber(args.article_limit, 30, 1, 200),
      },
    });
  }

  return {
    symbol,
    types,
    result,
    vectorize_result: vectorizeResult,
    refreshed_at: new Date().toISOString(),
  };
}

async function updateWatchlistInformation(args) {
  const symbols = await listSymbols();
  const requestedSymbols = Array.isArray(args.symbols) ? args.symbols : [];
  if (!requestedSymbols.length) throw new Error('symbols must contain at least one symbol');

  const refreshPrices = args.refresh_prices !== false;
  const refreshExtraData = args.refresh_extra !== false;
  const rows = [];

  for (const rawSymbol of requestedSymbols) {
    const symbol = normalizeSymbolInput(rawSymbol, symbols);
    const row = { symbol, actions: [], errors: [] };

    if (refreshPrices) {
      const result = await safeApiRequest(`/api/financial-investments/symbols/${encodeURIComponent(symbol)}/refresh/`, {
        method: 'POST',
        body: {},
      });
      row.actions.push({ action: 'refresh_prices', ...result });
    }

    if (refreshExtraData) {
      const types = Array.isArray(args.extra_types) && args.extra_types.length ? args.extra_types : DEFAULT_EXTRA_TYPES;
      const result = await safeApiRequest(`/api/financial-investments/symbols/${encodeURIComponent(symbol)}/refresh-extra/`, {
        method: 'POST',
        body: { types },
      });
      row.actions.push({ action: 'refresh_extra', types, ...result });
    }

    if (args.vectorize_articles) {
      const result = await safeApiRequest(`/api/financial-investments/symbols/${encodeURIComponent(symbol)}/vectorize-articles/`, {
        method: 'POST',
        body: { vectorize: true, limit: 30 },
      });
      row.actions.push({ action: 'vectorize_articles', ...result });
    }

    try {
      row.review = await reviewSymbol({
        symbol,
        days: 365,
        news_limit: clampNumber(args.news_limit, 5, 1, 20),
      });
    } catch (error) {
      row.errors.push(error.message);
    }

    row.errors.push(...row.actions.filter((action) => !action.ok).map((action) => action.error));
    rows.push(row);
  }

  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    count: rows.length,
    rows,
  };
}

function filterDividendCalendarRows(rows, args) {
  const symbol = normalizeLookup(args.symbol);
  const shareCode = normalizeLookup(args.share_code);
  const category = normalizeLookup(args.dividend_category);

  return rows.filter((row) => {
    if (symbol && normalizeLookup(row.symbol) !== symbol) return false;
    if (shareCode && normalizeLookup(row.share_code) !== shareCode) return false;
    if (category && normalizeLookup(row.dividend_category) !== category) return false;
    return true;
  });
}

async function listDividendCalendar(args) {
  const params = new URLSearchParams();
  if (args.status) params.set('status', String(args.status));
  if (args.pending_tm1) params.set('pending_tm1', '1');

  const path = `/api/financial-investments/dividend-calendar/${params.toString() ? `?${params}` : ''}`;
  const data = await apiRequest(path);
  const limit = clampNumber(args.limit, 100, 1, 500);
  const rows = filterDividendCalendarRows(topArrayRows(data, 500), args).slice(0, limit);

  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    count: data?.count ?? rows.length,
    returned: rows.length,
    rows,
    agent_brief: [
      `${rows.length} dividend calendar row(s) returned.`,
      args.pending_tm1 ? 'Filtered to TM1-pending entries.' : 'Includes declared/paid entries returned by the backend.',
    ],
  };
}

async function checkDeclaredDividends(args) {
  if (args.confirm !== true) {
    throw new Error('market_check_declared_dividends mutates data; call it again with confirm=true after explicit user confirmation.');
  }

  const result = await apiRequest('/api/financial-investments/dividend-calendar/check/', {
    method: 'POST',
    body: {},
  });

  let calendarPreview = null;
  if (args.include_calendar_preview !== false) {
    calendarPreview = await listDividendCalendar({ limit: 25 });
  }

  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    result,
    calendar_preview: calendarPreview,
  };
}

function requireTenant(args) {
  const tenantId = (args.tenant_id || '').trim();
  if (!tenantId) throw new Error('tenant_id is required');
  return tenantId;
}

function requireConfirm(args, what) {
  if (args.confirm !== true) {
    throw new Error(`Refusing to ${what} without confirm=true (this mutates local data / calls the Xero API).`);
  }
}

async function xeroListQuotes(args) {
  const tenantId = requireTenant(args);
  const limit = clampNumber(args.limit, 100, 1, 1000);
  const offset = clampNumber(args.offset, 0, 0, 100000);
  const params = new URLSearchParams();
  params.set('tenant_id', tenantId);
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  appendSearchParam(params, 'status', args.status);
  appendSearchParam(params, 'contact_id', args.contact_id);
  appendSearchParam(params, 'date_from', args.date_from);
  appendSearchParam(params, 'date_to', args.date_to);
  appendSearchParam(params, 'q', args.query);
  const data = await apiRequest(`/xero/data/quotes/?${params}`);
  const rows = topArrayRows(data?.results ?? data, limit);
  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    count: data?.count ?? rows.length,
    limit: data?.limit ?? limit,
    offset: data?.offset ?? offset,
    quotes: rows,
    agent_brief: [`${data?.count ?? rows.length} quote(s) matched.`],
  };
}

async function xeroGetQuote(args) {
  const tenantId = requireTenant(args);
  const quoteId = (args.quote_id || '').trim();
  if (!quoteId) throw new Error('quote_id is required');
  const data = await apiRequest(`/xero/data/quotes/${encodeURIComponent(quoteId)}/?tenant_id=${encodeURIComponent(tenantId)}`);
  return { generated_at: new Date().toISOString(), api_base_url: apiBaseUrl, quote: data };
}

async function xeroSyncQuotes(args) {
  const tenantId = requireTenant(args);
  requireConfirm(args, 'sync quotes');
  const body = { tenant_id: tenantId };
  if (args.modified_since) body.modified_since = args.modified_since;
  if (args.full) body.full = true;
  const data = await apiRequest('/xero/data/quotes/sync/', { method: 'POST', body });
  return { generated_at: new Date().toISOString(), api_base_url: apiBaseUrl, result: data };
}

async function xeroListInvoices(args) {
  const tenantId = requireTenant(args);
  const limit = clampNumber(args.limit, 100, 1, 1000);
  const offset = clampNumber(args.offset, 0, 0, 100000);
  const params = new URLSearchParams();
  params.set('tenant_id', tenantId);
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  appendSearchParam(params, 'type', args.type);
  appendSearchParam(params, 'status', args.status);
  appendSearchParam(params, 'contact_id', args.contact_id);
  appendSearchParam(params, 'date_from', args.date_from);
  appendSearchParam(params, 'date_to', args.date_to);
  appendSearchParam(params, 'due_date_from', args.due_date_from);
  appendSearchParam(params, 'due_date_to', args.due_date_to);
  appendSearchParam(params, 'min_amount_due', args.min_amount_due);
  appendSearchParam(params, 'q', args.query);
  const data = await apiRequest(`/xero/data/invoices/?${params}`);
  const rows = topArrayRows(data?.results ?? data, limit);
  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    count: data?.count ?? rows.length,
    limit: data?.limit ?? limit,
    offset: data?.offset ?? offset,
    invoices: rows,
    agent_brief: [`${data?.count ?? rows.length} invoice(s) matched.`],
  };
}

async function xeroGetInvoice(args) {
  const tenantId = requireTenant(args);
  const invoiceId = (args.invoice_id || '').trim();
  if (!invoiceId) throw new Error('invoice_id is required');
  const data = await apiRequest(`/xero/data/invoices/${encodeURIComponent(invoiceId)}/?tenant_id=${encodeURIComponent(tenantId)}`);
  return { generated_at: new Date().toISOString(), api_base_url: apiBaseUrl, invoice: data };
}

async function xeroGetDocument(args) {
  const filters = ['invoice_number', 'amount', 'q', 'date_from', 'date_to'];
  const hasFilter = filters.some((key) => {
    const value = args[key];
    return value !== undefined && value !== null && String(value).trim() !== '';
  });
  if (!hasFilter) {
    throw new Error('At least one of invoice_number, amount, q, date_from or date_to is required.');
  }
  const limit = clampNumber(args.limit, 20, 1, 100);
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  appendSearchParam(params, 'invoice_number', args.invoice_number);
  appendSearchParam(params, 'amount', args.amount);
  appendSearchParam(params, 'q', args.q);
  appendSearchParam(params, 'date_from', args.date_from);
  appendSearchParam(params, 'date_to', args.date_to);
  appendSearchParam(params, 'tenant_id', args.tenant_id);
  const data = await apiRequest(`/xero/data/documents/search/?${params}`);
  const rows = topArrayRows(data?.results ?? data, limit);
  const count = data?.count ?? rows.length;
  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    count,
    limit: data?.limit ?? limit,
    documents: rows,
    agent_brief: [
      `${count} mirrored document(s) matched.`,
      'Each row carries a signed view_url that opens the file without a token — safe to hand to MC as a link.',
      'These are local mirror copies; nothing here called the Xero API.',
    ],
  };
}

async function xeroSyncInvoices(args) {
  const tenantId = requireTenant(args);
  requireConfirm(args, 'sync invoices');
  const body = { tenant_id: tenantId };
  if (args.type) body.type = args.type;
  if (Array.isArray(args.statuses) && args.statuses.length) body.statuses = args.statuses;
  if (args.modified_since) body.modified_since = args.modified_since;
  if (args.full) body.full = true;
  const data = await apiRequest('/xero/data/invoices/sync/', { method: 'POST', body });
  return { generated_at: new Date().toISOString(), api_base_url: apiBaseUrl, result: data };
}

async function xeroListContacts(args) {
  const tenantId = requireTenant(args);
  const limit = clampNumber(args.limit, 100, 1, 1000);
  const offset = clampNumber(args.offset, 0, 0, 100000);
  const params = new URLSearchParams();
  params.set('tenant_id', tenantId);
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  appendSearchParam(params, 'q', args.query);
  if (args.is_supplier !== undefined) params.set('is_supplier', String(args.is_supplier));
  if (args.is_customer !== undefined) params.set('is_customer', String(args.is_customer));
  const data = await apiRequest(`/xero/metadata/contacts/?${params}`);
  const rows = topArrayRows(data?.results ?? data, limit);
  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    count: data?.count ?? rows.length,
    limit: data?.limit ?? limit,
    offset: data?.offset ?? offset,
    contacts: rows,
  };
}

async function xeroListTracking(args) {
  const tenantId = requireTenant(args);
  const limit = clampNumber(args.limit, 200, 1, 1000);
  const offset = clampNumber(args.offset, 0, 0, 100000);
  const params = new URLSearchParams();
  params.set('tenant_id', tenantId);
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  if (args.active !== undefined) params.set('active', String(args.active));
  const data = await apiRequest(`/xero/metadata/tracking/?${params}`);
  const rows = topArrayRows(data?.results ?? data, limit);
  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    count: data?.count ?? rows.length,
    tracking: rows,
  };
}

async function xeroListAccounts(args) {
  const tenantId = requireTenant(args);
  const limit = clampNumber(args.limit, 200, 1, 1000);
  const offset = clampNumber(args.offset, 0, 0, 100000);
  const params = new URLSearchParams();
  params.set('tenant_id', tenantId);
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  appendSearchParam(params, 'q', args.query);
  appendSearchParam(params, 'type', args.type);
  const data = await apiRequest(`/xero/metadata/accounts/?${params}`);
  const rows = topArrayRows(data?.results ?? data, limit);
  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    count: data?.count ?? rows.length,
    accounts: rows,
  };
}

async function xeroListAgedReport(args, path, key) {
  const tenantId = requireTenant(args);
  const limit = clampNumber(args.limit, 500, 1, 5000);
  const data = await apiRequest(`${path}?tenant_id=${encodeURIComponent(tenantId)}`);
  const rows = topArrayRows(data?.results ?? data, limit);
  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    count: data?.count ?? rows.length,
    [key]: rows,
  };
}

async function xeroSyncAged(args, path, what) {
  const tenantId = requireTenant(args);
  requireConfirm(args, what);
  const data = await apiRequest(path, { method: 'POST', body: { tenant_id: tenantId } });
  return { generated_at: new Date().toISOString(), api_base_url: apiBaseUrl, result: data };
}

// ---- Year-end audit registry (Postgres audit.checks / check_runs / check_results) ----

function auditFyOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 2015 || n > 2100) throw new Error('fy must be an integer financial year such as 2026');
  return n;
}

function auditBrief(summary) {
  if (!summary) return [];
  const c = summary.counts || {};
  return [
    `FY${summary.fy} (${summary.fy_start}..${summary.fy_end}) run_id=${summary.run_id}: ${summary.checks_run} checks — PASS ${c.PASS ?? 0}, WARN ${c.WARN ?? 0}, FAIL ${c.FAIL ?? 0}, ERROR ${c.ERROR ?? 0}.`,
    'Status meaning: zero_rows → any row is a finding; list → rows for human review; value → boolean ok column. ERROR = the SQL itself failed (engineering).',
    'Group findings by owner_action (MC / bookkeeper / accountant / supplier / engineering) and lead with FAIL + high-severity WARN. Findings go to MC and the bookkeeper — never write to Xero.',
  ];
}

async function listAuditChecks(args = {}) {
  const params = new URLSearchParams();
  appendSearchParam(params, 'category', args.category ? String(args.category).toUpperCase() : undefined);
  params.set('include_sql', args.include_sql ? '1' : '0');
  if (args.active_only) params.set('active', '1');
  const data = await apiRequest(`/audit/checks/?${params}`);
  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    count: data?.count ?? (data?.checks || []).length,
    categories: data?.categories || [],
    checks: data?.checks || [],
    agent_brief: [
      `${data?.count ?? 0} audit check(s) in the registry${args.category ? ` for category ${String(args.category).toUpperCase()}` : ''}.`,
      'Run them all with run_yearend_audit(fy) or one with run_audit_check(code, fy); add new ones with add_audit_check.',
    ],
  };
}

async function runAuditCheck(args = {}) {
  const code = String(args.code || '').trim().toUpperCase();
  if (!code) throw new Error('code is required (e.g. BAL-01)');
  const body = {};
  const fy = auditFyOrNull(args.fy);
  if (fy) body.fy = fy;
  if (args.tenant_id) body.tenant_id = String(args.tenant_id);
  body.triggered_by = 'mcp:run_audit_check';
  const data = await apiRequest(`/audit/checks/${encodeURIComponent(code)}/run/`, { method: 'POST', body });
  const r = data?.result || {};
  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    run_id: data?.run_id,
    fy: data?.fy,
    fy_start: data?.fy_start,
    fy_end: data?.fy_end,
    check: data?.check,
    result: r,
    agent_brief: [
      `${code} → ${r.status || 'n/a'}${r.row_count !== null && r.row_count !== undefined ? ` (${r.row_count} row(s))` : ''}${r.notes ? ` — ${r.notes}` : ''}.`,
      `Expected=${r.expected || data?.check?.expected}; owner_action=${r.owner_action || data?.check?.owner_action || 'n/a'}. Sample rows are capped at 50; the full result is stored in audit.check_results (run_id ${data?.run_id}).`,
    ],
  };
}

async function runYearendAudit(args = {}) {
  const body = { triggered_by: 'mcp:run_yearend_audit', include_samples: true };
  const fy = auditFyOrNull(args.fy);
  if (fy) body.fy = fy;
  if (args.tenant_id) body.tenant_id = String(args.tenant_id);
  if (args.codes) body.codes = String(args.codes);
  body.sample_limit = clampNumber(args.sample_limit, 10, 0, 50);
  const data = await apiRequest('/audit/run/', { method: 'POST', body });
  const summary = data?.summary || {};
  const results = data?.results || [];
  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    summary,
    results,
    agent_brief: auditBrief(summary),
  };
}

async function auditHistory(args = {}) {
  const code = String(args.code || '').trim().toUpperCase();
  if (!code) throw new Error('code is required (e.g. BAL-01)');
  const params = new URLSearchParams();
  params.set('limit', String(clampNumber(args.limit, 20, 1, 200)));
  const fy = auditFyOrNull(args.fy);
  if (fy) params.set('fy', String(fy));
  const data = await apiRequest(`/audit/history/${encodeURIComponent(code)}/?${params}`);
  const history = data?.history || [];
  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    code,
    count: history.length,
    history,
    agent_brief: [
      history.length
        ? `${history.length} stored run(s) for ${code}; latest ${history[0].status} with ${history[0].row_count ?? 'n/a'} row(s) (run_id ${history[0].run_id}, FY${history[0].fy}).`
        : `No stored runs for ${code} yet — run_audit_check(code, fy) to create one.`,
    ],
  };
}

async function addAuditCheck(args = {}) {
  const required = ['code', 'title', 'category', 'severity', 'description', 'sql_text', 'expected', 'owner_action'];
  for (const k of required) {
    if (args[k] === undefined || args[k] === null || String(args[k]).trim() === '') throw new Error(`${k} is required`);
  }
  const sql = String(args.sql_text);
  if (/\b(insert|update|delete|drop|alter|truncate|create|grant|revoke)\b/i.test(sql.replace(/'(?:[^']|'')*'/g, "''"))) {
    throw new Error('sql_text must be a read-only SELECT (write keywords are not allowed)');
  }
  const body = {
    code: String(args.code).trim().toUpperCase(),
    title: String(args.title),
    category: String(args.category).toUpperCase(),
    severity: String(args.severity).toLowerCase(),
    description: String(args.description),
    sql_text: sql,
    expected: String(args.expected).toLowerCase(),
    owner_action: String(args.owner_action),
    rationale: args.rationale ? String(args.rationale) : '',
    replace: Boolean(args.replace),
    source: 'mcp:add_audit_check',
  };
  const data = await apiRequest('/audit/checks/', { method: 'POST', body });
  const smoke = data?.smoke_run || {};
  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    created: data?.created,
    check: data?.check,
    smoke_run: smoke,
    agent_brief: [
      `${data?.created ? 'Created' : 'Updated'} ${body.code}; SQL validated with EXPLAIN.`,
      `Smoke run for the current FY → ${smoke.status || 'n/a'}${smoke.row_count !== undefined && smoke.row_count !== null ? ` (${smoke.row_count} row(s))` : ''}${smoke.notes ? ` — ${smoke.notes}` : ''}.`,
      'Also add the narrative for this check to Klikk-YearEnd-Audit-Procedures.md so the why survives.',
    ],
  };
}

// ---- Audit findings register (Klikk's own table via /audit/findings/ — never Xero) ----

function auditFindingId(value) {
  if (value === undefined || value === null || String(value).trim() === '') throw new Error('id is required');
  const id = Number(value);
  if (!Number.isFinite(id)) throw new Error('id is required');
  return id;
}

function auditFindingBrief(finding) {
  if (!finding) return 'No finding payload returned.';
  const amount = finding.amount === undefined || finding.amount === null
    ? 'no amount'
    : `${finding.amount} ${finding.currency || 'ZAR'}`;
  const owner = finding.owner ? `, owner ${finding.owner}` : '';
  return `${finding.ref || `finding ${finding.id}`} [${finding.severity}/${finding.status}] ${finding.title || ''} — ${amount}${owner}.`;
}

async function listAuditFindings(args = {}) {
  const limit = clampNumber(args.limit, 50, 1, 200);
  const fy = auditFyOrNull(args.fy);
  const params = new URLSearchParams();
  if (fy !== null) params.set('fy', String(fy));
  appendSearchParam(params, 'status', args.status);
  appendSearchParam(params, 'severity', args.severity);
  appendSearchParam(params, 'category', args.category);
  appendSearchParam(params, 'owner', args.owner);
  appendSearchParam(params, 'check_code', args.check_code);
  appendSearchParam(params, 'q', args.q);
  params.set('page_size', String(limit));
  const data = await apiRequest(`/audit/findings/?${params}`);
  const findings = data?.results || [];
  const totals = data?.totals || {};
  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    count: data?.count ?? findings.length,
    fy: data?.fy ?? fy,
    current_fy: data?.current_fy,
    totals,
    findings,
    agent_brief: [
      `${data?.count ?? findings.length} finding(s)${data?.fy ? ` for FY${data.fy}` : ''} matched; totals cover the whole filter (count ${totals.count ?? 0}, amount ${totals.amount ?? '0.00'} ZAR), not just this page.`,
      'Amounts are 2-decimal STRINGS — repeat them verbatim, never round-trip through float. Drill in with get_audit_finding(id); mutate with update_audit_finding / comment_audit_finding (confirm=true). The register is Klikk\'s own table — never Xero.',
    ],
  };
}

async function getAuditFinding(args = {}) {
  const id = auditFindingId(args.id);
  const data = await apiRequest(`/audit/findings/${id}/`);
  const finding = data?.finding ?? data;
  const comments = data?.comments || [];
  const attachments = data?.attachments || [];
  const links = data?.links || [];
  const linkCount = data?.link_count ?? links.length;
  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    finding,
    comments,
    attachments,
    links,
    link_count: linkCount,
    links_truncated: data?.links_truncated === true,
    agent_brief: [
      auditFindingBrief(finding),
      `${comments.length} comment(s), ${attachments.length} attachment(s), ${linkCount} evidence link(s)${data?.links_truncated ? ' (links array truncated at 200 — link_count is the true total)' : ''}. Add a note with comment_audit_finding, link evidence with link_audit_finding, or change status/owner with update_audit_finding — all require confirm=true and only touch Klikk's own register, never Xero.`,
    ],
  };
}

async function addAuditFinding(args = {}) {
  const required = ['title', 'severity', 'category', 'description', 'source'];
  for (const k of required) {
    if (args[k] === undefined || args[k] === null || String(args[k]).trim() === '') throw new Error(`${k} is required`);
  }
  const fy = auditFyOrNull(args.fy);
  requireConfirm(args, 'add an audit finding');
  const body = {
    title: args.title,
    severity: args.severity,
    category: args.category,
    description: args.description,
    source: args.source,
  };
  if (fy !== null) body.fy = fy;
  for (const key of ['amount', 'owner', 'due_date', 'evidence', 'check_code', 'asana_gid']) {
    if (args[key] !== undefined && args[key] !== null) body[key] = args[key];
  }
  const data = await apiRequest('/audit/findings/', { method: 'POST', body });
  const finding = data?.finding ?? data;
  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    created: true,
    finding,
    agent_brief: [
      `Created ${auditFindingBrief(finding)}`,
      'The ref was allocated by the backend and is permanent — quote it back to MC. This wrote to Klikk\'s own findings register only, never Xero.',
    ],
  };
}

async function updateAuditFinding(args = {}) {
  const id = auditFindingId(args.id);
  const patch = {};
  for (const key of ['status', 'owner', 'due_date', 'amount', 'severity', 'category']) {
    if (args[key] !== undefined) patch[key] = args[key];
  }
  const hasNote = args.note !== undefined && args.note !== null && String(args.note).trim() !== '';
  if (!Object.keys(patch).length && !hasNote) {
    throw new Error('nothing to update — supply at least one of status, owner, due_date, amount, severity, category or note');
  }
  requireConfirm(args, 'update an audit finding');
  let finding = null;
  if (Object.keys(patch).length) {
    const data = await apiRequest(`/audit/findings/${id}/`, { method: 'PATCH', body: patch });
    finding = data?.finding ?? data;
  }
  let comment = null;
  if (hasNote) {
    const data = await apiRequest(`/audit/findings/${id}/comments/`, { method: 'POST', body: { text: String(args.note) } });
    comment = data?.comment ?? data;
  }
  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    finding,
    comment,
    agent_brief: [
      finding ? `Updated ${auditFindingBrief(finding)}` : `No fields patched on finding ${id} (note-only call).`,
      comment ? `Comment ${comment?.id ?? ''} recorded on the finding's thread.` : 'No comment added.',
      'This wrote to Klikk\'s own findings register only, never Xero.',
    ],
  };
}

async function commentAuditFinding(args = {}) {
  const id = auditFindingId(args.id);
  if (args.text === undefined || args.text === null || String(args.text).trim() === '') throw new Error('text is required');
  requireConfirm(args, 'comment on an audit finding');
  const data = await apiRequest(`/audit/findings/${id}/comments/`, { method: 'POST', body: { text: String(args.text) } });
  const comment = data?.comment ?? data;
  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    comment,
    agent_brief: [
      `Comment ${comment?.id ?? ''} added to finding ${id}. Comments are append-only; this wrote to Klikk's own findings register only, never Xero.`,
    ],
  };
}

async function auditFindingsSummary(args = {}) {
  const fy = auditFyOrNull(args.fy);
  const path = fy !== null ? `/audit/findings/summary/?fy=${fy}` : '/audit/findings/summary/';
  const data = await apiRequest(path);
  const bySeverity = data?.by_severity || [];
  const worst = bySeverity.length ? bySeverity[0] : null;
  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    ...data,
    agent_brief: [
      `${data?.fy ? `FY${data.fy}` : 'All FYs'}: ${data?.count ?? 0} finding(s), ${data?.open_count ?? 0} open, total amount ${data?.amount ?? '0.00'} ZAR.`,
      worst
        ? `Worst severity bucket present: ${worst.key} — ${worst.count} finding(s), amount ${worst.amount ?? 'n/a'}.`
        : 'No findings in this slice.',
      'Amounts are 2-decimal strings — quote them verbatim. Drill in with list_audit_findings(severity=..., status=...). Never touches Xero.',
    ],
  };
}

// ---- Audit finding evidence: attachments, cube view, links, graph ----

async function listAuditFindingAttachments(args = {}) {
  const id = auditFindingId(args.id);
  const data = await apiRequest(`/audit/findings/${id}/attachments/`);
  const attachments = data?.attachments || [];
  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    finding_id: data?.finding_id ?? id,
    count: data?.count ?? attachments.length,
    attachments,
    agent_brief: [
      attachments.length
        ? `${attachments.length} attachment(s) on finding ${id} — each view_url is signed and opens without auth.`
        : `No attachments on finding ${id}.`,
      'Attachments are human uploads through the console; an agent citing evidence should add a REFERENCE with link_audit_finding (kind slip / xero_document / bank_transaction / journal / invoice / asana) instead. Never touches Xero.',
    ],
  };
}

async function getAuditFindingCube(args = {}) {
  const id = auditFindingId(args.id);
  let data;
  try {
    data = await apiRequest(`/audit/findings/${id}/cube-view/data/`);
  } catch (error) {
    // 404 with this detail is the backend's "no cube saved" — a normal state, not a failure.
    if (error.status === 404 && String(error.payload?.detail || '').includes('no cube view')) {
      return {
        generated_at: new Date().toISOString(),
        api_base_url: apiBaseUrl,
        finding_id: id,
        has_cube: false,
        agent_brief: [
          `Finding ${id} has no saved cube view — a normal state, not an error. Save one with set_audit_finding_cube (confirm=true), previewing with preview_cube first.`,
        ],
      };
    }
    throw error;
  }
  const cube = data?.cube || {};
  const rowCount = (cube.rows || []).length;
  const colCount = (cube.cols || []).length;
  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    finding_id: data?.finding_id ?? id,
    has_cube: true,
    fy: data?.fy,
    name: data?.name ?? null,
    spec: data?.spec,
    query: data?.query,
    params: data?.params,
    cube,
    agent_brief: [
      `Cube${data?.name ? ` "${data.name}"` : ''} on finding ${id}: ${rowCount} row(s) × ${colCount} column(s), grand total ${cube.grand_total ?? 'n/a'} — run live against the journal mirror just now, not a snapshot.`,
      cube.balancing_hint ? `WARNING: ${cube.balancing_hint}` : '',
      'Quote figures verbatim — never round-trip through float. Change the view with set_audit_finding_cube (confirm=true). Never touches Xero.',
    ].filter(Boolean),
  };
}

async function setAuditFindingCube(args = {}) {
  const id = auditFindingId(args.id);
  // cubeSpecFrom is the SAME builder the Excel add-in path uses (preview_cube /
  // save_cube_view) — required-arg + axis validation happens here, BEFORE the
  // confirm gate, and keeps the stored spec byte-compatible with the add-in.
  const spec = cubeSpecFrom(args);
  requireConfirm(args, 'save a cube view on an audit finding');
  const body = { spec };
  if (args.query && typeof args.query === 'object') body.query = args.query;
  if (args.name !== undefined && args.name !== null && String(args.name).trim() !== '') body.name = String(args.name).trim();
  if (args.cube_note !== undefined && args.cube_note !== null) body.cube_note = String(args.cube_note);
  const data = await apiRequest(`/audit/findings/${id}/cube-view/`, { method: 'PUT', body });
  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    finding_id: data?.finding_id ?? id,
    fy: data?.fy,
    name: data?.name ?? null,
    spec: data?.spec ?? spec,
    query: data?.query ?? body.query ?? {},
    cube_note: data?.cube_note ?? '',
    agent_brief: [
      `Saved cube view${data?.name ? ` "${data.name}"` : ''} on finding ${id} — it replaces any previous cube on this finding.`,
      'Read it back (run live) with get_audit_finding_cube(id). This wrote to Klikk\'s own findings register only, never Xero.',
    ],
  };
}

async function linkAuditFinding(args = {}) {
  const id = auditFindingId(args.id);
  const kind = String(args.kind || '').trim();
  if (!kind) throw new Error('kind is required (slip, xero_document, bank_transaction, journal, invoice or asana)');
  const ref = String(args.ref || '').trim();
  if (!ref) throw new Error('ref is required');
  requireConfirm(args, 'link evidence to an audit finding');
  const body = { kind, ref };
  if (args.label !== undefined && args.label !== null && String(args.label).trim() !== '') body.label = String(args.label);
  const data = await apiRequest(`/audit/findings/${id}/links/`, { method: 'POST', body });
  const link = data?.link ?? data;
  const created = data?.created === true;
  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    created,
    link,
    agent_brief: [
      created
        ? `Linked ${kind} ${ref} to finding ${id} as link ${link?.id ?? '?'}.`
        : `That ${kind} link already existed on finding ${id} (link ${link?.id ?? '?'}) — idempotent, nothing new was created.`,
      link?.ref && link.ref !== ref ? `The ref was canonicalised server-side and stored as ${link.ref} — for journal/invoice a bare number means the KLIKK tenant; qualify as <tenant_uuid>:<number> if you meant Tremly or Dippenaar.` : '',
      link?.resolved && link.resolved.found === false ? 'WARNING: the ref did not resolve to a known record (dangling refs are stored, not rejected) — double-check it.' : '',
      'Remove with unlink_audit_finding(link_id). This wrote to Klikk\'s own findings register only, never Xero.',
    ].filter(Boolean),
  };
}

async function unlinkAuditFinding(args = {}) {
  if (args.link_id === undefined || args.link_id === null || String(args.link_id).trim() === '') throw new Error('link_id is required');
  const linkId = Number(args.link_id);
  if (!Number.isFinite(linkId)) throw new Error('link_id is required');
  requireConfirm(args, 'remove a link from an audit finding');
  const data = await apiRequest(`/audit/findings/links/${linkId}/`, { method: 'DELETE' });
  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    deleted: data?.deleted === true,
    link_id: data?.id ?? linkId,
    agent_brief: [
      `Link ${data?.id ?? linkId} removed. Only the link row was deleted — the finding and the referenced record are untouched. Klikk's own register only, never Xero.`,
    ],
  };
}

async function auditFindingGraph(args = {}) {
  const fy = auditFyOrNull(args.fy);
  const nodeType = args.node_type === undefined || args.node_type === null ? '' : String(args.node_type).trim();
  const nodeId = args.node_id === undefined || args.node_id === null ? '' : String(args.node_id).trim();
  if ((nodeType && !nodeId) || (!nodeType && nodeId)) {
    throw new Error('node_type and node_id must be supplied together');
  }
  const params = new URLSearchParams();
  if (fy !== null) params.set('fy', String(fy));
  if (nodeType) {
    params.set('node_type', nodeType);
    params.set('node_id', nodeId);
  }
  if (args.depth !== undefined && args.depth !== null) params.set('depth', String(clampNumber(args.depth, 1, 1, 2)));
  const qs = params.toString();
  const data = await apiRequest(`/audit/findings/graph/${qs ? `?${qs}` : ''}`);
  const nodes = data?.nodes || [];
  const edges = data?.edges || [];
  const scope = data?.fy
    ? ` for FY${data.fy}`
    : (nodeType ? ' across ALL financial years (deliberate: naming a node asks "which findings cite this", not "in some default year")' : '');
  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    fy: data?.fy ?? fy,
    current_fy: data?.current_fy,
    depth: data?.depth,
    truncated: data?.truncated === true,
    nodes,
    edges,
    agent_brief: [
      `${nodes.length} node(s), ${edges.length} edge(s)${scope}${data?.truncated ? ' — TRUNCATED at the 500-edge cap; narrow with fy or a more specific node' : ''}.`,
      'Edges run finding → evidence (slip / xero_document / bank_transaction / journal / invoice / asana / attachment / check); traversal from a named node walks BOTH directions. Read-only over Klikk\'s own tables — never Xero.',
    ],
  };
}

// ---- Equipment price list (Klikk event-gear rate card; /api/pricelist/ — never Xero) ----

const PRICELIST_TYPES = ['LIST', 'TRADE', 'SPECIAL'];

function pricelistCode(value) {
  const code = String(value || '').trim();
  if (!code) throw new Error('code is required (e.g. DB-V10P)');
  return code;
}

function pricelistDateOrNull(value, field = 'date') {
  if (value === undefined || value === null || value === '') return null;
  const date = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`${field} must be YYYY-MM-DD`);
  return date;
}

function pricelistTypeOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const type = String(value).trim().toUpperCase();
  if (!PRICELIST_TYPES.includes(type)) throw new Error(`price type must be one of ${PRICELIST_TYPES.join(', ')}`);
  return type;
}

function pricelistMoney(value) {
  const numeric = Number(value);
  if (value === undefined || value === null || String(value).trim() === '' || !Number.isFinite(numeric)) {
    throw new Error('price must be a finite number (ex VAT, ZAR)');
  }
  if (numeric < 0) throw new Error('price must be >= 0');
  return numeric;
}

function pricelistCustomerLabel(data) {
  if (!data) return null;
  if (data.customer && typeof data.customer === 'object') return data.customer.name || data.customer.contacts_id || null;
  return data.customer_name || data.customer_id || null;
}

async function pricelistListItems(args = {}) {
  const params = new URLSearchParams();
  appendSearchParam(params, 'category', args.category);
  const activeOnly = args.active_only !== false;
  if (activeOnly) params.set('active', '1');
  appendSearchParam(params, 'q', args.q);
  appendSearchParam(params, 'customer', args.customer);
  appendSearchParam(params, 'date', pricelistDateOrNull(args.date));
  const query = params.toString();
  const data = await apiRequest(`/api/pricelist/items/${query ? `?${query}` : ''}`);
  const items = data?.items || [];
  const customerLabel = pricelistCustomerLabel(data);
  const unpriced = items.filter((row) => row.current_price === null || row.current_price === undefined).length;
  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    count: data?.count ?? items.length,
    categories: data?.categories || [],
    customer: data?.customer || null,
    filters: {
      category: args.category || null,
      active_only: activeOnly,
      q: args.q || null,
      customer: args.customer || null,
      date: args.date || null,
    },
    items,
    agent_brief: [
      `${data?.count ?? items.length} rate-card item(s)${args.category ? ` in category ${args.category}` : ''}${activeOnly ? ' (active only)' : ' (including inactive)'}${args.q ? ` matching "${args.q}"` : ''}.`,
      'All prices are ex VAT in ZAR; current_price is the LIST rate in force on the requested date (default today).',
      customerLabel
        ? `Customer ${customerLabel}: customer_price / customer_price_type show their negotiated rate next to the list price (absent = they pay list).`
        : 'Pass customer= (Xero contacts_id or contact name) to see a customer\'s negotiated rate alongside the list price.',
      unpriced ? `${unpriced} item(s) have no current price — set one with pricelist_set_price before quoting them.` : 'Every listed item has a current price.',
      'Build a quote with pricelist_build_quote (nothing persisted). This is Klikk\'s own price list — never Xero.',
    ],
  };
}

async function pricelistGetPrice(args = {}) {
  const code = pricelistCode(args.code);
  const params = new URLSearchParams();
  appendSearchParam(params, 'date', pricelistDateOrNull(args.date));
  appendSearchParam(params, 'customer', args.customer);
  appendSearchParam(params, 'type', pricelistTypeOrNull(args.type));
  const query = params.toString();
  const data = await apiRequest(`/api/pricelist/items/${encodeURIComponent(code)}/price/${query ? `?${query}` : ''}`);
  const resolved = data?.resolved !== false && data?.price !== null && data?.price !== undefined;
  const fellBack = Boolean(data?.fallback_to_list);
  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    ...data,
    agent_brief: [
      resolved
        ? `${data.code || code} (${data.name || 'n/a'}): R${data.price} ex VAT per ${data.unit || 'unit'} on ${data.date || args.date || 'today'} — price_type ${data.price_type || 'n/a'}${data.customer_name ? ` for ${data.customer_name}` : ''}, valid ${data.valid_from || '?'} → ${data.valid_to || 'open'}${data.set_by ? `, set_by ${data.set_by}` : ''}.`
        : `${code}: no price could be resolved for ${data?.date || args.date || 'today'}${args.customer ? ` / customer ${args.customer}` : ''} — set one with pricelist_set_price.`,
      fellBack
        ? `FELL BACK TO LIST: requested ${data?.requested_price_type || args.type || 'LIST'}${args.customer ? ` for ${data?.customer_name || args.customer}` : ''} but no such row exists, so the LIST price is shown (fallback_to_list=true).`
        : `No fallback: the ${data?.price_type || 'requested'} price was found directly (fallback_to_list=false).`,
      data?.note ? `Note on this price: ${data.note}` : 'Price is ex VAT in ZAR. Klikk\'s own price list — never Xero.',
    ],
  };
}

async function pricelistPriceHistory(args = {}) {
  const code = pricelistCode(args.code);
  const limit = clampNumber(args.limit, 50, 1, 200);
  const data = await apiRequest(`/api/pricelist/items/${encodeURIComponent(code)}/prices/`);
  const all = data?.prices || [];
  const prices = all.slice(0, limit);
  const open = all.filter((row) => row.valid_to === null || row.valid_to === undefined);
  const latest = prices[0];
  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    code: data?.code || code,
    total_count: data?.count ?? all.length,
    count: prices.length,
    truncated: all.length > prices.length,
    prices,
    agent_brief: [
      prices.length
        ? `${prices.length} of ${data?.count ?? all.length} price row(s) for ${data?.code || code}, newest first; latest R${latest.price} ex VAT (${latest.price_type || 'LIST'}${latest.customer_name ? ` for ${latest.customer_name}` : ''}) from ${latest.valid_from} to ${latest.valid_to || 'open'}, set_by ${latest.set_by || 'n/a'}.`
        : `No price rows for ${code} yet — add one with pricelist_set_price.`,
      `valid_to null = still current (${open.length} open row(s) across LIST / TRADE / SPECIAL / customers); set_by shows who changed it (claude-mcp = set via this server).`,
      'Prices are ex VAT in ZAR. Klikk\'s own price list — never Xero.',
    ],
  };
}

async function pricelistBuildQuote(args = {}) {
  if (!Array.isArray(args.lines) || args.lines.length === 0) throw new Error('lines is required: a non-empty array of {code, qty?, days?}');
  const lines = args.lines.map((line, index) => {
    if (!line || typeof line !== 'object') throw new Error(`lines[${index}] must be an object {code, qty?, days?}`);
    const code = String(line.code || '').trim();
    if (!code) throw new Error(`lines[${index}].code is required`);
    const qty = line.qty === undefined || line.qty === null || line.qty === '' ? 1 : Number(line.qty);
    const days = line.days === undefined || line.days === null || line.days === '' ? 1 : Number(line.days);
    if (!Number.isFinite(qty) || qty <= 0) throw new Error(`lines[${index}].qty must be a positive number`);
    if (!Number.isFinite(days) || days <= 0) throw new Error(`lines[${index}].days must be a positive number`);
    return { code, qty, days };
  });
  const body = { lines };
  if (args.customer) body.customer = String(args.customer);
  const date = pricelistDateOrNull(args.date);
  if (date) body.date = date;
  if (args.discount_pct !== undefined && args.discount_pct !== null && args.discount_pct !== '') {
    const discount = Number(args.discount_pct);
    if (!Number.isFinite(discount) || discount < 0 || discount > 100) throw new Error('discount_pct must be between 0 and 100');
    body.discount_pct = discount;
  }
  if (args.vat_rate !== undefined && args.vat_rate !== null && args.vat_rate !== '') {
    const vat = Number(args.vat_rate);
    if (!Number.isFinite(vat) || vat < 0 || vat > 1) throw new Error('vat_rate must be a fraction between 0 and 1 (0.15 = 15%)');
    body.vat_rate = vat;
  }
  const data = await apiRequest('/api/pricelist/quote/', { method: 'POST', body });
  const warnings = data?.warnings || [];
  const quoteLines = data?.lines || [];
  const unpriced = quoteLines.filter((row) => row.priced === false);
  const brief = [];
  if (warnings.length) {
    brief.push(`WARNINGS (${warnings.length}) — resolve before quoting the client: ${warnings.map((w) => (typeof w === 'string' ? w : JSON.stringify(w))).join(' | ')}`);
  }
  if (unpriced.length) {
    brief.push(`${unpriced.length} line(s) unpriced and EXCLUDED from the totals: ${unpriced.map((row) => row.code).join(', ')}.`);
  }
  brief.push(
    `Quote for ${data?.customer_name || (data?.customer_id ? `customer ${data.customer_id}` : 'list-price customer')} on ${data?.date || 'today'}: ${quoteLines.length} line(s), subtotal R${data?.subtotal ?? 'n/a'}, discount R${data?.discount ?? '0.00'} (${data?.discount_pct ?? 0}%), ex VAT R${data?.ex_vat ?? 'n/a'}, VAT R${data?.vat ?? 'n/a'} @ ${data?.vat_rate ?? 'n/a'}, INCL VAT R${data?.incl_vat ?? 'n/a'} (ZAR).`,
    'NOTHING WAS PERSISTED — this is a calculation only; no quote exists in Klikk or Xero. Per-line price_type shows LIST vs a customer TRADE/SPECIAL rate.',
  );
  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    persisted: false,
    ...data,
    warnings,
    agent_brief: brief,
  };
}

async function pricelistSetPrice(args = {}) {
  if (args.confirm !== true) {
    throw new Error('Refusing to set a price without confirm=true (this writes a row to Klikk\'s local price list — not Xero).');
  }
  const code = pricelistCode(args.code);
  const validFrom = pricelistDateOrNull(args.valid_from, 'valid_from');
  if (!validFrom) throw new Error('valid_from is required (YYYY-MM-DD)');
  const price = pricelistMoney(args.price);
  const priceType = pricelistTypeOrNull(args.price_type) || 'LIST';
  const body = {
    price,
    valid_from: validFrom,
    price_type: priceType,
    set_by: 'claude-mcp',
  };
  if (args.customer) body.customer = String(args.customer);
  if (args.note) body.note = String(args.note);
  const data = await apiRequest(`/api/pricelist/items/${encodeURIComponent(code)}/prices/`, { method: 'POST', body });
  const row = data?.price || {};
  const closed = data?.closed_previous || null;
  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    code,
    price: row,
    closed_previous: closed,
    agent_brief: [
      `New price row id=${row.id ?? 'n/a'} for ${code}: R${row.price ?? price} ex VAT (${row.price_type || priceType}${row.customer_name ? ` for ${row.customer_name}` : ''}) valid from ${row.valid_from || validFrom}${row.valid_to ? ` to ${row.valid_to}` : ' (open)'}, set_by ${row.set_by || 'claude-mcp'}${row.note ? ` — "${row.note}"` : ''}.`,
      closed
        ? `Closed previous row id=${closed.id ?? 'n/a'} (R${closed.price} ${closed.price_type || ''}${closed.customer_name ? ` for ${closed.customer_name}` : ''}, from ${closed.valid_from}) → valid_to now ${closed.valid_to || 'n/a'}.`
        : 'Nothing was closed — there was no previous open row of this type/customer for this item.',
      'Written to Klikk\'s own price list only — Xero is untouched. Use pricelist_price_history to verify.',
    ],
  };
}

async function pricelistUpsertItem(args = {}) {
  if (args.confirm !== true) {
    throw new Error('Refusing to create/update a price-list item without confirm=true (this writes to Klikk\'s local price list — not Xero).');
  }
  const code = pricelistCode(args.code);
  const name = String(args.name || '').trim();
  if (!name) throw new Error('name is required');
  const body = { code, name, set_by: 'claude-mcp', replace: args.replace === true };
  for (const key of ['category', 'unit', 'description', 'xero_account_code', 'xero_tracking_option_id', 'xero_purchase_line_id', 'notes']) {
    if (args[key] !== undefined && args[key] !== null) body[key] = String(args[key]);
  }
  if (args.qty_owned !== undefined && args.qty_owned !== null && args.qty_owned !== '') {
    const qty = Number(args.qty_owned);
    if (!Number.isFinite(qty) || qty < 0) throw new Error('qty_owned must be a number >= 0');
    body.qty_owned = qty;
  }
  if (typeof args.active === 'boolean') body.active = args.active;
  let data;
  try {
    data = await apiRequest('/api/pricelist/items/', { method: 'POST', body });
  } catch (error) {
    if (error.status === 409) {
      throw new Error(`Item ${code} already exists — pass replace=true to update the existing item (and confirm=true). API said: ${error.message}`);
    }
    throw error;
  }
  const item = data?.item || {};
  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    created: data?.created,
    item,
    agent_brief: [
      `${data?.created ? 'Created' : 'Updated'} rate-card item ${item.code || code} (${item.name || name})${item.category ? ` in ${item.category}` : ''}${item.unit ? `, unit ${item.unit}` : ''}${item.active === false ? ' — INACTIVE' : ''}.`,
      item.current_price !== null && item.current_price !== undefined
        ? `Current LIST price R${item.current_price} ex VAT from ${item.current_price_valid_from || 'n/a'}.`
        : 'No current price yet — set one with pricelist_set_price(code, price, valid_from, confirm=true).',
      'Written to Klikk\'s own price list only — Xero is untouched.',
    ],
  };
}

function cubeCommentCoordinates(comment) {
  // The anchor is axis-independent on purpose: a cell is identified by which
  // dimension holds which value, not by whether MC dragged the field onto rows
  // or onto columns. Flattening both axes into one {dimension: value} object
  // stops the same figure reading as two different figures.
  const coordinates = {};
  const rowDims = comment?.row_dims || [];
  const rowPath = comment?.row_path || [];
  rowDims.forEach((dim, i) => {
    if (rowPath[i] !== undefined) coordinates[dim] = rowPath[i];
  });
  const rawCol = comment?.col_path;
  const colParts = (rawCol && String(rawCol) !== 'Total') ? String(rawCol).split(' | ') : [];
  (comment?.col_dims || []).forEach((dim, i) => {
    if (colParts[i] !== undefined && colParts[i] !== '') coordinates[dim] = colParts[i];
  });
  return coordinates;
}

function cubeCommentFilters(comment) {
  // The API stores the filter context as a JSON string on some rows and as an
  // object on others; normalise so callers always get a plain object.
  const raw = comment?.filters;
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof raw === 'object' ? raw : {};
}

function normaliseCubeTags(raw) {
  // Mirrors the server's normalisation so a filter built here matches what was
  // stored. The API normalises again — this is for a predictable round trip,
  // not a substitute for it.
  const list = Array.isArray(raw) ? raw : (typeof raw === 'string' ? raw.split(',') : []);
  const out = [];
  for (const item of list) {
    const tag = String(item ?? '').trim().replace(/^#+/, '').trim().toLowerCase().slice(0, 40);
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length >= 20) break;
  }
  return out;
}

function presentCubeComment(comment) {
  return {
    id: comment?.id,
    status: comment?.status,
    comment: comment?.comment,
    author: comment?.author || null,
    measure: comment?.measure,
    coordinates: cubeCommentCoordinates(comment),
    cell_value: comment?.cell_value,
    filter_context: cubeCommentFilters(comment),
    tags: Array.isArray(comment?.tags) ? comment.tags : [],
    updated_at: comment?.updated_at,
  };
}

const CUBE_COMMENT_STATUSES = ['open', 'actioned', 'dismissed'];
const CUBE_DRILL_FILTER_KEYS = ['tenant', 'date_from', 'date_to', 'account', 'contact', 'reference', 'description', 'amount', 'q', 'journal_type'];

/* A cube spec, as the Excel add-in stores and reads it.

   Shared by preview and save so the thing previewed is exactly the thing
   saved — a preview built from a different shape than the save would be worse
   than no preview at all. */
function cubeSpecFrom(args) {
  const rows = Array.isArray(args.rows) ? args.rows.filter(Boolean).map(String) : [];
  if (!rows.length) throw new Error('rows is required: at least one row dimension key (see list_cube_dimensions)');
  const cols = Array.isArray(args.cols) ? args.cols.filter(Boolean).map(String) : [];
  const dup = rows.filter((r) => cols.includes(r));
  if (dup.length) throw new Error(`a dimension cannot be on both axes: ${dup.join(', ')}`);

  const filters = {};
  if (args.filters && typeof args.filters === 'object') {
    for (const [k, v] of Object.entries(args.filters)) {
      if (Array.isArray(v) && v.length) filters[k] = v.map(String);
    }
  }
  const totals = {};
  if (args.totals && typeof args.totals === 'object') {
    for (const [k, v] of Object.entries(args.totals)) totals[k] = !!v;
  }
  return {
    rows,
    cols,
    measure: String(args.measure || 'amount'),
    filt: Object.keys(filters).filter((k) => !rows.includes(k) && !cols.includes(k)),
    filters,
    totals,
    suppress: args.suppress === undefined ? true : !!args.suppress,
    outline: args.outline === undefined ? true : !!args.outline,
  };
}

/** The pivot query params for a spec — same shape the add-in sends. */
function cubeQueryParams(spec, query) {
  const params = { rows: spec.rows.join(','), cols: spec.cols.join(','), measure: spec.measure,
                   suppress: spec.suppress ? '1' : '0' };
  const live = {};
  for (const [k, v] of Object.entries(spec.filters || {})) if (v && v.length) live[k] = v;
  if (Object.keys(live).length) params.dimf = JSON.stringify(live);

  const rowParents = spec.rows.slice(0, -1);
  const on = (k, zone) => (Object.prototype.hasOwnProperty.call(spec.totals || {}, k)
    ? !!spec.totals[k] : zone === 'rows');
  if (rowParents.some((k) => !on(k, 'rows'))) {
    const keep = rowParents.filter((k) => on(k, 'rows'));
    params.rtotals = keep.length ? keep.join(',') : '__none__';
  }
  const ct = spec.cols.slice(0, -1).filter((k) => on(k, 'cols'));
  if (ct.length) params.ctotals = ct.join(',');

  for (const [k, v] of Object.entries(query || {})) {
    if (v !== null && v !== undefined && String(v) !== '') params[k] = String(v);
  }
  return params;
}

async function listCubeDimensions() {
  const data = await apiRequest('/xero/data/journals/pivot/dimensions/');
  return {
    generated_at: new Date().toISOString(),
    dimensions: data?.dimensions || [],
    measures: data?.measures || [],
    agent_brief: 'Use the KEY, not the label, in rows/cols/filters. A dimension cannot appear on both axes. '
      + 'Note the journal mirror double-counts across journal_type — filter it in `query` (e.g. journal_type: "journal") '
      + 'unless you mean to see every mirror of an entry.',
  };
}

async function previewCube(args = {}) {
  const spec = cubeSpecFrom(args);
  const params = cubeQueryParams(spec, args.query);
  const data = await apiRequest(`/xero/data/journals/pivot/?${new URLSearchParams(params)}`);
  const cap = clampNumber(args.limit_rows, 60, 1, 500);
  const rows = data?.rows || [];
  return {
    generated_at: new Date().toISOString(),
    spec,
    measure: data?.measure_label,
    cols: data?.cols || [],
    rows: rows.slice(0, cap),
    rows_returned: Math.min(rows.length, cap),
    rows_total: rows.length,
    col_totals: data?.col_totals,
    grand_total: data?.grand_total,
    balancing_hint: data?.balancing_hint,
    agent_brief: [
      data?.balancing_hint
        ? `WARNING: ${data.balancing_hint}`
        : `${rows.length} row(s), ${(data?.cols || []).length} column(s), grand total ${data?.grand_total}.`,
      rows.length > cap ? `Only the first ${cap} rows are shown; totals cover all of them.` : '',
      'Check the numbers say what you intend BEFORE save_cube_view — a wrong dimension gives a plausible view that MC only discovers by opening it.',
    ].filter(Boolean).join(' '),
  };
}

async function saveCubeView(args = {}) {
  const name = String(args.name || '').trim();
  if (!name) throw new Error('name is required — it is what MC picks from the dropdown');
  const spec = cubeSpecFrom(args);
  const query = (args.query && typeof args.query === 'object') ? args.query : {};

  const data = await apiRequest('/xero/data/journals/pivot/views/', {
    method: 'POST',
    body: { name, spec, query, author: String(args.author || '').trim() },
  });
  return {
    generated_at: new Date().toISOString(),
    id: data?.id,
    name: data?.name,
    spec,
    agent_brief: `Saved as "${name}". MC opens it from Saved views in the Excel add-in's Cube panel and clicks Open; `
      + 'the sheet builds itself with these rows, columns, subsets and filters. Tell him the name — he cannot guess it. '
      + 'Re-saving the same name replaces it.',
  };
}

async function deleteCubeView(args = {}) {
  const name = String(args.name || '').trim();
  if (!name) throw new Error('name is required');
  const data = await apiRequest(`/xero/data/journals/pivot/views/?name=${encodeURIComponent(name)}`,
    { method: 'DELETE' });
  return {
    generated_at: new Date().toISOString(),
    deleted: data?.deleted || 0,
    agent_brief: data?.deleted
      ? `Removed the saved view "${name}". Any sheet already built from it is untouched.`
      : `No saved view called "${name}".`,
  };
}

async function addCubeComment(args = {}) {
  const coords = args.coordinates;
  if (!coords || typeof coords !== 'object' || Array.isArray(coords) || !Object.keys(coords).length) {
    throw new Error('coordinates is required: {dimension: value}, e.g. {"account":"406 — Consulting","fin_year":"FY2023"}');
  }
  const author = String(args.author || '').trim();
  if (!author) {
    throw new Error("author is required — the MCP authenticates with a shared service credential, so it cannot tell who is writing. Pass something like 'claude:year-end-audit'.");
  }
  const comment = args.comment === undefined || args.comment === null ? '' : String(args.comment);

  // The stored anchor is axis-independent: cell_key is computed from the
  // {dimension: value} map, not from which axis a value sat on. So sending
  // every coordinate as a row dimension produces exactly the same key as the
  // add-in would for the same figure -- an agent comment and MC's own comment
  // on one cell are the same anchor, not two.
  const dims = Object.keys(coords);
  const body = {
    measure: String(args.measure || 'amount'),
    row_dims: dims,
    row_path: dims.map((d) => String(coords[d])),
    col_dims: [],
    col_path: 'Total',
    filters: (args.filters && typeof args.filters === 'object') ? args.filters : {},
    comment,
    author,
  };
  if (args.cell_value !== undefined && args.cell_value !== null && Number.isFinite(Number(args.cell_value))) {
    body.cell_value = Number(args.cell_value);
  }
  if (args.status) body.status = String(args.status).trim();
  const tags = normaliseCubeTags(args.tags);
  if (tags.length) body.tags = tags;

  const data = await apiRequest('/xero/data/journals/pivot/comments/', { method: 'POST', body });

  if (data && data.deleted !== undefined) {
    return {
      generated_at: new Date().toISOString(),
      retracted: true,
      deleted: data.deleted,
      coordinates: coords,
      agent_brief: data.deleted
        ? `Retracted your comment on that cell. Nobody else's comment was touched — comments are per author.`
        : 'You had no comment on that cell, so nothing was retracted.',
    };
  }

  return {
    generated_at: new Date().toISOString(),
    id: data?.id,
    status: data?.status,
    author: data?.author,
    author_verified: data?.author_verified === true,
    coordinates: coords,
    cell_value: data?.cell_value,
    tags: Array.isArray(data?.tags) ? data.tags : [],
    mentions: data?.mentions || null,
    agent_brief: [
      `Comment ${data?.id} saved as "${author}" on that figure.`,
      'It shows up in MC\'s Excel sheet on the cell itself once he refreshes or reopens that sheet.',
      'Re-posting the same coordinates as the same author edits this comment; an empty comment retracts it.',
      (Array.isArray(data?.tags) && data.tags.length)
        ? `Tagged ${data.tags.join(', ')} — pull this queue back with list_cube_comments(tag="${data.tags[0]}").`
        : '',
      cubeMentionBrief(data?.mentions),
      data?.author_verified === true ? '' : 'Attribution is self-declared — the MCP uses a shared service credential.',
    ].filter(Boolean).join(' '),
  };
}

function cubeMentionBrief(mentions) {
  // An @mention that resolved to nobody, or failed to send, must be SAID OUT
  // LOUD to whoever wrote the comment. A mention that quietly goes nowhere is
  // worse than an error, and the agent that wrote it is the only one in a
  // position to fix the handle or add the person to the directory.
  if (!mentions) return '';
  const parts = [];
  const notified = mentions.notified || [];
  const already = mentions.already_notified || [];
  const failed = mentions.failed || [];
  const unresolved = mentions.unresolved || [];
  if (notified.length) parts.push(`Emailed ${notified.join(', ')}.`);
  if (already.length) parts.push(`${already.join(', ')} had already been notified about this comment — not emailed again.`);
  if (unresolved.length) {
    parts.push(`UNRESOLVED mention(s): ${unresolved.join(', ')} — nobody was emailed. Tell MC, and either fix the handle or add the person via the people directory (POST /xero/data/journals/pivot/people/).`);
  }
  if (failed.length) {
    parts.push(`Mention email FAILED for ${failed.map((f) => `${f.email} (${f.error})`).join('; ')}. The comment itself saved fine; the failure is recorded in app.cube_comment_mentions. Report it rather than assuming they were told.`);
  }
  return parts.join(' ');
}

async function addComment(args = {}) {
  const subject_type = String(args.subject_type || '').trim();
  const subject_key = String(args.subject_key || '').trim();
  if (!subject_type || !subject_key) {
    throw new Error('subject_type and subject_key are required (bank_txn + the Investec transaction uuid, for example)');
  }
  if (subject_type === 'cube_cell') {
    throw new Error('use add_cube_comment for a cube cell — it builds the anchor from coordinates');
  }
  const author = String(args.author || '').trim();
  if (!author) {
    throw new Error("author is required — the MCP authenticates with a shared credential, so it cannot tell who is writing. Pass e.g. 'claude:bank-recon'.");
  }

  const body = {
    subject_type, subject_key,
    subject_label: String(args.subject_label || '').trim(),
    comment: args.comment === undefined || args.comment === null ? '' : String(args.comment),
    author,
    tags: Array.isArray(args.tags) ? args.tags.map(String) : [],
    context: (args.context && typeof args.context === 'object') ? args.context : {},
  };
  if (args.value !== undefined && args.value !== null && Number.isFinite(Number(args.value))) {
    body.value = Number(args.value);
  }
  if (args.status) body.status = String(args.status).trim();

  const data = await apiRequest('/xero/data/comments/', { method: 'POST', body });
  if (data && data.deleted !== undefined) {
    return {
      generated_at: new Date().toISOString(), retracted: true, deleted: data.deleted,
      agent_brief: data.deleted
        ? "Retracted your comment on that subject. Nobody else's was touched — comments are per author."
        : 'You had no comment on that subject.',
    };
  }
  return {
    generated_at: new Date().toISOString(),
    id: data?.id, subject_type: data?.subject_type, subject_key: data?.subject_key,
    tags: data?.tags, status: data?.status, author: data?.author,
    author_verified: data?.author_verified === true,
    agent_brief: `Comment ${data?.id} saved as "${author}" on ${subject_type} ${subject_key}.`
      + (data?.tags?.length ? ` Tagged ${data.tags.join(', ')}.` : '')
      + ' MC sees it in the console comment queue. Re-posting the same subject as the same author edits it.',
  };
}

async function listComments(args = {}) {
  const params = new URLSearchParams();
  params.set('status', String(args.status || 'open').trim() || 'open');
  params.set('limit', String(clampNumber(args.limit, 500, 1, 5000)));
  for (const k of ['subject_type', 'subject_key', 'author', 'tag', 'tags']) {
    if (args[k]) params.set(k, String(args[k]).trim());
  }
  const data = await apiRequest(`/xero/data/comments/?${params}`);
  const results = (data?.results || []).map((c) => ({
    id: c.id,
    subject_type: c.subject_type,
    subject_key: c.subject_key,
    subject: c.subject_label || null,
    status: c.status,
    tags: c.tags,
    comment: c.comment,
    author: c.author,
    value: c.cell_value,
    context: cubeCommentFilters(c),
    updated_at: c.updated_at,
  }));
  const kinds = [...new Set(results.map((r) => r.subject_type))];
  return {
    generated_at: new Date().toISOString(),
    count: results.length,
    comments: results,
    agent_brief: results.length
      ? `${results.length} comment(s) across ${kinds.join(', ') || 'no'} subject(s). `
        + 'Use set_cube_comment_status(id, "actioned") when one is dealt with — it works for every subject kind, not only cube cells.'
      : 'Nothing matches — no work waiting under those filters.',
  };
}

async function listCubeComments(args = {}) {
  const params = new URLSearchParams();
  params.set('status', String(args.status || 'open').trim() || 'open');
  params.set('limit', String(clampNumber(args.limit, 500, 1, 5000)));
  for (const key of ['measure', 'tenant', 'author']) {
    if (args[key] !== undefined && args[key] !== null && String(args[key]).trim() !== '') {
      params.set(key, String(args[key]).trim());
    }
  }
  const tagList = normaliseCubeTags(args.tags);
  if (tagList.length) params.set('tags', tagList.join(','));
  if (args.tag !== undefined && args.tag !== null && String(args.tag).trim() !== '') {
    params.set('tag', String(args.tag).trim());
  }
  const data = await apiRequest(`/xero/data/journals/pivot/comments/?${params}`);
  const comments = (data?.results || []).map(presentCubeComment);
  const open = comments.filter((c) => c.status === 'open').length;
  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    count: comments.length,
    comments,
    agent_brief: [
      comments.length
        ? `${comments.length} comment(s) returned, ${open} still open.`
        : 'No comments match — nothing waiting in the queue.',
      'Each comment names its figure by axis-independent coordinates ({dimension: value}) plus the filter_context that produced the number — the same coordinates under different filters is a DIFFERENT figure.',
      'Reproduce the number before concluding: get_comment_transactions(id) returns the journal lines behind it and checks them back to the stored cell_value.',
      'Call set_cube_comment_status(id, "actioned") once you have dealt with one, or "dismissed" if it needs no action — and tell MC why either way.',
      (args.tag || tagList.length)
        ? 'This is a TAG-FILTERED slice, not the whole queue — say so if you report a count.'
        : 'Filter with tag="audit" (or tags=["audit","fy2026"], which requires ALL of them) to pull just one workstream.',
    ].join(' '),
  };
}

async function setCubeCommentStatus(args = {}) {
  const id = Number(args.id);
  if (!Number.isFinite(id) || id <= 0) throw new Error('id is required (from list_cube_comments)');
  const status = String(args.status || '').trim();
  if (!CUBE_COMMENT_STATUSES.includes(status)) {
    throw new Error(`status must be one of ${CUBE_COMMENT_STATUSES.join(', ')}`);
  }
  const data = await apiRequest(`/xero/data/journals/pivot/comments/${id}/status/`, {
    method: 'POST',
    body: { status },
  });
  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    updated: { id: data?.id ?? id, status: data?.status ?? status, comment: data?.comment },
    agent_brief: `Comment ${id} is now ${data?.status ?? status}. Only app.cube_comments changed — nothing was written to Xero.`,
  };
}

async function getCommentTransactions(args = {}) {
  const id = Number(args.id);
  if (!Number.isFinite(id) || id <= 0) throw new Error('id is required (from list_cube_comments)');
  const limit = clampNumber(args.limit, 500, 1, 5000);

  const lookup = new URLSearchParams({ status: 'all', limit: '5000' });
  const commentPayload = await apiRequest(`/xero/data/journals/pivot/comments/?${lookup}`);
  const raw = (commentPayload?.results || []).find((c) => Number(c?.id) === id);
  if (!raw) throw new Error(`No cube comment with id ${id} — list_cube_comments(status="all") shows what exists.`);

  const coordinates = cubeCommentCoordinates(raw);
  const filters = cubeCommentFilters(raw);
  const params = new URLSearchParams();
  params.set('coords', JSON.stringify(coordinates));
  params.set('limit', String(limit));
  for (const key of CUBE_DRILL_FILTER_KEYS) {
    const value = filters[key];
    if (value === undefined || value === null || String(value).trim() === '') continue;
    params.set(key, String(value).trim());
  }

  const data = await apiRequest(`/xero/data/journals/pivot/drill/?${params}`);
  const rows = data?.rows || [];
  const lineTotal = toNumber(data?.line_total);
  const cellValue = raw?.cell_value === null || raw?.cell_value === undefined ? null : Number(raw.cell_value);
  const reconciled = cellValue === null || !Number.isFinite(cellValue)
    ? null
    : Math.abs(lineTotal - cellValue) <= 0.005;
  const difference = reconciled === null ? null : Number((lineTotal - cellValue).toFixed(2));

  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    comment: presentCubeComment(raw),
    coordinates,
    filter_context: filters,
    measure: raw?.measure,
    count: data?.count ?? rows.length,
    truncated: data?.truncated === true,
    line_total: lineTotal,
    cell_value: cellValue,
    reconciled,
    difference,
    rows,
    agent_brief: [
      `Comment ${id} anchors to ${Object.entries(coordinates).map(([k, v]) => `${k}=${v}`).join(', ') || 'the grand total'} on measure ${raw?.measure || 'amount'}.`,
      `${rows.length} journal line(s) returned${data?.truncated === true ? ' (TRUNCATED — raise limit before totalling)' : ''}, line_total ${lineTotal}.`,
      reconciled === null
        ? 'The comment stored no cell_value, so there is nothing to reconcile against — treat line_total as the current figure.'
        : reconciled
          ? `Reconciled: line_total ties to the cell_value MC commented on (${cellValue}).`
          : `MISMATCH — line_total ${lineTotal} does NOT tie to the cell_value MC commented on (${cellValue}), difference ${difference}. The ledger has moved since the comment was written; say so plainly to MC rather than answering on the new number as if nothing changed.`,
      'Read-only drill on Klikk\'s own copy of the ledger — Xero is untouched.',
    ].join(' '),
  };
}

function kbParams(args, keys) {
  const params = new URLSearchParams();
  for (const key of keys) {
    if (args[key] !== undefined && args[key] !== null && String(args[key]).trim() !== '') {
      params.set(key, String(args[key]).trim());
    }
  }
  return params;
}

async function kbListDocuments() {
  return apiRequest('/api/kb/documents/');
}

async function kbReadDocument(args = {}) {
  const slug = String(args.slug || '').trim();
  if (!slug) throw new Error('slug is required (from kb_list_documents)');
  return apiRequest(`/api/kb/documents/${encodeURIComponent(slug)}/`);
}

async function kbSearch(args = {}) {
  const q = String(args.q || '').trim();
  if (!q) throw new Error('q is required');
  const params = new URLSearchParams({ q, limit: String(clampNumber(args.limit, 5, 1, 50)) });
  return apiRequest(`/api/kb/search/?${params}`);
}

async function kbLookupSupplier(args = {}) {
  const params = kbParams(args, ['name', 'strength']);
  params.set('limit', String(clampNumber(args.limit, 20, 1, 50)));
  return apiRequest(`/api/kb/suppliers/?${params}`);
}

async function kbLookupCustomer(args = {}) {
  const params = kbParams(args, ['name']);
  params.set('limit', String(clampNumber(args.limit, 20, 1, 50)));
  return apiRequest(`/api/kb/customers/?${params}`);
}

async function kbLookupAccount(args = {}) {
  const params = kbParams(args, ['q']);
  params.set('limit', String(clampNumber(args.limit, 25, 1, 50)));
  return apiRequest(`/api/kb/accounts/?${params}`);
}

async function kbListTracking(args = {}) {
  const params = kbParams(args, ['q']);
  if (args.slot !== undefined && args.slot !== null && args.slot !== '') params.set('slot', String(args.slot));
  return apiRequest(`/api/kb/tracking/?${params}`);
}

async function kbListEvents(args = {}) {
  const params = kbParams(args, ['on', 'q']);
  return apiRequest(`/api/kb/events/?${params}`);
}

const SLIP_FILTER_KEYS = [
  'q', 'status', 'synced', 'fy', 'date_from', 'date_to', 'to_process', 'archived',
  'decision', 'category', 'min_total', 'max_total', 'ordering', 'ids_only',
];

async function slipsList(args = {}) {
  const params = new URLSearchParams();
  for (const key of SLIP_FILTER_KEYS) {
    const value = args[key];
    if (value === undefined || value === null || String(value).trim() === '') continue;
    params.set(key, String(value).trim());
  }
  params.set('page', String(clampNumber(args.page, 1, 1, 100000)));
  params.set('page_size', String(clampNumber(args.page_size, 50, 1, 200)));
  const data = await apiRequest(`/audit/receipts/?${params}`);
  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    ...data,
  };
}

async function slipsGet(args = {}) {
  const sha256 = String(args.sha256 || '').trim();
  if (!/^[0-9a-f]{64}$/i.test(sha256)) throw new Error('sha256 is required — a 64-char hex id from slips_list');
  const data = await apiRequest(`/audit/receipts/${encodeURIComponent(sha256)}/`);
  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    ...data,
  };
}

const FILE_MAX_BYTES = 8 * 1024 * 1024;
const MIME_BY_EXT = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
};

function mimeForExt(ext) {
  return MIME_BY_EXT[String(ext || '').toLowerCase()] || 'application/octet-stream';
}

async function slipsFile(args = {}) {
  const sha256 = String(args.sha256 || '').trim();
  if (!/^[0-9a-f]{64}$/i.test(sha256)) throw new Error('sha256 is required — a 64-char hex id from slips_list');
  const detail = await apiRequest(`/audit/receipts/${encodeURIComponent(sha256)}/`);
  if (!detail?.view_url) throw new Error('slip has no view_url — the register row may be missing its file');
  const response = await fetch(detail.view_url);
  if (!response.ok) throw new Error(`slip file fetch failed: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > FILE_MAX_BYTES) {
    throw new Error(`slip file is ${bytes.length} bytes; this tool serves at most ${FILE_MAX_BYTES}. Use the OCR text from slips_get instead.`);
  }
  return {
    __mcpFile: {
      base64: bytes.toString('base64'),
      mimeType: mimeForExt(detail.mime_ext),
      uri: `klikk-slip://${sha256}`,
      note: `Slip ${sha256.slice(0, 12)}… — ${detail.filename || 'unnamed'} (${detail.mime_ext || '?'}, ${bytes.length} bytes, slip_ts ${detail.slip_ts || 'unknown'}). Signed public link: ${detail.view_url}`,
    },
  };
}

async function whatsappListChats(args = {}) {
  const params = kbParams(args, ['q']);
  params.set('limit', String(clampNumber(args.limit, 50, 1, 200)));
  params.set('offset', String(clampNumber(args.offset, 0, 0, 1_000_000)));
  return apiRequest(`/api/whatsapp/chats/?${params}`);
}

async function whatsappSearchMessages(args = {}) {
  const params = kbParams(args, ['q', 'chat_jid', 'sender', 'date_from', 'date_to', 'media_only']);
  params.set('limit', String(clampNumber(args.limit, 50, 1, 500)));
  params.set('offset', String(clampNumber(args.offset, 0, 0, 1_000_000)));
  return apiRequest(`/api/whatsapp/messages/?${params}`);
}

async function whatsappMessageContext(args = {}) {
  const chatJid = String(args.chat_jid || '').trim();
  const messageId = String(args.message_id || '').trim();
  if (!chatJid || !messageId) throw new Error('chat_jid and message_id are required (from whatsapp_search_messages)');
  const params = new URLSearchParams({
    chat_jid: chatJid,
    message_id: messageId,
    before: String(clampNumber(args.before, 5, 0, 50)),
    after: String(clampNumber(args.after, 5, 0, 50)),
  });
  return apiRequest(`/api/whatsapp/context/?${params}`);
}

async function xeroCreateDraftInvoice(args = {}) {
  // Client-side guards duplicate the server's, so a refusal costs no network
  // call and the error names exactly what is missing.
  if (args.confirm !== true) {
    throw new Error('Refused: confirm must be literally true. This tool writes a DRAFT invoice to Xero — only call it on MC\'s explicit instruction.');
  }
  if (!String(args.instruction || '').trim()) {
    throw new Error('Refused: instruction is required — quote MC\'s authorising words for this specific invoice, verbatim.');
  }
  const data = await apiRequest('/xero/data/invoices/create-draft/', { method: 'POST', body: args });
  return {
    generated_at: new Date().toISOString(),
    api_base_url: apiBaseUrl,
    ...data,
    agent_brief: `DRAFT invoice ${data.invoice_number || data.invoice_id} created in ${data.tenant_name} for ${data.contact?.name} — total ${data.total} ${data.currency_code}, logged as audit.xero_writes id ${data.write_log_id}. It affects no ledger until a human approves it in Xero's Drafts queue; deleting it there fully reverses this. Report the invoice number and log id to MC.`,
  };
}

async function whatsappGetAttachment(args = {}) {
  const chatJid = String(args.chat_jid || '').trim();
  const messageId = String(args.message_id || '').trim();
  if (!chatJid || !messageId) throw new Error('chat_jid and message_id are required (from whatsapp_search_messages)');
  const params = new URLSearchParams({ chat_jid: chatJid, message_id: messageId });
  const data = await apiRequest(`/api/whatsapp/attachment/?${params}`);
  return {
    __mcpFile: {
      base64: data.base64,
      mimeType: mimeForExt(data.mime_ext),
      uri: `klikk-wa-attachment://${encodeURIComponent(messageId)}`,
      note: `WhatsApp attachment ${data.filename || 'unnamed'} (${data.mime_ext || '?'}, ${data.byte_size} bytes) from message ${messageId}.`,
    },
  };
}

const toolHandlers = {
  slips_list: slipsList,
  slips_get: slipsGet,
  slips_file: slipsFile,
  whatsapp_list_chats: whatsappListChats,
  whatsapp_search_messages: whatsappSearchMessages,
  whatsapp_message_context: whatsappMessageContext,
  whatsapp_get_attachment: whatsappGetAttachment,
  xero_create_draft_invoice: xeroCreateDraftInvoice,
  kb_list_documents: kbListDocuments,
  kb_read_document: kbReadDocument,
  kb_search: kbSearch,
  kb_lookup_supplier: kbLookupSupplier,
  kb_lookup_customer: kbLookupCustomer,
  kb_lookup_account: kbLookupAccount,
  kb_list_tracking: kbListTracking,
  kb_list_events: kbListEvents,
  data_health_summary: dataHealthSummary,
  xero_connection_status: xeroConnectionStatus,
  xero_list_tenants: xeroListTenants,
  investec_bank_sync_status: investecBankSyncStatus,
  investec_bank_sync: investecBankSync,
  investec_bank_list_accounts: investecBankListAccounts,
  investec_bank_list_beneficiaries: investecBankListBeneficiaries,
  investec_bank_sync_beneficiaries: investecBankSyncBeneficiaries,
  investec_bank_search_transactions: investecBankSearchTransactions,
  investec_jse_list_holdings: investecJseListHoldings,
  investec_jse_list_transactions: investecJseListTransactions,
  investec_jse_upload_holdings: investecJseUploadHoldings,
  investec_jse_upload_transactions: investecJseUploadTransactions,
  xero_search_journals: xeroSearchJournals,
  stock_market_list_symbols: async (args) => {
    const symbols = await listSymbols();
    const limit = clampNumber(args.limit, 100, 1, 500);
    return {
      generated_at: new Date().toISOString(),
      api_base_url: apiBaseUrl,
      count: symbols.length,
      symbols: filterSymbols(symbols, args.query, limit),
    };
  },
  stock_market_review_symbol: reviewSymbol,
  stock_market_review_portfolio: reviewPortfolio,
  stock_market_refresh_symbol: refreshSymbol,
  stock_market_refresh_extra: refreshExtra,
  stock_market_update_watchlist_information: updateWatchlistInformation,
  market_list_symbols: async (args) => toolHandlers.stock_market_list_symbols(args),
  market_review_symbol: reviewSymbol,
  market_review_portfolio: reviewPortfolio,
  market_refresh_symbol: refreshSymbol,
  market_refresh_extra: refreshExtra,
  market_update_symbols: updateWatchlistInformation,
  market_list_dividend_calendar: listDividendCalendar,
  market_check_declared_dividends: checkDeclaredDividends,
  xero_list_quotes: xeroListQuotes,
  xero_get_quote: xeroGetQuote,
  xero_sync_quotes: xeroSyncQuotes,
  xero_list_invoices: xeroListInvoices,
  xero_get_invoice: xeroGetInvoice,
  xero_get_document: xeroGetDocument,
  xero_sync_invoices: xeroSyncInvoices,
  xero_list_contacts: xeroListContacts,
  xero_list_tracking: xeroListTracking,
  xero_list_accounts: xeroListAccounts,
  xero_list_aged_payables: (args) => xeroListAgedReport(args, '/xero/data/aged-payables/', 'aged_payables'),
  xero_list_aged_receivables: (args) => xeroListAgedReport(args, '/xero/data/aged-receivables/', 'aged_receivables'),
  xero_sync_aged_payables: (args) => xeroSyncAged(args, '/xero/data/aged-payables/sync/', 'sync aged payables'),
  xero_sync_aged_receivables: (args) => xeroSyncAged(args, '/xero/data/aged-receivables/sync/', 'sync aged receivables'),
  list_audit_checks: listAuditChecks,
  run_audit_check: runAuditCheck,
  run_yearend_audit: runYearendAudit,
  audit_history: auditHistory,
  add_audit_check: addAuditCheck,
  list_audit_findings: listAuditFindings,
  get_audit_finding: getAuditFinding,
  add_audit_finding: addAuditFinding,
  update_audit_finding: updateAuditFinding,
  comment_audit_finding: commentAuditFinding,
  audit_findings_summary: auditFindingsSummary,
  list_audit_finding_attachments: listAuditFindingAttachments,
  get_audit_finding_cube: getAuditFindingCube,
  set_audit_finding_cube: setAuditFindingCube,
  link_audit_finding: linkAuditFinding,
  unlink_audit_finding: unlinkAuditFinding,
  audit_finding_graph: auditFindingGraph,
  pricelist_list_items: pricelistListItems,
  pricelist_get_price: pricelistGetPrice,
  pricelist_price_history: pricelistPriceHistory,
  pricelist_build_quote: pricelistBuildQuote,
  pricelist_set_price: pricelistSetPrice,
  pricelist_upsert_item: pricelistUpsertItem,
  list_cube_dimensions: listCubeDimensions,
  preview_cube: previewCube,
  save_cube_view: saveCubeView,
  delete_cube_view: deleteCubeView,
  add_cube_comment: addCubeComment,
  add_comment: addComment,
  list_comments: listComments,
  list_cube_comments: listCubeComments,
  set_cube_comment_status: setCubeCommentStatus,
  get_comment_transactions: getCommentTransactions,
};

async function handleRequest(request, respond = send) {
  if (!request || request.jsonrpc !== '2.0') return null;
  if (request.method?.startsWith('notifications/')) return null;

  try {
    switch (request.method) {
      case 'initialize':
        return respond(jsonRpcResult(request.id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: SERVER_NAME,
            version: SERVER_VERSION,
          },
          instructions: SERVER_INSTRUCTIONS,
        }));
        break;
      case 'tools/list':
        return respond(jsonRpcResult(request.id, { tools }));
        break;
      case 'tools/call': {
        const name = request.params?.name;
        const args = request.params?.arguments || {};
        const handler = toolHandlers[name];
        if (!handler) {
          return respond(jsonRpcResult(request.id, textResult(`Unknown tool: ${name}`, true)));
        }
        const result = await handler(args);
        if (result && result.__mcpFile) {
          return respond(jsonRpcResult(request.id, fileResult(result.__mcpFile)));
        }
        return respond(jsonRpcResult(request.id, textResult(result)));
      }
      case 'ping':
        return respond(jsonRpcResult(request.id, {}));
        break;
      default:
        return respond(jsonRpcError(request.id, -32601, `Method not found: ${request.method}`));
    }
  } catch (error) {
    return respond(jsonRpcResult(request.id, textResult({
      error: error.message,
      api_base_url: apiBaseUrl,
      generated_at: todayIso(),
    }, true)));
  }

  return null;
}

function startStdioTransport() {
  const rl = readline.createInterface({ input, crlfDelay: Infinity });

  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let request;
    try {
      request = JSON.parse(trimmed);
    } catch (error) {
      sendError(null, -32700, `Parse error: ${error.message}`);
      return;
    }

    handleRequest(request);
  });
}

// ---- OAuth 2.1 (claude.ai / Cowork connector support) ----------------------

function b64url(raw) {
  return Buffer.from(raw).toString('base64url');
}

function timingSafeStringEqual(a, b) {
  // Hash both sides so lengths match; sha256 collapses the length oracle.
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function signJwt(payload) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', oauthJwtSecret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyJwt(token, expectedType) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const expected = crypto.createHmac('sha256', oauthJwtSecret).update(`${parts[0]}.${parts[1]}`).digest('base64url');
  if (!timingSafeStringEqual(parts[2], expected)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (payload.iss !== oauthPublicUrl) return null;
  if (payload.aud !== `${oauthPublicUrl}/mcp`) return null;
  if (payload.typ !== expectedType) return null;
  if (!Number.isFinite(payload.exp) || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

function issueTokenPair() {
  const now = Math.floor(Date.now() / 1000);
  const base = { iss: oauthPublicUrl, aud: `${oauthPublicUrl}/mcp`, sub: 'owner', iat: now };
  return {
    access_token: signJwt({ ...base, typ: 'access', exp: now + OAUTH_ACCESS_TTL }),
    refresh_token: signJwt({ ...base, typ: 'refresh', exp: now + OAUTH_REFRESH_TTL }),
    token_type: 'Bearer',
    expires_in: OAUTH_ACCESS_TTL,
  };
}

// In-memory: a single-user connector simply re-authorizes after a restart.
// Issued tokens are self-contained JWTs and survive restarts regardless.
const oauthClients = new Map();
const oauthCodes = new Map();

// One shared password is the gate, so throttle guessing: per-IP plus a global
// bucket so rotating source addresses does not bypass the per-IP limit.
const loginFailures = { perIp: new Map(), global: [] };
const LOGIN_MAX_PER_IP = 5;
const LOGIN_MAX_GLOBAL = 30;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

function pruneFailures(bucket, now) {
  while (bucket.length && now - bucket[0] > LOGIN_WINDOW_MS) bucket.shift();
}

function loginRetryAfterSeconds(ip) {
  const now = Date.now();
  const ipBucket = loginFailures.perIp.get(ip) || [];
  pruneFailures(ipBucket, now);
  pruneFailures(loginFailures.global, now);
  for (const [bucket, limit] of [[ipBucket, LOGIN_MAX_PER_IP], [loginFailures.global, LOGIN_MAX_GLOBAL]]) {
    if (bucket.length >= limit) return Math.max(1, Math.ceil((LOGIN_WINDOW_MS - (now - bucket[0])) / 1000));
  }
  return null;
}

function recordLoginFailure(ip) {
  const now = Date.now();
  const bucket = loginFailures.perIp.get(ip) || [];
  bucket.push(now);
  loginFailures.perIp.set(ip, bucket);
  loginFailures.global.push(now);
  if (loginFailures.perIp.size > 4096) {
    for (const [key, value] of loginFailures.perIp) {
      if (!value.length) loginFailures.perIp.delete(key);
    }
  }
}

function requestClientIp(req) {
  // Caddy appends to X-Forwarded-For, so the last hop is the address it saw.
  const forwarded = String(req.headers['x-forwarded-for'] || '');
  if (forwarded) return forwarded.split(',').pop().trim();
  return req.socket?.remoteAddress || 'unknown';
}

const OAUTH_FORM = ({ err, stateBlob }) => `<!doctype html><html><head><meta charset=utf-8>
<title>Klikk Financials MCP - sign in</title>
<meta name=viewport content="width=device-width,initial-scale=1">
<style>body{font-family:system-ui;max-width:22rem;margin:18vh auto;padding:1rem;color:#15202a}
h1{font-size:1.1rem}input{width:100%;padding:.6rem;margin:.4rem 0;border:1px solid #ccd;border-radius:6px;box-sizing:border-box}
button{width:100%;padding:.6rem;border:0;border-radius:6px;background:#1f4e79;color:#fff;font-weight:600}
.err{color:#9c3535;font-size:.9rem}
.warn{background:#fff6e5;border:1px solid #e8d5a8;border-radius:6px;padding:.6rem;font-size:.85rem}</style>
</head><body>
<h1>Authorize Klikk Financials MCP</h1>
<p>Sign in to connect the Klikk Financials database (Xero, Investec, slips, audit) to Claude.</p>
<p class=warn>This grants read access to personal financial data, plus the documented local write tools (price list, comments, audit findings). It never writes to Xero.</p>
${err}<form method=post><input type=password name=password placeholder=Password autofocus>
<input type=hidden name=s value="${stateBlob}"><button>Authorize</button></form></body></html>`;

function writeHtml(res, statusCode, html, extraHeaders = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(html);
}

function parseFormBody(raw) {
  const params = new URLSearchParams(raw || '');
  return Object.fromEntries(params.entries());
}

function oauthProtectedResourceMetadata() {
  return {
    resource: `${oauthPublicUrl}/mcp`,
    authorization_servers: [oauthPublicUrl],
    bearer_methods_supported: ['header'],
  };
}

function oauthAsMetadata() {
  return {
    issuer: oauthPublicUrl,
    authorization_endpoint: `${oauthPublicUrl}/mcp/authorize`,
    token_endpoint: `${oauthPublicUrl}/mcp/token`,
    registration_endpoint: `${oauthPublicUrl}/mcp/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
  };
}

async function handleOauthRequest(req, res, url, corsHeaders) {
  const { pathname } = url;

  if (pathname === '/.well-known/oauth-protected-resource' || pathname === '/.well-known/oauth-protected-resource/mcp') {
    writeJson(res, 200, oauthProtectedResourceMetadata(), corsHeaders);
    return true;
  }

  if (pathname === '/.well-known/oauth-authorization-server' || pathname === '/.well-known/oauth-authorization-server/mcp') {
    writeJson(res, 200, oauthAsMetadata(), corsHeaders);
    return true;
  }

  if (pathname === '/mcp/register' && req.method === 'POST') {
    let body = {};
    try {
      body = JSON.parse((await readBody(req)) || '{}');
    } catch {
      writeJson(res, 400, { error: 'invalid_client_metadata' }, corsHeaders);
      return true;
    }
    const clientId = `c_${crypto.randomBytes(16).toString('base64url')}`;
    oauthClients.set(clientId, { redirect_uris: body.redirect_uris || [], created: Date.now() });
    writeJson(res, 201, {
      client_id: clientId,
      token_endpoint_auth_method: 'none',
      redirect_uris: body.redirect_uris || [],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    }, corsHeaders);
    return true;
  }

  if (pathname === '/mcp/authorize' && req.method === 'GET') {
    const stateBlob = b64url(JSON.stringify({
      client_id: url.searchParams.get('client_id'),
      redirect_uri: url.searchParams.get('redirect_uri'),
      state: url.searchParams.get('state'),
      code_challenge: url.searchParams.get('code_challenge'),
      code_challenge_method: url.searchParams.get('code_challenge_method'),
    }));
    writeHtml(res, 200, OAUTH_FORM({ err: '', stateBlob }));
    return true;
  }

  if (pathname === '/mcp/authorize' && req.method === 'POST') {
    const ip = requestClientIp(req);
    const wait = loginRetryAfterSeconds(ip);
    if (wait !== null) {
      writeHtml(res, 429, OAUTH_FORM({
        err: `<p class=err>Too many failed attempts. Try again in ${Math.max(1, Math.ceil(wait / 60))} minute(s).</p>`,
        stateBlob: '',
      }), { 'Retry-After': String(wait) });
      return true;
    }

    const form = parseFormBody(await readBody(req));
    if (!timingSafeStringEqual(form.password || '', oauthPassword)) {
      recordLoginFailure(ip);
      writeHtml(res, 401, OAUTH_FORM({ err: '<p class=err>Wrong password.</p>', stateBlob: form.s || '' }));
      return true;
    }
    loginFailures.perIp.delete(ip);

    let state;
    try {
      state = JSON.parse(Buffer.from(String(form.s || ''), 'base64url').toString('utf8'));
    } catch {
      writeJson(res, 400, { error: 'invalid_request' }, corsHeaders);
      return true;
    }
    if (!state?.redirect_uri || !state?.code_challenge) {
      writeJson(res, 400, { error: 'invalid_request', error_description: 'redirect_uri and PKCE code_challenge are required' }, corsHeaders);
      return true;
    }

    const code = crypto.randomBytes(24).toString('base64url');
    oauthCodes.set(code, { ...state, exp: Date.now() + 5 * 60 * 1000 });
    const sep = state.redirect_uri.includes('?') ? '&' : '?';
    let redirect = `${state.redirect_uri}${sep}code=${encodeURIComponent(code)}`;
    if (state.state) redirect += `&state=${encodeURIComponent(state.state)}`;
    res.writeHead(302, { Location: redirect, 'Cache-Control': 'no-store' });
    res.end();
    return true;
  }

  if (pathname === '/mcp/token' && req.method === 'POST') {
    const raw = await readBody(req);
    const contentType = String(req.headers['content-type'] || '');
    let form;
    try {
      form = contentType.includes('application/json') ? JSON.parse(raw || '{}') : parseFormBody(raw);
    } catch {
      writeJson(res, 400, { error: 'invalid_request' }, corsHeaders);
      return true;
    }

    if (form.grant_type === 'refresh_token') {
      const payload = verifyJwt(form.refresh_token, 'refresh');
      if (!payload) {
        writeJson(res, 400, { error: 'invalid_grant' }, corsHeaders);
        return true;
      }
      writeJson(res, 200, issueTokenPair(), corsHeaders);
      return true;
    }

    if (form.grant_type !== 'authorization_code') {
      writeJson(res, 400, { error: 'unsupported_grant_type' }, corsHeaders);
      return true;
    }

    const record = oauthCodes.get(String(form.code || ''));
    oauthCodes.delete(String(form.code || ''));
    if (!record || record.exp < Date.now()) {
      writeJson(res, 400, { error: 'invalid_grant' }, corsHeaders);
      return true;
    }

    const challenge = crypto.createHash('sha256').update(String(form.code_verifier || '')).digest('base64url');
    if (!record.code_challenge || !timingSafeStringEqual(challenge, record.code_challenge)) {
      writeJson(res, 400, { error: 'invalid_grant', error_description: 'PKCE verification failed' }, corsHeaders);
      return true;
    }

    writeJson(res, 200, issueTokenPair(), corsHeaders);
    return true;
  }

  return false;
}

// ---- inbound auth ----------------------------------------------------------

function hasValidHttpAuth(req) {
  if (allowUnauthenticatedHttp) return true;
  const authorization = req.headers.authorization || '';
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  const headerToken = req.headers['x-mcp-token'];
  if (httpAuthToken && (bearer === httpAuthToken || headerToken === httpAuthToken)) return true;
  if (oauthEnabled && bearer && verifyJwt(bearer, 'access')) return true;
  return false;
}

function writeJson(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function startHttpTransport() {
  if (!httpAuthToken && !allowUnauthenticatedHttp) {
    throw new Error('Refusing to start HTTP MCP without KLIKK_MCP_AUTH_TOKEN. Set KLIKK_MCP_ALLOW_UNAUTHENTICATED_HTTP=true only for local testing.');
  }
  const oauthVars = [oauthPublicUrl, oauthPassword, oauthJwtSecret].filter(Boolean).length;
  if (oauthVars > 0 && oauthVars < 3) {
    throw new Error('OAuth is partially configured. Set all of KLIKK_MCP_PUBLIC_URL, KLIKK_MCP_OAUTH_PASSWORD and KLIKK_MCP_JWT_SECRET, or none.');
  }
  if (oauthEnabled && (oauthJwtSecret.length < 32 || oauthPassword.length < 12)) {
    throw new Error('KLIKK_MCP_JWT_SECRET must be >=32 chars and KLIKK_MCP_OAUTH_PASSWORD >=12 — this gate fronts personal financial data.');
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const corsHeaders = {
      'Access-Control-Allow-Origin': process.env.KLIKK_MCP_CORS_ORIGIN || '*',
      'Access-Control-Allow-Headers': 'authorization, content-type, mcp-session-id, x-mcp-token',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    };

    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders);
      res.end();
      return;
    }

    if (url.pathname === '/health') {
      writeJson(res, 200, {
        ok: true,
        server: SERVER_NAME,
        version: SERVER_VERSION,
        transport: 'http',
        api_base_url: apiBaseUrl,
        oauth: oauthEnabled,
      }, corsHeaders);
      return;
    }

    if (oauthEnabled) {
      try {
        if (await handleOauthRequest(req, res, url, corsHeaders)) return;
      } catch (error) {
        writeJson(res, 500, { error: `OAuth handler error: ${error.message}` }, corsHeaders);
        return;
      }
    }

    if (url.pathname === '/mcp' && (req.method === 'GET' || req.method === 'DELETE')) {
      // Streamable HTTP optional features we do not implement: the standalone
      // SSE stream (GET) and session teardown (DELETE). 405 tells a
      // spec-compliant client to carry on with plain POSTs.
      res.writeHead(405, { ...corsHeaders, Allow: 'POST' });
      res.end();
      return;
    }

    if (url.pathname !== '/mcp' || req.method !== 'POST') {
      writeJson(res, 404, { error: 'Use POST /mcp for JSON-RPC MCP requests.' }, corsHeaders);
      return;
    }

    if (!hasValidHttpAuth(req)) {
      const challenge = oauthEnabled
        ? `Bearer resource_metadata="${oauthPublicUrl}/.well-known/oauth-protected-resource/mcp"`
        : 'Bearer';
      writeJson(res, 401, { error: 'Missing or invalid MCP bearer token.' }, {
        ...corsHeaders,
        'WWW-Authenticate': challenge,
      });
      return;
    }

    try {
      const rawBody = await readBody(req);
      const parsed = JSON.parse(rawBody || 'null');
      const requests = Array.isArray(parsed) ? parsed : [parsed];
      const responses = [];
      for (const request of requests) {
        const response = await handleRequest(request, (message) => message);
        if (response) responses.push(response);
      }

      if (Array.isArray(parsed)) {
        writeJson(res, 200, responses, corsHeaders);
      } else if (responses.length) {
        writeJson(res, 200, responses[0], corsHeaders);
      } else {
        res.writeHead(202, corsHeaders);
        res.end();
      }
    } catch (error) {
      writeJson(res, 400, jsonRpcError(null, -32700, `Parse error: ${error.message}`), corsHeaders);
    }
  });

  server.listen(httpPort, httpHost, () => {
    console.error(`${SERVER_NAME} MCP HTTP transport listening on http://${httpHost}:${httpPort}/mcp`);
  });
}

if (transport === 'http') {
  startHttpTransport();
} else {
  startStdioTransport();
}
