/**
 * useRelativeTime — Klikk Design Language composable.
 *
 * Returns a reactive relative-time string for a given Date (or null).
 * Updates every 30 seconds while the component is mounted.
 *
 * Rules:
 *  - null             → 'Never run'
 *  - < 60s            → 'just now'
 *  - < 60m            → 'Xm ago'
 *  - < 24h            → 'Xh Ym ago'
 *  - yesterday        → 'yesterday HH:MM'
 *  - 2–6d             → 'X days ago'
 *  - 7–30d            → 'X weeks ago'
 *  - > 30d            → absolute ISO date (YYYY-MM-DD)
 *
 * The raw ISO datetime string (for tooltip) is also returned as `absolute`.
 *
 * USAGE:
 *   const { relative, absolute } = useRelativeTime(computed(() => props.lastRunAt))
 */

import { ref, computed, onMounted, onUnmounted, watch } from 'vue';

/**
 * Format a Date relative to now.
 * @param {Date|null} date
 * @returns {string}
 */
function formatRelative(date) {
  if (!date) return 'Never run';

  const now = Date.now();
  const then = date instanceof Date ? date.getTime() : new Date(date).getTime();
  const diffMs = now - then;

  // Future or malformed — fall back to absolute
  if (Number.isNaN(diffMs)) return 'Never run';

  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) {
    const mins = diffMins % 60;
    return mins > 0 ? `${diffHours}h ${mins}m ago` : `${diffHours}h ago`;
  }

  // "yesterday HH:MM"
  const dateObj = date instanceof Date ? date : new Date(date);
  const nowDate = new Date(now);
  const yesterday = new Date(nowDate);
  yesterday.setDate(yesterday.getDate() - 1);

  if (
    dateObj.getDate() === yesterday.getDate() &&
    dateObj.getMonth() === yesterday.getMonth() &&
    dateObj.getFullYear() === yesterday.getFullYear()
  ) {
    const hh = String(dateObj.getHours()).padStart(2, '0');
    const mm = String(dateObj.getMinutes()).padStart(2, '0');
    return `yesterday ${hh}:${mm}`;
  }

  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays <= 30) return `${diffWeeks} week${diffWeeks !== 1 ? 's' : ''} ago`;

  // > 30d — absolute YYYY-MM-DD
  return dateObj.toISOString().slice(0, 10);
}

/**
 * Format an absolute ISO datetime with timezone for tooltip display.
 * @param {Date|null} date
 * @returns {string}
 */
function formatAbsolute(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  // Format: "2026-05-25 14:03 SAST" — use Intl for timezone name
  const options = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  };
  return d.toLocaleString('en-ZA', options);
}

/**
 * @param {import('vue').Ref<Date|null>|Date|null} dateRef
 * @returns {{ relative: import('vue').Ref<string>, absolute: import('vue').ComputedRef<string> }}
 */
export function useRelativeTime(dateRef) {
  // Accept a raw Date/null or a ref/computed
  const dateComputed = computed(() => {
    const val = typeof dateRef === 'object' && dateRef && 'value' in dateRef
      ? dateRef.value
      : dateRef;
    return val;
  });

  const relative = ref(formatRelative(dateComputed.value));
  const absolute = computed(() => formatAbsolute(dateComputed.value));

  let timer = null;

  function update() {
    relative.value = formatRelative(dateComputed.value);
  }

  // Re-compute when date changes
  watch(dateComputed, update, { immediate: true });

  onMounted(() => {
    timer = setInterval(update, 30_000);
  });

  onUnmounted(() => {
    if (timer) clearInterval(timer);
  });

  return { relative, absolute };
}
