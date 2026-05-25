<!--
  KToast — single toast entry. Rendered by KToastRegion.

  Wraps Reka UI ToastRoot + ToastTitle + ToastDescription + ToastClose.
  Should not be used directly — KToastRegion manages the list.

  Visual: 360px strip, left 3px border in tone colour, low-alpha tint background,
  8px radius, 12px padding. Auto-dismisses after `duration` ms; sticky on hover.
-->
<template>
  <ToastRoot
    v-model:open="localOpen"
    class="kto-root"
    :class="`kto-root--${tone}`"
    :duration="duration"
    @update:open="onOpenChange"
  >
    <!-- Left tone accent — 3px border via a pseudo-element or an absolute div -->
    <div class="kto-accent" aria-hidden="true" />

    <!-- Icon -->
    <span class="kto-icon" aria-hidden="true" v-html="toneIcon" />

    <!-- Text -->
    <div class="kto-body">
      <ToastTitle v-if="title" class="kto-title">{{ title }}</ToastTitle>
      <ToastDescription class="kto-description" :class="{ 'kto-description--solo': !title }">
        {{ message }}
      </ToastDescription>
    </div>

    <!-- Close button -->
    <ToastClose class="kto-close" aria-label="Dismiss">
      <!-- Lucide X 14px -->
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
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
    </ToastClose>
  </ToastRoot>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import {
  ToastRoot,
  ToastTitle,
  ToastDescription,
  ToastClose,
} from 'reka-ui';

const props = defineProps({
  /** Semantic tone — controls colour scheme and icon. */
  tone: {
    type: String,
    required: true,
    validator: (v) => ['success', 'error', 'info', 'warning'].includes(v),
  },
  /** Main message body. */
  message: {
    type: String,
    required: true,
  },
  /** Optional bold title above the message. */
  title: {
    type: String,
    default: null,
  },
  /** Auto-dismiss delay in ms. 0 = sticky. Passed to Reka ToastRoot duration. */
  duration: {
    type: Number,
    default: 4000,
  },
  /** Reka open state controlled by parent (KToastRegion). */
  open: {
    type: Boolean,
    default: true,
  },
});

const emit = defineEmits(['update:open', 'closed']);

// Mirror parent open prop so Reka can animate
const localOpen = ref(props.open);
watch(() => props.open, (v) => { localOpen.value = v; });

function onOpenChange(v) {
  localOpen.value = v;
  emit('update:open', v);
  if (!v) emit('closed');
}

/* ── Inline Lucide tone icons ─────────────────────────────────────────────── */
const SVG = (inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const TONE_ICONS = {
  success: SVG('<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'),
  error:   SVG('<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'),
  info:    SVG('<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>'),
  warning: SVG('<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
};

const toneIcon = computed(() => TONE_ICONS[props.tone] ?? '');
</script>

<style scoped>
/* ── Toast root ──────────────────────────────────────────────────────────── */
.kto-root {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 360px;
  max-width: calc(100vw - 32px);
  padding: 12px 12px 12px 16px;
  border-radius: 8px;
  border: 1px solid var(--kdl-border);
  overflow: hidden;
  box-shadow: var(--shadow-lifted);
  background: var(--kdl-card-bg);
  transition: box-shadow var(--duration-short) var(--ease-standard);
}

.kto-root:hover {
  box-shadow: var(--shadow-floating);
}

/* Reka sets data-state="open"/"closed" for animation */
.kto-root[data-state="open"] {
  animation: kto-slide-in var(--duration-medium) var(--ease-enter);
}
.kto-root[data-state="closed"] {
  animation: kto-slide-out var(--duration-medium) var(--ease-standard) forwards;
}

/* ── Left accent bar (tone colour) ───────────────────────────────────────── */
.kto-accent {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  border-radius: 8px 0 0 8px;
}

/* ── Tone colour schemes ─────────────────────────────────────────────────── */
/* success */
.kto-root--success { background: rgba(13, 148, 136, 0.06); }
.kto-root--success .kto-accent { background: #0D9488; }
.kto-root--success .kto-icon { color: #0D9488; }

/* error */
.kto-root--error { background: rgba(220, 38, 38, 0.06); }
.kto-root--error .kto-accent { background: #DC2626; }
.kto-root--error .kto-icon { color: #DC2626; }

/* info */
.kto-root--info { background: rgba(37, 99, 235, 0.06); }
.kto-root--info .kto-accent { background: #2563EB; }
.kto-root--info .kto-icon { color: #2563EB; }

/* warning */
.kto-root--warning { background: rgba(217, 119, 6, 0.06); }
.kto-root--warning .kto-accent { background: #D97706; }
.kto-root--warning .kto-icon { color: #D97706; }

/* ── Dark mode tone overrides ────────────────────────────────────────────── */
:root[data-theme="dark"] .kto-root--success { background: rgba(45, 212, 191, 0.08); }
:root[data-theme="dark"] .kto-root--success .kto-accent { background: #2DD4BF; }
:root[data-theme="dark"] .kto-root--success .kto-icon { color: #2DD4BF; }

:root[data-theme="dark"] .kto-root--error { background: rgba(248, 113, 113, 0.08); }
:root[data-theme="dark"] .kto-root--error .kto-accent { background: #F87171; }
:root[data-theme="dark"] .kto-root--error .kto-icon { color: #F87171; }

:root[data-theme="dark"] .kto-root--info { background: rgba(96, 165, 250, 0.08); }
:root[data-theme="dark"] .kto-root--info .kto-accent { background: #60A5FA; }
:root[data-theme="dark"] .kto-root--info .kto-icon { color: #60A5FA; }

:root[data-theme="dark"] .kto-root--warning { background: rgba(251, 191, 36, 0.08); }
:root[data-theme="dark"] .kto-root--warning .kto-accent { background: #FBBF24; }
:root[data-theme="dark"] .kto-root--warning .kto-icon { color: #FBBF24; }

/* ── Icon ────────────────────────────────────────────────────────────────── */
.kto-icon {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

/* ── Body ─────────────────────────────────────────────────────────────────── */
.kto-body {
  flex: 1 1 0;
  min-width: 0;
}

.kto-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--kdl-text-primary);
  line-height: 1.3;
  margin-bottom: 1px;
}

.kto-description {
  font-size: 13px;
  color: var(--kdl-text-secondary);
  line-height: 1.4;
}

.kto-description--solo {
  /* When there's no title, match the visual weight of a title */
  color: var(--kdl-text-primary);
  font-weight: 500;
}

/* ── Close button ─────────────────────────────────────────────────────────── */
.kto-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--kdl-text-hint);
  cursor: pointer;
  transition: background var(--duration-short) var(--ease-standard),
              color var(--duration-short) var(--ease-standard);
}

.kto-close:hover {
  background: var(--kdl-hover-bg);
  color: var(--kdl-text-primary);
}

/* ── Slide animations ────────────────────────────────────────────────────── */
@keyframes kto-slide-in {
  from {
    opacity: 0;
    transform: translateX(100%);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes kto-slide-out {
  from {
    opacity: 1;
    transform: translateX(0);
  }
  to {
    opacity: 0;
    transform: translateX(100%);
  }
}

/* ── Reduced motion ──────────────────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .kto-root[data-state="open"],
  .kto-root[data-state="closed"] {
    animation-duration: 0.01ms !important;
  }
}
</style>
