<!--
  KToastRegion — global toast stack. Mount ONCE in App.vue.

  Renders all toasts from useToast() singleton in a fixed bottom-right stack.
  Wraps Reka ToastProvider + ToastViewport. Auto-dismisses each toast after
  its duration; sticky on hover (Reka handles this via pausing the timer).

  Conflict note: The $q.notify() stub in main.js is a no-op and does not
  conflict with this component. Phase 2 should replace $q.notify() call sites
  with useToast().success/error/info/warn() calls.
-->
<template>
  <ToastProvider swipe-direction="right">
    <!-- Render each toast from the singleton list -->
    <KToast
      v-for="toast in toasts"
      :key="toast.id"
      :tone="toast.tone"
      :message="toast.message"
      :title="toast.title"
      :duration="toast.duration"
      :open="toast.open"
      @update:open="(v) => !v && dismiss(toast.id)"
      @closed="dismiss(toast.id)"
    />

    <!-- Viewport — fixed bottom-right, stacks with 8px gap -->
    <ToastViewport class="ktr-viewport" aria-label="Notifications" />
  </ToastProvider>
</template>

<script setup>
import { ToastProvider, ToastViewport } from 'reka-ui';
import KToast from './KToast.vue';
import { useToast } from '../../composables/useToast.js';

const { toasts, dismiss } = useToast();
</script>

<style scoped>
/* ── Viewport ─────────────────────────────────────────────────────────────── */
/* z-index is set globally in src/css/portals.css via --kdl-z-toast (ToastProvider → body) */
.ktr-viewport {
  position: fixed;
  bottom: 24px;
  right: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  /* List semantics from Reka */
  list-style: none;
  margin: 0;
  padding: 0;
  outline: none;
}
</style>
