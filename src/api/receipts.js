import apiClient from './client';

/**
 * Audit → Receipts (WhatsApp Slippies register) API.
 *
 * All reads/writes go through apiClient, which attaches the simplejwt Bearer
 * token from localStorage and transparently refreshes on 401.
 */

const BASE = '/audit/receipts/';

/**
 * Paginated receipt list.
 * params: q, synced, status, fy, date_from, date_to, to_process, decision,
 *         category, min_total, max_total, ordering, page, page_size
 * Returns: { count, page, page_size, num_pages, totals: { count, sum_total }, results[] }
 */
export async function getReceipts(params = {}) {
  const response = await apiClient.get(BASE, { params });
  return response.data;
}

/**
 * Single receipt — list row + `ocr` (full object), `items[]`, `comments[]`.
 */
export async function getReceipt(sha256) {
  const response = await apiClient.get(`${BASE}${encodeURIComponent(sha256)}/`);
  return response.data;
}

/**
 * PATCH the review block. body: { to_process?, decision?, note? }
 * Returns the updated review object.
 */
export async function patchReceiptReview(sha256, body) {
  const response = await apiClient.patch(`${BASE}${encodeURIComponent(sha256)}/review/`, body);
  return response.data;
}

/**
 * Add a comment. body: { text } → 201 created comment { id, text, author, created_at }
 */
export async function postReceiptComment(sha256, text) {
  const response = await apiClient.post(`${BASE}${encodeURIComponent(sha256)}/comments/`, { text });
  return response.data;
}

/**
 * Export the filtered register as CSV or XLSX and trigger a browser download.
 * Same filter params as getReceipts() (paging ignored server-side).
 * The endpoint is AllowAny, but going through apiClient keeps the baseURL
 * resolution (dev :8001 vs /backend behind nginx) in one place.
 */
export async function downloadReceiptsExport(params = {}, format = 'csv') {
  const response = await apiClient.get(`${BASE}export/`, {
    params: { ...params, format },
    responseType: 'blob',
  });
  const blob = response.data;
  const disposition = response.headers?.['content-disposition'];
  let filename = `receipts_${new Date().toISOString().slice(0, 10)}.${format}`;
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
