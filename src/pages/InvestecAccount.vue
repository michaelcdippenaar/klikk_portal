<template>
  <AppPage>
    <PageHeader title="Investec Account">
      <!-- Tenant context — operator safety: always know which books you're reading -->
      <template v-if="tenantName" #tenantContext>
        {{ tenantName }}
      </template>

      <template #actions>
        <!-- Sync action (was: "Update from API" tab) -->
        <div class="investec-header-sync">
          <FreshnessChip
            :value="lastSyncedAt"
            prefix="Synced"
            :stale-after="60"
          />
          <button
            class="btn btn-ghost btn-sm"
            :disabled="loadingSync"
            @click="runSync"
          >
            <span v-if="loadingSync" class="inline-flex items-center gap-1">
              <KSpinner size="14" /> Syncing…
            </span>
            <span v-else>Sync from API</span>
          </button>
        </div>
      </template>
    </PageHeader>

    <!-- Sync result (inline, below header — persists until next action) -->
    <div v-if="syncResult" class="mb-4">
      <KAlert
        :variant="syncResult.error ? 'error' : 'success'"
        :body="syncResult.error || `Created ${syncResult.created}, updated ${syncResult.updated}. Synced from ${syncResult.from_date} to ${syncResult.to_date}.`"
      />
    </div>

    <SectionCard class="mb-6">
      <!-- Export action in SectionCard header — clear of filter row -->
      <template #actions>
        <button class="btn btn-ghost btn-sm" :disabled="loadingExport" @click="downloadExcel">
          <span v-if="loadingExport" class="inline-flex items-center gap-1">
            <KSpinner size="14" /> Downloading…
          </span>
          <span v-else>Export</span>
        </button>
      </template>

      <!-- Sticky filter bar — pins below PageHeader on scroll -->
      <div class="investec-filter-bar-sticky">
        <FilterBar>
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
            @update:model-value="debouncedSearch"
          />
          <KInput
            v-model="filters.date_to"
            label="To date"
            type="date"
            clearable
            class="flex-1 min-w-36"
            @update:model-value="debouncedSearch"
          />
          <KSelect
            v-model="filters.account"
            label="Account"
            :options="accountOptions"
            clearable
            placeholder="All accounts"
            class="flex-1 min-w-48"
            @update:model-value="debouncedSearch"
          />
        </FilterBar>

        <!-- Active-filter chip row -->
        <div v-if="activeFilterChips.length > 0" class="investec-filter-chips">
          <KChip
            v-for="chip in activeFilterChips"
            :key="chip.key"
            :label="chip.label"
            removable
            @remove="clearFilter(chip.key)"
          />
          <button class="btn btn-ghost btn-xs investec-clear-all" @click="clearAllFilters">
            Clear all
          </button>
        </div>
      </div>

      <!-- Table region — aria-busy while loading -->
      <div :aria-busy="loadingTable ? 'true' : undefined" role="region" aria-label="Transactions">
        <KTable
          :columns="kColumns"
          :data="transactions"
          :loading="loadingTable"
          dense
          pagination="none"
          virtual
          :virtualHeight="tableHeight"
        >
          <template #cell-transaction_date="{ value }">
            {{ formatDate(value) }}
          </template>
          <!-- Merged Account column: account_number (primary) + account_name (muted) -->
          <template #cell-account="{ row }">
            <span class="investec-account-cell">
              <code class="investec-account-num">{{ row.original.account_number }}</code>
              <span class="investec-account-name">{{ row.original.account_name }}</span>
            </span>
          </template>
          <template #cell-amount="{ value }">
            <!-- ADR §1: accounting tables use parenthesised negatives. No colour on sign. -->
            <span class="kdl-numeric">{{ format(value, { mode: 'accounting' }) }}</span>
          </template>
          <template #cell-running_balance="{ value }">
            <span class="kdl-numeric">{{ format(value, { mode: 'accounting' }) }}</span>
          </template>
        </KTable>
      </div>

      <!-- Pagination footer — Linear/Stripe convention: range+rows-per-page | prev · page x of y · next -->
      <div class="investec-pagination">
        <div class="investec-pagination__left">
          <!-- Screen reader gets filter-result announcements via aria-live on count -->
          <span aria-live="polite" class="investec-pagination__range">
            {{ pagination.offset + 1 }}–{{ Math.min(pagination.offset + pagination.rowsPerPage, transactionCount) }} of {{ transactionCount }}
          </span>
          <span class="investec-pagination__rows-label">Rows</span>
          <KSelect
            :model-value="String(pagination.rowsPerPage)"
            :options="pageSizeOptions"
            class="investec-pagination__kselect"
            @update:model-value="onPageSizeChange"
          />
        </div>
        <div class="investec-pagination__right">
          <button
            class="btn btn-ghost btn-sm"
            :disabled="pagination.offset === 0"
            @click="goPage(-1)"
          >
            Previous
          </button>
          <span class="investec-pagination__page">
            Page {{ currentPage }} of {{ totalPages }}
          </span>
          <button
            class="btn btn-ghost btn-sm"
            :disabled="pagination.offset + pagination.rowsPerPage >= transactionCount"
            @click="goPage(1)"
          >
            Next
          </button>
        </div>
      </div>
    </SectionCard>
  </AppPage>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useWindowSize } from '@vueuse/core';
import { useDataStore } from '../stores/data.js';
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
import KChip from '../components/klikk/KChip.vue';
import KInput from '../components/klikk/KInput.vue';
import KSelect from '../components/klikk/KSelect.vue';
import KSpinner from '../components/klikk/KSpinner.vue';
import KTable from '../components/klikk/KTable.vue';
import FreshnessChip from '../components/klikk/FreshnessChip.vue';

const { format } = useFormatCurrency();
const route = useRoute();
const router = useRouter();
const dataStore = useDataStore();

// Virtual-scroll height grows with the viewport — fills space below the
// header (44px) + page padding (48px) + page-header (~80px) + filter bar
// (~160px, taller now chips may appear) + pagination footer (~40px) ≈ 372px.
const { height: windowHeight } = useWindowSize();
const tableHeight = computed(() => Math.max(380, windowHeight.value - 372));

// ── Tenant context ──────────────────────────────────────────────────────────
const tenantName = computed(() => dataStore.selectedTenantName);

// ── Sync state ──────────────────────────────────────────────────────────────
const lastSyncedAt = ref(null);
const loadingSync = ref(false);
const syncResult = ref(null);
const loadingExport = ref(false);

// ── Column definitions ──────────────────────────────────────────────────────
// account_number + account_name merged into a single "Account" column.
// The cell template accesses row.original.account_number / .account_name.
const kColumns = [
  { accessorKey: 'transaction_date', header: 'Date',        enableSorting: true,  size: 110 },
  { accessorKey: 'account',          header: 'Account',     enableSorting: false, size: 220 },
  { accessorKey: 'type',             header: 'Type',        enableSorting: false, size: 90 },
  { accessorKey: 'amount',           header: 'Amount (R)',  enableSorting: false, size: 140, meta: { align: 'right' } },
  { accessorKey: 'description',      header: 'Description', enableSorting: false, size: 340 },
  { accessorKey: 'running_balance',  header: 'Balance (R)', enableSorting: false, size: 140, meta: { align: 'right' } },
];

// ── Data state ──────────────────────────────────────────────────────────────
const transactions = ref([]);
const transactionCount = ref(0);
const accounts = ref([]);
const loadingTable = ref(false);
let fetchAbortController = null;

// ── Filters — hydrated from URL on mount ────────────────────────────────────
const filters = reactive({
  description: '',
  amount:      '',
  date_from:   '',
  date_to:     '',
  account:     null,
});

// ── Pagination ──────────────────────────────────────────────────────────────
const pagination = reactive({
  offset:      0,
  rowsPerPage: 100,
});

const pageSizeOptions = [
  { value: '50',   label: '50' },
  { value: '100',  label: '100' },
  { value: '250',  label: '250' },
  { value: '500',  label: '500' },
  { value: '1000', label: '1000' },
];

const currentPage = computed(() =>
  pagination.rowsPerPage > 0
    ? Math.floor(pagination.offset / pagination.rowsPerPage) + 1
    : 1
);

const totalPages = computed(() =>
  pagination.rowsPerPage > 0
    ? Math.max(1, Math.ceil(transactionCount.value / pagination.rowsPerPage))
    : 1
);

// ── Account options ─────────────────────────────────────────────────────────
const accountOptions = computed(() =>
  (accounts.value?.results || []).map((a) => ({
    label: a.account_number + (a.account_name ? ` – ${a.account_name}` : ''),
    value: a.account_number,
  }))
);

// ── Active-filter chips ─────────────────────────────────────────────────────
const activeFilterChips = computed(() => {
  const chips = [];
  if (filters.description) chips.push({ key: 'description', label: `Description: ${filters.description}` });
  if (filters.amount)      chips.push({ key: 'amount',      label: `Amount: ${filters.amount}` });
  if (filters.date_from)   chips.push({ key: 'date_from',   label: `From: ${filters.date_from}` });
  if (filters.date_to)     chips.push({ key: 'date_to',     label: `To: ${filters.date_to}` });
  if (filters.account)     chips.push({ key: 'account',     label: `Account: ${filters.account}` });
  return chips;
});

function clearFilter(key) {
  filters[key] = key === 'account' ? null : '';
  pagination.offset = 0;
  fetchTransactions();
  syncRouteFromFilters();
}

function clearAllFilters() {
  filters.description = '';
  filters.amount = '';
  filters.date_from = '';
  filters.date_to = '';
  filters.account = null;
  pagination.offset = 0;
  fetchTransactions();
  syncRouteFromFilters();
}

// ── URL sync ────────────────────────────────────────────────────────────────
// Reads query params into filter/pagination state.
function hydrateFiltersFromRoute() {
  const q = route.query;
  if (q.description) filters.description = String(q.description);
  if (q.amount)      filters.amount      = String(q.amount);
  if (q.from)        filters.date_from   = String(q.from);
  if (q.to)          filters.date_to     = String(q.to);
  if (q.account)     filters.account     = String(q.account);
  if (q.rows)        pagination.rowsPerPage = Number(q.rows) || 100;
  if (q.page)        pagination.offset   = (Number(q.page) - 1) * pagination.rowsPerPage;
}

// Debounced route replace — same 300ms as fetch debounce; avoids history spam.
let routeTimeout = null;
function syncRouteFromFilters() {
  if (routeTimeout) clearTimeout(routeTimeout);
  routeTimeout = setTimeout(() => {
    const query = {};
    if (filters.description) query.description = filters.description;
    if (filters.amount)      query.amount      = filters.amount;
    if (filters.date_from)   query.from        = filters.date_from;
    if (filters.date_to)     query.to          = filters.date_to;
    if (filters.account)     query.account     = filters.account;
    if (pagination.rowsPerPage !== 100) query.rows = String(pagination.rowsPerPage);
    if (pagination.offset > 0)          query.page = String(currentPage.value);
    router.replace({ query });
  }, 300);
}

// ── Debounced search ────────────────────────────────────────────────────────
let searchTimeout = null;
function debouncedSearch() {
  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    pagination.offset = 0;
    fetchTransactions();
    syncRouteFromFilters();
  }, 300);
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function formatDate(val) {
  if (!val) return '';
  return new Date(val).toLocaleDateString();
}

// ── API actions ─────────────────────────────────────────────────────────────
async function downloadExcel() {
  loadingExport.value = true;
  try {
    await downloadInvestecBankTransactionsExcel({
      description: filters.description || undefined,
      amount:      filters.amount      || undefined,
      date_from:   filters.date_from   || undefined,
      date_to:     filters.date_to     || undefined,
      account:     filters.account     || undefined,
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
        created:   data.created   ?? 0,
        updated:   data.updated   ?? 0,
        from_date: data.from_date ?? '',
        to_date:   data.to_date   ?? '',
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
      limit:       pagination.rowsPerPage,
      offset:      pagination.offset,
      description: filters.description || undefined,
      amount:      filters.amount      || undefined,
      date_from:   filters.date_from   || undefined,
      date_to:     filters.date_to     || undefined,
      account:     filters.account     || undefined,
      signal:      thisController.signal,
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
  syncRouteFromFilters();
}

function onPageSizeChange(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return;
  pagination.rowsPerPage = n;
  pagination.offset = 0;
  fetchTransactions();
  syncRouteFromFilters();
}

// ── Lifecycle ───────────────────────────────────────────────────────────────
onMounted(() => {
  hydrateFiltersFromRoute();
  fetchAccounts();
  fetchTransactions();
  fetchSyncStatus();
});

onUnmounted(() => {
  if (searchTimeout) clearTimeout(searchTimeout);
  if (routeTimeout)  clearTimeout(routeTimeout);
  fetchAbortController?.abort();
});
</script>

<style scoped>
/* ── Header sync strip ────────────────────────────────────────────────────── */
.investec-header-sync {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ── Sticky filter bar ────────────────────────────────────────────────────── */
/*
 * .app-page is the scroll container (overflow-y: auto; padding: 24px).
 * PageHeader is ~80px tall (padding-bottom:24px + border + 1-line title row).
 * We add 24px top padding from .app-page itself to get the offset.
 * Total: sticky top = 0 (relative to .app-page scroll container, which already
 * has its own padding). The filter bar starts right after the PageHeader.
 *
 * z-index: var(--kdl-z-popover, 1000) keeps it above the sticky table thead
 * (z-index: 2 in KTable) while still sitting below KSelect portalled content.
 */
.investec-filter-bar-sticky {
  position: sticky;
  top: -20px; /* -20px offsets the 20px SectionCard body padding so bar hugs the card top */
  z-index: 10;
  background: var(--kdl-card-bg, var(--kdl-page-bg));
  padding: 16px 0 8px;
  margin: -16px 0 8px;
}

/* ── Active-filter chips ──────────────────────────────────────────────────── */
.investec-filter-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding-top: 8px;
}

.investec-clear-all {
  margin-left: auto;
  color: var(--kdl-text-muted);
}

/* ── Merged Account cell ──────────────────────────────────────────────────── */
.investec-account-cell {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.investec-account-num {
  font-size: 13px;
  font-weight: 400;
  font-family: 'Geist Mono', 'JetBrains Mono', 'Fira Code', monospace;
  color: var(--kdl-text-primary);
  background: none;
  padding: 0;
}

.investec-account-name {
  font-size: 12px;
  color: var(--kdl-text-muted);
  line-height: 1.3;
}

/* ── Pagination footer ────────────────────────────────────────────────────── */
.investec-pagination {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.investec-pagination__left {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--kdl-text-muted);
}

.investec-pagination__right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.investec-pagination__range {
  /* aria-live region — no visual treatment needed */
}

.investec-pagination__rows-label {
  color: var(--kdl-text-muted);
  font-size: 13px;
}

/* Constrain the KSelect to a sensible width in the pagination bar */
.investec-pagination__kselect {
  width: 90px;
}

.investec-pagination__page {
  font-size: 13px;
  color: var(--kdl-text-muted);
  padding: 0 6px;
}
</style>
