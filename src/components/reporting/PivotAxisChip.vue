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

  The chip also carries a trailing, ALWAYS-VISIBLE inline alias picker — the
  first-class "display attribute" control (PAW shows it right on the dimension) —
  shown whenever the dim has ≥1 alias. It reads "· <active label> ▾" and opens a
  compact menu of principal + every alias. The kebab move-menu is now movement-
  only (alias selection moved out to the inline control). Both alias paths funnel
  through the parent's setDimAlias (display-only — the pivot query is untouched).

  Props:
    dim         (String)  — dimension name shown on the chip
    axis        ('rows'|'cols')  — which well this chip lives in (current axis)
    open        (Boolean) — controlled move-menu open state (single-open in parent)
    aliasOpen   (Boolean) — controlled INLINE alias-menu open state (single-open)
    dragging    (Boolean) — true while THIS chip is the drag source (dim-down)
    aliases     (String[])— available display aliases for this dim (display-only)
    activeAlias (String)  — the active display alias ('' = principal names)

  Emits:
    toggle       (Boolean)  — request to open/close this chip's MOVE menu
    toggle-alias (Boolean)  — request to open/close the INLINE alias menu
    move         (target)   — move this dimension to 'rows' | 'cols' | 'filter'
    edit         ()         — open the Set (Subset) Editor for this dimension
    alias        (String)   — choose a display label ('' = principal names)
    dragstart    (DragEvent) — grip drag started (parent records the dragged dim)
    dragend      (DragEvent) — grip drag ended (parent clears drag state)
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
          :class="{ 'pivot-chip--has-alias': aliases.length }"
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

    <!-- INLINE ALIAS PICKER — the first-class, always-visible "display attribute"
         control (PAW shows it right on the dimension). Trailing segment of the
         chip group, shown whenever the dim has ≥1 alias; reads "· <active label> ▾"
         and opens a compact menu of principal + every alias (the active one
         checked). Display-only — selecting one relabels the grid live via the
         parent's setDimAlias; the pivot query is never aliased. -->
    <KMenu
      v-if="aliases.length"
      :model-value="aliasOpen"
      align="start"
      @update:model-value="$emit('toggle-alias', $event)"
    >
      <template #trigger>
        <button
          type="button"
          class="pivot-chip__alias"
          draggable="false"
          :aria-label="`Display label for ${dim}: ${aliasLabel} — change`"
          :title="`Display ${dim} elements under: ${aliasLabel}`"
        >
          <span class="pivot-chip__alias-sep" aria-hidden="true">·</span>
          <span class="pivot-chip__alias-name">{{ aliasLabel }}</span>
          <svg
            class="pivot-chip__alias-chevron"
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </template>

      <KMenuItem
        :icon="!activeAlias ? 'check' : null"
        @select="$emit('alias', '')"
      >
        principal name
      </KMenuItem>
      <KMenuItem
        v-for="a in aliases"
        :key="`chip-alias-${dim}-${a}`"
        :icon="activeAlias === a ? 'check' : null"
        @select="$emit('alias', a)"
      >
        {{ a }}
      </KMenuItem>
    </KMenu>
  </span>
</template>

<script setup>
import { computed } from 'vue';
import KMenu from '../klikk/KMenu.vue';
import KMenuItem from '../klikk/KMenuItem.vue';
import KMenuSeparator from '../klikk/KMenuSeparator.vue';

const props = defineProps({
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
  /** Controlled MOVE-menu open state (parent enforces a single open menu). */
  open: {
    type: Boolean,
    default: false,
  },
  /** Controlled INLINE alias-menu open state (parent enforces single-open). */
  aliasOpen: {
    type: Boolean,
    default: false,
  },
  /** True while this chip is the active drag source (drives the dim-down cue). */
  dragging: {
    type: Boolean,
    default: false,
  },
  /** Available display aliases for this dimension (display-only labels). */
  aliases: {
    type: Array,
    default: () => [],
  },
  /** The active display alias ('' = principal member names). */
  activeAlias: {
    type: String,
    default: '',
  },
});

defineEmits(['toggle', 'toggle-alias', 'move', 'edit', 'alias', 'dragstart', 'dragend']);

// The short label on the inline "· <label> ▾" control: the active alias NAME
// when one is set, else "principal" — so the user sees WHICH display attribute
// the dim's elements are labelled under without opening the menu.
const aliasLabel = computed(() => props.activeAlias || 'principal');
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

/* When the inline alias control follows, the chip button is no longer the
   trailing segment — the alias button rounds the trailing edge instead, so the
   chip goes flat-sided on the right and the two read as one continuous chip. */
.pivot-chip--has-alias {
  border-radius: 0;
  border-right-width: 0;
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

/* The INLINE ALIAS picker trigger — the trailing segment of the chip group when
   the dim has aliases. Subordinate to the dimension name: muted text, a leading
   "·" hairline divider glyph, the active label, and a small chevron. Rounds the
   trailing edge so it closes the grouped chip. */
.pivot-chip__alias {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 7px;
  border: 1px solid var(--kdl-border);
  border-radius: 0 6px 6px 0;
  background: var(--kdl-card-bg);
  color: var(--kdl-text-hint);
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1)),
              background var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1)),
              color var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1));
}

.pivot-chip__alias:hover {
  border-color: var(--kdl-text-muted);
  background: var(--kdl-hover-bg);
  color: var(--kdl-text-secondary);
}

.pivot-chip__alias-sep {
  color: var(--kdl-border);
  font-weight: 700;
}

.pivot-chip__alias-name {
  color: var(--kdl-text-secondary);
  font-weight: 600;
  max-width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pivot-chip__alias-chevron {
  flex: 0 0 auto;
  color: var(--kdl-text-hint);
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
  .pivot-chip__alias,
  .pivot-grip {
    transition: none;
  }
}
</style>
