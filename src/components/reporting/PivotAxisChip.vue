<!--
  PivotAxisChip — one dimension chip inside a Rows / Columns axis well of the
  PAW-style PivotExplorer. The chip shows the dimension name; its kebab menu
  moves the dimension to another axis (Rows / Columns) or to Filter. No HTML5
  drag-drop — the chip menu (KMenu, keyboard-operable via Reka) is the move
  affordance, paired with the toolbar Swap button.

  Props:
    dim    (String)  — dimension name shown on the chip
    axis   ('rows'|'cols')  — which well this chip lives in (its current axis)
    open   (Boolean) — controlled menu open state (single-open model in parent)

  Emits:
    toggle (Boolean)  — request to open/close this chip's menu
    move   (target)   — move this dimension to 'rows' | 'cols' | 'filter'
-->
<template>
  <KMenu
    :model-value="open"
    align="start"
    @update:model-value="$emit('toggle', $event)"
  >
    <template #trigger>
      <button
        type="button"
        class="pivot-chip"
        :aria-label="`${dim} — move dimension`"
      >
        <span class="pivot-chip__name" :title="dim">{{ dim }}</span>
        <svg
          class="pivot-chip__kebab"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="5" r="1" />
          <circle cx="12" cy="12" r="1" />
          <circle cx="12" cy="19" r="1" />
        </svg>
      </button>
    </template>

    <KMenuItem :disabled="axis === 'rows'" @select="$emit('move', 'rows')">
      Move to Rows
    </KMenuItem>
    <KMenuItem :disabled="axis === 'cols'" @select="$emit('move', 'cols')">
      Move to Columns
    </KMenuItem>
    <KMenuSeparator />
    <KMenuItem @select="$emit('move', 'filter')">
      Move to Filter
    </KMenuItem>
  </KMenu>
</template>

<script setup>
import KMenu from '../klikk/KMenu.vue';
import KMenuItem from '../klikk/KMenuItem.vue';
import KMenuSeparator from '../klikk/KMenuSeparator.vue';

defineProps({
  /** Dimension name shown on the chip. */
  dim: {
    type: String,
    required: true,
  },
  /** Which axis well this chip currently lives in. */
  axis: {
    type: String,
    required: true,
    validator: (v) => ['rows', 'cols'].includes(v),
  },
  /** Controlled menu open state (parent enforces a single open menu). */
  open: {
    type: Boolean,
    default: false,
  },
});

defineEmits(['toggle', 'move']);
</script>

<style scoped>
.pivot-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 6px 0 10px;
  border: 1px solid var(--kdl-border);
  border-radius: 6px;
  background: var(--kdl-card-bg);
  color: var(--kdl-text-primary);
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1)),
              background var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1));
}

.pivot-chip:hover {
  border-color: var(--kdl-text-muted);
  background: var(--kdl-hover-bg);
}

.pivot-chip__name {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pivot-chip__kebab {
  flex: 0 0 auto;
  color: var(--kdl-text-hint);
}

@media (prefers-reduced-motion: reduce) {
  .pivot-chip {
    transition: none;
  }
}
</style>
