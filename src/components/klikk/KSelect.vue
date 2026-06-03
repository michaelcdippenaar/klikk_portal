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
        :aria-label="triggerAriaLabel"
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
import { computed, useAttrs } from 'vue';
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

// inheritAttrs is LEFT ON (default): a consumer's `class` must keep falling
// through to .kselect-root (callers size the whole control via the root box —
// width/min-width/max-width/margin). We additionally READ a fallthrough
// `aria-label` here and forward it onto the interactive SelectTrigger
// (role="combobox") below, because an aria-label landing only on the
// non-interactive root <div> is inert for assistive tech — the combobox button
// is what gets focused and announced. When a visible `label` prop is present,
// the trigger is already named via aria-labelledby, so we DON'T also stamp an
// aria-label (avoids a double/duplicate accessible name).
const attrs = useAttrs();
const triggerAriaLabel = computed(() => {
  if (props.label) return undefined;
  const al = attrs['aria-label'];
  return al != null && al !== '' ? String(al) : undefined;
});

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

/* NOTE: The dropdown content panel and everything rendered inside it
   (.kselect-content / -viewport / -item[+states] / -item-icon / -item-indicator
   / -scroll-btn + the dark-mode .kselect-content shadow) are teleported to
   <body> by SelectPortal, so <style scoped> cannot reach them. Their styling
   lives in the global src/css/portals.css. Only the trigger / label / messages
   below stay scoped — they render inside this component's own subtree. */

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
/* Dark .kselect-content shadow is teleported → lives in src/css/portals.css */
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
