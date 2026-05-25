<!--
  KMultiSelect — Klikk Design Language multi-select primitive (finance-admin variant).

  Replaces: q-select multiple
  Uses Reka UI's ComboboxRoot which gives us multi-select + type-ahead search out of the box.

  USAGE:
    <KMultiSelect v-model="selected" label="Entities" :options="entityOptions" />
    <KMultiSelect v-model="tags" label="Categories" :options="['Invoices','Payments','Journals']" />

  v-model is an array of selected values. Options shape same as KSelect.
-->
<template>
  <div
    class="kmselect-root"
    :class="{ 'kmselect-root--disabled': disabled, 'kmselect-root--error': error }"
  >
    <!-- Label -->
    <label v-if="label" :id="labelId" class="kmselect-label">{{ label }}</label>

    <ComboboxRoot
      v-model="internalValue"
      multiple
      :disabled="disabled"
      :filter-function="filterOptions"
      @update:open="onOpenChange"
    >
      <!-- Trigger shell — looks like KInput -->
      <ComboboxAnchor
        class="kmselect-shell"
        :class="{
          'kmselect-shell--open': isOpen,
          'kmselect-shell--error': error,
          'kmselect-shell--disabled': disabled,
        }"
        :aria-labelledby="label ? labelId : undefined"
        :aria-describedby="(error && errorMessage) ? `${rootId}-error` : helpText ? `${rootId}-help` : undefined"
        :aria-invalid="error ? 'true' : undefined"
      >
        <!-- Selected tags inline -->
        <div class="kmselect-tags" @click="openCombobox">
          <span
            v-for="val in internalValue"
            :key="val"
            class="kmselect-tag"
          >
            {{ labelFor(val) }}
            <button
              type="button"
              class="kmselect-tag-remove"
              :aria-label="`Remove ${labelFor(val)}`"
              tabindex="-1"
              @click.stop="removeValue(val)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2.5"
                stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </span>

          <!-- Search input inside the shell -->
          <ComboboxInput
            ref="comboboxInputRef"
            v-model="searchQuery"
            class="kmselect-input"
            :placeholder="internalValue.length === 0 ? (placeholder || 'Select…') : ''"
            :disabled="disabled"
            :aria-label="label || 'Multi-select input'"
            autocomplete="off"
            @focus="isOpen = true"
          />
        </div>

        <!-- Trailing controls -->
        <div class="kmselect-trailing">
          <!-- Clear all -->
          <button
            v-if="clearable && internalValue.length > 0"
            type="button"
            class="kmselect-clear"
            aria-label="Clear all selections"
            tabindex="-1"
            @click.stop="clearAll"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          <!-- Chevron -->
          <ComboboxTrigger class="kmselect-chevron-btn" aria-label="Toggle options">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="1.75"
              stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
              :style="{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </ComboboxTrigger>
        </div>
      </ComboboxAnchor>

      <ComboboxPortal>
        <ComboboxContent class="kmselect-content" :side-offset="4">
          <ComboboxEmpty class="kmselect-empty">No options found</ComboboxEmpty>
          <ComboboxViewport class="kmselect-viewport">
            <ComboboxItem
              v-for="opt in normalizedOptions"
              :key="opt.value"
              :value="opt.value"
              :disabled="opt.disabled"
              class="kmselect-item"
            >
              <!-- Checkbox-style indicator -->
              <span
                class="kmselect-item-check"
                :class="{ 'kmselect-item-check--checked': isSelected(opt.value) }"
                aria-hidden="true"
              >
                <svg v-if="isSelected(opt.value)"
                  xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" stroke-width="3"
                  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
              <ComboboxItemIndicator />
              <span>{{ opt.label }}</span>
            </ComboboxItem>
          </ComboboxViewport>
        </ComboboxContent>
      </ComboboxPortal>
    </ComboboxRoot>

    <!-- Error / help text -->
    <p
      v-if="error && errorMessage"
      :id="`${rootId}-error`"
      class="kmselect-message kmselect-message--error"
      role="alert"
    >
      {{ errorMessage }}
    </p>
    <p
      v-else-if="helpText"
      :id="`${rootId}-help`"
      class="kmselect-message kmselect-message--help"
    >
      {{ helpText }}
    </p>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import {
  ComboboxRoot,
  ComboboxAnchor,
  ComboboxInput,
  ComboboxTrigger,
  ComboboxPortal,
  ComboboxContent,
  ComboboxViewport,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxEmpty,
} from 'reka-ui';

const props = defineProps({
  /** Array of selected values (v-model). */
  modelValue: {
    type: Array,
    default: () => [],
  },
  /**
   * Options array. Same shape as KSelect:
   *   - Plain strings: ['A', 'B']
   *   - Objects: [{ value, label, disabled? }]
   */
  options: {
    type: Array,
    default: () => [],
  },
  /** Label above the shell. */
  label: {
    type: String,
    default: null,
  },
  /** Placeholder when nothing is selected. */
  placeholder: {
    type: String,
    default: null,
  },
  /** Disable the component entirely. */
  disabled: {
    type: Boolean,
    default: false,
  },
  /** Error state. */
  error: {
    type: Boolean,
    default: false,
  },
  /** Error message below. */
  errorMessage: {
    type: String,
    default: null,
  },
  /** Help / hint text. */
  helpText: {
    type: String,
    default: null,
  },
  /** Show a clear-all button when items are selected. */
  clearable: {
    type: Boolean,
    default: true,
  },
});

const emit = defineEmits(['update:modelValue']);

const rootId = `kmselect-${Math.random().toString(36).slice(2, 8)}`;
const labelId = `${rootId}-label`;

const searchQuery = ref('');
const isOpen = ref(false);
const comboboxInputRef = ref(null);

/** Sync to parent v-model. Reka combobox passes the full array. */
const internalValue = computed({
  get: () => props.modelValue ?? [],
  set: (val) => emit('update:modelValue', val),
});

/** Normalised options list. */
const normalizedOptions = computed(() =>
  props.options.map((opt) => {
    if (typeof opt === 'string' || typeof opt === 'number') {
      return { value: opt, label: String(opt), disabled: false };
    }
    return { value: opt.value, label: opt.label ?? String(opt.value), disabled: !!opt.disabled };
  }),
);

/** Get display label for a value. */
function labelFor(val) {
  const found = normalizedOptions.value.find((o) => o.value === val || String(o.value) === String(val));
  return found ? found.label : String(val);
}

/** Whether a value is currently selected. */
function isSelected(val) {
  return internalValue.value.some((v) => v === val || String(v) === String(val));
}

/** Remove a single value from selection. */
function removeValue(val) {
  emit('update:modelValue', internalValue.value.filter((v) => v !== val && String(v) !== String(val)));
}

/** Clear all selected values. */
function clearAll() {
  emit('update:modelValue', []);
}

/** Open the combobox by focusing the input. */
function openCombobox() {
  if (!props.disabled) {
    comboboxInputRef.value?.$el?.focus();
    isOpen.value = true;
  }
}

function onOpenChange(open) {
  isOpen.value = open;
  if (!open) searchQuery.value = '';
}

/** Custom filter: case-insensitive label match. */
function filterOptions(options, search) {
  if (!search) return options;
  const q = search.toLowerCase();
  return options.filter((opt) => {
    const label = typeof opt === 'string' ? opt : opt.label ?? String(opt);
    return label.toLowerCase().includes(q);
  });
}
</script>

<style scoped>
/* ─── KMultiSelect ─────────────────────────────────────────────────────── */

.kmselect-root {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.kmselect-label {
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  color: var(--kdl-text-primary);
  cursor: default;
  user-select: none;
}

/* Shell */
.kmselect-shell {
  display: flex;
  align-items: center;
  min-height: 40px;
  padding: 4px 8px 4px 10px;
  gap: 6px;
  border-radius: 8px;
  border: 1px solid var(--kdl-border);
  background: var(--kdl-card-bg);
  cursor: text;
  transition: border-color 150ms cubic-bezier(0.2, 0, 0, 1),
              box-shadow 150ms cubic-bezier(0.2, 0, 0, 1);
  width: 100%;
}

.kmselect-shell:hover:not(.kmselect-shell--disabled) {
  border-color: var(--kdl-text-muted);
}

.kmselect-shell--open {
  border-color: var(--kdl-accent);
  box-shadow: 0 0 0 2px rgba(255, 61, 127, 0.18);
}

.kmselect-shell--error {
  border-color: #ef4444 !important;
}

.kmselect-shell--error.kmselect-shell--open {
  box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.18) !important;
}

.kmselect-shell--disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: var(--kdl-border-subtle);
}

/* Tags area + input */
.kmselect-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  flex: 1 1 0;
  min-width: 0;
}

.kmselect-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 6px 0 8px;
  border-radius: 4px;
  background: var(--kdl-border-subtle);
  border: 1px solid var(--kdl-border);
  font-size: 12px;
  font-weight: 500;
  color: var(--kdl-text-primary);
  user-select: none;
  white-space: nowrap;
}

.kmselect-tag-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: 2px;
  color: var(--kdl-text-muted);
  cursor: pointer;
  transition: color 100ms, background 100ms;
}

.kmselect-tag-remove:hover {
  color: var(--kdl-text-primary);
  background: var(--kdl-border);
}

/* Inline search input */
.kmselect-input {
  flex: 1 1 80px;
  min-width: 60px;
  border: none;
  outline: none;
  background: transparent;
  font-family: inherit;
  font-size: 14px;
  font-weight: 400;
  color: var(--kdl-text-primary);
  padding: 0;
  height: 28px;
}

.kmselect-input::placeholder {
  color: var(--kdl-text-hint);
}

/* Trailing icons */
.kmselect-trailing {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.kmselect-clear {
  display: flex;
  align-items: center;
  justify-content: center;
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

.kmselect-clear:hover {
  background: var(--kdl-text-hint);
  color: var(--kdl-card-bg);
}

.kmselect-chevron-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  padding: 2px;
  color: var(--kdl-text-hint);
  cursor: pointer;
  border-radius: 4px;
}

.kmselect-chevron-btn:hover {
  color: var(--kdl-text-muted);
}

/* Dropdown content */
.kmselect-content {
  background: var(--kdl-card-bg);
  border: 1px solid var(--kdl-border);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(15, 17, 57, 0.08), 0 12px 24px rgba(15, 17, 57, 0.06);
  min-width: var(--reka-combobox-trigger-width, 200px);
  max-height: 280px;
  overflow: hidden;
  z-index: 9000;
}

.kmselect-viewport {
  padding: 4px;
}

.kmselect-empty {
  padding: 10px 12px;
  font-size: 13px;
  color: var(--kdl-text-hint);
  text-align: center;
}

.kmselect-item {
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
  transition: background 100ms;
}

.kmselect-item[data-highlighted] {
  background: var(--kdl-hover-bg);
}

.kmselect-item[data-disabled] {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Inline checkbox-style indicator */
.kmselect-item-check {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 3px;
  border: 1px solid var(--kdl-border);
  flex-shrink: 0;
  transition: background 100ms, border-color 100ms;
  background: var(--kdl-card-bg);
}

.kmselect-item-check--checked {
  background: var(--kdl-accent);
  border-color: var(--kdl-accent);
  color: #fff;
}

/* Messages */
.kmselect-message {
  font-size: 12px;
  font-weight: 500;
  line-height: 1.35;
  margin: 0;
}

.kmselect-message--error {
  color: #ef4444;
}

.kmselect-message--help {
  color: var(--kdl-text-muted);
}

/* ─── Dark mode ─────────────────────────────────────────────────────────── */
:root[data-theme="dark"] .kmselect-content {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), 0 12px 32px rgba(0, 0, 0, 0.3);
}

:root[data-theme="dark"] .kmselect-shell--error {
  border-color: #f87171 !important;
}

:root[data-theme="dark"] .kmselect-message--error {
  color: #f87171;
}

:root[data-theme="dark"] .kmselect-shell--open {
  box-shadow: 0 0 0 2px rgba(255, 79, 138, 0.22);
}
</style>
