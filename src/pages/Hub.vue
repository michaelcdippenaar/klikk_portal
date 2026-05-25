<template>
  <q-layout view="hHh lpR fFf" class="hub-layout">
    <q-page-container>
      <q-page class="flex flex-center">
        <div class="hub-wrapper">
          <div class="hub-title text-center q-mb-xs">Klikk Financials Console</div>
          <div class="hub-subtitle text-center q-mb-md">
            Group financial operations, Xero, Investec, and Planning Analytics
          </div>

          <div class="hub-grid">
            <!-- Console -->
            <div class="card card-interactive hub-tile cursor-pointer" @click="goToConsole">
              <q-icon name="admin_panel_settings" size="32px" class="hub-tile__icon" />
              <div class="hub-tile__name">Console</div>
              <div class="hub-tile__desc">Xero, Investec, and reporting workflows</div>
            </div>

            <!-- PAW -->
            <div class="card card-interactive hub-tile cursor-pointer" @click="openPAW">
              <q-icon name="analytics" size="32px" class="hub-tile__icon" />
              <div class="hub-tile__name">PAW</div>
              <div class="hub-tile__desc">TM1 and PAW on the RedHat VM</div>
            </div>

            <!-- AI Agent — only shown when route exists -->
            <div
              v-if="hasAiAgent"
              class="card card-interactive hub-tile cursor-pointer"
              @click="goToAiAgent"
            >
              <q-icon name="smart_toy" size="32px" class="hub-tile__icon" />
              <div class="hub-tile__name">AI Agent</div>
              <div class="hub-tile__desc">Financial assistant and model tools</div>
            </div>
          </div>
        </div>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();

// Resolve whether the ai-agent route is registered so we can hide the card
// instead of showing a tile that goes nowhere.
const hasAiAgent = computed(() =>
  router.hasRoute('ai-agent')
);

function openPAW() {
  window.open('http://192.168.1.132/paw/', '_blank');
}

function goToConsole() {
  router.push({ name: 'data' });
}

function goToAiAgent() {
  router.push({ name: 'ai-agent' });
}
</script>

<style scoped>
.hub-layout {
  background: var(--kdl-page-bg);
}

.hub-wrapper {
  width: 100%;
  max-width: 760px;
  padding: 0 16px;
}

.hub-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--kdl-text-primary);
  letter-spacing: -0.01em;
}

.hub-subtitle {
  font-size: 12px;
  color: var(--kdl-text-muted);
}

.hub-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 10px;
}

.hub-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 20px 16px;
  gap: 6px;
  transition: transform 0.2s, box-shadow 0.2s;
}

.hub-tile:hover {
  transform: translateY(-3px);
}

.hub-tile__icon {
  color: var(--kdl-brand-navy);
}

:root[data-theme="dark"] .hub-tile__icon {
  color: var(--kdl-accent);
}

.hub-tile__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--kdl-text-primary);
}

.hub-tile__desc {
  font-size: 12px;
  color: var(--kdl-text-muted);
}
</style>
