<template>
  <!-- AppPage intentionally omitted: Hub is a full-screen centred landing page with its own layout. -->
  <div class="hub-layout">
    <div class="hub-center">
      <div class="hub-wrapper">
        <div class="hub-title text-center">Klikk Financials Console</div>
        <div class="hub-subtitle text-center">
          Group financial operations, Xero, Investec, and Planning Analytics
        </div>

        <div class="hub-grid">
          <!-- Console -->
          <div class="card card-interactive hub-tile cursor-pointer" @click="goToConsole">
            <!-- Lucide shield-check — admin / console -->
            <svg
              xmlns="http://www.w3.org/2000/svg" width="32" height="32"
              viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
              class="hub-tile__icon" aria-hidden="true"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <polyline points="9 12 11 14 15 10"/>
            </svg>
            <div class="hub-tile__name">Console</div>
            <div class="hub-tile__desc">Xero, Investec, and reporting workflows</div>
          </div>

          <!-- PAW -->
          <div class="card card-interactive hub-tile cursor-pointer" @click="openPAW">
            <!-- Lucide bar-chart-2 — analytics -->
            <svg
              xmlns="http://www.w3.org/2000/svg" width="32" height="32"
              viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
              class="hub-tile__icon" aria-hidden="true"
            >
              <line x1="18" y1="20" x2="18" y2="10"/>
              <line x1="12" y1="20" x2="12" y2="4"/>
              <line x1="6"  y1="20" x2="6"  y2="14"/>
            </svg>
            <div class="hub-tile__name">PAW</div>
            <div class="hub-tile__desc">TM1 and PAW on the RedHat VM</div>
          </div>

          <!-- AI Agent — only shown when route exists -->
          <div
            v-if="hasAiAgent"
            class="card card-interactive hub-tile cursor-pointer"
            @click="goToAiAgent"
          >
            <!-- Lucide bot — AI / smart toy -->
            <svg
              xmlns="http://www.w3.org/2000/svg" width="32" height="32"
              viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
              class="hub-tile__icon" aria-hidden="true"
            >
              <rect x="3" y="11" width="18" height="10" rx="2"/>
              <circle cx="12" cy="5" r="2"/>
              <path d="M12 7v4"/>
              <line x1="8" y1="16" x2="8" y2="16"/>
              <line x1="16" y1="16" x2="16" y2="16"/>
            </svg>
            <div class="hub-tile__name">AI Agent</div>
            <div class="hub-tile__desc">Financial assistant and model tools</div>
          </div>
        </div>
      </div>
    </div>
  </div>
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
  min-height: 100vh;
}

.hub-center {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 16px;
}

.hub-wrapper {
  width: 100%;
  max-width: 760px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.hub-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--kdl-text-primary);
  letter-spacing: -0.01em;
  margin-bottom: 4px;
}

.hub-subtitle {
  font-size: 12px;
  color: var(--kdl-text-muted);
  margin-bottom: 16px;
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
