<template>
  <!--
    ResultPanel — structured result display for async operations.
    Replaces the <pre>{{ JSON.stringify(result) }}</pre> pattern in ProcessCard.

    Status cascade:
      idle    — no result yet, renders nothing (or optional slot)
      loading — spinner + label
      success — structured summary (counts, timestamp, warnings)
      error   — error message with retry slot
  -->
  <div v-if="status !== 'idle'" class="kdl-result-panel" :class="`kdl-result-panel--${status}`">

    <!-- Loading -->
    <div v-if="status === 'loading'" class="kdl-result-panel__loading">
      <svg
        class="kdl-spinner"
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
      <span class="kdl-result-panel__label">Running…</span>
    </div>

    <!-- Success -->
    <template v-else-if="status === 'success'">
      <div class="kdl-result-panel__success-header">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          class="kdl-result-panel__status-icon"
        >
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
        <span class="kdl-result-panel__label">Completed</span>

        <!-- Timestamp -->
        <span v-if="summary?.timestamp" class="kdl-result-panel__meta tabular-nums">
          {{ formatTime(summary.timestamp) }}
        </span>
      </div>

      <!-- Summary counts -->
      <div v-if="summary && hasCounts" class="kdl-result-panel__counts">
        <template v-for="(val, key) in summaryWithoutMeta" :key="key">
          <div class="kdl-result-panel__count-item">
            <span class="kdl-result-panel__count-value tabular-nums">{{ val }}</span>
            <span class="kdl-result-panel__count-label">{{ formatKey(key) }}</span>
          </div>
        </template>
      </div>

      <!-- Warnings -->
      <ul v-if="summary?.warnings?.length" class="kdl-result-panel__warnings">
        <li v-for="(w, i) in summary.warnings" :key="i" class="kdl-result-panel__warning-item">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          {{ w }}
        </li>
      </ul>

      <!-- Raw payload disclosure -->
      <div v-if="rawPayload !== undefined && rawPayload !== null" class="kdl-result-panel__raw">
        <button
          class="kdl-result-panel__raw-toggle"
          :aria-expanded="showRaw"
          @click="showRaw = !showRaw"
        >
          {{ showRaw ? 'Hide' : 'Show' }} raw response
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
            :style="{ transform: showRaw ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <pre v-if="showRaw" class="kdl-result-panel__raw-pre">{{ JSON.stringify(rawPayload, null, 2) }}</pre>
      </div>
    </template>

    <!-- Error -->
    <div v-else-if="status === 'error'" class="kdl-result-panel__error">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        class="kdl-result-panel__status-icon"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <div class="kdl-result-panel__error-content">
        <span class="kdl-result-panel__label">{{ summary?.message || 'An error occurred' }}</span>
        <slot name="retry" />
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  /**
   * Current status of the async operation.
   * @type {'idle'|'loading'|'success'|'error'}
   */
  status: {
    type: String,
    required: true,
    validator: (v) => ['idle', 'loading', 'success', 'error'].includes(v),
  },
  /**
   * Structured summary — object with counts (numbers), timestamp (string/Date),
   * warnings (string[]), and optionally message (string, used in error state).
   */
  summary: {
    type: Object,
    default: null,
  },
  /**
   * Raw API payload — hidden by default behind a disclosure toggle.
   * Pass null/undefined to suppress the toggle entirely.
   */
  rawPayload: {
    type: null,
    default: null,
  },
});

const showRaw = ref(false);

// Filter out meta keys from counts display.
const META_KEYS = new Set(['timestamp', 'warnings', 'message']);

const summaryWithoutMeta = computed(() => {
  if (!props.summary) return {};
  return Object.fromEntries(
    Object.entries(props.summary).filter(
      ([k, v]) => !META_KEYS.has(k) && typeof v === 'number'
    )
  );
});

const hasCounts = computed(() => Object.keys(summaryWithoutMeta.value).length > 0);

function formatKey(key) {
  // "processedRows" → "Processed Rows"
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

function formatTime(ts) {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return String(ts);
  }
}
</script>

<style scoped>
.kdl-result-panel {
  border-radius: 8px;
  border: 1px solid var(--kdl-border-subtle);
  background: var(--kdl-raised-bg);
  padding: 12px 16px;
  font-size: 15px;
}

.kdl-result-panel--loading {
  border-color: var(--kdl-border-subtle);
}

.kdl-result-panel--success {
  border-color: #0d9488;
  border-left: 3px solid #0d9488;
}

.kdl-result-panel--error {
  border-color: #dc2626;
  border-left: 3px solid #dc2626;
}

:root[data-theme="dark"] .kdl-result-panel--success {
  border-color: #2DD4BF;
  border-left-color: #2DD4BF;
}

:root[data-theme="dark"] .kdl-result-panel--error {
  border-color: #F87171;
  border-left-color: #F87171;
}

/* Loading */
.kdl-result-panel__loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--kdl-text-muted);
}

.kdl-spinner {
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

/* Success */
.kdl-result-panel__success-header {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #0d9488;
  font-weight: 500;
  margin-bottom: 10px;
}

:root[data-theme="dark"] .kdl-result-panel__success-header {
  color: #2DD4BF;
}

.kdl-result-panel__status-icon {
  flex-shrink: 0;
}

.kdl-result-panel__label {
  font-weight: 500;
  color: inherit;
}

.kdl-result-panel__meta {
  font-size: 13px;
  color: var(--kdl-text-muted);
  margin-left: auto;
}

/* Counts */
.kdl-result-panel__counts {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.kdl-result-panel__count-item {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.kdl-result-panel__count-value {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.1;
  color: var(--kdl-text-primary);
}

.kdl-result-panel__count-label {
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--kdl-text-muted);
}

/* Warnings */
.kdl-result-panel__warnings {
  list-style: none;
  padding: 0;
  margin: 0 0 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.kdl-result-panel__warning-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 13px;
  color: #92400E;
}

:root[data-theme="dark"] .kdl-result-panel__warning-item {
  color: #FBBF24;
}

/* Raw payload */
.kdl-result-panel__raw {
  border-top: 1px solid var(--kdl-border-subtle);
  margin-top: 10px;
  padding-top: 10px;
}

.kdl-result-panel__raw-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  padding: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--kdl-text-muted);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.kdl-result-panel__raw-toggle:hover {
  color: var(--kdl-text-secondary);
}

.kdl-result-panel__raw-pre {
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--kdl-hover-bg);
  border: 1px solid var(--kdl-border-subtle);
  font-size: 12px;
  color: var(--kdl-text-secondary);
  overflow-x: auto;
  white-space: pre;
  font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, monospace;
}

/* Error */
.kdl-result-panel__error {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: #dc2626;
}

:root[data-theme="dark"] .kdl-result-panel__error {
  color: #F87171;
}

.kdl-result-panel__error-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}
</style>
