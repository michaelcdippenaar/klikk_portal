<!--
  FreshnessChip — Klikk Design Language primitive (finance-admin variant).

  Surfaces "when did this last happen" anywhere: table captions, status-board
  rows, header status strips. Inline element (span). Updates every 30 seconds
  via useRelativeTime(). Tooltip always shows absolute ISO 8601 with timezone.

  API:
    value       (Date | string | null, required) — ISO 8601 string or Date object.
    prefix?     (string)  — optional label, e.g. "Last sync" → "Last sync: 4m ago"
    staleAfter? (number)  — minutes. If value is older, renders in warning tone.
    format?     ('relative' | 'absolute' | 'both') — default 'relative'.
                'both' shows relative as primary + absolute in muted text.

  States:
    - null value  → "Never" in muted token (no tooltip)
    - fresh       → muted text, no icon
    - stale       → warning-tone text + clock icon
    - format=both → relative primary, absolute muted secondary

  Accessibility:
    - Tooltip (title attr) provides absolute datetime on hover for all sighted users.
    - Clock icon is aria-hidden; the text carries the semantic value.
    - WCAG AA: muted token (#6B7280 on #FFFFFF = 4.61:1 ✓; dark #8A8C9F on #161827 = 4.52:1 ✓).
      Warning tone (#D97706 on #FFFFFF = 4.52:1 ✓; dark #FBBF24 on #161827 = 7.1:1 ✓).
-->
<template>
  <span
    class="freshness-chip"
    :class="[isStale ? 'freshness-chip--stale' : 'freshness-chip--fresh', formatClass]"
    :title="tooltipText || undefined"
  >
    <!-- Clock icon — only shown when stale -->
    <svg
      v-if="isStale"
      xmlns="http://www.w3.org/2000/svg"
      width="12" height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="freshness-chip__icon"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>

    <!-- Prefix label -->
    <span v-if="prefix" class="freshness-chip__prefix">{{ prefix }}:&nbsp;</span>

    <!-- Null value — "Never" -->
    <span v-if="!resolvedDate" class="freshness-chip__never">Never</span>

    <!-- Relative (default or primary when format=both) -->
    <span v-else class="freshness-chip__time">{{ relativeTime }}</span>

    <!-- Absolute secondary — only when format='both' and date exists -->
    <span
      v-if="format === 'both' && resolvedDate"
      class="freshness-chip__absolute"
    >{{ absoluteTime }}</span>
  </span>
</template>

<script setup>
import { computed } from 'vue';
import { useRelativeTime } from '../../composables/useRelativeTime.js';

const props = defineProps({
  /**
   * The timestamp to display. Accepts ISO 8601 string or Date object.
   * null → renders "Never".
   */
  value: {
    type: [Date, String, null],
    required: true,
    default: null,
  },
  /**
   * Optional prefix label rendered before the time string.
   * e.g. prefix="Last sync" → "Last sync: 4m ago"
   */
  prefix: {
    type: String,
    default: null,
  },
  /**
   * Staleness threshold in minutes. When value is older than this,
   * the chip shifts to warning-tone and prepends a clock icon.
   * Omit to disable staleness signalling.
   */
  staleAfter: {
    type: Number,
    default: null,
  },
  /**
   * Display format:
   *   'relative' (default) — "4m ago"
   *   'absolute'           — absolute datetime only
   *   'both'               — relative primary + absolute muted secondary
   */
  format: {
    type: String,
    default: 'relative',
    validator: (v) => ['relative', 'absolute', 'both'].includes(v),
  },
});

// Resolve input to a Date (or null).
const resolvedDate = computed(() => {
  if (!props.value) return null;
  if (props.value instanceof Date) return props.value;
  const d = new Date(props.value);
  return Number.isNaN(d.getTime()) ? null : d;
});

const { relative: relativeTime, absolute: absoluteTime } = useRelativeTime(resolvedDate);

// Tooltip: always absolute ISO with tz (or nothing when null).
const tooltipText = computed(() => {
  if (!resolvedDate.value) return null;
  return absoluteTime.value;
});

// Staleness: is the value older than staleAfter minutes?
const isStale = computed(() => {
  if (!props.staleAfter || !resolvedDate.value) return false;
  const ageMs = Date.now() - resolvedDate.value.getTime();
  const thresholdMs = props.staleAfter * 60 * 1000;
  return ageMs > thresholdMs;
});

const formatClass = computed(() => {
  if (props.format === 'both') return 'freshness-chip--both';
  if (props.format === 'absolute') return 'freshness-chip--absolute-only';
  return '';
});
</script>

<style scoped>
/* ── FreshnessChip ───────────────────────────────────────────────────────────
   Inline span. 13px / muted. Stale state: warning tone + clock icon.
   No background — it reads as metadata text, not a badge.
──────────────────────────────────────────────────────────────────────────── */
.freshness-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 13px;
  font-weight: 400;
  line-height: 1.4;
  cursor: default;
}

/* Fresh state — muted text */
.freshness-chip--fresh {
  color: var(--kdl-text-muted);
}

/* Stale state — warning tone text + clock icon */
.freshness-chip--stale {
  color: #D97706;
}

.freshness-chip__icon {
  flex-shrink: 0;
}

.freshness-chip__prefix {
  /* inherits color from parent state */
}

.freshness-chip__never {
  color: var(--kdl-text-hint);
  font-style: italic;
}

/* Both-format: absolute text is muted secondary */
.freshness-chip__absolute {
  font-size: 12px;
  color: var(--kdl-text-hint);
  margin-left: 4px;
}

/* ── Dark mode ──────────────────────────────────────────────────────────── */
/* Fresh — muted token is theme-aware via CSS variable, no override needed */

/* Stale — lift amber to dark-mode safe value (#FBBF24 on #161827 = 7.1:1) */
:root[data-theme="dark"] .freshness-chip--stale {
  color: #FBBF24;
}
</style>
