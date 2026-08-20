import apiClient from './client';

/**
 * Audit → Findings register API.
 *
 * Thin wrappers over the frozen /audit/findings/ contract. All calls go
 * through apiClient, which attaches the simplejwt Bearer token from
 * localStorage and transparently refreshes it on 401.
 *
 * Payload notes the page relies on:
 *   - `amount` is a 2dp STRING ("429110.39") or null — never a number.
 *   - `due_date` is 'YYYY-MM-DD' or null.
 *   - list totals are over the WHOLE filter, not the page.
 */

const BASE = '/audit/findings/';

/** Server-side cap on ids per POST /bulk/ call — larger requests are rejected. */
export const BULK_MAX = 500;

/**
 * Paginated findings list.
 * params: fy ('all' or end-year int), status, severity, category (each
 *         comma-separated), owner, check_code, q, amount_min, amount_max,
 *         ordering, page, page_size
 * Returns: { count, page, page_size, num_pages, fy, current_fy,
 *            totals: { count, amount }, results[] }
 */
export async function listFindings(params = {}) {
  const response = await apiClient.get(BASE, { params });
  return response.data;
}

/**
 * Single finding detail — { finding, comments[], attachments[] }.
 */
export async function getFinding(id) {
  const response = await apiClient.get(`${BASE}${encodeURIComponent(id)}/`);
  return response.data;
}

/**
 * Create a finding. Required: title, severity, category, source.
 * `ref` is server-assigned. 201 → finding dict.
 */
export async function createFinding(body) {
  const response = await apiClient.post(BASE, body);
  return response.data;
}

/**
 * PATCH editable fields (status, owner, due_date, amount, severity, category,
 * title, description, evidence, check_code, asana_gid, source, currency).
 * At least one key required. Returns the updated finding dict.
 */
export async function updateFinding(id, body) {
  const response = await apiClient.patch(`${BASE}${encodeURIComponent(id)}/`, body);
  return response.data;
}

/**
 * Add a comment. → 201 comment dict { id, finding_id, text, author, created_at }.
 */
export async function addFindingComment(id, text) {
  const response = await apiClient.post(`${BASE}${encodeURIComponent(id)}/comments/`, { text });
  return response.data;
}

/**
 * Bulk update. body: { ids: [...], status?, owner?, due_date?, comment? } —
 * at least one action key must be PRESENT. The server caps ids at BULK_MAX
 * after de-duplication (400 above that) — the page enforces the cap in the
 * UI rather than chunking, so one call maps to one auditable server action.
 * Returns { updated, commented, unknown }.
 */
export async function bulkUpdateFindings(body) {
  const response = await apiClient.post(`${BASE}bulk/`, body);
  return response.data;
}

/**
 * Aggregates for the summary strip. Accepts the same filters as the list
 * (fy/status/severity/category/owner/check_code/q/amount_min/amount_max) so
 * the strip and the table always agree.
 * Returns { fy, current_fy, fy_options, count, amount, open_count,
 *           by_severity[], by_status[], by_category[], by_owner[] }.
 */
export async function findingsSummary(params = {}) {
  const response = await apiClient.get(`${BASE}summary/`, { params });
  return response.data;
}

/**
 * Export the filtered register as CSV or XLSX and trigger a browser download.
 * Same filter params as listFindings() (paging ignored server-side).
 * The endpoint requires authentication like every other findings endpoint, so
 * it must go through apiClient — that attaches the Bearer token and refreshes
 * it on 401, and keeps baseURL resolution (dev :8001 vs /backend behind
 * nginx) in one place. A bare fetch()/window.open() would 401.
 */
export async function exportFindingsUrl(params = {}, format = 'csv') {
  const response = await apiClient.get(`${BASE}export/`, {
    params: { ...params, format },
    responseType: 'blob',
  });
  const blob = response.data;
  const disposition = response.headers?.['content-disposition'];
  let filename = `audit-findings-${new Date().toISOString().slice(0, 10)}.${format}`;
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
