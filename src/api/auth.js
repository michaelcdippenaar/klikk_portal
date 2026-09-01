import axios from 'axios';
import { getApiBaseUrl, API_ENDPOINTS } from '../utils/constants';

/**
 * Login with username and password
 */
export async function login(username, password) {
  // Login must use a plain axios request. The shared client retries 401s by
  // refreshing the current session token; on a normal invalid login that
  // replaces the useful backend error with "No refresh token available".
  // Keep the same computed base URL so direct :8080/:9000 and proxied
  // deployments continue to target the correct backend.
  const response = await axios.post(
    `${getApiBaseUrl()}${API_ENDPOINTS.LOGIN}`,
    { username, password },
    { headers: { 'Content-Type': 'application/json' } },
  );
  return response.data;
}

/**
 * Refresh access token.
 * Uses a plain axios instance to avoid the 401-interceptor loop:
 * if the refresh call itself returns 401, we must NOT retry it.
 */
export async function refreshToken(refreshToken) {
  const response = await axios.post(
    `${getApiBaseUrl()}${API_ENDPOINTS.REFRESH}`,
    { refresh: refreshToken },
    { headers: { 'Content-Type': 'application/json' } },
  );
  return response.data;
}
