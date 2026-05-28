<template>
  <AppPage>
    <PageHeader title="Share Codes" subtitle="Investec share code mappings and company data" />

    <KTabs
      :tabs="[
        { name: 'share-codes', label: 'Share codes' },
        { name: 'unmapped', label: 'Share names in transactions not in mapping' },
      ]"
      v-model="activeTab"
      :url-sync="false"
      class="mb-4"
    />

    <template v-if="activeTab === 'share-codes'">
      <SectionCard>
        <template #actions>
          <div class="flex flex-wrap gap-2 items-center">
            <button
              class="btn btn-primary btn-outline btn-sm"
              :disabled="loadingExport"
              @click="downloadMapping"
            >
              <span v-if="loadingExport" class="inline-flex items-center gap-1">
                <KSpinner size="12" /> Downloading…
              </span>
              <span v-else>Download to Excel</span>
            </button>
            <button
              class="btn btn-primary btn-sm"
              :disabled="loadingUpload || !uploadFile"
              @click="uploadMapping"
            >
              <span v-if="loadingUpload" class="inline-flex items-center gap-1">
                <KSpinner size="12" /> Uploading…
              </span>
              <span v-else>Upload</span>
            </button>
            <KFile
              v-model="uploadFile"
              label="Excel file"
              accept=".xlsx,.xls"
              class="isc-file-input"
            />
            <button
              class="btn btn-ghost btn-sm"
              :disabled="loadingMappings"
              @click="refreshShareCodes"
            >
              <!-- Lucide refresh-cw -->
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="mr-1"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
              Refresh
            </button>
          </div>
        </template>

        <p class="text-sm text-muted mb-4">
          Download the current mapping to Excel, edit (add/change Share_Name, Share_Name2, Share_Name3, Company, Share_Code), then upload to update.
          Share_Name2 and Share_Name3 are alternative names used for the same share in transaction files.
        </p>
        <div v-if="uploadResult" class="mb-3">
          <KAlert
            :variant="uploadResult.error ? 'error' : 'success'"
            :body="uploadResult.error || uploadResult.message"
          />
        </div>
        <div v-if="exportResult && exportResult.error" class="mb-3">
          <KAlert variant="error" :body="exportResult.error" />
        </div>
        <KTable
          :columns="mappingKColumns"
          :data="mappings"
          :loading="loadingMappings"
          dense
          pagination="client"
          :pageSize="25"
          :pageSizeOptions="[25, 50, 100]"
        />
      </SectionCard>
    </template>

    <template v-if="activeTab === 'unmapped'">
      <SectionCard>
        <template #actions>
          <div class="flex items-center gap-3">
            <span class="text-sm font-medium">
              Share names in transactions not in mapping ({{ unmappedShareNames.length }})
            </span>
            <button
              class="btn btn-ghost btn-sm"
              :disabled="loadingUnmapped"
              @click="fetchUnmappedShareNames"
            >
              <!-- Lucide refresh-cw -->
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="mr-1"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
              Refresh
            </button>
          </div>
        </template>

        <p class="text-sm text-muted mb-3">
          Add these to the mapping table: download Share codes above, add rows for these names (and Company/Share_Code if you have them), then upload.
        </p>
        <EmptyState
          v-if="unmappedShareNames.length === 0 && !loadingUnmapped"
          title="No unmapped share names"
          body="All share names in transactions are mapped."
        />
        <ul v-else class="mt-2 space-y-1">
          <li v-for="(name, i) in unmappedShareNames" :key="i" class="text-sm py-1 border-b border-kdl-border-subtle last:border-0">
            {{ name }}
          </li>
        </ul>
      </SectionCard>
    </template>
  </AppPage>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import {
  getInvestecMappings,
  getInvestecUnmappedShareNames,
  uploadInvestecMapping,
} from '../api/endpoints';
import { API_BASE_URL, API_ENDPOINTS } from '../utils/constants';
import AppPage from '../components/shell/AppPage.vue';
import PageHeader from '../components/klikk/PageHeader.vue';
import SectionCard from '../components/klikk/SectionCard.vue';
import EmptyState from '../components/klikk/EmptyState.vue';
import KAlert from '../components/klikk/KAlert.vue';
import KFile from '../components/klikk/KFile.vue';
import KSpinner from '../components/klikk/KSpinner.vue';
import KTable from '../components/klikk/KTable.vue';
import KTabs from '../components/klikk/KTabs.vue';

const activeTab = ref('share-codes');

const mappingKColumns = [
  { accessorKey: 'share_name', header: 'Share name', enableSorting: true },
  { accessorKey: 'share_name2', header: 'Alt name 2', enableSorting: true },
  { accessorKey: 'share_name3', header: 'Alt name 3', enableSorting: true },
  { accessorKey: 'company', header: 'Company', enableSorting: true },
  { accessorKey: 'share_code', header: 'Share code', enableSorting: true },
];

const mappings = ref([]);
const unmappedShareNames = ref([]);
const uploadFile = ref(null);
const uploadResult = ref(null);
const exportResult = ref(null);
const loadingMappings = ref(false);
const loadingUnmapped = ref(false);
const loadingUpload = ref(false);
const loadingExport = ref(false);

async function fetchMappings() {
  loadingMappings.value = true;
  try {
    const data = await getInvestecMappings();
    mappings.value = data.results || [];
  } catch (err) {
    mappings.value = [];
    console.error(err);
  } finally {
    loadingMappings.value = false;
  }
}

async function fetchUnmappedShareNames() {
  loadingUnmapped.value = true;
  try {
    const data = await getInvestecUnmappedShareNames();
    unmappedShareNames.value = data.share_names || [];
  } catch (err) {
    unmappedShareNames.value = [];
    console.error(err);
  } finally {
    loadingUnmapped.value = false;
  }
}

function refreshShareCodes() {
  fetchMappings();
  fetchUnmappedShareNames();
}

function downloadMapping() {
  const token = localStorage.getItem('auth_token');
  const url = `${API_BASE_URL}${API_ENDPOINTS.INVESTEC_EXPORT_MAPPING}`;
  loadingExport.value = true;
  exportResult.value = null;
  fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    .then((res) => {
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : 'Share_Codes_Names_Company.xlsx';
      return res.blob().then((blob) => ({ blob, filename }));
    })
    .then(({ blob, filename }) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    })
    .catch((err) => {
      exportResult.value = { error: err.message || 'Export failed.' };
    })
    .finally(() => {
      loadingExport.value = false;
    });
}

async function uploadMapping() {
  const file = uploadFile.value;
  if (!file) return;
  loadingUpload.value = true;
  uploadResult.value = null;
  try {
    const data = await uploadInvestecMapping(file);
    uploadResult.value = {
      message: data.message || `Created ${data.created ?? 0}, updated ${data.updated ?? 0} mapping(s).`,
    };
    uploadFile.value = null;
    refreshShareCodes();
  } catch (err) {
    uploadResult.value = {
      error: err.response?.data?.error || err.message || 'Upload failed.',
    };
  } finally {
    loadingUpload.value = false;
  }
}

onMounted(() => {
  fetchMappings();
});
</script>

<style scoped>
/* File input minimum width — replaces removed inline style="min-width: 160px" */
.isc-file-input {
  min-width: 160px;
}
</style>
