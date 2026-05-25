<template>
  <div class="kdl-pipeline-shell">
    <q-drawer
      v-model="drawerOpen"
      show-if-above
      bordered
      class="kdl-drawer"
      :width="220"
      :breakpoint="700"
    >
      <div class="kdl-drawer__inner">
        <!-- Nav groups -->
        <div
          v-for="(group, groupIndex) in navGroups"
          :key="group.key"
          class="kdl-nav-group"
        >
          <!--
            Hairline divider above each section — skip the very first.
            1px, var(--kdl-border-subtle). 4px space above the divider (margin-top on group).
          -->
          <div v-if="groupIndex > 0" class="kdl-nav-group__divider" aria-hidden="true" />

          <button
            class="kdl-nav-group__toggle"
            :class="{ 'kdl-nav-group__toggle--active-section': isSectionActive(group) }"
            :aria-expanded="expandedGroups[group.key]"
            @click="toggleGroup(group.key)"
          >
            <!--
              Left: Lucide ChevronDown (12px) — rotates to point right when collapsed.
              Rotation driven by CSS transform on the --open modifier class.
              NOTE: section labels are 11px — documented exception to the 12px floor.
              This matches the KDL sidebar-section-label tradition for overline labels
              in constrained nav drawers. See docs/primitives/drawer-section-header.md.
            -->
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
              class="kdl-nav-group__caret"
              :class="{ 'kdl-nav-group__caret--collapsed': !expandedGroups[group.key] }"
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>

            <!-- Center-left: section label — 11px, uppercase, tracking, muted -->
            <span class="kdl-nav-group__label">{{ group.label }}</span>

            <!-- Right: item count badge (skip for single-item sections) -->
            <span
              v-if="group.items.length > 1"
              class="kdl-nav-group__count"
              :aria-label="`${group.items.length} items`"
            >{{ group.items.length }}</span>
          </button>

          <transition name="kdl-collapse">
            <div v-show="expandedGroups[group.key]" class="kdl-nav-group__items">
              <router-link
                v-for="item in group.items"
                :key="item.name"
                :to="{ name: item.name }"
                class="kdl-nav-item"
                :class="{ 'kdl-nav-item--active': route.name === item.name }"
              >
                <!-- Lucide icon via inline SVG — replaces q-icon (Material) -->
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
                  class="kdl-nav-item__icon"
                  aria-hidden="true"
                >
                  <!-- Icon paths resolved from NAV_ICONS lookup below -->
                  <template v-if="item.lucide === 'play-circle'">
                    <circle cx="12" cy="12" r="10" />
                    <polygon points="10 8 16 12 10 16 10 8" />
                  </template>
                  <template v-else-if="item.lucide === 'table'">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <line x1="3" y1="9" x2="21" y2="9" />
                    <line x1="3" y1="15" x2="21" y2="15" />
                    <line x1="9" y1="3" x2="9" y2="21" />
                    <line x1="15" y1="3" x2="15" y2="21" />
                  </template>
                  <template v-else-if="item.lucide === 'git-compare'">
                    <circle cx="18" cy="18" r="3" />
                    <circle cx="6" cy="6" r="3" />
                    <path d="M13 6h3a2 2 0 0 1 2 2v7" />
                    <path d="M11 18H8a2 2 0 0 1-2-2V9" />
                    <polyline points="15 9 18 6 21 9" />
                    <polyline points="9 15 6 18 3 15" />
                  </template>
                  <template v-else-if="item.lucide === 'link'">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </template>
                  <template v-else-if="item.lucide === 'pie-chart'">
                    <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
                    <path d="M22 12A10 10 0 0 0 12 2v10z" />
                  </template>
                  <template v-else-if="item.lucide === 'list'">
                    <line x1="8" y1="6" x2="21" y2="6" />
                    <line x1="8" y1="12" x2="21" y2="12" />
                    <line x1="8" y1="18" x2="21" y2="18" />
                    <line x1="3" y1="6" x2="3.01" y2="6" />
                    <line x1="3" y1="12" x2="3.01" y2="12" />
                    <line x1="3" y1="18" x2="3.01" y2="18" />
                  </template>
                  <template v-else-if="item.lucide === 'tag'">
                    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                    <line x1="7" y1="7" x2="7.01" y2="7" />
                  </template>
                  <template v-else-if="item.lucide === 'landmark'">
                    <line x1="3" y1="22" x2="21" y2="22" />
                    <line x1="6" y1="18" x2="6" y2="11" />
                    <line x1="10" y1="18" x2="10" y2="11" />
                    <line x1="14" y1="18" x2="14" y2="11" />
                    <line x1="18" y1="18" x2="18" y2="11" />
                    <polygon points="12 2 20 7 4 7" />
                  </template>
                  <template v-else-if="item.lucide === 'trending-up'">
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                    <polyline points="17 6 23 6 23 12" />
                  </template>
                  <template v-else-if="item.lucide === 'dollar-sign'">
                    <line x1="12" y1="1" x2="12" y2="23" />
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                  </template>
                  <template v-else-if="item.lucide === 'bar-chart-2'">
                    <line x1="18" y1="20" x2="18" y2="10" />
                    <line x1="12" y1="20" x2="12" y2="4" />
                    <line x1="6" y1="20" x2="6" y2="14" />
                  </template>
                  <!-- Fallback: dot -->
                  <template v-else>
                    <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
                  </template>
                </svg>
                {{ item.label }}
              </router-link>
            </div>
          </transition>
        </div>
      </div>
    </q-drawer>

    <div class="kdl-pipeline-content">
      <router-view />
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, watch, computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();

const NAV_PERSIST_KEY = 'klikk:portal:nav';

// Nav group definitions — lucide field replaces q-icon name (Material → Lucide)
const navGroups = [
  {
    key: 'xero',
    label: 'Xero',
    items: [
      { name: 'processes',    label: 'Processes',       lucide: 'play-circle' },
      { name: 'data',         label: 'Data Viewer',     lucide: 'table' },
      { name: 'compare',      label: 'Comparison',      lucide: 'git-compare' },
      { name: 'xero-connect', label: 'Connect to Xero', lucide: 'link' },
    ],
  },
  {
    key: 'investec',
    label: 'Investec',
    items: [
      { name: 'investec-holdings',     label: 'Share holdings',     lucide: 'pie-chart' },
      { name: 'investec-transactions', label: 'Share transactions', lucide: 'list' },
      { name: 'investec-share-codes',  label: 'Share codes',        lucide: 'tag' },
      { name: 'investec-account',      label: 'Account',            lucide: 'landmark' },
    ],
  },
  {
    key: 'investments',
    label: 'Financial Investments',
    items: [
      { name: 'financial-investments', label: 'Stocks',            lucide: 'trending-up' },
      { name: 'dividend-forecast',     label: 'Dividend Forecast', lucide: 'dollar-sign' },
    ],
  },
  {
    key: 'pa',
    label: 'Planning Analytics',
    items: [
      { name: 'planning-analytics', label: 'Pipeline', lucide: 'bar-chart-2' },
    ],
  },
];

// Load persisted expansion state; default to Xero expanded only.
function loadExpanded() {
  try {
    const raw = localStorage.getItem(NAV_PERSIST_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  // Default: only Xero expanded
  return { xero: true, investec: false, investments: false, pa: false };
}

const expandedGroups = reactive(loadExpanded());

function toggleGroup(key) {
  expandedGroups[key] = !expandedGroups[key];
  persistExpanded();
}

function persistExpanded() {
  try {
    localStorage.setItem(NAV_PERSIST_KEY, JSON.stringify({ ...expandedGroups }));
  } catch {
    // ignore
  }
}

// Auto-expand the group that contains the active route
watch(
  () => route.name,
  (routeName) => {
    if (!routeName) return;
    for (const group of navGroups) {
      if (group.items.some(item => item.name === routeName)) {
        if (!expandedGroups[group.key]) {
          expandedGroups[group.key] = true;
          persistExpanded();
        }
        break;
      }
    }
  },
  { immediate: true }
);

/**
 * Returns true when any item in the group matches the active route.
 * Used to subtly embolden the section label when the section owns the current page.
 * NOTE: this styles the section LABEL only — not the item active state.
 * Item active state (.kdl-nav-item--active) is handled separately and is in
 * the Bundle 2 guardrail zone. This modifier adds font-weight: 600 to the label
 * only, not background or colour — safe from the Bundle 2 conflict.
 */
function isSectionActive(group) {
  return group.items.some(item => item.name === route.name);
}

const drawerOpen = ref(true);
</script>

<style scoped>
/* ── Shell ──────────────────────────────────────────────── */
.kdl-pipeline-shell {
  display: flex;
  height: 100%;
}

.kdl-pipeline-content {
  flex: 1;
  min-width: 0;
  overflow: auto;
}

/* ── Drawer ─────────────────────────────────────────────── */
.kdl-drawer {
  background: var(--kdl-card-bg) !important;
  border-right: 1px solid var(--kdl-border-subtle);
}

/* Drawer — density pass */
.kdl-drawer__inner {
  padding: 8px 6px;
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* ── Nav group ──────────────────────────────────────────── */
.kdl-nav-group {
  border-radius: 6px;
  overflow: hidden;
}

/*
  Hairline divider above each section (v-if skips first).
  1px var(--kdl-border-subtle). 4px space above via margin-top on the wrapper.
  Pattern documented in docs/primitives/drawer-section-header.md.
*/
.kdl-nav-group__divider {
  height: 1px;
  background: var(--kdl-border-subtle);
  margin: 4px 2px 0;
}

/*
  Section header toggle row.
  - 8px 12px padding (vertical/horizontal) as spec'd.
  - Hover: var(--kdl-hover-bg) tint. Cursor pointer.
  - 11px label — documented exception to 12px floor.
    Rationale: overline labels in constrained nav drawers (220px wide) at 12px
    would clip on "Financial Investments". 11px is the smallest we go and is
    sanctioned here as a sidebar-section-label exception, same as the KDL
    sidebar-section-label class tradition. Documented in SKILL.md anti-patterns.
*/
.kdl-nav-group__toggle {
  display: flex;
  align-items: center;
  gap: 5px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: transparent;
  border-radius: 5px;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: background var(--duration-short) var(--ease-standard),
              color var(--duration-short) var(--ease-standard);
  margin-top: 4px;
}

.kdl-nav-group__toggle:hover {
  background: var(--kdl-hover-bg);
}

/* Active section: bolder label — NOT item active state (Bundle 2 guardrail zone) */
.kdl-nav-group__toggle--active-section .kdl-nav-group__label {
  font-weight: 700;
  color: var(--kdl-text-secondary);
}

/*
  Rotating caret — ChevronDown rotates 90deg clockwise to point right when collapsed.
  Expanded → 0deg (pointing down). Collapsed → -90deg (pointing right).
  CSS transition on transform, not on the icon itself.
*/
.kdl-nav-group__caret {
  flex-shrink: 0;
  color: var(--kdl-text-hint);
  transition: transform var(--duration-short) var(--ease-standard);
  transform: rotate(0deg);
}

.kdl-nav-group__caret--collapsed {
  transform: rotate(-90deg);
}

/*
  Section label.
  11px — documented exception (see comment above on .kdl-nav-group__toggle).
  Uppercase + tracking: same tradition as .label-upper and .sidebar-section-label.
*/
.kdl-nav-group__label {
  flex: 1;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--kdl-text-muted);
  transition: color var(--duration-short) var(--ease-standard),
              font-weight var(--duration-short) var(--ease-standard);
}

/*
  Item count badge — muted, 11px, top-right of toggle row.
  Shows item count when section has >1 items. Omitted for single-item sections.
*/
.kdl-nav-group__count {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 500;
  color: var(--kdl-text-hint);
  line-height: 1;
  background: var(--kdl-border-subtle);
  border-radius: 999px;
  padding: 1px 5px;
}

/* ── Nav items ──────────────────────────────────────────── */
.kdl-nav-group__items {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding-bottom: 4px;
}

/* Nav items — density pass */
.kdl-nav-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px 5px 22px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 400;
  letter-spacing: -0.005em;
  color: var(--kdl-text-secondary);
  text-decoration: none;
  transition: background var(--duration-short) var(--ease-standard),
              color var(--duration-short) var(--ease-standard);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.kdl-nav-item:hover {
  background: var(--kdl-hover-bg);
  color: var(--kdl-text-primary);
}

.kdl-nav-item--active {
  background: color-mix(in srgb, var(--kdl-accent) 10%, transparent);
  color: var(--kdl-accent);
  font-weight: 600;
}

.kdl-nav-item--active:hover {
  background: color-mix(in srgb, var(--kdl-accent) 16%, transparent);
}

.kdl-nav-item__icon {
  flex-shrink: 0;
  color: inherit;
  opacity: 0.7;
}

/* ── Collapse transition ────────────────────────────────── */
.kdl-collapse-enter-active,
.kdl-collapse-leave-active {
  transition: opacity var(--duration-short) var(--ease-standard),
              transform var(--duration-short) var(--ease-standard);
  transform-origin: top;
}
.kdl-collapse-enter-from,
.kdl-collapse-leave-to {
  opacity: 0;
  transform: scaleY(0.95);
}
.kdl-collapse-enter-to,
.kdl-collapse-leave-from {
  opacity: 1;
  transform: scaleY(1);
}
</style>
