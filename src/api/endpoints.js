import apiClient from './client';
import { API_ENDPOINTS, API_BASE_URL } from '../utils/constants';

/**
 * Get Xero API call statistics for rate limit tracking
 */
export async function getApiCallStats(tenantId = null) {
  const params = tenantId ? { tenant_id: tenantId } : {};
  const response = await apiClient.get(API_ENDPOINTS.API_CALL_STATS, { params });
  return response.data;
}

/**
 * Get Xero OAuth2 authorization URL
 */
export async function getXeroAuthUrl() {
  const response = await apiClient.get(API_ENDPOINTS.XERO_AUTH_INITIATE);
  return response.data;
}

/**
 * Get Xero connection status
 */
export async function getXeroConnectionStatus() {
  const response = await apiClient.get(API_ENDPOINTS.XERO_CONNECTION_STATUS);
  return response.data;
}

/**
 * Save Xero API credentials (client_id, client_secret)
 */
export async function saveXeroCredentials(clientId, clientSecret) {
  const response = await apiClient.post(API_ENDPOINTS.XERO_CREDENTIALS, {
    client_id: clientId,
    client_secret: clientSecret,
  });
  return response.data;
}

/**
 * Get list of tenants
 */
export async function getTenants() {
  const response = await apiClient.get(API_ENDPOINTS.TENANTS);
  return response.data;
}

/**
 * Update metadata (accounts, contacts, tracking)
 */
export async function updateMetadata(tenantId) {
  const response = await apiClient.post(API_ENDPOINTS.UPDATE_METADATA, {
    tenant_id: tenantId,
  });
  return response.data;
}

/**
 * Update data (transactions and journals)
 */
export async function updateData(tenantId, loadAll = false) {
  const response = await apiClient.post(API_ENDPOINTS.UPDATE_DATA, {
    tenant_id: tenantId,
    load_all: loadAll,
  });
  return response.data;
}

/**
 * Process journals (convert raw journals to line items)
 */
export async function processJournals(tenantId) {
  const response = await apiClient.post(API_ENDPOINTS.PROCESS_JOURNALS, {
    tenant_id: tenantId,
  });
  return response.data;
}

/**
 * Sync documents (attachments) from Xero and link to transactions.
 * Optional: transaction_ids (array), types (e.g. ['Invoice', 'CreditNote', 'BankTransaction']).
 */
export async function syncXeroDocuments(tenantId, options = {}) {
  const response = await apiClient.post(API_ENDPOINTS.SYNC_DOCUMENTS, {
    tenant_id: tenantId,
    transaction_ids: options.transaction_ids || undefined,
    types: options.types || undefined,
  });
  return response.data;
}

/**
 * List documents linked to a Xero transaction (by transaction ID).
 */
export async function getDocumentsByTransaction(transactionId, tenantId = null) {
  const params = tenantId ? { tenant_id: tenantId } : {};
  const response = await apiClient.get(
    `${API_ENDPOINTS.DOCUMENTS_BY_TRANSACTION}${encodeURIComponent(transactionId)}/`,
    { params }
  );
  return response.data;
}

/**
 * Process trail balance
 */
export async function processTrailBalance(tenantId, options = {}) {
  const response = await apiClient.post(API_ENDPOINTS.PROCESS_CUBE, {
    tenant_id: tenantId,
    rebuild_trail_balance: options.rebuild_trail_balance || false,
    exclude_manual_journals: options.exclude_manual_journals || false,
  });
  return response.data;
}

/**
 * Get data summary
 */
export async function getSummary(tenantId) {
  const response = await apiClient.get(API_ENDPOINTS.SUMMARY, {
    params: { tenant_id: tenantId },
  });
  return response.data;
}

/**
 * Get trail balance with filters
 */
export async function getTrailBalance(tenantId, filters = {}) {
  const params = { tenant_id: tenantId, ...filters };
  const response = await apiClient.get(API_ENDPOINTS.TRAIL_BALANCE, { params });
  return response.data;
}

/**
 * Get line items with filters
 */
export async function getLineItems(tenantId, filters = {}) {
  const params = { tenant_id: tenantId, ...filters };
  const response = await apiClient.get(API_ENDPOINTS.LINE_ITEMS, { params });
  return response.data;
}

/**
 * Reconcile reports
 */
export async function reconcileReports(tenantId, params) {
  const queryParams = {
    tenant_id: tenantId,
    financial_year: params.financial_year,
    fiscal_year_start_month: params.fiscal_year_start_month || 7,
    tolerance: params.tolerance || 0.01,
  };
  const response = await apiClient.get(API_ENDPOINTS.RECONCILE, {
    params: queryParams,
  });
  return response.data;
}

/**
 * Get account balance summary (IS vs BS, in-balance / out-of-balance)
 */
export async function getAccountSummary(tenantId, filters = {}) {
  const response = await apiClient.get(API_ENDPOINTS.ACCOUNT_SUMMARY, {
    params: { tenant_id: tenantId, ...filters },
  });
  return response.data;
}

/**
 * Get P&L summary by tracking (Income / Expense / Total)
 */
export async function getPnlSummary(tenantId, filters = {}) {
  const params = { tenant_id: tenantId, ...filters };
  const response = await apiClient.get(API_ENDPOINTS.PNL_SUMMARY, { params });
  return response.data;
}

/**
 * Import P&L by tracking category from Xero
 */
export async function importPnlByTracking(tenantId, options = {}) {
  const response = await apiClient.post(API_ENDPOINTS.IMPORT_PNL_BY_TRACKING, {
    tenant_id: tenantId,
    from_date: options.from_date || null,
    to_date: options.to_date || null,
  });
  return response.data;
}

/**
 * Compare profit & loss
 */
export async function compareProfitLoss(tenantId, params) {
  const queryParams = { tenant_id: tenantId, ...params };
  const response = await apiClient.get(API_ENDPOINTS.COMPARE_PROFIT_LOSS, {
    params: queryParams,
  });
  return response.data;
}

/**
 * Validate balance sheet
 */
export async function validateBalanceSheet(tenantId, params) {
  const queryParams = { tenant_id: tenantId, ...params };
  const response = await apiClient.get(API_ENDPOINTS.BALANCE_SHEET, {
    params: queryParams,
  });
  return response.data;
}

// ---------------------------------------------------------------------------
// Investec
// ---------------------------------------------------------------------------

/**
 * Get Investec transactions (paginated, filterable)
 */
export async function getInvestecTransactions(params = {}) {
  const response = await apiClient.get(API_ENDPOINTS.INVESTEC_TRANSACTIONS, {
    params: {
      limit: params.limit ?? 100,
      offset: params.offset ?? 0,
      account_number: params.account_number || undefined,
      share_name: params.share_name || undefined,
      type: params.type || undefined,
    },
  });
  return response.data;
}

/**
 * Upload Investec transactions Excel file
 */
export async function uploadInvestecTransactions(file) {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post(API_ENDPOINTS.INVESTEC_UPLOAD, formData, {
    headers: { 'Content-Type': null },
  });
  return response.data;
}

/**
 * Upload Investec portfolio Excel file(s)
 */
export async function uploadInvestecPortfolio(files) {
  const formData = new FormData();
  if (Array.isArray(files) && files.length > 1) {
    files.forEach((f) => formData.append('files', f));
  } else {
    const file = Array.isArray(files) ? files[0] : files;
    formData.append('file', file);
  }
  const response = await apiClient.post(API_ENDPOINTS.INVESTEC_PORTFOLIO_UPLOAD, formData, {
    headers: { 'Content-Type': null },
  });
  return response.data;
}

/**
 * Get Investec share name mappings (share_name, company, share_code)
 */
export async function getInvestecMappings() {
  const response = await apiClient.get(API_ENDPOINTS.INVESTEC_MAPPING);
  return response.data;
}

/**
 * Get share names that appear in transactions but are not in the mapping table
 */
export async function getInvestecUnmappedShareNames() {
  const response = await apiClient.get(API_ENDPOINTS.INVESTEC_UNMAPPED_SHARE_NAMES);
  return response.data;
}

/**
 * Upload Investec share name mapping Excel file
 */
export async function uploadInvestecMapping(file) {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post(API_ENDPOINTS.INVESTEC_MAPPING_UPLOAD, formData, {
    headers: { 'Content-Type': null },
  });
  return response.data;
}

/**
 * Export share codes, names and company mapping to Excel (for edit and re-upload)
 */
export async function getInvestecExportMapping() {
  const response = await apiClient.get(API_ENDPOINTS.INVESTEC_EXPORT_MAPPING);
  return response.data;
}

/**
 * Export companies from portfolios
 */
export async function getInvestecExportCompanies() {
  const response = await apiClient.get(API_ENDPOINTS.INVESTEC_EXPORT_COMPANIES);
  return response.data;
}

/**
 * Export share names from transactions
 */
export async function getInvestecExportShareNames() {
  const response = await apiClient.get(API_ENDPOINTS.INVESTEC_EXPORT_SHARE_NAMES);
  return response.data;
}

/**
 * Export transactions to Excel (writes to server; returns filename for download)
 */
export async function getInvestecExportTransactions() {
  const response = await apiClient.get(API_ENDPOINTS.INVESTEC_EXPORT_TRANSACTIONS);
  return response.data;
}

/**
 * URL to download an exported Investec Excel file
 */
export function getInvestecExportDownloadUrl(filename) {
  return `${API_BASE_URL}/media/investec/exports/${filename}`;
}

/**
 * Get Investec Private Bank accounts (for account filter dropdown)
 */
export async function getInvestecBankAccounts() {
  const response = await apiClient.get(API_ENDPOINTS.INVESTEC_BANK_ACCOUNTS);
  return response.data;
}

/**
 * Search Investec Private Bank transactions.
 * Params: description, amount, date_from, date_to, account (id or number), limit, offset.
 * Optional signal for request cancellation (e.g. AbortController.signal).
 */
export async function getInvestecBankTransactions(params = {}) {
  const response = await apiClient.get(API_ENDPOINTS.INVESTEC_BANK_TRANSACTIONS, {
    params: {
      description: params.description || undefined,
      amount: params.amount || undefined,
      date_from: params.date_from || undefined,
      date_to: params.date_to || undefined,
      account: params.account || undefined,
      limit: params.limit ?? 100,
      offset: params.offset ?? 0,
    },
    signal: params.signal ?? undefined,
  });
  return response.data;
}

/**
 * Download Investec bank transaction search results as Excel.
 * Pass same params as getInvestecBankTransactions (description, amount, date_from, date_to, account).
 * Triggers browser download of .xlsx file.
 */
export async function downloadInvestecBankTransactionsExcel(params = {}) {
  const response = await apiClient.get(API_ENDPOINTS.INVESTEC_BANK_TRANSACTIONS_EXPORT, {
    params: {
      description: params.description || undefined,
      amount: params.amount || undefined,
      date_from: params.date_from || undefined,
      date_to: params.date_to || undefined,
      account: params.account || undefined,
    },
    responseType: 'blob',
  });
  const blob = response.data;
  const disposition = response.headers['content-disposition'];
  let filename = 'Investec_Bank_Transactions.xlsx';
  if (disposition) {
    const match = disposition.match(/filename="?([^";\n]+)"?/);
    if (match) filename = match[1];
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Get last Investec bank sync time (for "Update from API" tab).
 */
export async function getInvestecBankSyncStatus() {
  const response = await apiClient.get(API_ENDPOINTS.INVESTEC_BANK_SYNC_STATUS);
  return response.data;
}

/**
 * Trigger Investec bank sync from API (incremental from last sync). Returns created/updated and new last_synced_at.
 */
export async function triggerInvestecBankSync() {
  const response = await apiClient.post(API_ENDPOINTS.INVESTEC_BANK_SYNC);
  return response.data;
}

// ---------------------------------------------------------------------------
// Financial Investments (yfinance stock data)
// ---------------------------------------------------------------------------

/**
 * Get list of tracked symbols (symbol, name, exchange).
 */
export async function getFinancialInvestmentsSymbols() {
  const response = await apiClient.get(API_ENDPOINTS.FINANCIAL_INVESTMENTS_SYMBOLS);
  return response.data;
}

/**
 * Get price history for a symbol from DB. Optional start_date, end_date (YYYY-MM-DD).
 */
export async function getFinancialInvestmentsHistory(symbol, params = {}) {
  const url = `/api/financial-investments/symbols/${encodeURIComponent(symbol)}/history/`;
  const response = await apiClient.get(url, { params: { start_date: params.start_date, end_date: params.end_date } });
  return response.data;
}

/**
 * Refresh symbol from yfinance (fetch and store). Optional start_date, end_date in body or params.
 */
export async function refreshFinancialInvestmentsSymbol(symbol, params = {}) {
  const url = `/api/financial-investments/symbols/${encodeURIComponent(symbol)}/refresh/`;
  const response = await apiClient.post(url, { start_date: params.start_date, end_date: params.end_date });
  return response.data;
}

/**
 * Refresh extra data (dividends, splits, company info, financials, earnings, analyst, ownership, news).
 * Optional types: array of 'dividends','splits','company_info','financial_statements','earnings','earnings_estimate','analyst_recommendations','analyst_price_target','ownership','news'
 */
export async function refreshFinancialInvestmentsExtra(symbol, types = null) {
  const url = `/api/financial-investments/symbols/${encodeURIComponent(symbol)}/refresh-extra/`;
  const response = await apiClient.post(url, types ? { types } : {});
  return response.data;
}

function _fiUrl(symbol, path) {
  return `/api/financial-investments/symbols/${encodeURIComponent(symbol)}/${path}`;
}

export async function getFinancialInvestmentsDividends(symbol) {
  const response = await apiClient.get(_fiUrl(symbol, 'dividends/'));
  return response.data;
}

export async function getFinancialInvestmentsSplits(symbol) {
  const response = await apiClient.get(_fiUrl(symbol, 'splits/'));
  return response.data;
}

export async function getFinancialInvestmentsInfo(symbol) {
  const response = await apiClient.get(_fiUrl(symbol, 'info/'));
  return response.data;
}

export async function getFinancialInvestmentsFinancialStatements(symbol, freq = 'yearly') {
  const response = await apiClient.get(_fiUrl(symbol, 'financial-statements/'), { params: { freq } });
  return response.data;
}

export async function getFinancialInvestmentsEarnings(symbol, freq = 'yearly') {
  const response = await apiClient.get(_fiUrl(symbol, 'earnings/'), { params: { freq } });
  return response.data;
}

export async function getFinancialInvestmentsEarningsEstimate(symbol) {
  const response = await apiClient.get(_fiUrl(symbol, 'earnings-estimate/'));
  return response.data;
}

export async function getFinancialInvestmentsAnalystRecommendations(symbol) {
  const response = await apiClient.get(_fiUrl(symbol, 'analyst-recommendations/'));
  return response.data;
}

export async function getFinancialInvestmentsAnalystPriceTarget(symbol) {
  const response = await apiClient.get(_fiUrl(symbol, 'analyst-price-target/'));
  return response.data;
}

export async function getFinancialInvestmentsOwnership(symbol) {
  const response = await apiClient.get(_fiUrl(symbol, 'ownership/'));
  return response.data;
}

export async function getFinancialInvestmentsNews(symbol, limit = 20) {
  const response = await apiClient.get(_fiUrl(symbol, 'news/'), { params: { limit } });
  return response.data;
}

const _fiBase = () => '/api/financial-investments';

export async function getFinancialInvestmentsWatchlistPreference() {
  const response = await apiClient.get(`${_fiBase()}/watchlist-preference/`);
  return response.data;
}

export async function saveFinancialInvestmentsWatchlistPreference(value) {
  const response = await apiClient.post(`${_fiBase()}/watchlist-preference/save/`, { value });
  return response.data;
}

// ---------------------------------------------------------------------------
// Dividend Forecast Workflow
// ---------------------------------------------------------------------------

/**
 * Get dividend calendar entries. Params: status (declared/paid/estimated), pending_tm1 (1 = pending only).
 */
export async function getDividendCalendar(params = {}) {
  const response = await apiClient.get(API_ENDPOINTS.DIVIDEND_CALENDAR, { params });
  return response.data;
}

/**
 * Update dividend category for a calendar entry. Body: { id, dividend_category }.
 */
export async function updateDividendCalendarCategory(id, dividendCategory) {
  const response = await apiClient.post(API_ENDPOINTS.DIVIDEND_CALENDAR_UPDATE_CATEGORY, {
    id,
    dividend_category: dividendCategory,
  });
  return response.data;
}

/**
 * Update payment_date for a calendar entry. Body: { id, payment_date (YYYY-MM-DD or null) }.
 */
export async function updateDividendCalendarPaymentDate(id, paymentDate) {
  const response = await apiClient.post(API_ENDPOINTS.DIVIDEND_CALENDAR_UPDATE_PAYMENT_DATE, {
    id,
    payment_date: paymentDate,
  });
  return response.data;
}

/**
 * Check yfinance for newly declared dividends. Optional body: { share_code }.
 */
export async function checkDeclaredDividends(shareCode = '') {
  const response = await apiClient.post(API_ENDPOINTS.DIVIDEND_CALENDAR_CHECK, {
    share_code: shareCode,
  }, { timeout: 120000 });
  return response.data;
}

/**
 * Read the current TM1 dividend forecast for a share. Params: year, month.
 */
export async function getDividendForecast(shareCode, year, month) {
  const url = `${_fiBase()}/dividend-forecast/${encodeURIComponent(shareCode)}/`;
  const response = await apiClient.get(url, { params: { year, month } });
  return response.data;
}

/**
 * Write a TM1 adjustment. Body: { share_code, declared_dps, year, month, confirm }.
 */
export async function adjustDividendForecast(payload) {
  const response = await apiClient.post(API_ENDPOINTS.DIVIDEND_FORECAST_ADJUST, payload, { timeout: 60000 });
  return response.data;
}

/**
 * Write TM1 adjustments for all pending dividend calendar entries.
 */
export async function adjustAllPendingDividends() {
  const response = await apiClient.post(API_ENDPOINTS.DIVIDEND_FORECAST_ADJUST_PENDING, {}, { timeout: 300000 });
  return response.data;
}

/**
 * Verify TM1 adjustments — reads TM1 for all written entries and confirms values match.
 */
export async function verifyDividendForecasts() {
  const response = await apiClient.post(API_ENDPOINTS.DIVIDEND_FORECAST_VERIFY, {}, { timeout: 300000 });
  return response.data;
}
