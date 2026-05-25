<template>
  <q-layout view="hHh lpR fFf">
    <!-- Single-row KDL header -->
    <q-header class="kdl-header">
      <q-toolbar class="kdl-toolbar">
        <!-- Logo / lockup — inlined so currentColor inherits the parent token -->
        <span class="kdl-brand-wrapper" role="img" aria-label="Klikk Financials">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 164 20"
            class="kdl-brand-lockup"
            aria-hidden="true"
            focusable="false"
          >
            <rect x="0" y="4" width="12" height="3" rx="1" fill="currentColor" />
            <rect x="0" y="8.5" width="8" height="3" rx="1" fill="currentColor" />
            <rect x="0" y="13" width="4" height="3" rx="1" fill="currentColor" />
            <text
              x="20"
              y="14"
              font-family="'Geist', 'Inter', ui-sans-serif, system-ui, sans-serif"
              font-size="13"
              font-weight="500"
              letter-spacing="-0.325"
              fill="currentColor"
            >klikk</text>
            <text
              x="62"
              y="14"
              font-family="'Geist', 'Inter', ui-sans-serif, system-ui, sans-serif"
              font-size="10"
              font-weight="400"
              letter-spacing="0.7"
              fill="currentColor"
              opacity="0.4"
            >financials</text>
          </svg>
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
            <q-icon :name="item.icon" size="16px" class="kdl-nav__icon" />
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
          <q-icon :name="isDark ? 'light_mode' : 'dark_mode'" size="16px" />
        </button>

        <!-- User menu -->
        <div class="kdl-user-trigger" role="button" :aria-label="`User menu — ${userEmail}`" :aria-expanded="userMenuOpen" @click="userMenuOpen = !userMenuOpen" ref="userTriggerRef">
          <q-icon name="account_circle" size="22px" />
          <q-icon name="expand_more" size="16px" class="kdl-chevron" :class="{ 'kdl-chevron--open': userMenuOpen }" />
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
            <q-icon name="account_circle" size="24px" class="kdl-user-menu__avatar" />
            <span class="kdl-user-menu__email">{{ userEmail }}</span>
          </div>
          <q-separator />
          <button class="kdl-user-menu__item kdl-user-menu__item--danger" @click="handleLogout">
            <q-icon name="logout" size="16px" />
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

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const dataStore = useDataStore();
const { isDark, toggleTheme } = useTheme();

const userMenuOpen = ref(false);
const userTriggerRef = ref(null);

const userEmail = computed(() => authStore.user?.email || authStore.user?.username || 'User');

const navItems = [
  { name: 'portal',   label: 'Home',        icon: 'home',     to: { name: 'portal' } },
  { name: 'pipeline', label: 'Operations',  icon: 'sync',     to: { name: 'pipeline' } },
  { name: 'setup',    label: 'Setup',       icon: 'settings', to: { name: 'setup' } },
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

.kdl-brand-lockup {
  height: 20px;
  width: auto;
  display: block;
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
