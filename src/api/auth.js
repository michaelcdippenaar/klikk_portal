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
