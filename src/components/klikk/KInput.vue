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
        @input="$emit('update:modelValue', $event.target.value)"
        @focus="isFocused = true"
        @blur="isFocused = false"
      />

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
import { ref } from 'vue';

// Suppress attribute inheritance — we apply $attrs to the <input> directly.
defineOptions({ inheritAttrs: false });

const props = defineProps({
  /** v-model binding. */
  modelValue: {
    type: [String, Number],
    default: '',
  },
  /** Label rendered above the input. Omit for unlabelled search inputs. */
  label: {
    type: String,
    default: null,
  },
  /** Input type. */
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
});

defineEmits(['update:modelValue']);

const isFocused = ref(false);

// Stable, unique id per instance — avoids label/input linkage collisions.
// Math.random gives sufficient uniqueness for DOM ids in a SPA context.
const inputId = `kinput-${Math.random().toString(36).slice(2, 8)}`;
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
  /* cursor pointer highlights the label is interactive */
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
