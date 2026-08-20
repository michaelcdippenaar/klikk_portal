<template>
  <AppPage>
    <PageHeader
      title="Receipts V2"
      subtitle="AI-assisted receipt correction, supplier journal search and human confirmation"
    >
      <template #actions>
        <RouterLink :to="{ name: 'audit-receipts' }" class="btn btn-ghost btn-sm">Open original Receipts</RouterLink>
        <button class="btn btn-ghost btn-sm" :disabled="loading" @click="loadReceipts">Refresh</button>
      </template>
    </PageHeader>

    <KAlert
      variant="info"
      title="Human confirmation remains the control point"
      body="AI extraction can be corrected here. Confirming a missing receipt updates Klikk's review state only; no Xero record is created or changed."
      class="mb-4"
    />

    <FilterBar class="mb-3">
      <KInput
        v-model="filters.q"
        label="Search"
        placeholder="Supplier, filename, category…"
        clearable
        :debounce="300"
        class="flex-1 min-w-56"
      />
      <KSelect v-model="filters.fy" label="FY" :options="FY_OPTIONS" class="rv2-filter" />
      <KSelect v-model="filters.status" label="Xero status" :options="STATUS_OPTIONS" class="rv2-filter rv2-filter--wide" />
      <KSelect v-model="filters.to_process" label="Work queue" :options="TO_PROCESS_OPTIONS" class="rv2-filter rv2-filter--wide" />
      <button class="btn btn-ghost btn-sm rv2-filter__clear" :disabled="!filtersChanged" @click="resetFilters">
        Reset
      </button>
    </FilterBar>

    <div class="rv2-summary mb-3" aria-label="Receipt queue summary">
      <MetricTile label="Receipts in queue" :value="totals.count" />
      <MetricTile label="Filtered value" :value="formatMoney(totals.sum_total)" />
      <MetricTile label="Default order" value="Newest first" />
      <p class="rv2-summary__hint">Sort the complete queue by selecting Date, Supplier or Total.</p>
    </div>

    <KAlert v-if="error" variant="error" :title="error" class="mb-3" />

    <div class="rv2-workspace">
      <SectionCard class="rv2-queue" title="Needs review" :description="countLabel">
        <template #actions>
          <StatusPill label="AI triage" tone="warning" size="sm" />
        </template>

        <KTable
          :columns="columns"
          :data="rows"
          :loading="loading"
          dense
          pagination="server"
          :pageSize="filters.page_size"
          :pageSizeOptions="PAGE_SIZE_OPTIONS"
          :serverTotal="totals.count"
          :serverPage="filters.page - 1"
          :sortBy="sortBy"
          @update:serverPage="onServerPage"
          @update:pageSize="onPageSize"
          @update:sortBy="onSortBy"
          @row-click="openReview"
        >
          <template #cell-slip_ts="{ value, row }">
            <span>{{ formatDateShort(value) }}</span>
            <span class="rv2-sub">{{ row.fy || '' }}</span>
          </template>
          <template #cell-supplier="{ value }">
            <strong :class="value ? '' : 'text-muted'">{{ value || 'Unknown supplier' }}</strong>
          </template>
          <template #cell-total="{ value }">
            <span class="rv2-money">{{ formatMoney(value) }}</span>
          </template>
          <template #cell-review="{ row }">
            <StatusPill
              :tone="reviewTone(row.review?.decision)"
              :label="reviewLabel(row.review?.decision)"
              size="sm"
            />
          </template>
          <template #cell-actions="{ row }">
            <button class="btn btn-ghost btn-xs" @click.stop="openReview(row)">
              {{ selectedRow?.sha256 === row.sha256 ? 'Open' : 'Review' }}
            </button>
          </template>
        </KTable>
      </SectionCard>

      <SectionCard
        class="rv2-review"
        title="Receipt review"
        :description="selectedRow ? `${selectedRow.supplier || 'Unknown supplier'} · ${formatMoney(selectedRow.total)}` : 'Select a receipt from the queue.'"
      >
        <template #actions>
          <StatusPill v-if="selectedRow" :label="statusLabel(selectedRow.status_group)" :tone="statusTone(selectedRow.status_group)" size="sm" />
        </template>

        <EmptyState
          v-if="!selectedRow"
          title="Select a receipt to start"
          body="Review the scan, correct incomplete AI fields, search all supplier journals and confirm your decision."
        />

        <div v-else-if="detailLoading" class="rv2-loading">
          <KSpinner size="md" tone="accent" /> Loading the receipt and AI extraction…
        </div>

        <div v-else-if="detail && correctionDraft" class="rv2-review-body">
          <div class="rv2-receipt-meta">
            <div>
              <span>Source file</span>
              <strong>{{ detail.filename || 'Receipt' }}</strong>
            </div>
            <div>
              <span>AI result</span>
              <strong>{{ statusLabel(detail.status_group) }}</strong>
            </div>
            <div>
              <span>Correction draft</span>
              <strong>{{ hasSavedDraft ? 'Saved locally' : 'Not saved' }}</strong>
            </div>
          </div>

          <div class="rv2-receipt-workspace">
            <div class="rv2-document">
              <iframe
                v-if="detail.is_pdf && detail.view_url"
                :src="detail.view_url"
                :title="`Receipt ${detail.filename || detail.sha256}`"
              />
              <img
                v-else-if="detail.view_url"
                :src="detail.view_url"
                :alt="`Receipt ${detail.filename || detail.sha256}`"
              />
              <div v-else class="rv2-document__missing">Receipt preview is unavailable.</div>
            </div>

            <ReceiptReviewForm
              v-model="correctionDraft"
              :editable="editingCorrection"
              @edit="startCorrectionEdit"
              @cancel="cancelCorrectionEdit"
              @save="saveCorrectionDraft"
              @reset="resetCorrectionDraft"
            />
          </div>

          <SupplierJournalSearch
            :key="detail.sha256"
            :supplier="correctionDraft.supplier"
            :receiptDate="correctionDraft.receipt_date"
            :receiptAmount="correctionDraft.total"
          />

          <section class="rv2-confirm" aria-labelledby="confirm-missing-heading">
            <div>
              <h3 id="confirm-missing-heading">Your decision</h3>
              <p>Confirm only after checking the corrected receipt and supplier journals.</p>
            </div>
            <button
              class="btn btn-primary btn-sm"
              :disabled="confirming || correctionHasErrors || editingCorrection"
              @click="confirmMissing"
            >
              {{ confirming ? 'Confirming…' : 'Confirm missing from Xero' }}
            </button>
          </section>

          <section class="rv2-future" aria-labelledby="draft-bill-heading">
            <div>
              <h3 id="draft-bill-heading">Create a draft bill in Xero</h3>
              <p>The reviewed fields will feed this step once the controlled Xero draft-bill endpoint and receipt attachment flow are available.</p>
            </div>
            <button class="btn btn-ghost btn-sm" disabled>Create Xero draft — not connected yet</button>
          </section>
        </div>
      </SectionCard>
    </div>
  </AppPage>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getReceipt, getReceipts, patchReceiptReview } from '../api/receipts';
import {
  ALL,
  FY_OPTIONS,
  STATUS_OPTIONS,
  TO_PROCESS_OPTIONS,
  PAGE_SIZE_OPTIONS,
  formatDateShort,
  formatMoney,
  statusLabel,
  statusTone,
} from '../utils/receipts';
import { receiptToCorrectionDraft, validateCorrectionDraft } from '../utils/receiptsV2';
import AppPage from '../components/shell/AppPage.vue';
import EmptyState from '../components/klikk/EmptyState.vue';
import FilterBar from '../components/klikk/FilterBar.vue';
import KAlert from '../components/klikk/KAlert.vue';
import KInput from '../components/klikk/KInput.vue';
import KSelect from '../components/klikk/KSelect.vue';
import KSpinner from '../components/klikk/KSpinner.vue';
import KTable from '../components/klikk/KTable.vue';
import MetricTile from '../components/klikk/MetricTile.vue';
import PageHeader from '../components/klikk/PageHeader.vue';
import SectionCard from '../components/klikk/SectionCard.vue';
import StatusPill from '../components/klikk/StatusPill.vue';
import ReceiptReviewForm from '../components/receipts-v2/ReceiptReviewForm.vue';
import SupplierJournalSearch from '../components/receipts-v2/SupplierJournalSearch.vue';
import { useToast } from '../composables/useToast';

const route = useRoute();
const router = useRouter();
const toast = useToast();
const LOCAL_DRAFTS_KEY = 'klikk.receipts-v2.correction-drafts.v1';

const DEFAULTS = Object.freeze({
  q: '',
  fy: ALL,
  status: 'NOT IN XERO',
  to_process: 'true',
  page: 1,
  page_size: 50,
});

function routeString(key, fallback = '') {
  const value = route.query[key];
  if (Array.isArray(value)) return value[0] || fallback;
  return value == null || value === '' ? fallback : String(value);
}

const filters = reactive({
  q: routeString('q', DEFAULTS.q),
  fy: routeString('fy', DEFAULTS.fy),
  status: routeString('status', DEFAULTS.status),
  to_process: routeString('to_process', DEFAULTS.to_process),
  page: Math.max(1, Number(routeString('page', DEFAULTS.page)) || 1),
  page_size: PAGE_SIZE_OPTIONS.includes(Number(routeString('page_size', DEFAULTS.page_size)))
    ? Number(routeString('page_size', DEFAULTS.page_size))
    : DEFAULTS.page_size,
});

const SORTABLE_IDS = ['slip_ts', 'supplier', 'total'];
function initialSort() {
  const ordering = routeString('ordering', '-slip_ts');
  const match = ordering.match(/^(-?)([a-z_]+)$/);
  if (!match || !SORTABLE_IDS.includes(match[2])) return [{ id: 'slip_ts', desc: true }];
  return [{ id: match[2], desc: match[1] === '-' }];
}

const sortBy = ref(initialSort());
const rows = ref([]);
const totals = reactive({ count: 0, sum_total: null });
const loading = ref(false);
const error = ref(null);
const selectedRow = ref(null);
const detail = ref(null);
const detailLoading = ref(false);
const correctionDraft = ref(null);
const hasSavedDraft = ref(false);
const editingCorrection = ref(false);
const correctionEditSnapshot = ref(null);
const confirming = ref(false);

const columns = [
  { accessorKey: 'slip_ts', header: 'Date', enableSorting: true, meta: { width: '105px' } },
  { accessorKey: 'supplier', header: 'Supplier', enableSorting: true, meta: { width: '200px' } },
  { accessorKey: 'total', header: 'Total', enableSorting: true, meta: { align: 'right', width: '115px' } },
  { id: 'review', header: 'Review', enableSorting: false, meta: { width: '120px' } },
  { id: 'actions', header: '', enableSorting: false, meta: { width: '74px' } },
];

const filtersChanged = computed(() =>
  filters.q !== DEFAULTS.q
  || filters.fy !== DEFAULTS.fy
  || filters.status !== DEFAULTS.status
  || filters.to_process !== DEFAULTS.to_process,
);

const correctionHasErrors = computed(() =>
  !correctionDraft.value || Object.keys(validateCorrectionDraft(correctionDraft.value)).length > 0,
);

const countLabel = computed(() => {
  if (loading.value && !rows.value.length) return 'Loading receipts…';
  if (!totals.count) return 'No receipts';
  const start = (filters.page - 1) * filters.page_size + 1;
  const end = Math.min(filters.page * filters.page_size, totals.count);
  return `${start}–${end} of ${totals.count}`;
});

function orderingParam() {
  const sort = sortBy.value?.[0];
  return sort ? `${sort.desc ? '-' : ''}${sort.id}` : '-slip_ts';
}

function apiParams() {
  const params = {
    page: filters.page,
    page_size: filters.page_size,
    ordering: orderingParam(),
  };
  if (filters.q.trim()) params.q = filters.q.trim();
  if (filters.fy !== ALL) params.fy = filters.fy;
  if (filters.status !== ALL) params.status = filters.status;
  if (filters.to_process !== ALL) params.to_process = filters.to_process;
  return params;
}

function routeQuery() {
  const query = {};
  if (filters.q.trim()) query.q = filters.q.trim();
  if (filters.fy !== DEFAULTS.fy) query.fy = filters.fy;
  if (filters.status !== DEFAULTS.status) query.status = filters.status;
  if (filters.to_process !== DEFAULTS.to_process) query.to_process = filters.to_process;
  if (filters.page > 1) query.page = String(filters.page);
  if (filters.page_size !== DEFAULTS.page_size) query.page_size = String(filters.page_size);
  if (orderingParam() !== '-slip_ts') query.ordering = orderingParam();
  return query;
}

function syncRoute() {
  router.replace({ query: routeQuery() });
}

let requestSeq = 0;
async function loadReceipts() {
  const seq = ++requestSeq;
  loading.value = true;
  error.value = null;
  try {
    const data = await getReceipts(apiParams());
    if (seq !== requestSeq) return;
    rows.value = (Array.isArray(data?.results) ? data.results : []).map((row) => ({ ...row, id: row.sha256 }));
    totals.count = Number(data?.totals?.count ?? data?.count ?? rows.value.length) || 0;
    totals.sum_total = data?.totals?.sum_total ?? null;
  } catch (err) {
    if (seq !== requestSeq) return;
    error.value = 'Could not load the Receipts V2 work queue.';
    console.error(err);
  } finally {
    if (seq === requestSeq) loading.value = false;
  }
}

function readDrafts() {
  try {
    const raw = localStorage.getItem(LOCAL_DRAFTS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeDraft(sha, value) {
  const drafts = readDrafts();
  drafts[sha] = { value, saved_at: new Date().toISOString() };
  localStorage.setItem(LOCAL_DRAFTS_KEY, JSON.stringify(drafts));
}

async function openReview(row) {
  if (!row?.sha256) return;
  selectedRow.value = row;
  detail.value = { ...row };
  detailLoading.value = true;
  correctionDraft.value = null;
  editingCorrection.value = false;
  correctionEditSnapshot.value = null;
  try {
    const full = await getReceipt(row.sha256);
    if (selectedRow.value?.sha256 !== row.sha256) return;
    detail.value = { ...row, ...full };
    const saved = readDrafts()[row.sha256];
    correctionDraft.value = saved?.value || receiptToCorrectionDraft(detail.value);
    hasSavedDraft.value = !!saved?.value;
  } catch (err) {
    if (selectedRow.value?.sha256 !== row.sha256) return;
    detail.value = { ...row };
    correctionDraft.value = receiptToCorrectionDraft(row);
    hasSavedDraft.value = false;
    toast.warn('Full receipt detail could not be loaded. You can still review the queue information.');
    console.error(err);
  } finally {
    if (selectedRow.value?.sha256 === row.sha256) detailLoading.value = false;
  }
}

function saveCorrectionDraft() {
  if (!detail.value?.sha256 || !correctionDraft.value) return;
  try {
    writeDraft(detail.value.sha256, correctionDraft.value);
    hasSavedDraft.value = true;
    editingCorrection.value = false;
    correctionEditSnapshot.value = null;
    toast.success('Correction draft saved in this browser. Xero is unchanged.');
  } catch (err) {
    toast.error('Could not save the local correction draft.');
    console.error(err);
  }
}

function cloneCorrectionDraft(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function startCorrectionEdit() {
  if (!correctionDraft.value || editingCorrection.value) return;
  correctionEditSnapshot.value = cloneCorrectionDraft(correctionDraft.value);
  editingCorrection.value = true;
}

function cancelCorrectionEdit() {
  if (!editingCorrection.value) return;
  correctionDraft.value = cloneCorrectionDraft(correctionEditSnapshot.value);
  editingCorrection.value = false;
  correctionEditSnapshot.value = null;
}

function resetCorrectionDraft() {
  if (!detail.value) return;
  correctionDraft.value = receiptToCorrectionDraft(detail.value);
  hasSavedDraft.value = false;
}

async function confirmMissing() {
  if (!detail.value?.sha256 || correctionHasErrors.value || confirming.value) return;
  saveCorrectionDraft();
  confirming.value = true;
  try {
    const review = await patchReceiptReview(detail.value.sha256, {
      to_process: true,
      decision: 'CAPTURE',
    });
    detail.value = { ...detail.value, review: { ...detail.value.review, ...review } };
    selectedRow.value = { ...selectedRow.value, review: { ...selectedRow.value.review, ...review } };
    rows.value = rows.value.map((row) => row.sha256 === detail.value.sha256
      ? { ...row, review: { ...row.review, ...review } }
      : row);
    toast.success('Confirmed for capture in Klikk. Nothing was written to Xero.');
  } catch (err) {
    toast.error('Could not save the confirmation.');
    console.error(err);
  } finally {
    confirming.value = false;
  }
}

function resetFilters() {
  Object.assign(filters, DEFAULTS);
}

function onSortBy(next) {
  sortBy.value = Array.isArray(next) ? next.slice(0, 1) : [];
  filters.page = 1;
  loadReceipts();
  syncRoute();
}

function onServerPage(index) {
  filters.page = Number(index) + 1;
}

function onPageSize(value) {
  const size = Number(value);
  if (!PAGE_SIZE_OPTIONS.includes(size) || size === filters.page_size) return;
  filters.page_size = size;
  filters.page = 1;
}

function reviewLabel(decision) {
  if (decision === 'CAPTURE') return 'Confirmed';
  if (decision === 'ALREADY_IN_XERO') return 'Linked';
  if (decision) return String(decision).replaceAll('_', ' ').toLowerCase();
  return 'Needs review';
}

function reviewTone(decision) {
  if (decision === 'CAPTURE' || decision === 'ALREADY_IN_XERO') return 'success';
  if (decision) return 'neutral';
  return 'warning';
}

watch(
  () => [filters.q, filters.fy, filters.status, filters.to_process],
  () => {
    filters.page = 1;
    loadReceipts();
    syncRoute();
  },
);

watch(() => [filters.page, filters.page_size], () => {
  loadReceipts();
  syncRoute();
});

onMounted(() => {
  loadReceipts();
  syncRoute();
});
</script>

<style scoped>
.rv2-filter { flex: 0 1 130px; min-width: 120px; }
.rv2-filter--wide { flex-basis: 170px; min-width: 150px; }
.rv2-filter__clear { align-self: flex-end; }
.rv2-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(150px, 190px)) minmax(240px, 1fr);
  gap: var(--kdl-space-2);
  align-items: stretch;
}
.rv2-summary__hint {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  margin: 0;
  color: var(--kdl-text-muted);
  font-size: var(--kdl-font-size-caption);
}
.rv2-workspace {
  display: grid;
  grid-template-columns: minmax(390px, 0.65fr) minmax(720px, 1.35fr);
  gap: var(--kdl-space-4);
  align-items: start;
}
.rv2-queue,
.rv2-review { min-width: 0; }
.rv2-review {
  position: sticky;
  top: var(--kdl-space-4);
  max-height: calc(100vh - 100px);
  overflow: auto;
}
.rv2-sub {
  display: block;
  font-size: var(--kdl-font-size-overline);
  color: var(--kdl-text-muted);
}
.rv2-money {
  font-family: var(--kdl-font-mono);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.rv2-loading {
  min-height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--kdl-space-2);
  color: var(--kdl-text-muted);
  font-size: var(--kdl-font-size-caption);
}
.rv2-review-body {
  display: flex;
  flex-direction: column;
  gap: var(--kdl-space-5);
}
.rv2-receipt-workspace {
  display: grid;
  grid-template-columns: minmax(280px, 0.8fr) minmax(420px, 1.2fr);
  gap: var(--kdl-space-5);
  align-items: start;
}
.rv2-receipt-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--kdl-space-2);
}
.rv2-receipt-meta div {
  padding: var(--kdl-space-3);
  border: var(--kdl-border-width) solid var(--kdl-border-subtle);
  border-radius: var(--kdl-radius-md);
  background: var(--kdl-surface-sunken);
}
.rv2-receipt-meta span {
  display: block;
  font-size: var(--kdl-font-size-overline);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--kdl-text-hint);
}
.rv2-receipt-meta strong {
  display: block;
  margin-top: var(--kdl-space-1);
  font-size: var(--kdl-font-size-caption);
  overflow-wrap: anywhere;
}
.rv2-document {
  position: sticky;
  top: 0;
  min-height: 360px;
  max-height: 680px;
  display: flex;
  justify-content: center;
  border: var(--kdl-border-width) solid var(--kdl-border-subtle);
  border-radius: var(--kdl-radius-lg);
  background: var(--kdl-surface-sunken);
  overflow: hidden;
}
.rv2-document img { width: 100%; height: auto; max-height: 680px; object-fit: contain; }
.rv2-document iframe { width: 100%; height: 680px; border: 0; }
.rv2-document__missing {
  align-self: center;
  color: var(--kdl-text-muted);
  font-size: var(--kdl-font-size-caption);
}
.rv2-confirm,
.rv2-future {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--kdl-space-4);
  padding: var(--kdl-space-4);
  border: var(--kdl-border-width) solid var(--kdl-border-subtle);
  border-radius: var(--kdl-radius-lg);
}
.rv2-confirm { border-color: color-mix(in srgb, var(--kdl-accent) 35%, var(--kdl-border)); background: color-mix(in srgb, var(--kdl-accent) 5%, var(--kdl-card-bg)); }
.rv2-future { background: var(--kdl-surface-sunken); }
.rv2-confirm h3,
.rv2-future h3 { margin: 0; font-size: var(--kdl-font-size-small); }
.rv2-confirm p,
.rv2-future p {
  margin: var(--kdl-space-1) 0 0;
  font-size: var(--kdl-font-size-caption);
  color: var(--kdl-text-muted);
}
@media (max-width: 1420px) {
  .rv2-workspace { grid-template-columns: 1fr; }
  .rv2-review { position: static; max-height: none; }
}
@media (max-width: 880px) {
  .rv2-summary { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .rv2-summary__hint { grid-column: 1 / -1; justify-content: flex-start; }
  .rv2-receipt-workspace { grid-template-columns: 1fr; }
  .rv2-document { position: static; min-height: 260px; max-height: 520px; }
  .rv2-document img { max-height: 520px; }
  .rv2-document iframe { height: 520px; }
}
@media (max-width: 640px) {
  .rv2-summary { grid-template-columns: 1fr; }
  .rv2-summary__hint { grid-column: auto; }
  .rv2-receipt-meta { grid-template-columns: 1fr; }
  .rv2-confirm,
  .rv2-future { flex-direction: column; align-items: flex-start; }
}
</style>
