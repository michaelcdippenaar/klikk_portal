import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
  changePassword as apiChangePassword,
  login as apiLogin,
  refreshToken as apiRefreshToken,
} from '../api/auth';
import { STORAGE_KEYS } from '../utils/constants';

function getCookieDomain() {
  const hostname = window.location.hostname;
  // Don't set domain for IP addresses or localhost — browser will scope to current host
  if (/^(\d+\.){3}\d+$/.test(hostname) || hostname === 'localhost') {
    return '';
  }
  return '; domain=.klikk.co.za';
}

function setAuthCookie(name, value) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${value}${getCookieDomain()}; path=/; SameSite=Lax${secure}`;
}

function clearAuthCookie(name) {
  document.cookie = `${name}=${getCookieDomain()}; path=/; max-age=0`;
}

function getAuthErrorMessage(error) {
  const data = error.response?.data;
  return data?.detail || data?.error || error.message || 'Login failed';
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null);
  const token = ref(localStorage.getItem(STORAGE_KEYS.TOKEN) || null);
  const refreshTokenValue = ref(localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN) || null);

  const isAuthenticated = computed(() => !!token.value);
  /**
   * External-auditor account (User.role === 'auditor'). The backend hard-gates
   * these to read-only /audit/ access; this flag only shapes the UI to match
   * (nav, guards, hidden write controls) — it is NOT the security boundary.
   */
  const isAuditor = computed(() => user.value?.role === 'auditor');

  /**
   * The account is holding a temporary password (created by create_auditor).
   * The backend 403s everything except the auth + change-password endpoints
   * until it is replaced; the router guard mirrors that so the user lands on
   * the right screen instead of a wall of failed requests.
   */
  const mustChangePassword = computed(() => !!user.value?.must_change_password);

  // Load user from localStorage on init
  const storedUser = localStorage.getItem(STORAGE_KEYS.USER);
  if (storedUser) {
    try {
      user.value = JSON.parse(storedUser);
    } catch (e) {
      console.error('Failed to parse stored user', e);
    }
  }

  async function login(username, password) {
    try {
      const data = await apiLogin(username, password);
      // API returns { user, tokens: { access, refresh } }
      token.value = data.tokens?.access ?? data.access;
      refreshTokenValue.value = data.tokens?.refresh ?? data.refresh;
      user.value = data.user || { username };

      // Store in localStorage
      localStorage.setItem(STORAGE_KEYS.TOKEN, token.value);
      localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refreshTokenValue.value);
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user.value));

      // Set cookie for cross-subdomain auth (nginx auth_request reads this)
      setAuthCookie('klikk_token', token.value);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: getAuthErrorMessage(error),
      };
    }
  }

  async function refreshToken() {
    if (!refreshTokenValue.value) {
      throw new Error('No refresh token available');
    }

    try {
      const data = await apiRefreshToken(refreshTokenValue.value);
      token.value = data.access;
      localStorage.setItem(STORAGE_KEYS.TOKEN, token.value);
      setAuthCookie('klikk_token', token.value);
      return { success: true };
    } catch (error) {
      logout();
      throw error;
    }
  }

  /**
   * Rotate the password. On success the flag is cleared in state AND in the
   * persisted user, so a reload does not send the holder back to the
   * change-password screen with nothing left to change.
   *
   * Returns { success } or { success: false, error, errors } where `errors`
   * are the server's password-validator messages.
   */
  async function changePassword(currentPassword, newPassword) {
    try {
      await apiChangePassword(currentPassword, newPassword);
      if (user.value) {
        user.value = { ...user.value, must_change_password: false };
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user.value));
      }
      return { success: true };
    } catch (error) {
      const data = error.response?.data;
      return {
        success: false,
        error: getAuthErrorMessage(error),
        errors: Array.isArray(data?.errors) ? data.errors : [],
      };
    }
  }

  function logout() {
    user.value = null;
    token.value = null;
    refreshTokenValue.value = null;
    localStorage.removeItem(STORAGE_KEYS.TOKEN);
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER);
    localStorage.removeItem(STORAGE_KEYS.SELECTED_TENANT);
    clearAuthCookie('klikk_token');
  }

  return {
    user,
    token,
    refreshTokenValue,
    isAuthenticated,
    isAuditor,
    mustChangePassword,
    login,
    changePassword,
    refreshToken,
    logout,
  };
});
