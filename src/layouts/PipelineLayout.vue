<template>
  <div class="kdl-pipeline-shell">
    <q-drawer
      v-model="drawerOpen"
      show-if-above
      bordered
      class="kdl-drawer"
      :width="240"
      :breakpoint="700"
    >
      <div class="kdl-drawer__inner">
        <!-- Nav groups -->
        <div
          v-for="group in navGroups"
          :key="group.key"
          class="kdl-nav-group"
        >
          <button
            class="kdl-nav-group__toggle"
            :aria-expanded="expandedGroups[group.key]"
            @click="toggleGroup(group.key)"
          >
            <q-icon :name="group.icon" size="16px" class="kdl-nav-group__icon" />
            <span class="kdl-nav-group__label">{{ group.label }}</span>
            <q-icon
              name="expand_more"
              size="14px"
              class="kdl-nav-group__chevron"
              :class="{ 'kdl-nav-group__chevron--open': expandedGroups[group.key] }"
            />
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
                <q-icon :name="item.icon" size="16px" class="kdl-nav-item__icon" />
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
import { ref, reactive, watch } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();

const NAV_PERSIST_KEY = 'klikk:portal:nav';

// Nav group definitions
const navGroups = [
  {
    key: 'xero',
    label: 'Xero',
    icon: 'receipt_long',
    items: [
      { name: 'processes',    label: 'Processes',      icon: 'play_circle' },
      { name: 'data',         label: 'Data Viewer',    icon: 'table_chart' },
      { name: 'compare',      label: 'Comparison',     icon: 'compare_arrows' },
      { name: 'xero-connect', label: 'Connect to Xero',icon: 'link' },
    ],
  },
  {
    key: 'investec',
    label: 'Investec',
    icon: 'account_balance',
    items: [
      { name: 'investec-holdings',     label: 'Share holdings',     icon: 'pie_chart' },
      { name: 'investec-transactions', label: 'Share transactions', icon: 'list_alt' },
      { name: 'investec-share-codes',  label: 'Share codes',        icon: 'code' },
      { name: 'investec-account',      label: 'Account',            icon: 'account_balance' },
    ],
  },
  {
    key: 'investments',
    label: 'Financial Investments',
    icon: 'show_chart',
    items: [
      { name: 'financial-investments', label: 'Stocks',            icon: 'show_chart' },
      { name: 'dividend-forecast',     label: 'Dividend Forecast', icon: 'paid' },
    ],
  },
  {
    key: 'pa',
    label: 'Planning Analytics',
    icon: 'insights',
    items: [
      { name: 'planning-analytics', label: 'Pipeline', icon: 'insights' },
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

.kdl-drawer__inner {
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* ── Nav group ──────────────────────────────────────────── */
.kdl-nav-group {
  border-radius: 6px;
  overflow: hidden;
}

.kdl-nav-group__toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  border: none;
  background: transparent;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--kdl-text-muted);
  cursor: pointer;
  font-family: inherit;
  transition: background var(--duration-short) var(--ease-standard),
              color var(--duration-short) var(--ease-standard);
  text-align: left;
  margin-top: 4px;
}

.kdl-nav-group__toggle:hover {
  background: var(--kdl-hover-bg);
  color: var(--kdl-text-secondary);
}

.kdl-nav-group__icon {
  flex-shrink: 0;
  color: var(--kdl-text-hint);
}

.kdl-nav-group__label {
  flex: 1;
}

.kdl-nav-group__chevron {
  flex-shrink: 0;
  color: var(--kdl-text-hint);
  transition: transform var(--duration-short) var(--ease-standard);
}

.kdl-nav-group__chevron--open {
  transform: rotate(180deg);
}

/* ── Nav items ──────────────────────────────────────────── */
.kdl-nav-group__items {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding-bottom: 4px;
}

.kdl-nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px 7px 28px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 400;
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
