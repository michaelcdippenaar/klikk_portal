<template>
  <header class="app-header">
    <div class="app-header__inner">
      <slot />
    </div>
  </header>
</template>

<script setup>
// AppHeader — sticky 44px header bar.
// KDL tokens only. No Quasar primitives.
</script>

<style scoped>
.app-header {
  position: sticky;
  top: 0;
  z-index: 200;
  height: 44px;
  flex-shrink: 0;
  background: var(--kdl-card-bg);
  border-bottom: 1px solid var(--kdl-border-subtle);
  box-shadow: var(--shadow-soft);
}

.app-header__inner {
  display: flex;
  align-items: center;
  height: 100%;
  padding: 0 16px;
  gap: 2px;
}
</style>
