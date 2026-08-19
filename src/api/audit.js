import apiClient from './client';

/**
 * Year-end audit check registry (read-only).
 *
 * Backed by GET /audit/checks/ which reads Postgres `audit.checks` via raw SQL.
 * While that table is still being built the endpoint answers
 * { registry_ready: false, checks: [] } — the Audit Procedures page then falls
 * back to the static planned-check list in src/data/auditChecksPlanned.json.
 *
 * Returns: { registry_ready, count, categories, checks[] }
 */
export async function getAuditChecks(params = {}) {
  const response = await apiClient.get('/audit/checks/', { params });
  return response.data;
}
