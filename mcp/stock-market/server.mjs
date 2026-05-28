#!/usr/bin/env node

import readline from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';

const SERVER_NAME = 'klikk-financials';
const SERVER_VERSION = '0.3.0';
const PROTOCOL_VERSION = '2025-06-18';
const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8001';
const SERVER_INSTRUCTIONS = [
  'Use this server as the agent interface to the user-owned Klikk Financials database.',
  'The Django API remains the source of truth; do not scrape the web app or bypass import/sync endpoints.',
  'Read-only review tools are safe to call for analysis.',
  'Refresh/import/vectorization tools mutate local data copied from Xero, Investec, yfinance, and related sources; ask for confirmation before running them unless the user explicitly requested an update.',
  'When giving financial analysis, distinguish market price, market value, cost, income, and ROI.',
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
    name: 'investec_bank_sync_status',
    description: 'Read the latest Investec banking sync timestamp/status.',
    inputSchema: {
      type: 'object',
      properties: {},
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
];

function send(message) {
  output.write(`${JSON.stringify(message)}\n`);
}

function sendResult(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function sendError(id, code, message, data = undefined) {
  const error = data === undefined ? { code, message } : { code, message, data };
  send({ jsonrpc: '2.0', id, error });
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

const toolHandlers = {
  data_health_summary: dataHealthSummary,
  xero_connection_status: xeroConnectionStatus,
  xero_list_tenants: xeroListTenants,
  investec_bank_sync_status: investecBankSyncStatus,
  investec_bank_list_accounts: investecBankListAccounts,
  investec_bank_search_transactions: investecBankSearchTransactions,
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
};

async function handleRequest(request) {
  if (!request || request.jsonrpc !== '2.0') return;
  if (request.method?.startsWith('notifications/')) return;

  try {
    switch (request.method) {
      case 'initialize':
        sendResult(request.id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: SERVER_NAME,
            version: SERVER_VERSION,
          },
          instructions: SERVER_INSTRUCTIONS,
        });
        break;
      case 'tools/list':
        sendResult(request.id, { tools });
        break;
      case 'tools/call': {
        const name = request.params?.name;
        const args = request.params?.arguments || {};
        const handler = toolHandlers[name];
        if (!handler) {
          sendResult(request.id, textResult(`Unknown tool: ${name}`, true));
          return;
        }
        const result = await handler(args);
        sendResult(request.id, textResult(result));
        break;
      }
      case 'ping':
        sendResult(request.id, {});
        break;
      default:
        sendError(request.id, -32601, `Method not found: ${request.method}`);
        break;
    }
  } catch (error) {
    sendResult(request.id, textResult({
      error: error.message,
      api_base_url: apiBaseUrl,
      generated_at: todayIso(),
    }, true));
  }
}

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
