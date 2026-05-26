<!--
  KSpinner — Klikk Design Language loading indicator primitive.

  Replaces: q-spinner / q-spinner-* Quasar variants.
  Visual: inline Lucide loader-2 rotating via CSS animation.
  Respects prefers-reduced-motion: animation stops, static icon shown.

  API:
    size?   ('xs' | 'sm' | 'md' | 'lg' | number | numeric-string) — preset: 12/16/20/32 px;
            or an exact pixel value as a number or numeric string (e.g. :size="14" or size="14").
            Default 'md'.
    label?  (string) — sr-only text for screen readers. Default 'Loading'.
    tone?   ('default' | 'accent' | 'muted') — colour variant. Default 'default'.

  Accessibility:
    - role="status" + aria-live="polite" so screen readers announce the label.
    - Visible icon is aria-hidden; the visually-hidden span carries the meaning.
-->
<template>
  <span
    class="kspinner"
    :class="[`kspinner--${tone}`, isPreset ? `kspinner--${size}` : null]"
    role="status"
    aria-live="polite"
  >
    <!-- Lucide loader-2 inline SVG -->
    <svg
      xmlns="http://www.w3.org/2000/svg"
      :width="px"
      :height="px"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="kspinner__icon"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>

    <!-- Screen-reader label (visually hidden) -->
    <span class="kspinner__sr-label">{{ label }}</span>
  </span>
</template>

<!--
  Module-scope constants exported here are accessible in <script setup> AND
  inside defineProps() validators without triggering Vue's "cannot reference
  locally declared variables" compile error.
-->
<script>
export const SPINNER_PRESETS = ['xs', 'sm', 'md', 'lg'];
export const SPINNER_SIZE_MAP = { xs: 12, sm: 16, md: 20, lg: 32 };
</script>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  /**
   * Icon size.
   *   Preset strings: 'xs' — 12px | 'sm' — 16px | 'md' — 20px | 'lg' — 32px.
   *   Numeric or numeric-string: renders the spinner at exactly that pixel size.
   *   e.g. :size="14" or size="14" → 14px.
   */
  size: {
    type: [String, Number],
    default: 'md',
    validator: (v) => {
      if (typeof v === 'number') return v > 0;
      if (SPINNER_PRESETS.includes(v)) return true;
      const n = Number(v);
      return !Number.isNaN(n) && n > 0;
    },
  },
  /**
   * Screen-reader-only label announced to assistive technology.
   */
  label: {
    type: String,
    default: 'Loading',
  },
  /**
   * Colour tone:
   *   'default' — var(--kdl-text-muted)  (neutral, fits most surfaces)
   *   'accent'  — var(--kdl-accent)      (brand pink, prominent loading state)
   *   'muted'   — var(--kdl-text-hint)   (de-emphasised, inside already-coloured containers)
   */
  tone: {
    type: String,
    default: 'default',
    validator: (v) => ['default', 'accent', 'muted'].includes(v),
  },
});

/** Whether the current size value is a preset string key. */
const isPreset = computed(() => SPINNER_PRESETS.includes(String(props.size)));

/** Resolved pixel size — preset map lookup or direct numeric value. */
const px = computed(() => {
  if (isPreset.value) return SPINNER_SIZE_MAP[props.size];
  return Number(props.size);
});
</script>

<style scoped>
/* ── KSpinner ────────────────────────────────────────────────────────────────
   Inline-flex so it can sit next to text without layout surprises.
   The icon rotates 360° on a 1s linear loop.
   prefers-reduced-motion: animation halted — icon stays visible but static,
   still communicating "loading" to sighted users who cannot tolerate motion.
──────────────────────────────────────────────────────────────────────────── */
.kspinner {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  vertical-align: middle;
}

/* ── Spin animation ──────────────────────────────────────────────────────── */
.kspinner__icon {
  animation: kspinner-rotate 1s linear infinite;
}

@keyframes kspinner-rotate {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .kspinner__icon {
    animation: none;
  }
}

/* ── Tone variants ───────────────────────────────────────────────────────── */
.kspinner--default { color: var(--kdl-text-muted); }
.kspinner--accent  { color: var(--kdl-accent); }
.kspinner--muted   { color: var(--kdl-text-hint); }

/* ── Screen-reader label (visually hidden) ───────────────────────────────── */
.kspinner__sr-label {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
