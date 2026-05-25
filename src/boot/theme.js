import { boot } from 'quasar/wrappers';
import { initTheme } from '../composables/useTheme';

/**
 * Boot: initialise Klikk theme before Vue mounts.
 * Reads persisted preference from localStorage and applies data-theme attribute
 * to <html> so that the page renders with the correct theme on first paint.
 */
export default boot(() => {
  initTheme();
});
