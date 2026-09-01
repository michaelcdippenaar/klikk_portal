<template>
  <header class="app-header">
    <div class="app-header__inner">
      <slot />
    </div>
  </header>
</template>

<script setup>
// AppHeader — sticky token-driven header bar.
// KDL tokens only. No Quasar primitives.
</script>

<style scoped>
.app-header {
  position: sticky;
  top: 0;
  z-index: 200;
  height: var(--app-header-height);
  flex-shrink: 0;
  background: var(--app-header-background, var(--kdl-card-bg));
  border-bottom: var(--kdl-border-width) solid var(--kdl-border-subtle);
  box-shadow: var(--shadow-soft);
}

.app-header__inner {
  display: flex;
  align-items: center;
  height: 100%;
  padding: 0 var(--kdl-space-8);
  gap: var(--kdl-space-2);
}

@media (max-width: 767px) {
  .app-header__inner { padding-inline: var(--kdl-space-4); }
}
</style>
