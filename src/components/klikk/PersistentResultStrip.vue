<!--
  PersistentResultStrip — Klikk Design Language primitive (finance-admin variant).

  Replaces toast-only failure surfacing. Persists the last-run state of a
  long-running operation inline on the page so an operator returning hours
  later still sees what happened.

  API:
    result  (object, required) — {
              status:      'success' | 'error' | 'running'
              completedAt: Date | string | null
              durationMs?: number
              summary?:    string (markdown-lite: bold + italic only)
              error?:      string
              actions?:    Array<{ label: string, handler: Function }>
            }
    title?   (string) — e.g. "Last reconciliation" / "Last sync run"
    compact? (boolean) — single-line variant for above-table use (default false)

  Renders nothing when result is null/undefined (absence is the signal).

  Layout:
    Left   — StatusPill (matching result.status)
    Center — title + summary (multi-line) or just summary (compact)
    Right  — FreshnessChip + optional action buttons

  Accessibility:
    - role="status" announces updates to screen readers without interrupting.
    - Error text is in its own row so it's not buried in the summary region.
    - Action buttons use aria-label for icon-only variants (none currently).
-->
<template>
  <div
    v-if="result"
    class="prs-strip"
    :class="[`prs-strip--${result.status}`, compact ? 'prs-strip--compact' : 'prs-strip--full']"
    role="status"
    :aria-label="stripAriaLabel"
  >
    <!-- Left: StatusPill -->
    <div class="prs-strip__pill">
      <StatusPill
        :tone="statusToTone[result.status] || 'neutral'"
        :label="statusLabels[result.status] || result.status"
        :icon="true"
        :size="compact ? 'sm' : 'md'"
      />
    </div>

    <!-- Center: title + summary -->
    <div class="prs-strip__body">
      <span v-if="title && !compact" class="prs-strip__title">{{ title }}</span>
      <!-- summary: markdown-lite bold/italic via v-html with sanitised output -->
      <span
        v-if="result.summary"
        class="prs-strip__summary"
        v-html="renderSummary(result.summary)"
      />
      <span v-else-if="compact && title" class="prs-strip__summary prs-strip__summary--muted">
        {{ title }}
      </span>
    </div>

    <!-- Right: FreshnessChip + actions -->
    <div class="prs-strip__right">
      <FreshnessChip
        v-if="result.completedAt !== undefined"
        :value="result.completedAt"
      />
      <template v-if="result.actions && result.actions.length">
        <button
          v-for="action in result.actions"
          :key="action.label"
          class="btn-ghost btn-sm prs-strip__action"
          type="button"
          @click="action.handler"
        >{{ action.label }}</button>
      </template>
    </div>

    <!-- Error detail row — below the main strip when status=error -->
    <div
      v-if="result.status === 'error' && result.error"
      class="prs-strip__error-row"
    >
      <!-- x-circle icon -->
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="12" height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="prs-strip__error-icon"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
      <span class="prs-strip__error-text">{{ result.error }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import StatusPill from './StatusPill.vue';
import FreshnessChip from './FreshnessChip.vue';

const props = defineProps({
  /**
   * The last-run result object.
   * Render nothing if null/undefined — absence is the signal (no "no result yet" placeholder).
   */
  result: {
    type: Object,
    default: null,
  },
  /**
   * Optional heading, e.g. "Last reconciliation" / "Last sync run".
   * In compact mode this shifts to a muted summary when no result.summary.
   */
  title: {
    type: String,
    default: null,
  },
  /**
   * compact=true: single-line, tighter padding — use above tables.
   * compact=false (default): multi-line with summary text below.
   */
  compact: {
    type: Boolean,
    default: false,
  },
});

// Map result status to StatusPill tone
const statusToTone = {
  success: 'success',
  error:   'error',
  running: 'running',
};

const statusLabels = {
  success: 'Success',
  error:   'Failed',
  running: 'Running',
};

// Markdown-lite: only bold (**text**) and italic (*text*) allowed.
// No v-html of raw user content — only summary strings composed by the app.
function renderSummary(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

const stripAriaLabel = computed(() => {
  if (!props.result) return undefined;
  const parts = [];
  if (props.title) parts.push(props.title);
  parts.push(statusLabels[props.result.status] || props.result.status);
  if (props.result.summary) parts.push(props.result.summary);
  return parts.join(': ');
});
</script>

<style scoped>
/* ── PersistentResultStrip ───────────────────────────────────────────────────
   Full-width of container. Left border 2px tone colour (not 4px Bootstrap bar).
   Subtle tinted background at 3–5% alpha. Radius 6px.
──────────────────────────────────────────────────────────────────────────── */
.prs-strip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  border-radius: 6px;
  border-left: 2px solid transparent;
  width: 100%;
}

/* ── Size variants ───────────────────────────────────────────────────────── */
.prs-strip--full {
  padding: 12px 16px;
  flex-wrap: wrap;
}

.prs-strip--compact {
  padding: 8px 12px;
  flex-wrap: nowrap;
}

/* ── Status tints (3–5% background alpha) ────────────────────────────────── */
.prs-strip--success {
  background: rgba(13, 148, 136, 0.04);
  border-left-color: #0D9488;
}

.prs-strip--error {
  background: rgba(220, 38, 38, 0.04);
  border-left-color: #DC2626;
}

.prs-strip--running {
  background: rgba(255, 61, 127, 0.04);
  border-left-color: var(--kdl-accent);
}

/* ── Layout regions ──────────────────────────────────────────────────────── */
.prs-strip__pill {
  flex-shrink: 0;
}

.prs-strip__body {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
}

.prs-strip__title {
  font-size: 13px;
  font-weight: 500;
  color: var(--kdl-text-primary);
  white-space: nowrap;
}

.prs-strip__summary {
  font-size: 13px;
  font-weight: 400;
  color: var(--kdl-text-secondary);
  line-height: 1.45;
}

.prs-strip__summary--muted {
  color: var(--kdl-text-muted);
}

.prs-strip__right {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.prs-strip__action {
  /* btn-ghost btn-sm — already styled */
}

/* ── Error detail row (full-width, breaks below main row) ─────────────────── */
.prs-strip__error-row {
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 5px;
  padding-top: 6px;
  margin-top: 4px;
  border-top: 1px solid rgba(220, 38, 38, 0.12);
}

.prs-strip__error-icon {
  flex-shrink: 0;
  color: #DC2626;
  margin-top: 1px;
}

.prs-strip__error-text {
  font-size: 13px;
  font-weight: 400;
  color: #DC2626;
  line-height: 1.45;
  word-break: break-word;
}

/* ── Dark mode ──────────────────────────────────────────────────────────── */
:root[data-theme="dark"] .prs-strip--success {
  background: rgba(45, 212, 191, 0.05);
  border-left-color: #2DD4BF;
}

:root[data-theme="dark"] .prs-strip--error {
  background: rgba(248, 113, 113, 0.05);
  border-left-color: #F87171;
}

:root[data-theme="dark"] .prs-strip--running {
  background: rgba(255, 79, 138, 0.05);
  border-left-color: var(--kdl-accent);
}

:root[data-theme="dark"] .prs-strip__error-row {
  border-top-color: rgba(248, 113, 113, 0.18);
}

:root[data-theme="dark"] .prs-strip__error-icon,
:root[data-theme="dark"] .prs-strip__error-text {
  color: #F87171;
}
</style>
