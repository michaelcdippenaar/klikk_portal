<template>
  <AppPage>
    <PageHeader title="Share Holdings" subtitle="Investec portfolio positions" />

    <SectionCard title="Upload portfolio" class="isc-upload-card">
      <KFile
        v-model="uploadFile"
        label="Excel file(s)"
        accept=".xlsx,.xls"
        multiple
        class="mb-3"
      />
      <button
        class="btn btn-primary"
        :disabled="loading || !(Array.isArray(uploadFile) ? uploadFile?.length : uploadFile)"
        @click="uploadPortfolio"
      >
        <span v-if="loading" class="inline-flex items-center gap-1">
          <KSpinner size="14" /> Uploading…
        </span>
        <span v-else>Upload</span>
      </button>
      <div v-if="result" class="mt-3">
        <KAlert :variant="result.error ? 'error' : 'success'" :body="result.message" />
        <div v-if="result.fileErrors && result.fileErrors.length" class="flex flex-col gap-2 mt-2">
          <KAlert
            v-for="(fe, i) in result.fileErrors"
            :key="i"
            variant="error"
            :title="fe.filename"
            :body="fe.error"
          />
        </div>
      </div>
    </SectionCard>

    <!-- Holdings list -->
    <SectionCard class="mt-4">
      <template #actions>
        <div class="flex items-center gap-3">
          <FreshnessChip
            v-if="lastLoadedAt"
            :value="lastLoadedAt"
            prefix="Last loaded"
            :staleAfter="60"
          />
          <button
            class="btn btn-ghost btn-sm"
            :disabled="loadingPortfolio"
            @click="fetchPortfolio"
          >
            <!-- Lucide refresh-cw -->
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="mr-1"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            Refresh
          </button>
        </div>
      </template>

      <MonthCoverageStrip
        :coverage="portfolioCoverage"
        label="Holding months"
      />

      <EmptyState
        v-if="!loadingPortfolio && !portfolioError && holdings.length === 0"
        title="No holdings"
        body="Upload a portfolio file above to see your holdings here."
      />

      <KTable
        v-else
        :columns="holdingsColumns"
        :data="holdings"
        :loading="loadingPortfolio"
        :error="portfolioError || undefined"
        dense
        pagination="client"
        :pageSize="25"
        :pageSizeOptions="[25, 50, 100]"
      />
    </SectionCard>
  </AppPage>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { uploadInvestecPortfolio, getInvestecPortfolio } from '../api/endpoints';
import AppPage from '../components/shell/AppPage.vue';
import PageHeader from '../components/klikk/PageHeader.vue';
import SectionCard from '../components/klikk/SectionCard.vue';
import KAlert from '../components/klikk/KAlert.vue';
import KFile from '../components/klikk/KFile.vue';
import KSpinner from '../components/klikk/KSpinner.vue';
import KTable from '../components/klikk/KTable.vue';
import FreshnessChip from '../components/klikk/FreshnessChip.vue';
import EmptyState from '../components/klikk/EmptyState.vue';
import MonthCoverageStrip from '../components/klikk/MonthCoverageStrip.vue';

// ── Upload state ────────────────────────────────────────────────────────────

const uploadFile = ref(null);
const loading = ref(false);
const result = ref(null);

async function uploadPortfolio() {
  const files = uploadFile.value;
  if (!files?.length) return;
  const fileList = Array.isArray(files) ? files : [files];
  loading.value = true;
  result.value = null;
  try {
    const data = await uploadInvestecPortfolio(fileList);
    const successCount = data.successful_files ?? (data.success ? fileList.length : 0);
    const failedCount = data.failed_files ?? 0;
    const failedFiles = (data.files || []).filter((f) => !f.success);
    let msg = '';
    let isError = false;
    if (successCount > 0 && failedCount === 0) {
      msg = `Processed ${successCount} file(s) successfully.`;
    } else if (successCount > 0 && failedCount > 0) {
      msg = `${successCount} file(s) uploaded, ${failedCount} failed.`;
      isError = true;
    } else {
      msg = `Upload failed — ${failedCount} file(s) could not be processed.`;
      isError = true;
    }
    result.value = {
      message: msg,
      error: isError,
      fileErrors: failedFiles.map((f) => ({ filename: f.filename, error: f.error })),
    };
    if (!isError) {
      uploadFile.value = null;
      // Refresh the holdings list after a successful upload
      fetchPortfolio();
    }
  } catch (err) {
    const errData = err.response?.data;
    const errMsg = errData?.error || errData?.detail || err.message || 'Upload failed.';
    result.value = { message: errMsg, error: true, fileErrors: [] };
  } finally {
    loading.value = false;
  }
}

// ── Holdings list state ─────────────────────────────────────────────────────

const holdings = ref([]);
const loadingPortfolio = ref(false);
const portfolioError = ref(null);
const lastLoadedAt = ref(null);
const portfolioCoverage = ref(null);

const holdingsColumns = [
  { accessorKey: 'date', header: 'Date', enableSorting: true },
  { accessorKey: 'company', header: 'Company', enableSorting: true },
  { accessorKey: 'share_code', header: 'Code', enableSorting: true },
  { accessorKey: 'quantity', header: 'Quantity', enableSorting: true },
  { accessorKey: 'price', header: 'Price', enableSorting: true },
  { accessorKey: 'total_value', header: 'Total value', enableSorting: true },
  { accessorKey: 'portfolio_percent', header: 'Portfolio %', enableSorting: true },
  { accessorKey: 'profit_loss', header: 'P&L', enableSorting: true },
  { accessorKey: 'annual_income_zar', header: 'Annual income (R)', enableSorting: true },
];

async function fetchPortfolio() {
  loadingPortfolio.value = true;
  portfolioError.value = null;
  try {
    const data = await getInvestecPortfolio({ limit: 200 });
    holdings.value = data.results || [];
    portfolioCoverage.value = data.coverage || null;
    lastLoadedAt.value = new Date().toISOString();
  } catch (err) {
    portfolioError.value =
      err.response?.data?.error || err.message || 'Failed to load portfolio holdings.';
    holdings.value = [];
    portfolioCoverage.value = null;
  } finally {
    loadingPortfolio.value = false;
  }
}

onMounted(() => {
  fetchPortfolio();
});
</script>

<style scoped>
/* Max-width constraint on the upload card — replaces removed inline style="max-width: 400px" */
.isc-upload-card {
  max-width: 400px;
}
</style>
