import apiClient from './client';

const SEARCH_URL = '/xero/data/journals/search/';

/**
 * Read-only search over the mirrored Xero journal ledger.
 *
 * Supported params: contact, query, amount, date_from, date_to, tenant,
 * account, reference, description, limit and offset.
 */
export async function searchXeroJournals(params = {}) {
  const response = await apiClient.get(SEARCH_URL, { params });
  return response.data;
}
