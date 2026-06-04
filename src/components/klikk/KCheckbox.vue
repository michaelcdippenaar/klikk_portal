<!--
  KCheckbox — Klikk Design Language checkbox primitive (finance-admin variant).

  Replaces: q-checkbox
  Uses Reka UI CheckboxRoot for full accessibility (ARIA, keyboard).

  USAGE:
    <KCheckbox v-model="agreed" label="I agree to the terms" />
    <KCheckbox v-model="active" label="Active" :disabled="true" />
    <KCheckbox v-model="notified" />
-->
<template>
  <label
    class="kcheckbox-root"
    :class="{ 'kcheckbox-root--disabled': disabled }"
  >
    <CheckboxRoot
      :id="checkId"
      class="kcheckbox-box"
      :class="{
        'kcheckbox-box--checked': modelValue,
        'kcheckbox-box--disabled': disabled,
      }"
      :model-value="modelValue"
      :disabled="disabled"
      @update:model-value="$emit('update:modelValue', $event)"
    >
      <CheckboxIndicator class="kcheckbox-indicator">
        <!-- Lucide check icon at 10px -->
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </CheckboxIndicator>
    </CheckboxRoot>

    <span v-if="label" class="kcheckbox-label">{{ label }}</span>
  </label>
</template>

<script setup>
import { CheckboxRoot, CheckboxIndicator } from 'reka-ui';

defineProps({
  /** v-model boolean binding. */
  modelValue: {
    type: Boolean,
    default: false,
  },
  /** Label rendered to the right of the checkbox. */
  label: {
    type: String,
    default: null,
  },
  /** Disable interaction. */
  disabled: {
    type: Boolean,
    default: false,
  },
});

defineEmits(['update:modelValue']);

const checkId = `kcheckbox-${Math.random().toString(36).slice(2, 8)}`;
</script>

<style scoped>
/* ─── KCheckbox ─────────────────────────────────────────────────────────── */

.kcheckbox-root {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.kcheckbox-root--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* The 16×16 box */
.kcheckbox-box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  border-radius: 4px;
  border: 1px solid var(--kdl-border);
  background: var(--kdl-card-bg);
  transition: border-color 150ms cubic-bezier(0.2, 0, 0, 1),
              background 150ms cubic-bezier(0.2, 0, 0, 1),
              box-shadow 150ms cubic-bezier(0.2, 0, 0, 1);
  /* Remove default button styling */
  padding: 0;
  cursor: inherit;
  outline: none;
}

/* Hover — darken border */
.kcheckbox-root:not(.kcheckbox-root--disabled):hover .kcheckbox-box:not(.kcheckbox-box--checked) {
  border-color: var(--kdl-text-muted);
}

/* Checked — accent fill */
.kcheckbox-box--checked {
  background: var(--kdl-accent);
  border-color: var(--kdl-accent);
}

/* Focus ring */
.kcheckbox-box:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px rgba(255, 61, 127, 0.25);
  border-color: var(--kdl-accent);
}

/* Indicator wrapper */
.kcheckbox-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}

/* Label */
.kcheckbox-label {
  font-size: 14px;
  font-weight: 400;
  line-height: 1.45;
  color: var(--kdl-text-primary);
}

/* ─── Dark mode ─────────────────────────────────────────────────────────── */
:root[data-theme="dark"] .kcheckbox-box:focus-visible {
  box-shadow: 0 0 0 2px rgba(255, 79, 138, 0.3);
}
</style>
