<template>
  <q-page class="q-pa-md">
    <PageHeader title="Process Runner" subtitle="Run Xero sync, journal processing, and trail balance operations">
      <template #tenantContext>
        <TenantSelector />
      </template>
    </PageHeader>


    <!-- API Call Stats -->
    <SectionCard v-if="apiCallStats" title="Xero API Calls" class="q-mb-lg">
      <template #actions>
        <span
          class="klikk-badge size-sm"
          :class="apiCallStats.total_today > 4000 ? 'tone-warn' : 'tone-neutral'"
        >
          {{ apiCallStats.total_today }} / 5&nbsp;000 today
        </span>
      </template>
      <div class="row q-col-gutter-md">
        <div
          v-for="(proc, key) in processApiLabels"
          :key="key"
          class="col-12 col-sm-6 col-md-4"
        >
          <div class="proc-stat-cell">
            <div class="label-upper">{{ proc }}</div>
            <div class="text-muted q-mt-xs">
              Last run: <strong>{{ (apiCallStats.by_process[key]?.last_run ?? '-') }}</strong>
              · Today: <strong>{{ (apiCallStats.by_process[key]?.today ?? 0) }}</strong>
            </div>
          </div>
        </div>
      </div>
    </SectionCard>

    <EmptyState
      v-if="!dataStore.selectedTenant"
      title="Please select a tenant first"
      body="Use the tenant selector above to pick an organisation."
    />

    <div v-else>
      <!-- Update Metadata -->
      <ProcessCard
        title="Update Metadata"
        description="Update accounts, contacts, and tracking categories from Xero"
        :loading="loading.metadata"
        :result="results.metadata"
        @run="runMetadata"
      />

      <!-- Update Data -->
      <ProcessCard
        title="Sync Transactions & Journals"
        description="Fetch and update bank transactions, invoices, payments, and journals from Xero"
        :loading="loading.data"
        :result="results.data"
        show-form
      >
        <template #form>
          <q-checkbox
            v-model="dataOptions.loadAll"
            label="Load all data (ignore last update timestamp)"
          />
        </template>
        <template #actions>
          <q-btn
            label="Sync Data"
            color="primary"
            :loading="loading.data"
            @click="runDataUpdate"
          />
        </template>
      </ProcessCard>

      <!-- Process Journals -->
      <ProcessCard
        title="Process Journals"
        description="Convert raw journal data to individual journal line items"
        :loading="loading.journals"
        :result="results.journals"
        @run="runProcessJournals"
      />

      <!-- Sync Xero Documents -->
      <ProcessCard
        title="Sync Xero Documents"
        description="Import invoice, credit note and bank transaction attachments from Xero and link them to transactions. Run after syncing transactions."
        :loading="loading.documents"
        :result="results.documents"
        @run="runSyncDocuments"
      />

      <!-- Process Trail Balance -->
      <ProcessCard
        title="Build Trail Balance"
        description="Consolidate journals into trail balance records"
        :loading="loading.trailBalance"
        :result="results.trailBalance"
        show-form
      >
        <template #form>
          <q-checkbox
            v-model="trailBalanceOptions.rebuild"
            label="Rebuild trail balance (delete existing and rebuild)"
          />
          <q-checkbox
            v-model="trailBalanceOptions.excludeManual"
            label="Exclude manual journals"
            class="q-mt-sm"
          />
        </template>
        <template #actions>
          <q-btn
            label="Build Trail Balance"
            color="primary"
            :loading="loading.trailBalance"
            @click="runTrailBalance"
          />
        </template>
      </ProcessCard>

    </div>
  </q-page>
</template>

<script setup>
import { ref, reactive, onMounted, watch } from 'vue';
import { useDataStore } from '../stores/data';
import { useProcessStore } from '../stores/processes';
import ProcessCard from '../components/ProcessCard.vue';
import PageHeader from '../components/klikk/PageHeader.vue';
import SectionCard from '../components/klikk/SectionCard.vue';
import EmptyState from '../components/klikk/EmptyState.vue';
import TenantSelector from '../components/TenantSelector.vue';
import { getApiCallStats } from '../api/endpoints';

const dataStore = useDataStore();
const processStore = useProcessStore();

const apiCallStats = ref(null);
const processApiLabels = {
  metadata: 'Update Metadata',
  data: 'Sync Transactions & Journals',
  journals: 'Process Journals',
  'trail-balance': 'Build Trail Balance',
};

async function fetchApiCallStats() {
  try {
    const tenantId = dataStore.selectedTenant;
    apiCallStats.value = await getApiCallStats(tenantId || undefined);
  } catch {
    apiCallStats.value = null;
  }
}

onMounted(fetchApiCallStats);
watch(() => dataStore.selectedTenant, fetchApiCallStats);

const loading = reactive({
  metadata: false,
  data: false,
  journals: false,
  documents: false,
  trailBalance: false,
});

const results = reactive({
  metadata: null,
  data: null,
  journals: null,
  documents: null,
  trailBalance: null,
});

const dataOptions = reactive({
  loadAll: false,
});

const trailBalanceOptions = reactive({
  rebuild: false,
  excludeManual: false,
});


async function runMetadata() {
  loading.metadata = true;
  results.metadata = null;
  try {
    const result = await processStore.runProcess('metadata', {
      tenantId: dataStore.selectedTenant,
    });
    results.metadata = result;
    await fetchApiCallStats();
  } finally {
    loading.metadata = false;
  }
}

async function runDataUpdate() {
  loading.data = true;
  results.data = null;
  try {
    const result = await processStore.runProcess('data', {
      tenantId: dataStore.selectedTenant,
      loadAll: dataOptions.loadAll,
    });
    results.data = result;
    await fetchApiCallStats();
  } finally {
    loading.data = false;
  }
}

async function runProcessJournals() {
  loading.journals = true;
  results.journals = null;
  try {
    const result = await processStore.runProcess('journals', {
      tenantId: dataStore.selectedTenant,
    });
    results.journals = result;
    await fetchApiCallStats();
  } finally {
    loading.journals = false;
  }
}

async function runSyncDocuments() {
  loading.documents = true;
  results.documents = null;
  try {
    const result = await processStore.runProcess('documents', {
      tenantId: dataStore.selectedTenant,
    });
    results.documents = result;
  } finally {
    loading.documents = false;
  }
}

async function runTrailBalance() {
  loading.trailBalance = true;
  results.trailBalance = null;
  try {
    const result = await processStore.runProcess('trail-balance', {
      tenantId: dataStore.selectedTenant,
      rebuild_trail_balance: trailBalanceOptions.rebuild,
      exclude_manual_journals: trailBalanceOptions.excludeManual,
    });
    results.trailBalance = result;
    await fetchApiCallStats();
    // Refresh summary after trail balance is built
    await dataStore.fetchSummary();
  } finally {
    loading.trailBalance = false;
  }
}

</script>

<style scoped>
.proc-stat-cell {
  background: var(--kdl-hover-bg);
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 6px;
  padding: 8px 10px;
}
</style>
