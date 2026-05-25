<template>
  <q-page class="q-pa-lg">
    <PageHeader title="Home" subtitle="Group financial operations — Xero, Investec, and Planning Analytics" />

    <div class="kdl-app-grid">
      <button class="kdl-app-tile" @click="openDjango()">
        <q-icon name="dashboard" size="40px" class="kdl-app-tile__icon" />
        <div class="kdl-app-tile__label">Console</div>
        <div class="kdl-app-tile__desc">Xero, Investec, and reporting workflows</div>
      </button>

      <button class="kdl-app-tile" @click="openPaw()">
        <q-icon name="analytics" size="40px" class="kdl-app-tile__icon" />
        <div class="kdl-app-tile__label">Planning Analytics</div>
        <div class="kdl-app-tile__desc">TM1 and PAW on the RedHat VM</div>
      </button>

      <button class="kdl-app-tile" @click="openAgent()">
        <q-icon name="smart_toy" size="40px" class="kdl-app-tile__icon" />
        <div class="kdl-app-tile__label">AI Agent</div>
        <div class="kdl-app-tile__desc">Financial assistant and model tools</div>
      </button>
    </div>
  </q-page>
</template>

<script setup>
import { useRouter } from 'vue-router';
import PageHeader from '../components/klikk/PageHeader.vue';

const router = useRouter();

function openDjango() {
  router.push({ name: 'processes' });
}

function openPaw() {
  window.open('http://192.168.1.132/paw/', '_blank');
}

function openAgent() {
  router.push({ name: 'ai-agent' });
}
</script>

<style scoped>
.kdl-app-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 280px));
  gap: 16px;
  margin-top: 4px;
}

.kdl-app-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 8px;
  padding: 28px 20px;
  border-radius: 12px;
  border: 1px solid var(--kdl-border);
  background: var(--kdl-card-bg);
  box-shadow: var(--shadow-soft);
  cursor: pointer;
  transition: transform 150ms cubic-bezier(0.2, 0, 0, 1),
              box-shadow 150ms cubic-bezier(0.2, 0, 0, 1),
              border-color 150ms cubic-bezier(0.2, 0, 0, 1);
  font-family: inherit;
}

.kdl-app-tile:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-lifted);
  border-color: var(--kdl-text-hint);
}

.kdl-app-tile:active {
  transform: translateY(-1px) scale(0.99);
}

.kdl-app-tile__icon {
  color: var(--kdl-accent);
  flex-shrink: 0;
}

.kdl-app-tile__label {
  font-size: 14px;
  font-weight: 600;
  color: var(--kdl-text-primary);
  line-height: 1.2;
}

.kdl-app-tile__desc {
  font-size: 12px;
  color: var(--kdl-text-muted);
  line-height: 1.4;
}
</style>
