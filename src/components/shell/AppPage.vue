<template>
  <main class="app-page">
    <slot />
  </main>
</template>

<script setup>
// AppPage — main content wrapper replacing q-page.
// KDL tokens only. No Quasar primitives.
</script>

<style scoped>
.app-page {
  flex: 1;
  min-width: 0;
  min-height: 0;
  background: var(--kdl-page-bg);
  overflow-y: auto;
  padding: 24px; /* p-6 */
}

@media (max-width: 1023px) {
  .app-page {
    padding: 16px; /* p-4 */
  }
}
</style>
