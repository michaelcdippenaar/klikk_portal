import apiClient from './client';

/**
 * Audit → Receipts (WhatsApp Slippies register) API.
 *
 * All reads/writes go through apiClient, which attaches the simplejwt Bearer
 * token from localStorage and transparently refreshes on 401.
 */

const BASE = '/audit/receipts/';

/** Server-side cap on sha256s per POST /bulk/ call — larger requests are rejected. */
export const BULK_MAX = 500;

/**
 * Paginated receipt list.
 * params: q, synced, status, fy, date_from, date_to, to_process, decision,
 *         archived, category, min_total, max_total, ordering, page, page_size
 *
 * `archived` is three-way and its DEFAULT is a filter, not the absence of one:
 * omitted -> archived receipts are EXCLUDED (that is the point of archiving),
 * 'true'  -> archived only, 'all' -> both. See utils/receipts ARCHIVED_OPTIONS.
 * Returns: { count, page, page_size, num_pages, totals: { count, sum_total }, results[] }
 */
export async function getReceipts(params = {}) {
  const response = await apiClient.get(BASE, { params });
  return response.data;
}

/**
 * sha256s for the WHOLE current filter (not just the page) — used by
 * "select all N". Same filter params as getReceipts(); paging is ignored
 * server-side. Returns { count, sha256s: [...], truncated } — `truncated`
 * is true when the filter matched more than 2000 rows (ids capped at 2000).
 */
export async function getReceiptIds(params = {}) {
  const response = await apiClient.get(BASE, { params: { ...params, ids_only: 1 } });
  return response.data;
}

/**
 * POST the bulk action. `sha256s` is chunked into batches of BULK_MAX (the
 * server rejects more than 500 in one call) and the per-batch results are
 * summed. Batches are POSTed sequentially (not in parallel) to keep the DB
 * write load predictable and the failure mode simple.
 *
 * actions: { set_to_process?, set_archived?, decision?, note?, comment? } — at
 * least one required (server 400s otherwise). Unknown sha256s are reported by the
 * server, not fatal — valid ones in the same batch are still processed.
 *
 * Returns the aggregate { updated, commented, unknown } across batches.
 * Empty `sha256s` resolves { updated: 0, commented: 0, unknown: [] } without
 * hitting the network. Throws on the first failing batch; the error carries
 * `err.partial = { updated, commented, unknown, batchesDone, batchesTotal }`
 * so the caller can tell the user how much HAD already been applied.
 */
export async function bulkUpdateReceipts(sha256s, actions) {
  const aggregate = { updated: 0, commented: 0, unknown: [] };
  const ids = Array.isArray(sha256s) ? sha256s : [];
  if (!ids.length) return aggregate;

  const batchesTotal = Math.ceil(ids.length / BULK_MAX);
  for (let i = 0; i < ids.length; i += BULK_MAX) {
    const batch = ids.slice(i, i + BULK_MAX);
    try {
      const response = await apiClient.post(`${BASE}bulk/`, { sha256s: batch, ...actions });
      const data = response?.data || {};
      aggregate.updated += Number(data.updated) || 0;
      aggregate.commented += Number(data.commented) || 0;
      if (Array.isArray(data.unknown)) aggregate.unknown = aggregate.unknown.concat(data.unknown);
    } catch (err) {
      err.partial = {
        ...aggregate,
        unknown: [...aggregate.unknown],
        batchesDone: Math.floor(i / BULK_MAX),
        batchesTotal,
      };
      throw err;
    }
  }
  return aggregate;
}

/**
 * Single receipt — list row + `ocr` (full object), `items[]`, `comments[]`.
 */
export async function getReceipt(sha256) {
  const response = await apiClient.get(`${BASE}${encodeURIComponent(sha256)}/`);
  return response.data;
}

/**
 * PATCH the review block. body: { to_process?, archived?, decision?, note? }
 * Returns the updated review object (incl. archived / archived_at / archived_by).
 *
 * `decision` is still accepted and still stores — the control was removed from
 * the UI on 2026-08-20, the contract was not. Never send it as '' from a screen
 * that does not display it, or you silently clear existing data.
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
 * The endpoint requires authentication (like every other receipts endpoint), so
 * it must go through apiClient — that attaches the Bearer token and refreshes it
 * on 401, and keeps baseURL resolution (dev :8001 vs /backend behind nginx) in
 * one place. A bare fetch()/window.open() would 401.
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
