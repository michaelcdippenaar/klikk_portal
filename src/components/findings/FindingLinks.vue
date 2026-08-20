<!--
  FindingLinks — the Linked evidence tab of the finding modal.

  Lists the finding's resolved links (slips, Xero documents, bank transactions,
  journals, invoices, Asana tasks) with their signed view_url where one exists,
  and offers a search-and-attach picker per kind, following the Receipts page's
  debounced-search UX.

  A link whose resolved.found is false renders as a VISIBLE "could not resolve"
  row — dangling refs are expected (a slip can be purged) and hiding them would
  quietly misstate the evidence trail.

  The parent owns the list; every change goes out through update:links.
-->
<template>
  <div class="fl-root">
    <!-- Existing links -->
    <ul v-if="links.length" class="fl-list">
      <li
        v-for="link in links"
        :key="link.id"
        class="fl-item"
        :class="{ 'fl-item--dangling': isDangling(link) }"
      >
        <KBadge :label="kindLabel(link.kind)" tone="muted" size="sm" />
        <div class="fl-item__meta">
          <template v-if="isDangling(link)">
            <span class="fl-item__unresolved">Could not resolve</span>
            <code class="fl-item__ref">{{ link.ref }}</code>
            <span v-if="link.label" class="fl-item__sub">{{ link.label }}</span>
            <span class="fl-item__sub">
              The referenced {{ kindLabel(link.kind).toLowerCase() }} no longer exists or was re-synced under a new id.
            </span>
          </template>
          <template v-else>
            <a
              v-if="link.resolved?.view_url"
              :href="link.resolved.view_url"
              target="_blank"
              rel="noopener"
              class="fl-item__title fl-item__title--link"
            >{{ link.resolved?.title || link.ref }}</a>
            <span v-else class="fl-item__title">{{ link.resolved?.title || link.ref }}</span>
            <span v-if="link.resolved?.subtitle" class="fl-item__sub">{{ link.resolved.subtitle }}</span>
            <span v-if="link.label && link.label !== link.resolved?.title" class="fl-item__sub">{{ link.label }}</span>
          </template>
        </div>
        <div class="fl-item__actions">
          <template v-if="confirmingId === link.id">
            <span class="fl-danger-text">Unlink?</span>
            <button type="button" class="btn-danger btn-sm" :disabled="removingId === link.id" @click="confirmUnlink(link)">
              {{ removingId === link.id ? 'Removing…' : 'Yes, unlink' }}
            </button>
            <button type="button" class="btn btn-ghost btn-sm" :disabled="removingId === link.id" @click="confirmingId = null">
              Cancel
            </button>
          </template>
          <button v-else type="button" class="btn btn-ghost btn-sm" @click="confirmingId = link.id">
            Unlink
          </button>
        </div>
      </li>
    </ul>
    <p v-else class="fl-empty">No linked evidence yet. Search below to attach slips, documents or transactions.</p>

    <p v-if="actionError" class="fl-danger-text fl-action-error" role="alert">{{ actionError }}</p>

    <!-- Search-and-attach picker -->
    <section class="fl-picker">
      <h4 class="fl-picker__heading">Attach evidence</h4>
      <div class="fl-picker__controls">
        <KSelect v-model="pickerKind" label="Kind" :options="KIND_OPTIONS" class="fl-picker__kind" />

        <!-- Slip: supplier / amount range -->
        <template v-if="pickerKind === 'slip'">
          <KInput v-model="slipQuery.q" label="Supplier / text" placeholder="e.g. Builders" clearable :debounce="300" class="fl-picker__grow" />
          <KInput v-model="slipQuery.min_total" label="Min amount" placeholder="0.00" clearable :debounce="300" class="fl-picker__amount" />
          <KInput v-model="slipQuery.max_total" label="Max amount" placeholder="0.00" clearable :debounce="300" class="fl-picker__amount" />
        </template>

        <!-- Xero document: text / amount / dates -->
        <template v-else-if="pickerKind === 'xero_document'">
          <KInput v-model="docQuery.q" label="Contact / file / description" placeholder="e.g. Aurras" clearable :debounce="300" class="fl-picker__grow" />
          <KInput v-model="docQuery.amount" label="Amount" placeholder="0.00" clearable :debounce="300" class="fl-picker__amount" />
          <KInput v-model="docQuery.date_from" label="From" type="date" class="fl-picker__date" />
          <KInput v-model="docQuery.date_to" label="To" type="date" class="fl-picker__date" />
        </template>

        <!-- Bank transaction: description / amount / dates -->
        <template v-else-if="pickerKind === 'bank_transaction'">
          <KInput v-model="bankQuery.description" label="Description" placeholder="e.g. WANDELI" clearable :debounce="300" class="fl-picker__grow" />
          <KInput v-model="bankQuery.amount" label="Amount" placeholder="0.00" clearable :debounce="300" class="fl-picker__amount" />
          <KInput v-model="bankQuery.date_from" label="From" type="date" class="fl-picker__date" />
          <KInput v-model="bankQuery.date_to" label="To" type="date" class="fl-picker__date" />
        </template>

        <!-- Journal / invoice / Asana: direct reference entry -->
        <template v-else>
          <KInput
            v-model="manualRef"
            :label="manualRefLabel"
            :placeholder="manualRefPlaceholder"
            clearable
            class="fl-picker__grow"
          />
          <KInput v-model="manualLabel" label="Label (optional)" placeholder="Shown on the finding" clearable class="fl-picker__grow" />
          <button
            type="button"
            class="btn btn-primary btn-sm fl-picker__attach"
            :disabled="!manualRef.trim() || attachingRef !== null"
            @click="attachManual"
          >
            {{ attachingRef !== null ? 'Attaching…' : 'Attach' }}
          </button>
        </template>
      </div>

      <!-- Search results (search kinds only) -->
      <div v-if="isSearchKind" class="fl-results">
        <div v-if="searching" class="fl-results__state">
          <KSpinner size="sm" tone="accent" /> Searching…
        </div>
        <p v-else-if="searchError" class="fl-danger-text fl-results__state" role="alert">{{ searchError }}</p>
        <p v-else-if="!searchTouched" class="fl-results__state">Type above to search.</p>
        <p v-else-if="!results.length" class="fl-results__state">No matches.</p>
        <ul v-else class="fl-results__list">
          <li v-for="r in results" :key="r.key" class="fl-result">
            <div class="fl-result__meta">
              <a
                v-if="r.view_url"
                :href="r.view_url"
                target="_blank"
                rel="noopener"
                class="fl-item__title fl-item__title--link"
              >{{ r.title }}</a>
              <span v-else class="fl-item__title">{{ r.title }}</span>
              <span v-if="r.subtitle" class="fl-item__sub">{{ r.subtitle }}</span>
            </div>
            <StatusPill v-if="alreadyLinked(pickerKind, r.ref)" tone="success" label="Linked" size="sm" />
            <button
              v-else
              type="button"
              class="btn btn-ghost btn-sm"
              :disabled="attachingRef !== null"
              @click="attachResult(r)"
            >
              {{ attachingRef === r.ref ? 'Attaching…' : 'Attach' }}
            </button>
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue';
import { addFindingLink, deleteFindingLink, searchXeroDocuments, searchBankTransactions } from '../../api/findings';
import { getReceipts } from '../../api/receipts';
import { formatMoney } from '../../utils/receipts';
import KBadge from '../klikk/KBadge.vue';
import StatusPill from '../klikk/StatusPill.vue';
import KInput from '../klikk/KInput.vue';
import KSelect from '../klikk/KSelect.vue';
import KSpinner from '../klikk/KSpinner.vue';

const props = defineProps({
  findingId: { type: Number, required: true },
  links: { type: Array, default: () => [] },
});

const emit = defineEmits(['update:links']);

// ── Vocabulary ───────────────────────────────────────────────────────────────

const KIND_LABELS = {
  slip: 'Slip',
  xero_document: 'Xero document',
  bank_transaction: 'Bank transaction',
  journal: 'Journal',
  invoice: 'Invoice',
  asana: 'Asana task',
};

const KIND_OPTIONS = Object.entries(KIND_LABELS).map(([value, label]) => ({ value, label }));

/** Kinds with a server-side search; the rest attach by direct reference. */
const SEARCH_KINDS = ['slip', 'xero_document', 'bank_transaction'];

function kindLabel(kind) {
  return KIND_LABELS[kind] || kind || 'link';
}

function isDangling(link) {
  return link?.resolved?.found === false;
}

// ── Existing-list actions ────────────────────────────────────────────────────

const confirmingId = ref(null);
const removingId = ref(null);
const actionError = ref(null);

async function confirmUnlink(link) {
  removingId.value = link.id;
  actionError.value = null;
  try {
    await deleteFindingLink(link.id);
    emit('update:links', props.links.filter((l) => l.id !== link.id));
  } catch (err) {
    actionError.value = err?.response?.data?.detail || 'Removing the link failed.';
    console.error(err);
  } finally {
    removingId.value = null;
    confirmingId.value = null;
  }
}

function alreadyLinked(kind, refValue) {
  return props.links.some((l) => l.kind === kind && String(l.ref) === String(refValue));
}

// ── Picker state ─────────────────────────────────────────────────────────────

const pickerKind = ref('slip');
const isSearchKind = computed(() => SEARCH_KINDS.includes(pickerKind.value));

const slipQuery = reactive({ q: '', min_total: '', max_total: '' });
const docQuery = reactive({ q: '', amount: '', date_from: '', date_to: '' });
const bankQuery = reactive({ description: '', amount: '', date_from: '', date_to: '' });

const manualRef = ref('');
const manualLabel = ref('');

const manualRefLabel = computed(() => {
  if (pickerKind.value === 'journal') return 'Journal number';
  if (pickerKind.value === 'invoice') return 'Invoice number';
  return 'Asana task gid';
});

const manualRefPlaceholder = computed(() => {
  if (pickerKind.value === 'journal') return 'e.g. 12345';
  if (pickerKind.value === 'invoice') return 'e.g. INV-0042';
  return 'e.g. 1217633700114593';
});

const searching = ref(false);
const searchError = ref(null);
const searchTouched = ref(false);
const results = ref([]);
const attachingRef = ref(null);

let searchSeq = 0;

function clean(params) {
  const out = {};
  for (const [k, v] of Object.entries(params)) {
    const s = String(v ?? '').trim();
    if (s !== '') out[k] = s;
  }
  return out;
}

/** Normalise each kind's rows into { key, ref, title, subtitle, view_url }. */
async function runSearch() {
  const seq = ++searchSeq;
  const kind = pickerKind.value;
  let params;
  if (kind === 'slip') params = clean(slipQuery);
  else if (kind === 'xero_document') params = clean(docQuery);
  else params = clean(bankQuery);

  if (!Object.keys(params).length) {
    searchTouched.value = false;
    results.value = [];
    searchError.value = null;
    return;
  }

  searchTouched.value = true;
  searching.value = true;
  searchError.value = null;
  try {
    let rows = [];
    if (kind === 'slip') {
      const data = await getReceipts({ ...params, page_size: 10 });
      rows = (data?.results || []).map((r) => ({
        key: r.sha256,
        ref: r.sha256,
        title: [r.supplier || r.filename || r.sha256, r.total != null ? formatMoney(r.total) : '']
          .filter(Boolean).join(' · '),
        subtitle: r.slip_date || r.date || '',
        view_url: r.view_url || null,
      }));
    } else if (kind === 'xero_document') {
      const data = await searchXeroDocuments({ ...params, limit: 10 });
      rows = (data?.results || []).map((r) => ({
        key: String(r.id),
        ref: String(r.id),
        title: r.file_name || `Document ${r.id}`,
        subtitle: [r.contact_name, r.invoice_number, r.date, r.total != null ? formatMoney(r.total) : '']
          .filter(Boolean).join(' · '),
        view_url: r.view_url || null,
      }));
    } else {
      const data = await searchBankTransactions({ ...params, limit: 10 });
      rows = (data?.results || []).map((r) => ({
        key: String(r.id),
        ref: String(r.id),
        title: r.description || `${r.type || 'Transaction'} ${formatMoney(r.amount)}`,
        // transaction_date on purpose — posting_date is a known-unreliable backfill artefact.
        subtitle: [r.transaction_date, r.amount != null ? formatMoney(r.amount) : '', r.account_name || r.account_number]
          .filter(Boolean).join(' · '),
        view_url: null,
      }));
    }
    if (seq !== searchSeq) return; // stale
    results.value = rows;
  } catch (err) {
    if (seq !== searchSeq) return;
    results.value = [];
    searchError.value = err?.response?.data?.detail || 'Search failed.';
    console.error(err);
  } finally {
    if (seq === searchSeq) searching.value = false;
  }
}

// KInput debounces the model updates; a plain deep watch is enough here.
watch([slipQuery, docQuery, bankQuery], () => {
  if (isSearchKind.value) runSearch();
});

watch(pickerKind, () => {
  results.value = [];
  searchError.value = null;
  searchTouched.value = false;
  if (isSearchKind.value) runSearch();
});

// ── Attach ───────────────────────────────────────────────────────────────────

async function attach(kind, refValue, label) {
  attachingRef.value = refValue;
  actionError.value = null;
  try {
    const data = await addFindingLink(props.findingId, { kind, ref: refValue, label: label || '' });
    const link = data?.link;
    if (link && !props.links.some((l) => l.id === link.id)) {
      emit('update:links', [...props.links, link]);
    }
    return true;
  } catch (err) {
    actionError.value = err?.response?.data?.detail || 'Attaching the link failed.';
    console.error(err);
    return false;
  } finally {
    attachingRef.value = null;
  }
}

function attachResult(r) {
  attach(pickerKind.value, r.ref, r.title);
}

async function attachManual() {
  const refValue = manualRef.value.trim();
  if (!refValue) return;
  const ok = await attach(pickerKind.value, refValue, manualLabel.value.trim());
  if (ok) {
    manualRef.value = '';
    manualLabel.value = '';
  }
}

// A different finding: reset all transient picker state.
watch(() => props.findingId, () => {
  confirmingId.value = null;
  actionError.value = null;
  results.value = [];
  searchError.value = null;
  searchTouched.value = false;
  manualRef.value = '';
  manualLabel.value = '';
});
</script>

<style scoped>
.fl-root {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ── Existing links ─────────────────────────────────────────────────────── */
.fl-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.fl-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--kdl-border-subtle, var(--kdl-border));
  border-radius: 8px;
}

.fl-item--dangling {
  border-style: dashed;
}

.fl-item__meta {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.fl-item__title {
  font-size: 13px;
  font-weight: 500;
  overflow-wrap: anywhere;
}

.fl-item__title--link {
  color: var(--kdl-accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.fl-item__sub {
  font-size: 11px;
  color: var(--kdl-text-muted);
  overflow-wrap: anywhere;
}

.fl-item__unresolved {
  font-size: 12px;
  font-weight: 600;
  @apply text-warning-700;
}

:root[data-theme="dark"] .fl-item__unresolved {
  @apply text-warning-500;
}

.fl-item__ref {
  font-family: var(--kdl-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11px;
  overflow-wrap: anywhere;
  color: var(--kdl-text-secondary);
}

.fl-item__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.fl-empty {
  font-size: 12px;
  color: var(--kdl-text-muted);
  margin: 0;
}

/* Danger text: danger-600 light / danger-400 dark — klikk.css's own pairing. */
.fl-danger-text {
  font-size: 12px;
  margin: 0;
  @apply text-danger-600;
}

:root[data-theme="dark"] .fl-danger-text {
  @apply text-danger-400;
}

.fl-action-error {
  overflow-wrap: anywhere;
}

/* ── Picker ─────────────────────────────────────────────────────────────── */
.fl-picker {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--kdl-border-subtle, var(--kdl-border));
  border-radius: 10px;
  background: var(--kdl-surface-sunken, var(--kdl-hover-bg));
}

.fl-picker__heading {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--kdl-text-secondary);
  margin: 0;
}

.fl-picker__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 8px;
}

.fl-picker__kind   { flex: 0 1 180px; min-width: 150px; }
.fl-picker__grow   { flex: 1 1 180px; min-width: 150px; }
.fl-picker__amount { flex: 0 1 110px; min-width: 96px; }
.fl-picker__date   { flex: 0 1 150px; min-width: 130px; }
.fl-picker__attach { align-self: flex-end; }

/* ── Results ────────────────────────────────────────────────────────────── */
.fl-results__state {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--kdl-text-muted);
  margin: 0;
}

.fl-results__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 260px;
  overflow-y: auto;
}

.fl-result {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border: 1px solid var(--kdl-border-subtle, var(--kdl-border));
  border-radius: 6px;
  background: var(--kdl-card-bg);
}

.fl-result__meta {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
</style>
