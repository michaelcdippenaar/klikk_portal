<template>
  <AppPage>
    <PageHeader title="Investec Account" subtitle="Search bank transactions across all Investec accounts" />

    <KTabs
      :tabs="[
        { name: 'transactions', label: 'Transactions' },
        { name: 'sync', label: 'Update from API' },
      ]"
      v-model="activeTab"
      :url-sync="false"
      class="mb-4"
    />

    <!-- Transactions tab -->
    <SectionCard v-show="activeTab === 'transactions'" class="mb-6">
      <FilterBar class="mb-4">
        <KInput
          v-model="filters.description"
          label="Description"
          clearable
          placeholder="Search in description"
          class="flex-1 min-w-48"
          @update:model-value="debouncedSearch"
        />
        <KInput
          v-model="filters.amount"
          label="Amount"
          clearable
          placeholder="Exact amount"
          class="flex-1 min-w-32"
          @update:model-value="debouncedSearch"
        />
        <KInput
          v-model="filters.date_from"
          label="From date"
          type="date"
          clearable
          class="flex-1 min-w-36"
          @update:model-value="onFilterChange"
        />
        <KInput
          v-model="filters.date_to"
          label="To date"
          type="date"
          clearable
          class="flex-1 min-w-36"
          @update:model-value="onFilterChange"
        />
        <div class="flex-1 min-w-48">
          <KSelect
            v-model="filters.account"
            label="Account"
            :options="accountOptions"
            clearable
            placeholder="All accounts"
            @update:model-value="onFilterChange"
          />
        </div>
        <div class="flex gap-2 items-end">
          <button class="btn btn-primary" :disabled="loadingTable" @click="onFilterChange">
            <span v-if="loadingTable" class="inline-flex items-center gap-1">
              <KSpinner size="14" /> Searching…
            </span>
            <span v-else>Search</span>
          </button>
          <button class="btn btn-primary btn-outline" :disabled="loadingExport" @click="downloadExcel">
            <span v-if="loadingExport" class="inline-flex items-center gap-1">
              <KSpinner size="14" /> Downloading…
            </span>
            <span v-else>Download Excel</span>
          </button>
        </div>
      </FilterBar>

      <KTable
        :columns="kColumns"
        :data="transactions"
        :loading="loadingTable"
        dense
        pagination="none"
        virtual
        :virtualHeight="520"
      >
        <template #cell-posting_date="{ value }">
          {{ formatDate(value) }}
        </template>
        <template #cell-transaction_date="{ value }">
          {{ formatDate(value) }}
        </template>
        <template #cell-amount="{ value }">
          <!-- ADR §1: accounting tables use parenthesised negatives. No colour on sign. -->
          <span class="kdl-numeric">{{ format(value, { mode: 'accounting' }) }}</span>
        </template>
        <template #cell-running_balance="{ value }">
          <span class="kdl-numeric">{{ format(value, { mode: 'accounting' }) }}</span>
        </template>
      </KTable>

      <div class="flex justify-between items-center mt-3">
        <button
          class="btn btn-ghost btn-sm"
          :disabled="pagination.offset === 0"
          @click="goPage(-1)"
        >
          Previous
        </button>
        <span class="text-sm text-muted">
          {{ pagination.offset + 1 }}–{{ Math.min(pagination.offset + pagination.rowsPerPage, transactionCount) }} of {{ transactionCount }}
        </span>
        <button
          class="btn btn-ghost btn-sm"
          :disabled="pagination.offset + pagination.rowsPerPage >= transactionCount"
          @click="goPage(1)"
        >
          Next
        </button>
      </div>
    </SectionCard>

    <!-- Update from API tab -->
    <SectionCard
      v-show="activeTab === 'sync'"
      class="mb-6"
      title="Sync accounts and transactions from Investec API"
      description="Only transactions from the last update date to today are fetched (incremental update). If you have never synced, the last 180 days are fetched."
    >
      <div class="flex flex-wrap items-center gap-4">
        <div>
          <span class="font-medium text-sm">Last update: </span>
          <span v-if="lastSyncedAt" class="text-sm">{{ formatDateTime(lastSyncedAt) }}</span>
          <span v-else class="text-sm text-muted">Never</span>
        </div>
        <button class="btn btn-primary" :disabled="loadingSync" @click="runSync">
          <span v-if="loadingSync" class="inline-flex items-center gap-1">
            <KSpinner size="14" /> Syncing…
          </span>
          <span v-else>Update from API</span>
        </button>
      </div>
      <div v-if="syncResult" class="mt-4">
        <KAlert
          :variant="syncResult.error ? 'error' : 'success'"
          :body="syncResult.error || `Created ${syncResult.created}, updated ${syncResult.updated}. Synced from ${syncResult.from_date} to ${syncResult.to_date}.`"
        />
      </div>
    </SectionCard>
  </AppPage>
</template>

<script setup>
import { ref, reactive, onMounted, computed, watch } from 'vue';
import {
  getInvestecBankAccounts,
  getInvestecBankTransactions,
  getInvestecBankSyncStatus,
  triggerInvestecBankSync,
  downloadInvestecBankTransactionsExcel,
} from '../api/endpoints';
import { useFormatCurrency } from '../composables/useFormatCurrency';
import AppPage from '../components/shell/AppPage.vue';
import PageHeader from '../components/klikk/PageHeader.vue';
import SectionCard from '../components/klikk/SectionCard.vue';
import FilterBar from '../components/klikk/FilterBar.vue';
import KAlert from '../components/klikk/KAlert.vue';
import KInput from '../components/klikk/KInput.vue';
import KSelect from '../components/klikk/KSelect.vue';
import KSpinner from '../components/klikk/KSpinner.vue';
import KTable from '../components/klikk/KTable.vue';
import KTabs from '../components/klikk/KTabs.vue';

const { format } = useFormatCurrency();

const activeTab = ref('transactions');
const lastSyncedAt = ref(null);
const loadingSync = ref(false);
const syncResult = ref(null);
const loadingExport = ref(false);

const kColumns = [
  { accessorKey: 'posting_date', header: 'Posting date', enableSorting: true },
  { accessorKey: 'transaction_date', header: 'Transaction date', enableSorting: false },
  { accessorKey: 'account_number', header: 'Account', enableSorting: false },
  { accessorKey: 'account_name', header: 'Account name', enableSorting: false },
  { accessorKey: 'type', header: 'Type', enableSorting: false },
  { accessorKey: 'amount', header: 'Amount (R)', enableSorting: false, meta: { align: 'right' } },
  { accessorKey: 'description', header: 'Description', enableSorting: false },
  { accessorKey: 'running_balance', header: 'Balance (R)', enableSorting: false, meta: { align: 'right' } },
];

const transactions = ref([]);
const transactionCount = ref(0);
const accounts = ref([]);
const loadingTable = ref(false);
let fetchAbortController = null;

const filters = reactive({
  description: '',
  amount: '',
  date_from: '',
  date_to: '',
  account: null,
});

const pagination = reactive({
  offset: 0,
  rowsPerPage: 100,
});

const accountOptions = computed(() => {
  return (accounts.value?.results || []).map((a) => ({
    label: a.account_number + (a.account_name ? ` – ${a.account_name}` : ''),
    value: a.account_number,
  }));
});

let searchTimeout = null;
function debouncedSearch() {
  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    pagination.offset = 0;
    fetchTransactions();
  }, 300);
}

function formatDate(val) {
  if (!val) return '';
  return new Date(val).toLocaleDateString();
}

function formatDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString();
}

function onFilterChange() {
  pagination.offset = 0;
  fetchTransactions();
}

async function downloadExcel() {
  loadingExport.value = true;
  try {
    await downloadInvestecBankTransactionsExcel({
      description: filters.description || undefined,
      amount: filters.amount || undefined,
      date_from: filters.date_from || undefined,
      date_to: filters.date_to || undefined,
      account: filters.account || undefined,
    });
  } catch (err) {
    console.error(err);
  } finally {
    loadingExport.value = false;
  }
}

async function fetchAccounts() {
  try {
    const data = await getInvestecBankAccounts();
    accounts.value = data;
  } catch (err) {
    accounts.value = { results: [] };
    console.error(err);
  }
}

async function fetchSyncStatus() {
  try {
    const data = await getInvestecBankSyncStatus();
    lastSyncedAt.value = data.last_synced_at || null;
  } catch (err) {
    lastSyncedAt.value = null;
    console.error(err);
  }
}

async function runSync() {
  loadingSync.value = true;
  syncResult.value = null;
  try {
    const data = await triggerInvestecBankSync();
    if (data.error) {
      syncResult.value = { error: data.error };
    } else {
      syncResult.value = {
        created: data.created ?? 0,
        updated: data.updated ?? 0,
        from_date: data.from_date ?? '',
        to_date: data.to_date ?? '',
      };
      lastSyncedAt.value = data.last_synced_at || null;
      fetchAccounts();
      fetchTransactions();
    }
  } catch (err) {
    syncResult.value = { error: err.response?.data?.error || err.message || 'Sync failed.' };
  } finally {
    loadingSync.value = false;
  }
}

async function fetchTransactions() {
  if (fetchAbortController) {
    fetchAbortController.abort();
  }
  const thisController = new AbortController();
  fetchAbortController = thisController;
  loadingTable.value = true;
  try {
    const data = await getInvestecBankTransactions({
      limit: pagination.rowsPerPage,
      offset: pagination.offset,
      description: filters.description || undefined,
      amount: filters.amount || undefined,
      date_from: filters.date_from || undefined,
      date_to: filters.date_to || undefined,
      account: filters.account || undefined,
      signal: thisController.signal,
    });
    transactions.value = data.results || [];
    transactionCount.value = data.count ?? 0;
  } catch (err) {
    if (err.code === 'ERR_CANCELED' || err.name === 'CanceledError') {
      return;
    }
    transactions.value = [];
    transactionCount.value = 0;
    console.error(err);
  } finally {
    if (!thisController.signal.aborted) {
      if (fetchAbortController === thisController) fetchAbortController = null;
      loadingTable.value = false;
    }
  }
}

function goPage(delta) {
  pagination.offset = Math.max(0, pagination.offset + delta * pagination.rowsPerPage);
  fetchTransactions();
}

onMounted(() => {
  fetchAccounts();
  fetchTransactions();
  fetchSyncStatus();
});

watch(activeTab, (tab) => {
  if (tab === 'sync') fetchSyncStatus();
});
</script>
