<template>
  <div class="app-shell">
    <!-- Header row — always pinned at the top via sticky in AppHeader -->
    <slot name="header" />

    <!-- Body row: drawer + page content side by side -->
    <div class="app-shell__body">
      <slot name="drawer" />

      <div class="app-shell__main">
        <slot />
      </div>
    </div>

    <!-- Optional footer -->
    <slot name="footer" />
  </div>
</template>

<script setup>
// AppShell — top-level layout replacing q-layout.
// Provides header, drawer, default (page content), and footer slots.
// CSS grid: header pinned top, drawer left, main right.
// KDL tokens only. No Quasar primitives.
</script>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--kdl-page-bg);
}

/* Body: everything below the header — drawer + page content side by side */
.app-shell__body {
  display: flex;
  flex: 1;
  min-height: 0;
  /* The sticky AppHeader is 44px; this body fills the rest. */
  /* Drawer children use position: sticky / fixed to position themselves. */
}

/* Page content area — fills remaining width */
.app-shell__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
</style>
