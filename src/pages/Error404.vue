<template>
  <!-- AppPage intentionally omitted: Error404 is a full-screen centred error page outside the normal layout. -->
  <div class="error-404-page">
    <EmptyState
      title="Page not found"
      body="The page you're looking for doesn't exist."
    >
      <template #icon>
        <!-- Lucide alert-triangle -->
        <svg
          xmlns="http://www.w3.org/2000/svg" width="24" height="24"
          viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      </template>
      <template #cta>
        <RouterLink to="/" class="btn-primary btn-sm">Back to home</RouterLink>
      </template>
    </EmptyState>
  </div>
</template>

<script setup>
import { RouterLink } from 'vue-router';
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
