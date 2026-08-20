#!/usr/bin/env node

import readline from 'node:readline';
import { createServer } from 'node:http';
import { stdin as input, stdout as output } from 'node:process';

const SERVER_NAME = 'klikk-financials';
const SERVER_VERSION = '0.6.0';
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
  'Excel cube comments: MC pins notes to figures in his Excel cube/PivotTable sheets, and list_cube_comments is that human->agent to-do queue -- check it when MC says "what did I flag", "my Excel comments" or "what needs looking at"; get_comment_transactions drills one comment down to the journal lines that make its number up, and set_cube_comment_status closes it off. Never writes to Xero.',
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
    name: 'list_cube_comments',
    description: 'Read-only: the comments MC has pinned to cells in Excel (app.cube_comments), newest first. This is the human->agent to-do queue: MC right-clicks a figure in a cube or PivotTable sheet, writes what is wrong or what he wants checked, and it lands here anchored to the exact intersection — the measure, a flat {dimension: value} coordinates object, and the filter_context that produced the number. The coordinates are deliberately axis-independent: a cell is identified by which dimension holds which value, NOT by whether the field sat on rows or on columns, so the same figure never reads as two different figures. Default status=open. Use when MC says "what did I flag", "my Excel comments", "what needs looking at", "the cube comments". Read the anchor to know WHICH figure is meant, pull the underlying lines with get_comment_transactions, investigate with xero_search_journals / run_audit_check, then close it with set_cube_comment_status. Never touches Xero.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'open (default) | actioned | dismissed | all.' },
        measure: { type: 'string', description: 'Optional: only comments on this measure (amount, debit, credit, tax, count).' },
        tenant: { type: 'string', description: 'Optional: only comments whose filter context named this tenant.' },
        author: { type: 'string', description: 'Optional: only comments written by this author.' },
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
    updated_at: comment?.updated_at,
  };
}

const CUBE_COMMENT_STATUSES = ['open', 'actioned', 'dismissed'];
const CUBE_DRILL_FILTER_KEYS = ['tenant', 'date_from', 'date_to', 'account', 'contact', 'reference', 'description', 'amount', 'q', 'journal_type'];

async function listCubeComments(args = {}) {
  const params = new URLSearchParams();
  params.set('status', String(args.status || 'open').trim() || 'open');
  params.set('limit', String(clampNumber(args.limit, 500, 1, 5000)));
  for (const key of ['measure', 'tenant', 'author']) {
    if (args[key] !== undefined && args[key] !== null && String(args[key]).trim() !== '') {
      params.set(key, String(args[key]).trim());
    }
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

const toolHandlers = {
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
  pricelist_list_items: pricelistListItems,
  pricelist_get_price: pricelistGetPrice,
  pricelist_price_history: pricelistPriceHistory,
  pricelist_build_quote: pricelistBuildQuote,
  pricelist_set_price: pricelistSetPrice,
  pricelist_upsert_item: pricelistUpsertItem,
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

function hasValidHttpAuth(req) {
  if (allowUnauthenticatedHttp) return true;
  if (!httpAuthToken) return false;
  const authorization = req.headers.authorization || '';
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  const headerToken = req.headers['x-mcp-token'];
  return bearer === httpAuthToken || headerToken === httpAuthToken;
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
      }, corsHeaders);
      return;
    }

    if (url.pathname !== '/mcp' || req.method !== 'POST') {
      writeJson(res, 404, { error: 'Use POST /mcp for JSON-RPC MCP requests.' }, corsHeaders);
      return;
    }

    if (!hasValidHttpAuth(req)) {
      writeJson(res, 401, { error: 'Missing or invalid MCP bearer token.' }, {
        ...corsHeaders,
        'WWW-Authenticate': 'Bearer',
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
