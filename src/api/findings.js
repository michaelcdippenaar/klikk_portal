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
 * Single finding detail — { finding, comments[], attachments[], links[] }.
 * (`links` lands with the linked-evidence endpoints; consumers must tolerate
 * its absence on older payloads.)
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

// ── Attachments ──────────────────────────────────────────────────────────────

/**
 * List a finding's attachments. Returns [attachment dicts] — the endpoint may
 * answer either a bare array or { attachments: [...] }; both are normalised
 * here so the caller never cares.
 */
export async function listFindingAttachments(id) {
  const response = await apiClient.get(`${BASE}${encodeURIComponent(id)}/attachments/`);
  const data = response.data;
  if (Array.isArray(data)) return data;
  return Array.isArray(data?.attachments) ? data.attachments : [];
}

/**
 * Upload one file (multipart, field `file`, optional `note`). 201 → the
 * attachment dict { id, finding_id, original_name, content_type, size,
 * uploaded_by, created_at, view_url }.
 *
 * `Content-Type: null` clears the apiClient default (application/json) so the
 * browser sets the multipart boundary itself — the house pattern from
 * endpoints.js. Never hand-set 'multipart/form-data': it drops the boundary.
 *
 * `onProgress(percent)` reports upload progress (0–100, null when the total
 * is unknown).
 */
export async function uploadFindingAttachment(id, file, { note, onProgress } = {}) {
  const formData = new FormData();
  formData.append('file', file);
  if (note != null && String(note).trim() !== '') formData.append('note', String(note).trim());
  const response = await apiClient.post(`${BASE}${encodeURIComponent(id)}/attachments/`, formData, {
    headers: { 'Content-Type': null },
    onUploadProgress: (event) => {
      if (typeof onProgress !== 'function') return;
      const total = Number(event?.total) || 0;
      onProgress(total > 0 ? Math.min(100, Math.round((event.loaded / total) * 100)) : null);
    },
  });
  return response.data;
}

/** Delete one attachment (also removes the file from disk server-side). */
export async function deleteFindingAttachment(attachmentId) {
  const response = await apiClient.delete(`${BASE}attachments/${encodeURIComponent(attachmentId)}/`);
  return response.data;
}

// ── Cube view ────────────────────────────────────────────────────────────────

/**
 * Run the finding's saved cube view.
 * Returns { finding_id, fy, name, spec, query, params, cube: <pivot payload> }.
 * 404 (by design) when no cube view is saved on the finding — the caller must
 * treat that as "none saved yet", not as an error.
 */
export async function getFindingCubeData(id) {
  const response = await apiClient.get(`${BASE}${encodeURIComponent(id)}/cube-view/data/`);
  return response.data;
}

/**
 * Save (replace) the finding's cube view.
 * body: { name?, spec, query?, cube_note? } — `spec` is the canonical
 * Excel-add-in shape { rows, cols, measure, filt, filters, totals, suppress, outline }.
 */
export async function saveFindingCubeView(id, body) {
  const response = await apiClient.put(`${BASE}${encodeURIComponent(id)}/cube-view/`, body);
  return response.data;
}

/** Clear the finding's saved cube view. */
export async function deleteFindingCubeView(id) {
  const response = await apiClient.delete(`${BASE}${encodeURIComponent(id)}/cube-view/`);
  return response.data;
}

/**
 * Derive a starting-point cube view from the finding's structured data
 * (fy bounds + linked entities). NOT saved server-side. The response carries
 * `derived_from: [...]` naming which inputs contributed — surface it so the
 * user knows this is a seed, not an answer.
 */
export async function suggestFindingCubeView(id) {
  const response = await apiClient.get(`${BASE}${encodeURIComponent(id)}/cube-view/suggest/`);
  return response.data;
}

/**
 * The journal-pivot dimension/measure vocabulary the cube editor offers.
 * Returns { dimensions: [{key, label}], measures: [{key, label}] }.
 */
export async function getPivotDimensions() {
  const response = await apiClient.get('/xero/data/journals/pivot/dimensions/');
  return response.data;
}

// ── Linked evidence ──────────────────────────────────────────────────────────

/**
 * The finding's links, resolved for display.
 * Returns { finding_id, count, links: [{ id, kind, ref, label, added_by,
 * created_at, resolved: { found, title, subtitle?, view_url?, detail? } }] }.
 * A dangling ref resolves to { found: false, title: <raw ref> } — normal,
 * never an error.
 */
export async function listFindingLinks(id) {
  const response = await apiClient.get(`${BASE}${encodeURIComponent(id)}/links/`);
  return response.data;
}

/**
 * Attach one link { kind, ref, label? }. Idempotent on (kind, ref):
 * 201 { created: true, link } for a new one, 200 { created: false, link }
 * for a duplicate — never a 409.
 */
export async function addFindingLink(id, body) {
  const response = await apiClient.post(`${BASE}${encodeURIComponent(id)}/links/`, body);
  return response.data;
}

/** Remove one link. → { deleted: true, id }. */
export async function deleteFindingLink(linkId) {
  const response = await apiClient.delete(`${BASE}links/${encodeURIComponent(linkId)}/`);
  return response.data;
}

// ── Linked-evidence search (picker sources) ─────────────────────────────────
// These proxy endpoints owned by other modules; they live here because the
// findings link picker is their only console consumer. Slip search reuses
// getReceipts() from ./receipts directly.

/**
 * Search the local Xero document mirror.
 * params: q, invoice_number, amount, date_from, date_to, tenant_id, limit
 * Returns { count, limit, results: [{ id, file_name, content_type,
 * invoice_number, contact_name, date, total, view_url }] }.
 */
export async function searchXeroDocuments(params = {}) {
  const response = await apiClient.get('/xero/data/documents/search/', { params });
  return response.data;
}

/**
 * Search Investec bank transactions across all accounts.
 * params: amount, description, date_from, date_to, account, limit, offset
 * Returns { count, results: [{ id, transaction_date, type, amount,
 * description, account_number, account_name }] }.
 * NB: credits are stored NEGATIVE; transaction_date is the reliable date.
 */
export async function searchBankTransactions(params = {}) {
  const response = await apiClient.get('/api/investec/bank/transactions/', { params });
  return response.data;
}
