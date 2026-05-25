<!--
  KAlert — Klikk Design Language inline alert primitive (finance-admin variant).

  Replaces: q-banner with bg-positive / bg-negative / bg-light-blue-1 Quasar variants.
  Reason: Quasar banner colours are raw Material semantic colours, not KDL tokens.
  KAlert uses a 1px left semantic border + 8% tinted background — not a 4px left
  border (Bootstrap 4 tell) and not a full solid background fill.

  USAGE:
    KAlert variant="info" title="Sync scheduled" body="Next run at 02:00 SAST."
    KAlert variant="success" body="All 142 journals posted successfully." dismissible
    KAlert variant="warning" title="API rate limit" body="Xero returned 429. Retrying in 30 s."
    KAlert variant="error" title="Connection failed" body="Check credentials in Setup." dismissible

    With default slot instead of body prop:
    KAlert variant="info"
      Reconciliation complete — 3 items require review.
    /KAlert
-->
<template>
  <div
    v-if="visible"
    class="kalert"
    :class="`kalert--${variant}`"
    role="alert"
    aria-live="polite"
  >
    <!-- Left semantic border line (1px wide, full height, coloured) -->
    <div class="kalert__accent-bar" aria-hidden="true" />

    <!-- Icon -->
    <span class="kalert__icon" aria-hidden="true">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        :width="iconSize"
        :height="iconSize"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <!-- info -->
        <template v-if="resolvedIcon === 'info'">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </template>
        <!-- check-circle (success) -->
        <template v-else-if="resolvedIcon === 'check-circle'">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </template>
        <!-- alert-triangle (warning) -->
        <template v-else-if="resolvedIcon === 'alert-triangle'">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </template>
        <!-- x-circle (error) -->
        <template v-else>
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </template>
      </svg>
    </span>

    <!-- Content -->
    <div class="kalert__content">
      <p v-if="title" class="kalert__title">{{ title }}</p>
      <p v-if="body && !$slots.default" class="kalert__body">{{ body }}</p>
      <div v-if="$slots.default" class="kalert__body">
        <slot />
      </div>
    </div>

    <!-- Dismiss button -->
    <button
      v-if="dismissible"
      class="kalert__dismiss"
      type="button"
      aria-label="Dismiss alert"
      @click="visible = false"
    >
      <!-- x icon at 16px -->
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
      >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  /**
   * Semantic variant — drives icon selection and colour tokens.
   * 'info' | 'success' | 'warning' | 'error'
   */
  variant: {
    type: String,
    default: 'info',
    validator: (v) => ['info', 'success', 'warning', 'error'].includes(v),
  },
  /** Optional bold title above the body text. */
  title: {
    type: String,
    default: null,
  },
  /** Alert body text. Alternatively use the default slot for rich content. */
  body: {
    type: String,
    default: null,
  },
  /**
   * Whether a dismiss (X) button is shown. When dismissed, the component
   * hides itself. Parent can also v-if the component for full control.
   */
  dismissible: {
    type: Boolean,
    default: false,
  },
  /**
   * Override the auto-derived Lucide icon name.
   * Auto-derivation: info → 'info', success → 'check-circle',
   * warning → 'alert-triangle', error → 'x-circle'
   */
  icon: {
    type: String,
    default: null,
  },
});

const visible = ref(true);

const ICON_MAP = {
  info: 'info',
  success: 'check-circle',
  warning: 'alert-triangle',
  error: 'x-circle',
};

const resolvedIcon = computed(() => props.icon || ICON_MAP[props.variant] || 'info');

const iconSize = 14;
</script>

<style scoped>
/* ─── KAlert — finance-admin primitive ─────────────────────────────────────
   Colour strategy: each variant has a --kalert-color custom property set on
   the element, plus an 8% tinted background computed from that colour.
   The 1px left bar uses the same colour at full opacity.

   Semantic colours reference KDL palette:
     info:    info-600    #2563eb  (dark: info-500 #3b82f6 — lifted for contrast)
     success: success-600 #0d9488  (dark: success-400 #2dd4bf)
     warning: warning-600 #d97706  (dark: warning-500 #f59e0b)
     error:   danger-600  #dc2626  (dark: danger-400 #f87171)
───────────────────────────────────────────────────────────────────────── */

.kalert {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 8px;
  border: 1px solid transparent;
  overflow: hidden;
}

/* The 1px accent bar on the left — rendered as an absolutely-positioned element
   so it is always full height regardless of content. */
.kalert__accent-bar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 1px;
  border-radius: 8px 0 0 8px;
  background: var(--kalert-color);
}

/* Variant colour tokens */
.kalert--info {
  --kalert-color: #2563eb;
  background: rgba(37, 99, 235, 0.08);
  border-color: rgba(37, 99, 235, 0.2);
}

.kalert--success {
  --kalert-color: #0d9488;
  background: rgba(13, 148, 136, 0.08);
  border-color: rgba(13, 148, 136, 0.2);
}

.kalert--warning {
  --kalert-color: #d97706;
  background: rgba(217, 119, 6, 0.08);
  border-color: rgba(217, 119, 6, 0.2);
}

.kalert--error {
  --kalert-color: #dc2626;
  background: rgba(220, 38, 38, 0.08);
  border-color: rgba(220, 38, 38, 0.2);
}

/* Icon */
.kalert__icon {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  color: var(--kalert-color);
  margin-top: 1px; /* optical alignment with first line of text */
}

/* Content */
.kalert__content {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.kalert__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.45;
  color: var(--kdl-text-primary);
}

.kalert__body {
  margin: 0;
  font-size: 13px;
  font-weight: 400;
  line-height: 1.45;
  color: var(--kdl-text-secondary, var(--kdl-text-muted));
}

/* Dismiss button */
.kalert__dismiss {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: 2px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  color: var(--kdl-text-muted);
  transition: background 150ms cubic-bezier(0.2, 0, 0, 1),
              color 150ms cubic-bezier(0.2, 0, 0, 1);
  margin-top: -2px;
}

.kalert__dismiss:hover {
  background: rgba(0, 0, 0, 0.06);
  color: var(--kdl-text-primary);
}

.kalert__dismiss:focus-visible {
  outline: 2px solid var(--kdl-accent);
  outline-offset: 2px;
}

/* ─── Dark mode ─────────────────────────────────────────────────────────── */
/* Colours lift to the 400/500 series for AA contrast on dark surfaces. */

:root[data-theme="dark"] .kalert--info {
  --kalert-color: #3b82f6;
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.25);
}

:root[data-theme="dark"] .kalert--success {
  --kalert-color: #2dd4bf;
  background: rgba(45, 212, 191, 0.1);
  border-color: rgba(45, 212, 191, 0.25);
}

:root[data-theme="dark"] .kalert--warning {
  --kalert-color: #f59e0b;
  background: rgba(245, 158, 11, 0.1);
  border-color: rgba(245, 158, 11, 0.25);
}

:root[data-theme="dark"] .kalert--error {
  --kalert-color: #f87171;
  background: rgba(248, 113, 113, 0.1);
  border-color: rgba(248, 113, 113, 0.25);
}

:root[data-theme="dark"] .kalert__dismiss:hover {
  background: rgba(255, 255, 255, 0.08);
}
</style>
