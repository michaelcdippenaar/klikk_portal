<!--
  KToggle — Klikk Design Language toggle/switch primitive (finance-admin variant).

  Replaces: q-toggle
  Uses Reka UI SwitchRoot for full accessibility.

  USAGE:
    <KToggle v-model="enabled" label="Enable notifications" />
    <KToggle v-model="active" label="Active" :disabled="true" />
    <KToggle v-model="darkMode" />
-->
<template>
  <label
    class="ktoggle-root"
    :class="{ 'ktoggle-root--disabled': disabled }"
  >
    <!-- Label left of switch (if provided) -->
    <span v-if="label" class="ktoggle-label">{{ label }}</span>

    <SwitchRoot
      class="ktoggle-track"
      :class="{
        'ktoggle-track--on': modelValue,
        'ktoggle-track--disabled': disabled,
      }"
      :checked="modelValue"
      :disabled="disabled"
      @update:checked="$emit('update:modelValue', $event)"
    >
      <SwitchThumb class="ktoggle-thumb" />
    </SwitchRoot>
  </label>
</template>

<script setup>
import { SwitchRoot, SwitchThumb } from 'reka-ui';

defineProps({
  /** v-model boolean. */
  modelValue: {
    type: Boolean,
    default: false,
  },
  /** Optional label to the left of the toggle. */
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
</script>

<style scoped>
/* ─── KToggle ─────────────────────────────────────────────────────────── */

.ktoggle-root {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
}

.ktoggle-root--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ktoggle-label {
  font-size: 14px;
  font-weight: 400;
  color: var(--kdl-text-primary);
  line-height: 1.45;
}

/* Track — 36×20px */
.ktoggle-track {
  display: flex;
  align-items: center;
  width: 36px;
  height: 20px;
  flex-shrink: 0;
  border-radius: 10px;
  border: none;
  background: var(--kdl-border);
  padding: 0 2px;
  cursor: inherit;
  outline: none;
  transition: background 200ms cubic-bezier(0.2, 0, 0, 1),
              box-shadow 150ms cubic-bezier(0.2, 0, 0, 1);
}

.ktoggle-track:focus-visible {
  box-shadow: 0 0 0 2px rgba(255, 61, 127, 0.25);
}

/* On = accent bg */
.ktoggle-track--on {
  background: var(--kdl-accent);
}

.ktoggle-track--disabled {
  cursor: not-allowed;
}

/* Thumb — 16px circle */
.ktoggle-thumb {
  display: block;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
  transition: transform 200ms cubic-bezier(0.2, 0, 0, 1);
  /* Reka sets data-state="checked" on the thumb when on */
  transform: translateX(0);
}

/* Reka applies data-state="checked" to the SwitchRoot; the thumb gets shifted via CSS */
:global(.ktoggle-track[data-state="checked"]) .ktoggle-thumb {
  transform: translateX(16px);
}

/* ─── Dark mode ─────────────────────────────────────────────────────────── */
:root[data-theme="dark"] .ktoggle-track:focus-visible {
  box-shadow: 0 0 0 2px rgba(255, 79, 138, 0.3);
}

:root[data-theme="dark"] .ktoggle-thumb {
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}
</style>
