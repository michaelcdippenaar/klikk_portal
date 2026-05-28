<!--
  KCommandPalette — ⌘K command palette for the Klikk Financials Portal.

  Teleported to <body>. Self-contained; does not depend on Quasar dialogs.
  Opened/closed via useCommandPalette(). Keyboard-fully navigable.

  ARIA: role="dialog", aria-modal="true", focus-trapped while open,
  returns focus to previously-focused element on close.
-->
<template>
  <Teleport to="body">
    <Transition name="kcp-fade">
      <div
        v-if="isOpen"
        class="kcp-backdrop"
        aria-hidden="true"
        @click.self="close"
      />
    </Transition>

    <Transition name="kcp-slide">
      <div
        v-if="isOpen"
        ref="dialogRef"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        class="kcp-dialog"
        @keydown="onDialogKeydown"
      >
        <!-- Search row -->
        <div class="kcp-search-row">
          <!-- Lucide search icon -->
          <svg
            class="kcp-search-icon"
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>

          <input
            ref="searchRef"
            v-model="query"
            class="kcp-search-input"
            type="search"
            placeholder="Type a command or search…"
            autocomplete="off"
            spellcheck="false"
            aria-autocomplete="list"
            :aria-activedescendant="highlightedId || undefined"
            @keydown.up.prevent="moveHighlight(-1)"
            @keydown.down.prevent="moveHighlight(1)"
            @keydown.enter.prevent="executeHighlighted"
            @keydown.esc.prevent="close"
            @keydown.tab.prevent="moveHighlight(1)"
          />

          <span class="kcp-esc-hint" aria-hidden="true">ESC</span>
        </div>

        <!-- Divider -->
        <div class="kcp-divider" />

        <!-- Results -->
        <div
          class="kcp-results"
          role="listbox"
          aria-label="Commands"
        >
          <template v-if="groupedResults.length > 0">
            <div
              v-for="group in groupedResults"
              :key="group.category"
              class="kcp-group"
            >
              <div class="kcp-group-label" aria-hidden="true">{{ group.category }}</div>

              <button
                v-for="cmd in group.commands"
                :id="`kcp-item-${cmd.id}`"
                :key="cmd.id"
                role="option"
                class="kcp-item"
                :class="{ 'kcp-item--active': highlightedId === `kcp-item-${cmd.id}` }"
                :aria-selected="highlightedId === `kcp-item-${cmd.id}`"
                @mouseenter="highlightedId = `kcp-item-${cmd.id}`"
                @click="execute(cmd)"
              >
                <!-- Optional Lucide icon -->
                <span
                  v-if="cmd.icon && getIconSvg(cmd.icon)"
                  class="kcp-item-icon"
                  aria-hidden="true"
                  v-html="getIconSvg(cmd.icon)"
                />

                <span class="kcp-item-label">{{ cmd.label }}</span>

                <!-- Shortcut chips -->
                <span v-if="cmd.shortcut?.length" class="kcp-item-shortcut" aria-hidden="true">
                  <kbd v-for="key in cmd.shortcut" :key="key" class="kcp-kbd">{{ key }}</kbd>
                </span>
              </button>
            </div>
          </template>

          <!-- Empty state -->
          <div v-else class="kcp-empty">
            No commands match
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick, onUnmounted } from 'vue';
import { useCommandPalette } from '../../composables/useCommandPalette';

const { isOpen, commands, close } = useCommandPalette();

// ── Refs ─────────────────────────────────────────────────────────────────────
const dialogRef = ref(null);
const searchRef = ref(null);
const query = ref('');
const highlightedId = ref('');

// Track previously focused element so we can restore it on close.
let previouslyFocused = null;

// ── Search / filtering ────────────────────────────────────────────────────────
/**
 * Simple substring fuzzy: returns { rank, cmd } pairs.
 * rank 0 = label starts with query (best), 1 = label contains, 2 = keyword match.
 */
function scoreCommand(cmd, q) {
  const label = cmd.label.toLowerCase();
  const keywords = (cmd.keywords || []).map((k) => k.toLowerCase());
  const needle = q.toLowerCase().trim();

  if (label.startsWith(needle)) return 0;
  if (label.includes(needle)) return 1;
  if (keywords.some((k) => k.includes(needle))) return 2;
  return -1;
}

const filteredCommands = computed(() => {
  const q = query.value.trim();
  if (!q) return commands.value.slice();

  return commands.value
    .map((cmd) => ({ cmd, rank: scoreCommand(cmd, q) }))
    .filter(({ rank }) => rank !== -1)
    .sort((a, b) => a.rank - b.rank || a.cmd.label.localeCompare(b.cmd.label))
    .map(({ cmd }) => cmd);
});

/** Group filtered commands by category, preserving order of first appearance. */
const groupedResults = computed(() => {
  const map = new Map();
  for (const cmd of filteredCommands.value) {
    if (!map.has(cmd.category)) map.set(cmd.category, []);
    map.get(cmd.category).push(cmd);
  }
  return Array.from(map.entries()).map(([category, cmds]) => ({
    category,
    commands: cmds,
  }));
});

/** Flat ordered list of all item DOM ids, for keyboard navigation. */
const flatItemIds = computed(() =>
  filteredCommands.value.map((cmd) => `kcp-item-${cmd.id}`)
);

// ── Keyboard navigation ───────────────────────────────────────────────────────
function moveHighlight(delta) {
  const ids = flatItemIds.value;
  if (!ids.length) return;

  const current = ids.indexOf(highlightedId.value);
  let next;
  if (current === -1) {
    next = delta > 0 ? 0 : ids.length - 1;
  } else {
    next = (current + delta + ids.length) % ids.length;
  }
  highlightedId.value = ids[next];
  scrollHighlightedIntoView();
}

function scrollHighlightedIntoView() {
  nextTick(() => {
    const el = dialogRef.value?.querySelector(`#${highlightedId.value}`);
    el?.scrollIntoView({ block: 'nearest' });
  });
}

function executeHighlighted() {
  if (!highlightedId.value) {
    if (flatItemIds.value.length) {
      highlightedId.value = flatItemIds.value[0];
    }
    return;
  }
  const id = highlightedId.value.replace('kcp-item-', '');
  const cmd = commands.value.find((c) => c.id === id);
  if (cmd) execute(cmd);
}

function execute(cmd) {
  close();
  // Let the palette close animation run before executing so router navigations
  // don't fight the exit transition.
  setTimeout(() => {
    try {
      cmd.perform();
    } catch (e) {
      console.error('[KCommandPalette] command failed:', e);
    }
  }, 30);
}

// ── Dialog keydown (for Esc, which the input also handles via @keydown.esc) ──
function onDialogKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    close();
  }
}

// ── Focus management ──────────────────────────────────────────────────────────
watch(isOpen, async (opened) => {
  if (opened) {
    previouslyFocused = document.activeElement;
    query.value = '';
    highlightedId.value = flatItemIds.value[0] || '';
    await nextTick();
    searchRef.value?.focus();
    trapFocus();
  } else {
    releaseTrap();
    await nextTick();
    if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
      previouslyFocused.focus();
    }
    previouslyFocused = null;
  }
});

// When the query changes, re-highlight the first result.
watch(query, () => {
  nextTick(() => {
    highlightedId.value = flatItemIds.value[0] || '';
  });
});

// ── Focus trap ────────────────────────────────────────────────────────────────
let trapHandler = null;

function getFocusableEls() {
  if (!dialogRef.value) return [];
  return Array.from(
    dialogRef.value.querySelectorAll(
      'input, button, [tabindex]:not([tabindex="-1"])'
    )
  ).filter((el) => !el.disabled && el.offsetParent !== null);
}

function trapFocus() {
  trapHandler = (event) => {
    if (event.key !== 'Tab') return;
    const focusable = getFocusableEls();
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey) {
      if (document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };
  window.addEventListener('keydown', trapHandler, true);
}

function releaseTrap() {
  if (trapHandler) {
    window.removeEventListener('keydown', trapHandler, true);
    trapHandler = null;
  }
}

onUnmounted(() => {
  releaseTrap();
});

// ── Icon resolution ───────────────────────────────────────────────────────────
// Returns a full inline SVG string for v-html. Covers the initial command set.
// Add entries here as new icon names are introduced via register().
const ICON_INNER = {
  home: `<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>`,
  'refresh-cw': `<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>`,
  settings: `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>`,
  database: `<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>`,
  'bar-chart-2': `<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>`,
  users: `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`,
  sun: `<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>`,
  moon: `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`,
  'log-out': `<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>`,
  bot: `<rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/>`,
  play: `<polygon points="5 3 19 12 5 21 5 3"/>`,
  'trending-up': `<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>`,
  'git-branch': `<line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>`,
  layers: `<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>`,
};

const SVG_WRAP_OPEN = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">`;
const SVG_WRAP_CLOSE = `</svg>`;

function getIconSvg(name) {
  const inner = ICON_INNER[name];
  if (!inner) return null;
  return SVG_WRAP_OPEN + inner + SVG_WRAP_CLOSE;
}
</script>

<style scoped>
/* ── Backdrop ─────────────────────────────────────────────────────────────── */
/* z-index is set globally in src/css/portals.css via --kdl-z-command-palette (Teleport to body) */
.kcp-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
}

:root[data-theme="dark"] .kcp-backdrop {
  background: rgba(0, 0, 0, 0.6);
}

/* ── Dialog ───────────────────────────────────────────────────────────────── */
/* z-index is set globally in src/css/portals.css via --kdl-z-command-palette + 1 (Teleport to body) */
.kcp-dialog {
  position: fixed;
  top: 15vh;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 640px;
  border-radius: 12px;
  background: var(--kdl-card-bg);
  border: 1px solid var(--kdl-border);
  box-shadow:
    0 24px 48px -12px rgba(0, 0, 0, 0.18),
    0 0 0 1px var(--kdl-border);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

:root[data-theme="dark"] .kcp-dialog {
  box-shadow:
    0 24px 64px -12px rgba(0, 0, 0, 0.6),
    0 0 0 1px var(--kdl-border);
}

/* ── Search row ───────────────────────────────────────────────────────────── */
.kcp-search-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  height: 48px;
  flex-shrink: 0;
}

.kcp-search-icon {
  flex-shrink: 0;
  color: var(--kdl-text-muted);
}

.kcp-search-input {
  flex: 1 1 0;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-family: inherit;
  font-size: 16px;
  font-weight: 400;
  line-height: 1.45;
  color: var(--kdl-text-primary);
  /* Remove browser default search-input decorations */
  -webkit-appearance: none;
  appearance: none;
}

.kcp-search-input::placeholder {
  color: var(--kdl-text-hint);
}

/* Remove the native "x" clear button on search inputs */
.kcp-search-input::-webkit-search-cancel-button {
  display: none;
}

.kcp-esc-hint {
  flex-shrink: 0;
  font-family: inherit;
  font-size: 11px;
  font-weight: 500;
  color: var(--kdl-text-hint);
  background: var(--kdl-hover-bg);
  border: 1px solid var(--kdl-border);
  border-radius: 4px;
  padding: 2px 5px;
  line-height: 1.4;
  user-select: none;
}

/* ── Divider ──────────────────────────────────────────────────────────────── */
.kcp-divider {
  height: 1px;
  background: var(--kdl-border-subtle);
  flex-shrink: 0;
}

/* ── Results container ────────────────────────────────────────────────────── */
.kcp-results {
  overflow-y: auto;
  max-height: min(420px, 60vh);
  padding: 6px 0;
  scroll-padding-block: 6px;
}

/* ── Category group ───────────────────────────────────────────────────────── */
.kcp-group {
  margin-bottom: 2px;
}

.kcp-group-label {
  /* Overline exception: 11px uppercase — as per spec */
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--kdl-text-hint);
  padding: 8px 16px 4px;
  user-select: none;
}

/* ── Command item ─────────────────────────────────────────────────────────── */
.kcp-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 0 16px;
  height: 36px;
  border: none;
  background: transparent;
  font-family: inherit;
  font-size: 14px;
  font-weight: 400;
  color: var(--kdl-text-secondary);
  text-align: left;
  cursor: pointer;
  transition: background var(--duration-short) var(--ease-standard),
              color var(--duration-short) var(--ease-standard);
}

.kcp-item--active {
  background: color-mix(in srgb, var(--kdl-accent) 10%, transparent);
  color: var(--kdl-accent);
}

.kcp-item-icon {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  color: inherit;
}

.kcp-item-label {
  flex: 1 1 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Shortcut chips ───────────────────────────────────────────────────────── */
.kcp-item-shortcut {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  margin-left: auto;
}

.kcp-kbd {
  font-family: inherit;
  font-size: 11px;
  font-weight: 500;
  color: var(--kdl-text-hint);
  background: var(--kdl-hover-bg);
  border: 1px solid var(--kdl-border);
  border-radius: 4px;
  padding: 1px 4px;
  line-height: 1.5;
}

/* ── Empty state ──────────────────────────────────────────────────────────── */
.kcp-empty {
  font-size: 13px;
  color: var(--kdl-text-muted);
  text-align: center;
  padding: 24px 16px;
}

/* ── Transitions ──────────────────────────────────────────────────────────── */
.kcp-fade-enter-active,
.kcp-fade-leave-active {
  transition: opacity var(--duration-medium) var(--ease-standard);
}
.kcp-fade-enter-from,
.kcp-fade-leave-to {
  opacity: 0;
}

.kcp-slide-enter-active,
.kcp-slide-leave-active {
  transition:
    opacity var(--duration-medium) var(--ease-standard),
    transform var(--duration-medium) var(--ease-enter);
}
.kcp-slide-enter-from,
.kcp-slide-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-8px) scale(0.97);
}

/* ── Mobile fallback ──────────────────────────────────────────────────────── */
@media (max-width: 680px) {
  .kcp-dialog {
    top: 0;
    left: 0;
    right: 0;
    transform: none;
    max-width: 100%;
    border-radius: 0 0 12px 12px;
  }

  .kcp-slide-enter-from,
  .kcp-slide-leave-to {
    transform: translateY(-8px) scale(0.98);
  }
}

/* ── Reduced motion ───────────────────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .kcp-fade-enter-active,
  .kcp-fade-leave-active,
  .kcp-slide-enter-active,
  .kcp-slide-leave-active {
    transition-duration: 0.01ms !important;
  }
}
</style>
