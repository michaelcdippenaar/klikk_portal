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
  </AppPage>
</template>

<script setup>
import { ref } from 'vue';
import { uploadInvestecPortfolio } from '../api/endpoints';
import AppPage from '../components/shell/AppPage.vue';
import PageHeader from '../components/klikk/PageHeader.vue';
import SectionCard from '../components/klikk/SectionCard.vue';
import KAlert from '../components/klikk/KAlert.vue';
import KFile from '../components/klikk/KFile.vue';
import KSpinner from '../components/klikk/KSpinner.vue';

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
    if (!isError) uploadFile.value = null;
  } catch (err) {
    const errData = err.response?.data;
    const errMsg = errData?.error || errData?.detail || err.message || 'Upload failed.';
    result.value = { message: errMsg, error: true, fileErrors: [] };
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
/* Max-width constraint on the upload card — replaces removed inline style="max-width: 400px" */
.isc-upload-card {
  max-width: 400px;
}
</style>
