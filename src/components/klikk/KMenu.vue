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

<!--
  No <style scoped> here: DropdownMenuContent (.km-content) is teleported to
  <body> by DropdownMenuPortal, and so is the entire menu subtree. A scoped
  style adds a data-v-<hash> the teleported node never carries, so the rules
  would not apply. All of this component's styling — the .km-content panel
  chrome (z-index, background, border, radius, shadow + dark variant) and the
  Vue <Transition name="km-menu"> enter/leave classes incl. reduced-motion —
  therefore lives in the global src/css/portals.css. The menu items
  (.km-item, KMenuItem.vue) and separators (.km-sep, KMenuSeparator.vue) are
  likewise teleported and their styling lives there too.
-->
