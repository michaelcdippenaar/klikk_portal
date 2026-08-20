<!--
  FindingAttachments — the Attachments tab of the finding modal.

  Drag-and-drop zone + file picker, uploads with progress, a list with type
  icons, an in-modal viewer (img for png/jpg, iframe for pdf, download link
  otherwise) and a confirm-step delete.

  The parent owns the attachment list (it arrives on the finding detail
  payload); this component mutates it only through update:attachments so the
  modal's tab count and the table's attachment_count stay in one place.

  Upload rejections surface the API's own `detail` message (wrong type / too
  big / mismatched extension) — the backend allowlist is precise and hiding
  its wording behind a generic "upload failed" makes the allowlist feel broken.

  Danger colouring comes from the KDL Tailwind `danger` palette via @apply
  (light: danger-600, dark: danger-400 — the same pairing klikk.css uses),
  never from raw hex.
-->
<template>
  <div class="fa-root">
    <!-- Drop zone -->
    <div
      class="fa-dropzone"
      :class="{ 'fa-dropzone--over': dragOver }"
      @dragover.prevent="dragOver = true"
      @dragleave="dragOver = false"
      @drop.prevent="onDrop"
    >
      <!-- Lucide upload-cloud -->
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="fa-dropzone__icon"><polyline points="16 16 12 12 8 16" /><line x1="12" y1="12" x2="12" y2="21" /><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" /></svg>
      <p class="fa-dropzone__text">
        Drop files here, or
        <button type="button" class="fa-dropzone__browse" @click="openPicker">browse</button>
      </p>
      <p class="fa-dropzone__hint">PDF, PNG, JPG, XLSX, CSV or DOCX · up to 25 MB each</p>
      <input
        ref="pickerInput"
        type="file"
        class="fa-native-input"
        multiple
        accept=".pdf,.png,.jpg,.jpeg,.xlsx,.csv,.docx"
        tabindex="-1"
        aria-hidden="true"
        @change="onPick"
      />
    </div>

    <!-- In-flight uploads -->
    <ul v-if="uploads.length" class="fa-uploads">
      <li v-for="u in uploads" :key="u.key" class="fa-upload" :class="{ 'fa-upload--error': u.error }">
        <div class="fa-upload__row">
          <span class="fa-upload__name">{{ u.name }}</span>
          <span v-if="u.error" class="fa-upload__state">failed</span>
          <span v-else-if="u.done" class="fa-upload__state">done</span>
          <span v-else class="fa-upload__state">{{ u.pct == null ? 'uploading…' : `${u.pct}%` }}</span>
          <button
            v-if="u.error"
            type="button"
            class="btn btn-ghost btn-sm"
            @click="dismissUpload(u.key)"
          >
            Dismiss
          </button>
        </div>
        <div v-if="!u.error" class="fa-progress" role="progressbar" :aria-valuenow="u.pct ?? 0" aria-valuemin="0" aria-valuemax="100">
          <div class="fa-progress__bar" :style="{ width: `${u.done ? 100 : (u.pct ?? 5)}%` }" />
        </div>
        <!-- The API's own rejection message, verbatim. -->
        <p v-if="u.error" class="fa-upload__error" role="alert">{{ u.error }}</p>
      </li>
    </ul>

    <!-- Attachment list -->
    <ul v-if="attachments.length" class="fa-list">
      <li v-for="a in attachments" :key="a.id" class="fa-item">
        <span class="fa-item__icon" aria-hidden="true">
          <!-- image -->
          <svg v-if="kindOf(a) === 'image'" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
          <!-- pdf / text -->
          <svg v-else-if="kindOf(a) === 'pdf'" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
          <!-- spreadsheet -->
          <svg v-else-if="kindOf(a) === 'sheet'" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" /></svg>
          <!-- generic file -->
          <svg v-else xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><polyline points="13 2 13 9 20 9" /></svg>
        </span>

        <div class="fa-item__meta">
          <button
            v-if="viewableKind(a)"
            type="button"
            class="fa-item__name fa-item__name--viewable"
            @click="viewing = viewing?.id === a.id ? null : a"
          >
            {{ a.original_name || `Attachment ${a.id}` }}
          </button>
          <a
            v-else
            :href="a.view_url"
            target="_blank"
            rel="noopener"
            class="fa-item__name"
          >{{ a.original_name || `Attachment ${a.id}` }}</a>
          <span class="fa-item__sub">
            {{ a.content_type || 'unknown type' }} · {{ formatBytes(a.size) }}
            <template v-if="a.uploaded_by"> · {{ a.uploaded_by }}</template>
            <template v-if="a.created_at"> · {{ formatDateTime(a.created_at) }}</template>
          </span>
          <span v-if="a.note" class="fa-item__note">{{ a.note }}</span>
        </div>

        <div class="fa-item__actions">
          <a class="btn btn-ghost btn-sm" :href="a.view_url" target="_blank" rel="noopener">Open</a>
          <template v-if="confirmingId === a.id">
            <span class="fa-item__confirm">Delete?</span>
            <button type="button" class="btn-danger btn-sm" :disabled="deletingId === a.id" @click="confirmDelete(a)">
              {{ deletingId === a.id ? 'Deleting…' : 'Yes, delete' }}
            </button>
            <button type="button" class="btn btn-ghost btn-sm" :disabled="deletingId === a.id" @click="confirmingId = null">
              Cancel
            </button>
          </template>
          <button
            v-else
            type="button"
            class="btn btn-ghost btn-sm"
            aria-label="Delete attachment"
            @click="confirmingId = a.id"
          >
            Delete
          </button>
        </div>
      </li>
    </ul>
    <p v-else-if="!uploads.length" class="fa-empty">No attachments yet — drop a file above to add the first one.</p>

    <p v-if="actionError" class="fa-action-error" role="alert">{{ actionError }}</p>

    <!-- In-modal viewer -->
    <div v-if="viewing" class="fa-viewer">
      <div class="fa-viewer__bar">
        <span class="fa-viewer__title">{{ viewing.original_name || `Attachment ${viewing.id}` }}</span>
        <a class="btn btn-ghost btn-sm" :href="viewing.view_url" target="_blank" rel="noopener">Open in new tab</a>
        <button type="button" class="btn btn-ghost btn-sm" @click="viewing = null">Close preview</button>
      </div>
      <img
        v-if="viewableKind(viewing) === 'image'"
        :src="viewing.view_url"
        :alt="viewing.original_name || 'Attachment preview'"
        class="fa-viewer__img"
      />
      <iframe
        v-else-if="viewableKind(viewing) === 'pdf'"
        :src="viewing.view_url"
        :title="viewing.original_name || 'Attachment preview'"
        class="fa-viewer__frame"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { uploadFindingAttachment, deleteFindingAttachment } from '../../api/findings';
import { formatBytes, formatDateTime } from '../../utils/receipts';

const props = defineProps({
  findingId: { type: Number, required: true },
  attachments: { type: Array, default: () => [] },
});

const emit = defineEmits(['update:attachments']);

const pickerInput = ref(null);
const dragOver = ref(false);
const uploads = ref([]);
const viewing = ref(null);
const confirmingId = ref(null);
const deletingId = ref(null);
const actionError = ref(null);

let uploadSeq = 0;

// A different finding means none of this transient state applies any more.
watch(() => props.findingId, () => {
  uploads.value = [];
  viewing.value = null;
  confirmingId.value = null;
  actionError.value = null;
});

/** Icon bucket for the list. Extension is the fallback when content_type is blank. */
function kindOf(a) {
  const ct = String(a?.content_type || '').toLowerCase();
  const name = String(a?.original_name || '').toLowerCase();
  if (ct.startsWith('image/') || /\.(png|jpe?g)$/.test(name)) return 'image';
  if (ct === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (ct.includes('spreadsheet') || ct.includes('csv') || /\.(xlsx|csv)$/.test(name)) return 'sheet';
  return 'file';
}

/** 'image' | 'pdf' | null — what the in-modal viewer can render. */
function viewableKind(a) {
  const kind = kindOf(a);
  return kind === 'image' || kind === 'pdf' ? kind : null;
}

function openPicker() {
  pickerInput.value?.click();
}

function onPick(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = '';
  uploadAll(files);
}

function onDrop(event) {
  dragOver.value = false;
  uploadAll(Array.from(event.dataTransfer?.files || []));
}

async function uploadAll(files) {
  // Sequential on purpose: one progress bar per file stays honest, and a
  // rejection (type/size) is attributed to the exact file that caused it.
  for (const file of files) {
    const entry = { key: ++uploadSeq, name: file.name, pct: 0, done: false, error: null };
    uploads.value = [...uploads.value, entry];
    try {
      const created = await uploadFindingAttachment(props.findingId, file, {
        onProgress: (pct) => {
          entry.pct = pct;
          uploads.value = [...uploads.value];
        },
      });
      entry.done = true;
      uploads.value = [...uploads.value];
      emit('update:attachments', [created, ...props.attachments]);
      // A finished bar has said everything it has to say.
      setTimeout(() => dismissUpload(entry.key), 1500);
    } catch (err) {
      // Surface the backend's own message (allowlist / size / mismatch) verbatim.
      entry.error = err?.response?.data?.detail
        || `Upload of ${file.name} failed${err?.response?.status ? ` (HTTP ${err.response.status})` : ''}.`;
      uploads.value = [...uploads.value];
      console.error(err);
    }
  }
}

function dismissUpload(key) {
  uploads.value = uploads.value.filter((u) => u.key !== key);
}

async function confirmDelete(a) {
  deletingId.value = a.id;
  actionError.value = null;
  try {
    await deleteFindingAttachment(a.id);
    if (viewing.value?.id === a.id) viewing.value = null;
    emit('update:attachments', props.attachments.filter((x) => x.id !== a.id));
  } catch (err) {
    actionError.value = err?.response?.data?.detail || 'Deleting the attachment failed.';
    console.error(err);
  } finally {
    deletingId.value = null;
    confirmingId.value = null;
  }
}
</script>

<style scoped>
.fa-root {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ── Drop zone ──────────────────────────────────────────────────────────── */
.fa-dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 20px 16px;
  border: 1px dashed var(--kdl-border);
  border-radius: 10px;
  background: var(--kdl-surface-sunken, var(--kdl-hover-bg));
  text-align: center;
  transition: border-color var(--duration-short) var(--ease-standard),
              background var(--duration-short) var(--ease-standard);
}

@media (prefers-reduced-motion: reduce) {
  .fa-dropzone {
    transition: none;
  }
}

.fa-dropzone--over {
  border-color: var(--kdl-accent);
  background: var(--kdl-card-bg);
}

.fa-dropzone__icon {
  color: var(--kdl-text-hint);
}

.fa-dropzone__text {
  font-size: 13px;
  color: var(--kdl-text-secondary);
  margin: 0;
}

.fa-dropzone__browse {
  border: none;
  background: none;
  padding: 0;
  font: inherit;
  color: var(--kdl-accent);
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.fa-dropzone__hint {
  font-size: 11px;
  color: var(--kdl-text-muted);
  margin: 0;
}

.fa-native-input {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}

/* ── Uploads in flight ──────────────────────────────────────────────────── */
.fa-uploads {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fa-upload {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  border: 1px solid var(--kdl-border-subtle, var(--kdl-border));
  border-radius: 8px;
}

.fa-upload--error {
  @apply border-danger-400;
}

.fa-upload__row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.fa-upload__name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fa-upload__state {
  font-size: 11px;
  color: var(--kdl-text-muted);
  font-variant-numeric: tabular-nums;
}

.fa-progress {
  height: 4px;
  border-radius: 2px;
  background: var(--kdl-border-subtle, var(--kdl-border));
  overflow: hidden;
}

.fa-progress__bar {
  height: 100%;
  border-radius: 2px;
  background: var(--kdl-accent);
  transition: width var(--duration-medium) var(--ease-standard);
}

@media (prefers-reduced-motion: reduce) {
  .fa-progress__bar {
    transition: none;
  }
}

/* Danger text: danger-600 light / danger-400 dark — klikk.css's own pairing. */
.fa-upload__error,
.fa-item__confirm,
.fa-action-error {
  @apply text-danger-600;
}

:root[data-theme="dark"] .fa-upload__error,
:root[data-theme="dark"] .fa-item__confirm,
:root[data-theme="dark"] .fa-action-error {
  @apply text-danger-400;
}

.fa-upload__error {
  font-size: 12px;
  margin: 0;
  overflow-wrap: anywhere;
}

/* ── Attachment list ────────────────────────────────────────────────────── */
.fa-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.fa-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--kdl-border-subtle, var(--kdl-border));
  border-radius: 8px;
}

.fa-item__icon {
  display: flex;
  align-items: center;
  color: var(--kdl-text-hint);
  padding-top: 2px;
}

.fa-item__meta {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.fa-item__name {
  font-size: 13px;
  font-weight: 500;
  color: var(--kdl-accent);
  text-decoration: underline;
  text-underline-offset: 2px;
  overflow-wrap: anywhere;
  text-align: left;
}

.fa-item__name--viewable {
  border: none;
  background: none;
  padding: 0;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.fa-item__sub {
  font-size: 11px;
  color: var(--kdl-text-muted);
}

.fa-item__note {
  font-size: 12px;
  color: var(--kdl-text-secondary);
  white-space: pre-wrap;
}

.fa-item__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.fa-item__confirm {
  font-size: 12px;
}

.fa-empty {
  font-size: 12px;
  color: var(--kdl-text-muted);
  margin: 0;
}

.fa-action-error {
  font-size: 12px;
  margin: 0;
}

/* ── Viewer ─────────────────────────────────────────────────────────────── */
.fa-viewer {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border: 1px solid var(--kdl-border);
  border-radius: 8px;
  padding: 8px;
}

.fa-viewer__bar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.fa-viewer__title {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fa-viewer__img {
  max-width: 100%;
  max-height: 420px;
  object-fit: contain;
  border-radius: 6px;
  align-self: center;
}

.fa-viewer__frame {
  width: 100%;
  height: 420px;
  border: none;
  border-radius: 6px;
  background: var(--kdl-card-bg);
}
</style>
