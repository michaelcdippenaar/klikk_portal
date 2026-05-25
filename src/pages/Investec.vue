<template>
  <AppPage>
    <h1 class="text-xl font-semibold mb-4">Investec</h1>

    <KTabs
      :tabs="[
        { name: 'data', label: 'Data' },
        { name: 'mappings', label: 'Share codes & names' },
      ]"
      v-model="activeTab"
      :url-sync="false"
      class="mb-4"
      @update:model-value="onTabChange"
    />

    <template v-if="activeTab === 'data'">
      <!-- Uploads -->
      <h2 class="text-sm font-semibold text-muted uppercase tracking-wide mb-3">Uploads</h2>
      <div class="flex flex-wrap gap-4 mb-8">
        <SectionCard title="Share transactions" class="investec-upload-card">
          <KFile
            v-model="uploadFiles.transactions"
            label="Excel file"
            accept=".xlsx,.xls"
            class="mb-3"
          />
          <button
            class="btn btn-primary"
            :disabled="loading.uploadTransactions || !uploadFiles.transactions"
            @click="uploadTransactions"
          >
            <span v-if="loading.uploadTransactions" class="inline-flex items-center gap-1">
              <KSpinner size="14" /> Uploading…
            </span>
            <span v-else>Upload</span>
          </button>
          <div v-if="uploadResult.transactions" class="mt-3">
            <KAlert
              :variant="uploadResult.transactions.error ? 'error' : 'success'"
              :body="uploadResult.transactions.error || uploadResult.transactions.message"
            />
          </div>
        </SectionCard>

        <SectionCard title="Portfolio" class="investec-upload-card">
          <KFile
            v-model="uploadFiles.portfolio"
            label="Excel file(s)"
            accept=".xlsx,.xls"
            multiple
            class="mb-3"
          />
          <button
            class="btn btn-primary"
            :disabled="loading.uploadPortfolio || !(Array.isArray(uploadFiles.portfolio) ? uploadFiles.portfolio?.length : uploadFiles.portfolio)"
            @click="uploadPortfolio"
          >
            <span v-if="loading.uploadPortfolio" class="inline-flex items-center gap-1">
              <KSpinner size="14" /> Uploading…
            </span>
            <span v-else>Upload</span>
          </button>
          <div v-if="uploadResult.portfolio" class="mt-3">
            <KAlert
              :variant="uploadResult.portfolio.error ? 'error' : 'success'"
              :body="uploadResult.portfolio.error || uploadResult.portfolio.message"
            />
          </div>
        </SectionCard>

        <SectionCard title="Share name mapping" class="investec-upload-card">
          <KFile
            v-model="uploadFiles.mapping"
            label="Excel file"
            accept=".xlsx,.xls"
            class="mb-3"
          />
          <button
            class="btn btn-primary"
            :disabled="loading.uploadMapping || !uploadFiles.mapping"
            @click="uploadMapping"
          >
            <span v-if="loading.uploadMapping" class="inline-flex items-center gap-1">
              <KSpinner size="14" /> Uploading…
            </span>
            <span v-else>Upload</span>
          </button>
          <div v-if="uploadResult.mapping" class="mt-3">
            <KAlert
              :variant="uploadResult.mapping.error ? 'error' : 'success'"
              :body="uploadResult.mapping.error || uploadResult.mapping.message"
            />
          </div>
        </SectionCard>
      </div>

      <!-- Share transactions table -->
      <SectionCard title="Share transactions" class="mb-8">
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

        <KTable
          :columns="transactionKColumns"
          :data="transactions"
          :loading="loading.transactions"
          dense
          pagination="none"
          virtual
          :virtualHeight="500"
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
              :disabled="loading.exportCompanies"
              @click="exportCompanies"
            >
              <span v-if="loading.exportCompanies" class="inline-flex items-center gap-1">
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
              :disabled="loading.exportShareNames"
              @click="exportShareNames"
            >
              <span v-if="loading.exportShareNames" class="inline-flex items-center gap-1">
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
              :disabled="loading.exportTransactions"
              @click="exportTransactions"
            >
              <span v-if="loading.exportTransactions" class="inline-flex items-center gap-1">
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
    </template>

    <template v-if="activeTab === 'mappings'">
      <SectionCard v-if="unmappedShareNames.length > 0" class="mb-4">
        <template #actions>
          <div class="flex items-center gap-3">
            <span class="text-sm font-medium">
              Share names in transactions not in mapping ({{ unmappedShareNames.length }})
            </span>
            <button
              class="btn btn-ghost btn-sm"
              :disabled="loading.unmappedShareNames"
              @click="fetchUnmappedShareNames"
            >
              <!-- Lucide refresh-cw -->
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="mr-1"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
              Refresh
            </button>
          </div>
        </template>
        <p class="text-sm text-muted mb-3">
          Add these to the mapping table (e.g. via upload) so they have a share code and company.
        </p>
        <ul class="mt-2 space-y-1">
          <li v-for="(name, i) in unmappedShareNames" :key="i" class="text-sm py-1 border-b border-kdl-border-subtle last:border-0">
            {{ name }}
          </li>
        </ul>
      </SectionCard>

      <SectionCard title="Share codes, names and company">
        <template #actions>
          <button
            class="btn btn-ghost btn-sm"
            :disabled="loading.mappings"
            @click="refreshMappingsTab"
          >
            <!-- Lucide refresh-cw -->
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="mr-1"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            Refresh
          </button>
        </template>
        <KTable
          :columns="mappingKColumns"
          :data="mappings"
          :loading="loading.mappings"
          dense
          pagination="client"
          :pageSize="25"
          :pageSizeOptions="[25, 50, 100]"
        />
      </SectionCard>
    </template>
  </AppPage>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import {
  getInvestecTransactions,
  getInvestecMappings,
  getInvestecUnmappedShareNames,
  uploadInvestecTransactions as apiUploadTransactions,
  uploadInvestecPortfolio as apiUploadPortfolio,
  uploadInvestecMapping as apiUploadMapping,
  getInvestecExportCompanies,
  getInvestecExportShareNames,
  getInvestecExportTransactions,
  getInvestecExportDownloadUrl,
} from '../api/endpoints';
import { useFormatCurrency } from '../composables/useFormatCurrency';
import AppPage from '../components/shell/AppPage.vue';
import SectionCard from '../components/klikk/SectionCard.vue';
import FilterBar from '../components/klikk/FilterBar.vue';
import KAlert from '../components/klikk/KAlert.vue';
import KFile from '../components/klikk/KFile.vue';
import KInput from '../components/klikk/KInput.vue';
import KSpinner from '../components/klikk/KSpinner.vue';
import KTable from '../components/klikk/KTable.vue';
import KTabs from '../components/klikk/KTabs.vue';

const { format } = useFormatCurrency();

const activeTab = ref('data');

const mappingKColumns = [
  { accessorKey: 'share_name', header: 'Share name', enableSorting: true },
  { accessorKey: 'company', header: 'Company', enableSorting: true },
  { accessorKey: 'share_code', header: 'Share code', enableSorting: true },
];

const transactionKColumns = [
  { accessorKey: 'date', header: 'Date', enableSorting: true },
  { accessorKey: 'account_number', header: 'Account', enableSorting: false },
  { accessorKey: 'description', header: 'Description', enableSorting: false },
  { accessorKey: 'share_name', header: 'Share name', enableSorting: false },
  { accessorKey: 'type', header: 'Type', enableSorting: false },
  { accessorKey: 'quantity', header: 'Quantity', enableSorting: false, meta: { align: 'right' } },
  { accessorKey: 'value', header: 'Value (R)', enableSorting: false, meta: { align: 'right' } },
];

const transactions = ref([]);
const transactionCount = ref(0);
const mappings = ref([]);
const unmappedShareNames = ref([]);
const loading = reactive({
  transactions: false,
  mappings: false,
  unmappedShareNames: false,
  uploadTransactions: false,
  uploadPortfolio: false,
  uploadMapping: false,
  exportCompanies: false,
  exportShareNames: false,
  exportTransactions: false,
});

const uploadFiles = reactive({
  transactions: null,
  portfolio: null,
  mapping: null,
});

const uploadResult = reactive({
  transactions: null,
  portfolio: null,
  mapping: null,
});

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
  loading.transactions = true;
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
  } catch (err) {
    transactions.value = [];
    transactionCount.value = 0;
    console.error(err);
  } finally {
    loading.transactions = false;
  }
}

function goPage(delta) {
  pagination.offset = Math.max(0, pagination.offset + delta * pagination.rowsPerPage);
  fetchTransactions();
}

async function uploadTransactions() {
  const file = uploadFiles.transactions;
  if (!file) return;
  loading.uploadTransactions = true;
  uploadResult.transactions = null;
  try {
    const data = await apiUploadTransactions(file);
    uploadResult.transactions = {
      message: data.message || (data.created != null ? `Created ${data.created} transaction(s).` : 'Upload successful.'),
    };
    uploadFiles.transactions = null;
    fetchTransactions();
  } catch (err) {
    uploadResult.transactions = {
      error: err.response?.data?.error || err.message || 'Upload failed.',
    };
  } finally {
    loading.uploadTransactions = false;
  }
}

async function uploadPortfolio() {
  const files = uploadFiles.portfolio;
  if (!files?.length) return;
  const fileList = Array.isArray(files) ? files : [files];
  loading.uploadPortfolio = true;
  uploadResult.portfolio = null;
  try {
    const data = await apiUploadPortfolio(fileList);
    const msg = data.success
      ? `Processed ${data.successful_files ?? fileList.length} file(s).`
      : (data.message || (data.failed_files ? `Some failed: ${data.failed_files}.` : 'Upload completed.'));
    uploadResult.portfolio = { message: msg };
    uploadFiles.portfolio = null;
  } catch (err) {
    uploadResult.portfolio = {
      error: err.response?.data?.error || err.message || 'Upload failed.',
    };
  } finally {
    loading.uploadPortfolio = false;
  }
}

async function uploadMapping() {
  const file = uploadFiles.mapping;
  if (!file) return;
  loading.uploadMapping = true;
  uploadResult.mapping = null;
  try {
    const data = await apiUploadMapping(file);
    const created = data.created ?? 0;
    const updated = data.updated ?? 0;
    uploadResult.mapping = {
      message: data.message || `Created ${created}, updated ${updated} mapping(s).`,
    };
    uploadFiles.mapping = null;
  } catch (err) {
    uploadResult.mapping = {
      error: err.response?.data?.error || err.message || 'Upload failed.',
    };
  } finally {
    loading.uploadMapping = false;
  }
  refreshMappingsTab();
}

async function fetchMappings() {
  loading.mappings = true;
  try {
    const data = await getInvestecMappings();
    mappings.value = data.results || [];
  } catch (err) {
    mappings.value = [];
    console.error(err);
  } finally {
    loading.mappings = false;
  }
}

async function fetchUnmappedShareNames() {
  loading.unmappedShareNames = true;
  try {
    const data = await getInvestecUnmappedShareNames();
    unmappedShareNames.value = data.share_names || [];
  } catch (err) {
    unmappedShareNames.value = [];
    console.error(err);
  } finally {
    loading.unmappedShareNames = false;
  }
}

function refreshMappingsTab() {
  fetchMappings();
  fetchUnmappedShareNames();
}

function onTabChange(tab) {
  if (tab === 'mappings') refreshMappingsTab();
}

async function exportCompanies() {
  loading.exportCompanies = true;
  exportData.companies = null;
  try {
    const data = await getInvestecExportCompanies();
    exportData.companies = data;
  } catch (err) {
    exportData.companies = { count: 0, companies: [], error: err.response?.data?.error || err.message };
  } finally {
    loading.exportCompanies = false;
  }
}

async function exportShareNames() {
  loading.exportShareNames = true;
  exportData.shareNames = null;
  try {
    const data = await getInvestecExportShareNames();
    exportData.shareNames = data;
  } catch (err) {
    exportData.shareNames = { count: 0, share_names: [], error: err.response?.data?.error || err.message };
  } finally {
    loading.exportShareNames = false;
  }
}

async function exportTransactions() {
  loading.exportTransactions = true;
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
    loading.exportTransactions = false;
  }
}

onMounted(() => {
  fetchTransactions();
});
</script>

<style scoped>
.investec-upload-card {
  flex: 1;
  min-width: 220px;
  max-width: 320px;
}
</style>
