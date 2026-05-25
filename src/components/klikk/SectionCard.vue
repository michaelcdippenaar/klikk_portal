<template>
  <!-- Single-level card. Never nest SectionCard inside SectionCard. -->
  <section class="card overflow-hidden">
    <!-- Header row — rendered only when title, description, or actions slot is present -->
    <header
      v-if="title || description || $slots.actions"
      class="kdl-section-card__header"
    >
      <div class="kdl-section-card__meta">
        <h2 v-if="title" class="section-header">{{ title }}</h2>
        <p v-if="description" class="page-description" style="margin-top: 2px;">{{ description }}</p>
      </div>

      <div v-if="$slots.actions" class="kdl-section-card__actions">
        <slot name="actions" />
      </div>
    </header>

    <!-- Body -->
    <div class="kdl-section-card__body">
      <slot />
    </div>
  </section>
</template>

<script setup>
defineProps({
  /** Section heading rendered in the card header. */
  title: {
    type: String,
    default: null,
  },
  /** Optional description / subtitle below the title. */
  description: {
    type: String,
    default: null,
  },
  // actions slot — slot-based, handled via $slots.actions above.
});
</script>

<style scoped>
/* SectionCard — finance-admin density pass */
.kdl-section-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--kdl-border-subtle);
}

.kdl-section-card__meta {
  flex: 1 1 0;
  min-width: 0;
}

.kdl-section-card__actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.kdl-section-card__body {
  padding: 14px;
}
</style>
