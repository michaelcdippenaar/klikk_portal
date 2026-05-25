/**
 * useTheme — Klikk Design Language theme composable.
 *
 * Manages light / dark / system theme preference.
 * - Persists to localStorage under key 'klikk:theme'.
 * - Applies via data-theme="dark" on document.documentElement (not a CSS class),
 *   matching the KDL dark-mode wiring in klikk.css.
 * - 'system' mode listens to prefers-color-scheme changes in real time.
 */

import { ref, watch, onMounted, onUnmounted } from 'vue';

const STORAGE_KEY = 'klikk:theme';

/**
 * Resolve which visual theme to apply from a preference value.
 * @param {'light'|'dark'|'system'} pref
 * @returns {'light'|'dark'}
 */
function resolveTheme(pref) {
  if (pref === 'dark') return 'dark';
  if (pref === 'light') return 'light';
  // 'system'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(pref) {
  const resolved = resolveTheme(pref);
  if (resolved === 'dark') {
    // data-theme keeps existing klikk.css :root[data-theme="dark"] selectors working.
    // class="dark" enables Tailwind's darkMode: 'class' strategy (Phase 0+).
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.classList.remove('dark');
  }
}

// Shared reactive state — so multiple call-sites stay in sync.
const preference = ref(/** @type {'light'|'dark'|'system'} */ (
  localStorage.getItem(STORAGE_KEY) || 'system'
));

export function useTheme() {
  let mediaQuery = null;

  function handleSystemChange() {
    if (preference.value === 'system') {
      applyTheme('system');
    }
  }

  onMounted(() => {
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', handleSystemChange);
  });

  onUnmounted(() => {
    if (mediaQuery) {
      mediaQuery.removeEventListener('change', handleSystemChange);
    }
  });

  watch(preference, (newPref) => {
    localStorage.setItem(STORAGE_KEY, newPref);
    applyTheme(newPref);
  });

  /**
   * Set theme preference.
   * @param {'light'|'dark'|'system'} pref
   */
  function setTheme(pref) {
    preference.value = pref;
  }

  /** Toggle between light and dark (ignores 'system', forces explicit). */
  function toggleTheme() {
    const resolved = resolveTheme(preference.value);
    preference.value = resolved === 'dark' ? 'light' : 'dark';
  }

  const isDark = ref(resolveTheme(preference.value) === 'dark');

  watch(preference, () => {
    isDark.value = resolveTheme(preference.value) === 'dark';
  });

  return {
    preference,
    isDark,
    setTheme,
    toggleTheme,
  };
}

/**
 * Initialise theme from persisted preference.
 * Call this once before app mount (boot file).
 */
export function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEY) || 'system';
  applyTheme(saved);
}
