<template>
  <AppShell class="kdl-main-layout" :class="{ 'kdl-main-layout--overview': isOverviewRoute }">
    <!-- ── Header ─────────────────────────────────────────────────────── -->
    <template #header>
      <AppHeader :class="{ 'app-header--overview': isOverviewRoute }">
        <!-- Logo / lockup -->
        <span class="kdl-brand-wrapper" role="img" :aria-label="isOverviewRoute ? 'Klikk' : 'Klikk Financials'">
          <KLockup size="md" :show-financials="!isOverviewRoute" />
        </span>

        <!-- Primary nav — left-adjacent to logo -->
        <nav class="kdl-nav" aria-label="Primary navigation">
          <router-link
            v-for="item in navItems"
            :key="item.name"
            :to="item.to"
            class="kdl-nav__item"
            :class="{ 'kdl-nav__item--active': isActive(item) }"
            @click.capture="guardDemoNavigation"
          >
            {{ item.label }}
            <svg
              v-if="item.hasMenu"
              xmlns="http://www.w3.org/2000/svg" width="14" height="14"
              viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
              aria-hidden="true"
            ><polyline points="6 9 12 15 18 9" /></svg>
          </router-link>
        </nav>

        <!-- Flex spacer -->
        <div class="kdl-spacer" aria-hidden="true" />

        <div class="kdl-context-controls" aria-label="Financial context">
          <TenantSelector fallback-label="Select entity" />
          <SourceFreshnessPopover
            v-if="isOverviewRoute"
            :sources="sources"
            :coverage="selectedCoverage"
            @open-source="openOverviewSource"
            @view-all="viewSourceConnections"
          />
          <span v-else class="kdl-updated" aria-label="Sources updated 10 minutes ago">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            Updated 10 min ago
          </span>
        </div>

        <!-- Theme toggle -->
        <button
          class="kdl-icon-btn"
          :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
          @click="toggleTheme"
        >
          <!-- Lucide sun (light mode) -->
          <svg
            v-if="isDark"
            xmlns="http://www.w3.org/2000/svg" width="16" height="16"
            viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
          <!-- Lucide moon (dark mode) -->
          <svg
            v-else
            xmlns="http://www.w3.org/2000/svg" width="16" height="16"
            viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        </button>

        <!-- User trigger -->
        <button
          ref="userTriggerRef"
          type="button"
          class="kdl-user-trigger"
          :aria-label="`User menu — ${userEmail}`"
          :aria-expanded="userMenuOpen"
          @click="userMenuOpen = !userMenuOpen"
        >
          <!-- Lucide user -->
          <svg
            xmlns="http://www.w3.org/2000/svg" width="20" height="20"
            viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          <!-- Lucide chevron-down -->
          <svg
            xmlns="http://www.w3.org/2000/svg" width="14" height="14"
            viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
            class="kdl-chevron" :class="{ 'kdl-chevron--open': userMenuOpen }"
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        <!-- User dropdown — native, teleported to body -->
        <teleport to="body">
          <transition name="kdl-menu-fade">
            <div
              v-if="userMenuOpen"
              ref="userMenuRef"
              class="kdl-user-menu"
              :style="menuStyle"
              role="menu"
              @click.stop
            >
              <div class="kdl-user-menu__header">
                <svg
                  xmlns="http://www.w3.org/2000/svg" width="24" height="24"
                  viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
                  class="kdl-user-menu__avatar" aria-hidden="true"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <span class="kdl-user-menu__email">{{ userEmail }}</span>
              </div>

              <button class="kdl-user-menu__item" role="menuitem" @click="openPalette(); userMenuOpen = false">
                <svg
                  xmlns="http://www.w3.org/2000/svg" width="16" height="16"
                  viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <span class="kdl-user-menu__cmd-label">Search &amp; commands</span>
                <span class="kdl-user-menu__shortcut" aria-hidden="true">⌘K</span>
              </button>

              <hr class="kdl-user-menu__sep" />

              <button class="kdl-user-menu__item kdl-user-menu__item--danger" role="menuitem" @click="handleLogout">
                <svg
                  xmlns="http://www.w3.org/2000/svg" width="16" height="16"
                  viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Logout
              </button>
            </div>
          </transition>
        </teleport>
      </AppHeader>
    </template>

    <!-- ── Page content ───────────────────────────────────────────────── -->
    <router-view />

    <!-- ⌘K Command Palette — mounted once at the app shell root -->
    <KCommandPalette />
  </AppShell>

  <!-- Click-outside overlay to close menu (not the drawer) -->
  <teleport to="body">
    <div
      v-if="userMenuOpen"
      class="kdl-menu-overlay"
      aria-hidden="true"
      @click="userMenuOpen = false"
    />
  </teleport>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useDataStore } from '../stores/data';
import { useProcessStore } from '../stores/processes';
import { useOverviewStore } from '../stores/overview';
import { useTheme } from '../composables/useTheme';
import { useCommandPalette } from '../composables/useCommandPalette';
import { useToast } from '../composables/useToast';
import { PRIMARY_NAV_ITEMS, createNavigationCommands } from '../app/navigation';
import KLockup from '../components/klikk/KLockup.vue';
import KCommandPalette from '../components/klikk/KCommandPalette.vue';
import TenantSelector from '../components/TenantSelector.vue';
import AppShell from '../components/shell/AppShell.vue';
import AppHeader from '../components/shell/AppHeader.vue';
import SourceFreshnessPopover from '../components/close-overview/SourceFreshnessPopover.vue';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const dataStore = useDataStore();
const processStore = useProcessStore();
const overviewStore = useOverviewStore();
const { sources, selectedCoverage } = storeToRefs(overviewStore);
const { isDark, toggleTheme } = useTheme();
const toast = useToast();

// Install the global ⌘K listener once at the app shell level.
const { open: openPalette, register, unregister } = useCommandPalette({ installGlobalListener: true });

const userMenuOpen = ref(false);
const userTriggerRef = ref(null);
const userMenuRef = ref(null);

// ── Menu positioning ────────────────────────────────────────────────────────
// Place the dropdown below + right-aligned to the trigger button.
const menuStyle = ref({ top: '0px', right: '16px' });

watch(userMenuOpen, async (open) => {
  if (!open) return;
  await nextTick();
  const trigger = userTriggerRef.value;
  if (!trigger) return;
  const rect = trigger.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  menuStyle.value = {
    position: 'fixed',
    top: `${rect.bottom + 6}px`,
    right: `${viewportWidth - rect.right}px`,
  };
});

const userEmail = computed(() => authStore.user?.email || authStore.user?.username || 'User');
const isOverviewRoute = computed(() => ['portal', 'close-overview-preview'].includes(String(route.name || '')));
const isPreviewRoute = computed(() => route.name === 'close-overview-preview');

function notifyDemoReadOnly() {
  toast.info('Demo data is read-only. No production action or workspace was opened.', { title: 'Demo data' });
}

function guardDemoNavigation(event) {
  if (!dataStore.isDemo) return;
  event.preventDefault();
  notifyDemoReadOnly();
}

function openOverviewSource(source) {
  if (dataStore.isDemo) {
    notifyDemoReadOnly();
    return;
  }
  if (source?.routeName && router.hasRoute(source.routeName)) {
    router.push({ name: source.routeName, query: source.query || undefined });
  }
}

function viewSourceConnections() {
  if (dataStore.isDemo) {
    notifyDemoReadOnly();
    return;
  }
  if (router.hasRoute('credentials')) router.push({ name: 'credentials' });
}

const navItems = PRIMARY_NAV_ITEMS;

function isActive(item) {
  return item.activeNames?.includes(String(route.name || '')) || route.name === item.name;
}

// ── Command palette — global command registration ───────────────────────────

function buildStaticCommands() {
  const navigationCommands = createNavigationCommands(router).map((command) => ({
    ...command,
    perform: () => {
      if (dataStore.isDemo) {
        notifyDemoReadOnly();
        return;
      }
      return command.perform();
    },
  }));
  const cmds = [
    ...navigationCommands,
    {
      id: 'theme-toggle',
      label: 'Toggle Theme',
      category: 'Theme',
      icon: isDark.value ? 'sun' : 'moon',
      keywords: ['dark', 'light', 'theme', 'appearance'],
      perform: () => toggleTheme(),
    },
    {
      id: 'auth-logout',
      label: 'Logout',
      category: 'Account',
      icon: 'log-out',
      keywords: ['sign out', 'exit'],
      perform: () => {
        authStore.logout();
        router.push({ name: 'login' });
      },
    },
  ];

  return cmds;
}

function buildTenantCommands() {
  return dataStore.tenants.map((t) => ({
    id: `tenant-switch-${t.id || t.tenant_id}`,
    label: `Switch entity: ${t.name || t.tenant_name}`,
    category: 'Tenant',
    icon: 'users',
    keywords: ['entity', 'tenant', 'switch', 'organisation', (t.name || t.tenant_name).toLowerCase()],
    perform: () => dataStore.setSelectedTenant(t.id || t.tenant_id),
  }));
}

function buildProcessCommands() {
  if (!dataStore.selectedTenant || dataStore.isDemo) return [];
  const tenantId = dataStore.selectedTenant;

  return [
    {
      id: 'process-metadata',
      label: 'Run Update Metadata',
      category: 'Process',
      icon: 'refresh-cw',
      keywords: ['metadata', 'update', 'xero', 'sync'],
      perform: () => processStore.runProcess('metadata', { tenantId }),
    },
    {
      id: 'process-data',
      label: 'Run Sync Transactions & Journals',
      category: 'Process',
      icon: 'refresh-cw',
      keywords: ['sync', 'transactions', 'journals', 'data'],
      perform: () => processStore.runProcess('data', { tenantId }),
    },
    {
      id: 'process-journals',
      label: 'Run Process Journals',
      category: 'Process',
      icon: 'play',
      keywords: ['journals', 'process'],
      perform: () => processStore.runProcess('journals', { tenantId }),
    },
    {
      id: 'process-trail-balance',
      label: 'Run Build Trial Balance',
      category: 'Process',
      icon: 'bar-chart-2',
      keywords: ['trial balance', 'trail balance', 'build'],
      perform: () => processStore.runProcess('trail-balance', { tenantId }),
    },
  ];
}

function refreshAllCommands() {
  unregister(['process-metadata', 'process-data', 'process-journals', 'process-trail-balance']);
  register([
    ...buildStaticCommands(),
    ...buildTenantCommands(),
    ...buildProcessCommands(),
  ]);
}

async function loadEntityContextForRoute(previewEnabled) {
  if (!previewEnabled) dataStore.clearDemoContext();
  await dataStore.loadTenants({ allowDemoFallback: previewEnabled });
  refreshAllCommands();
}

onMounted(() => {
  loadEntityContextForRoute(isPreviewRoute.value);
});

onUnmounted(() => {
  unregister([
    ...buildStaticCommands(),
    ...buildTenantCommands(),
    ...buildProcessCommands(),
  ].map((command) => command.id));
});

watch(
  [() => dataStore.tenants, () => dataStore.selectedTenant, () => dataStore.isDemo],
  () => refreshAllCommands(),
  { deep: true }
);

watch(isPreviewRoute, (previewEnabled) => loadEntityContextForRoute(previewEnabled));

function handleLogout() {
  userMenuOpen.value = false;
  authStore.logout();
  router.push({ name: 'login' });
}
</script>

<style scoped>
.kdl-main-layout {
  --app-header-height: var(--kdl-close-header-height);
}

/* ── Brand lockup ─────────────────────────────────────── */
.kdl-brand-wrapper {
  display: flex;
  align-items: center;
  margin-right: var(--kdl-space-6);
  flex-shrink: 0;
  color: var(--kdl-text-primary);
}

/* ── Flex spacer ──────────────────────────────────────── */
.kdl-spacer {
  flex: 1 1 0;
}

/* ── Primary nav ──────────────────────────────────────── */
.kdl-nav {
  display: flex;
  align-items: center;
  align-self: stretch;
  gap: var(--kdl-space-2);
}

.kdl-nav__item {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--kdl-space-1);
  padding: 0 var(--kdl-space-2);
  border-radius: 0;
  font-size: var(--kdl-font-size-section);
  font-weight: var(--kdl-font-weight-medium);
  color: var(--kdl-text-secondary);
  text-decoration: none;
  transition: background var(--duration-short) var(--ease-standard),
              color var(--duration-short) var(--ease-standard);
  white-space: nowrap;
}

.kdl-nav__item:hover {
  background: var(--kdl-hover-bg);
  color: var(--kdl-text-primary);
}

.kdl-nav__item--active {
  background: transparent;
  color: var(--kdl-brand-navy);
  font-weight: var(--kdl-font-weight-semibold);
}

.kdl-nav__item--active::after {
  position: absolute;
  right: var(--kdl-space-2);
  bottom: 0;
  left: var(--kdl-space-2);
  height: var(--kdl-size-nav-indicator);
  background: var(--kdl-brand-navy);
  content: '';
}

.kdl-nav__item--active:hover {
  background: var(--kdl-hover-bg);
  color: var(--kdl-brand-navy);
}

.kdl-nav__icon {
  flex-shrink: 0;
}

.kdl-context-controls {
  display: flex;
  align-items: center;
  gap: var(--kdl-space-3);
}

.kdl-updated {
  display: inline-flex;
  align-items: center;
  gap: var(--kdl-space-2);
  color: var(--kdl-text-muted);
  font-size: var(--kdl-font-size-caption);
  white-space: nowrap;
}

.kdl-main-layout--overview .kdl-icon-btn {
  display: none;
}

@media (max-width: 1180px) {
  .kdl-nav__item:nth-child(n+5) { display: none; }
  .kdl-updated { display: none; }
}

@media (max-width: 860px) {
  .kdl-nav { display: none; }
}

/* ── Icon button (theme toggle) ───────────────────────── */
.kdl-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 5px;
  border: none;
  background: transparent;
  color: var(--kdl-text-secondary);
  cursor: pointer;
  transition: background var(--duration-short) var(--ease-standard),
              color var(--duration-short) var(--ease-standard);
  margin: 0 2px;
}

.kdl-icon-btn:hover {
  background: var(--kdl-hover-bg);
  color: var(--kdl-text-primary);
}

/* ── User trigger ─────────────────────────────────────── */
.kdl-user-trigger {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px 6px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  font: inherit;
  cursor: pointer;
  color: var(--kdl-text-secondary);
  transition: background var(--duration-short) var(--ease-standard),
              color var(--duration-short) var(--ease-standard);
  margin-left: 2px;
}

.kdl-user-trigger:hover {
  background: var(--kdl-hover-bg);
  color: var(--kdl-text-primary);
}

.kdl-chevron {
  transition: transform var(--duration-short) var(--ease-standard);
}
.kdl-chevron--open {
  transform: rotate(180deg);
}

/* ── User dropdown (teleported to body — not scoped) ──── */
/* These styles live in the unscoped block below because the teleport
   target is outside this component's DOM tree. */
</style>

<!-- User menu styles are outside the component scope because they're teleported -->
<style>
.kdl-user-menu {
  z-index: 500;
  min-width: 220px;
  background: var(--kdl-card-bg);
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 8px;
  box-shadow: var(--shadow-floating);
  overflow: hidden;
}

.kdl-user-menu__header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
}

.kdl-user-menu__avatar {
  color: var(--kdl-text-muted);
  flex-shrink: 0;
}

.kdl-user-menu__email {
  font-size: 13px;
  color: var(--kdl-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kdl-user-menu__sep {
  border: none;
  border-top: 1px solid var(--kdl-border-subtle);
  margin: 0;
}

.kdl-user-menu__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 16px;
  border: none;
  background: transparent;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: background var(--duration-short) var(--ease-standard);
  color: var(--kdl-text-secondary);
  text-align: left;
}

.kdl-user-menu__item:hover {
  background: var(--kdl-hover-bg);
}

.kdl-user-menu__item--danger {
  color: #EF4444;
}

.kdl-user-menu__item--danger:hover {
  background: color-mix(in srgb, #EF4444 8%, transparent);
}

.kdl-user-menu__cmd-label {
  flex: 1 1 0;
}

.kdl-user-menu__shortcut {
  font-size: 11px;
  font-weight: 500;
  color: var(--kdl-text-hint);
  letter-spacing: 0.01em;
}

/* Click-outside overlay for closing user menu */
.kdl-menu-overlay {
  position: fixed;
  inset: 0;
  z-index: 499;
}

/* Menu fade transition */
.kdl-menu-fade-enter-active,
.kdl-menu-fade-leave-active {
  transition: opacity var(--duration-short) var(--ease-standard),
              transform var(--duration-short) var(--ease-standard);
}
.kdl-menu-fade-enter-from,
.kdl-menu-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
