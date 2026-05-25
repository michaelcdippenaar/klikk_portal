<!--
  KOperationCard — Klikk Design Language operator-card primitive (finance-admin variant).

  Answers three questions at a glance:
    1. What is its current state? (status pill — top-right of header)
    2. When did it last act? (relative timestamp with absolute tooltip)
    3. How is it doing? (one quantitative signal)

  USAGE:
    <KOperationCard
      title="Xero Journal Sync"
      description="Posts approved journals to Xero ledger"
      state="running"
      :last-run-at="new Date(Date.now() - 4 * 60 * 1000)"
      metric="142 rows · 28s"
      :primary-action="{ label: 'Run now', handler: () => syncJournals() }"
    />

    <KOperationCard
      title="Bank Reconciliation"
      state="failed"
      :last-run-at="new Date('2026-05-24T09:12:00Z')"
      metric="—"
      last-error="Xero API returned 503 — connection timeout after 30s"
      :primary-action="{ label: 'Retry', handler: () => retryRecon() }"
    >
      (optional body slot for config controls — checkbox, etc.)
    </KOperationCard>

  DOCTRINE:
    Every operator card on a finance-admin surface MUST carry state, last-occurred-at,
    and one quantitative signal. See klikk-design-language SKILL.md — Operator-card doctrine.
    Primary action is inline with the meta row (NOT a bottom-right CTA).
    If a signal is not yet wired in the backend, render '—' (em-dash) — not absent.

  API:
    title          (string, required)
    description?   (string) — muted single-line subtitle
    state          (string, required) — 'idle'|'running'|'queued'|'failed'|'succeeded'
    lastRunAt      (Date|null, required) — relative time + absolute tooltip; null → 'Never run'
    metric?        (string) — quantitative signal e.g. "412 rows · 30s". Falls back to '—'
    lastError?     (string) — error text rendered below meta row in error tone
    primaryAction  (object, required) — { label: string, handler: Function }
    secondaryActions slot — optional overflow menu trigger

  BACKEND DATA SHAPE (for Processes page retrofit):
    {
      id: string,
      title: string,
      description: string,
      state: 'idle'|'running'|'queued'|'failed'|'succeeded',
      lastRunAt: string | null,   // ISO 8601 datetime string or null
      metric: string | null,      // e.g. "142 rows · 28s" or null (renders as '—')
      lastError: string | null,   // error message or null
    }
-->
<template>
  <section class="card overflow-hidden kop-card">
    <!-- ── Header row ── -->
    <header class="kop-card__header">
      <div class="kop-card__title-group">
        <h2 class="kop-card__title">{{ title }}</h2>
        <p v-if="description" class="kop-card__description">{{ description }}</p>
      </div>

      <!-- State pill — top-right -->
      <div class="kop-card__pill" :class="`kop-card__pill--${state}`" :aria-label="`Status: ${state}`">
        <!-- idle: outlined circle (no fill) -->
        <svg
          v-if="state === 'idle'"
          xmlns="http://www.w3.org/2000/svg"
          width="12" height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
        </svg>

        <!-- running: Loader2 with spin -->
        <svg
          v-else-if="state === 'running'"
          xmlns="http://www.w3.org/2000/svg"
          width="12" height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="kop-card__pill-spin"
          aria-hidden="true"
        >
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>

        <!-- queued: Clock -->
        <svg
          v-else-if="state === 'queued'"
          xmlns="http://www.w3.org/2000/svg"
          width="12" height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>

        <!-- failed: XCircle -->
        <svg
          v-else-if="state === 'failed'"
          xmlns="http://www.w3.org/2000/svg"
          width="12" height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>

        <!-- succeeded: CheckCircle -->
        <svg
          v-else-if="state === 'succeeded'"
          xmlns="http://www.w3.org/2000/svg"
          width="12" height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>

        <span class="kop-card__pill-label">{{ STATE_LABELS[state] || state }}</span>
      </div>
    </header>

    <!-- ── Meta row: lastRunAt · metric · primaryAction ── -->
    <div class="kop-card__meta">
      <div class="kop-card__meta-signals">
        <!-- Last run timestamp -->
        <span
          class="kop-card__timestamp"
          :class="{ 'kop-card__timestamp--never': !lastRunAt }"
          :title="absoluteTime || undefined"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12" height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="kop-card__meta-icon"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          {{ relativeTime }}
        </span>

        <!-- Dot separator -->
        <span class="kop-card__meta-sep" aria-hidden="true">·</span>

        <!-- Quantitative metric — em-dash if not provided (doctrine: visible TODO) -->
        <span
          class="kop-card__metric"
          :title="!metric ? 'Metric not yet wired — backend data pipe pending' : undefined"
        >{{ resolvedMetric }}</span>
      </div>

      <!-- Primary action — inline right -->
      <div class="kop-card__primary-action">
        <slot name="primaryAction">
          <button
            v-if="primaryAction"
            class="btn-ghost btn-sm kop-card__action-btn"
            type="button"
            @click="primaryAction.handler"
          >{{ primaryAction.label }}</button>
        </slot>
      </div>

      <!-- Secondary actions overflow (slot — caller provides q-menu or dropdown) -->
      <div v-if="$slots.secondaryActions" class="kop-card__secondary-action">
        <slot name="secondaryActions" />
      </div>
    </div>

    <!-- ── Error row (optional) ── -->
    <div v-if="lastError" class="kop-card__error-row">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="12" height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="kop-card__error-icon"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
      <span class="kop-card__error-text">{{ lastError }}</span>
    </div>

    <!-- ── Body slot (optional — config forms, etc.) ── -->
    <div v-if="$slots.default" class="kop-card__body">
      <slot />
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue';
import { useRelativeTime } from '../../composables/useRelativeTime.js';

const props = defineProps({
  /** Card heading — the name of the operation. */
  title: {
    type: String,
    required: true,
  },
  /** Optional muted single-line description below the title. */
  description: {
    type: String,
    default: null,
  },
  /**
   * Current state of the operation.
   * Drives the status pill (icon + label + tinted background).
   */
  state: {
    type: String,
    required: true,
    validator: (v) => ['idle', 'running', 'queued', 'failed', 'succeeded'].includes(v),
  },
  /**
   * Date of the last run — or null if the operation has never run.
   * Renders as relative time ("4m ago") with absolute ISO+TZ tooltip on hover.
   * null renders as "Never run" in muted token.
   */
  lastRunAt: {
    type: [Date, String, null],
    required: true,
    default: null,
  },
  /**
   * One-line quantitative signal, e.g. "412 rows · 30s", "98% over 30d", "5 / 5,000 today".
   * Falls back to '—' (em-dash) if not provided.
   * The em-dash is intentional (doctrine): it is a visible TODO, not an invisible omission.
   */
  metric: {
    type: String,
    default: null,
  },
  /**
   * Single-line error message — rendered below the meta row in error tone.
   * Only shown when state is 'failed' or an error has been captured.
   */
  lastError: {
    type: String,
    default: null,
  },
  /**
   * Primary action — rendered inline-right of the meta row as a secondary button.
   * NOT a bottom-right CTA (that is forbidden on operator surfaces per doctrine).
   * Shape: { label: string, handler: Function }
   * Alternatively use the primaryAction named slot for full control.
   */
  primaryAction: {
    type: Object,
    default: null,
  },
});

// State label map — what the pill displays
const STATE_LABELS = {
  idle: 'Idle',
  running: 'Running',
  queued: 'Queued',
  failed: 'Failed',
  succeeded: 'Done',
};

// Relative time — reactive, updates every 30s via composable
const lastRunAtRef = computed(() => {
  if (!props.lastRunAt) return null;
  if (props.lastRunAt instanceof Date) return props.lastRunAt;
  const d = new Date(props.lastRunAt);
  return Number.isNaN(d.getTime()) ? null : d;
});

const { relative: relativeTime, absolute: absoluteTime } = useRelativeTime(lastRunAtRef);

// Metric — em-dash if not provided (doctrine: visible TODO)
const resolvedMetric = computed(() => props.metric || '—');
</script>

<style scoped>
/* ── KOperationCard ────────────────────────────────────────────────────────
   Wraps .card (inherits radius/border/shadow tokens from klikk.css).
   Adds: header row, meta row, optional error row, optional body slot.
   No bottom-right CTA. Action is inline with the meta row.
──────────────────────────────────────────────────────────────────────────── */

/* ── Header row ─────────────────────────────────────────────────────────── */
.kop-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 20px 12px;
  border-bottom: 1px solid var(--kdl-border-subtle);
}

.kop-card__title-group {
  flex: 1 1 0;
  min-width: 0;
}

.kop-card__title {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--kdl-text-primary);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.kop-card__description {
  font-size: 13px;
  font-weight: 400;
  line-height: 1.4;
  color: var(--kdl-text-muted);
  margin: 3px 0 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── State pill ─────────────────────────────────────────────────────────── */
.kop-card__pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.35;
  white-space: nowrap;
  flex-shrink: 0;
  /* Default: idle — no fill, muted */
  background: transparent;
  color: var(--kdl-text-muted);
  border: 1px solid var(--kdl-border);
}

/* idle — no fill, outlined */
.kop-card__pill--idle {
  background: transparent;
  color: var(--kdl-text-muted);
  border-color: var(--kdl-border);
}

/* running — accent tone */
.kop-card__pill--running {
  background: color-mix(in srgb, var(--kdl-accent) 10%, transparent);
  color: var(--kdl-accent);
  border-color: color-mix(in srgb, var(--kdl-accent) 30%, transparent);
}

/* queued — warning tone */
.kop-card__pill--queued {
  background: rgba(217, 119, 6, 0.10);
  color: #d97706;
  border-color: rgba(217, 119, 6, 0.25);
}

/* failed — error tone, 12% background */
.kop-card__pill--failed {
  background: rgba(220, 38, 38, 0.10);
  color: #dc2626;
  border-color: rgba(220, 38, 38, 0.25);
}

/* succeeded — success tone, 12% background */
.kop-card__pill--succeeded {
  background: rgba(13, 148, 136, 0.10);
  color: #0d9488;
  border-color: rgba(13, 148, 136, 0.25);
}

/* Running spinner animation */
.kop-card__pill-spin {
  animation: kop-spin 1s linear infinite;
}

@keyframes kop-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .kop-card__pill-spin {
    animation: none;
  }
}

/* ── Meta row ───────────────────────────────────────────────────────────── */
.kop-card__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 20px;
  border-bottom: 1px solid var(--kdl-border-subtle);
}

.kop-card__meta-signals {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1 1 0;
  min-width: 0;
  font-size: 13px;
  font-weight: 400;
  color: var(--kdl-text-muted);
}

.kop-card__meta-icon {
  flex-shrink: 0;
  color: var(--kdl-text-hint);
}

.kop-card__timestamp {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--kdl-text-muted);
  cursor: default;
}

.kop-card__timestamp--never {
  color: var(--kdl-text-hint);
  font-style: italic;
}

.kop-card__meta-sep {
  color: var(--kdl-text-hint);
  font-size: 13px;
  user-select: none;
}

.kop-card__metric {
  font-size: 13px;
  color: var(--kdl-text-muted);
  font-variant-numeric: tabular-nums;
  cursor: default;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Primary action — inline right of meta row */
.kop-card__primary-action {
  flex-shrink: 0;
  margin-left: auto;
}

.kop-card__action-btn {
  /* Inherits btn-ghost btn-sm — already secondary-styled */
}

.kop-card__secondary-action {
  flex-shrink: 0;
}

/* ── Error row ──────────────────────────────────────────────────────────── */
.kop-card__error-row {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 8px 20px;
  background: rgba(220, 38, 38, 0.05);
  border-bottom: 1px solid rgba(220, 38, 38, 0.12);
}

.kop-card__error-icon {
  flex-shrink: 0;
  color: #dc2626;
  margin-top: 1px;
}

.kop-card__error-text {
  font-size: 13px;
  font-weight: 400;
  line-height: 1.45;
  color: #dc2626;
  word-break: break-word;
}

/* ── Body slot ──────────────────────────────────────────────────────────── */
.kop-card__body {
  padding: 16px 20px;
}

/* ── Dark mode ──────────────────────────────────────────────────────────── */
:root[data-theme="dark"] .kop-card__pill--queued {
  background: rgba(251, 191, 36, 0.12);
  color: #fbbf24;
  border-color: rgba(251, 191, 36, 0.30);
}

:root[data-theme="dark"] .kop-card__pill--failed {
  background: rgba(248, 113, 113, 0.12);
  color: #f87171;
  border-color: rgba(248, 113, 113, 0.30);
}

:root[data-theme="dark"] .kop-card__pill--succeeded {
  background: rgba(45, 212, 191, 0.12);
  color: #2dd4bf;
  border-color: rgba(45, 212, 191, 0.30);
}

:root[data-theme="dark"] .kop-card__error-row {
  background: rgba(248, 113, 113, 0.08);
  border-color: rgba(248, 113, 113, 0.18);
}

:root[data-theme="dark"] .kop-card__error-icon,
:root[data-theme="dark"] .kop-card__error-text {
  color: #f87171;
}
</style>
