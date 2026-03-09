<template>
  <q-page class="q-pa-md">
    <div class="text-h5 q-mb-md">Investec – Account</div>
    <p class="text-body2 text-grey-8 q-mb-md">
      Search bank transactions across all Investec accounts to check if a payment has been made.
    </p>

    <q-tabs
      v-model="activeTab"
      dense
      class="text-grey"
      active-color="primary"
      indicator-color="primary"
      align="left"
    >
      <q-tab name="transactions" label="Transactions" />
      <q-tab name="sync" label="Update from API" />
    </q-tabs>
    <q-separator class="q-mb-md" />

    <!-- Transactions tab -->
    <q-card v-show="activeTab === 'transactions'" class="q-mb-lg">
      <q-card-section>
        <div class="row q-col-gutter-sm q-mb-md">
          <q-input
            v-model="filters.description"
            label="Description"
            outlined
            dense
            clearable
            placeholder="Search in description"
            class="col-12 col-sm-6 col-md-3"
            @update:model-value="debouncedSearch"
          />
          <q-input
            v-model="filters.amount"
            label="Amount"
            outlined
            dense
            clearable
            placeholder="Exact amount"
            class="col-12 col-sm-6 col-md-2"
            @update:model-value="debouncedSearch"
          />
          <q-input
            v-model="filters.date_from"
            label="From date"
            outlined
            dense
            clearable
            type="date"
            class="col-12 col-sm-6 col-md-2"
            @update:model-value="onFilterChange"
          />
          <q-input
            v-model="filters.date_to"
            label="To date"
            outlined
            dense
            clearable
            type="date"
            class="col-12 col-sm-6 col-md-2"
            @update:model-value="onFilterChange"
          />
          <q-select
            v-model="filters.account"
            :options="accountOptions"
            label="Account"
            outlined
            dense
            clearable
            emit-value
            map-options
            options-dense
            class="col-12 col-sm-6 col-md-3"
            @update:model-value="onFilterChange"
          />
          <div class="col-12 col-sm-6 col-md-2 flex items-center q-gutter-sm">
            <q-btn
              label="Search"
              color="primary"
              :loading="loadingTable"
              @click="onFilterChange"
            />
            <q-btn
              label="Download Excel"
              color="primary"
              outline
              :loading="loadingExport"
              @click="downloadExcel"
            />
          </div>
        </div>

        <q-table
          :rows="transactions"
          :columns="columns"
          row-key="id"
          flat
          bordered
          :loading="loadingTable"
          :pagination="pagination"
          @request="onTableRequest"
        >
          <template v-slot:body-cell-posting_date="props">
            <q-td :props="props">{{ formatDate(props.row.posting_date) }}</q-td>
          </template>
          <template v-slot:body-cell-transaction_date="props">
            <q-td :props="props">{{ formatDate(props.row.transaction_date) }}</q-td>
          </template>
          <template v-slot:body-cell-amount="props">
            <q-td :props="props">
              <span :class="amountClass(props.row.type)">{{ formatAmount(props.row.amount, props.row.type) }}</span>
            </q-td>
          </template>
          <template v-slot:body-cell-running_balance="props">
            <q-td :props="props">{{ formatAmount(props.row.running_balance) }}</q-td>
          </template>
        </q-table>

        <div class="row justify-between items-center q-mt-sm">
          <q-btn
            flat
            dense
            :disable="pagination.offset === 0"
            @click="goPage(-1)"
          >
            Previous
          </q-btn>
          <span class="text-body2">
            {{ pagination.offset + 1 }}–{{ Math.min(pagination.offset + pagination.rowsPerPage, transactionCount) }} of {{ transactionCount }}
          </span>
          <q-btn
            flat
            dense
            :disable="pagination.offset + pagination.rowsPerPage >= transactionCount"
            @click="goPage(1)"
          >
            Next
          </q-btn>
        </div>
      </q-card-section>
    </q-card>

    <!-- Update from API tab -->
    <q-card v-show="activeTab === 'sync'" class="q-mb-lg">
      <q-card-section>
        <div class="text-subtitle1 q-mb-sm">Sync accounts and transactions from Investec API</div>
        <p class="text-body2 text-grey-8 q-mb-md">
          Only transactions from the last update date to today are fetched (incremental update). If you have never synced, the last 180 days are fetched.
        </p>
        <div class="row items-center q-col-gutter-md">
          <div class="col-12 col-sm-auto">
            <span class="text-weight-medium">Last update: </span>
            <span v-if="lastSyncedAt">{{ formatDateTime(lastSyncedAt) }}</span>
            <span v-else class="text-grey">Never</span>
          </div>
          <div class="col-12 col-sm-auto">
            <q-btn
              label="Update from API"
              color="primary"
              :loading="loadingSync"
              @click="runSync"
            />
          </div>
        </div>
        <q-banner v-if="syncResult" rounded dense class="q-mt-md text-white" :class="syncResult.error ? 'bg-negative' : 'bg-positive'">
          <template v-if="syncResult.error">{{ syncResult.error }}</template>
          <template v-else>
            Created {{ syncResult.created }}, updated {{ syncResult.updated }}. Synced from {{ syncResult.from_date }} to {{ syncResult.to_date }}.
          </template>
        </q-banner>
      </q-card-section>
    </q-card>
  </q-page>
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

const activeTab = ref('transactions');
const lastSyncedAt = ref(null);
const loadingSync = ref(false);
const syncResult = ref(null);
const loadingExport = ref(false);

const columns = [
  { name: 'posting_date', label: 'Posting date', field: 'posting_date', align: 'left', sortable: true },
  { name: 'transaction_date', label: 'Transaction date', field: 'transaction_date', align: 'left' },
  { name: 'account_number', label: 'Account', field: 'account_number', align: 'left' },
  { name: 'account_name', label: 'Account name', field: 'account_name', align: 'left' },
  { name: 'type', label: 'Type', field: 'type', align: 'left' },
  { name: 'amount', label: 'Amount', field: 'amount', align: 'right' },
  { name: 'description', label: 'Description', field: 'description', align: 'left' },
  { name: 'running_balance', label: 'Balance', field: 'running_balance', align: 'right' },
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
  const list = (accounts.value?.results || []).map((a) => ({
    label: a.account_number + (a.account_name ? ` – ${a.account_name}` : ''),
    value: a.account_number,
  }));
  return list;
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

function formatAmount(val, type) {
  if (val == null || val === '') return '';
  const n = Number(val);
  if (isNaN(n)) return val;
  const formatted = n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return formatted;
}

function amountClass(type) {
  if (type === 'DEBIT') return 'text-negative';
  if (type === 'CREDIT') return 'text-positive';
  return '';
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
    // Optionally show a notification
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

function formatDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString();
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
    if (thisController.signal.aborted) return;
    if (fetchAbortController === thisController) fetchAbortController = null;
    loadingTable.value = false;
  }
}

function onTableRequest(props) {
  pagination.offset = props.pagination?.offset ?? 0;
  pagination.rowsPerPage = props.pagination?.rowsPerPage ?? 100;
  fetchTransactions();
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
