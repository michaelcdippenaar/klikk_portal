<template>
  <!--
    EmptyState — implements the KDL empty-state-split pattern.

    Use TWO instances in filtered list views:
      1. v-if="!items.length && hasActiveFilter" icon="SearchX" title="No matches" → Clear filters CTA
      2. v-else-if="!items.length"               icon="Inbox"   title="No items yet" → primary Add CTA

    Never collapse both cases into one EmptyState with conditional copy.
  -->
  <div class="kdl-empty-state" role="status" :aria-label="title">
    <!-- Icon ring — accepts a string name (Lucide concept) or a slot for a custom component -->
    <div class="kdl-empty-state__ring" aria-hidden="true">
      <slot name="icon">
        <!-- Default: render a named icon via a simple SVG stub for common cases.
             For full Lucide usage, pass the component in the icon slot. -->
        <span class="kdl-empty-state__icon-text">{{ icon || '○' }}</span>
      </slot>
    </div>

    <h3 class="kdl-empty-state__title">{{ title }}</h3>

    <p v-if="body" class="kdl-empty-state__body">{{ body }}</p>

    <!-- CTA slot — e.g. <button class="btn-primary"> or <button class="btn-ghost btn-sm"> -->
    <div v-if="$slots.cta" class="kdl-empty-state__cta">
      <slot name="cta" />
    </div>
  </div>
</template>

<script setup>
defineProps({
  /**
   * Icon identifier — passed as a string label when not using the icon slot.
   * Prefer the icon slot for actual Lucide components.
   */
  icon: {
    type: String,
    default: null,
  },
  /** Required — the empty state headline. */
  title: {
    type: String,
    required: true,
  },
  /** Optional body / description text. */
  body: {
    type: String,
    default: null,
  },
  // cta slot — handled via $slots.cta above.
});
</script>

<style scoped>
/* EmptyState — Geist 14px scale (CDO Fix #1) */
.kdl-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 40px 24px;
  gap: 10px;
}

.kdl-empty-state__ring {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(43, 45, 110, 0.08);
  color: rgba(43, 45, 110, 0.4);
  margin-bottom: 4px;
  font-size: 20px;
}

:root[data-theme="dark"] .kdl-empty-state__ring {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.3);
}

.kdl-empty-state__icon-text {
  font-size: 20px;
  line-height: 1;
}

.kdl-empty-state__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--kdl-text-primary);
  margin: 0;
}

.kdl-empty-state__body {
  font-size: 14px;
  color: var(--kdl-text-muted);
  max-width: 320px;
  margin: 0;
}

.kdl-empty-state__cta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
}
</style>
