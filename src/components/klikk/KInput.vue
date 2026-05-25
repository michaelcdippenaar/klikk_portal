<!--
  KInput — Klikk Design Language form input primitive (finance-admin variant).

  Replaces: q-input outlined dense
  Reason: Quasar's notched floating label, ripple, and chunky outline are Material
  design tells. KInput uses a static label above the field, a clean border, and a
  KDL-token focus ring.

  USAGE:
    <KInput v-model="email" label="Email address" type="email" />
    <KInput v-model="amount" label="Amount" prefix="R" placeholder="0.00" />
    <KInput v-model="ref" label="Reference" :error="!!refError" :error-message="refError" />
    <KInput v-model="notes" label="Notes" help-text="Optional — max 200 characters" />
    <KInput v-model="query" label="Search" icon="search" />
    <KInput v-model="price" label="Price" prefix="R" suffix="ZAR" />
    <KInput v-model="price" label="Price" type="number" />
    <KInput v-model="query" label="Search" clearable />
    <KInput v-model="query" label="Live search" :debounce="300" />

  Numeric coercion: use type="number" — the emitted value will be a JS Number.
  This is the equivalent of v-model.number in vanilla Vue without modifier pass-through complexity.

  Slots:
    #prefix — alternative to the `prefix` string prop (e.g. icon)
    #suffix — alternative to the `suffix` string prop
-->
<template>
  <div class="kinput-root" :class="{ 'kinput-root--disabled': disabled, 'kinput-root--error': error }">
    <!-- Label — rendered ABOVE the input, not floating. -->
    <label v-if="label" :for="inputId" class="kinput-label">
      {{ label }}
    </label>

    <!-- Input row -->
    <div
      class="kinput-shell"
      :class="{
        'kinput-shell--error': error,
        'kinput-shell--disabled': disabled,
        'kinput-shell--focused': isFocused,
      }"
    >
      <!-- Leading icon (Lucide SVG inline — avoid extra imports in the primitive) -->
      <span v-if="icon" class="kinput-icon kinput-icon--lead" aria-hidden="true">
        <slot name="icon">
          <!-- Inline SVG stub for common icons. For full Lucide, pass via slot. -->
          <svg
            xmlns="http://www.w3.org/2000/svg"
            :width="14"
            :height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <!-- Search icon as default placeholder — consumer should override via slot -->
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </slot>
      </span>

      <!-- Prefix string or slot -->
      <span v-if="prefix || $slots.prefix" class="kinput-affix kinput-affix--prefix" aria-hidden="true">
        <slot name="prefix">{{ prefix }}</slot>
      </span>

      <!-- Native input -->
      <input
        :id="inputId"
        class="kinput-field"
        :type="type"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="(error && errorMessage) ? `${inputId}-error` : helpText ? `${inputId}-help` : undefined"
        v-bind="$attrs"
        @input="handleInput"
        @focus="isFocused = true"
        @blur="isFocused = false"
      />

      <!-- Clear button — only shown when clearable=true and there is a value -->
      <button
        v-if="clearable && hasValue"
        type="button"
        class="kinput-clear"
        aria-label="Clear input"
        tabindex="-1"
        @click="clearValue"
      >
        <!-- Lucide x — 12px -->
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

      <!-- Suffix string or slot -->
      <span v-if="suffix || $slots.suffix" class="kinput-affix kinput-affix--suffix" aria-hidden="true">
        <slot name="suffix">{{ suffix }}</slot>
      </span>
    </div>

    <!-- Error message -->
    <p
      v-if="error && errorMessage"
      :id="`${inputId}-error`"
      class="kinput-message kinput-message--error"
      role="alert"
    >
      {{ errorMessage }}
    </p>

    <!-- Help text (shown only when there is no error) -->
    <p
      v-else-if="helpText"
      :id="`${inputId}-help`"
      class="kinput-message kinput-message--help"
    >
      {{ helpText }}
    </p>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useDebounceFn } from '@vueuse/core';

// Suppress attribute inheritance — we apply $attrs to the <input> directly.
defineOptions({ inheritAttrs: false });

const props = defineProps({
  /** v-model binding. Accepts string or number; use type="number" for numeric coercion. */
  modelValue: {
    type: [String, Number],
    default: '',
  },
  /** Label rendered above the input. Omit for unlabelled search inputs. */
  label: {
    type: String,
    default: null,
  },
  /** Input type. Use "number" to coerce the emitted value to a JS Number. */
  type: {
    type: String,
    default: 'text',
    validator: (v) => ['text', 'password', 'email', 'number', 'search', 'tel', 'url'].includes(v),
  },
  /** Placeholder text. */
  placeholder: {
    type: String,
    default: null,
  },
  /** Disable the input. */
  disabled: {
    type: Boolean,
    default: false,
  },
  /** Whether the field is in an error state. */
  error: {
    type: Boolean,
    default: false,
  },
  /** Error message shown below the input when error=true. */
  errorMessage: {
    type: String,
    default: null,
  },
  /** Help / hint text — hidden when error=true (error takes priority). */
  helpText: {
    type: String,
    default: null,
  },
  /** Prefix string (e.g. "R" for currency). Use the prefix slot for icon content. */
  prefix: {
    type: String,
    default: null,
  },
  /** Suffix string (e.g. "ZAR"). Use the suffix slot for icon content. */
  suffix: {
    type: String,
    default: null,
  },
  /**
   * Icon name token — renders a leading icon. Pass the Lucide icon component
   * via the #icon slot for full control. This prop acts as an aria-accessible
   * affordance flag; the actual glyph comes from the slot or the default stub.
   */
  icon: {
    type: String,
    default: null,
  },
  /**
   * Show a clear (×) button when the input has a non-empty value.
   * Clicking it emits update:modelValue with '' (or 0 for type=number).
   */
  clearable: {
    type: Boolean,
    default: false,
  },
  /**
   * Debounce the update:modelValue emit by N milliseconds.
   * Useful for search / filter inputs to avoid hammering the API on every keystroke.
   * Set to 0 (default) for immediate emit.
   */
  debounce: {
    type: Number,
    default: 0,
  },
});

const emit = defineEmits(['update:modelValue']);

const isFocused = ref(false);

// Stable, unique id per instance — avoids label/input linkage collisions.
const inputId = `kinput-${Math.random().toString(36).slice(2, 8)}`;

/** Whether there is a current non-empty value (drives clearable button visibility). */
const hasValue = computed(() => {
  const v = props.modelValue;
  return v !== '' && v !== null && v !== undefined;
});

/** Coerce raw string value to the appropriate JS type for the emit. */
function coerce(rawValue) {
  if (props.type === 'number') {
    const n = Number(rawValue);
    return Number.isNaN(n) ? rawValue : n;
  }
  return rawValue;
}

/** Inner emit — may be wrapped with debounce below. */
function emitValue(rawValue) {
  emit('update:modelValue', coerce(rawValue));
}

/** Potentially-debounced emit function. */
const debouncedEmit = computed(() => {
  if (props.debounce > 0) {
    return useDebounceFn(emitValue, props.debounce);
  }
  return emitValue;
});

function handleInput(event) {
  debouncedEmit.value(event.target.value);
}

function clearValue() {
  emit('update:modelValue', props.type === 'number' ? 0 : '');
}
</script>

<style scoped>
/* ─── KInput — finance-admin primitive ─────────────────────────────────────
   Tokens used (all from KDL / klikk.css):
     --kdl-border          visible border (card outline weight)
     --kdl-border-subtle   softer border
     --kdl-text-primary    primary text colour
     --kdl-text-muted      secondary / muted text
     --kdl-text-hint       hint / placeholder text
     --kdl-card-bg         input background (matches card surface)
     --kdl-accent          accent for focus ring (pink)

   Danger tokens: danger-500 (#ef4444) via Tailwind config.
   These are referenced as CSS custom properties below for dark-mode safety.
───────────────────────────────────────────────────────────────────────── */

.kinput-root {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* Label */
.kinput-label {
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  color: var(--kdl-text-primary);
  cursor: default;
  user-select: none;
}

/* Shell — the visible bordered rectangle */
.kinput-shell {
  display: flex;
  align-items: center;
  height: 40px;
  padding: 0 12px;
  gap: 6px;
  border-radius: 8px;
  border: 1px solid var(--kdl-border);
  background: var(--kdl-card-bg);
  transition: border-color 150ms cubic-bezier(0.2, 0, 0, 1),
              box-shadow 150ms cubic-bezier(0.2, 0, 0, 1);
}

/* Hover — subtle border lift. Use box-shadow so there is no 1px layout shift. */
.kinput-shell:not(.kinput-shell--disabled):not(.kinput-shell--error):hover {
  border-color: var(--kdl-text-muted);
}

/* Focus — 2px accent ring with 1px offset (KDL convention) */
.kinput-shell--focused:not(.kinput-shell--disabled):not(.kinput-shell--error) {
  border-color: var(--kdl-accent);
  box-shadow: 0 0 0 2px rgba(255, 61, 127, 0.18);
  outline: none;
}

/* Error state */
.kinput-shell--error {
  border-color: #ef4444;
}

.kinput-shell--error.kinput-shell--focused {
  box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.18);
}

/* Disabled */
.kinput-shell--disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: var(--kdl-border-subtle);
}

/* Actual <input> element */
.kinput-field {
  flex: 1 1 0;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-family: inherit;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.45;
  color: var(--kdl-text-primary);
  padding: 0;
}

.kinput-field::placeholder {
  color: var(--kdl-text-hint);
  font-weight: 400;
}

.kinput-field:disabled {
  cursor: not-allowed;
}

/* Clear button */
.kinput-clear {
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
  transition: background 150ms cubic-bezier(0.2, 0, 0, 1),
              color 150ms cubic-bezier(0.2, 0, 0, 1);
}

.kinput-clear:hover {
  background: var(--kdl-text-hint);
  color: var(--kdl-card-bg);
}

/* Prefix / suffix affixes */
.kinput-affix {
  font-size: 14px;
  font-weight: 500;
  color: var(--kdl-text-muted);
  flex-shrink: 0;
  user-select: none;
}

/* Leading icon */
.kinput-icon {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  color: var(--kdl-text-hint);
}

/* Below-field messages */
.kinput-message {
  font-size: 12px;
  font-weight: 500;
  line-height: 1.35;
  margin: 0;
}

.kinput-message--error {
  color: #ef4444;
}

.kinput-message--help {
  color: var(--kdl-text-muted);
}

/* ─── Dark mode adaptations ────────────────────────────────────────────── */
/* The KDL CSS variables swap automatically via data-theme="dark".
   Only values that don't use variables need explicit overrides. */

:root[data-theme="dark"] .kinput-shell--error {
  border-color: #f87171; /* danger-400 — lighter for dark bg contrast */
}

:root[data-theme="dark"] .kinput-message--error {
  color: #f87171;
}

:root[data-theme="dark"] .kinput-shell--focused:not(.kinput-shell--error) {
  box-shadow: 0 0 0 2px rgba(255, 79, 138, 0.22); /* accent lifted in dark */
}
</style>
