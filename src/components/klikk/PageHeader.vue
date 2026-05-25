<template>
  <div class="kdl-page-header">
    <!-- Breadcrumbs row -->
    <div v-if="$slots.breadcrumbs" class="kdl-page-header__crumbs">
      <slot name="breadcrumbs" />
    </div>

    <!-- Main header row -->
    <div class="kdl-page-header__row">
      <div class="kdl-page-header__identity">
        <!-- Tenant context (e.g. tenant badge / switcher) -->
        <div v-if="$slots.tenantContext" class="kdl-page-header__tenant">
          <slot name="tenantContext" />
        </div>

        <h1 class="page-title">{{ title }}</h1>
        <p v-if="subtitle" class="page-description">{{ subtitle }}</p>
      </div>

      <!-- Actions slot (buttons, menus, etc.) -->
      <div v-if="$slots.actions" class="kdl-page-header__actions">
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  /** Page title — displayed as the H1. Required. */
  title: {
    type: String,
    required: true,
  },
  /** Optional subtitle / description below the title. */
  subtitle: {
    type: String,
    default: null,
  },
});

// actions slot, breadcrumbs slot, tenantContext slot — handled via $slots checks above.
</script>

<style scoped>
/* PageHeader — Geist 14px scale (CDO Fix #1) */
.kdl-page-header {
  padding-bottom: 24px;
  border-bottom: 1px solid var(--kdl-border-subtle);
  margin-bottom: 24px;
}

.kdl-page-header__crumbs {
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.kdl-page-header__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.kdl-page-header__identity {
  flex: 1 1 0;
  min-width: 0;
}

.kdl-page-header__tenant {
  margin-bottom: 3px;
}

.kdl-page-header__actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
</style>
