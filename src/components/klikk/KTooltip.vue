<!--
  KTooltip — Klikk Design Language tooltip primitive.

  Wraps Reka UI TooltipProvider + TooltipRoot + TooltipTrigger + TooltipContent.
  Reka handles: show/hide on hover & focus, ARIA (role="tooltip"), portal mounting.

  NOTE: This component self-contains a TooltipProvider so it works standalone.
  If you mount many tooltips, consider wrapping your app root with a single
  <TooltipProvider> and removing the one here to share delay state.

  API:
    text    (String, required) — tooltip label
    side?   ('top'|'right'|'bottom'|'left') — preferred side (default 'top')
    delay?  (Number) — show delay in ms (default 400)

  Slots: default — the trigger element (must be a focusable element for keyboard access)

  Usage:
    <KTooltip text="Export to CSV">
      <button class="btn-ghost btn-sm">Export</button>
    </KTooltip>
-->
<template>
  <TooltipProvider :delay-duration="delay">
    <TooltipRoot>
      <TooltipTrigger as-child>
        <slot />
      </TooltipTrigger>

      <TooltipPortal>
        <TooltipContent
          class="kt-content"
          :side="side"
          :side-offset="6"
        >
          {{ text }}
          <TooltipArrow class="kt-arrow" />
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>

<script setup>
import {
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  TooltipPortal,
  TooltipContent,
  TooltipArrow,
} from 'reka-ui';

defineProps({
  /** The text content of the tooltip. */
  text: {
    type: String,
    required: true,
  },
  /** Preferred side. Reka flips automatically if there's not enough room. */
  side: {
    type: String,
    default: 'top',
    validator: (v) => ['top', 'right', 'bottom', 'left'].includes(v),
  },
  /** Hover delay in milliseconds before the tooltip appears. */
  delay: {
    type: Number,
    default: 400,
  },
});
</script>

<style scoped>
/* ── Tooltip content ─────────────────────────────────────────────────────── */
/* z-index is set globally in src/css/portals.css via --kdl-z-tooltip (teleported to body) */
.kt-content {
  /* Distinct tooltip surface: dark in light mode, slightly lighter in dark */
  background: var(--kdl-text-secondary);
  color: var(--kdl-card-bg);
  font-size: 11px;
  line-height: 1.4;
  font-weight: 500;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid transparent;
  max-width: 240px;
  /* Reka provides data-state for animation targeting */
}

:root[data-theme="dark"] .kt-content {
  /* In dark mode: lighter surface that stands out from the dark card bg */
  background: var(--kdl-text-hint);
  color: var(--kdl-text-primary);
  border-color: var(--kdl-border);
}

/* Reka adds data-state="delayed-open" / "instant-open" / "closed" */
.kt-content[data-state="delayed-open"],
.kt-content[data-state="instant-open"] {
  animation: kt-show var(--duration-short) var(--ease-enter);
}

@keyframes kt-show {
  from {
    opacity: 0;
    transform: scale(0.94);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* ── Arrow ────────────────────────────────────────────────────────────────── */
.kt-arrow {
  fill: var(--kdl-text-secondary);
}

:root[data-theme="dark"] .kt-arrow {
  fill: var(--kdl-text-hint);
}

/* ── Reduced motion ──────────────────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .kt-content[data-state="delayed-open"],
  .kt-content[data-state="instant-open"] {
    animation-duration: 0.01ms !important;
  }
}
</style>
