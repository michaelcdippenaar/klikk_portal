<!--
  KRadioGroup — Klikk Design Language radio-group primitive (finance-admin variant).

  Replaces: q-option-group type="radio"
  Uses Reka UI RadioGroupRoot for full keyboard navigation and ARIA.

  USAGE:
    <KRadioGroup
      v-model="period"
      name="period"
      :options="[
        { value: 'monthly', label: 'Monthly' },
        { value: 'quarterly', label: 'Quarterly' },
        { value: 'annual', label: 'Annual' },
      ]"
    />
    <KRadioGroup v-model="type" name="type" :options="typeOptions" orientation="horizontal" />
-->
<template>
  <RadioGroupRoot
    class="kradio-group"
    :class="`kradio-group--${orientation}`"
    :model-value="modelValue != null ? String(modelValue) : undefined"
    :name="name"
    :disabled="disabled"
    :orientation="orientation"
    :aria-label="ariaLabel"
    @update:model-value="onUpdate"
  >
    <label
      v-for="opt in normalizedOptions"
      :key="opt.value"
      class="kradio-item"
      :class="{ 'kradio-item--disabled': opt.disabled || disabled }"
    >
      <RadioGroupItem
        class="kradio-button"
        :class="{ 'kradio-button--checked': String(opt.value) === String(modelValue) }"
        :value="String(opt.value)"
        :disabled="opt.disabled || disabled"
      >
        <RadioGroupIndicator class="kradio-indicator" />
      </RadioGroupItem>
      <span class="kradio-label">{{ opt.label }}</span>
    </label>
  </RadioGroupRoot>
</template>

<script setup>
import { computed } from 'vue';
import { RadioGroupRoot, RadioGroupItem, RadioGroupIndicator } from 'reka-ui';

const props = defineProps({
  /** Currently selected value (v-model). */
  modelValue: {
    type: [String, Number, null],
    default: null,
  },
  /**
   * Options array.
   * Each entry: { value: string|number, label: string, disabled?: boolean }
   */
  options: {
    type: Array,
    required: true,
  },
  /** HTML name attribute for the radio group. */
  name: {
    type: String,
    required: true,
  },
  /** 'vertical' (default) or 'horizontal'. */
  orientation: {
    type: String,
    default: 'vertical',
    validator: (v) => ['vertical', 'horizontal'].includes(v),
  },
  /** Disable all radios. */
  disabled: {
    type: Boolean,
    default: false,
  },
  /** Accessible label for the group. */
  ariaLabel: {
    type: String,
    default: null,
  },
});

const emit = defineEmits(['update:modelValue']);

const normalizedOptions = computed(() =>
  props.options.map((opt) => ({
    value: opt.value,
    label: opt.label ?? String(opt.value),
    disabled: !!opt.disabled,
  })),
);

function onUpdate(val) {
  // Find the original typed value in options to preserve number types.
  const found = normalizedOptions.value.find((o) => String(o.value) === val);
  emit('update:modelValue', found ? found.value : val);
}
</script>

<style scoped>
/* ─── KRadioGroup ─────────────────────────────────────────────────────── */

.kradio-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.kradio-group--horizontal {
  flex-direction: row;
  flex-wrap: wrap;
  gap: 16px;
}

/* Each radio row: button + label */
.kradio-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.kradio-item--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 16px circle button */
.kradio-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 1px solid var(--kdl-border);
  background: var(--kdl-card-bg);
  padding: 0;
  cursor: inherit;
  outline: none;
  transition: border-color 150ms cubic-bezier(0.2, 0, 0, 1),
              box-shadow 150ms cubic-bezier(0.2, 0, 0, 1);
}

/* Hover */
.kradio-item:not(.kradio-item--disabled):hover .kradio-button:not(.kradio-button--checked) {
  border-color: var(--kdl-text-muted);
}

/* Checked */
.kradio-button--checked,
.kradio-button[data-state="checked"] {
  border-color: var(--kdl-accent);
  background: var(--kdl-accent);
}

/* Focus ring */
.kradio-button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px rgba(255, 61, 127, 0.25);
  border-color: var(--kdl-accent);
}

/* Inner white dot (RadioGroupIndicator renders when checked) */
.kradio-indicator {
  display: block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #fff;
}

/* Label */
.kradio-label {
  font-size: 14px;
  font-weight: 400;
  color: var(--kdl-text-primary);
  line-height: 1.45;
}

/* ─── Dark mode ─────────────────────────────────────────────────────────── */
:root[data-theme="dark"] .kradio-button:focus-visible {
  box-shadow: 0 0 0 2px rgba(255, 79, 138, 0.3);
}
</style>
