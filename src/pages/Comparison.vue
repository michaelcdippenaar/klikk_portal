<template>
  <q-page class="q-pa-md">
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

      <!-- Import P&L by Tracking -->
      <SectionCard
        class="q-mb-md"
        title="Import P&amp;L by Tracking"
        description="Pull Xero P&amp;L totals per tracking category for comparison with trail balance"
      >
        <div class="row q-gutter-md items-end">
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
          <q-btn
            label="Import P&amp;L by Tracking"
            color="secondary"
            :loading="pnlTrackingLoading"
            @click="runPnlByTracking"
          />
        </div>

        <div v-if="pnlTrackingLoading" class="text-center q-mt-md">
          <q-spinner color="secondary" size="2em" />
          <span class="q-ml-sm" style="color: var(--kdl-text-muted);">Importing...</span>
        </div>

        <div v-if="pnlTrackingResult && !pnlTrackingLoading" class="q-mt-md">
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
        class="q-mb-md"
        title="Run Reconciliation"
        description="Compare Xero P&amp;L and Balance Sheet reports to constructed trail balance"
      >
        <div class="row q-gutter-md items-end">
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
          <q-btn
            label="Run Reconciliation"
            color="primary"
            :loading="loading"
            @click="runReconciliation"
          />
        </div>
      </SectionCard>

      <!-- Results -->
      <div v-if="reconciliationResult">

        <!-- Overall Status Alert -->
        <KAlert
          class="q-mb-md"
          :variant="reconciliationResult.success ? 'success' : 'error'"
          :title="reconciliationResult.success
            ? ('Reconciliation Passed' + (reconciliationResult.financial_year ? ' — FY ' + reconciliationResult.financial_year : ''))
            : ('Reconciliation Failed' + (reconciliationResult.financial_year ? ' — FY ' + reconciliationResult.financial_year : ''))"
          :body="reconciliationResult.errors && reconciliationResult.errors.length
            ? reconciliationResult.errors.join(' • ')
            : undefined"
        />

        <!-- Result tabs + panels -->
        <SectionCard>
          <KTabs
            :tabs="resultTabs"
            v-model="activeTab"
            :url-sync="false"
            class="q-mb-md"
          />

          <!-- P&L Tab -->
          <div v-show="activeTab === 'pnl'">
            <div v-if="reconciliationResult.profit_loss">

              <!-- P&L Import Summary -->
              <div v-if="reconciliationResult.profit_loss.import" class="q-mb-md">
                <div class="text-subtitle2 q-mb-xs">Import Summary</div>
                <div class="row q-gutter-md">
                  <q-chip icon="event" color="grey-3">{{ reconciliationResult.profit_loss.import.from_date }} — {{ reconciliationResult.profit_loss.import.to_date }}</q-chip>
                  <q-chip icon="format_list_numbered" color="grey-3">{{ reconciliationResult.profit_loss.import.lines_created }} lines imported</q-chip>
                </div>
              </div>

              <!-- P&L Overall Stats -->
              <div v-if="pnlOverall" class="q-mb-md">
                <div class="text-subtitle2 q-mb-xs">Overall Statistics</div>
                <div class="row q-gutter-sm">
                  <q-badge :color="pnlOverall.overall_match_percentage >= 95 ? 'positive' : 'warning'" class="text-body2 q-pa-sm">
                    {{ pnlOverall.overall_match_percentage.toFixed(1) }}% Match
                  </q-badge>
                  <q-chip dense color="green-2" text-color="green-9">{{ pnlOverall.total_matches }} matches</q-chip>
                  <q-chip dense color="red-2" text-color="red-9" v-if="pnlOverall.total_mismatches > 0">{{ pnlOverall.total_mismatches }} mismatches</q-chip>
                  <q-chip dense color="grey-3">{{ pnlOverall.total_comparisons }} total comparisons</q-chip>
                </div>
              </div>

              <!-- P&L Period Stats Table -->
              <div v-if="pnlPeriodRows.length">
                <div class="text-subtitle2 q-mb-xs">Period Breakdown</div>
                <q-table
                  :rows="pnlPeriodRows"
                  :columns="pnlPeriodColumns"
                  row-key="period"
                  dense
                  flat
                  bordered
                  :pagination="{ rowsPerPage: 0 }"
                  hide-pagination
                >
                  <template v-slot:body-cell-match_percentage="props">
                    <q-td :props="props" class="kdl-numeric">
                      <q-badge :color="props.row.match_percentage >= 95 ? 'positive' : props.row.match_percentage >= 80 ? 'warning' : 'negative'">
                        {{ props.row.match_percentage.toFixed(1) }}%
                      </q-badge>
                    </q-td>
                  </template>
                  <template v-slot:body-cell-mismatches="props">
                    <q-td :props="props" class="kdl-numeric">
                      <!-- text-negative permitted here: mismatch count is an explicit variance signal -->
                      <span :class="props.row.mismatches > 0 ? 'text-negative text-weight-bold' : ''">{{ props.row.mismatches }}</span>
                    </q-td>
                  </template>
                </q-table>
              </div>

            </div>
            <EmptyState v-else title="No Profit &amp; Loss data" body="Run a reconciliation to see P&amp;L results." />
          </div>

          <!-- Balance Sheet Tab -->
          <div v-show="activeTab === 'bs'">
            <div v-if="reconciliationResult.balance_sheet">

              <!-- BS Import Summary -->
              <div v-if="reconciliationResult.balance_sheet.import" class="q-mb-md">
                <div class="text-subtitle2 q-mb-xs">Import Summary</div>
                <div class="row q-gutter-md">
                  <q-chip icon="event" color="grey-3">Report date: {{ reconciliationResult.balance_sheet.import.report_date }}</q-chip>
                  <q-chip icon="format_list_numbered" color="grey-3">{{ reconciliationResult.balance_sheet.import.lines_created }} lines imported</q-chip>
                </div>
              </div>

              <!-- BS Validation Summary -->
              <div v-if="bsValidation" class="q-mb-md">
                <div class="text-subtitle2 q-mb-xs">Validation Summary</div>
                <div class="row q-gutter-sm">
                  <q-badge :color="bsValidation.overall_status === 'pass' ? 'positive' : 'negative'" class="text-body2 q-pa-sm">
                    {{ bsValidation.overall_status === 'pass' ? 'PASS' : 'FAIL' }}
                  </q-badge>
                  <q-badge :color="bsValidation.match_percentage >= 95 ? 'positive' : 'warning'" class="text-body2 q-pa-sm">
                    {{ bsValidation.match_percentage.toFixed(1) }}% Match
                  </q-badge>
                  <q-chip dense color="green-2" text-color="green-9">{{ bsValidation.matches }} matches</q-chip>
                  <q-chip dense color="red-2" text-color="red-9" v-if="bsValidation.mismatches > 0">{{ bsValidation.mismatches }} mismatches</q-chip>
                </div>
              </div>

              <!-- BS Details Table -->
              <div v-if="bsDetailRows.length">
                <div class="text-subtitle2 q-mb-xs">Account Details</div>
                <q-table
                  :rows="bsDetailRows"
                  :columns="bsDetailColumns"
                  row-key="account_code"
                  dense
                  flat
                  bordered
                  :pagination="{ rowsPerPage: 25 }"
                  :filter="bsFilter"
                >
                  <template v-slot:top-right>
                    <!-- KInput for filter — note: value bound via bsFilter ref, no Quasar slot magic needed -->
                    <div class="bs-filter-row">
                      <KInput
                        v-model="bsFilter"
                        placeholder="Filter accounts..."
                        class="comp-filter-input"
                      />
                      <q-toggle v-model="bsShowMismatchOnly" label="Mismatches only" dense />
                    </div>
                  </template>
                  <template v-slot:body-cell-status="props">
                    <q-td :props="props">
                      <q-badge
                        :color="props.row.status === 'match' ? 'positive' : props.row.status === 'mismatch' ? 'negative' : 'warning'"
                      >
                        {{ props.row.status }}
                      </q-badge>
                    </q-td>
                  </template>
                  <template v-slot:body-cell-xero_value="props">
                    <q-td :props="props" class="kdl-numeric">{{ formatNum(props.row.xero_value) }}</q-td>
                  </template>
                  <template v-slot:body-cell-db_value="props">
                    <q-td :props="props" class="kdl-numeric">{{ formatNum(props.row.db_value) }}</q-td>
                  </template>
                  <template v-slot:body-cell-difference="props">
                    <q-td :props="props" class="kdl-numeric">
                      <!-- text-negative permitted: difference is an explicit variance/delta column (ADR §3) -->
                      <span :class="parseFloat(props.row.difference) !== 0 ? 'text-negative text-weight-bold' : ''">
                        {{ formatNum(props.row.difference) }}
                      </span>
                    </q-td>
                  </template>
                </q-table>
              </div>

            </div>
            <EmptyState v-else title="No Balance Sheet data" body="Run a reconciliation to see Balance Sheet results." />
          </div>

          <!-- Exceptions Tab -->
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
                class="q-mb-md"
              />

              <!-- P&L Period Exceptions -->
              <div v-if="pnlExceptionPeriods.length" class="q-mb-md">
                <div class="text-subtitle1 q-mb-xs">P&amp;L — Periods with Mismatches</div>
                <q-table
                  :rows="pnlExceptionPeriods"
                  :columns="pnlPeriodColumns"
                  row-key="period"
                  dense
                  flat
                  bordered
                  :pagination="{ rowsPerPage: 0 }"
                  hide-pagination
                >
                  <template v-slot:body-cell-match_percentage="props">
                    <q-td :props="props" class="kdl-numeric">
                      <q-badge :color="props.row.match_percentage >= 95 ? 'positive' : props.row.match_percentage >= 80 ? 'warning' : 'negative'">
                        {{ props.row.match_percentage.toFixed(1) }}%
                      </q-badge>
                    </q-td>
                  </template>
                  <template v-slot:body-cell-mismatches="props">
                    <q-td :props="props" class="kdl-numeric">
                      <!-- text-negative permitted: mismatch count is an explicit variance signal -->
                      <span class="text-negative text-weight-bold">{{ props.row.mismatches }}</span>
                    </q-td>
                  </template>
                </q-table>
              </div>

              <!-- P&L Accounts that mismatch per period -->
              <div v-if="pnlPeriodExceptionAccounts.length" class="q-mb-md">
                <div class="text-subtitle1 q-mb-sm">P&amp;L — Accounts that mismatch per period</div>
                <q-list bordered>
                  <q-expansion-item
                    v-for="item in pnlPeriodExceptionAccounts"
                    :key="item.period"
                    :label="`Period ${item.period} (${item.period_date}) — ${item.accounts.length} account(s) out`"
                    header-class="text-weight-medium"
                    default-opened
                  >
                    <q-card flat bordered>
                      <q-table
                        :rows="item.accounts"
                        :columns="pnlAccountExceptionColumns"
                        row-key="account_code"
                        dense
                        flat
                        bordered
                        :pagination="{ rowsPerPage: 0 }"
                        hide-pagination
                      >
                        <template v-slot:body-cell-status="props">
                          <q-td :props="props">
                            <q-badge
                              :color="props.row.status === 'mismatch' ? 'negative' : 'warning'"
                            >
                              {{ props.row.status }}
                            </q-badge>
                          </q-td>
                        </template>
                        <template v-slot:body-cell-xero_value="props">
                          <q-td :props="props" class="kdl-numeric">{{ formatNum(props.row.xero_value) }}</q-td>
                        </template>
                        <template v-slot:body-cell-db_value="props">
                          <q-td :props="props" class="kdl-numeric">{{ formatNum(props.row.db_value) }}</q-td>
                        </template>
                        <template v-slot:body-cell-difference="props">
                          <q-td :props="props" class="kdl-numeric">
                            <!-- text-negative permitted: difference is an explicit variance/delta column (ADR §3) -->
                            <span class="text-negative text-weight-bold">{{ formatNum(props.row.difference) }}</span>
                          </q-td>
                        </template>
                      </q-table>
                    </q-card>
                  </q-expansion-item>
                </q-list>
              </div>

              <!-- BS Account Exceptions -->
              <div v-if="bsExceptionRows.length">
                <div class="text-subtitle1 q-mb-xs">Balance Sheet — Account Exceptions</div>
                <q-table
                  :rows="bsExceptionRows"
                  :columns="bsDetailColumns"
                  row-key="account_code"
                  dense
                  flat
                  bordered
                  :pagination="{ rowsPerPage: 25 }"
                >
                  <template v-slot:body-cell-status="props">
                    <q-td :props="props">
                      <q-badge
                        :color="props.row.status === 'mismatch' ? 'negative' : 'warning'"
                      >
                        {{ props.row.status }}
                      </q-badge>
                    </q-td>
                  </template>
                  <template v-slot:body-cell-xero_value="props">
                    <q-td :props="props" class="kdl-numeric">{{ formatNum(props.row.xero_value) }}</q-td>
                  </template>
                  <template v-slot:body-cell-db_value="props">
                    <q-td :props="props" class="kdl-numeric">{{ formatNum(props.row.db_value) }}</q-td>
                  </template>
                  <template v-slot:body-cell-difference="props">
                    <q-td :props="props" class="kdl-numeric">
                      <!-- text-negative permitted: difference is an explicit variance/delta column (ADR §3) -->
                      <span class="text-negative text-weight-bold">{{ formatNum(props.row.difference) }}</span>
                    </q-td>
                  </template>
                </q-table>
              </div>
            </div>
          </div>

        </SectionCard>

      </div>
    </div>
  </q-page>
</template>

<script setup>
import { ref, reactive, computed } from 'vue';
import { useDataStore } from '../stores/data';
import { useProcessStore } from '../stores/processes';
import { useFormatCurrency } from '../composables/useFormatCurrency';
import PageHeader from '../components/klikk/PageHeader.vue';
import SectionCard from '../components/klikk/SectionCard.vue';
import EmptyState from '../components/klikk/EmptyState.vue';
import KInput from '../components/klikk/KInput.vue';
import KAlert from '../components/klikk/KAlert.vue';
import KTabs from '../components/klikk/KTabs.vue';
import TenantSelector from '../components/TenantSelector.vue';

const dataStore = useDataStore();
const processStore = useProcessStore();
const { format } = useFormatCurrency();

// --- P&L by Tracking ---
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

// --- Reconciliation ---
const loading = ref(false);
const reconciliationResult = ref(null);
const activeTab = ref('pnl');
const bsFilter = ref('');
const bsShowMismatchOnly = ref(false);

// KTabs definition for result tabs
const resultTabs = computed(() => [
  { name: 'pnl', label: 'Profit & Loss' },
  { name: 'bs', label: 'Balance Sheet' },
  { name: 'exceptions', label: `Exceptions (${exceptionCount.value})` },
]);

const reconcileForm = reactive({
  financialYear: new Date().getFullYear(),
  fiscalYearStartMonth: 7,
  tolerance: 0.01,
});

/**
 * Format a numeric value for the comparison tables.
 * Difference/variance columns use accounting mode (parenthesised negatives, ADR §1).
 * Colour on those cells is red by exception — permitted by ADR §3 because these
 * are explicit variance/delta columns.
 */
function formatNum(val) {
  return format(val, { mode: 'accounting' });
}

// --- P&L computed ---

const pnlOverall = computed(() => {
  return reconciliationResult.value?.profit_loss?.comparison?.overall_statistics || null;
});

const pnlPeriodColumns = [
  { name: 'period', label: 'Period', field: 'period', align: 'left', sortable: true },
  { name: 'period_date', label: 'Date', field: 'period_date', align: 'left', sortable: true },
  { name: 'total_comparisons', label: 'Comparisons', field: 'total_comparisons', align: 'right', sortable: true },
  { name: 'matches', label: 'Matches', field: 'matches', align: 'right', sortable: true },
  { name: 'mismatches', label: 'Mismatches', field: 'mismatches', align: 'right', sortable: true },
  { name: 'missing_in_db', label: 'Missing in DB', field: 'missing_in_db', align: 'right', sortable: true },
  { name: 'missing_in_xero', label: 'Missing in Xero', field: 'missing_in_xero', align: 'right', sortable: true },
  { name: 'match_percentage', label: 'Match %', field: 'match_percentage', align: 'center', sortable: true },
];

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

// --- Balance Sheet computed ---

const bsValidation = computed(() => {
  return reconciliationResult.value?.balance_sheet?.validation || null;
});

const bsDetailColumns = [
  { name: 'account_code', label: 'Code', field: 'account_code', align: 'left', sortable: true },
  { name: 'account_name', label: 'Account', field: 'account_name', align: 'left', sortable: true },
  { name: 'account_type', label: 'Type', field: 'account_type', align: 'left', sortable: true },
  { name: 'xero_value', label: 'Xero Value (R)', field: 'xero_value', align: 'right', sortable: true },
  { name: 'db_value', label: 'DB Value (R)', field: 'db_value', align: 'right', sortable: true },
  { name: 'difference', label: 'Difference (R)', field: 'difference', align: 'right', sortable: true },
  { name: 'status', label: 'Status', field: 'status', align: 'center', sortable: true },
];

const pnlAccountExceptionColumns = [
  { name: 'account_code', label: 'Code', field: 'account_code', align: 'left', sortable: true },
  { name: 'account_name', label: 'Account', field: 'account_name', align: 'left', sortable: true },
  { name: 'xero_value', label: 'Xero (R)', field: 'xero_value', align: 'right', sortable: true },
  { name: 'db_value', label: 'DB (R)', field: 'db_value', align: 'right', sortable: true },
  { name: 'difference', label: 'Difference (R)', field: 'difference', align: 'right', sortable: true },
  { name: 'status', label: 'Status', field: 'status', align: 'center', sortable: true },
];

const bsDetailRows = computed(() => {
  const details = bsValidation.value?.details || [];
  if (bsShowMismatchOnly.value) {
    return details.filter(d => d.status !== 'match');
  }
  return details;
});

const bsExceptionRows = computed(() => {
  const details = bsValidation.value?.details || [];
  return details.filter(d => d.status !== 'match');
});

// --- Exception count ---

const exceptionCount = computed(() => {
  return pnlExceptionPeriods.value.length + bsExceptionRows.value.length;
});

const allExceptions = computed(() => {
  return [...pnlExceptionPeriods.value, ...bsExceptionRows.value];
});

// --- Run ---

async function runReconciliation() {
  loading.value = true;
  reconciliationResult.value = null;
  try {
    const result = await processStore.runProcess('reconcile', {
      tenantId: dataStore.selectedTenant,
      financial_year: reconcileForm.financialYear,
      fiscal_year_start_month: reconcileForm.fiscalYearStartMonth,
      tolerance: reconcileForm.tolerance,
    });
    if (result.success) {
      reconciliationResult.value = result.result;
      if (exceptionCount.value > 0) {
        activeTab.value = 'exceptions';
      }
    } else {
      reconciliationResult.value = { success: false, errors: [result.error] };
    }
  } catch (error) {
    reconciliationResult.value = {
      success: false,
      errors: [error.message || 'Reconciliation failed'],
    };
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
/* Input width constraints — replace removed inline style="min-width:..." */
.comp-input--xs { min-width: 120px; }
.comp-input--sm { min-width: 150px; }
.comp-input--md { min-width: 180px; }

/* Filter row inside BS table top-right slot */
.bs-filter-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.comp-filter-input {
  min-width: 200px;
}
</style>
