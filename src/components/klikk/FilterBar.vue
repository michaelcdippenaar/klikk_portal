<template>
  <!--
    FilterBar — slot-based quiet utility strip.
    KDL rule: visual demotion vs. data. This is NOT a card; it's a lightweight
    toolbar that sits between PageHeader and the main content card.
    On narrow viewports (< 640px) it collapses into a disclosure toggle.
  -->
  <div class="kdl-filter-bar">
    <!-- Narrow: disclosure toggle -->
    <button
      v-if="isNarrow"
      class="kdl-filter-bar__toggle"
      :aria-expanded="open"
      aria-controls="kdl-filter-bar-panel"
      @click="open = !open"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
      </svg>
      Filters
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        :style="{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>

    <!-- Filter panel — always visible on wide, toggled on narrow -->
    <div
      v-show="!isNarrow || open"
      id="kdl-filter-bar-panel"
      class="kdl-filter-bar__panel"
    >
      <slot />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';

const open = ref(false);
const isNarrow = ref(false);

function checkWidth() {
  isNarrow.value = window.innerWidth < 640;
  // Reset open state when widening back past breakpoint
  if (!isNarrow.value) open.value = false;
}

onMounted(() => {
  checkWidth();
  window.addEventListener('resize', checkWidth);
});

onUnmounted(() => {
  window.removeEventListener('resize', checkWidth);
});
</script>

<style scoped>
.kdl-filter-bar {
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* The toggle button is only visible on narrow viewports (controlled by isNarrow ref) */
.kdl-filter-bar__toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid var(--kdl-border);
  background: var(--kdl-card-bg);
  color: var(--kdl-text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  align-self: flex-start;
  transition: background-color 150ms cubic-bezier(0.2, 0, 0, 1);
}

.kdl-filter-bar__toggle:hover {
  background: var(--kdl-hover-bg);
}

.kdl-filter-bar__panel {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 0;
  /* Quiet utility strip — no card, no shadow, no border */
}
</style>
