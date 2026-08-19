<template>
  <AppPage>
    <PageHeader
      title="Receipts"
      subtitle="WhatsApp Slippies receipt register — review, flag, decide and reconcile against Xero"
    >
      <template #actions>
        <button
          class="btn btn-ghost btn-sm"
          :disabled="exporting !== null"
          @click="exportAs('csv')"
        >
          <!-- Lucide download -->
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="mr-1"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          {{ exporting === 'csv' ? 'Exporting…' : 'Export CSV' }}
        </button>
        <button
          class="btn btn-ghost btn-sm"
          :disabled="exporting !== null"
          @click="exportAs('xlsx')"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="mr-1"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          {{ exporting === 'xlsx' ? 'Exporting…' : 'Export XLSX' }}
        </button>
        <button class="btn btn-ghost btn-sm" :disabled="loading" @click="load">
          <!-- Lucide refresh-cw -->
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="mr-1"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          Refresh
        </button>
      </template>
    </PageHeader>

    <KAlert
      v-if="error"
      variant="error"
      :title="error"
      class="mb-4"
      dismissible
    />
    <KAlert
      v-if="actionError"
      :key="actionErrorSeq"
      variant="error"
      :title="actionError"
      class="mb-4"
      dismissible
    />

    <FilterBar class="mb-3">
      <KInput
        v-model="filters.q"
        label="Search"
        placeholder="Supplier, filename, category, note…"
        clearable
        :debounce="300"
        class="flex-1 min-w-56"
      />
      <KSelect
        v-model="filters.fy"
        label="FY"
        :options="FY_OPTIONS"
        class="ar-filter--narrow"
      />
      <KSelect
        v-model="filters.synced"
        label="Synced"
        :options="SYNCED_OPTIONS"
        class="ar-filter--narrow"
      />
      <KSelect
        v-model="filters.status"
        label="Xero status"
        :options="STATUS_OPTIONS"
        class="ar-filter--medium"
      />
      <KSelect
        v-model="filters.to_process"
        label="To process"
        :options="TO_PROCESS_OPTIONS"
        class="ar-filter--medium"
      />
      <KSelect
        v-model="filters.decision"
        label="Decision"
        :options="DECISION_FILTER_OPTIONS"
        class="ar-filter--medium"
      />
      <KInput
        v-model="filters.date_from"
        label="From"
        type="date"
        class="ar-filter--date"
      />
      <KInput
        v-model="filters.date_to"
        label="To"
        type="date"
        class="ar-filter--date"
      />
      <button
        class="btn btn-ghost btn-sm ar-filter__clear"
        :disabled="!filtersActive"
        @click="clearFilters"
      >
        Clear
      </button>
    </FilterBar>

    <div class="ar-count-row mb-2">
      <span class="text-sm text-muted">
        {{ countLabel }}
      </span>
      <KBadge
        :label="`Total ${formatMoney(totals.sum_total)}`"
        tone="accent"
        size="sm"
      />
      <KBadge
        v-if="filtersActive"
        label="Filtered"
        tone="muted"
        size="sm"
      />
    </div>

    <SectionCard>
      <EmptyState
        v-if="!loading && !error && rows.length === 0 && filtersActive"
        title="No receipts match"
        body="Clear one or more filters to widen the search."
      >
        <template #cta>
          <button class="btn btn-ghost btn-sm" @click="clearFilters">Clear filters</button>
        </template>
      </EmptyState>
      <EmptyState
        v-else-if="!loading && !error && rows.length === 0"
        title="No receipts yet"
        body="Receipts arrive via the WhatsApp Slippies sync. Nothing has been registered so far."
      />
      <KTable
        v-else
        :columns="columns"
        :data="rows"
        :loading="loading"
        dense
        pagination="server"
        :pageSize="filters.page_size"
        :pageSizeOptions="[filters.page_size]"
        :serverTotal="totals.count"
        :serverPage="filters.page - 1"
        @update:serverPage="onServerPage"
        @row-click="openDetail"
      >
        <template #cell-slip_ts="{ value, row }">
          <span :title="value || ''">{{ formatDateShort(value) }}</span>
          <span v-if="row.fy" class="ar-sub">{{ row.fy }}</span>
        </template>

        <template #cell-supplier="{ value, row }">
          <span :class="value ? '' : 'text-muted'" :title="row.filename || ''">{{ value || '—' }}</span>
        </template>

        <template #cell-total="{ value }">
          <span class="ar-mono" :class="value == null ? 'text-muted' : ''">{{ formatMoney(value) }}</span>
        </template>

        <template #cell-category="{ value }">
          <span :class="value ? '' : 'text-muted'">{{ value || '—' }}</span>
        </template>

        <template #cell-status_group="{ value, row }">
          <div class="ar-status" :title="row.xero_status || ''">
            <StatusPill :tone="statusTone(value)" :label="statusLabel(value)" size="sm" />
            <span v-if="row.journal" class="ar-sub">
              #{{ row.journal.journal_number }}
              <template v-if="row.journal.contact_name"> · {{ row.journal.contact_name }}</template>
              <template v-if="row.journal.amount != null"> · {{ formatMoney(row.journal.amount) }}</template>
            </span>
          </div>
        </template>

        <template #cell-to_process="{ row }">
          <span class="ar-inline-control" @click.stop>
            <KToggle
              :modelValue="!!row.review?.to_process"
              :disabled="isSaving(row.sha256)"
              @update:modelValue="(v) => setToProcess(row, v)"
            />
          </span>
        </template>

        <template #cell-decision="{ row }">
          <span class="ar-inline-control ar-inline-control--select" @click.stop>
            <KSelect
              :modelValue="row.review?.decision ? row.review.decision : NONE"
              :options="DECISION_SELECT_OPTIONS"
              :disabled="isSaving(row.sha256)"
              aria-label="Decision"
              class="ar-row-select"
              @update:modelValue="(v) => setDecision(row, v)"
            />
          </span>
        </template>

        <template #cell-comment_count="{ value }">
          <span :class="value ? '' : 'text-muted'">{{ value || 0 }}</span>
        </template>

        <template #cell-actions="{ row }">
          <span class="ar-actions" @click.stop>
            <button class="btn btn-ghost btn-xs" @click="openDetail(row)">View</button>
            <button class="btn btn-ghost btn-xs" @click="openDetail(row, { focusComment: true })">Comment</button>
          </span>
        </template>
      </KTable>
    </SectionCard>

    <!-- Receipt detail -->
    <KDialog
      v-model="detailOpen"
      :title="detailTitle"
      :description="detailDescription"
      size="xl"
    >
      <div v-if="detail" class="ar-detail">
        <!-- Left: the receipt itself -->
        <div class="ar-detail__media">
          <iframe
            v-if="detail.is_pdf"
            :src="detail.view_url"
            :title="`Receipt ${detail.filename || detail.sha256}`"
            class="ar-detail__frame"
          />
          <img
            v-else
            :src="detail.view_url"
            :alt="`Receipt ${detail.filename || detail.sha256}`"
            class="ar-detail__img"
          />
          <div class="ar-detail__media-meta">
            <span>{{ detail.filename || '—' }}</span>
            <span>{{ detail.mime || detail.mime_ext || '—' }} · {{ formatBytes(detail.byte_size) }}</span>
            <a :href="detail.view_url" target="_blank" rel="noopener" class="ar-link">Open original</a>
          </div>
        </div>

        <!-- Right: OCR, Xero, review, comments -->
        <div class="ar-detail__side">
          <div v-if="detailLoading" class="ar-detail__loading">
            <KSpinner size="sm" tone="accent" /> Loading detail…
          </div>

          <section class="ar-section">
            <h3 class="ar-section__heading">OCR</h3>
            <dl class="ar-dl">
              <dt>Supplier</dt><dd>{{ detail.supplier || '—' }}</dd>
              <dt>Total</dt><dd class="ar-mono">{{ formatMoney(detail.total) }}</dd>
              <dt>Slip date</dt><dd>{{ detail.slip_date || '—' }}</dd>
              <dt>Payment</dt><dd>{{ detail.payment_method || '—' }}</dd>
              <dt>Category</dt><dd>{{ detail.category || '—' }}</dd>
              <dt>Source</dt><dd>{{ detail.source || '—' }}</dd>
            </dl>
            <ul v-if="detail.items && detail.items.length" class="ar-items">
              <li v-for="(item, idx) in detail.items" :key="`${idx}-${item.description}`" class="ar-items__row">
                <span class="ar-items__desc">{{ item.description || '—' }}</span>
                <span class="ar-mono">{{ formatMoney(item.amount) }}</span>
              </li>
            </ul>
            <p v-else-if="!detailLoading" class="ar-sub">No line items extracted.</p>
          </section>

          <section class="ar-section">
            <h3 class="ar-section__heading">Xero</h3>
            <dl class="ar-dl">
              <dt>Status</dt>
              <dd>
                <StatusPill :tone="statusTone(detail.status_group)" :label="statusLabel(detail.status_group)" size="sm" />
                <span v-if="detail.xero_status && detail.xero_status !== detail.status_group" class="ar-sub">{{ detail.xero_status }}</span>
              </dd>
              <dt>Detail</dt><dd>{{ detail.xero_detail || '—' }}</dd>
              <dt>Synced</dt><dd>{{ detail.synced_to_xero ? 'Yes' : 'No' }}</dd>
              <dt>Org</dt><dd>{{ detail.xero_org || '—' }}</dd>
              <template v-if="detail.journal">
                <dt>Journal</dt><dd>#{{ detail.journal.journal_number }} · {{ detail.journal.date || '—' }}</dd>
                <dt>Contact</dt><dd>{{ detail.journal.contact_name || '—' }}</dd>
                <dt>Account</dt>
                <dd>
                  <template v-if="detail.journal.account_code">{{ detail.journal.account_code }} · </template>{{ detail.journal.account_name || '—' }}
                </dd>
                <dt>Amount</dt><dd class="ar-mono">{{ formatMoney(detail.journal.amount) }}</dd>
                <dt>Narrative</dt><dd>{{ detail.journal.description || '—' }}</dd>
              </template>
              <template v-else>
                <dt>Journal</dt><dd class="text-muted">Unmatched</dd>
              </template>
            </dl>
          </section>

          <section class="ar-section">
            <h3 class="ar-section__heading">Review</h3>
            <div class="ar-review">
              <KToggle
                label="To process"
                :modelValue="!!detail.review?.to_process"
                :disabled="isSaving(detail.sha256)"
                @update:modelValue="(v) => setToProcess(detail, v)"
              />
              <KSelect
                v-model="decisionDraft"
                label="Decision"
                :options="DECISION_SELECT_OPTIONS"
                :disabled="isSaving(detail.sha256)"
              />
              <label class="ar-field">
                <span class="ar-field__label">Note</span>
                <textarea
                  v-model="noteDraft"
                  class="ar-textarea"
                  rows="3"
                  placeholder="Why this decision — context for the bookkeeper / auditor"
                  :disabled="isSaving(detail.sha256)"
                />
              </label>
              <div class="ar-review__actions">
                <span class="ar-sub">
                  <template v-if="detail.review?.updated_at">
                    Last saved {{ formatDateTime(detail.review.updated_at) }}<template v-if="detail.review.updated_by"> by {{ detail.review.updated_by }}</template>
                  </template>
                </span>
                <button
                  class="btn btn-primary btn-sm"
                  :disabled="!reviewDirty || isSaving(detail.sha256)"
                  @click="saveReview"
                >
                  {{ isSaving(detail.sha256) ? 'Saving…' : 'Save review' }}
                </button>
              </div>
            </div>
          </section>

          <section class="ar-section">
            <h3 class="ar-section__heading">
              Comments
              <span class="ar-section__note">{{ (detail.comments || []).length }}</span>
            </h3>
            <ul v-if="detail.comments && detail.comments.length" class="ar-comments">
              <li v-for="c in detail.comments" :key="c.id" class="ar-comment">
                <div class="ar-comment__meta">
                  <span class="ar-comment__author">{{ c.author || 'Unknown' }}</span>
                  <span class="ar-sub">{{ formatDateTime(c.created_at) }}</span>
                </div>
                <p class="ar-comment__text">{{ c.text }}</p>
              </li>
            </ul>
            <p v-else-if="!detailLoading" class="ar-sub">No comments yet.</p>
            <form class="ar-comment-form" @submit.prevent="addComment">
              <textarea
                ref="commentInputRef"
                v-model="commentDraft"
                class="ar-textarea"
                rows="2"
                placeholder="Add a comment…"
                :disabled="commentSaving"
              />
              <div class="ar-review__actions">
                <span />
                <button
                  type="submit"
                  class="btn btn-ghost btn-sm"
                  :disabled="!commentDraft.trim() || commentSaving"
                >
                  {{ commentSaving ? 'Posting…' : 'Add comment' }}
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </KDialog>
  </AppPage>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  getReceipts,
  getReceipt,
  patchReceiptReview,
  postReceiptComment,
  downloadReceiptsExport,
} from '../api/receipts';
import {
  NONE,
  FY_OPTIONS,
  SYNCED_OPTIONS,
  STATUS_OPTIONS,
  TO_PROCESS_OPTIONS,
  DECISION_FILTER_OPTIONS,
  DECISION_SELECT_OPTIONS,
  formatMoney,
  formatDateShort,
  formatDateTime,
  formatBytes,
  statusTone,
  statusLabel,
  defaultFilters,
  hydrateFromQuery,
  buildRouteQuery,
  buildApiParams,
  hasActiveFilters,
} from '../utils/receipts';
import AppPage from '../components/shell/AppPage.vue';
import PageHeader from '../components/klikk/PageHeader.vue';
import SectionCard from '../components/klikk/SectionCard.vue';
import EmptyState from '../components/klikk/EmptyState.vue';
import FilterBar from '../components/klikk/FilterBar.vue';
import KAlert from '../components/klikk/KAlert.vue';
import KBadge from '../components/klikk/KBadge.vue';
import KDialog from '../components/klikk/KDialog.vue';
import KInput from '../components/klikk/KInput.vue';
import KSelect from '../components/klikk/KSelect.vue';
import KSpinner from '../components/klikk/KSpinner.vue';
import KTable from '../components/klikk/KTable.vue';
import KToggle from '../components/klikk/KToggle.vue';
import StatusPill from '../components/klikk/StatusPill.vue';

const route = useRoute();
const router = useRouter();

// ── List state ──────────────────────────────────────────────────────────────
const filters = reactive(hydrateFromQuery(route.query));
const rows = ref([]);
const totals = reactive({ count: 0, sum_total: null });
const loading = ref(false);
const error = ref(null);
const actionError = ref(null);
const actionErrorSeq = ref(0);
const exporting = ref(null);
const savingIds = reactive(new Set());

const columns = [
  { accessorKey: 'slip_ts', header: 'Date', enableSorting: false, meta: { width: '110px' } },
  { accessorKey: 'supplier', header: 'Supplier', enableSorting: false, meta: { width: '180px' } },
  { accessorKey: 'total', header: 'Total', enableSorting: false, meta: { align: 'right', width: '120px' } },
  { accessorKey: 'category', header: 'Category', enableSorting: false, meta: { width: '140px' } },
  { accessorKey: 'status_group', header: 'Xero status', enableSorting: false, meta: { width: '220px' } },
  { id: 'to_process', accessorFn: (r) => !!r.review?.to_process, header: 'To process', enableSorting: false, meta: { align: 'center', width: '96px' } },
  { id: 'decision', accessorFn: (r) => r.review?.decision || '', header: 'Decision', enableSorting: false, meta: { width: '150px' } },
  { accessorKey: 'comment_count', header: 'Comments', enableSorting: false, meta: { align: 'center', width: '90px' } },
  { id: 'actions', header: '', enableSorting: false, meta: { width: '140px' } },
];

const filtersActive = computed(() => hasActiveFilters(filters));

const countLabel = computed(() => {
  if (loading.value && !rows.value.length) return 'Loading receipts…';
  const total = Number(totals.count) || 0;
  if (!total) return 'No receipts';
  const start = (filters.page - 1) * filters.page_size + 1;
  const end = Math.min(filters.page * filters.page_size, total);
  return `Showing ${start}–${end} of ${total} receipts`;
});

function isSaving(sha) {
  return savingIds.has(sha);
}

// KAlert hides itself on dismiss; bump the key so a new error re-mounts it.
function raiseActionError(message) {
  actionError.value = message;
  actionErrorSeq.value += 1;
}

// ── Fetch ───────────────────────────────────────────────────────────────────
let requestSeq = 0;

async function load() {
  const seq = ++requestSeq;
  loading.value = true;
  error.value = null;
  try {
    const data = await getReceipts(buildApiParams(filters));
    if (seq !== requestSeq) return; // stale response
    rows.value = Array.isArray(data?.results) ? data.results : [];
    totals.count = Number(data?.totals?.count ?? data?.count ?? rows.value.length) || 0;
    totals.sum_total = data?.totals?.sum_total ?? null;
    // Clamp page if the server says we're past the end (e.g. a filter shrank the set).
    const numPages = Number(data?.num_pages) || 1;
    if (filters.page > numPages && numPages >= 1) {
      filters.page = numPages;
    }
  } catch (err) {
    if (seq !== requestSeq) return;
    error.value = 'Could not load the receipt register.';
    console.error(err);
  } finally {
    if (seq === requestSeq) loading.value = false;
  }
}

// ── URL sync ────────────────────────────────────────────────────────────────
function syncRoute() {
  const query = buildRouteQuery(filters);
  router.replace({ query });
}

// Filter change → back to page 1, refetch, sync URL.
watch(
  () => [filters.q, filters.fy, filters.synced, filters.status, filters.to_process,
    filters.decision, filters.date_from, filters.date_to],
  () => {
    filters.page = 1;
    load();
    syncRoute();
  },
);

// Page change → refetch, sync URL.
watch(() => [filters.page, filters.page_size], () => {
  load();
  syncRoute();
});

function onServerPage(zeroBased) {
  filters.page = Number(zeroBased) + 1;
}

function clearFilters() {
  Object.assign(filters, defaultFilters());
}

// ── Export ──────────────────────────────────────────────────────────────────
async function exportAs(format) {
  exporting.value = format;
  actionError.value = null;
  try {
    await downloadReceiptsExport(buildApiParams(filters, { includePaging: false }), format);
  } catch (err) {
    raiseActionError(`Export (${format.toUpperCase()}) failed.`);
    console.error(err);
  } finally {
    exporting.value = null;
  }
}

// ── Review writes (shared by table + dialog) ────────────────────────────────
function applyReviewLocally(sha, review) {
  rows.value = rows.value.map((r) => (r.sha256 === sha ? { ...r, review: { ...r.review, ...review } } : r));
  if (detail.value && detail.value.sha256 === sha) {
    detail.value = { ...detail.value, review: { ...detail.value.review, ...review } };
  }
}

async function patchReview(sha, body, { optimistic } = {}) {
  const previous = (rows.value.find((r) => r.sha256 === sha) || detail.value || {}).review || {};
  if (optimistic) applyReviewLocally(sha, optimistic);
  savingIds.add(sha);
  actionError.value = null;
  try {
    const updated = await patchReceiptReview(sha, body);
    applyReviewLocally(sha, updated && typeof updated === 'object' ? updated : body);
    return true;
  } catch (err) {
    if (optimistic) applyReviewLocally(sha, previous);
    raiseActionError('Saving the review failed — change reverted.');
    console.error(err);
    return false;
  } finally {
    savingIds.delete(sha);
  }
}

function setToProcess(row, value) {
  return patchReview(row.sha256, { to_process: !!value }, { optimistic: { to_process: !!value } });
}

function setDecision(row, selectValue) {
  const decision = selectValue === NONE || selectValue == null ? '' : String(selectValue);
  return patchReview(row.sha256, { decision }, { optimistic: { decision } });
}

// ── Detail dialog ───────────────────────────────────────────────────────────
const detailOpen = ref(false);
const detail = ref(null);
const detailLoading = ref(false);
const decisionDraft = ref(NONE);
const noteDraft = ref('');
const commentDraft = ref('');
const commentSaving = ref(false);
const commentInputRef = ref(null);

const detailTitle = computed(() => {
  if (!detail.value) return '';
  const d = detail.value;
  return `${d.supplier || 'Receipt'} — ${formatMoney(d.total)}`;
});
const detailDescription = computed(() => {
  if (!detail.value) return '';
  const d = detail.value;
  return [formatDateShort(d.slip_ts), d.fy, d.category].filter(Boolean).join(' · ');
});

const reviewDirty = computed(() => {
  if (!detail.value) return false;
  const current = detail.value.review || {};
  const draftDecision = decisionDraft.value === NONE ? '' : String(decisionDraft.value || '');
  return draftDecision !== (current.decision || '') || noteDraft.value !== (current.note || '');
});

function syncDraftsFromDetail() {
  const review = detail.value?.review || {};
  decisionDraft.value = review.decision ? review.decision : NONE;
  noteDraft.value = review.note || '';
}

async function openDetail(row, { focusComment = false } = {}) {
  if (!row || !row.sha256) return;
  detail.value = { ...row };
  syncDraftsFromDetail();
  commentDraft.value = '';
  detailOpen.value = true;
  detailLoading.value = true;
  try {
    const full = await getReceipt(row.sha256);
    if (detail.value && detail.value.sha256 === row.sha256) {
      detail.value = { ...detail.value, ...full };
      syncDraftsFromDetail();
    }
  } catch (err) {
    raiseActionError('Could not load the full receipt detail — showing the list row only.');
    console.error(err);
  } finally {
    detailLoading.value = false;
  }
  if (focusComment) {
    await nextTick();
    commentInputRef.value?.focus?.();
  }
}

async function saveReview() {
  if (!detail.value) return;
  const decision = decisionDraft.value === NONE ? '' : String(decisionDraft.value || '');
  await patchReview(detail.value.sha256, { decision, note: noteDraft.value });
  syncDraftsFromDetail();
}

async function addComment() {
  if (!detail.value) return;
  const text = commentDraft.value.trim();
  if (!text) return;
  const sha = detail.value.sha256;
  commentSaving.value = true;
  actionError.value = null;
  try {
    const created = await postReceiptComment(sha, text);
    if (detail.value && detail.value.sha256 === sha) {
      const comments = [...(detail.value.comments || []), created];
      detail.value = { ...detail.value, comments, comment_count: comments.length };
    }
    rows.value = rows.value.map((r) =>
      r.sha256 === sha ? { ...r, comment_count: (Number(r.comment_count) || 0) + 1 } : r,
    );
    commentDraft.value = '';
  } catch (err) {
    raiseActionError('Posting the comment failed.');
    console.error(err);
  } finally {
    commentSaving.value = false;
  }
}

watch(detailOpen, (open) => {
  if (!open) {
    detail.value = null;
    detailLoading.value = false;
  }
});

onMounted(() => {
  load();
  syncRoute();
});
</script>

<style scoped>
.ar-count-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ar-filter--narrow { flex: 0 1 130px; min-width: 120px; }
.ar-filter--medium { flex: 0 1 170px; min-width: 150px; }
.ar-filter--date   { flex: 0 1 160px; min-width: 140px; }
.ar-filter__clear  { align-self: flex-end; }

.ar-sub {
  display: block;
  font-size: 11px;
  line-height: 1.3;
  color: var(--kdl-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
}

.ar-mono {
  font-family: var(--kdl-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-variant-numeric: tabular-nums;
}

.ar-status {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ar-inline-control {
  display: inline-flex;
  align-items: center;
}

.ar-inline-control--select {
  width: 100%;
  min-width: 0;
}

.ar-row-select {
  width: 100%;
}

.ar-actions {
  display: inline-flex;
  gap: 4px;
}

.ar-link {
  color: var(--kdl-accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}

/* ── Detail dialog ──────────────────────────────────────────────────────── */
.ar-detail {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 20px;
  min-height: 420px;
}

@media (max-width: 840px) {
  .ar-detail {
    grid-template-columns: 1fr;
  }
}

.ar-detail__media {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.ar-detail__img {
  width: 100%;
  max-height: 70vh;
  object-fit: contain;
  border: 1px solid var(--kdl-border);
  border-radius: 8px;
  background: var(--kdl-surface-sunken, var(--kdl-hover-bg));
}

.ar-detail__frame {
  width: 100%;
  height: 70vh;
  border: 1px solid var(--kdl-border);
  border-radius: 8px;
  background: var(--kdl-surface-sunken, var(--kdl-hover-bg));
}

.ar-detail__media-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  font-size: 11px;
  color: var(--kdl-text-muted);
}

.ar-detail__side {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.ar-detail__loading {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--kdl-text-muted);
}

.ar-section__heading {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--kdl-text-secondary);
  margin-bottom: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--kdl-border-subtle, var(--kdl-border));
}

.ar-section__note {
  margin-left: 6px;
  font-weight: 400;
  opacity: 0.7;
}

.ar-dl {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  gap: 4px 10px;
  font-size: 13px;
  margin: 0;
}

.ar-dl dt {
  color: var(--kdl-text-muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  line-height: 1.6;
}

.ar-dl dd {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}

.ar-items {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  font-size: 12px;
  border-top: 1px dashed var(--kdl-border-subtle, var(--kdl-border));
}

.ar-items__row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 3px 0;
}

.ar-items__desc {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ar-review {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ar-review__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ar-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ar-field__label {
  font-size: 12px;
  font-weight: 500;
  color: var(--kdl-text-secondary);
}

.ar-textarea {
  width: 100%;
  font: inherit;
  font-size: 13px;
  line-height: 1.45;
  padding: 8px 10px;
  border: 1px solid var(--kdl-border);
  border-radius: 6px;
  background: var(--kdl-card-bg);
  color: var(--kdl-text-primary);
  resize: vertical;
}

.ar-textarea:focus-visible {
  outline: 2px solid var(--kdl-accent);
  outline-offset: -1px;
}

.ar-textarea:disabled {
  opacity: 0.6;
}

.ar-comments {
  list-style: none;
  margin: 0 0 10px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 260px;
  overflow-y: auto;
}

.ar-comment {
  padding: 8px 10px;
  border: 1px solid var(--kdl-border-subtle, var(--kdl-border));
  border-radius: 6px;
  background: var(--kdl-surface-sunken, var(--kdl-hover-bg));
}

.ar-comment__meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 2px;
}

.ar-comment__author {
  font-size: 12px;
  font-weight: 600;
}

.ar-comment__text {
  font-size: 13px;
  line-height: 1.45;
  white-space: pre-wrap;
  margin: 0;
}

.ar-comment-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
</style>
