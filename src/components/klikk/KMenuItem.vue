<!--
  KMenuItem — single item inside a KMenu.

  Wraps Reka DropdownMenuItem. Handles hover tint, accent text on hover,
  disabled state, optional leading Lucide icon, optional shortcut text.

  API:
    disabled?  (Boolean)  — greyed out, non-interactive
    icon?      (String)   — one of the supported Lucide SVG keys (see ICONS map)
    shortcut?  (String)   — keyboard shortcut label displayed right-aligned (e.g. '⌘K')

  Slots: default — label text
  Emits: select — when the item is activated (click or Enter)
-->
<template>
  <DropdownMenuItem
    class="km-item"
    :disabled="disabled"
    @select="$emit('select', $event)"
  >
    <!-- Leading icon -->
    <span v-if="icon && ICONS[icon]" class="km-item__icon" aria-hidden="true" v-html="ICONS[icon]" />

    <!-- Label -->
    <span class="km-item__label">
      <slot />
    </span>

    <!-- Shortcut -->
    <span v-if="shortcut" class="km-item__shortcut" aria-hidden="true">{{ shortcut }}</span>
  </DropdownMenuItem>
</template>

<script setup>
import { DropdownMenuItem } from 'reka-ui';

defineProps({
  /** When true the item is non-interactive and rendered with reduced opacity. */
  disabled: {
    type: Boolean,
    default: false,
  },
  /**
   * Lucide icon key. Supported values match those listed in the ICONS map below.
   * Add more as needed — inline SVG only, no external imports.
   */
  icon: {
    type: String,
    default: null,
  },
  /** Shortcut label shown right-aligned in muted text (decorative only). */
  shortcut: {
    type: String,
    default: null,
  },
});

defineEmits(['select']);

/* ── Inline Lucide SVG map ─────────────────────────────────────────────────
   Each value is the complete inner SVG markup (paths, circles, etc.).
   The outer <svg> wrapper is generated in the template via v-html.
   Add new icons here as the app needs them.
──────────────────────────────────────────────────────────────────────────── */
const SVG_WRAP = (inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const ICONS = {
  edit:        SVG_WRAP('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>'),
  trash:       SVG_WRAP('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>'),
  copy:        SVG_WRAP('<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
  download:    SVG_WRAP('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'),
  upload:      SVG_WRAP('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>'),
  'external-link': SVG_WRAP('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>'),
  eye:         SVG_WRAP('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'),
  'eye-off':   SVG_WRAP('<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'),
  settings:    SVG_WRAP('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
  refresh:     SVG_WRAP('<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>'),
  'log-out':   SVG_WRAP('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>'),
  check:       SVG_WRAP('<polyline points="20 6 9 17 4 12"/>'),
  filter:      SVG_WRAP('<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>'),
  'more-horizontal': SVG_WRAP('<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>'),
};
</script>

<style scoped>
/* ── Menu item ───────────────────────────────────────────────────────────── */
.km-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 0 10px;
  height: 34px;
  border: none;
  border-radius: 6px;
  background: transparent;
  font-family: inherit;
  font-size: 14px;
  font-weight: 400;
  color: var(--kdl-text-secondary);
  text-align: left;
  cursor: pointer;
  user-select: none;
  transition: background var(--duration-short) var(--ease-standard),
              color var(--duration-short) var(--ease-standard);
  /* Reka sets [data-highlighted] on keyboard/mouse focus */
}

.km-item[data-highlighted] {
  background: color-mix(in srgb, var(--kdl-accent) 10%, transparent);
  color: var(--kdl-accent);
  outline: none;
}

.km-item[data-disabled] {
  opacity: 0.45;
  cursor: not-allowed;
  pointer-events: none;
}

/* ── Icon slot ───────────────────────────────────────────────────────────── */
.km-item__icon {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  color: inherit;
  opacity: 0.75;
}

/* ── Label ───────────────────────────────────────────────────────────────── */
.km-item__label {
  flex: 1 1 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Shortcut ─────────────────────────────────────────────────────────────── */
.km-item__shortcut {
  flex-shrink: 0;
  margin-left: auto;
  font-size: 12px;
  color: var(--kdl-text-hint);
  font-variant-numeric: tabular-nums;
}
</style>
