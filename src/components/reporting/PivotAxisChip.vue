<!--
  PivotAxisChip — one dimension chip inside a Rows / Columns axis well of the
  PAW-style PivotExplorer. The chip shows the dimension name; its kebab menu
  moves the dimension to another axis (Rows / Columns) or to Filter.

  The chip carries a leading GRIP HANDLE as its HTML5 drag surface: only the
  grip is draggable (the menu button sets draggable=false), so a quick mouse-
  drag that starts on the chip is never swallowed as a menu-open click. Drag is
  mouse-only, so the kebab menu (KMenu, keyboard-operable via Reka) remains the
  accessible move affordance, paired with the toolbar Swap button. Both paths
  funnel through the parent's moveDimension.

  Props:
    dim      (String)  — dimension name shown on the chip
    axis     ('rows'|'cols')  — which well this chip lives in (its current axis)
    open     (Boolean) — controlled menu open state (single-open model in parent)
    dragging (Boolean) — true while THIS chip is the drag source (dim-down state)

  Emits:
    toggle    (Boolean)  — request to open/close this chip's menu
    move      (target)   — move this dimension to 'rows' | 'cols' | 'filter'
    edit      ()         — open the Set (Subset) Editor for this dimension
    dragstart (DragEvent) — grip drag started (parent records the dragged dim)
    dragend   (DragEvent) — grip drag ended (parent clears drag state)
-->
<template>
  <span
    class="pivot-chip-group pivot-token"
    :class="{ 'pivot-token--dragging': dragging }"
  >
    <!-- GRIP HANDLE — the sole drag-initiation surface of the chip. A bare
         6-dot glyph (not a button) so a quick mouse-drag is unambiguous; the
         menu button stays a click. -->
    <span
      class="pivot-grip"
      draggable="true"
      role="button"
      :aria-label="`Drag ${dim} to rows, columns or filter`"
      :title="`Drag ${dim} to rows, columns or filter`"
      @dragstart="$emit('dragstart', $event)"
      @dragend="$emit('dragend', $event)"
    >
      <svg
        class="pivot-grip__icon"
        width="10"
        height="16"
        viewBox="0 0 10 16"
        fill="currentColor"
        aria-hidden="true"
      >
        <circle cx="3" cy="3" r="1.25" />
        <circle cx="7" cy="3" r="1.25" />
        <circle cx="3" cy="8" r="1.25" />
        <circle cx="7" cy="8" r="1.25" />
        <circle cx="3" cy="13" r="1.25" />
        <circle cx="7" cy="13" r="1.25" />
      </svg>
    </span>

    <KMenu
      :model-value="open"
      align="start"
      @update:model-value="$emit('toggle', $event)"
    >
      <template #trigger>
        <button
          type="button"
          class="pivot-chip"
          draggable="false"
          :title="`${dim} — grab the handle to drag, or open the move menu`"
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

      <KMenuItem icon="edit" @select="$emit('edit')">
        Edit set…
      </KMenuItem>
      <KMenuSeparator />
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
  </span>
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
  /** True while this chip is the active drag source (drives the dim-down cue). */
  dragging: {
    type: Boolean,
    default: false,
  },
});

defineEmits(['toggle', 'move', 'edit', 'dragstart', 'dragend']);
</script>

<style scoped>
/* The chip is a grouped token: a leading GRIP HANDLE (the drag surface) + the
   kebab menu button (a click). They share a hairline and read as one chip. */
.pivot-chip-group {
  display: inline-flex;
  align-items: stretch;
}

/* The GRIP HANDLE — the sole drag-initiation surface. A bare 6-dot glyph (not a
   button) so a quick mouse-drag is unambiguous. Leading segment of the chip, so
   it rounds the leading edge. Subtle at rest (hint), strengthens to accent on
   hover. ~16px wide gives an easy hit area. */
.pivot-grip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 16px;
  height: 26px;
  border: 1px solid var(--kdl-border);
  border-right-width: 0;
  border-radius: 6px 0 0 6px;
  background: var(--kdl-card-bg);
  color: var(--kdl-text-hint);
  cursor: grab;
  transition: color var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1)),
              background var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1)),
              border-color var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1));
}

.pivot-grip:hover {
  color: var(--kdl-accent);
  background: var(--kdl-hover-bg);
  border-color: var(--kdl-text-muted);
}

.pivot-grip:active {
  cursor: grabbing;
}

.pivot-grip:focus-visible {
  outline: 2px solid var(--kdl-accent);
  outline-offset: 1px;
}

.pivot-grip__icon {
  display: block;
}

.pivot-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 6px 0 8px;
  border: 1px solid var(--kdl-border);
  /* Trailing segment of the grouped chip — the grip rounds the leading edge, so
     the button rounds only the trailing edge; the two read as one chip. */
  border-radius: 0 6px 6px 0;
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

/* The source chip recedes while in flight (matches the context-pill token). The
   drag itself is owned solely by the grip above. */
.pivot-token--dragging {
  opacity: 0.45;
}

@media (prefers-reduced-motion: reduce) {
  .pivot-chip,
  .pivot-grip {
    transition: none;
  }
}
</style>
