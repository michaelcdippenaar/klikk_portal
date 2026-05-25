<template>
  <q-layout view="hHh lpR fFf">
    <!-- Single-row KDL header -->
    <q-header class="kdl-header">
      <q-toolbar class="kdl-toolbar">
        <!-- Logo / wordmark -->
        <div class="kdl-wordmark">
          <span class="kdl-wordmark__klikk">Klikk</span><span class="kdl-wordmark__fin">Financials</span>
        </div>

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
          <q-icon :name="isDark ? 'light_mode' : 'dark_mode'" size="20px" />
        </button>

        <!-- User menu -->
        <div class="kdl-user-trigger" @click="userMenuOpen = !userMenuOpen" ref="userTriggerRef">
          <q-icon name="account_circle" size="28px" />
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

.kdl-toolbar {
  min-height: 56px;
  padding: 0 20px;
  gap: 4px;
}

/* ── Wordmark ─────────────────────────────────────────── */
.kdl-wordmark {
  font-weight: 700;
  font-size: 15px;
  letter-spacing: -0.3px;
  margin-right: 24px;
  white-space: nowrap;
  flex-shrink: 0;
}
.kdl-wordmark__klikk {
  color: var(--kdl-brand-navy);
}
:root[data-theme="dark"] .kdl-wordmark__klikk {
  color: var(--kdl-text-primary);
}
.kdl-wordmark__fin {
  color: var(--kdl-text-muted);
  font-weight: 500;
}

/* ── Primary nav ──────────────────────────────────────── */
.kdl-nav {
  display: flex;
  align-items: center;
  gap: 2px;
}

.kdl-nav__item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
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

/* ── Icon button (theme toggle) ───────────────────────── */
.kdl-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--kdl-text-secondary);
  cursor: pointer;
  transition: background var(--duration-short) var(--ease-standard),
              color var(--duration-short) var(--ease-standard);
  margin: 0 4px;
}

.kdl-icon-btn:hover {
  background: var(--kdl-hover-bg);
  color: var(--kdl-text-primary);
}

/* ── User trigger ─────────────────────────────────────── */
.kdl-user-trigger {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  color: var(--kdl-text-secondary);
  transition: background var(--duration-short) var(--ease-standard),
              color var(--duration-short) var(--ease-standard);
  margin-left: 4px;
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
