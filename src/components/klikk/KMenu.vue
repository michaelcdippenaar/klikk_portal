<!--
  KMenu — Klikk Design Language dropdown menu primitive.

  Wraps Reka UI DropdownMenu*. Reka handles:
  - Keyboard navigation (↑↓ moves highlight, Enter activates, Esc closes)
  - ARIA (role="menu", aria-expanded, etc.)
  - Portal rendering

  API:
    modelValue  (Boolean)                      — v-model for open state
    align?      ('start'|'center'|'end')        — horizontal alignment (default 'start')
    side?       ('top'|'right'|'bottom'|'left') — preferred side (default 'bottom')

  Slots:
    trigger  — the element that opens the menu (rendered inside DropdownMenuTrigger)
    default  — menu items (use KMenuItem, KMenuSeparator)

  Usage:
    <KMenu v-model="menuOpen">
      <template #trigger>
        <button class="btn-ghost btn-sm">Options</button>
      </template>
      <KMenuItem icon="edit" @select="onEdit">Edit</KMenuItem>
      <KMenuSeparator />
      <KMenuItem icon="trash" @select="onDelete">Delete</KMenuItem>
    </KMenu>
-->
<template>
  <DropdownMenuRoot :open="modelValue" @update:open="$emit('update:modelValue', $event)">
    <DropdownMenuTrigger as-child>
      <slot name="trigger" />
    </DropdownMenuTrigger>

    <DropdownMenuPortal>
      <Transition name="km-menu">
        <DropdownMenuContent
          v-if="modelValue"
          class="km-content"
          :align="align"
          :side="side"
          :side-offset="6"
        >
          <slot />
        </DropdownMenuContent>
      </Transition>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>

<script setup>
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuContent,
} from 'reka-ui';

defineProps({
  /** v-model — controls open state */
  modelValue: {
    type: Boolean,
    required: true,
  },
  /** Horizontal alignment of the menu relative to the trigger. */
  align: {
    type: String,
    default: 'start',
    validator: (v) => ['start', 'center', 'end'].includes(v),
  },
  /** Preferred side to open the menu on. Reka flips automatically if needed. */
  side: {
    type: String,
    default: 'bottom',
    validator: (v) => ['top', 'right', 'bottom', 'left'].includes(v),
  },
});

defineEmits(['update:modelValue']);
</script>

<style scoped>
/* ── Menu content panel ──────────────────────────────────────────────────── */
.km-content {
  min-width: 200px;
  padding: 4px;
  background: var(--kdl-card-bg);
  border: 1px solid var(--kdl-border);
  border-radius: 8px;
  box-shadow: var(--shadow-floating);
  z-index: 9990;
  /* Reka positions this via its floating-ui internals */
}

:root[data-theme="dark"] .km-content {
  box-shadow: var(--shadow-floating), 0 0 0 1px var(--kdl-border);
}

/* ── Transition ──────────────────────────────────────────────────────────── */
.km-menu-enter-active,
.km-menu-leave-active {
  transition:
    opacity var(--duration-short) var(--ease-standard),
    transform var(--duration-short) var(--ease-enter);
}
.km-menu-enter-from,
.km-menu-leave-to {
  opacity: 0;
  transform: scale(0.96) translateY(-4px);
}

/* ── Reduced motion ──────────────────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .km-menu-enter-active,
  .km-menu-leave-active {
    transition-duration: 0.01ms !important;
  }
}
</style>
