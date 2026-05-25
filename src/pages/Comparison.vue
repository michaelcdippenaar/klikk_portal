<template>
  <div class="comp-page">
    <PageHeader title="Report Comparison" subtitle="Compare Xero P&amp;L and Balance Sheet reports against the trail balance">
      <template #tenantContext>
        <TenantSelector />
      </template>
    </PageHeader>

    <EmptyState
      v-if="!dataStore.selectedTenant"
      icon="info"
      title="No tenant selected"
      body="Select a tenant from the header to view comparisons."
    />

    <div v-else>

      <!-- ── 1. Persistent Result Strip ─────────────────────────────────── -->
      <PersistentResultStrip
        v-if="persistedResult"
        :result="persistedResultStrip"
        title="Last reconciliation"
        class="comp-mb-md"
      >
        <!-- actions are passed via the result.actions array -->
      </PersistentResultStrip>

      <!-- ── 2. Error KAlert (run failed) ──────────────────────────────── -->
      <div v-if="reconciliationResult && reconciliationResult.success === false" class="comp-mb-md">
        <KAlert
          variant="error"
          :title="'Reconciliation Failed' + (reconcileForm.financialYear ? ' — FY ' + reconcileForm.financialYear : '')"
          :body="!showErrorDetails ? (reconciliationResult.errors && reconciliationResult.errors.length ? reconciliationResult.errors[0] : 'An unknown error occurred.') : undefined"
        >
          <template v-if="showErrorDetails">
            <p class="kalert-body-text">{{ reconciliationResult.errors && reconciliationResult.errors.length ? reconciliationResult.errors.join('\n') : 'An unknown error occurred.' }}</p>
            <pre v-if="reconciliationResult._rawError" class="comp-error-pre">{{ reconciliationResult._rawError }}</pre>
          </template>
          <div class="comp-error-actions">
            <button class="btn-ghost btn-sm" type="button" @click="runReconciliation">
              <!-- rotate-ccw icon -->
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="1.75"
                stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 .49-3.51" />
              </svg>
              Retry
            </button>
            <button class="btn-ghost btn-sm" type="button" @click="showErrorDetails = !showErrorDetails">
              {{ showErrorDetails ? 'Hide details' : 'Show error details' }}
            </button>
          </div>
        </KAlert>
      </div>

      <!-- ── 3. Stage progress (during run) ────────────────────────────── -->
      <div v-if="loading" class="comp-stage-progress comp-mb-md">
        <div class="comp-stage-progress__track">
          <div
            v-for="(stage, idx) in runStages"
            :key="stage.key"
            class="comp-stage-progress__item"
            :class="{
              'comp-stage-progress__item--done':    idx < currentStageIdx,
              'comp-stage-progress__item--active':  idx === currentStageIdx,
              'comp-stage-progress__item--pending': idx > currentStageIdx,
            }"
          >
            <!-- check (done) -->
            <svg
              v-if="idx < currentStageIdx"
              xmlns="http://www.w3.org/2000/svg" width="14" height="14"
              viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
              class="comp-stage-progress__icon comp-stage-progress__icon--done"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <!-- loader (active) -->
            <svg
              v-else-if="idx === currentStageIdx"
              xmlns="http://www.w3.org/2000/svg" width="14" height="14"
              viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
              class="comp-stage-progress__icon comp-stage-progress__icon--spin"
              aria-hidden="true"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <!-- circle (pending) -->
            <svg
              v-else
              xmlns="http://www.w3.org/2000/svg" width="14" height="14"
              viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
              class="comp-stage-progress__icon comp-stage-progress__icon--pending"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
            </svg>
            <span class="comp-stage-progress__label">{{ stage.label }}</span>
          </div>
        </div>
      </div>

      <!-- ── 4. Result Tabs + Content ───────────────────────────────────── -->
      <div v-if="reconciliationResult && reconciliationResult.success !== false">
        <SectionCard class="comp-mb-md">
          <!-- Card header: tabs + actions -->
          <template #actions>
            <button class="btn-ghost btn-sm comp-export-btn" type="button" @click="exportCsv" title="Export reconciliation result as CSV">
              <!-- download icon -->
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="1.75"
                stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export CSV
            </button>
            <KTooltip text="Coming soon" side="top">
              <button
                class="btn-ghost btn-sm comp-export-btn"
                type="button"
                disabled
                aria-disabled="true"
              >
                <!-- file-text icon -->
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" stroke-width="1.75"
                  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
                Export PDF
              </button>
            </KTooltip>
          </template>

          <KTabs
            :tabs="resultTabs"
            v-model="activeTab"
            :url-sync="true"
            class="comp-mb-md"
          />

          <!-- ── P&L Tab ──────────────────────────────────────────────── -->
          <div v-show="activeTab === 'pnl'">
            <div v-if="reconciliationResult.profit_loss">

              <!-- P&L Import Summary — MetricTile row -->
              <div v-if="reconciliationResult.profit_loss.import" class="comp-mb-md">
                <div class="comp-subtitle comp-mb-sm">Import Summary</div>
                <div class="comp-metric-row">
                  <MetricTile
                    label="Period"
                    :value="reconciliationResult.profit_loss.import.from_date + ' — ' + reconciliationResult.profit_loss.import.to_date"
                  />
                  <MetricTile
                    label="Lines imported"
                    :value="reconciliationResult.profit_loss.import.lines_created"
                    unit="lines"
                  />
                </div>
              </div>

              <!-- P&L Overall Stats — MetricTile row -->
              <div v-if="pnlOverall" class="comp-mb-md">
                <div class="comp-subtitle comp-mb-sm">Overall Statistics</div>
                <div class="comp-metric-row">
                  <MetricTile
                    label="Match rate"
                    :value="pnlOverall.overall_match_percentage.toFixed(1)"
                    unit="%"
                    :tone="pnlOverall.overall_match_percentage >= 95 ? 'success' : 'warning'"
                    :trend="pnlMatchTrend"
                  />
                  <MetricTile
                    label="Matches"
                    :value="pnlOverall.total_matches"
                    tone="success"
                  />
                  <MetricTile
                    label="Mismatches"
                    :value="pnlOverall.total_mismatches"
                    :tone="pnlOverall.total_mismatches > 0 ? 'error' : 'default'"
                    :trend="pnlMismatchTrend"
                  />
                  <MetricTile
                    label="Total comparisons"
                    :value="pnlOverall.total_comparisons"
                  />
                </div>
              </div>

              <!-- P&L Period Stats Table -->
              <div v-if="pnlPeriodRows.length">
                <div class="comp-subtitle comp-mb-xs">Period Breakdown</div>
                <KTable
                  :columns="pnlPeriodKColumns"
                  :data="pnlPeriodRows"
                  dense
                  pagination="none"
                >
                  <template #cell-match_percentage="{ row }">
                    <StatusPill
                      :tone="row.match_percentage >= 95 ? 'success' : row.match_percentage >= 80 ? 'warning' : 'error'"
                      :label="row.match_percentage.toFixed(1) + '%'"
                      size="sm"
                    />
                  </template>
                  <template #cell-mismatches="{ row }">
                    <!-- text-negative permitted: mismatch count is an explicit variance signal -->
                    <span :class="row.mismatches > 0 ? 'comp-variance-text' : ''">{{ row.mismatches }}</span>
                  </template>
                </KTable>
              </div>

            </div>
            <EmptyState v-else title="No Profit &amp; Loss data" body="Run a reconciliation to see P&amp;L results." />
          </div>

          <!-- ── Balance Sheet Tab ───────────────────────────────────────── -->
          <div v-show="activeTab === 'bs'">
            <div v-if="reconciliationResult.balance_sheet">

              <!-- BS Import Summary — MetricTile row -->
              <div v-if="reconciliationResult.balance_sheet.import" class="comp-mb-md">
                <div class="comp-subtitle comp-mb-sm">Import Summary</div>
                <div class="comp-metric-row">
                  <MetricTile
                    label="Report date"
                    :value="reconciliationResult.balance_sheet.import.report_date"
                  />
                  <MetricTile
                    label="Lines imported"
                    :value="reconciliationResult.balance_sheet.import.lines_created"
                    unit="lines"
                  />
                </div>
              </div>

              <!-- BS Validation Summary — MetricTile row (single lead metric: match %) -->
              <div v-if="bsValidation" class="comp-mb-md">
                <div class="comp-subtitle comp-mb-sm">Validation Summary</div>
                <div class="comp-metric-row">
                  <MetricTile
                    label="Status"
                    :value="bsValidation.overall_status === 'pass' ? 'Pass' : 'Fail'"
                    :tone="bsValidation.overall_status === 'pass' ? 'success' : 'error'"
                  />
                  <MetricTile
                    label="Match rate"
                    :value="bsValidation.match_percentage.toFixed(1)"
                    unit="%"
                    :tone="bsValidation.match_percentage >= 95 ? 'success' : 'warning'"
                    :trend="bsMatchTrend"
                  />
                  <MetricTile
                    label="Matches"
                    :value="bsValidation.matches"
                    tone="success"
                  />
                  <MetricTile
                    label="Mismatches"
                    :value="bsValidation.mismatches"
                    :tone="bsValidation.mismatches > 0 ? 'error' : 'default'"
                    :trend="bsMismatchTrend"
                  />
                </div>
              </div>

              <!-- BS Details Table -->
              <div v-if="bsDetailRows.length">
                <div class="comp-subtitle comp-mb-xs">Account Details</div>

                <!-- Segmented mismatch filter — promoted from hidden top-right slot -->
                <div class="comp-segment-row comp-mb-sm">
                  <button
                    class="comp-segment-btn"
                    :class="{ 'comp-segment-btn--active': !bsShowMismatchOnly }"
                    type="button"
                    @click="bsShowMismatchOnly = false"
                  >
                    All ({{ bsAllDetailRows.length }})
                  </button>
                  <button
                    class="comp-segment-btn"
                    :class="{ 'comp-segment-btn--active': bsShowMismatchOnly }"
                    type="button"
                    @click="bsShowMismatchOnly = true"
                  >
                    Mismatches only ({{ bsExceptionRows.length }})
                  </button>
                  <KInput
                    v-model="bsFilter"
                    placeholder="Filter accounts..."
                    class="comp-filter-input comp-ml-sm"
                  />
                </div>

                <KTable
                  :columns="bsDetailKColumns"
                  :data="bsDetailRows"
                  dense
                  :page-size="25"
                >
                  <template #cell-status="{ row }">
                    <StatusPill
                      :tone="row.status === 'match' ? 'success' : row.status === 'mismatch' ? 'error' : 'warning'"
                      :label="row.status"
                      size="sm"
                    />
                  </template>
                  <template #cell-xero_value="{ row }">
                    <span class="comp-numeric">{{ formatNum(row.xero_value) }}</span>
                  </template>
                  <template #cell-db_value="{ row }">
                    <span class="comp-numeric">{{ formatNum(row.db_value) }}</span>
                  </template>
                  <template #cell-difference="{ row }">
                    <!-- text-negative permitted: difference is an explicit variance/delta column (ADR §3) -->
                    <span class="comp-numeric" :class="parseFloat(row.difference) !== 0 ? 'comp-variance-text' : ''">
                      {{ formatNum(row.difference) }}
                    </span>
                  </template>
                </KTable>
              </div>

            </div>
            <EmptyState v-else title="No Balance Sheet data" body="Run a reconciliation to see Balance Sheet results." />
          </div>

          <!-- ── Exceptions Tab ──────────────────────────────────────────── -->
          <div v-show="activeTab === 'exceptions'">
            <EmptyState
              v-if="allExceptions.length === 0"
              icon="check_circle"
              title="No exceptions found"
              body="All periods and accounts reconcile within tolerance."
            />
            <div v-else>
              <KAlert
                variant="warning"
                :body="`${allExceptions.length} exception(s) require attention.`"
                class="comp-mb-md"
              />

              <!-- In-tab section nav -->
              <div class="comp-exception-nav comp-mb-md">
                <a v-if="pnlExceptionPeriods.length" href="#exc-pnl-periods" class="comp-exception-nav__link">
                  P&amp;L periods ({{ pnlExceptionPeriods.length }})
                </a>
                <a v-if="pnlPeriodExceptionAccounts.length" href="#exc-pnl-accounts" class="comp-exception-nav__link">
                  P&amp;L accounts ({{ pnlPeriodExceptionAccountCount }})
                </a>
                <a v-if="bsExceptionRows.length" href="#exc-bs-accounts" class="comp-exception-nav__link">
                  BS accounts ({{ bsExceptionRows.length }})
                </a>
              </div>

              <!-- P&L Period Exceptions -->
              <div v-if="pnlExceptionPeriods.length" id="exc-pnl-periods" class="comp-mb-md">
                <div class="comp-subtitle1 comp-mb-xs">P&amp;L — Periods with Mismatches</div>
                <KTable
                  :columns="pnlPeriodKColumns"
                  :data="pnlExceptionPeriods"
                  dense
                  pagination="none"
                >
                  <template #cell-match_percentage="{ row }">
                    <StatusPill
                      :tone="row.match_percentage >= 95 ? 'success' : row.match_percentage >= 80 ? 'warning' : 'error'"
                      :label="row.match_percentage.toFixed(1) + '%'"
                      size="sm"
                    />
                  </template>
                  <template #cell-mismatches="{ row }">
                    <!-- text-negative permitted: mismatch count is an explicit variance signal -->
                    <span class="comp-variance-text">{{ row.mismatches }}</span>
                  </template>
                </KTable>
              </div>

              <!-- P&L Accounts that mismatch per period -->
              <div v-if="pnlPeriodExceptionAccounts.length" id="exc-pnl-accounts" class="comp-mb-md">
                <div class="comp-subtitle1 comp-mb-sm">P&amp;L — Accounts that mismatch per period</div>
                <div class="comp-period-accordions">
                  <KAccordion
                    v-for="item in pnlPeriodExceptionAccounts"
                    :key="item.period"
                    :value="String(item.period)"
                    :model-value="String(item.period)"
                    class="comp-period-accordion"
                  >
                    <template #trigger>
                      <span class="comp-period-accordion__label">
                        Period {{ item.period }} ({{ item.period_date }}) — {{ item.accounts.length }} account(s) out
                      </span>
                    </template>
                    <KTable
                      :columns="pnlAccountExceptionKColumns"
                      :data="item.accounts"
                      dense
                      pagination="none"
                    >
                      <template #cell-status="{ row }">
                        <StatusPill
                          :tone="row.status === 'mismatch' ? 'error' : 'warning'"
                          :label="row.status"
                          size="sm"
                        />
                      </template>
                      <template #cell-xero_value="{ row }">
                        <span class="comp-numeric">{{ formatNum(row.xero_value) }}</span>
                      </template>
                      <template #cell-db_value="{ row }">
                        <span class="comp-numeric">{{ formatNum(row.db_value) }}</span>
                      </template>
                      <template #cell-difference="{ row }">
                        <!-- text-negative permitted: difference is an explicit variance/delta column (ADR §3) -->
                        <span class="comp-numeric comp-variance-text">{{ formatNum(row.difference) }}</span>
                      </template>
                    </KTable>
                  </KAccordion>
                </div>
              </div>

              <!-- BS Account Exceptions — row-click drills into DataViewer Line Items -->
              <div v-if="bsExceptionRows.length" id="exc-bs-accounts">
                <div class="comp-subtitle1 comp-mb-xs">
                  Balance Sheet — Account Exceptions
                  <span class="comp-drill-hint">Click a row to view journal lines</span>
                </div>
                <KTable
                  :columns="bsExceptionKColumns"
                  :data="bsExceptionRows"
                  dense
                  :page-size="25"
                  @row-click="drillIntoAccount"
                >
                  <template #cell-status="{ row }">
                    <StatusPill
                      :tone="row.status === 'mismatch' ? 'error' : 'warning'"
                      :label="row.status"
                      size="sm"
                    />
                  </template>
                  <template #cell-xero_value="{ row }">
                    <span class="comp-numeric">{{ formatNum(row.xero_value) }}</span>
                  </template>
                  <template #cell-db_value="{ row }">
                    <span class="comp-numeric">{{ formatNum(row.db_value) }}</span>
                  </template>
                  <template #cell-difference="{ row }">
                    <!-- text-negative permitted: difference is an explicit variance/delta column (ADR §3) -->
                    <span class="comp-numeric comp-variance-text">{{ formatNum(row.difference) }}</span>
                  </template>
                  <!-- Drill affordance column -->
                  <template #cell-drill>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14"
                      viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
                      class="comp-drill-icon" aria-hidden="true">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </template>
                </KTable>
              </div>
            </div>
          </div>

        </SectionCard>
      </div>

      <!-- ── 5. Advanced Options (forms) — collapsed by default once a recon exists ── -->
      <KAccordion
        v-model="advancedOpen"
        value="advanced"
        class="comp-mt-md"
      >
        <template #trigger>Advanced options</template>

        <div class="comp-advanced-body">

          <!-- Import P&L by Tracking -->
          <SectionCard
            class="comp-mb-md"
            title="Import P&amp;L by Tracking"
            description="Pull Xero P&amp;L totals per tracking category for comparison with trail balance"
          >
            <div class="comp-form-row">
              <KInput
                v-model="pnlTrackingForm.fromDate"
                label="From Date (YYYY-MM-DD)"
                placeholder="YYYY-MM-DD"
                help-text="Default: 12 months ago"
                class="comp-input--md"
              />
              <KInput
                v-model="pnlTrackingForm.toDate"
                label="To Date (YYYY-MM-DD)"
                placeholder="YYYY-MM-DD"
                help-text="Default: today"
                class="comp-input--md"
              />
              <button
                class="btn btn-secondary comp-form-btn"
                type="button"
                :disabled="pnlTrackingLoading"
                @click="runPnlByTracking"
              >
                <KSpinner v-if="pnlTrackingLoading" size="sm" />
                Import P&amp;L by Tracking
              </button>
            </div>

            <div v-if="pnlTrackingLoading" class="comp-loading-row comp-mt-md">
              <KSpinner size="md" tone="accent" />
              <span class="comp-muted-text">Importing...</span>
            </div>

            <div v-if="pnlTrackingResult && !pnlTrackingLoading" class="comp-mt-md">
              <KAlert
                :variant="pnlTrackingResult.success ? 'success' : 'error'"
                :title="pnlTrackingResult.success ? 'Import complete' : 'Import failed'"
                :body="pnlTrackingResult.success
                  ? (pnlTrackingResult.result?.message || 'Import complete')
                  : pnlTrackingResult.error"
              />
            </div>
          </SectionCard>

          <!-- Reconciliation Form -->
          <SectionCard
            title="Run Reconciliation"
            description="Compare Xero P&amp;L and Balance Sheet reports to constructed trail balance"
          >
            <div class="comp-form-row">
              <KInput
                v-model.number="reconcileForm.financialYear"
                label="Financial Year"
                type="number"
                class="comp-input--sm"
              />
              <KInput
                v-model.number="reconcileForm.fiscalYearStartMonth"
                label="Fiscal Year Start Month"
                type="number"
                placeholder="1–12"
                class="comp-input--md"
              />
              <KInput
                v-model.number="reconcileForm.tolerance"
                label="Tolerance"
                type="number"
                step="0.01"
                class="comp-input--xs"
              />
              <button
                class="btn btn-primary comp-form-btn"
                type="button"
                :disabled="loading"
                @click="runReconciliation"
              >
                <KSpinner v-if="loading" size="sm" />
                Run Reconciliation
              </button>
            </div>
          </SectionCard>

        </div>
      </KAccordion>

    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useDataStore } from '../stores/data';
import { useProcessStore } from '../stores/processes';
import { useFormatCurrency } from '../composables/useFormatCurrency';
import PageHeader from '../components/klikk/PageHeader.vue';
import SectionCard from '../components/klikk/SectionCard.vue';
import EmptyState from '../components/klikk/EmptyState.vue';
import KInput from '../components/klikk/KInput.vue';
import KAlert from '../components/klikk/KAlert.vue';
import KTabs from '../components/klikk/KTabs.vue';
import KTable from '../components/klikk/KTable.vue';
import KTooltip from '../components/klikk/KTooltip.vue';
import KSpinner from '../components/klikk/KSpinner.vue';
import KAccordion from '../components/klikk/KAccordion.vue';
import StatusPill from '../components/klikk/StatusPill.vue';
import MetricTile from '../components/klikk/MetricTile.vue';
import PersistentResultStrip from '../components/klikk/PersistentResultStrip.vue';
import TenantSelector from '../components/TenantSelector.vue';

const dataStore = useDataStore();
const processStore = useProcessStore();
const { format, formatRaw } = useFormatCurrency();
const router = useRouter();

// ── P&L by Tracking ──────────────────────────────────────────────────────────

const pnlTrackingLoading = ref(false);
const pnlTrackingResult = ref(null);
const pnlTrackingForm = reactive({
  fromDate: '',
  toDate: '',
});

async function runPnlByTracking() {
  pnlTrackingLoading.value = true;
  pnlTrackingResult.value = null;
  try {
    const result = await processStore.runProcess('pnl-by-tracking', {
      tenantId: dataStore.selectedTenant,
      from_date: pnlTrackingForm.fromDate || undefined,
      to_date: pnlTrackingForm.toDate || undefined,
    });
    pnlTrackingResult.value = result;
  } finally {
    pnlTrackingLoading.value = false;
  }
}

// ── Reconciliation stage progress ─────────────────────────────────────────────

const runStages = [
  { key: 'import-pnl', label: 'Importing P&L' },
  { key: 'import-bs',  label: 'Importing BS' },
  { key: 'comparing',  label: 'Comparing accounts' },
  { key: 'done',       label: 'Done' },
];

const currentStageIdx = ref(0);
let _stageTimer = null;

function startStageProgress() {
  currentStageIdx.value = 0;
  if (_stageTimer) clearInterval(_stageTimer);
  // Advance through stages every ~8 s (total ~24 s before "done").
  // The backend may be faster/slower — on resolve we jump to done immediately.
  // BACKEND GAP: no SSE/WS per-stage events; this is a local stub.
  _stageTimer = setInterval(() => {
    if (currentStageIdx.value < runStages.length - 2) {
      currentStageIdx.value += 1;
    }
  }, 8000);
}

function stopStageProgress(success) {
  if (_stageTimer) {
    clearInterval(_stageTimer);
    _stageTimer = null;
  }
  currentStageIdx.value = success ? runStages.length - 1 : currentStageIdx.value;
}

// ── Reconciliation result + persistence ──────────────────────────────────────

const loading = ref(false);
const reconciliationResult = ref(null);
const activeTab = ref('exceptions');
const bsFilter = ref('');
const bsShowMismatchOnly = ref(false);
const showErrorDetails = ref(false);

// ── Advanced options open/close (accordion v-model) ───────────────────────────
// Open by default when no previous run exists; closes after first success.
const advancedOpen = ref(null); // null = closed; 'advanced' = open

// ── localStorage persistence ────────────────────────────────────────────────
// Key: `klikk_recon_${tenantId}_${financialYear}`
// Shape: { status, completedAt, summary, exception_count, match_rate, financial_year, _result }

const STORAGE_PREFIX = 'klikk_recon_';

function storageKey() {
  return `${STORAGE_PREFIX}${dataStore.selectedTenant}_${reconcileForm.financialYear}`;
}

const persistedResult = ref(null);

function loadPersistedResult() {
  if (!dataStore.selectedTenant) return;
  try {
    const raw = localStorage.getItem(storageKey());
    if (raw) {
      persistedResult.value = JSON.parse(raw);
    } else {
      persistedResult.value = null;
    }
  } catch (_e) {
    persistedResult.value = null;
  }
}

function savePersistedResult(recon) {
  const exCount = pnlExceptionPeriods.value.length + bsExceptionRows.value.length;
  const bsMatchRate = recon.balance_sheet?.validation?.match_percentage ?? null;
  const pnlMatchRate = recon.profit_loss?.comparison?.overall_statistics?.overall_match_percentage ?? null;
  const matchRate = bsMatchRate ?? pnlMatchRate;

  const record = {
    status: recon.success ? 'success' : 'error',
    completedAt: new Date().toISOString(),
    summary: recon.success
      ? `FY ${recon.financial_year} · **${exCount} exception${exCount !== 1 ? 's' : ''}** · ${matchRate != null ? matchRate.toFixed(1) + '% match' : ''}`
      : `FY ${recon.financial_year} · Failed`,
    exception_count: exCount,
    match_rate: matchRate,
    financial_year: recon.financial_year,
    error: recon.success ? undefined : (recon.errors && recon.errors.length ? recon.errors[0] : 'Unknown error'),
    _result: recon,
  };
  try {
    localStorage.setItem(storageKey(), JSON.stringify(record));
  } catch (_e) {
    // quota exceeded or private browsing — silent
  }
  persistedResult.value = record;
}

// ── Previous-run deltas ───────────────────────────────────────────────────────

const previousResult = ref(null);

function loadPreviousResult() {
  // Previous run lives under a separate "prev" key written at start of each run.
  const key = `${storageKey()}_prev`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) previousResult.value = JSON.parse(raw);
  } catch (_e) {
    previousResult.value = null;
  }
}

function rotateToPrevious() {
  if (!persistedResult.value) return;
  const key = `${storageKey()}_prev`;
  try {
    localStorage.setItem(key, JSON.stringify(persistedResult.value));
    previousResult.value = persistedResult.value;
  } catch (_e) {
    // silent
  }
}

onMounted(() => {
  loadPersistedResult();
  loadPreviousResult();
  // Open advanced options by default when no persisted result exists.
  advancedOpen.value = persistedResult.value ? null : 'advanced';
});

// ── PersistentResultStrip shape ───────────────────────────────────────────────

const persistedResultStrip = computed(() => {
  if (!persistedResult.value) return null;
  return {
    status: persistedResult.value.status,
    completedAt: persistedResult.value.completedAt,
    summary: persistedResult.value.summary,
    error: persistedResult.value.error,
    actions: [
      { label: 'Run again', handler: () => runReconciliation() },
      { label: 'Export CSV', handler: () => exportCsv() },
    ],
  };
});

// ── KTabs definition ──────────────────────────────────────────────────────────

const resultTabs = computed(() => [
  { name: 'pnl', label: 'Profit & Loss' },
  { name: 'bs', label: 'Balance Sheet' },
  { name: 'exceptions', label: 'Exceptions', count: exceptionCount.value || undefined },
]);

const reconcileForm = reactive({
  financialYear: new Date().getFullYear(),
  fiscalYearStartMonth: 7,
  tolerance: 0.01,
});

/**
 * Format a numeric value for the comparison tables.
 * Difference/variance columns use accounting mode (parenthesised negatives, ADR §1).
 */
function formatNum(val) {
  return format(val, { mode: 'accounting' });
}

// ── KTable column definitions (TanStack format) ───────────────────────────────

const pnlPeriodKColumns = [
  { accessorKey: 'period',           header: 'Period',         enableSorting: true },
  { accessorKey: 'period_date',      header: 'Date',           enableSorting: true },
  { accessorKey: 'total_comparisons',header: 'Comparisons',    enableSorting: true, meta: { align: 'right' } },
  { accessorKey: 'matches',          header: 'Matches',        enableSorting: true, meta: { align: 'right' } },
  { accessorKey: 'mismatches',       header: 'Mismatches',     enableSorting: true, meta: { align: 'right' } },
  { accessorKey: 'missing_in_db',    header: 'Missing in DB',  enableSorting: true, meta: { align: 'right' } },
  { accessorKey: 'missing_in_xero',  header: 'Missing in Xero',enableSorting: true, meta: { align: 'right' } },
  { accessorKey: 'match_percentage', header: 'Match %',        enableSorting: true, meta: { align: 'center' } },
];

const bsDetailKColumns = [
  { accessorKey: 'account_code', header: 'Code',            enableSorting: true },
  { accessorKey: 'account_name', header: 'Account',         enableSorting: true },
  { accessorKey: 'account_type', header: 'Type',            enableSorting: true },
  { accessorKey: 'xero_value',   header: 'Xero Value (R)',  enableSorting: true, meta: { align: 'right' } },
  { accessorKey: 'db_value',     header: 'DB Value (R)',    enableSorting: true, meta: { align: 'right' } },
  { accessorKey: 'difference',   header: 'Difference (R)',  enableSorting: true, meta: { align: 'right' } },
  { accessorKey: 'status',       header: 'Status',          enableSorting: true, meta: { align: 'center' } },
  { id: 'drill',                 header: '',                enableSorting: false, accessorFn: () => '' },
];

const bsExceptionKColumns = bsDetailKColumns;

const pnlAccountExceptionKColumns = [
  { accessorKey: 'account_code', header: 'Code',           enableSorting: true },
  { accessorKey: 'account_name', header: 'Account',        enableSorting: true },
  { accessorKey: 'xero_value',   header: 'Xero (R)',       enableSorting: true, meta: { align: 'right' } },
  { accessorKey: 'db_value',     header: 'DB (R)',         enableSorting: true, meta: { align: 'right' } },
  { accessorKey: 'difference',   header: 'Difference (R)', enableSorting: true, meta: { align: 'right' } },
  { accessorKey: 'status',       header: 'Status',         enableSorting: true, meta: { align: 'center' } },
];

// ── P&L computed ─────────────────────────────────────────────────────────────

const pnlOverall = computed(() => {
  return reconciliationResult.value?.profit_loss?.comparison?.overall_statistics || null;
});

const pnlPeriodRows = computed(() => {
  const stats = reconciliationResult.value?.profit_loss?.comparison?.period_stats;
  if (!stats) return [];
  return Object.keys(stats).sort((a, b) => parseInt(a) - parseInt(b)).map(key => ({
    period: parseInt(key) + 1,
    ...stats[key],
  }));
});

const pnlExceptionPeriods = computed(() => {
  return pnlPeriodRows.value.filter(r => r.mismatches > 0 || r.missing_in_db > 0 || r.missing_in_xero > 0);
});

const pnlPeriodExceptionAccounts = computed(() => {
  const comparison = reconciliationResult.value?.profit_loss?.comparison;
  const periodExceptions = comparison?.period_exceptions || {};
  const periodStats = comparison?.period_stats || {};
  return Object.keys(periodExceptions)
    .sort((a, b) => parseInt(a) - parseInt(b))
    .map(periodKey => {
      const periodIdx = parseInt(periodKey);
      const stats = periodStats[periodKey];
      return {
        period: periodIdx + 1,
        period_date: stats?.period_date || `Period ${periodIdx + 1}`,
        accounts: periodExceptions[periodKey] || [],
      };
    })
    .filter(p => p.accounts.length > 0);
});

const pnlPeriodExceptionAccountCount = computed(() => {
  return pnlPeriodExceptionAccounts.value.reduce((sum, p) => sum + p.accounts.length, 0);
});

// ── Balance Sheet computed ────────────────────────────────────────────────────

const bsValidation = computed(() => {
  return reconciliationResult.value?.balance_sheet?.validation || null;
});

const bsAllDetailRows = computed(() => bsValidation.value?.details || []);

const bsDetailRows = computed(() => {
  let rows = bsShowMismatchOnly.value
    ? bsAllDetailRows.value.filter(d => d.status !== 'match')
    : bsAllDetailRows.value;

  // Client-side text filter — matches account_code, account_name, account_type, status
  const q = bsFilter.value.trim().toLowerCase();
  if (q) {
    rows = rows.filter(d =>
      [d.account_code, d.account_name, d.account_type, d.status]
        .some(v => String(v ?? '').toLowerCase().includes(q))
    );
  }
  return rows;
});

const bsExceptionRows = computed(() => {
  return bsAllDetailRows.value.filter(d => d.status !== 'match');
});

// ── Exception count ───────────────────────────────────────────────────────────

const exceptionCount = computed(() => {
  return pnlExceptionPeriods.value.length + bsExceptionRows.value.length;
});

const allExceptions = computed(() => {
  return [...pnlExceptionPeriods.value, ...bsExceptionRows.value];
});

// ── Current period (for DataViewer drill URL) ─────────────────────────────────

const currentPeriod = computed(() => {
  const fy = reconcileForm.financialYear;
  const startMonth = reconcileForm.fiscalYearStartMonth;
  // Best-effort: produce "YYYY-MM" from the fiscal year end date.
  // If start month is 7 (July), FY 2025 ends June 2025 → "2025-06"
  const endMonth = startMonth === 1 ? 12 : startMonth - 1;
  const endYear = startMonth === 1 ? fy : fy;
  return `${endYear}-${String(endMonth).padStart(2, '0')}`;
});

// ── Drill into DataViewer Line Items ─────────────────────────────────────────
// URL contract (agreed with DataViewer dev):
//   /app/pipeline/data?tab=line-items&account=<account_code>&period=<YYYY-MM>

function drillIntoAccount(row) {
  router.push({
    path: '/app/pipeline/data',
    query: {
      tab: 'line-items',
      account: row.account_code,
      period: currentPeriod.value,
    },
  });
}

// ── Δ vs last run indicators ──────────────────────────────────────────────────

function buildTrend(current, previous, higherIsBetter = true) {
  if (previous == null || current == null) return null;
  const delta = current - previous;
  if (Math.abs(delta) < 0.001) return { direction: 'flat', delta: '0' };
  const up = delta > 0;
  const isGood = higherIsBetter ? up : !up;
  const sign = up ? '+' : '−';
  const abs = Math.abs(delta);
  const deltaStr = `${sign}${abs % 1 === 0 ? abs : abs.toFixed(1)} vs prev`;
  return {
    direction: isGood ? 'up' : 'down',
    delta: deltaStr,
  };
}

const prevMatchRate = computed(() => previousResult.value?.match_rate ?? null);
const prevExceptionCount = computed(() => previousResult.value?.exception_count ?? null);

const pnlMatchTrend = computed(() => {
  const current = pnlOverall.value?.overall_match_percentage ?? null;
  return buildTrend(current, prevMatchRate.value, true);
});

const pnlMismatchTrend = computed(() => {
  const current = pnlOverall.value?.total_mismatches ?? null;
  return buildTrend(current, prevExceptionCount.value, false);
});

const bsMatchTrend = computed(() => {
  const current = bsValidation.value?.match_percentage ?? null;
  return buildTrend(current, prevMatchRate.value, true);
});

const bsMismatchTrend = computed(() => {
  const current = bsValidation.value?.mismatches ?? null;
  return buildTrend(current, prevExceptionCount.value, false);
});

// ── Run Reconciliation ────────────────────────────────────────────────────────

async function runReconciliation() {
  loading.value = true;
  reconciliationResult.value = null;
  showErrorDetails.value = false;
  rotateToPrevious();
  startStageProgress();
  try {
    const result = await processStore.runProcess('reconcile', {
      tenantId: dataStore.selectedTenant,
      financial_year: reconcileForm.financialYear,
      fiscal_year_start_month: reconcileForm.fiscalYearStartMonth,
      tolerance: reconcileForm.tolerance,
    });
    stopStageProgress(true);
    if (result.success) {
      reconciliationResult.value = result.result;
      savePersistedResult(result.result);
      // Collapse advanced options after a successful run.
      advancedOpen.value = null;
      if (exceptionCount.value > 0) {
        activeTab.value = 'exceptions';
      } else {
        activeTab.value = 'pnl';
      }
    } else {
      reconciliationResult.value = { success: false, errors: [result.error] };
    }
  } catch (error) {
    stopStageProgress(false);
    reconciliationResult.value = {
      success: false,
      errors: [error.message || 'Reconciliation failed'],
      _rawError: error.stack || undefined,
    };
  } finally {
    loading.value = false;
  }
}

// ── Export CSV ────────────────────────────────────────────────────────────────
// Generates client-side CSV from the reconciliation result.
// BACKEND GAP: no server-side export endpoint; generated from result object.
// Uses formatRaw() per ADR (signed values, no parentheses).

function exportCsv() {
  const result = reconciliationResult.value || persistedResult.value?._result;
  if (!result) return;

  const rows = [];
  const fy = result.financial_year || reconcileForm.financialYear;

  rows.push(['# Klikk Reconciliation Export']);
  rows.push([`# Financial Year: ${fy}`]);
  rows.push([`# Generated: ${new Date().toISOString()}`]);
  rows.push([]);

  // BS details
  const bsDetails = result.balance_sheet?.validation?.details || [];
  if (bsDetails.length) {
    rows.push(['Balance Sheet']);
    rows.push(['Account Code', 'Account Name', 'Type', 'Xero Value', 'DB Value', 'Difference', 'Status']);
    bsDetails.forEach(row => {
      rows.push([
        row.account_code,
        row.account_name,
        row.account_type,
        formatRaw(row.xero_value),
        formatRaw(row.db_value),
        formatRaw(row.difference),
        row.status,
      ]);
    });
    rows.push([]);
  }

  // P&L period stats
  const periodStats = result.profit_loss?.comparison?.period_stats || {};
  const periodKeys = Object.keys(periodStats).sort((a, b) => parseInt(a) - parseInt(b));
  if (periodKeys.length) {
    rows.push(['Profit & Loss — Period Breakdown']);
    rows.push(['Period', 'Date', 'Comparisons', 'Matches', 'Mismatches', 'Missing in DB', 'Missing in Xero', 'Match %']);
    periodKeys.forEach(key => {
      const s = periodStats[key];
      rows.push([
        parseInt(key) + 1,
        s.period_date,
        s.total_comparisons,
        s.matches,
        s.mismatches,
        s.missing_in_db,
        s.missing_in_xero,
        formatRaw(s.match_percentage),
      ]);
    });
  }

  const csvContent = rows
    .map(row => row.map(cell => {
      const str = String(cell ?? '');
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    }).join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `recon_FY${fy}_${dataStore.selectedTenant}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<style scoped>
/* ── Page wrapper ────────────────────────────────────────────────────────── */
.comp-page {
  padding: 16px;
}

/* ── Spacing utilities (scoped — no Quasar dependency) ───────────────────── */
.comp-mb-xs  { margin-bottom: 4px; }
.comp-mb-sm  { margin-bottom: 8px; }
.comp-mb-md  { margin-bottom: 16px; }
.comp-mt-md  { margin-top: 16px; }
.comp-mt-sm  { margin-top: 8px; }
.comp-ml-sm  { margin-left: 8px; }

/* ── Typography helpers ──────────────────────────────────────────────────── */
.comp-subtitle  { font-size: 14px; font-weight: 600; color: var(--kdl-text-secondary); }
.comp-subtitle1 { font-size: 15px; font-weight: 600; color: var(--kdl-text-primary); }

/* ── Input width constraints ─────────────────────────────────────────────── */
.comp-input--xs { min-width: 120px; }
.comp-input--sm { min-width: 150px; }
.comp-input--md { min-width: 180px; }

/* ── MetricTile grid row ──────────────────────────────────────────────────── */
.comp-metric-row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}

/* ── Form row (inputs + submit button side-by-side) ──────────────────────── */
.comp-form-row {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}

.comp-form-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

/* ── Inline loading row ──────────────────────────────────────────────────── */
.comp-loading-row {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
}

/* ── Numeric cell alignment ──────────────────────────────────────────────── */
.comp-numeric {
  display: block;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* ── Variance / mismatch highlight ──────────────────────────────────────── */
.comp-variance-text {
  color: var(--kdl-error, #DC2626);
  font-weight: 600;
}

/* ── Segmented mismatch filter ────────────────────────────────────────────── */
.comp-segment-row {
  display: flex;
  align-items: center;
  gap: 0;
  flex-wrap: wrap;
}

.comp-segment-btn {
  height: 32px;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 500;
  line-height: 1;
  border: 1px solid var(--kdl-border);
  background: var(--kdl-page-bg, transparent);
  color: var(--kdl-text-muted);
  cursor: pointer;
  transition: background 120ms, color 120ms;
  white-space: nowrap;
}

.comp-segment-btn:first-child {
  border-radius: 6px 0 0 6px;
}

.comp-segment-btn:last-of-type {
  border-radius: 0 6px 6px 0;
}

.comp-segment-btn + .comp-segment-btn {
  border-left: none;
}

.comp-segment-btn--active {
  background: var(--kdl-card-bg);
  color: var(--kdl-text-primary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 0 0 1px var(--kdl-border);
  z-index: 1;
  position: relative;
}

.comp-filter-input {
  min-width: 200px;
}

/* ── Stage progress strip ────────────────────────────────────────────────── */
.comp-stage-progress {
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 8px;
  padding: 12px 16px;
  background: var(--kdl-card-bg);
}

.comp-stage-progress__track {
  display: flex;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;
}

.comp-stage-progress__item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.comp-stage-progress__icon--done {
  color: #0D9488;
}

.comp-stage-progress__icon--spin {
  color: var(--kdl-accent);
  animation: sp-spin 1s linear infinite;
}

.comp-stage-progress__icon--pending {
  color: var(--kdl-text-hint);
}

.comp-stage-progress__label {
  font-size: 13px;
  font-weight: 400;
  color: var(--kdl-text-secondary);
}

.comp-stage-progress__item--done .comp-stage-progress__label {
  color: var(--kdl-text-muted);
}

.comp-stage-progress__item--active .comp-stage-progress__label {
  color: var(--kdl-text-primary);
  font-weight: 500;
}

@keyframes sp-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .comp-stage-progress__icon--spin {
    animation: none;
  }
}

/* ── Dark-mode: stage done icon ─────────────────────────────────────────── */
:root[data-theme="dark"] .comp-stage-progress__icon--done {
  color: #2DD4BF;
}

/* ── Exception section nav ────────────────────────────────────────────────── */
.comp-exception-nav {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--kdl-border-subtle);
  padding-bottom: 8px;
}

.comp-exception-nav__link {
  font-size: 13px;
  font-weight: 500;
  color: var(--kdl-text-muted);
  text-decoration: none;
  padding: 2px 8px;
  border-radius: 4px;
  transition: background 120ms, color 120ms;
}

.comp-exception-nav__link:hover {
  background: var(--kdl-border-subtle);
  color: var(--kdl-text-primary);
}

/* ── P&L per-period accordions ────────────────────────────────────────────── */
.comp-period-accordions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.comp-period-accordion {
  /* inherits KAccordion border/radius */
}

.comp-period-accordion__label {
  font-size: 13px;
  font-weight: 500;
  color: var(--kdl-text-primary);
}

/* ── BS exceptions: clickable rows (via KTable row-click) ────────────────── */
/* KTable already applies .ktable-row--clickable cursor:pointer when @row-click present */
.comp-drill-icon {
  color: var(--kdl-text-hint);
}

.comp-drill-hint {
  font-size: 12px;
  font-weight: 400;
  color: var(--kdl-text-hint);
  margin-left: 8px;
}

/* ── Export button ─────────────────────────────────────────────────────────── */
.comp-export-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.comp-export-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* ── Error actions ─────────────────────────────────────────────────────────── */
.comp-error-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.kalert-body-text {
  margin: 0;
  font-size: 13px;
  color: var(--kdl-text-secondary);
  white-space: pre-wrap;
}

.comp-error-pre {
  margin: 6px 0 0;
  font-size: 11px;
  font-family: 'Geist Mono', 'Fira Code', monospace;
  background: rgba(220, 38, 38, 0.06);
  border: 1px solid rgba(220, 38, 38, 0.15);
  border-radius: 4px;
  padding: 8px 10px;
  overflow-x: auto;
  color: #DC2626;
  white-space: pre;
}

:root[data-theme="dark"] .comp-error-pre {
  background: rgba(248, 113, 113, 0.06);
  border-color: rgba(248, 113, 113, 0.15);
  color: #F87171;
}

/* ── Advanced options body ─────────────────────────────────────────────────── */
.comp-advanced-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ── Muted text ────────────────────────────────────────────────────────────── */
.comp-muted-text {
  color: var(--kdl-text-muted);
}
</style>
