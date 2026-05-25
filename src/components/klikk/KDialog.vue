<!--
  KDialog — Klikk Design Language modal dialog primitive.

  Wraps Reka UI DialogRoot + friends. Reka handles:
  - Focus trap (Tab cycles inside, Shift-Tab reverses)
  - Esc to close
  - scroll-lock on body
  - aria-modal + role="dialog"

  API:
    modelValue   (Boolean)   — v-model open state
    title?       (String)    — auto-rendered heading
    description? (String)    — auto-rendered subtext below title
    size?        (String)    — 'sm'|'md'|'lg'|'xl' → 380/540/720/960px (default 'md')

  Slots:
    trigger   — element that opens the dialog (wrapped in DialogTrigger)
    header    — fully custom header (replaces auto title+description+close)
    default   — body content
    footer    — action row (right-aligned flex, top border)
-->
<template>
  <DialogRoot :open="modelValue" @update:open="$emit('update:modelValue', $event)">
    <!-- Trigger — only rendered if caller provides the slot -->
    <DialogTrigger v-if="$slots.trigger" as-child>
      <slot name="trigger" />
    </DialogTrigger>

    <DialogPortal>
      <!-- Overlay -->
      <Transition name="kd-overlay">
        <DialogOverlay v-if="modelValue" class="kd-overlay" @click="$emit('update:modelValue', false)" />
      </Transition>

      <!-- Content panel -->
      <Transition name="kd-content">
        <DialogContent
          v-if="modelValue"
          class="kd-content"
          :class="`kd-content--${size}`"
          @escape-key-down="$emit('update:modelValue', false)"
        >
          <!-- Header -->
          <div
            v-if="$slots.header || title || description"
            class="kd-header"
            :class="{ 'kd-header--bordered': title || description || $slots.header }"
          >
            <template v-if="$slots.header">
              <slot name="header" />
            </template>
            <template v-else>
              <div class="kd-header__meta">
                <DialogTitle v-if="title" class="kd-title">{{ title }}</DialogTitle>
                <DialogDescription v-if="description" class="kd-description">{{ description }}</DialogDescription>
              </div>
            </template>

            <!-- Close button — always in header corner -->
            <DialogClose class="kd-close" aria-label="Close dialog" @click="$emit('update:modelValue', false)">
              <!-- Lucide X 16px -->
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
            </DialogClose>
          </div>

          <!-- Body -->
          <div class="kd-body">
            <slot />
          </div>

          <!-- Footer -->
          <div v-if="$slots.footer" class="kd-footer">
            <slot name="footer" />
          </div>
        </DialogContent>
      </Transition>
    </DialogPortal>
  </DialogRoot>
</template>

<script setup>
import {
  DialogRoot,
  DialogTrigger,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from 'reka-ui';

defineProps({
  /** v-model — controls open state */
  modelValue: {
    type: Boolean,
    required: true,
  },
  /** Auto heading rendered in the dialog header. */
  title: {
    type: String,
    default: null,
  },
  /** Optional sub-text rendered below the title. */
  description: {
    type: String,
    default: null,
  },
  /**
   * Width variant:
   *   sm  — 380px  (confirmations)
   *   md  — 540px  (default — forms, confirmations with body)
   *   lg  — 720px  (detail panels)
   *   xl  — 960px  (data tables, wide forms)
   */
  size: {
    type: String,
    default: 'md',
    validator: (v) => ['sm', 'md', 'lg', 'xl'].includes(v),
  },
});

defineEmits(['update:modelValue']);
</script>

<style scoped>
/* ── Overlay ─────────────────────────────────────────────────────────────── */
.kd-overlay {
  position: fixed;
  inset: 0;
  z-index: 9998;
  background: rgba(0, 0, 0, 0.4);
}

:root[data-theme="dark"] .kd-overlay {
  background: rgba(0, 0, 0, 0.6);
}

/* ── Content panel ────────────────────────────────────────────────────────── */
.kd-content {
  position: fixed;
  top: 15vh;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  width: calc(100% - 32px);
  background: var(--kdl-card-bg);
  border-radius: 12px;
  border: 1px solid var(--kdl-border);
  box-shadow: var(--shadow-floating);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /* Reka injects [data-state], we rely on <Transition> instead */
}

:root[data-theme="dark"] .kd-content {
  box-shadow: var(--shadow-floating), 0 0 0 1px var(--kdl-border);
}

/* Size variants */
.kd-content--sm { max-width: 380px; }
.kd-content--md { max-width: 540px; }
.kd-content--lg { max-width: 720px; }
.kd-content--xl { max-width: 960px; }

/* ── Header ───────────────────────────────────────────────────────────────── */
.kd-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 20px;
  flex-shrink: 0;
}

.kd-header--bordered {
  border-bottom: 1px solid var(--kdl-border-subtle);
}

.kd-header__meta {
  flex: 1 1 0;
  min-width: 0;
}

.kd-title {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--kdl-text-primary);
  margin: 0;
}

.kd-description {
  font-size: 13px;
  line-height: 1.4;
  color: var(--kdl-text-muted);
  margin: 2px 0 0;
}

/* ── Close button ─────────────────────────────────────────────────────────── */
.kd-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border: 1px solid var(--kdl-border);
  border-radius: 6px;
  background: var(--kdl-card-bg);
  color: var(--kdl-text-muted);
  cursor: pointer;
  transition: background var(--duration-short) var(--ease-standard),
              color var(--duration-short) var(--ease-standard);
  /* Push to top-right of header */
  margin-left: auto;
  margin-top: -2px;
}

.kd-close:hover {
  background: var(--kdl-hover-bg);
  color: var(--kdl-text-primary);
}

/* ── Body ─────────────────────────────────────────────────────────────────── */
.kd-body {
  padding: 16px 20px;
  flex: 1 1 auto;
  overflow-y: auto;
}

/* ── Footer ───────────────────────────────────────────────────────────────── */
.kd-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--kdl-border-subtle);
  flex-shrink: 0;
}

/* ── Transitions ─────────────────────────────────────────────────────────── */
.kd-overlay-enter-active,
.kd-overlay-leave-active {
  transition: opacity var(--duration-medium) var(--ease-standard);
}
.kd-overlay-enter-from,
.kd-overlay-leave-to {
  opacity: 0;
}

.kd-content-enter-active,
.kd-content-leave-active {
  transition:
    opacity var(--duration-medium) var(--ease-standard),
    transform var(--duration-medium) var(--ease-enter);
}
.kd-content-enter-from,
.kd-content-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-8px) scale(0.97);
}

/* ── Reduced motion ──────────────────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .kd-overlay-enter-active,
  .kd-overlay-leave-active,
  .kd-content-enter-active,
  .kd-content-leave-active {
    transition-duration: 0.01ms !important;
  }
}

/* ── Mobile ──────────────────────────────────────────────────────────────── */
@media (max-width: 600px) {
  .kd-content {
    top: auto;
    bottom: 0;
    left: 0;
    right: 0;
    transform: none;
    max-width: 100%;
    width: 100%;
    border-radius: 12px 12px 0 0;
  }

  .kd-content-enter-from,
  .kd-content-leave-to {
    transform: translateY(16px) scale(0.99);
  }
}
</style>
