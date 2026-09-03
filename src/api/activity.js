import apiClient from './client';

/**
 * The append-only activity trail — "who did what" on the audit surface.
 *
 * Mounted at /api/activity/, deliberately OUTSIDE /audit/: auditor accounts are
 * what the trail records, and the backend gate 403s every non-/audit/ path for
 * them. The console mirrors that by keeping the page out of the auditor nav and
 * router allowlist — but the server is the boundary, not this file.
 */

const BASE = '/api/activity/';

/**
 * Paginated events, newest first.
 *
 * params: actor, action (repeatable), target_kind, target_id, since, until, q,
 *         page, page_size (server caps at 200)
 * Returns { count, page, page_size, num_pages, results[] } where each result is
 * { id, occurred_at, actor, actor_role, action, target_kind, target_id,
 *   target_ref, changes, source, ip, user_agent, request_id }.
 */
export async function listActivity(params = {}) {
  const response = await apiClient.get(BASE, { params });
  return response.data;
}

/** Every event on one object, newest first — the detail dialogs' Activity tab. */
export async function listObjectActivity(targetKind, targetId, params = {}) {
  const response = await apiClient.get(BASE, {
    params: { ...params, target_kind: targetKind, target_id: targetId },
  });
  return response.data;
}

/** Distinct actors, for the filter dropdown. */
export async function listActivityActors() {
  const response = await apiClient.get(`${BASE}actors/`);
  return response.data?.actors ?? [];
}

/**
 * The known action slugs, straight from the backend — so the console's filter
 * cannot drift from the set of verbs the app actually records.
 */
export async function listActivityActions() {
  const response = await apiClient.get(`${BASE}actions/`);
  return response.data?.actions ?? [];
}

/**
 * Export the filtered trail as CSV and trigger a browser download.
 *
 * Must go through apiClient — that attaches the Bearer token and keeps baseURL
 * resolution (dev :8001 vs /backend behind nginx) in one place. A bare
 * window.open() would 401.
 */
export async function exportActivity(params = {}) {
  const response = await apiClient.get(`${BASE}export/`, {
    params,
    responseType: 'blob',
  });
  const disposition = response.headers?.['content-disposition'];
  let filename = `activity-${new Date().toISOString().slice(0, 10)}.csv`;
  if (disposition) {
    const match = disposition.match(/filename="?([^";\n]+)"?/);
    if (match) filename = match[1];
  }
  const url = URL.createObjectURL(response.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
