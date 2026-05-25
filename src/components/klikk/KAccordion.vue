<!--
  KAccordion — Klikk Design Language accordion / disclosure primitive.

  Wraps Reka UI AccordionRoot + AccordionItem + AccordionTrigger + AccordionContent.
  Reka handles: keyboard navigation (Arrow keys, Home, End), ARIA (aria-expanded,
  aria-controls, aria-labelledby), animated open/close.

  API (single-item, collapsible):
    modelValue?  (String | null)  — v-model: open item value (default null = closed)
    value?       (String)         — item value key (default 'item')
    collapsible? (Boolean)        — allow closing the open item (default true)
    type?        ('single'|'multiple') — accordion mode (default 'single')

  Slots:
    trigger     — header content shown inside the trigger button
    default     — body content revealed when open

  Usage:
    <KAccordion v-model="open" value="advanced">
      <template #trigger>Advanced options</template>
      <p>Body content here</p>
    </KAccordion>
-->
<template>
  <AccordionRoot
    class="kaccordion"
    :type="type"
    :collapsible="collapsible"
    :model-value="modelValue ?? undefined"
    @update:model-value="$emit('update:modelValue', $event ?? null)"
  >
    <AccordionItem :value="value" class="kaccordion__item">
      <AccordionHeader class="kaccordion__header">
        <AccordionTrigger class="kaccordion__trigger">
          <!-- Rotating chevron -->
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14" height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="kaccordion__chevron"
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
          <slot name="trigger" />
        </AccordionTrigger>
      </AccordionHeader>

      <AccordionContent class="kaccordion__content">
        <div class="kaccordion__body">
          <slot />
        </div>
      </AccordionContent>
    </AccordionItem>
  </AccordionRoot>
</template>

<script setup>
import {
  AccordionRoot,
  AccordionItem,
  AccordionHeader,
  AccordionTrigger,
  AccordionContent,
} from 'reka-ui';

defineProps({
  /** v-model — the currently open item value (null = all closed). */
  modelValue: { type: String, default: null },
  /** The value key for this accordion item. */
  value: { type: String, default: 'item' },
  /** Whether the open item can be toggled closed again. */
  collapsible: { type: Boolean, default: true },
  /** Accordion mode: 'single' or 'multiple'. */
  type: {
    type: String,
    default: 'single',
    validator: (v) => ['single', 'multiple'].includes(v),
  },
});

defineEmits(['update:modelValue']);
</script>

<style scoped>
.kaccordion {
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 8px;
  overflow: hidden;
}

.kaccordion__item {
  /* no extra border needed — root has border */
}

/* ── Trigger (header button) ────────────────────────────────────────────── */
.kaccordion__trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 12px 16px;
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: var(--kdl-text-secondary);
  text-align: left;
  transition: background 120ms;
}

.kaccordion__trigger:hover {
  background: var(--kdl-hover-bg);
}

.kaccordion__trigger:focus-visible {
  outline: 2px solid var(--kdl-accent);
  outline-offset: -2px;
}

/* ── Chevron rotation ────────────────────────────────────────────────────── */
.kaccordion__chevron {
  color: var(--kdl-text-muted);
  transition: transform 180ms var(--ease-standard, ease);
  flex-shrink: 0;
}

/* Reka sets data-state="open" on the trigger when open */
.kaccordion__trigger[data-state="open"] .kaccordion__chevron {
  transform: rotate(180deg);
}

/* ── Content ─────────────────────────────────────────────────────────────── */
.kaccordion__content {
  overflow: hidden;
}

/* Reka provides --reka-accordion-content-height for animation */
.kaccordion__content[data-state="open"] {
  animation: kaccordion-slide-down 180ms var(--ease-standard, ease);
}

.kaccordion__content[data-state="closed"] {
  animation: kaccordion-slide-up 180ms var(--ease-standard, ease);
}

@keyframes kaccordion-slide-down {
  from { height: 0; }
  to   { height: var(--reka-accordion-content-height); }
}

@keyframes kaccordion-slide-up {
  from { height: var(--reka-accordion-content-height); }
  to   { height: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .kaccordion__content[data-state="open"],
  .kaccordion__content[data-state="closed"] {
    animation: none;
  }
}

.kaccordion__body {
  padding: 16px;
  border-top: 1px solid var(--kdl-border-subtle);
}

/* ── Hairline divider between items (multi-item variant) ─────────────────── */
.kaccordion__item + .kaccordion__item {
  border-top: 1px solid var(--kdl-border-subtle);
}
</style>
