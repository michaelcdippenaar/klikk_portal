<template>
  <SectionCard
    title="Recurring-Cash Cost-Cut Finder"
    description="Recurring cash expense by account, this year vs prior. Excludes non-cash & one-offs. Targets are editable goals you set to challenge the run-rate — RAG flags track actuals against them."
  >
    <div class="cost-cut">
      <!-- Filter row -->
      <div class="cost-cut__filters">
        <KSelect
          v-model="entity"
          label="Entity"
          :options="entityOptions"
          placeholder="Select entity…"
        />
        <KSelect
          v-model="year"
          label="Year"
          :options="yearOptions"
        />
        <p class="cost-cut__basis">
          Recurring cash — excludes non-cash &amp; one-offs
        </p>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="cost-cut__status">
        <KSpinner size="sm" tone="accent" />
        <span>Reading live from TM1…</span>
      </div>

      <!-- Error -->
      <div v-else-if="errorMessage" class="cost-cut__status cost-cut__status--error">
        {{ errorMessage }}
      </div>

      <!-- Loaded -->
      <template v-else-if="report">
        <!-- Headline strip -->
        <div class="cost-cut__headline">
          <div class="cost-cut__total-tile">
            <MetricTile
              label="Total recurring cost"
              :value="formatCurrency(report.total_recurring_cost)"
              :tone="totalTone"
            />
            <!--
              YoY delta rendered separately from MetricTile's `trend` prop:
              MetricTile hardcodes up=green/down=red, which inverts cost
              semantics (a rising cost is BAD). We use the same cost-direction
              colour logic as CostCutRow (rise = red/bad, fall = green/good).
            -->
            <span
              v-if="totalYoy"
              class="cost-cut__total-delta cost-cut__total-num"
              :class="totalYoy.cls"
              :aria-label="`Year on year: ${totalYoy.label}`"
            >
              {{ totalYoy.label }} YoY
            </span>
          </div>

          <!-- Editable FY target tile -->
          <div class="cost-cut__target-tile">
            <span class="cost-cut__target-label">FY target</span>
            <div class="cost-cut__target-row">
              <KInput
                v-model="totalTargetDraft"
                type="number"
                prefix="R"
                placeholder="Set target"
                aria-label="Full-year total cost target"
                @blur="commitTotalTarget"
                @keyup="onTargetKeyup"
              />
              <KSpinner
                v-if="isSaving(TOTAL_METRIC_KEY)"
                size="xs"
                tone="muted"
                label="Saving target"
              />
            </div>
            <div class="cost-cut__target-pill">
              <StatusPill
                :tone="ragTone(report.total_rag)"
                :label="totalRagLabel"
                size="sm"
                :icon="report.total_rag !== 'none'"
              />
            </div>
          </div>

          <!-- RAG summary -->
          <div class="cost-cut__rag-tile">
            <span class="cost-cut__target-label">RAG summary</span>
            <div class="cost-cut__rag-pills">
              <StatusPill tone="error" :label="`${ragCounts.red} red`" size="sm" />
              <StatusPill tone="warning" :label="`${ragCounts.amber} amber`" size="sm" />
              <StatusPill tone="success" :label="`${ragCounts.green} green`" size="sm" />
              <StatusPill
                v-if="ragCounts.none"
                tone="neutral"
                :label="`${ragCounts.none} unset`"
                size="sm"
              />
            </div>
          </div>
        </div>

        <!-- Tabs -->
        <KTabs
          v-model="activeTab"
          :url-sync="false"
          aria-label="Cost-cut views"
          :tabs="tabDefs"
        />

        <!-- Where the money goes -->
        <div v-if="activeTab === 'accounts'" class="cost-cut__panel">
          <EmptyState
            v-if="!accounts.length"
            icon="∅"
            title="No recurring cost"
            body="No recurring cash expense was returned for this entity and year."
          />
          <div v-else class="cost-cut__table-wrap">
            <table class="cost-cut__table">
              <thead>
                <tr>
                  <th scope="col">Account</th>
                  <th scope="col" class="text-right">Recurring cost</th>
                  <th scope="col" class="text-right">% of cost</th>
                  <th scope="col" class="text-right">YoY</th>
                  <th scope="col" class="text-right">Target</th>
                  <th scope="col">RAG</th>
                </tr>
              </thead>
              <tbody>
                <CostCutRow
                  v-for="row in accounts"
                  :key="row.account_id"
                  :row="row"
                  :saving="isSaving(accountMetricKey(row.account_id))"
                  :format-currency="formatCurrency"
                  @commit="commitAccountTarget"
                />
              </tbody>
            </table>
          </div>
        </div>

        <!-- Top cut opportunities -->
        <div v-else-if="activeTab === 'opportunities'" class="cost-cut__panel">
          <p class="cost-cut__caption">
            Fastest-growing recurring costs — best candidates to challenge.
          </p>
          <EmptyState
            v-if="!opportunities.length"
            icon="∅"
            title="No opportunities"
            body="No growing recurring costs were identified for this entity and year."
          />
          <div v-else class="cost-cut__table-wrap">
            <table class="cost-cut__table">
              <thead>
                <tr>
                  <th scope="col">Account</th>
                  <th scope="col" class="text-right">Recurring cost</th>
                  <th scope="col" class="text-right">% of cost</th>
                  <th scope="col" class="text-right">YoY</th>
                  <th scope="col" class="text-right">Target</th>
                  <th scope="col">RAG</th>
                </tr>
              </thead>
              <tbody>
                <CostCutRow
                  v-for="row in opportunities"
                  :key="row.account_id"
                  :row="row"
                  emphasise-yoy
                  :saving="isSaving(accountMetricKey(row.account_id))"
                  :format-currency="formatCurrency"
                  @commit="commitAccountTarget"
                />
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </div>
  </SectionCard>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import SectionCard from '../klikk/SectionCard.vue';
import MetricTile from '../klikk/MetricTile.vue';
import StatusPill from '../klikk/StatusPill.vue';
import KSelect from '../klikk/KSelect.vue';
import KInput from '../klikk/KInput.vue';
import KTabs from '../klikk/KTabs.vue';
import KSpinner from '../klikk/KSpinner.vue';
import EmptyState from '../klikk/EmptyState.vue';
import CostCutRow from './CostCutRow.vue';
import { useDataStore } from '../../stores/data';
import { useToast } from '../../composables/useToast';
import {
  getCostCutReport,
  saveKpiTarget,
  deleteKpiTarget,
} from '../../api/planningAnalytics';

const KLIKK_FALLBACK_ENTITY = '41ebfa0e-012e-4ff1-82ba-a9a7585c536c';
const TOTAL_METRIC_KEY = 'cost_cut.total';

const dataStore = useDataStore();
const { selectedTenant, tenants } = storeToRefs(dataStore);
const toast = useToast();

const entity = ref(selectedTenant.value || KLIKK_FALLBACK_ENTITY);
// 2025 = latest year with loaded TM1 actuals. A dynamic latest-data-year will
// come from the backend later; until then this is the sensible default.
const year = ref('2025');
// Tracks whether `entity` has been seeded from the store's initial resolution.
// Once true, a later store change must not clobber a user-chosen entity.
const entitySeeded = ref(!!selectedTenant.value);

const report = ref(null);
const loading = ref(false);
const errorMessage = ref('');
// In-flight saves keyed by metricKey — supports concurrent edits on different
// rows without one clobbering another's spinner state.
const savingKeys = ref(new Set());
// Monotonic token so a stale post-save re-fetch can be dropped (last-wins).
let loadSeq = 0;
const totalTargetDraft = ref('');
const activeTab = ref('accounts');

function isSaving(metricKey) {
  return savingKeys.value.has(metricKey);
}

const tabDefs = [
  { name: 'accounts', label: 'Where the money goes' },
  { name: 'opportunities', label: 'Top cut opportunities' },
];

const entityOptions = computed(() =>
  (tenants.value || []).map((t) => ({
    value: t.tenant_id,
    label: t.tenant_name || t.tenant_id,
  })),
);

const yearOptions = computed(() => {
  const current = new Date().getFullYear();
  const years = [];
  for (let y = current; y >= 2022; y -= 1) {
    years.push({ value: String(y), label: String(y) });
  }
  return years;
});

const accounts = computed(() => report.value?.accounts ?? []);
const opportunities = computed(() => report.value?.top_opportunities ?? []);
const ragCounts = computed(() => ({
  green: report.value?.rag_counts?.green ?? 0,
  amber: report.value?.rag_counts?.amber ?? 0,
  red: report.value?.rag_counts?.red ?? 0,
  none: report.value?.rag_counts?.none ?? 0,
}));

// Total YoY trend — cost direction: a RISE in cost is bad (error/up),
// a FALL is good (success/down).
const totalPrior = computed(() =>
  accounts.value.reduce((sum, r) => sum + (Number(r.recurring_prior) || 0), 0),
);

const totalDeltaPct = computed(() => {
  if (!report.value) return null;
  if (!totalPrior.value) return null;
  return ((report.value.total_recurring_cost - totalPrior.value) / totalPrior.value) * 100;
});

// Cost-direction YoY delta for the total tile. Mirrors CostCutRow's classes:
// a rise in cost is bad (red), a fall is good (green).
const totalYoy = computed(() => {
  if (totalDeltaPct.value === null) return null;
  const pct = totalDeltaPct.value;
  const sign = pct > 0 ? '+' : '';
  const cls =
    pct > 0
      ? 'cost-cut__total-delta--bad'
      : pct < 0
        ? 'cost-cut__total-delta--good'
        : '';
  return { label: `${sign}${pct.toFixed(1)}%`, cls };
});

// Tone for the total cost value: rising cost = error, falling = success.
const totalTone = computed(() => {
  if (totalDeltaPct.value === null || totalDeltaPct.value === 0) return 'default';
  return totalDeltaPct.value > 0 ? 'error' : 'success';
});

const totalRagLabel = computed(() => {
  const rag = report.value?.total_rag;
  if (!rag || rag === 'none') return 'No target set';
  return rag === 'green' ? 'On target' : 'Over target';
});

function ragTone(rag) {
  switch (rag) {
    case 'green': return 'success';
    case 'amber': return 'warning';
    case 'red': return 'error';
    default: return 'neutral';
  }
}

function accountMetricKey(accountId) {
  return `cost_cut.account.${accountId}`;
}

function formatCurrency(value) {
  const number = Number(value || 0);
  return currencyFormatter.format(Number.isFinite(number) ? number : 0);
}

const currencyFormatter = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
});

async function loadReport() {
  if (!entity.value) return;
  loading.value = true;
  errorMessage.value = '';
  // Last-wins: capture this request's sequence number; if a newer load has
  // started by the time we resolve, drop this (stale) response.
  const seq = ++loadSeq;
  try {
    const data = await getCostCutReport(entity.value, year.value);
    if (seq !== loadSeq) return;
    report.value = data;
    totalTargetDraft.value = data.total_target != null ? String(data.total_target) : '';
  } catch (error) {
    if (seq !== loadSeq) return;
    report.value = null;
    errorMessage.value =
      error?.response?.data?.error || error?.message || 'Could not load the cost-cut report.';
  } finally {
    if (seq === loadSeq) loading.value = false;
  }
}

// Parse a raw target draft into a number, or null for "no target".
// A target of 0 is NOT a meaningful cost target, so empty OR 0 → null.
function parseTargetDraft(raw) {
  if (raw === '' || raw === null || raw === undefined) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n === 0) return null;
  return n;
}

async function commitTarget(metricKey, rawValue, currentValue, label) {
  const parsed = parseTargetDraft(rawValue);
  // No-op if unchanged.
  if (parsed === currentValue) return;
  savingKeys.value.add(metricKey);
  try {
    if (parsed === null) {
      // Empty / 0 → "no target". Only DELETE if a target currently exists;
      // otherwise this is a no-op (nothing to clear).
      if (currentValue != null) {
        await deleteKpiTarget({
          metric_key: metricKey,
          year: year.value,
          entity: entity.value,
        });
        toast.success('Target cleared');
      }
    } else {
      await saveKpiTarget({
        metric_key: metricKey,
        entity_id: entity.value,
        period_year: Number(year.value),
        target_value: parsed,
        label,
      });
      toast.success('Target saved');
    }
    await loadReport();
  } catch (error) {
    const msg = error?.response?.data?.error || error?.message || 'Could not save target.';
    toast.error(msg);
  } finally {
    savingKeys.value.delete(metricKey);
  }
}

function commitTotalTarget() {
  commitTarget(
    TOTAL_METRIC_KEY,
    totalTargetDraft.value,
    report.value?.total_target ?? null,
    'Total recurring cost',
  );
}

function commitAccountTarget({ accountId, value, currentValue, label }) {
  commitTarget(accountMetricKey(accountId), value, currentValue, label);
}

// Enter blurs the field, which triggers @blur=commit — the single source of
// truth for committing. Do NOT call commit() here too, or Enter double-commits.
function onTargetKeyup(event) {
  if (event.key === 'Enter') {
    event.target.blur();
  }
}

// Seed `entity` from the store ONLY on its initial resolution. A user's
// in-session entity choice must survive a later store change (e.g. tenants
// loading after mount), so we don't re-seed once seeded.
watch(selectedTenant, (val) => {
  if (val && !entitySeeded.value) {
    entitySeeded.value = true;
    if (val !== entity.value) {
      entity.value = val;
    }
  }
});

watch([entity, year], () => {
  loadReport();
});

onMounted(async () => {
  if (!tenants.value || tenants.value.length === 0) {
    await dataStore.loadTenants();
  }
  await loadReport();
});
</script>

<style scoped>
.cost-cut {
  display: grid;
  gap: 16px;
}

/* ── Filters ─────────────────────────────────────────────────────────────── */
.cost-cut__filters {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 12px;
}

.cost-cut__filters > :deep(.kselect-root) {
  min-width: 220px;
}

.cost-cut__basis {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 500;
  color: var(--kdl-text-muted);
}

/* ── Status (loading / error) ────────────────────────────────────────────── */
.cost-cut__status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 8px;
  background: var(--kdl-page-bg);
  color: var(--kdl-text-secondary);
  font-size: 13px;
}

.cost-cut__status--error {
  color: var(--kdl-danger, #b42318);
}

/* ── Headline strip ──────────────────────────────────────────────────────── */
.cost-cut__headline {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

/* Total tile = MetricTile + a cost-direction YoY delta beneath it. */
.cost-cut__total-tile {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.cost-cut__total-delta {
  font-size: 12px;
  font-weight: 500;
  padding-left: 2px;
}

.cost-cut__total-num {
  font-variant-numeric: tabular-nums;
}

/*
  Cost-direction semantics: a rise in cost is bad (red), a fall is good (green).
  GAP: KDL has no semantic --kdl-danger / --kdl-success CSS variables (only
  Tailwind danger/success scales). These hex values mirror MetricTile and
  CostCutRow exactly; once KDL exposes semantic tokens, swap all three.
*/
.cost-cut__total-delta--bad {
  color: #dc2626;
}

.cost-cut__total-delta--good {
  color: #0d9488;
}

:root[data-theme="dark"] .cost-cut__total-delta--bad {
  color: #f87171;
}

:root[data-theme="dark"] .cost-cut__total-delta--good {
  color: #2dd4bf;
}

.cost-cut__target-tile,
.cost-cut__rag-tile {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 8px;
  background: var(--kdl-card-bg);
  min-width: 0;
}

.cost-cut__target-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--kdl-text-hint);
  line-height: 1.35;
}

.cost-cut__target-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cost-cut__target-row > :deep(.kinput-root) {
  flex: 1 1 0;
  min-width: 0;
}

.cost-cut__target-pill {
  display: flex;
}

.cost-cut__rag-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* ── Panel ───────────────────────────────────────────────────────────────── */
.cost-cut__panel {
  display: grid;
  gap: 12px;
}

.cost-cut__caption {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--kdl-text-muted);
}

/* ── Table ───────────────────────────────────────────────────────────────── */
.cost-cut__table-wrap {
  overflow-x: auto;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 8px;
}

.cost-cut__table {
  width: 100%;
  min-width: 720px;
  border-collapse: collapse;
}

.cost-cut__table th,
.cost-cut__table :deep(td) {
  padding: 10px 12px;
  border-bottom: 1px solid var(--kdl-border-subtle);
  text-align: left;
  vertical-align: middle;
}

.cost-cut__table th {
  background: var(--kdl-page-bg);
  color: var(--kdl-text-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.text-right {
  text-align: right;
}

@media (max-width: 980px) {
  .cost-cut__headline {
    grid-template-columns: 1fr;
  }
}
</style>
