import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
  },
}));

import axios from 'axios';
import { login } from '../auth';
import { API_ENDPOINTS, getApiBaseUrl } from '../../utils/constants';

describe('auth API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('posts login through plain axios with the configured API base URL', async () => {
    const responseData = {
      user: { username: 'admin' },
      tokens: { access: 'access-token', refresh: 'refresh-token' },
    };
    axios.post.mockResolvedValue({ data: responseData });

    await expect(login('admin@example.com', 'password')).resolves.toEqual(responseData);

    expect(axios.post).toHaveBeenCalledWith(
      `${getApiBaseUrl()}${API_ENDPOINTS.LOGIN}`,
      { username: 'admin@example.com', password: 'password' },
      { headers: { 'Content-Type': 'application/json' } },
    );
  });

  it('preserves a 401 from the login endpoint instead of attempting token refresh', async () => {
    const error = {
      response: { status: 401, data: { error: 'Invalid credentials' } },
    };
    axios.post.mockRejectedValue(error);

    await expect(login('admin', 'wrong-password')).rejects.toBe(error);
    expect(axios.post).toHaveBeenCalledTimes(1);
  });
});
