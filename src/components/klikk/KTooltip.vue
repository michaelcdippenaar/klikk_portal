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

<!--
  No <style scoped> here: TooltipContent (.kt-content) and its TooltipArrow
  (.kt-arrow) are teleported to <body> by TooltipPortal, so a scoped style's
  data-v-<hash> would never match them. The .kt-content surface (z-index,
  background, colour, typography, padding, radius + dark variant), the
  data-state entrance animation + its @keyframes kt-show, the .kt-arrow fill
  (+ dark) and the reduced-motion fallback all live in the global
  src/css/portals.css. The trigger is the consumer's own slotted element.
-->
