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
        <!-- Period status chip + comparison basis (change #2) -->
        <div class="cost-cut__period">
          <span class="cost-cut__period-year">FY {{ year }}</span>
          <StatusPill
            v-if="periodLabel"
            :tone="yearInProgress ? 'info' : 'neutral'"
            :label="periodLabel"
            size="sm"
            :icon="yearInProgress ? 'info' : false"
          />
          <!-- Background reconcile indicator. The edited ROW already changed
               optimistically; the cross-row aggregates (totals, splits, RAG
               counts) settle here ~1-2s later under this pill — that settle is
               correct, not a glitch. The aria-live region is ALWAYS present in
               the DOM (an empty live region established up front) and only its
               inner content toggles via v-show, so the "Syncing…" update is
               actually announced when it appears. -->
          <span class="cost-cut__reconcile" role="status" aria-live="polite">
            <span v-show="reconciling" class="cost-cut__reconcile-inner">
              <KSpinner size="xs" tone="muted" />
              <span>Syncing…</span>
            </span>
          </span>
        </div>

        <!-- Headline strip. Source order = reading order (B1): the CMA reads the
             addressable hero first, then "which way is it moving" (the YoY
             co-headline), then operating leverage (the behaviour bar) third. -->
        <div class="cost-cut__headline">
          <!-- PRIMARY headline: addressable operating cost (change #1) -->
          <div class="cost-cut__headline-primary">
            <div class="cost-cut__addressable-tile">
              <!-- Hero + YoY co-headline, read as one unit. The delta is the
                   SECOND thing read, so it sits right under the hero value at a
                   larger weight than the methodology line below it. -->
              <div class="cost-cut__hero">
                <MetricTile
                  label="Addressable operating cost"
                  :value="formatCurrency(addressableOperatingCost)"
                />
                <p class="cost-cut__addressable-sub">
                  (excludes tax, finance &amp; statutory — shown below the line)
                </p>
                <!--
                  Like-for-like YoY as a CO-HEADLINE. Rendered separately from
                  MetricTile's `trend` (which hardcodes up=green/down=red,
                  inverting cost semantics): a RISE in cost is bad (red), a FALL
                  is good (green) — same cost-direction logic as CostCutRow.
                -->
                <span
                  v-if="addressableYoy"
                  class="cost-cut__delta cost-cut__num"
                  :class="addressableYoy.cls"
                  :aria-label="`Addressable cost year on year, like for like: ${addressableYoy.label}`"
                >
                  {{ addressableYoy.label }}
                  <span class="cost-cut__delta-label">YoY</span>
                  <span class="cost-cut__delta-note">like-for-like</span>
                </span>
                <!-- ONE muted methodology line folding comparison basis +
                     annualised projection (demoted from two caption lines). -->
                <p v-if="methodologyLine" class="cost-cut__methodology">
                  {{ methodologyLine }}
                </p>
              </div>
            </div>

            <!-- Secondary stats: total incl. below-the-line + manageable + RAG -->
            <div class="cost-cut__secondary">
              <div class="cost-cut__secondary-stat">
                <span class="cost-cut__secondary-label">Total incl. below-the-line RX</span>
                <span class="cost-cut__secondary-value cost-cut__num">
                  {{ formatCurrency(report.total_recurring_cost) }}
                </span>
              </div>
              <!-- Manageable = the user's top-opportunities number (A4). -->
              <div v-if="hasManageableTotal" class="cost-cut__secondary-stat">
                <span class="cost-cut__secondary-label">Manageable — top opportunities</span>
                <span class="cost-cut__secondary-value cost-cut__num">
                  {{ formatCurrency(manageableTotal) }}
                  <span class="cost-cut__secondary-suffix">
                    · {{ manageableCount }} {{ manageableCount === 1 ? 'account' : 'accounts' }}
                  </span>
                </span>
              </div>
              <div class="cost-cut__secondary-stat">
                <span class="cost-cut__secondary-label">RAG summary</span>
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
          </div>

          <!-- Editable FY target tile -->
          <div class="cost-cut__target-tile">
            <span class="cost-cut__target-label">FY target (total)</span>
            <div class="cost-cut__target-row">
              <KInput
                v-model="totalTargetDraft"
                type="number"
                prefix="R"
                placeholder="Set target"
                aria-label="Full-year total cost target"
                @focus="totalTargetFocused = true"
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
        </div>

        <!-- Cost-behaviour split (operating leverage) — insight #3, so it sits
             BELOW the hero + YoY co-headline, not above them (B1). -->
        <CostBehaviourBar
          v-if="hasBehaviourData"
          :behaviour-totals="behaviourTotals"
          :addressable-base="addressableBase"
          :fixed-variable-ratio="fixedVariableRatio"
          :total="report.total_recurring_cost"
          :format-currency="formatCurrency"
        />

        <!-- Tabs -->
        <KTabs
          v-model="activeTab"
          :url-sync="false"
          aria-label="Cost-cut views"
          :tabs="tabDefs"
        />

        <!-- Controls row: Group-by toggle + behaviour & manageable filter chips -->
        <div class="cost-cut__controls">
          <div class="cost-cut__groupby" role="group" aria-label="Group accounts by">
            <span class="cost-cut__controls-label">Group by</span>
            <button
              v-for="opt in groupByOptions"
              :key="opt.value"
              type="button"
              class="cost-cut__chip"
              :class="{ 'cost-cut__chip--active': groupBy === opt.value }"
              :aria-pressed="groupBy === opt.value"
              @click="groupBy = opt.value"
            >
              {{ opt.label }}
            </button>
          </div>

          <div class="cost-cut__beh-filter" role="group" aria-label="Filter by cost behaviour">
            <span class="cost-cut__controls-label">Behaviour</span>
            <button
              v-for="opt in behaviourFilterOptions"
              :key="opt.value"
              type="button"
              class="cost-cut__chip"
              :class="{ 'cost-cut__chip--active': behaviourFilter === opt.value }"
              :aria-pressed="behaviourFilter === opt.value"
              @click="behaviourFilter = opt.value"
            >
              {{ opt.label }}
            </button>
          </div>

          <!-- Manageable filter — narrow to the user's hit-list (A2). -->
          <div class="cost-cut__manage-filter" role="group" aria-label="Filter by manageable">
            <span class="cost-cut__controls-label">Manageable</span>
            <button
              v-for="opt in manageableFilterOptions"
              :key="opt.value"
              type="button"
              class="cost-cut__chip"
              :class="{ 'cost-cut__chip--active': manageableFilter === opt.value }"
              :aria-pressed="manageableFilter === opt.value"
              @click="manageableFilter = opt.value"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>

        <!-- One-line "reading this table" legend — collapsed by default (B4). -->
        <div class="cost-cut__legend">
          <button
            type="button"
            class="cost-cut__legend-toggle"
            :aria-expanded="legendOpen"
            aria-controls="cost-cut-legend-body"
            @click="legendOpen = !legendOpen"
          >
            <svg
              class="cost-cut__legend-chevron"
              :class="{ 'cost-cut__legend-chevron--open': legendOpen }"
              xmlns="http://www.w3.org/2000/svg"
              width="12" height="12" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <span>Reading this table</span>
          </button>
          <p v-show="legendOpen" id="cost-cut-legend-body" class="cost-cut__legend-body">
            <strong>RAG</strong> = target status ·
            <strong>Behaviour hue</strong> = fixed / variable ·
            <strong>Tier</strong> = how to cut (T1 quick-win → T5 structural).
          </p>
        </div>

        <!-- Where the money goes -->
        <div v-if="activeTab === 'accounts'" class="cost-cut__panel">
          <EmptyState
            v-if="!addressableAccounts.length"
            icon="∅"
            title="No addressable recurring cost"
            body="No addressable recurring cash expense was returned for this entity and year."
          />
          <EmptyState
            v-else-if="!filteredAccounts.length"
            icon="∅"
            title="No matching accounts"
            :body="`No ${activeFilterLabel} accounts in this view. Clear the filters to see all.`"
          />
          <CostCutGroupTable
            v-else
            :rows="filteredAccounts"
            :group-by="groupBy"
            :addressable="addressableOperatingCost"
            :saving-keys="savingKeys"
            :format-currency="formatCurrency"
            @commit="commitAccountTarget"
            @retag="commitBehaviour"
            @retag-tier="commitTier"
            @toggle-manageable="commitManageable"
          />
        </div>

        <!-- Top cut opportunities -->
        <div v-else-if="activeTab === 'opportunities'" class="cost-cut__panel">
          <p class="cost-cut__caption">
            Fastest-growing recurring costs — best candidates to challenge.
          </p>
          <EmptyState
            v-if="!addressableOpportunities.length"
            icon="∅"
            title="No opportunities"
            body="No growing recurring costs were identified for this entity and year."
          />
          <EmptyState
            v-else-if="!filteredOpportunities.length"
            icon="∅"
            title="No matching opportunities"
            :body="`No ${activeFilterLabel} opportunities in this view. Clear the filters to see all.`"
          />
          <CostCutGroupTable
            v-else
            :rows="filteredOpportunities"
            :group-by="groupBy"
            :addressable="addressableOperatingCost"
            emphasise-yoy
            :saving-keys="savingKeys"
            :format-currency="formatCurrency"
            @commit="commitAccountTarget"
            @retag="commitBehaviour"
            @retag-tier="commitTier"
            @toggle-manageable="commitManageable"
          />
        </div>

        <!-- Below the line — not cost-cut targets (change #4) -->
        <BelowTheLineSection
          v-if="belowTheLine.length"
          :rows="belowTheLine"
          :total="belowTheLineTotal"
          :format-currency="formatCurrency"
        />
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
import CostCutGroupTable from './CostCutGroupTable.vue';
import CostBehaviourBar from './CostBehaviourBar.vue';
import BelowTheLineSection from './BelowTheLineSection.vue';
import { useDataStore } from '../../stores/data';
import { useToast } from '../../composables/useToast';
import {
  getCostCutReport,
  saveKpiTarget,
  deleteKpiTarget,
  saveCostBehaviour,
} from '../../api/planningAnalytics';
import {
  BEHAVIOUR_FILTER_OPTIONS,
  normaliseBehaviour,
  normaliseTier,
  behaviourLabel,
  computeRag,
} from '../../utils/costBehaviour';

// Filter chip row options for the manageable axis. 'all' keeps the full table;
// 'manageable' narrows to the user's hit-list (is_manageable === true).
const MANAGEABLE_FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'manageable', label: 'Manageable' },
];

const KLIKK_FALLBACK_ENTITY = '41ebfa0e-012e-4ff1-82ba-a9a7585c536c';
const TOTAL_METRIC_KEY = 'cost_cut.total';
// Prefixes for save-state keys in `savingKeys`. Kept distinct per edit axis so a
// behaviour save, a tier save and a target save on the SAME account never share
// a spinner-state slot. CostCutGroupTable mirrors these helpers exactly.
const BEHAVIOUR_KEY_PREFIX = 'cost_cut.behaviour.';
const TIER_KEY_PREFIX = 'cost_cut.tier.';
const MANAGEABLE_KEY_PREFIX = 'cost_cut.manageable.';

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
// Distinct from `loading`: a BACKGROUND reconcile re-fetch (after an optimistic
// edit) must NOT blank the table — the displayed numbers already changed. This
// drives only the subtle "Syncing…" indicator.
const reconciling = ref(false);
const errorMessage = ref('');
// In-flight saves keyed by metricKey — supports concurrent edits on different
// rows/axes without one clobbering another's spinner state.
const savingKeys = ref(new Set());
// Monotonic token so a stale reconcile re-fetch can be dropped (last-wins).
let loadSeq = 0;
const totalTargetDraft = ref('');
// Tracks focus on the FY-total target input. A background reconcile (fired by a
// per-row edit) must NOT resync totalTargetDraft while the user is mid-typing a
// new FY-total — mirrors CostCutRow's own isFocused guard on the row draft.
const totalTargetFocused = ref(false);
const activeTab = ref('accounts');
// Behaviour filter for the tables — 'all' or a behaviour key. Client-side only.
const behaviourFilter = ref('all');
// Manageable filter for the tables — 'all' or 'manageable'. Client-side only.
const manageableFilter = ref('all');
// Grouping axis — 'tier' (default) | 'behaviour' | 'group' | 'manageable'.
const groupBy = ref('tier');
// "Reading this table" legend — collapsed/off by default (B4).
const legendOpen = ref(false);

function isSaving(metricKey) {
  return savingKeys.value.has(metricKey);
}

const tabDefs = [
  { name: 'accounts', label: 'Where the money goes' },
  { name: 'opportunities', label: 'Top cut opportunities' },
];

const groupByOptions = [
  { value: 'tier', label: 'Cuttability tier' },
  { value: 'behaviour', label: 'Behaviour' },
  { value: 'group', label: 'Account group' },
  { value: 'manageable', label: 'Manageable cost' },
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

// All accounts (addressable + any below-the-line that the backend may still
// include in accounts[]). The grouped table only ever renders ADDRESSABLE rows.
const accounts = computed(() => report.value?.accounts ?? []);
const opportunities = computed(() => report.value?.top_opportunities ?? []);

// is_addressable is the authoritative split. A row is addressable unless it is
// explicitly flagged is_addressable === false OR carries the T0 sentinel.
function isAddressableRow(row) {
  if (row?.is_addressable === false) return false;
  if (normaliseTier(row?.cuttability) === 'T0') return false;
  return true;
}

const addressableAccounts = computed(() => accounts.value.filter(isAddressableRow));
const addressableOpportunities = computed(() =>
  opportunities.value.filter(isAddressableRow),
);

// ── Below the line (change #4) ───────────────────────────────────────────────
const belowTheLine = computed(() => report.value?.below_the_line ?? []);
const belowTheLineTotal = computed(() => Number(report.value?.below_the_line_total) || 0);

const ragCounts = computed(() => ({
  green: report.value?.rag_counts?.green ?? 0,
  amber: report.value?.rag_counts?.amber ?? 0,
  red: report.value?.rag_counts?.red ?? 0,
  none: report.value?.rag_counts?.none ?? 0,
}));

// ── Addressable headline (change #1) ─────────────────────────────────────────
const addressableOperatingCost = computed(() =>
  Number(report.value?.addressable_operating_cost) || 0,
);

// Like-for-like prior addressable = sum of addressable accounts' recurring_prior.
// Matched-period because the per-account recurring_prior is already YTD-matched
// by the backend (change #2: no client math beyond this addressable total YoY).
const priorAddressable = computed(() =>
  addressableAccounts.value.reduce((s, r) => s + (Number(r.recurring_prior) || 0), 0),
);

const addressableDeltaPct = computed(() => {
  if (!report.value) return null;
  if (!priorAddressable.value) return null;
  return (
    ((addressableOperatingCost.value - priorAddressable.value) / priorAddressable.value) * 100
  );
});

// Cost-direction YoY for the addressable headline: rise = bad (red), fall = good.
const addressableYoy = computed(() => {
  if (addressableDeltaPct.value === null) return null;
  const pct = addressableDeltaPct.value;
  const sign = pct > 0 ? '+' : '';
  const cls = pct > 0 ? 'cost-cut__delta--bad' : pct < 0 ? 'cost-cut__delta--good' : '';
  return { label: `${sign}${pct.toFixed(1)}%`, cls };
});

// ── Manageable cost (the user's top cut-opportunity shortlist) ───────────────
// manageable_total is a SERVER aggregate (the reconcile owns it — we never
// recompute it client-side). The COUNT is a cheap read of how many addressable
// rows are currently flagged, for the "· N accounts" suffix; it reflects the
// optimistic row flips immediately and settles with the reconcile like the rest.
const manageableTotal = computed(() => Number(report.value?.manageable_total) || 0);
const hasManageableTotal = computed(() => report.value?.manageable_total != null);
const manageableCount = computed(
  () => addressableAccounts.value.filter((r) => r.is_manageable === true).length,
);

// ── Partial-year honesty (change #2) ─────────────────────────────────────────
const yearInProgress = computed(() => !!report.value?.year_in_progress);
const periodLabel = computed(() => report.value?.period_label || '');
const comparisonBasis = computed(() => report.value?.comparison_basis || '');
const annualisedEstimate = computed(() => {
  const v = report.value?.annualised_estimate;
  return v == null ? null : Number(v);
});
const annualisedLabel = computed(() => {
  if (annualisedEstimate.value == null || !Number.isFinite(annualisedEstimate.value)) return '';
  return `Projected full year ≈ ${formatCurrency(annualisedEstimate.value)} (seasonal estimate)`;
});

// ONE muted methodology line (B1): folds the comparison basis + the annualised
// projection (when present) behind a single quiet caption, separated by a thin
// middot. Demoted from the two stacked caption lines that previously buried the
// YoY delta. Empty when neither is present (line then doesn't render).
const methodologyLine = computed(() => {
  const parts = [];
  if (comparisonBasis.value) parts.push(comparisonBasis.value);
  if (annualisedLabel.value) parts.push(annualisedLabel.value);
  return parts.join(' · ');
});

// ── Cost-behaviour split (headline bar) ──────────────────────────────────────
const behaviourTotals = computed(() => report.value?.behaviour_totals ?? {});
const addressableBase = computed(() => Number(report.value?.addressable_base) || 0);
const fixedVariableRatio = computed(() => {
  const r = report.value?.fixed_variable_ratio;
  return r == null ? null : Number(r);
});
const hasBehaviourData = computed(() =>
  Object.values(behaviourTotals.value).some((v) => (Number(v) || 0) > 0),
);

// ── Filters (client-side, no re-fetch) — applied WITHIN the group view ───────
// Two independent chip rows: behaviour and manageable. A row must satisfy BOTH
// to survive, so the user can e.g. narrow to "Fixed" AND "Manageable" at once.
const behaviourFilterOptions = BEHAVIOUR_FILTER_OPTIONS;
const manageableFilterOptions = MANAGEABLE_FILTER_OPTIONS;

function matchesBehaviourFilter(row) {
  if (behaviourFilter.value === 'all') return true;
  return normaliseBehaviour(row.behaviour) === behaviourFilter.value;
}

function matchesManageableFilter(row) {
  if (manageableFilter.value === 'all') return true;
  return row.is_manageable === true;
}

function matchesFilters(row) {
  return matchesBehaviourFilter(row) && matchesManageableFilter(row);
}

const filteredAccounts = computed(() =>
  addressableAccounts.value.filter(matchesFilters),
);
const filteredOpportunities = computed(() =>
  addressableOpportunities.value.filter(matchesFilters),
);

const activeBehaviourLabel = computed(() => behaviourLabel(behaviourFilter.value));

// Empty-state copy that names whichever filter(s) are hiding rows.
const activeFilterLabel = computed(() => {
  const parts = [];
  if (behaviourFilter.value !== 'all') parts.push(activeBehaviourLabel.value.toLowerCase());
  if (manageableFilter.value !== 'all') parts.push('manageable');
  return parts.join(' + ');
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
function behaviourKey(accountId) {
  return `${BEHAVIOUR_KEY_PREFIX}${accountId}`;
}
function tierKey(accountId) {
  return `${TIER_KEY_PREFIX}${accountId}`;
}
function manageableKeyFor(accountId) {
  return `${MANAGEABLE_KEY_PREFIX}${accountId}`;
}

const currencyFormatter = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
});

function formatCurrency(value) {
  const number = Number(value || 0);
  return currencyFormatter.format(Number.isFinite(number) ? number : 0);
}

// ── Load ──────────────────────────────────────────────────────────────────
// `background` = true → reconcile after an optimistic edit: do NOT set the
// blanking `loading` flag (the table stays put with the optimistic numbers);
// only flip the subtle `reconciling` indicator.
async function loadReport({ background = false } = {}) {
  if (!entity.value) return;
  if (background) reconciling.value = true;
  else loading.value = true;
  errorMessage.value = '';
  // Last-wins: capture this request's sequence; if a newer load started by the
  // time we resolve, drop this (stale) response.
  const seq = ++loadSeq;
  try {
    const data = await getCostCutReport(entity.value, year.value);
    if (seq !== loadSeq) return;
    report.value = data;
    // Skip resyncing the FY-total draft while its input is focused, so a
    // background reconcile can't clobber a half-typed FY-total target.
    if (!totalTargetFocused.value) {
      totalTargetDraft.value = data.total_target != null ? String(data.total_target) : '';
    }
  } catch (error) {
    if (seq !== loadSeq) return;
    // A failed BACKGROUND reconcile must not wipe the screen the user is editing
    // — keep the optimistic state and surface the failure as a toast only.
    if (background) {
      toast.error('Could not sync latest figures — showing your last edit.');
    } else {
      report.value = null;
      errorMessage.value =
        error?.response?.data?.error || error?.message || 'Could not load the cost-cut report.';
    }
  } finally {
    if (seq === loadSeq) {
      if (background) reconciling.value = false;
      else loading.value = false;
    }
  }
}

// Fire a background reconcile WITHOUT awaiting it — the optimistic mutation has
// already updated the display; the reconcile corrects silently if it differs.
function reconcileInBackground() {
  // Intentionally not awaited.
  loadReport({ background: true });
}

// Parse a raw target draft into a number, or null for "no target".
// A target of 0 is NOT a meaningful cost target, so empty OR 0 → null.
function parseTargetDraft(raw) {
  if (raw === '' || raw === null || raw === undefined) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n === 0) return null;
  return n;
}

// ── Optimistic-mutation scope (the reviewer's option b) ─────────────────────
//
// We optimistically mutate ONLY the edited row's own visible cells; the
// background reconcile is the SOLE source of truth for EVERY cross-row aggregate
// (rag_counts, total_rag, behaviour_totals, tier_totals, addressable_base,
// addressable_operating_cost, fixed_variable_ratio, total_recurring_cost). This
// eliminates the divergence surface where a half-recomputed client state showed
// moved bar segments against a stale "% of addressable" denominator, or a
// changed addressable headline against an unchanged "Total incl. below-the-line".
//
// Rationale: a behaviour/tier re-tag does not change actuals, so
// total_recurring_cost is invariant; the addressable splits DO change but are
// cross-row, so only the reconcile can compute them consistently. We do not
// half-compute them on the client. The "Syncing…" pill signals the settle window.

// Find the matching row object(s) for an account across accounts[] AND
// top_opportunities[] (the same account can appear in both — mutate both so the
// optimistic update is consistent regardless of the active tab).
function rowsForAccount(accountId) {
  if (!report.value) return [];
  const out = [];
  for (const r of report.value.accounts || []) {
    if (r.account_id === accountId) out.push(r);
  }
  for (const r of report.value.top_opportunities || []) {
    if (r.account_id === accountId) out.push(r);
  }
  return out;
}

// ── Target edit — OPTIMISTIC then background reconcile (change #5) ───────────
async function commitTarget(metricKey, accountId, rawValue, currentValue, label) {
  const parsed = parseTargetDraft(rawValue);
  // No-op if unchanged.
  if (parsed === currentValue) return;

  // 1) OPTIMISTIC: mutate ONLY the edited row's own visible cells on THIS tick,
  //    before any network call. We update that one row's `target` and recompute
  //    that ONE row's `rag` via computeRag — this assumes the server's DEFAULT
  //    5% amber band (a<=t green, a<=t*1.05 amber, else red); the background
  //    reconcile is authoritative and corrects it if the band ever differs.
  //    We deliberately do NOT recompute rag_counts / total_rag / any total here
  //    — the reconcile owns every cross-row aggregate. accountId === null → the
  //    FY-total target tile (no per-row mutation; reconcile recomputes total_rag).
  if (accountId != null) {
    for (const r of rowsForAccount(accountId)) {
      r.target = parsed;
      r.rag = computeRag(r.recurring_actual, parsed);
    }
  } else {
    report.value.total_target = parsed;
  }

  // 2) Persist, then 3) background reconcile.
  savingKeys.value.add(metricKey);
  try {
    if (parsed === null) {
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
    reconcileInBackground();
  } catch (error) {
    const msg = error?.response?.data?.error || error?.message || 'Could not save target.';
    toast.error(msg);
    // The write failed — pull authoritative state back so the optimistic value
    // doesn't linger incorrectly.
    reconcileInBackground();
  } finally {
    savingKeys.value.delete(metricKey);
  }
}

function commitTotalTarget() {
  commitTarget(
    TOTAL_METRIC_KEY,
    null,
    totalTargetDraft.value,
    report.value?.total_target ?? null,
    'Total recurring cost',
  );
}

// Keying intent: the TARGET metric keys on account_id (the TM1 element UUID,
// unique + non-null on every accounts[]/top_opportunities[] row) — see
// accountMetricKey(). The row also emits account_key, but that is only used for
// the behaviour/tier SAVES (saveCostBehaviour keys on account_key); the target
// save deliberately does not consume it, so it is dropped from the destructure.
function commitAccountTarget({ accountId, value, currentValue, label }) {
  commitTarget(accountMetricKey(accountId), accountId, value, currentValue, label);
}

// ── Behaviour re-tag — OPTIMISTIC then background reconcile (change #5) ───────
async function commitBehaviour({ accountKey, accountId, behaviour, label }) {
  if (!accountKey) {
    toast.error('Cannot re-tag: missing account key.');
    return;
  }
  // 1) OPTIMISTIC: flip ONLY this row's behaviour chip on this tick. We do NOT
  //    recompute behaviour_totals / addressable_base / the headline bar /
  //    fixed_variable_ratio — those are cross-row aggregates the background
  //    reconcile owns (a re-tag doesn't change actuals, so total_recurring_cost
  //    is invariant; the splits change but only the reconcile can compute them
  //    consistently). The "Syncing…" pill covers the settle window.
  for (const r of rowsForAccount(accountId)) {
    r.behaviour = behaviour;
  }

  const key = behaviourKey(accountId);
  savingKeys.value.add(key);
  try {
    await saveCostBehaviour({ account_key: accountKey, behaviour });
    reconcileInBackground();
    toast.success(`${label}: ${behaviourLabel(behaviour)}`);
  } catch (error) {
    const msg =
      error?.response?.data?.error || error?.message || 'Could not save cost behaviour.';
    toast.error(msg);
    reconcileInBackground();
  } finally {
    savingKeys.value.delete(key);
  }
}

// ── Tier re-tag — OPTIMISTIC then background reconcile (change #5) ────────────
// cuttability is now a first-class editable axis (like behaviour). The endpoint
// accepts { account_key, cuttability }.
async function commitTier({ accountKey, accountId, cuttability, label }) {
  if (!accountKey) {
    toast.error('Cannot re-tag tier: missing account key.');
    return;
  }
  // 1) OPTIMISTIC: flip ONLY this row's cuttability on this tick — its TierTag
  //    chip flips and it re-buckets in the grouped table (a local row-field
  //    change, fine). We do NOT recompute tier_totals / addressable_operating_cost
  //    / addressable_base / the headline — those are cross-row aggregates the
  //    background reconcile owns. The "Syncing…" pill covers the settle window.
  for (const r of rowsForAccount(accountId)) {
    r.cuttability = cuttability;
  }

  const key = tierKey(accountId);
  savingKeys.value.add(key);
  try {
    await saveCostBehaviour({ account_key: accountKey, cuttability });
    reconcileInBackground();
    toast.success(`${label}: ${cuttability}`);
  } catch (error) {
    const msg =
      error?.response?.data?.error || error?.message || 'Could not save cuttability tier.';
    toast.error(msg);
    reconcileInBackground();
  } finally {
    savingKeys.value.delete(key);
  }
}

// ── Manageable toggle — OPTIMISTIC then background reconcile (change A3) ──────
// Marks/unmarks an account on the user's top cut-opportunity shortlist. The
// endpoint accepts { account_key, is_manageable }.
async function commitManageable({ accountKey, accountId, isManageable, label }) {
  if (!accountKey) {
    toast.error('Cannot update manageable: missing account key.');
    return;
  }
  // 1) OPTIMISTIC: flip ONLY this row's is_manageable on this tick — its star
  //    fills/empties and it re-buckets under the "Manageable" grouping (a local
  //    row-field change, fine). We deliberately do NOT recompute manageable_total
  //    — that is a cross-row aggregate the background reconcile owns (the same
  //    contract as behaviour_totals / tier_totals). The "Syncing…" pill covers
  //    the settle window for the headline stat.
  for (const r of rowsForAccount(accountId)) {
    r.is_manageable = isManageable;
  }

  const key = manageableKeyFor(accountId);
  savingKeys.value.add(key);
  try {
    await saveCostBehaviour({ account_key: accountKey, is_manageable: isManageable });
    reconcileInBackground();
    toast.success(`${label}: ${isManageable ? 'added to manageable' : 'removed from manageable'}`);
  } catch (error) {
    const msg =
      error?.response?.data?.error || error?.message || 'Could not update manageable.';
    toast.error(msg);
    reconcileInBackground();
  } finally {
    savingKeys.value.delete(key);
  }
}

// Enter blurs the field, which triggers @blur=commit — the single source of
// truth for committing. Do NOT call commit() here too, or Enter double-commits.
function onTargetKeyup(event) {
  if (event.key === 'Enter') {
    event.target.blur();
  }
}

// Seed `entity` from the store ONLY on its initial resolution. A user's
// in-session entity choice must survive a later store change.
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

/* ── Period chip + comparison basis (change #2) ──────────────────────────── */
.cost-cut__period {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.cost-cut__period-year {
  font-size: 14px;
  font-weight: 700;
  color: var(--kdl-text-primary);
  letter-spacing: 0.01em;
}

/* Always-present aria-live region wrapper (empty when idle, so nothing shows
   and nothing is announced until the inner content appears). */
.cost-cut__reconcile {
  display: inline-flex;
  align-items: center;
}

.cost-cut__reconcile-inner {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--kdl-text-secondary);
}

/* ── Headline strip ──────────────────────────────────────────────────────── */
.cost-cut__headline {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: 12px;
}

.cost-cut__num {
  font-variant-numeric: tabular-nums;
}

/* Primary headline = addressable tile + secondary stats stacked. */
.cost-cut__headline-primary {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: 12px;
  min-width: 0;
}

.cost-cut__addressable-tile {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

/* Hero + YoY co-headline read as one unit (B1). */
.cost-cut__hero {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.cost-cut__addressable-sub {
  margin: 0;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.4;
  color: var(--kdl-text-muted);
}

/* YoY delta promoted to a CO-HEADLINE (B1): larger + heavier than the old 12px
   line, sitting right under the hero value. It's the second thing read. */
.cost-cut__delta {
  font-size: 16px;
  font-weight: 700;
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  margin-top: 2px;
}

.cost-cut__delta-label {
  font-size: 12px;
  font-weight: 600;
}

.cost-cut__delta-note {
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--kdl-text-hint);
}

/*
  Cost-direction semantics: a rise in cost is bad (red), a fall is good (green).
  GAP: KDL has no semantic --kdl-danger / --kdl-success CSS variables (only
  Tailwind danger/success scales). These hex values mirror MetricTile and
  CostCutRow exactly; once KDL exposes semantic tokens, swap all three.
*/
.cost-cut__delta--bad {
  color: #dc2626;
}

.cost-cut__delta--good {
  color: #0d9488;
}

:root[data-theme="dark"] .cost-cut__delta--bad {
  color: #f87171;
}

:root[data-theme="dark"] .cost-cut__delta--good {
  color: #2dd4bf;
}

/* ONE muted methodology line (B1): comparison basis + annualised, folded. */
.cost-cut__methodology {
  margin: 4px 0 0;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.4;
  color: var(--kdl-text-muted);
}

/* Secondary stats column (total incl. below-the-line + manageable + RAG). */
.cost-cut__secondary {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 16px;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 8px;
  background: var(--kdl-card-bg);
  min-width: 0;
}

.cost-cut__secondary-stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cost-cut__secondary-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--kdl-text-hint);
  line-height: 1.35;
}

.cost-cut__secondary-value {
  font-size: 15px;
  font-weight: 600;
  color: var(--kdl-text-primary);
}

/* "· N accounts" suffix on the manageable stat — quieter than the ZAR figure. */
.cost-cut__secondary-suffix {
  font-size: 12px;
  font-weight: 500;
  color: var(--kdl-text-muted);
}

.cost-cut__target-tile {
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

/* ── Controls (group-by + behaviour filter) ──────────────────────────────── */
.cost-cut__controls {
  display: flex;
  flex-wrap: wrap;
  gap: 16px 24px;
  align-items: center;
}

.cost-cut__groupby,
.cost-cut__beh-filter,
.cost-cut__manage-filter {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.cost-cut__controls-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--kdl-text-hint);
  margin-right: 2px;
}

.cost-cut__chip {
  appearance: none;
  padding: 4px 12px;
  border-radius: 9999px;
  border: 1px solid var(--kdl-border);
  background: var(--kdl-card-bg);
  color: var(--kdl-text-secondary);
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  transition: background var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1)),
              border-color var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1)),
              color var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1));
}

@media (prefers-reduced-motion: reduce) {
  .cost-cut__chip {
    transition: none;
  }
}

.cost-cut__chip:hover {
  border-color: var(--kdl-text-muted);
  color: var(--kdl-text-primary);
}

.cost-cut__chip:focus-visible {
  outline: 2px solid var(--kdl-accent);
  outline-offset: 1px;
}

/* Active chip uses the brand navy as a NEUTRAL "selected" affordance — not a
   categorical behaviour/tier hue and not a RAG tone, so it never collides. */
.cost-cut__chip--active {
  background: var(--kdl-brand-navy);
  border-color: var(--kdl-brand-navy);
  color: #ffffff;
}

.cost-cut__chip--active:hover {
  color: #ffffff;
}

/* ── One-line legend (B4) ────────────────────────────────────────────────── */
.cost-cut__legend {
  display: grid;
  gap: 6px;
  margin-top: -4px;
}

.cost-cut__legend-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: start;
  appearance: none;
  border: none;
  background: transparent;
  padding: 2px 4px;
  margin: -2px -4px;
  border-radius: 6px;
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--kdl-text-hint);
}

.cost-cut__legend-toggle:hover {
  color: var(--kdl-text-secondary);
}

.cost-cut__legend-toggle:focus-visible {
  outline: 2px solid var(--kdl-accent);
  outline-offset: 1px;
}

.cost-cut__legend-chevron {
  flex: 0 0 auto;
  transition: transform var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1));
}

.cost-cut__legend-chevron--open {
  transform: rotate(90deg);
}

@media (prefers-reduced-motion: reduce) {
  .cost-cut__legend-chevron {
    transition: none;
  }
}

.cost-cut__legend-body {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.5;
  color: var(--kdl-text-muted);
}

.cost-cut__legend-body strong {
  font-weight: 600;
  color: var(--kdl-text-secondary);
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

@media (max-width: 980px) {
  .cost-cut__headline {
    grid-template-columns: 1fr;
  }

  .cost-cut__headline-primary {
    grid-template-columns: 1fr;
  }
}
</style>
