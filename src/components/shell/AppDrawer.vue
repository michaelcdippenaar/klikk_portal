<template>
  <!-- Desktop: always-visible sidebar. Mobile: slide-over panel + backdrop. -->
  <template v-if="isDesktop">
    <aside class="app-drawer app-drawer--desktop">
      <slot />
    </aside>
  </template>

  <template v-else>
    <!-- Backdrop -->
    <transition name="app-drawer-backdrop">
      <div
        v-if="modelValue"
        class="app-drawer-backdrop"
        aria-hidden="true"
        @click="close"
      />
    </transition>

    <!-- Slide-over panel -->
    <transition name="app-drawer-slide">
      <aside
        v-if="modelValue"
        class="app-drawer app-drawer--mobile"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
      >
        <slot />
      </aside>
    </transition>
  </template>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['update:modelValue']);

// ── Breakpoint watcher ──────────────────────────────────────────────────────
const DESKTOP_BP = 1024;
const isDesktop = ref(false);

let mq = null;

function handleBreakpoint(e) {
  isDesktop.value = e.matches;
}

onMounted(() => {
  mq = window.matchMedia(`(min-width: ${DESKTOP_BP}px)`);
  isDesktop.value = mq.matches;
  mq.addEventListener('change', handleBreakpoint);

  // Close on Escape
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  mq?.removeEventListener('change', handleBreakpoint);
  window.removeEventListener('keydown', handleKeydown);
});

function close() {
  emit('update:modelValue', false);
}

function handleKeydown(e) {
  if (e.key === 'Escape' && props.modelValue) {
    close();
  }
}
</script>

<style scoped>
/* ── Shared drawer chrome ──────────────────────────────────────────────────── */
.app-drawer {
  width: 240px;
  flex-shrink: 0;
  background: var(--kdl-card-bg);
  border-right: 1px solid var(--kdl-border-subtle);
  overflow-y: auto;
  overflow-x: hidden;
}

/* ── Desktop: sticky beside main content ───────────────────────────────────── */
.app-drawer--desktop {
  position: sticky;
  top: 44px; /* height of AppHeader */
  height: calc(100vh - 44px);
  align-self: flex-start;
}

/* ── Mobile: fixed overlay sliding from the left ──────────────────────────── */
.app-drawer--mobile {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  z-index: 300;
  box-shadow: var(--shadow-floating);
}

/* ── Backdrop ─────────────────────────────────────────────────────────────── */
.app-drawer-backdrop {
  position: fixed;
  inset: 0;
  z-index: 299;
  background: rgba(0, 0, 0, 0.4);
}

/* ── Transitions ──────────────────────────────────────────────────────────── */
.app-drawer-backdrop-enter-active,
.app-drawer-backdrop-leave-active {
  transition: opacity var(--duration-medium) var(--ease-standard);
}
.app-drawer-backdrop-enter-from,
.app-drawer-backdrop-leave-to {
  opacity: 0;
}

.app-drawer-slide-enter-active,
.app-drawer-slide-leave-active {
  transition: transform var(--duration-medium) var(--ease-enter);
}
.app-drawer-slide-enter-from,
.app-drawer-slide-leave-to {
  transform: translateX(-100%);
}
</style>
