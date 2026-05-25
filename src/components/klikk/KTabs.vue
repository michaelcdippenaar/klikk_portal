<!--
  KTabs — Klikk Design Language tabs primitive (finance-admin variant).

  Replaces: q-tabs with Material animated underline indicator.
  Reason: Material's ink-bar animation and font-weight inconsistency break
  the KDL tab contract. KTabs uses a static active state with no animation.

  Visual variants (prop `variant`):
    'pills'     — default for finance-admin surfaces. Filled pill active state.
    'underline' — for surfaces that need a more document-like feel. Use sparingly.

  URL sync: when urlSync=true (default), reads and writes ?tab=<slug> on the route.
  Falls back to v-model only when urlSync=false or Vue Router is unavailable.

  USAGE — pills with URL sync (standard finance-admin):
    <KTabs
      :tabs="[
        { name: 'overview', label: 'Overview' },
        { name: 'journals', label: 'Journals' },
        { name: 'payments', label: 'Payments' },
      ]"
      v-model="activeTab"
    />

  USAGE — underline variant:
    <KTabs variant="underline" :tabs="tabs" v-model="activeTab" />

  USAGE — URL sync disabled (local state only):
    <KTabs :tabs="tabs" v-model="activeTab" :url-sync="false" />

  USAGE — with icons (pass Lucide SVG paths as the icon slot via render or inline):
    <KTabs
      :tabs="[
        { name: 'summary', label: 'Summary', icon: 'layout-dashboard' },
        { name: 'detail',  label: 'Detail',  icon: 'list' },
      ]"
      v-model="activeTab"
    />

  Note: icon rendering uses an inline SVG map for the most common finance-admin
  concepts. For arbitrary Lucide icons, pass a scoped slot or use a wrapper component.
-->
<template>
  <div
    class="ktabs"
    :class="`ktabs--${variant}`"
    role="tablist"
    :aria-label="ariaLabel || 'Page sections'"
  >
    <button
      v-for="tab in tabs"
      :key="tab.name"
      class="ktabs__item"
      :class="{ 'ktabs__item--active': activeTab === tab.name }"
      role="tab"
      :aria-selected="activeTab === tab.name"
      :tabindex="activeTab === tab.name ? 0 : -1"
      type="button"
      @click="selectTab(tab.name)"
      @keydown.right="focusNext"
      @keydown.left="focusPrev"
    >
      <!-- Optional icon — renders if tab.icon is a recognized token -->
      <span v-if="tab.icon" class="ktabs__icon" aria-hidden="true">
        <!-- Layout-dashboard -->
        <svg
          v-if="tab.icon === 'layout-dashboard'"
          xmlns="http://www.w3.org/2000/svg" width="13" height="13"
          viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
        >
          <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
        </svg>
        <!-- List -->
        <svg
          v-else-if="tab.icon === 'list'"
          xmlns="http://www.w3.org/2000/svg" width="13" height="13"
          viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
        >
          <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" />
          <line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
        <!-- Bar-chart -->
        <svg
          v-else-if="tab.icon === 'bar-chart'"
          xmlns="http://www.w3.org/2000/svg" width="13" height="13"
          viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
        >
          <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" /><line x1="2" y1="20" x2="22" y2="20" />
        </svg>
        <!-- Settings -->
        <svg
          v-else-if="tab.icon === 'settings'"
          xmlns="http://www.w3.org/2000/svg" width="13" height="13"
          viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        <!-- File-text (documents) -->
        <svg
          v-else-if="tab.icon === 'file-text'"
          xmlns="http://www.w3.org/2000/svg" width="13" height="13"
          viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
        <!-- Generic fallback: dot -->
        <svg
          v-else
          xmlns="http://www.w3.org/2000/svg" width="13" height="13"
          viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
        </svg>
      </span>

      <span class="ktabs__label">{{ tab.label }}</span>

      <!-- Badge / count (optional) -->
      <span v-if="tab.count != null" class="ktabs__count" :aria-label="`${tab.count} items`">
        {{ tab.count > 99 ? '99+' : tab.count }}
      </span>
    </button>
  </div>
</template>

<script setup>
import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const props = defineProps({
  /**
   * Array of tab definitions.
   * Each entry: { name: string, label: string, icon?: string, count?: number }
   * `name` is the URL slug and the v-model value.
   */
  tabs: {
    type: Array,
    required: true,
  },
  /** Currently active tab slug (v-model binding). */
  modelValue: {
    type: String,
    default: null,
  },
  /**
   * Visual variant.
   * 'pills'     — filled pill active state (default, finance-admin)
   * 'underline' — 2px underline on active tab (use sparingly)
   */
  variant: {
    type: String,
    default: 'pills',
    validator: (v) => ['pills', 'underline'].includes(v),
  },
  /**
   * Whether to sync the active tab with the ?tab= query parameter.
   * When true (default), the component reads route.query.tab on mount and
   * writes it on tab change. The parent v-model also updates.
   */
  urlSync: {
    type: Boolean,
    default: true,
  },
  /** aria-label for the tablist element. */
  ariaLabel: {
    type: String,
    default: null,
  },
});

const emit = defineEmits(['update:modelValue']);

// Router — may be unavailable in tests or non-router contexts.
let route = null;
let router = null;
try {
  route = useRoute();
  router = useRouter();
} catch (_routerError) {
  // No router provided — url-sync is silently disabled.
}

/** Validate and normalise a tab slug against the tabs array. */
function normalise(slug) {
  if (!slug) return props.tabs[0]?.name || '';
  const found = props.tabs.find((t) => t.name === slug);
  return found ? slug : (props.tabs[0]?.name || '');
}

/** Current active tab — derived from URL query when urlSync is on. */
const activeTab = computed(() => {
  if (props.urlSync && route) {
    return normalise(route.query.tab);
  }
  return normalise(props.modelValue);
});

function selectTab(name) {
  if (props.urlSync && router && route) {
    router.replace({ query: { ...route.query, tab: name } });
  }
  emit('update:modelValue', name);
}

// Keep v-model in sync when URL changes externally (e.g. browser back).
if (props.urlSync && route) {
  watch(
    () => route.query.tab,
    (slug) => {
      const normalised = normalise(slug);
      if (normalised !== props.modelValue) {
        emit('update:modelValue', normalised);
      }
    },
    { immediate: true },
  );
}

// Keyboard navigation helpers — roving tabindex pattern.
// DOM order of [role="tab"] buttons matches props.tabs order, so we use
// the DOM index directly to derive the next/prev tab name.
function focusNext(event) {
  const items = Array.from(event.currentTarget.closest('[role="tablist"]').querySelectorAll('[role="tab"]'));
  const idx = items.indexOf(event.currentTarget);
  const nextIdx = (idx + 1) % items.length;
  items[nextIdx]?.focus();
  if (props.tabs[nextIdx]) selectTab(props.tabs[nextIdx].name);
}

function focusPrev(event) {
  const items = Array.from(event.currentTarget.closest('[role="tablist"]').querySelectorAll('[role="tab"]'));
  const idx = items.indexOf(event.currentTarget);
  const prevIdx = (idx - 1 + items.length) % items.length;
  items[prevIdx]?.focus();
  if (props.tabs[prevIdx]) selectTab(props.tabs[prevIdx].name);
}
</script>

<style scoped>
/* ─── KTabs — finance-admin primitive ──────────────────────────────────────
   Both variants share the base item sizing (32px tall, 12px horizontal padding,
   13px / 500 text). Visual treatment diverges at the active state.
───────────────────────────────────────────────────────────────────────── */

/* Container */
.ktabs {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-wrap: wrap;
}

/* Underline variant — container has a bottom border */
.ktabs--underline {
  border-bottom: 1px solid var(--kdl-border-subtle);
  gap: 0;
  padding-bottom: 0;
}

/* Tab item — shared sizing */
.ktabs__item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 12px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  line-height: 1;
  color: var(--kdl-text-muted);
  transition: color 150ms cubic-bezier(0.2, 0, 0, 1),
              background 150ms cubic-bezier(0.2, 0, 0, 1);
  white-space: nowrap;
  position: relative;
}

/* Focus ring */
.ktabs__item:focus-visible {
  outline: 2px solid var(--kdl-accent);
  outline-offset: 2px;
  border-radius: 6px;
}

/* ── Pills variant ──────────────────────────────────────────────────────── */

/* Inactive hover */
.ktabs--pills .ktabs__item:not(.ktabs__item--active):hover {
  color: var(--kdl-text-primary);
  background: var(--kdl-border-subtle);
}

/* Active pill — filled background, accent text */
.ktabs--pills .ktabs__item--active {
  background: var(--kdl-card-bg);
  color: var(--kdl-text-primary);
  /* Subtle shadow to lift the pill above the page background */
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 0 0 1px var(--kdl-border);
}

/* ── Underline variant ──────────────────────────────────────────────────── */

.ktabs--underline .ktabs__item {
  border-radius: 6px 6px 0 0;
  padding-bottom: 2px; /* offset for the 2px underline */
}

.ktabs--underline .ktabs__item:not(.ktabs__item--active):hover {
  color: var(--kdl-text-primary);
  background: var(--kdl-border-subtle);
}

/* Active underline — 2px bottom line in accent colour. No layout shift
   (uses box-shadow inset so no border adding height). */
.ktabs--underline .ktabs__item--active {
  color: var(--kdl-text-primary);
  box-shadow: inset 0 -2px 0 var(--kdl-accent);
}

/* ── Shared sub-elements ────────────────────────────────────────────────── */

.ktabs__icon {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  /* Inactive: hint colour; active: inherits accent text */
  color: var(--kdl-text-hint);
}

.ktabs__item--active .ktabs__icon {
  color: var(--kdl-accent);
}

.ktabs__label {
  line-height: 1;
}

/* Badge / count chip */
.ktabs__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--kdl-border);
  color: var(--kdl-text-muted);
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
}

.ktabs__item--active .ktabs__count {
  background: var(--kdl-accent);
  color: #fff;
}

/* ─── Dark mode ─────────────────────────────────────────────────────────── */
/* CSS variables handle most of it. Only values without variables need overrides. */

:root[data-theme="dark"] .ktabs--pills .ktabs__item--active {
  /* Slightly stronger shadow on dark surfaces */
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3), 0 0 0 1px var(--kdl-border);
}
</style>
