<template>
  <q-page class="q-pa-md">
    <div class="text-h5 q-mb-md">Investec - Share holdings</div>

    <div class="text-subtitle1 q-mb-sm">Upload portfolio</div>
    <q-card class="q-mb-lg" style="max-width: 400px">
      <q-card-section>
        <q-file
          v-model="uploadFile"
          label="Excel file(s)"
          accept=".xlsx,.xls"
          outlined
          dense
          clearable
          multiple
          class="q-mb-sm"
        />
        <q-btn
          label="Upload"
          color="primary"
          :loading="loading"
          :disable="!(Array.isArray(uploadFile) ? uploadFile.length : uploadFile)"
          @click="uploadPortfolio"
        />
        <div v-if="result" class="q-mt-sm">
          <q-banner
            :class="result.error ? 'bg-negative' : 'bg-positive'"
            rounded
            dense
            class="text-white"
          >
            {{ result.message }}
          </q-banner>
          <div v-if="result.fileErrors && result.fileErrors.length" class="q-mt-xs">
            <q-banner
              v-for="(fe, i) in result.fileErrors"
              :key="i"
              class="bg-negative text-white q-mb-xs"
              rounded
              dense
            >
              <strong>{{ fe.filename }}</strong>: {{ fe.error }}
            </q-banner>
          </div>
        </div>
      </q-card-section>
    </q-card>
  </q-page>
</template>

<script setup>
import { ref } from 'vue';
import { uploadInvestecPortfolio } from '../api/endpoints';

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
