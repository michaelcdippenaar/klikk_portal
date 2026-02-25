// API Configuration
// When portal is opened on port 8080 (direct container), there is no /backend – use Django on 8001
export function getApiBaseUrl() {
  if (typeof window !== 'undefined' && window.location.port === '8080') {
    return `${window.location.protocol}//${window.location.hostname}:8001`;
  }
  return import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8001';
}
export const API_BASE_URL = getApiBaseUrl();

// API Endpoints
export const API_ENDPOINTS = {
  // Auth
  LOGIN: '/api/auth/login/',
  REFRESH: '/api/auth/refresh/',

  // Xero Auth
  XERO_AUTH_INITIATE: '/xero/auth/initiate/',
  XERO_CONNECTION_STATUS: '/xero/auth/status/',
  XERO_CREDENTIALS: '/xero/auth/credentials/',
  
  // Core
  TENANTS: '/xero/core/tenants/',
  
  // Metadata
  UPDATE_METADATA: '/xero/metadata/update/',
  
  // Data
  UPDATE_DATA: '/xero/data/update/journals/',
  PROCESS_JOURNALS: '/xero/data/process/journals/',
  
  // Cube
  PROCESS_CUBE: '/xero/cube/process/',
  SUMMARY: '/xero/cube/summary/',
  TRAIL_BALANCE: '/xero/cube/trail-balance/',
  LINE_ITEMS: '/xero/cube/line-items/',
  IMPORT_PNL_BY_TRACKING: '/xero/cube/import-pnl-by-tracking/',
  PNL_SUMMARY: '/xero/cube/pnl-summary/',
  ACCOUNT_SUMMARY: '/xero/cube/account-summary/',
  
  // Sync
  API_CALL_STATS: '/xero/sync/api-call-stats/',

  // Validation
  RECONCILE: '/xero/validation/reconcile/',
  COMPARE_PROFIT_LOSS: '/xero/validation/compare-profit-loss/',
  BALANCE_SHEET: '/xero/validation/balance-sheet/',

  // Planning Analytics
  PA_PIPELINE_RUN: '/api/planning-analytics/pipeline/run/',
  PA_TM1_EXECUTE: '/api/planning-analytics/tm1/execute/',
  PA_TM1_TEST_CONNECTION: '/api/planning-analytics/tm1/test-connection/',
  PA_TM1_CONFIG: '/api/planning-analytics/tm1/config/',
  PA_TM1_PROCESSES: '/api/planning-analytics/tm1/processes/',

  // Investec
  INVESTEC_UPLOAD: '/api/investec/upload/',
  INVESTEC_TRANSACTIONS: '/api/investec/transactions/',
  INVESTEC_PORTFOLIO_UPLOAD: '/api/investec/portfolio/upload/',
  INVESTEC_MAPPING: '/api/investec/mapping/',
  INVESTEC_UNMAPPED_SHARE_NAMES: '/api/investec/mapping/unmapped-share-names/',
  INVESTEC_MAPPING_UPLOAD: '/api/investec/mapping/upload/',
  INVESTEC_EXPORT_MAPPING: '/api/investec/export/mapping/',
  INVESTEC_EXPORT_COMPANIES: '/api/investec/export/companies/',
  INVESTEC_EXPORT_SHARE_NAMES: '/api/investec/export/share-names/',
  INVESTEC_EXPORT_TRANSACTIONS: '/api/investec/export/transactions/',
};

// Storage Keys
export const STORAGE_KEYS = {
  TOKEN: 'auth_token',
  REFRESH_TOKEN: 'refresh_token',
  USER: 'user',
  SELECTED_TENANT: 'selected_tenant',
};
