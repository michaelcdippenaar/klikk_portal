import apiClient from './client';
import { getApiBaseUrl } from '../utils/constants';

/**
 * Klikk event-gear price list (rate card) — effective-dated, ex VAT, ZAR.
 *
 * Backed by the /api/pricelist/ endpoints, which read Postgres `pricelist.*`
 * (items + effective-dated price rows). Nothing here writes to Xero: setting a
 * price only adds a new effective-dated row locally and closes the previous
 * open one. All money values are STRINGS with 2 decimals (e.g. "1400.00").
 *
 * Endpoints:
 *   GET  /api/pricelist/items/?category=&active=&q=&customer=&date=
 *        → { count, categories[], customer|null, items[] }
 *   GET  /api/pricelist/items/{code}/prices/
 *        → { code, count, prices[] }                 (newest first)
 *   POST /api/pricelist/items/{code}/prices/
 *        → 201 { price, closed_previous|null }
 *   POST /api/pricelist/quote/
 *        → { lines[], subtotal, discount, ex_vat, vat, incl_vat, warnings[] }  (pure calc)
 *   GET  /api/pricelist/export/?date=&customer=&active=
 *        → text/csv
 */

const BASE = '/api/pricelist';

/** Drop undefined / null / '' params so the query string stays clean. */
function cleanParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  );
}

/**
 * List price-list items with their current (effective-dated) list price.
 * @param {{category?:string, active?:string|boolean, q?:string, customer?:string, date?:string}} params
 */
export async function getPriceListItems(params = {}) {
  const response = await apiClient.get(`${BASE}/items/`, { params: cleanParams(params) });
  return response.data;
}

/**
 * Full price history for one item, newest first.
 * @param {string} code
 */
export async function getPriceHistory(code) {
  const response = await apiClient.get(`${BASE}/items/${encodeURIComponent(code)}/prices/`);
  return response.data;
}

/**
 * Add an effective-dated price row (closes the previous open row).
 * @param {string} code
 * @param {{price:string|number, valid_from:string, price_type?:string, customer?:string|null, note?:string, set_by:string}} body
 */
export async function setPrice(code, body) {
  const response = await apiClient.post(`${BASE}/items/${encodeURIComponent(code)}/prices/`, body);
  return response.data;
}

/**
 * Price a set of lines. Pure calculation — persists nothing.
 * @param {{lines:Array<{code:string, qty:number, days:number}>, customer?:string|null, date?:string, discount_pct?:number, vat_rate?:number}} body
 */
export async function buildQuote(body) {
  const response = await apiClient.post(`${BASE}/quote/`, body);
  return response.data;
}

/**
 * URL for the CSV export (baseURL + query string). Useful for an <a href>;
 * note the link itself carries no Bearer token — use downloadExport() when
 * the endpoint requires auth.
 * @param {{date?:string, customer?:string, active?:string|boolean}} params
 */
export function getExportUrl(params = {}) {
  const qs = new URLSearchParams(cleanParams(params)).toString();
  const base = getApiBaseUrl().replace(/\/$/, '');
  return `${base}${BASE}/export/${qs ? `?${qs}` : ''}`;
}

/**
 * Authenticated CSV export — fetches through apiClient (Bearer attached) and
 * triggers a browser download. Mirrors downloadInvestecBankTransactionsExcel.
 * @param {{date?:string, customer?:string, active?:string|boolean}} params
 */
export async function downloadExport(params = {}) {
  const response = await apiClient.get(`${BASE}/export/`, {
    params: cleanParams(params),
    responseType: 'blob',
  });
  const disposition = response.headers?.['content-disposition'];
  let filename = 'klikk_pricelist.csv';
  if (disposition) {
    const match = disposition.match(/filename="?([^";\n]+)"?/);
    if (match) filename = match[1];
  }
  const url = URL.createObjectURL(response.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
