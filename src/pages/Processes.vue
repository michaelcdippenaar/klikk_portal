<template>
  <q-page class="q-pa-md">
    <div class="text-h5 q-mb-md">Process Runner</div>

    <!-- API Call Stats -->
    <q-card v-if="apiCallStats" class="q-mb-lg">
      <q-card-section>
        <div class="text-subtitle1 q-mb-sm">
          <q-icon name="api" class="q-mr-sm" />
          Xero API Calls
          <q-badge :color="apiCallStats.total_today > 4000 ? 'negative' : 'grey-6'" class="q-ml-sm">
            {{ apiCallStats.total_today }} today (limit ~5000/day)
          </q-badge>
        </div>
        <div class="row q-col-gutter-md">
          <div
            v-for="(proc, key) in processApiLabels"
            :key="key"
            class="col-12 col-sm-6 col-md-4"
          >
            <div class="q-pa-sm rounded-borders bg-grey-2">
              <div class="text-caption text-grey-7">{{ proc }}</div>
              <div class="text-body2">
                Last run: <strong>{{ (apiCallStats.by_process[key]?.last_run ?? '-') }}</strong>
                · Today: <strong>{{ (apiCallStats.by_process[key]?.today ?? 0) }}</strong>
              </div>
            </div>
          </div>
        </div>
      </q-card-section>
    </q-card>

    <div v-if="!dataStore.selectedTenant" class="q-pa-lg text-center">
      <q-icon name="info" size="3em" color="grey-5" />
      <div class="text-h6 q-mt-md text-grey-7">Please select a tenant first</div>
    </div>

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
