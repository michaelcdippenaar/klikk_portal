<template>
  <div class="error-404-page">
    <EmptyState
      icon="⚠"
      title="Page not found"
      body="The page you're looking for doesn't exist."
    >
      <template #cta>
        <q-btn
          label="Back to home"
          color="primary"
          dense
          :to="'/'"
        />
      </template>
    </EmptyState>
  </div>
</template>

<script setup>
import EmptyState from '../components/klikk/EmptyState.vue';
</script>

<style scoped>
.error-404-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--kdl-page-bg);
}
</style>
