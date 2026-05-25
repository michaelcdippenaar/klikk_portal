<template>
  <div class="kdl-pipeline-shell">
    <AppDrawer v-model="drawerOpen">
      <div class="kdl-drawer__inner">
        <div class="kdl-nav-group">
          <div class="kdl-nav-group__heading">Setup</div>
          <div class="kdl-nav-group__items">
            <router-link
              :to="{ name: 'credentials' }"
              class="kdl-nav-item"
              :class="{ 'kdl-nav-item--active': route.name === 'credentials' }"
              @click="drawerOpen = false"
            >
              <!-- Lucide key -->
              <svg
                xmlns="http://www.w3.org/2000/svg" width="16" height="16"
                viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
                class="kdl-nav-item__icon" aria-hidden="true"
              >
                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
              </svg>
              Credentials
            </router-link>
            <router-link
              :to="{ name: 'ai-agent-setup' }"
              class="kdl-nav-item"
              :class="{ 'kdl-nav-item--active': route.name === 'ai-agent-setup' }"
              @click="drawerOpen = false"
            >
              <!-- Lucide bot -->
              <svg
                xmlns="http://www.w3.org/2000/svg" width="16" height="16"
                viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
                class="kdl-nav-item__icon" aria-hidden="true"
              >
                <rect x="3" y="11" width="18" height="10" rx="2" ry="2" />
                <circle cx="12" cy="5" r="2" />
                <path d="M12 7v4" />
                <line x1="8" y1="16" x2="8" y2="16" />
                <line x1="16" y1="16" x2="16" y2="16" />
              </svg>
              AI Agent
            </router-link>
            <router-link
              :to="{ name: 'agent-monitor' }"
              class="kdl-nav-item"
              :class="{ 'kdl-nav-item--active': route.name === 'agent-monitor' }"
              @click="drawerOpen = false"
            >
              <!-- Lucide activity (monitor-heart stand-in) -->
              <svg
                xmlns="http://www.w3.org/2000/svg" width="16" height="16"
                viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
                class="kdl-nav-item__icon" aria-hidden="true"
              >
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
              Agent Monitor
            </router-link>
          </div>
        </div>
      </div>
    </AppDrawer>

    <div class="kdl-pipeline-content">
      <router-view />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import AppDrawer from '../components/shell/AppDrawer.vue';

const route = useRoute();
// Desktop: AppDrawer ignores this and is always visible.
// Mobile: closed by default, opened by hamburger in header.
const drawerOpen = ref(false);
</script>

<style scoped>
.kdl-pipeline-shell {
  display: flex;
  height: 100%;
  min-height: 0;
}

.kdl-pipeline-content {
  flex: 1;
  min-width: 0;
  overflow: auto;
}

.kdl-drawer__inner {
  padding: 12px 8px;
}

.kdl-nav-group__heading {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--kdl-text-muted);
  padding: 7px 10px;
  margin-top: 4px;
}

.kdl-nav-group__items {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.kdl-nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px 7px 16px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 400;
  color: var(--kdl-text-secondary);
  text-decoration: none;
  transition: background var(--duration-short) var(--ease-standard),
              color var(--duration-short) var(--ease-standard);
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
</style>
