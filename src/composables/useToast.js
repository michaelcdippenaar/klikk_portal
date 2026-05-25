/**
 * useToast — Klikk Design Language toast composable.
 *
 * Singleton reactive list of toasts. Mount <KToastRegion /> once in App.vue
 * (or your AppShell layout). Then call useToast() anywhere to push toasts.
 *
 * API:
 *   toast.success(message, opts?)
 *   toast.error(message, opts?)
 *   toast.info(message, opts?)
 *   toast.warn(message, opts?)
 *
 * Options (opts):
 *   duration?  (Number)  — auto-dismiss delay in ms (default 4000, 0 = sticky)
 *   title?     (String)  — bold heading (optional; message becomes description)
 *
 * Each variant maps to a StatusPill tone:
 *   success → 'success'
 *   error   → 'error'
 *   info    → 'info'
 *   warn    → 'warning'
 *
 * The $q.notify() stub in main.js is a no-op. Phase 2 will swap call sites to
 * useToast() methods — see Phase 2 migration note in senior dev summary.
 */

import { ref, readonly } from 'vue';

// ── Singleton toast list ─────────────────────────────────────────────────────
const toasts = ref(/** @type {Array<ToastEntry>} */ ([]));
let nextId = 1;

/**
 * @typedef {Object} ToastEntry
 * @property {number}  id
 * @property {'success'|'error'|'info'|'warning'} tone
 * @property {string}  message
 * @property {string|null} title
 * @property {number}  duration   — ms before auto-dismiss (0 = sticky)
 * @property {boolean} open       — Reka open state flag
 */

// ── Internal push helper ─────────────────────────────────────────────────────
function push(tone, message, opts = {}) {
  const id = nextId++;
  const entry = {
    id,
    tone,
    message,
    title: opts.title ?? null,
    duration: opts.duration ?? 4000,
    open: true,
  };
  toasts.value.push(entry);
  return id;
}

// ── Dismiss helper (used by KToastRegion) ────────────────────────────────────
function dismiss(id) {
  const idx = toasts.value.findIndex((t) => t.id === id);
  if (idx !== -1) {
    // Mark closed so Reka can animate out, then remove
    toasts.value[idx].open = false;
    // Hard-remove after the exit animation (200ms)
    setTimeout(() => {
      toasts.value = toasts.value.filter((t) => t.id !== id);
    }, 300);
  }
}

// ── Public composable ────────────────────────────────────────────────────────
export function useToast() {
  return {
    /** Read-only reactive list — consumed by KToastRegion. */
    toasts: readonly(toasts),

    /** Dismiss a toast by id. Called by KToastRegion on close/auto-dismiss. */
    dismiss,

    /** Show a success toast. */
    success(message, opts) { return push('success', message, opts); },

    /** Show an error toast. */
    error(message, opts) { return push('error', message, opts); },

    /** Show an info toast. */
    info(message, opts) { return push('info', message, opts); },

    /** Show a warning toast. */
    warn(message, opts) { return push('warning', message, opts); },
  };
}
