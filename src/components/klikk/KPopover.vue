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

<!--
  No <style scoped> here: PopoverContent (.kp-content) is teleported to <body>
  by PopoverPortal, so a scoped style's data-v-<hash> would never match it.
  The .kp-content panel chrome (z-index, padding, background, border, radius,
  shadow + dark variant) and the Vue <Transition name="kp-popover"> enter/leave
  classes incl. reduced-motion live in the global src/css/portals.css. Content
  inside the popover is the consumer's own slot markup, styled by the consumer.
-->
