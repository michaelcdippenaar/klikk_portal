<template>
  <q-layout view="hHh lpR fFf">
    <!-- Single-row KDL header -->
    <q-header class="kdl-header">
      <q-toolbar class="kdl-toolbar">
        <!-- Logo / lockup — KLockup component (currentColor inherits parent token) -->
        <span class="kdl-brand-wrapper" role="img" aria-label="Klikk Financials">
          <KLockup size="md" />
        </span>

        <!-- Primary nav — left-adjacent to logo -->
        <nav class="kdl-nav" aria-label="Primary navigation">
          <router-link
            v-for="item in navItems"
            :key="item.name"
            :to="item.to"
            class="kdl-nav__item"
            :class="{ 'kdl-nav__item--active': isActive(item) }"
          >
            <!-- Lucide icons inlined — home / refresh-cw / settings -->
            <svg
              v-if="item.name === 'portal'"
              xmlns="http://www.w3.org/2000/svg" width="16" height="16"
              viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
              class="kdl-nav__icon" aria-hidden="true"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            <svg
              v-else-if="item.name === 'pipeline'"
              xmlns="http://www.w3.org/2000/svg" width="16" height="16"
              viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
              class="kdl-nav__icon" aria-hidden="true"
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            <svg
              v-else-if="item.name === 'setup'"
              xmlns="http://www.w3.org/2000/svg" width="16" height="16"
              viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
              class="kdl-nav__icon" aria-hidden="true"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            {{ item.label }}
          </router-link>
        </nav>

        <q-space />

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

        <!-- User menu -->
        <div class="kdl-user-trigger" role="button" :aria-label="`User menu — ${userEmail}`" :aria-expanded="userMenuOpen" @click="userMenuOpen = !userMenuOpen" ref="userTriggerRef">
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
        </div>

        <!-- User dropdown -->
        <q-menu
          v-model="userMenuOpen"
          :target="userTriggerRef"
          anchor="bottom right"
          self="top right"
          class="kdl-user-menu"
          no-parent-event
        >
          <div class="kdl-user-menu__header">
            <!-- Lucide user (24px in menu header) -->
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
          <q-separator />
          <button class="kdl-user-menu__item kdl-user-menu__item--danger" @click="handleLogout">
            <!-- Lucide log-out -->
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
        </q-menu>
      </q-toolbar>
    </q-header>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useDataStore } from '../stores/data';
import { useTheme } from '../composables/useTheme';
import KLockup from '../components/klikk/KLockup.vue';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const dataStore = useDataStore();
const { isDark, toggleTheme } = useTheme();

const userMenuOpen = ref(false);
const userTriggerRef = ref(null);

const userEmail = computed(() => authStore.user?.email || authStore.user?.username || 'User');

const navItems = [
  { name: 'portal',   label: 'Home',       to: { name: 'portal' } },
  { name: 'pipeline', label: 'Operations', to: { name: 'pipeline' } },
  { name: 'setup',    label: 'Setup',      to: { name: 'setup' } },
];

function isActive(item) {
  if (item.name === 'portal') {
    return route.name === 'portal';
  }
  return route.path.startsWith('/app/' + item.name);
}

onMounted(() => {
  dataStore.loadTenants().catch(err => {
    console.warn('Failed to load tenants:', err);
  });
});

function handleLogout() {
  userMenuOpen.value = false;
  authStore.logout();
  router.push({ name: 'login' });
}
</script>

<style scoped>
/* ── KDL Header shell ─────────────────────────────────── */
.kdl-header {
  background: var(--kdl-card-bg);
  border-bottom: 1px solid var(--kdl-border-subtle);
  box-shadow: var(--shadow-soft);
  color: var(--kdl-text-primary);
}

/* Header density pass: 56px → 44px */
.kdl-toolbar {
  min-height: 44px;
  padding: 0 16px;
  gap: 2px;
}

/* ── Brand lockup ─────────────────────────────────────── */
.kdl-brand-wrapper {
  display: flex;
  align-items: center;
  margin-right: 16px;
  flex-shrink: 0;
  color: var(--kdl-text-primary);
}

/* ── Primary nav ──────────────────────────────────────── */
.kdl-nav {
  display: flex;
  align-items: center;
  gap: 2px;
}

/* ── Nav items — density pass ─────────────────────────── */
.kdl-nav__item {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 500;
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
  background: color-mix(in srgb, var(--kdl-accent) 12%, transparent);
  color: var(--kdl-accent);
  font-weight: 600;
}

.kdl-nav__item--active:hover {
  background: color-mix(in srgb, var(--kdl-accent) 18%, transparent);
  color: var(--kdl-accent);
}

.kdl-nav__icon {
  flex-shrink: 0;
}

/* ── Icon button (theme toggle) — density pass ────────── */
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

/* ── User trigger — density pass ─────────────────────── */
.kdl-user-trigger {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px 6px;
  border-radius: 5px;
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

/* ── User dropdown menu ───────────────────────────────── */
.kdl-user-menu {
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
</style>
