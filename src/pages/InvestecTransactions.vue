<template>
  <AppPage>
    <PageHeader title="Share Transactions" subtitle="Investec trading history and transaction records" />

    <!-- Upload section -->
    <SectionCard title="Upload transactions" class="mb-6 investec-tx-upload">
      <KFile
        v-model="uploadFile"
        label="Excel file"
        accept=".xlsx,.xls"
        class="mb-3"
      />
      <button
        class="btn btn-primary"
        :disabled="loadingUpload || !uploadFile"
        @click="uploadTransactions"
      >
        <span v-if="loadingUpload" class="inline-flex items-center gap-1">
          <KSpinner size="14" /> Uploading…
        </span>
        <span v-else>Upload</span>
      </button>
      <div v-if="uploadResult" class="mt-3">
        <KAlert :variant="uploadResult.error ? 'error' : 'success'" :body="uploadResult.error || uploadResult.message" />
      </div>
    </SectionCard>

    <!-- Transactions table -->
    <SectionCard title="Share transactions" class="mb-6">
      <FilterBar class="mb-4">
        <KInput
          v-model="filters.account_number"
          label="Account number"
          clearable
          class="flex-1 min-w-36"
          @update:model-value="fetchTransactions"
        />
        <KInput
          v-model="filters.share_name"
          label="Share name"
          clearable
          class="flex-1 min-w-36"
          @update:model-value="fetchTransactions"
        />
        <KInput
          v-model="filters.type"
          label="Type"
          clearable
          class="flex-1 min-w-28"
          @update:model-value="fetchTransactions"
        />
      </FilterBar>

      <MonthCoverageStrip
        :coverage="transactionCoverage"
        label="Transaction months"
      />

      <KTable
        :columns="transactionKColumns"
        :data="transactions"
        :loading="loadingTable"
        dense
        pagination="none"
        virtual
        :virtualHeight="520"
      >
        <template #cell-date="{ value }">
          {{ formatDate(value) }}
        </template>
        <template #cell-value="{ value }">
          <!-- ADR §1: accounting table — parenthesised negatives, no colour on sign -->
          <span class="kdl-numeric">{{ format(value, { mode: 'accounting' }) }}</span>
        </template>
        <template #cell-quantity="{ value }">
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

    <!-- Exports -->
    <SectionCard title="Exports">
      <div class="flex flex-wrap gap-6">
        <div>
          <button
            class="btn btn-primary btn-outline"
            :disabled="loadingExportCompanies"
            @click="exportCompanies"
          >
            <span v-if="loadingExportCompanies" class="inline-flex items-center gap-1">
              <KSpinner size="14" /> Exporting…
            </span>
            <span v-else>Export companies</span>
          </button>
          <div v-if="exportData.companies" class="mt-2 text-sm">
            <p class="text-muted">Count: {{ exportData.companies.count }}</p>
            <ul v-if="exportData.companies.companies?.length" class="mt-1 space-y-0.5 text-xs">
              <li v-for="(c, i) in exportData.companies.companies.slice(0, 10)" :key="i">
                {{ c.company }} ({{ c.share_code }})
              </li>
              <li v-if="exportData.companies.companies.length > 10" class="text-muted">
                … and {{ exportData.companies.companies.length - 10 }} more
              </li>
            </ul>
          </div>
        </div>
        <div>
          <button
            class="btn btn-primary btn-outline"
            :disabled="loadingExportShareNames"
            @click="exportShareNames"
          >
            <span v-if="loadingExportShareNames" class="inline-flex items-center gap-1">
              <KSpinner size="14" /> Exporting…
            </span>
            <span v-else>Export share names</span>
          </button>
          <div v-if="exportData.shareNames" class="mt-2 text-sm">
            <p class="text-muted">Count: {{ exportData.shareNames.count }}</p>
            <ul v-if="exportData.shareNames.share_names?.length" class="mt-1 space-y-0.5 text-xs">
              <li v-for="(s, i) in exportData.shareNames.share_names.slice(0, 10)" :key="i">{{ s }}</li>
              <li v-if="exportData.shareNames.share_names.length > 10" class="text-muted">
                … and {{ exportData.shareNames.share_names.length - 10 }} more
              </li>
            </ul>
          </div>
        </div>
        <div>
          <button
            class="btn btn-primary btn-outline"
            :disabled="loadingExportTransactions"
            @click="exportTransactions"
          >
            <span v-if="loadingExportTransactions" class="inline-flex items-center gap-1">
              <KSpinner size="14" /> Exporting…
            </span>
            <span v-else>Export transactions (Excel)</span>
          </button>
          <div v-if="exportData.transactions" class="mt-2 text-sm">
            <KAlert v-if="exportData.transactions.error" variant="error" :body="exportData.transactions.error" />
            <template v-else>
              <span>{{ exportData.transactions.message }}</span>
              <a
                v-if="exportData.transactions.filename"
                :href="exportDownloadUrl(exportData.transactions.filename)"
                target="_blank"
                download
                class="btn btn-ghost btn-sm ml-2"
              >
                Download
              </a>
            </template>
          </div>
        </div>
      </div>
    </SectionCard>
  </AppPage>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import {
  getInvestecTransactions,
  uploadInvestecTransactions,
  getInvestecExportCompanies,
  getInvestecExportShareNames,
  getInvestecExportTransactions,
  getInvestecExportDownloadUrl,
} from '../api/endpoints';
import { useFormatCurrency } from '../composables/useFormatCurrency';
import AppPage from '../components/shell/AppPage.vue';
import PageHeader from '../components/klikk/PageHeader.vue';
import SectionCard from '../components/klikk/SectionCard.vue';
import FilterBar from '../components/klikk/FilterBar.vue';
import KAlert from '../components/klikk/KAlert.vue';
import KFile from '../components/klikk/KFile.vue';
import KInput from '../components/klikk/KInput.vue';
import KSpinner from '../components/klikk/KSpinner.vue';
import KTable from '../components/klikk/KTable.vue';
import MonthCoverageStrip from '../components/klikk/MonthCoverageStrip.vue';

const { format } = useFormatCurrency();

const transactionKColumns = [
  { accessorKey: 'date',           header: 'Date',        enableSorting: true,  size: 110 },
  { accessorKey: 'account_number', header: 'Account',     enableSorting: false, size: 130 },
  { accessorKey: 'description',    header: 'Description', enableSorting: false, size: 280 },
  { accessorKey: 'share_name',     header: 'Share name',  enableSorting: false, size: 200 },
  { accessorKey: 'type',           header: 'Type',        enableSorting: false, size: 90 },
  { accessorKey: 'quantity',       header: 'Quantity',    enableSorting: false, size: 120, meta: { align: 'right' } },
  { accessorKey: 'value',          header: 'Value (R)',   enableSorting: false, size: 140, meta: { align: 'right' } },
];

const transactions = ref([]);
const transactionCount = ref(0);
const transactionCoverage = ref(null);
const uploadFile = ref(null);
const uploadResult = ref(null);
const loadingUpload = ref(false);
const loadingTable = ref(false);
const loadingExportCompanies = ref(false);
const loadingExportShareNames = ref(false);
const loadingExportTransactions = ref(false);

const filters = reactive({
  account_number: '',
  share_name: '',
  type: '',
});

const pagination = reactive({
  offset: 0,
  rowsPerPage: 100,
});

const exportData = reactive({
  companies: null,
  shareNames: null,
  transactions: null,
});

function formatDate(val) {
  if (!val) return '';
  return new Date(val).toLocaleDateString();
}

function exportDownloadUrl(filename) {
  return getInvestecExportDownloadUrl(filename);
}

async function fetchTransactions() {
  loadingTable.value = true;
  try {
    const data = await getInvestecTransactions({
      limit: pagination.rowsPerPage,
      offset: pagination.offset,
      account_number: filters.account_number || undefined,
      share_name: filters.share_name || undefined,
      type: filters.type || undefined,
    });
    transactions.value = data.results || [];
    transactionCount.value = data.count ?? 0;
    transactionCoverage.value = data.coverage || null;
  } catch (err) {
    transactions.value = [];
    transactionCount.value = 0;
    transactionCoverage.value = null;
    console.error(err);
  } finally {
    loadingTable.value = false;
  }
}

function goPage(delta) {
  pagination.offset = Math.max(0, pagination.offset + delta * pagination.rowsPerPage);
  fetchTransactions();
}

async function uploadTransactions() {
  if (!uploadFile.value) return;
  loadingUpload.value = true;
  uploadResult.value = null;
  try {
    const data = await uploadInvestecTransactions(uploadFile.value);
    uploadResult.value = {
      message: data.message || (data.created != null ? `Created ${data.created} transaction(s).` : 'Upload successful.'),
    };
    uploadFile.value = null;
    fetchTransactions();
  } catch (err) {
    uploadResult.value = {
      error: err.response?.data?.error || err.message || 'Upload failed.',
    };
  } finally {
    loadingUpload.value = false;
  }
}

async function exportCompanies() {
  loadingExportCompanies.value = true;
  exportData.companies = null;
  try {
    const data = await getInvestecExportCompanies();
    exportData.companies = data;
  } catch (err) {
    exportData.companies = { count: 0, companies: [], error: err.response?.data?.error || err.message };
  } finally {
    loadingExportCompanies.value = false;
  }
}

async function exportShareNames() {
  loadingExportShareNames.value = true;
  exportData.shareNames = null;
  try {
    const data = await getInvestecExportShareNames();
    exportData.shareNames = data;
  } catch (err) {
    exportData.shareNames = { count: 0, share_names: [], error: err.response?.data?.error || err.message };
  } finally {
    loadingExportShareNames.value = false;
  }
}

async function exportTransactions() {
  loadingExportTransactions.value = true;
  exportData.transactions = null;
  try {
    const data = await getInvestecExportTransactions();
    exportData.transactions = {
      message: data.message || `Exported ${data.count ?? 0} transactions.`,
      filename: data.filename,
    };
  } catch (err) {
    exportData.transactions = {
      error: err.response?.data?.error || err.message || 'Export failed.',
    };
  } finally {
    loadingExportTransactions.value = false;
  }
}

onMounted(() => {
  fetchTransactions();
});
</script>

<style scoped>
.investec-tx-upload {
  max-width: 480px;
}
</style>
