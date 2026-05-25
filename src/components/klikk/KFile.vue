<!--
  KFile — Klikk Design Language file-input primitive (finance-admin variant).

  Replaces: q-file
  Hand-rolled wrapper around native <input type="file">. No Reka dependency needed.

  USAGE:
    <KFile v-model="attachment" label="Attachment" accept=".pdf,.csv" />
    <KFile v-model="files" label="Documents" multiple accept="application/pdf" />
    <KFile v-model="report" label="Report" placeholder="Choose PDF file…" />

  v-model:
    - single mode (multiple=false):  File | null
    - multiple mode (multiple=true): File[] | null
-->
<template>
  <div
    class="kfile-root"
    :class="{ 'kfile-root--disabled': disabled, 'kfile-root--error': error }"
  >
    <!-- Label -->
    <label v-if="label" :for="inputId" class="kfile-label">{{ label }}</label>

    <!-- Trigger shell — visually identical to KInput -->
    <div
      class="kfile-shell"
      :class="{
        'kfile-shell--error': error,
        'kfile-shell--disabled': disabled,
        'kfile-shell--focused': isFocused,
      }"
      @click="openPicker"
      @keydown.enter.space.prevent="openPicker"
    >
      <!-- Lucide upload icon -->
      <span class="kfile-icon" aria-hidden="true">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      </span>

      <!-- File name(s) or placeholder -->
      <span
        class="kfile-value"
        :class="{ 'kfile-value--placeholder': !hasValue }"
      >
        {{ displayText }}
      </span>

      <!-- Clear button -->
      <button
        v-if="hasValue && !disabled"
        type="button"
        class="kfile-clear"
        aria-label="Clear file selection"
        tabindex="-1"
        @click.stop="clearSelection"
      >
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
    </div>

    <!-- Hidden native input -->
    <input
      :id="inputId"
      ref="nativeInput"
      type="file"
      class="kfile-native"
      :multiple="multiple"
      :accept="accept"
      :disabled="disabled"
      tabindex="-1"
      aria-hidden="true"
      @change="onFileChange"
      @focus="isFocused = true"
      @blur="isFocused = false"
    />

    <!-- Error message -->
    <p
      v-if="error && errorMessage"
      :id="`${inputId}-error`"
      class="kfile-message kfile-message--error"
      role="alert"
    >
      {{ errorMessage }}
    </p>

    <!-- Help text -->
    <p
      v-else-if="helpText"
      :id="`${inputId}-help`"
      class="kfile-message kfile-message--help"
    >
      {{ helpText }}
    </p>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';

defineOptions({ inheritAttrs: false });

const props = defineProps({
  /**
   * v-model binding.
   * Single mode: File | null
   * Multiple mode: File[] | null
   */
  modelValue: {
    type: [Object, Array, null],
    default: null,
  },
  /** Label above the trigger. */
  label: {
    type: String,
    default: null,
  },
  /** Allow selecting multiple files. */
  multiple: {
    type: Boolean,
    default: false,
  },
  /** MIME type filter, e.g. ".pdf,.csv" or "image/*". */
  accept: {
    type: String,
    default: null,
  },
  /** Placeholder text when no file is selected. */
  placeholder: {
    type: String,
    default: 'Choose file…',
  },
  /** Disable the picker. */
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
  /** Help / hint text below. */
  helpText: {
    type: String,
    default: null,
  },
});

const emit = defineEmits(['update:modelValue']);

const inputId = `kfile-${Math.random().toString(36).slice(2, 8)}`;
const nativeInput = ref(null);
const isFocused = ref(false);

const hasValue = computed(() => {
  if (props.multiple) {
    return Array.isArray(props.modelValue) && props.modelValue.length > 0;
  }
  return props.modelValue != null;
});

const displayText = computed(() => {
  if (!hasValue.value) return props.placeholder || 'Choose file…';
  if (props.multiple && Array.isArray(props.modelValue)) {
    const count = props.modelValue.length;
    if (count === 1) return props.modelValue[0].name;
    return `${count} files selected`;
  }
  return props.modelValue?.name ?? 'File selected';
});

function openPicker() {
  if (!props.disabled) {
    nativeInput.value?.click();
  }
}

function onFileChange(event) {
  const files = Array.from(event.target.files || []);
  if (props.multiple) {
    emit('update:modelValue', files.length > 0 ? files : null);
  } else {
    emit('update:modelValue', files[0] ?? null);
  }
}

function clearSelection() {
  if (nativeInput.value) nativeInput.value.value = '';
  emit('update:modelValue', props.multiple ? null : null);
}
</script>

<style scoped>
/* ─── KFile ────────────────────────────────────────────────────────────── */

.kfile-root {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.kfile-label {
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  color: var(--kdl-text-primary);
  cursor: default;
  user-select: none;
}

/* Shell — matches KInput visually */
.kfile-shell {
  display: flex;
  align-items: center;
  height: 40px;
  padding: 0 12px;
  gap: 8px;
  border-radius: 8px;
  border: 1px solid var(--kdl-border);
  background: var(--kdl-card-bg);
  cursor: pointer;
  transition: border-color 150ms cubic-bezier(0.2, 0, 0, 1),
              box-shadow 150ms cubic-bezier(0.2, 0, 0, 1);
}

.kfile-shell:hover:not(.kfile-shell--disabled):not(.kfile-shell--error) {
  border-color: var(--kdl-text-muted);
}

.kfile-shell--focused:not(.kfile-shell--disabled):not(.kfile-shell--error) {
  border-color: var(--kdl-accent);
  box-shadow: 0 0 0 2px rgba(255, 61, 127, 0.18);
}

.kfile-shell--error {
  border-color: #ef4444;
}

.kfile-shell--error.kfile-shell--focused {
  box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.18);
}

.kfile-shell--disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: var(--kdl-border-subtle);
}

.kfile-icon {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  color: var(--kdl-text-hint);
}

.kfile-value {
  flex: 1 1 0;
  min-width: 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--kdl-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kfile-value--placeholder {
  color: var(--kdl-text-hint);
  font-weight: 400;
}

.kfile-clear {
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

.kfile-clear:hover {
  background: var(--kdl-text-hint);
  color: var(--kdl-card-bg);
}

/* Completely hidden from layout and interaction */
.kfile-native {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}

/* Messages */
.kfile-message {
  font-size: 12px;
  font-weight: 500;
  line-height: 1.35;
  margin: 0;
}

.kfile-message--error {
  color: #ef4444;
}

.kfile-message--help {
  color: var(--kdl-text-muted);
}

/* ─── Dark mode ─────────────────────────────────────────────────────────── */
:root[data-theme="dark"] .kfile-shell--error {
  border-color: #f87171;
}

:root[data-theme="dark"] .kfile-message--error {
  color: #f87171;
}

:root[data-theme="dark"] .kfile-shell--focused:not(.kfile-shell--error) {
  box-shadow: 0 0 0 2px rgba(255, 79, 138, 0.22);
}
</style>
