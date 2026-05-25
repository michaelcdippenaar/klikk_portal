<template>
  <q-page class="q-pa-md">

    <!-- ── 1. Page header — quota pill in actions slot ─────────────────────── -->
    <PageHeader
      title="Process Runner"
      subtitle="Run Xero sync, journal processing, and trail balance operations"
    >
      <template #tenantContext>
        <TenantSelector />
      </template>
      <template #actions>
        <StatusPill
          v-if="apiCallStats"
          :tone="quotaTone"
          :label="`Xero API: ${apiCallStats.total_today.toLocaleString()} / 5,000 today`"
          :icon="true"
          size="sm"
        />
      </template>
    </PageHeader>


    <!-- ── 2. Pipeline status strip ─────────────────────────────────────────── -->
    <!--
      Backend gap (Case B): the API does not yet expose per-stage state or
      lastSuccessAt. Passing null → all stages render idle + Never per doctrine.
      Backend ticket: expose GET /api/process-status/?tenant_id=... returning
      { metadata, data, journals, trail-balance, documents } each with
      { state, lastSuccessAt } per the KOperationCard backend data shape.
    -->
    <PipelineStatusStrip :stage-states="null" />


    <!-- ── No-tenant gate ────────────────────────────────────────────────────── -->
    <EmptyState
      v-if="!dataStore.selectedTenant"
      title="Please select a tenant first"
      body="Use the tenant selector above to pick an organisation."
    />

    <div v-else class="processes-stack">

      <!-- ── 3. KOperationCard grid ─────────────────────────────────────────── -->

      <!-- Update Metadata -->
      <div class="processes-stack__item">
        <PersistentResultStrip
          v-if="persistedResults.metadata"
          :result="persistedResults.metadata"
          title="Last run"
          compact
          class="processes-stack__result-strip"
        />
        <KOperationCard
          title="Update Metadata"
          description="Update accounts, contacts, and tracking categories from Xero"
          :state="cardState('metadata')"
          :last-run-at="cardLastRunAt('metadata')"
          metric="—"
          :last-error="cardLastError('metadata')"
          :primary-action="{ label: loading.metadata ? 'Running…' : 'Run', handler: runMetadata }"
        />
      </div>

      <!-- Sync Transactions & Journals -->
      <div class="processes-stack__item">
        <PersistentResultStrip
          v-if="persistedResults.data"
          :result="persistedResults.data"
          title="Last run"
          compact
          class="processes-stack__result-strip"
        />
        <KOperationCard
          title="Sync Transactions & Journals"
          description="Fetch and update bank transactions, invoices, payments, and journals from Xero"
          :state="cardState('data')"
          :last-run-at="cardLastRunAt('data')"
          metric="—"
          :last-error="cardLastError('data')"
          :primary-action="{ label: loading.data ? 'Running…' : 'Sync Data', handler: runDataUpdate }"
        >
          <q-checkbox
            v-model="dataOptions.loadAll"
            label="Load all data (ignore last update timestamp)"
          />
        </KOperationCard>
      </div>

      <!-- Process Journals -->
      <div class="processes-stack__item">
        <PersistentResultStrip
          v-if="persistedResults.journals"
          :result="persistedResults.journals"
          title="Last run"
          compact
          class="processes-stack__result-strip"
        />
        <KOperationCard
          title="Process Journals"
          description="Convert raw journal data to individual journal line items"
          :state="cardState('journals')"
          :last-run-at="cardLastRunAt('journals')"
          metric="—"
          :last-error="cardLastError('journals')"
          :primary-action="{ label: loading.journals ? 'Running…' : 'Run', handler: runProcessJournals }"
        />
      </div>

      <!-- Build Trail Balance -->
      <div class="processes-stack__item">
        <PersistentResultStrip
          v-if="persistedResults.trailBalance"
          :result="persistedResults.trailBalance"
          title="Last run"
          compact
          class="processes-stack__result-strip"
        />
        <KOperationCard
          title="Build Trail Balance"
          description="Consolidate journals into trail balance records"
          :state="cardState('trailBalance')"
          :last-run-at="cardLastRunAt('trailBalance')"
          metric="—"
          :last-error="cardLastError('trailBalance')"
          :primary-action="{ label: loading.trailBalance ? 'Running…' : 'Build Trail Balance', handler: runTrailBalance }"
        >
          <div class="processes-stack__form-group">
            <q-checkbox
              v-model="trailBalanceOptions.rebuild"
              label="Rebuild trail balance (delete existing and rebuild)"
            />
            <q-checkbox
              v-model="trailBalanceOptions.excludeManual"
              label="Exclude manual journals"
              class="q-mt-sm"
            />
          </div>
        </KOperationCard>
      </div>

      <!-- Document Sync -->
      <div class="processes-stack__item">
        <PersistentResultStrip
          v-if="persistedResults.documents"
          :result="persistedResults.documents"
          title="Last run"
          compact
          class="processes-stack__result-strip"
        />
        <KOperationCard
          title="Document Sync"
          description="Import invoice, credit note and bank transaction attachments from Xero and link them to transactions. Run after syncing transactions."
          :state="cardState('documents')"
          :last-run-at="cardLastRunAt('documents')"
          metric="—"
          :last-error="cardLastError('documents')"
          :primary-action="{ label: loading.documents ? 'Running…' : 'Sync Documents', handler: runSyncDocuments }"
        />
      </div>

    </div>


    <!-- ── 4. API call history — collapsed disclosure ─────────────────────── -->
    <div v-if="apiCallStats" class="api-history">
      <details class="api-history__details">
        <summary class="api-history__trigger">
          <span class="api-history__trigger-text">
            View API call history
            <span class="api-history__trigger-meta">·&nbsp;{{ apiCallStats.total_today.toLocaleString() }} / 5,000 today</span>
          </span>
          <!-- chevron — CSS rotates on open via details[open] -->
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14" height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="api-history__chevron"
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </summary>

        <div class="api-history__body">
          <div class="api-history__grid">
            <div
              v-for="(procLabel, key) in processApiLabels"
              :key="key"
              class="api-history__cell"
            >
              <div class="api-history__cell-label">{{ procLabel }}</div>
              <div class="api-history__cell-values">
                Last run: <strong>{{ apiCallStats.by_process[key]?.last_run ?? '—' }}</strong>
                &middot;
                Today: <strong>{{ apiCallStats.by_process[key]?.today ?? 0 }}</strong>
              </div>
            </div>
          </div>
        </div>
      </details>
    </div>

  </q-page>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { useDataStore } from '../stores/data';
import { useProcessStore } from '../stores/processes';
import PageHeader from '../components/klikk/PageHeader.vue';
import StatusPill from '../components/klikk/StatusPill.vue';
import KOperationCard from '../components/klikk/KOperationCard.vue';
import PersistentResultStrip from '../components/klikk/PersistentResultStrip.vue';
import EmptyState from '../components/klikk/EmptyState.vue';
import TenantSelector from '../components/TenantSelector.vue';
import PipelineStatusStrip from '../components/processes/PipelineStatusStrip.vue';
import { getApiCallStats } from '../api/endpoints';

const dataStore = useDataStore();
const processStore = useProcessStore();

// ── API call stats ────────────────────────────────────────────────────────────

const apiCallStats = ref(null);

const processApiLabels = {
  metadata:       'Update Metadata',
  data:           'Sync Transactions & Journals',
  journals:       'Process Journals',
  'trail-balance': 'Build Trail Balance',
};

async function fetchApiCallStats() {
  try {
    apiCallStats.value = await getApiCallStats(dataStore.selectedTenant || undefined);
  } catch {
    apiCallStats.value = null;
  }
}

onMounted(fetchApiCallStats);
watch(() => dataStore.selectedTenant, fetchApiCallStats);

// Quota tone: info <4000, warning 4000–4999, error >=5000
const quotaTone = computed(() => {
  const total = apiCallStats.value?.total_today ?? 0;
  if (total >= 5000) return 'error';
  if (total > 4000) return 'warning';
  return 'info';
});

// ── Process loading state ─────────────────────────────────────────────────────

const loading = reactive({
  metadata:     false,
  data:         false,
  journals:     false,
  documents:    false,
  trailBalance: false,
});

// ── Per-process session results (in-memory + localStorage fallback) ───────────
//
// Case B: backend does not yet expose last_run_status / last_run_at / last_run_metric
// per process. We store the result in localStorage keyed by tenant+processId so
// it survives page reload.
// Backend ticket: expose GET /api/process-status/?tenant_id=... returning the shape
// documented in docs/primitives/k-operation-card.md to eliminate this fallback.

const STORAGE_KEY_PREFIX = 'klikk_proc_result_';

function storageKey(processId) {
  const tenant = dataStore.selectedTenant ?? 'global';
  return `${STORAGE_KEY_PREFIX}${tenant}_${processId}`;
}

function loadPersistedResult(processId) {
  try {
    const raw = localStorage.getItem(storageKey(processId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Restore completedAt as a Date for FreshnessChip
    if (parsed.completedAt) parsed.completedAt = new Date(parsed.completedAt);
    return parsed;
  } catch {
    return null;
  }
}

function savePersistedResult(processId, result) {
  try {
    localStorage.setItem(storageKey(processId), JSON.stringify(result));
  } catch {
    // localStorage full — silent fail, session state still works
  }
}

// processId keys match the loading/results reactive keys
const PROCESS_IDS = ['metadata', 'data', 'journals', 'documents', 'trailBalance'];

const persistedResults = reactive(
  Object.fromEntries(PROCESS_IDS.map((id) => [id, loadPersistedResult(id)])),
);

// Reload persisted results when tenant changes (different key namespace)
watch(() => dataStore.selectedTenant, () => {
  for (const id of PROCESS_IDS) {
    persistedResults[id] = loadPersistedResult(id);
  }
});

// ── In-session state (drives KOperationCard state/error props) ───────────────
// Separate from persistedResults — used only while the session is live.

const sessionState = reactive({
  metadata:     { state: 'idle', lastRunAt: null, lastError: null },
  data:         { state: 'idle', lastRunAt: null, lastError: null },
  journals:     { state: 'idle', lastRunAt: null, lastError: null },
  documents:    { state: 'idle', lastRunAt: null, lastError: null },
  trailBalance: { state: 'idle', lastRunAt: null, lastError: null },
});

// Helpers — derive KOperationCard props from session state
function cardState(processId) {
  return sessionState[processId]?.state ?? 'idle';
}
function cardLastRunAt(processId) {
  return sessionState[processId]?.lastRunAt ?? null;
}
function cardLastError(processId) {
  return sessionState[processId]?.lastError ?? null;
}

// ── Form options ──────────────────────────────────────────────────────────────

const dataOptions = reactive({ loadAll: false });
const trailBalanceOptions = reactive({ rebuild: false, excludeManual: false });

// ── Process runners ───────────────────────────────────────────────────────────

async function runProcess(processId, params, extraAfter) {
  loading[processId] = true;
  sessionState[processId].state = 'running';
  sessionState[processId].lastError = null;

  try {
    const result = await processStore.runProcess(
      processId === 'trailBalance' ? 'trail-balance' : processId,
      params,
    );

    const now = new Date();
    sessionState[processId].lastRunAt = now;

    if (result.success) {
      sessionState[processId].state = 'succeeded';
      const strip = {
        status: 'success',
        completedAt: now,
        summary: buildSummary(result.result),
      };
      persistedResults[processId] = strip;
      savePersistedResult(processId, strip);
    } else {
      sessionState[processId].state = 'failed';
      sessionState[processId].lastError = result.error ?? null;
      const strip = {
        status: 'error',
        completedAt: now,
        summary: null,
        error: result.error ?? 'Process failed',
      };
      persistedResults[processId] = strip;
      savePersistedResult(processId, strip);
    }

    await fetchApiCallStats();
    if (extraAfter) await extraAfter();
  } catch (err) {
    sessionState[processId].state = 'failed';
    const errorMsg = err?.message ?? 'Unexpected error';
    sessionState[processId].lastError = errorMsg;
  } finally {
    loading[processId] = false;
  }
}

/**
 * Build a 1-line summary string from the raw API result payload.
 * Walks top-level numeric keys to produce e.g. "accounts: 12 · contacts: 5"
 */
function buildSummary(apiData) {
  if (!apiData || typeof apiData !== 'object') return null;
  const pairs = Object.entries(apiData)
    .filter(([, v]) => typeof v === 'number' && Number.isFinite(v))
    .map(([k, v]) => `${k}: ${v}`);
  return pairs.length ? pairs.join(' · ') : null;
}

function runMetadata() {
  return runProcess('metadata', { tenantId: dataStore.selectedTenant });
}

function runDataUpdate() {
  return runProcess('data', { tenantId: dataStore.selectedTenant, loadAll: dataOptions.loadAll });
}

function runProcessJournals() {
  return runProcess('journals', { tenantId: dataStore.selectedTenant });
}

function runSyncDocuments() {
  return runProcess('documents', { tenantId: dataStore.selectedTenant });
}

function runTrailBalance() {
  return runProcess(
    'trailBalance',
    {
      tenantId: dataStore.selectedTenant,
      rebuild_trail_balance: trailBalanceOptions.rebuild,
      exclude_manual_journals: trailBalanceOptions.excludeManual,
    },
    () => dataStore.fetchSummary(),
  );
}
</script>

<style scoped>
/* ── KOperationCard vertical stack ─────────────────────────────────────────── */
.processes-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.processes-stack__item {
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* Result strip sits flush above the card with no gap */
.processes-stack__result-strip {
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
  border-bottom: none;
}

/* When strip is present, the KOperationCard rounds only at the bottom */
.processes-stack__item:has(.processes-stack__result-strip) .kop-card {
  border-top-left-radius: 0;
  border-top-right-radius: 0;
}

.processes-stack__form-group {
  display: flex;
  flex-direction: column;
}

/* ── API call history disclosure ─────────────────────────────────────────── */
.api-history {
  margin-top: 32px;
}

.api-history__details {
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 8px;
  overflow: hidden;
}

.api-history__trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 20px;
  cursor: pointer;
  list-style: none;
  background: var(--kdl-card-bg);
  font-size: 13px;
  font-weight: 500;
  color: var(--kdl-text-secondary);
  user-select: none;
  transition: background 0.1s ease;
}

/* Remove default disclosure triangle in all browsers */
.api-history__trigger::-webkit-details-marker { display: none; }
.api-history__trigger::marker { display: none; }

.api-history__trigger:hover {
  background: var(--kdl-hover-bg);
}

.api-history__trigger-text {
  display: flex;
  align-items: center;
  gap: 6px;
}

.api-history__trigger-meta {
  color: var(--kdl-text-muted);
  font-weight: 400;
}

.api-history__chevron {
  flex-shrink: 0;
  color: var(--kdl-text-hint);
  transition: transform 0.2s ease;
}

/* Rotate chevron when open */
.api-history__details[open] .api-history__chevron {
  transform: rotate(180deg);
}

.api-history__body {
  padding: 16px 20px;
  border-top: 1px solid var(--kdl-border-subtle);
  background: var(--kdl-card-bg);
}

.api-history__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
}

.api-history__cell {
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 6px;
  padding: 8px 10px;
}

.api-history__cell-label {
  /* 11px overline — documented exception */
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--kdl-text-hint);
  margin-bottom: 4px;
}

.api-history__cell-values {
  font-size: 13px;
  color: var(--kdl-text-muted);
}

.api-history__cell-values strong {
  color: var(--kdl-text-primary);
  font-weight: 500;
}
</style>
