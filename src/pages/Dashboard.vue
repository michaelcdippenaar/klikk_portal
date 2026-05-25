<template>
  <q-page class="q-pa-lg">
    <PageHeader title="Dashboard" subtitle="System status — Xero, Investec, Planning Analytics">
      <template #tenantContext>
        <TenantSelector />
      </template>

      <template #actions>
        <button
          class="btn btn-ghost btn-sm"
          :disabled="refreshing"
          @click="refresh"
        >
          <!-- Lucide refresh-cw -->
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14" height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
            :class="refreshing ? 'db-spin' : ''"
            aria-hidden="true"
          >
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          Refresh
        </button>
        <FreshnessChip :value="lastRefreshed" prefix="Updated" :stale-after="5" />
      </template>
    </PageHeader>

    <!-- No-tenant empty state -->
    <EmptyState
      v-if="!dataStore.selectedTenant"
      title="Select a tenant to see system status"
      body="Choose an organisation from the tenant selector above to load the status board."
    >
      <template #icon>
        <!-- Lucide building-2 -->
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24" height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
          <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
          <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 0-2 2h-2" />
          <path d="M10 6h4" /><path d="M10 10h4" /><path d="M10 14h4" /><path d="M10 18h4" />
        </svg>
      </template>
      <template #cta>
        <!-- Tenant selector is in PageHeader — just nudge the user visually -->
        <span class="db-empty-hint">Use the tenant selector in the header above.</span>
      </template>
    </EmptyState>

    <!-- Status board (tenant selected) -->
    <template v-else>

      <!-- ── System health row ────────────────────────────────────────── -->
      <div class="db-health-grid">
        <!-- Xero connection -->
        <div class="db-health-tile">
          <span class="db-health-tile__label">Xero connection</span>
          <div class="db-health-tile__value-row">
            <StatusPill
              :tone="health.xero.tone"
              :label="health.xero.label"
              :icon="true"
              size="sm"
            />
          </div>
          <FreshnessChip
            :value="health.xero.lastSync"
            prefix="Last sync"
            :stale-after="60"
          />
        </div>

        <!-- Investec -->
        <div class="db-health-tile">
          <span class="db-health-tile__label">Investec bank</span>
          <div class="db-health-tile__value-row">
            <StatusPill
              :tone="health.investec.tone"
              :label="health.investec.label"
              :icon="true"
              size="sm"
            />
          </div>
          <FreshnessChip
            :value="health.investec.lastSync"
            prefix="Last sync"
            :stale-after="1440"
          />
        </div>

        <!-- Planning Analytics -->
        <div class="db-health-tile">
          <span class="db-health-tile__label">Planning Analytics</span>
          <div class="db-health-tile__value-row">
            <StatusPill
              :tone="health.planningAnalytics.tone"
              :label="health.planningAnalytics.label"
              :icon="true"
              size="sm"
            />
          </div>
          <FreshnessChip
            :value="health.planningAnalytics.lastSync"
            prefix="Last checked"
            :stale-after="60"
          />
        </div>

        <!-- Active tenant -->
        <div class="db-health-tile db-health-tile--tenant">
          <span class="db-health-tile__label">Active tenant</span>
          <div class="db-health-tile__value-row">
            <span class="db-health-tile__tenant-name">
              {{ dataStore.selectedTenantName || '—' }}
            </span>
          </div>
          <span class="db-health-tile__hint">
            {{ dataStore.tenants.length }} org{{ dataStore.tenants.length !== 1 ? 's' : '' }} available
          </span>
        </div>
      </div>

      <!-- ── Xero API call budget ─────────────────────────────────────── -->
      <div v-if="health.xero.apiCallsToday !== null" class="db-api-budget">
        <!-- Lucide zap -->
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="13" height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
        <span>
          Xero API budget:
          <strong>{{ health.xero.apiCallsToday.toLocaleString() }}</strong> / 5&nbsp;000 calls today
        </span>
        <div
          class="db-api-budget__bar"
          :class="apiCallBudgetTone"
          role="progressbar"
          :aria-valuenow="health.xero.apiCallsToday"
          aria-valuemin="0"
          aria-valuemax="5000"
        >
          <div
            class="db-api-budget__fill"
            :style="{ width: Math.min((health.xero.apiCallsToday / 5000) * 100, 100) + '%' }"
          />
        </div>
      </div>

      <!-- ── Service status rows ─────────────────────────────────────── -->
      <div class="db-services">
        <div class="db-services__header">
          <span class="label-upper">Services</span>
        </div>

        <!-- Financials Console -->
        <button class="db-service-row" @click="openConsole">
          <div class="db-service-row__icon" aria-hidden="true">
            <!-- Lucide layout-dashboard -->
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20" height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
          </div>

          <div class="db-service-row__body">
            <span class="db-service-row__name">Financials Console</span>
            <span class="db-service-row__desc">Xero sync, journal processing, trail balance, and reporting workflows</span>
          </div>

          <div class="db-service-row__meta">
            <StatusPill
              :tone="health.xero.tone"
              :label="health.xero.label"
              :icon="true"
              size="sm"
            />
            <FreshnessChip
              :value="health.xero.lastSync"
              prefix="Last sync"
              :stale-after="60"
            />
          </div>

          <div class="db-service-row__action">
            <span class="btn btn-ghost btn-sm db-service-row__btn" aria-hidden="true">
              Open
              <!-- Lucide arrow-right -->
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="13" height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </span>
          </div>
        </button>

        <!-- Planning Analytics -->
        <button class="db-service-row" @click="openPlanningAnalytics">
          <div class="db-service-row__icon" aria-hidden="true">
            <!-- Lucide bar-chart-3 -->
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20" height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M18 20V10" />
              <path d="M12 20V4" />
              <path d="M6 20v-6" />
            </svg>
          </div>

          <div class="db-service-row__body">
            <span class="db-service-row__name">Planning Analytics</span>
            <span class="db-service-row__desc">TM1 and IBM Planning Analytics on the RedHat VM — forecast models and cube writes</span>
          </div>

          <div class="db-service-row__meta">
            <StatusPill
              :tone="health.planningAnalytics.tone"
              :label="health.planningAnalytics.label"
              :icon="true"
              size="sm"
            />
            <FreshnessChip
              :value="health.planningAnalytics.lastSync"
              prefix="Last checked"
              :stale-after="60"
            />
          </div>

          <div class="db-service-row__action">
            <span class="btn btn-ghost btn-sm db-service-row__btn" aria-hidden="true">
              Open
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="13" height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </span>
          </div>
        </button>

        <!-- AI Agent — shown only when the route exists -->
        <button
          v-if="router.hasRoute('ai-agent')"
          class="db-service-row"
          @click="openAiAgent"
        >
          <div class="db-service-row__icon" aria-hidden="true">
            <!-- Lucide bot -->
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20" height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <rect x="3" y="11" width="18" height="10" rx="2" />
              <circle cx="12" cy="5" r="2" />
              <path d="M12 7v4" />
              <line x1="8" y1="16" x2="8" y2="16" />
              <line x1="16" y1="16" x2="16" y2="16" />
            </svg>
          </div>

          <div class="db-service-row__body">
            <span class="db-service-row__name">AI Agent</span>
            <span class="db-service-row__desc">Financial assistant — model tools, system docs, and AI-assisted analysis</span>
          </div>

          <div class="db-service-row__meta">
            <StatusPill
              :tone="health.aiAgent.tone"
              :label="health.aiAgent.label"
              :icon="true"
              size="sm"
            />
            <FreshnessChip
              :value="health.aiAgent.lastSync"
              prefix="Last checked"
              :stale-after="30"
            />
          </div>

          <div class="db-service-row__action">
            <span class="btn btn-ghost btn-sm db-service-row__btn" aria-hidden="true">
              Open
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="13" height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </span>
          </div>
        </button>
      </div>

    </template>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';

import PageHeader from '../components/klikk/PageHeader.vue';
import StatusPill from '../components/klikk/StatusPill.vue';
import FreshnessChip from '../components/klikk/FreshnessChip.vue';
import EmptyState from '../components/klikk/EmptyState.vue';
import TenantSelector from '../components/TenantSelector.vue';

import { useDataStore } from '../stores/data';
import {
  getXeroConnectionStatus,
  getApiCallStats,
} from '../api/endpoints';
import {
  getInvestecBankSyncStatus,
} from '../api/endpoints';
import apiClient from '../api/client';
import { API_ENDPOINTS } from '../utils/constants';

const router = useRouter();
const dataStore = useDataStore();

// ── Reactive health state ──────────────────────────────────────────────────

const lastRefreshed = ref(null);
const refreshing = ref(false);

const health = ref({
  xero: {
    tone: 'neutral',
    label: '—',
    lastSync: null,
    apiCallsToday: null,
  },
  investec: {
    tone: 'neutral',
    label: '—',
    lastSync: null,
  },
  planningAnalytics: {
    tone: 'neutral',
    label: '—',
    lastSync: null,
  },
  aiAgent: {
    tone: 'neutral',
    label: '—',
    lastSync: null,
  },
});

// ── Derived ────────────────────────────────────────────────────────────────

const apiCallBudgetTone = computed(() => {
  const n = health.value.xero.apiCallsToday;
  if (n === null) return '';
  if (n > 4500) return 'db-api-budget__bar--error';
  if (n > 3500) return 'db-api-budget__bar--warning';
  return 'db-api-budget__bar--ok';
});

// ── Fetch helpers ──────────────────────────────────────────────────────────

async function fetchXeroHealth() {
  try {
    const status = await getXeroConnectionStatus();
    // status shape: { connected: bool, tenant_name?, last_refreshed?, ... }
    const connected = status?.connected ?? false;
    health.value.xero.tone = connected ? 'success' : 'error';
    health.value.xero.label = connected ? 'Connected' : 'Not connected';
    if (status?.last_refreshed) {
      health.value.xero.lastSync = status.last_refreshed;
    }
  } catch {
    health.value.xero.tone = 'error';
    health.value.xero.label = 'Unreachable';
  }

  try {
    const stats = await getApiCallStats(dataStore.selectedTenant);
    health.value.xero.apiCallsToday = stats?.total_today ?? null;
    // Derive last sync from api call stats if xero status didn't give us one
    if (!health.value.xero.lastSync && stats?.by_process) {
      const lastRuns = Object.values(stats.by_process)
        .map(p => p?.last_run)
        .filter(Boolean)
        .sort()
        .reverse();
      if (lastRuns[0]) health.value.xero.lastSync = lastRuns[0];
    }
  } catch {
    // non-fatal — budget bar just won't appear
  }
}

async function fetchInvestecHealth() {
  try {
    const data = await getInvestecBankSyncStatus();
    // shape: { last_synced_at: ISO string | null, ... }
    const synced = !!data?.last_synced_at;
    health.value.investec.tone = synced ? 'success' : 'neutral';
    health.value.investec.label = synced ? 'Synced' : 'Never synced';
    health.value.investec.lastSync = data?.last_synced_at ?? null;
  } catch {
    health.value.investec.tone = 'neutral';
    health.value.investec.label = '—';
  }
}

async function fetchPlanningAnalyticsHealth() {
  try {
    const response = await apiClient.get(API_ENDPOINTS.PA_TM1_TEST_CONNECTION);
    const data = response.data;
    const ok = data?.success ?? data?.connected ?? false;
    health.value.planningAnalytics.tone = ok ? 'success' : 'warning';
    health.value.planningAnalytics.label = ok ? 'Reachable' : 'Unreachable';
    health.value.planningAnalytics.lastSync = new Date().toISOString();
  } catch {
    health.value.planningAnalytics.tone = 'warning';
    health.value.planningAnalytics.label = 'Unreachable';
    health.value.planningAnalytics.lastSync = new Date().toISOString();
  }
}

async function fetchAiAgentHealth() {
  if (!router.hasRoute('ai-agent')) return;
  try {
    const response = await apiClient.get(API_ENDPOINTS.AI_AGENT_HEALTH);
    const data = response.data;
    const ok = data?.status === 'ok' || data?.healthy === true;
    health.value.aiAgent.tone = ok ? 'success' : 'warning';
    health.value.aiAgent.label = ok ? 'Online' : 'Degraded';
    health.value.aiAgent.lastSync = new Date().toISOString();
  } catch {
    health.value.aiAgent.tone = 'error';
    health.value.aiAgent.label = 'Offline';
    health.value.aiAgent.lastSync = new Date().toISOString();
  }
}

// ── Main refresh ───────────────────────────────────────────────────────────

async function refresh() {
  if (refreshing.value) return;
  refreshing.value = true;

  // Ensure tenants are loaded
  if (dataStore.tenants.length === 0) {
    await dataStore.loadTenants();
  }

  await Promise.allSettled([
    fetchXeroHealth(),
    fetchInvestecHealth(),
    fetchPlanningAnalyticsHealth(),
    fetchAiAgentHealth(),
  ]);

  lastRefreshed.value = new Date().toISOString();
  refreshing.value = false;
}

// ── Navigation ─────────────────────────────────────────────────────────────

function openConsole() {
  router.push({ name: 'processes' });
}

function openPlanningAnalytics() {
  router.push({ name: 'planning-analytics' });
}

function openAiAgent() {
  router.push({ name: 'ai-agent' });
}

// ── Mount ──────────────────────────────────────────────────────────────────

onMounted(() => {
  refresh();
});
</script>

<style scoped>
/* ── Utility ────────────────────────────────────────────────────────────── */
.db-empty-hint {
  font-size: 13px;
  color: var(--kdl-text-hint);
}

.db-health-tile__hint {
  font-size: 13px;
  color: var(--kdl-text-hint);
}

/* ── Refresh spin ───────────────────────────────────────────────────────── */
.db-spin {
  animation: db-spin 0.8s linear infinite;
}

@keyframes db-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .db-spin { animation: none; }
}

/* ── System health grid ─────────────────────────────────────────────────── */
.db-health-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

@media (max-width: 900px) {
  .db-health-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 480px) {
  .db-health-grid {
    grid-template-columns: 1fr;
  }
}

.db-health-tile {
  background: var(--kdl-card-bg);
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 8px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.db-health-tile__label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--kdl-text-hint);
  line-height: 1.35;
}

.db-health-tile__value-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 22px;
}

.db-health-tile__tenant-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--kdl-text-primary);
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── API budget bar ─────────────────────────────────────────────────────── */
.db-api-budget {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 8px;
  background: var(--kdl-card-bg);
  border: 1px solid var(--kdl-border-subtle);
  font-size: 13px;
  color: var(--kdl-text-muted);
  margin-bottom: 24px;
  flex-wrap: wrap;
}

.db-api-budget strong {
  font-weight: 600;
  color: var(--kdl-text-primary);
}

.db-api-budget__bar {
  flex: 1 1 120px;
  height: 4px;
  border-radius: 2px;
  background: var(--kdl-border-subtle);
  overflow: hidden;
  min-width: 60px;
}

.db-api-budget__fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.4s var(--ease-standard);
}

.db-api-budget__bar--ok .db-api-budget__fill    { background: #0D9488; }
.db-api-budget__bar--warning .db-api-budget__fill { background: #D97706; }
.db-api-budget__bar--error .db-api-budget__fill  { background: #DC2626; }

:root[data-theme="dark"] .db-api-budget__bar--ok .db-api-budget__fill    { background: #2DD4BF; }
:root[data-theme="dark"] .db-api-budget__bar--warning .db-api-budget__fill { background: #FBBF24; }
:root[data-theme="dark"] .db-api-budget__bar--error .db-api-budget__fill  { background: #F87171; }

/* ── Services section ──────────────────────────────────────────────────── */
.db-services {
  display: flex;
  flex-direction: column;
}

.db-services__header {
  padding-bottom: 8px;
  border-bottom: 1px solid var(--kdl-border-subtle);
  margin-bottom: 4px;
}

/* ── Service row ────────────────────────────────────────────────────────── */
.db-service-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  border: none;
  border-bottom: 1px solid var(--kdl-border-subtle);
  background: transparent;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  width: 100%;
  transition: background var(--duration-short) var(--ease-standard);
  border-radius: 0;
}

.db-service-row:first-of-type {
  border-top: none;
}

.db-service-row:last-of-type {
  border-bottom: 1px solid var(--kdl-border-subtle);
}

.db-service-row:hover {
  background: var(--kdl-hover-bg);
}

.db-service-row:hover .db-service-row__btn {
  border-color: var(--kdl-border);
  background: var(--kdl-card-bg);
}

.db-service-row:focus-visible {
  outline: 2px solid var(--kdl-accent);
  outline-offset: -2px;
  border-radius: 4px;
}

.db-service-row__icon {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: var(--kdl-border-subtle);
  color: var(--kdl-text-secondary);
}

.db-service-row__body {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.db-service-row__name {
  font-size: 15px;
  font-weight: 600;
  color: var(--kdl-text-primary);
  line-height: 1.2;
}

.db-service-row__desc {
  font-size: 13px;
  color: var(--kdl-text-muted);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.db-service-row__meta {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.db-service-row__action {
  flex-shrink: 0;
}

/* The "Open" button inside the row — transparent background until row is hovered */
.db-service-row__btn {
  border-color: transparent;
  background: transparent;
  transition: background var(--duration-short) var(--ease-standard),
              border-color var(--duration-short) var(--ease-standard);
}

/* ── Responsive: collapse meta + action on small screens ─────────────── */
@media (max-width: 640px) {
  .db-service-row {
    flex-wrap: wrap;
    gap: 10px;
  }

  .db-service-row__meta {
    order: 3;
    flex: 0 0 100%;
    margin-left: calc(36px + 16px); /* icon width + gap */
  }

  .db-service-row__action {
    display: none;
  }
}
</style>
