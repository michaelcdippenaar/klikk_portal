<!--
  KPopover — Klikk Design Language popover primitive for arbitrary content.

  Like KMenu but for non-list content: filter panels, color pickers, date pickers,
  inline forms, etc. Wraps Reka UI PopoverRoot + friends. Reka handles:
  - ARIA (aria-expanded, aria-haspopup)
  - Portal / floating-ui positioning
  - Click-outside dismiss
  - Esc to close

  API:
    modelValue  (Boolean)                      — v-model for open state
    side?       ('top'|'right'|'bottom'|'left') — preferred side (default 'bottom')
    align?      ('start'|'center'|'end')        — alignment (default 'start')

  Slots:
    trigger  — the element that toggles the popover (wrapped in PopoverTrigger)
    default  — the popover body content

  Usage:
    <KPopover v-model="filterOpen">
      <template #trigger>
        <button class="btn-ghost btn-sm">Filter</button>
      </template>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <KInput v-model="search" label="Search" />
      </div>
    </KPopover>
-->
<template>
  <PopoverRoot :open="modelValue" @update:open="$emit('update:modelValue', $event)">
    <PopoverTrigger as-child>
      <slot name="trigger" />
    </PopoverTrigger>

    <PopoverPortal>
      <Transition name="kp-popover">
        <PopoverContent
          v-if="modelValue"
          class="kp-content"
          :side="side"
          :align="align"
          :side-offset="6"
        >
          <slot />
        </PopoverContent>
      </Transition>
    </PopoverPortal>
  </PopoverRoot>
</template>

<script setup>
import {
  PopoverRoot,
  PopoverTrigger,
  PopoverPortal,
  PopoverContent,
} from 'reka-ui';

defineProps({
  /** v-model — controls open state */
  modelValue: {
    type: Boolean,
    required: true,
  },
  /** Preferred side to open the popover on. Reka flips automatically if needed. */
  side: {
    type: String,
    default: 'bottom',
    validator: (v) => ['top', 'right', 'bottom', 'left'].includes(v),
  },
  /** Horizontal alignment relative to the trigger. */
  align: {
    type: String,
    default: 'start',
    validator: (v) => ['start', 'center', 'end'].includes(v),
  },
});

defineEmits(['update:modelValue']);
</script>

<style scoped>
/* ── Popover panel ───────────────────────────────────────────────────────── */
.kp-content {
  padding: 12px;
  background: var(--kdl-card-bg);
  border: 1px solid var(--kdl-border);
  border-radius: 8px;
  box-shadow: var(--shadow-floating);
  min-width: 200px;
  max-width: 400px;
  z-index: 9990;
}

:root[data-theme="dark"] .kp-content {
  box-shadow: var(--shadow-floating), 0 0 0 1px var(--kdl-border);
}

/* ── Transition ──────────────────────────────────────────────────────────── */
.kp-popover-enter-active,
.kp-popover-leave-active {
  transition:
    opacity var(--duration-short) var(--ease-standard),
    transform var(--duration-short) var(--ease-enter);
}
.kp-popover-enter-from,
.kp-popover-leave-to {
  opacity: 0;
  transform: scale(0.96) translateY(-4px);
}

/* ── Reduced motion ──────────────────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .kp-popover-enter-active,
  .kp-popover-leave-active {
    transition-duration: 0.01ms !important;
  }
}
</style>
