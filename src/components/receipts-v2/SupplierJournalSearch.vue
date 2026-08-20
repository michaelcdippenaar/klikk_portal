<template>
  <section class="sjs" aria-labelledby="supplier-journals-heading">
    <div class="sjs__header">
      <div>
        <h3 id="supplier-journals-heading">Supplier journals in Xero</h3>
        <p>Search the full supplier history. Closest amount and date matches appear first.</p>
      </div>
      <StatusPill label="Read only" tone="neutral" size="sm" />
    </div>

    <div class="sjs__search">
      <KInput
        v-model="supplierQuery"
        label="Supplier search"
        type="search"
        autocomplete="off"
        @keydown.enter.prevent="search(true)"
      />
      <button
        type="button"
        class="btn btn-primary sjs__search-button"
        :disabled="loading || !supplierQuery.trim()"
        @click="search(true)"
      >
        {{ loading && !groups.length ? 'Searching…' : 'Search all journals' }}
      </button>
    </div>

    <KAlert v-if="error" variant="error" :title="error" class="sjs__alert" />

    <div v-if="loading && !groups.length" class="sjs__loading">
      <KSpinner size="sm" tone="accent" /> Searching the mirrored Xero ledger…
    </div>

    <div v-else-if="searched" class="sjs__results">
      <div class="sjs__result-summary">
        <span>
          {{ groups.length }} transaction{{ groups.length === 1 ? '' : 's' }} from
          {{ loadedLineCount }} of {{ totalLineCount }} matching journal lines
        </span>
        <span v-if="receiptAmount" class="sjs__target">Receipt {{ formatMoney(receiptAmount) }}</span>
      </div>

      <div v-if="!groups.length" class="sjs__empty">
        No Xero journals were found for this supplier name. Try a shorter trading name or alias.
      </div>

      <article v-for="group in groups" :key="group.id" class="sjs__candidate">
        <div class="sjs__candidate-main">
          <div class="sjs__candidate-title">
            <strong>{{ group.supplier_name || supplierQuery }}</strong>
            <span>{{ group.date || 'No date' }} · {{ group.tenant_name }}</span>
          </div>
          <div class="sjs__candidate-amount">
            <strong>{{ formatMoney(group.amount) }}</strong>
            <StatusPill
              v-if="group.amount_delta != null"
              :tone="deltaTone(group.amount_delta)"
              :label="deltaLabel(group.amount_delta)"
              size="sm"
            />
          </div>
        </div>

        <dl class="sjs__facts">
          <div><dt>Source</dt><dd>{{ group.source_type }}</dd></div>
          <div><dt>Reference</dt><dd>{{ group.reference || '—' }}</dd></div>
          <div><dt>Journal</dt><dd>{{ journalLabel(group.journal_numbers) }}</dd></div>
          <div><dt>Accounts</dt><dd>{{ group.accounts.join(', ') || '—' }}</dd></div>
        </dl>

        <details class="sjs__lines">
          <summary>View {{ group.lines.length }} journal line{{ group.lines.length === 1 ? '' : 's' }}</summary>
          <div class="sjs__table-wrap">
            <table>
              <thead>
                <tr><th>Journal</th><th>Account</th><th>Description</th><th>Debit</th><th>Credit</th></tr>
              </thead>
              <tbody>
                <tr v-for="line in group.lines" :key="line.id">
                  <td>#{{ line.journal_number || '—' }}</td>
                  <td>{{ [line.account_code, line.account_name].filter(Boolean).join(' · ') || '—' }}</td>
                  <td>{{ line.description || '—' }}</td>
                  <td class="sjs__money">{{ formatMoney(line.debit) }}</td>
                  <td class="sjs__money">{{ formatMoney(line.credit) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      </article>

      <button
        v-if="loadedLineCount < totalLineCount"
        type="button"
        class="btn btn-ghost btn-sm sjs__more"
        :disabled="loading"
        @click="search(false)"
      >
        {{ loading ? 'Loading…' : 'Load more journals' }}
      </button>
    </div>

    <div v-else class="sjs__empty">
      Search after correcting the supplier name. This does not write to Xero.
    </div>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { searchXeroJournals } from '../../api/xeroJournals';
import { formatMoney } from '../../utils/receipts';
import { groupJournalLines } from '../../utils/receiptsV2';
import KAlert from '../klikk/KAlert.vue';
import KInput from '../klikk/KInput.vue';
import KSpinner from '../klikk/KSpinner.vue';
import StatusPill from '../klikk/StatusPill.vue';

const props = defineProps({
  supplier: { type: String, default: '' },
  receiptDate: { type: String, default: '' },
  receiptAmount: { type: [String, Number], default: '' },
});

const PAGE_LIMIT = 200;
const supplierQuery = ref(props.supplier || '');
const lines = ref([]);
const totalLineCount = ref(0);
const searched = ref(false);
const loading = ref(false);
const error = ref(null);

const loadedLineCount = computed(() => lines.value.length);
const groups = computed(() => groupJournalLines(lines.value, {
  receipt_date: props.receiptDate,
  total: props.receiptAmount,
}));

watch(() => props.supplier, (value) => {
  supplierQuery.value = value || '';
  lines.value = [];
  totalLineCount.value = 0;
  searched.value = false;
  error.value = null;
});

async function search(reset) {
  const contact = supplierQuery.value.trim();
  if (!contact || loading.value) return;
  if (reset) {
    lines.value = [];
    totalLineCount.value = 0;
  }
  loading.value = true;
  error.value = null;
  try {
    const data = await searchXeroJournals({
      contact,
      limit: PAGE_LIMIT,
      offset: reset ? 0 : lines.value.length,
    });
    // The Django endpoint returns `results`; the MCP adapter exposes the same
    // rows as `journals`. Accept both shapes so the production UI and agent
    // interface stay compatible with the same read-only search service.
    const incoming = Array.isArray(data?.results)
      ? data.results
      : (Array.isArray(data?.journals) ? data.journals : []);
    lines.value = reset ? incoming : [...lines.value, ...incoming];
    totalLineCount.value = Number(data?.count) || lines.value.length;
    searched.value = true;
  } catch (err) {
    error.value = 'Could not search the Xero journal mirror.';
    console.error(err);
  } finally {
    loading.value = false;
  }
}

function deltaTone(delta) {
  if (delta <= 0.02) return 'success';
  if (delta <= 10) return 'warning';
  return 'neutral';
}

function deltaLabel(delta) {
  if (delta <= 0.02) return 'Exact amount';
  return `${formatMoney(delta)} difference`;
}

function journalLabel(numbers) {
  if (!numbers?.length) return '—';
  return numbers.map((number) => `#${number}`).join(', ');
}
</script>

<style scoped>
.sjs {
  padding-top: var(--kdl-space-5);
  border-top: var(--kdl-border-width) solid var(--kdl-border-subtle);
}
.sjs__header,
.sjs__candidate-main,
.sjs__result-summary {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--kdl-space-4);
}
.sjs__header h3 {
  margin: 0;
  font-size: var(--kdl-font-size-body);
  color: var(--kdl-text-primary);
}
.sjs__header p {
  margin: var(--kdl-space-1) 0 0;
  font-size: var(--kdl-font-size-caption);
  color: var(--kdl-text-muted);
}
.sjs__search {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--kdl-space-2);
  align-items: end;
  margin-top: var(--kdl-space-3);
}
.sjs__search-button { min-height: var(--kdl-control-md); }
.sjs__alert,
.sjs__loading,
.sjs__results,
.sjs__empty { margin-top: var(--kdl-space-3); }
.sjs__loading {
  display: flex;
  align-items: center;
  gap: var(--kdl-space-2);
  color: var(--kdl-text-muted);
  font-size: var(--kdl-font-size-caption);
}
.sjs__result-summary {
  font-size: var(--kdl-font-size-caption);
  color: var(--kdl-text-muted);
}
.sjs__target {
  font-family: var(--kdl-font-mono);
  font-variant-numeric: tabular-nums;
}
.sjs__empty {
  padding: var(--kdl-space-4);
  border: var(--kdl-border-width) dashed var(--kdl-border);
  border-radius: var(--kdl-radius-md);
  color: var(--kdl-text-muted);
  font-size: var(--kdl-font-size-caption);
}
.sjs__candidate {
  margin-top: var(--kdl-space-3);
  padding: var(--kdl-space-3);
  border: var(--kdl-border-width) solid var(--kdl-border-subtle);
  border-radius: var(--kdl-radius-md);
  background: var(--kdl-surface-sunken);
}
.sjs__candidate-title,
.sjs__candidate-amount {
  display: flex;
  flex-direction: column;
  gap: var(--kdl-space-1);
}
.sjs__candidate-title strong { font-size: var(--kdl-font-size-small); }
.sjs__candidate-title span {
  font-size: var(--kdl-font-size-overline);
  color: var(--kdl-text-muted);
}
.sjs__candidate-amount {
  align-items: flex-end;
  font-family: var(--kdl-font-mono);
  font-variant-numeric: tabular-nums;
}
.sjs__facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--kdl-space-2) var(--kdl-space-4);
  margin: var(--kdl-space-3) 0 0;
}
.sjs__facts div { min-width: 0; }
.sjs__facts dt {
  font-size: var(--kdl-font-size-overline);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--kdl-text-hint);
}
.sjs__facts dd {
  margin: var(--kdl-space-1) 0 0;
  font-size: var(--kdl-font-size-caption);
  overflow-wrap: anywhere;
}
.sjs__lines { margin-top: var(--kdl-space-3); }
.sjs__lines summary {
  cursor: pointer;
  color: var(--kdl-accent);
  font-size: var(--kdl-font-size-caption);
}
.sjs__table-wrap { overflow-x: auto; margin-top: var(--kdl-space-2); }
.sjs__lines table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--kdl-font-size-overline);
}
.sjs__lines th,
.sjs__lines td {
  padding: var(--kdl-space-2);
  border-bottom: var(--kdl-border-width) solid var(--kdl-border-subtle);
  text-align: left;
  vertical-align: top;
}
.sjs__money {
  text-align: right !important;
  font-family: var(--kdl-font-mono);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.sjs__more { width: 100%; margin-top: var(--kdl-space-3); }
@media (max-width: 640px) {
  .sjs__search { grid-template-columns: 1fr; }
  .sjs__candidate-main { flex-direction: column; }
  .sjs__candidate-amount { align-items: flex-start; }
  .sjs__facts { grid-template-columns: 1fr; }
}
</style>
