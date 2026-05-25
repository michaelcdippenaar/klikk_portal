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
        <div class="kdl-nav-group">
          <div class="kdl-nav-group__heading">Setup</div>
          <div class="kdl-nav-group__items">
            <router-link :to="{ name: 'credentials' }" class="kdl-nav-item" :class="{ 'kdl-nav-item--active': route.name === 'credentials' }">
              <q-icon name="vpn_key" size="16px" class="kdl-nav-item__icon" />
              Credentials
            </router-link>
            <router-link :to="{ name: 'ai-agent-setup' }" class="kdl-nav-item" :class="{ 'kdl-nav-item--active': route.name === 'ai-agent-setup' }">
              <q-icon name="smart_toy" size="16px" class="kdl-nav-item__icon" />
              AI Agent
            </router-link>
            <router-link :to="{ name: 'agent-monitor' }" class="kdl-nav-item" :class="{ 'kdl-nav-item--active': route.name === 'agent-monitor' }">
              <q-icon name="monitor_heart" size="16px" class="kdl-nav-item__icon" />
              Agent Monitor
            </router-link>
          </div>
        </div>
      </div>
    </q-drawer>

    <div class="kdl-pipeline-content">
      <router-view />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const drawerOpen = ref(true);
</script>

<style scoped>
.kdl-pipeline-shell {
  display: flex;
  height: 100%;
}

.kdl-pipeline-content {
  flex: 1;
  min-width: 0;
  overflow: auto;
}

.kdl-drawer {
  background: var(--kdl-card-bg) !important;
  border-right: 1px solid var(--kdl-border-subtle);
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
