<!--
  KSelect — Klikk Design Language select primitive (finance-admin variant).

  Replaces: q-select
  Reason: Quasar's select has Material-style UI tells and limited styling control.
  KSelect uses Reka UI's SelectRoot for full keyboard / accessibility primitives
  with the KDL visual language applied.

  USAGE:
    <KSelect v-model="entity" label="Entity" :options="['Company A', 'Company B']" />
    <KSelect v-model="account" label="Account" :options="accountOptions" placeholder="Choose account…" />
    <KSelect v-model="type" label="Type" :options="typeOptions" clearable />
    <KSelect v-model="code" label="GL Code" :options="codes" :error="!!codeError" :error-message="codeError" />

  Options shape:
    Plain strings: ['Company A', 'Company B']
    Objects:       [{ value: 'A', label: 'Company A', disabled: false }]
-->
<template>
  <div
    class="kselect-root"
    :class="{ 'kselect-root--disabled': disabled, 'kselect-root--error': error }"
  >
    <!-- Label above the trigger -->
    <label v-if="label" :id="labelId" class="kselect-label">{{ label }}</label>

    <SelectRoot
      :model-value="modelValue != null ? String(modelValue) : undefined"
      :disabled="disabled"
      @update:model-value="onSelect"
    >
      <SelectTrigger
        class="kselect-trigger"
        :class="{
          'kselect-trigger--error': error,
          'kselect-trigger--disabled': disabled,
        }"
        :aria-labelledby="label ? labelId : undefined"
        :aria-describedby="(error && errorMessage) ? `${rootId}-error` : helpText ? `${rootId}-help` : undefined"
        :aria-invalid="error ? 'true' : undefined"
      >
        <SelectValue class="kselect-value">
          <span v-if="!modelValue && !isEmptyValue" class="kselect-placeholder">
            {{ placeholder || 'Select…' }}
          </span>
          <span v-else>{{ selectedLabel }}</span>
        </SelectValue>

        <!-- Clear button — stops propagation so it doesn't open the dropdown -->
        <button
          v-if="clearable && isEmptyValue === false && modelValue != null && modelValue !== ''"
          type="button"
          class="kselect-clear"
          aria-label="Clear selection"
          tabindex="-1"
          @click.stop="clearSelection"
        >
          <!-- Lucide x at 12px -->
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <!-- Lucide chevron-down -->
        <SelectIcon class="kselect-chevron" aria-hidden="true">
          <svg class="kselect-chevron-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="1.75"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </SelectIcon>
      </SelectTrigger>

      <SelectPortal>
        <SelectContent class="kselect-content" position="popper" :side-offset="4">
          <SelectScrollUpButton class="kselect-scroll-btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="1.75"
              stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </SelectScrollUpButton>

          <SelectViewport class="kselect-viewport">
            <SelectItem
              v-for="opt in normalizedOptions"
              :key="opt.value"
              :value="String(opt.value)"
              :disabled="opt.disabled"
              class="kselect-item"
            >
              <!-- Left icon slot (optional) -->
              <span v-if="opt.icon" class="kselect-item-icon" aria-hidden="true">
                <component :is="opt.icon" :size="14" />
              </span>

              <SelectItemText>{{ opt.label }}</SelectItemText>

              <!-- Checkmark on selected item -->
              <SelectItemIndicator class="kselect-item-indicator">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" stroke-width="2.25"
                  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </SelectItemIndicator>
            </SelectItem>
          </SelectViewport>

          <SelectScrollDownButton class="kselect-scroll-btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="1.75"
              stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </SelectScrollDownButton>
        </SelectContent>
      </SelectPortal>
    </SelectRoot>

    <!-- Error message -->
    <p
      v-if="error && errorMessage"
      :id="`${rootId}-error`"
      class="kselect-message kselect-message--error"
      role="alert"
    >
      {{ errorMessage }}
    </p>

    <!-- Help text -->
    <p
      v-else-if="helpText"
      :id="`${rootId}-help`"
      class="kselect-message kselect-message--help"
    >
      {{ helpText }}
    </p>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import {
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectIcon,
  SelectPortal,
  SelectContent,
  SelectViewport,
  SelectItem,
  SelectItemText,
  SelectItemIndicator,
  SelectScrollUpButton,
  SelectScrollDownButton,
} from 'reka-ui';

const props = defineProps({
  /** Currently selected value (v-model). */
  modelValue: {
    type: [String, Number, null],
    default: null,
  },
  /**
   * Options array. Accepts:
   *   - Plain strings: ['A', 'B', 'C']
   *   - Objects: [{ value, label, disabled?, icon? }]
   */
  options: {
    type: Array,
    default: () => [],
  },
  /** Label above the trigger. */
  label: {
    type: String,
    default: null,
  },
  /** Placeholder shown when no value is selected. */
  placeholder: {
    type: String,
    default: null,
  },
  /** Disable the select entirely. */
  disabled: {
    type: Boolean,
    default: false,
  },
  /** Error state — adds red border. */
  error: {
    type: Boolean,
    default: false,
  },
  /** Error message shown below. */
  errorMessage: {
    type: String,
    default: null,
  },
  /** Help / hint text shown below (hidden when error=true). */
  helpText: {
    type: String,
    default: null,
  },
  /**
   * Show a clear button when a value is selected.
   * Emits null on click.
   */
  clearable: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['update:modelValue']);

const rootId = `kselect-${Math.random().toString(36).slice(2, 8)}`;
const labelId = `${rootId}-label`;

/** Normalise options to { value, label, disabled?, icon? } shape. */
const normalizedOptions = computed(() =>
  props.options.map((opt) => {
    if (typeof opt === 'string' || typeof opt === 'number') {
      return { value: opt, label: String(opt), disabled: false };
    }
    return { value: opt.value, label: opt.label ?? String(opt.value), disabled: !!opt.disabled, icon: opt.icon ?? null };
  }),
);

/** Whether the current model value is considered "empty". */
const isEmptyValue = computed(() => props.modelValue == null || props.modelValue === '');

/** Human-readable label for the currently selected value. */
const selectedLabel = computed(() => {
  if (isEmptyValue.value) return '';
  const found = normalizedOptions.value.find((o) => String(o.value) === String(props.modelValue));
  return found ? found.label : String(props.modelValue);
});

function onSelect(val) {
  // Try to find the original value type in options
  const found = normalizedOptions.value.find((o) => String(o.value) === val);
  emit('update:modelValue', found ? found.value : val);
}

function clearSelection() {
  emit('update:modelValue', null);
}
</script>

<style scoped>
/* ─── KSelect — finance-admin primitive ─────────────────────────────────── */

.kselect-root {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.kselect-label {
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  color: var(--kdl-text-primary);
  cursor: default;
  user-select: none;
}

/* Trigger — matches KInput shell visually */
.kselect-trigger {
  display: flex;
  align-items: center;
  height: 40px;
  padding: 0 10px 0 12px;
  gap: 6px;
  width: 100%;
  border-radius: 8px;
  border: 1px solid var(--kdl-border);
  background: var(--kdl-card-bg);
  cursor: pointer;
  font-family: inherit;
  font-size: 14px;
  text-align: left;
  transition: border-color 150ms cubic-bezier(0.2, 0, 0, 1),
              box-shadow 150ms cubic-bezier(0.2, 0, 0, 1);
}

.kselect-trigger:hover:not([data-disabled]) {
  border-color: var(--kdl-text-muted);
}

.kselect-trigger:focus-visible {
  outline: none;
  border-color: var(--kdl-accent);
  box-shadow: 0 0 0 2px rgba(255, 61, 127, 0.18);
}

.kselect-trigger[data-state="open"] {
  border-color: var(--kdl-accent);
  box-shadow: 0 0 0 2px rgba(255, 61, 127, 0.18);
}

.kselect-trigger--error {
  border-color: #ef4444 !important;
}

.kselect-trigger--error:focus-visible,
.kselect-trigger--error[data-state="open"] {
  box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.18) !important;
}

.kselect-trigger--disabled,
.kselect-trigger[data-disabled] {
  opacity: 0.5;
  cursor: not-allowed;
  background: var(--kdl-border-subtle);
}

.kselect-value {
  flex: 1 1 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 500;
  color: var(--kdl-text-primary);
}

.kselect-placeholder {
  color: var(--kdl-text-hint);
  font-weight: 400;
}

.kselect-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--kdl-border);
  color: var(--kdl-text-muted);
  cursor: pointer;
  transition: background 150ms, color 150ms;
}

.kselect-clear:hover {
  background: var(--kdl-text-hint);
  color: var(--kdl-card-bg);
}

.kselect-chevron {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  color: var(--kdl-text-hint);
  margin-left: auto;
  transform: none;
}

.kselect-chevron-icon {
  display: block;
  transition: transform 200ms cubic-bezier(0.2, 0, 0, 1);
}

/* Rotate chevron when open */
.kselect-trigger[data-state="open"] .kselect-chevron-icon {
  transform: rotate(180deg);
}

/* Dropdown content panel */
/* z-index is set globally in src/css/portals.css via --kdl-z-popover (teleported to body) */
.kselect-content {
  background: var(--kdl-card-bg);
  border: 1px solid var(--kdl-border);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(15, 17, 57, 0.08), 0 12px 24px rgba(15, 17, 57, 0.06);
  min-width: var(--reka-select-trigger-width);
  max-height: var(--reka-select-content-available-height);
  overflow: hidden;
}

.kselect-viewport {
  padding: 4px;
}

/* Individual option item */
.kselect-item {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 400;
  color: var(--kdl-text-primary);
  outline: none;
  user-select: none;
  transition: background 100ms, color 100ms;
  position: relative;
}

.kselect-item[data-highlighted] {
  background: var(--kdl-hover-bg);
  color: var(--kdl-accent);
}

.kselect-item[data-state="checked"] {
  font-weight: 500;
}

.kselect-item[data-disabled] {
  opacity: 0.4;
  cursor: not-allowed;
}

.kselect-item-icon {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  color: var(--kdl-text-muted);
}

.kselect-item-indicator {
  display: flex;
  align-items: center;
  margin-left: auto;
  color: var(--kdl-accent);
}

.kselect-scroll-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  cursor: default;
  color: var(--kdl-text-muted);
}

/* Below-trigger messages */
.kselect-message {
  font-size: 12px;
  font-weight: 500;
  line-height: 1.35;
  margin: 0;
}

.kselect-message--error {
  color: #ef4444;
}

.kselect-message--help {
  color: var(--kdl-text-muted);
}

/* ─── Dark mode ─────────────────────────────────────────────────────────── */
:root[data-theme="dark"] .kselect-content {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), 0 12px 32px rgba(0, 0, 0, 0.3);
}

:root[data-theme="dark"] .kselect-trigger--error {
  border-color: #f87171 !important;
}

:root[data-theme="dark"] .kselect-message--error {
  color: #f87171;
}

:root[data-theme="dark"] .kselect-trigger:focus-visible,
:root[data-theme="dark"] .kselect-trigger[data-state="open"] {
  box-shadow: 0 0 0 2px rgba(255, 79, 138, 0.22);
}
</style>
