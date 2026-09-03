import axios from 'axios';
import { getApiBaseUrl, API_ENDPOINTS } from '../utils/constants';

/**
 * Login with username and password
 */
export async function login(username, password) {
  const { default: apiClient } = await import('./client');
  const response = await apiClient.post(API_ENDPOINTS.LOGIN, {
    username,
    password,
  });
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

/**
 * Set a new password for the logged-in user.
 *
 * POST /api/auth/change-password/ { current_password, new_password }
 *   200 -> { changed: true }
 *   400 -> { detail, errors?: [ ...validator messages ] }
 *
 * The backend holds accounts flagged `must_change_password` on this endpoint
 * and nothing else, so it must go through apiClient (Bearer token attached) —
 * an anonymous call is a 401.
 */
export async function changePassword(currentPassword, newPassword) {
  const { default: apiClient } = await import('./client');
  const response = await apiClient.post(API_ENDPOINTS.CHANGE_PASSWORD, {
    current_password: currentPassword,
    new_password: newPassword,
  });
  return response.data;
}
