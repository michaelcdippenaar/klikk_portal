import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../client', () => ({
  default: { get: vi.fn() },
}));

import apiClient from '../client';
import { searchXeroJournals } from '../xeroJournals';

const client = apiClient as unknown as { get: ReturnType<typeof vi.fn> };

beforeEach(() => client.get.mockReset());

describe('searchXeroJournals', () => {
  it('uses the authenticated journal search endpoint with supplier paging', async () => {
    const payload = { count: 1, results: [{ id: 1 }] };
    client.get.mockResolvedValue({ data: payload });

    await expect(searchXeroJournals({ contact: 'BP Dorp Street', limit: 200, offset: 0 }))
      .resolves.toEqual(payload);
    expect(client.get).toHaveBeenCalledWith('/xero/data/journals/search/', {
      params: { contact: 'BP Dorp Street', limit: 200, offset: 0 },
    });
  });
});
