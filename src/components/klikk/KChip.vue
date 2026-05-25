<!--
  KChip — Klikk Design Language removable filter pill primitive.

  Replaces: q-chip for interactive filter / tag / multi-select use cases.
  Distinct from KBadge (static labels) and StatusPill (semantic operational state).
  KChip is for user-manipulable items: active filters, selected tenants in a list,
  multi-select selected items, tag inputs.

  API:
    label      (string, required)
    removable? (boolean) — shows an × button on the right. Default false.
    icon?      (string)  — Lucide icon name. Only 'x' and common nav icons are
                           inlined; see the icon resolver below.
    disabled?  (boolean) — prevents remove interaction, dims the chip. Default false.

  Emits:
    remove — fired when the × button is clicked (not fired if disabled).

  Accessibility:
    - Remove button has aria-label="Remove [label]".
    - Disabled state uses aria-disabled + pointer-events:none (not the native
      disabled attr since the outer is a span, not a button).
-->
<template>
  <span
    class="kchip"
    :class="{ 'kchip--disabled': disabled }"
    :aria-disabled="disabled || undefined"
  >
    <!-- Optional leading icon -->
    <svg
      v-if="icon"
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="kchip__icon"
      aria-hidden="true"
    >
      <!-- tag -->
      <template v-if="icon === 'tag'">
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
        <line x1="7" y1="7" x2="7.01" y2="7" />
      </template>
      <!-- filter -->
      <template v-else-if="icon === 'filter'">
        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
      </template>
      <!-- search -->
      <template v-else-if="icon === 'search'">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </template>
      <!-- user -->
      <template v-else-if="icon === 'user'">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </template>
      <!-- building (tenant/entity icon) -->
      <template v-else-if="icon === 'building'">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <path d="M3 9h18" />
        <path d="M9 21V9" />
      </template>
      <!-- calendar -->
      <template v-else-if="icon === 'calendar'">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </template>
      <!-- check -->
      <template v-else-if="icon === 'check'">
        <polyline points="20 6 9 17 4 12" />
      </template>
      <!-- fallback: dot -->
      <template v-else>
        <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
      </template>
    </svg>

    <span class="kchip__label">{{ label }}</span>

    <!-- Remove button -->
    <button
      v-if="removable"
      type="button"
      class="kchip__remove"
      :aria-label="`Remove ${label}`"
      :disabled="disabled"
      @click.stop="!disabled && emit('remove')"
    >
      <!-- Lucide x at 12px -->
      <svg
        xmlns="http://www.w3.org/2000/svg"
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
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  </span>
</template>

<script setup>
defineProps({
  /** Display text inside the chip. */
  label: {
    type: String,
    required: true,
  },
  /**
   * When true, an × button appears on the right.
   * Clicking it emits 'remove' (unless disabled).
   */
  removable: {
    type: Boolean,
    default: false,
  },
  /**
   * Lucide icon name to show on the left.
   * Supported: 'tag' | 'filter' | 'search' | 'user' | 'building' | 'calendar' | 'check'
   * Omit for no icon.
   */
  icon: {
    type: String,
    default: null,
  },
  /**
   * When true, dims the chip and prevents the remove action.
   */
  disabled: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['remove']);
</script>

<style scoped>
/* ── KChip ───────────────────────────────────────────────────────────────────
   Fully-rounded (rounded-full ≈ 9999px) distinguishes chips from badges (4px)
   and status pills (6px). This is intentional — chips feel interactive/pill-like.
   12px font, 6/10px padding, neutral surface, subtle border.
──────────────────────────────────────────────────────────────────────────── */
.kchip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
  vertical-align: middle;
  background: var(--kdl-border-subtle);
  color: var(--kdl-text-secondary);
  border: 1px solid var(--kdl-border);
  transition: background var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2,0,0,1)),
              border-color var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2,0,0,1));
}

.kchip__icon {
  flex-shrink: 0;
  color: var(--kdl-text-muted);
}

.kchip__label {
  line-height: 1;
}

/* ── Remove button ───────────────────────────────────────────────────────── */
.kchip__remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: 0;
  margin: 0 -2px 0 2px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--kdl-text-muted);
  border-radius: 50%;
  width: 16px;
  height: 16px;
  transition: background var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2,0,0,1)),
              color var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2,0,0,1));
}

.kchip__remove:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.10);
  color: var(--kdl-text-primary);
}

.kchip__remove:focus-visible {
  outline: 2px solid var(--kdl-accent);
  outline-offset: 1px;
}

.kchip__remove:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

/* ── Disabled state ──────────────────────────────────────────────────────── */
.kchip--disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

/* ── Dark mode ───────────────────────────────────────────────────────────── */
:root[data-theme="dark"] .kchip {
  background: var(--kdl-border-subtle);
  border-color: var(--kdl-border);
  color: var(--kdl-text-secondary);
}

:root[data-theme="dark"] .kchip__remove:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.10);
  color: var(--kdl-text-primary);
}
</style>
