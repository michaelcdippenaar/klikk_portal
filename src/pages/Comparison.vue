<template>
  <q-page class="q-pa-md">
    <div class="text-h5 q-mb-md">Report Comparison</div>

    <div v-if="!dataStore.selectedTenant" class="q-pa-lg text-center">
      <q-icon name="info" size="3em" color="grey-5" />
      <div class="text-h6 q-mt-md text-grey-7">Please select a tenant first</div>
    </div>

    <div v-else>
      <!-- Reconciliation Form -->
      <q-card class="q-mb-md">
        <q-card-section>
          <div class="text-h6">Run Reconciliation</div>
        </q-card-section>
        <q-card-section>
          <div class="row q-gutter-md items-end">
            <q-input
              v-model.number="reconcileForm.financialYear"
              label="Financial Year"
              type="number"
              outlined
              dense
              style="min-width: 150px"
            />
            <q-input
              v-model.number="reconcileForm.fiscalYearStartMonth"
              label="Fiscal Year Start Month"
              type="number"
              min="1"
              max="12"
              outlined
              dense
              style="min-width: 180px"
            />
            <q-input
              v-model.number="reconcileForm.tolerance"
              label="Tolerance"
              type="number"
              step="0.01"
              outlined
              dense
              style="min-width: 120px"
            />
            <q-btn
              label="Run Reconciliation"
              color="primary"
              :loading="loading"
              @click="runReconciliation"
            />
          </div>
        </q-card-section>
      </q-card>

      <!-- Results -->
      <div v-if="reconciliationResult">

        <!-- Overall Status Banner -->
        <q-banner
          :class="reconciliationResult.success ? 'bg-positive text-white' : 'bg-negative text-white'"
          class="q-mb-md"
          rounded
        >
          <template v-slot:avatar>
            <q-icon :name="reconciliationResult.success ? 'check_circle' : 'error'" />
          </template>
          <div class="text-subtitle1">
            {{ reconciliationResult.success ? 'Reconciliation Passed' : 'Reconciliation Failed' }}
            <span v-if="reconciliationResult.financial_year"> — FY {{ reconciliationResult.financial_year }}</span>
          </div>
          <div v-if="reconciliationResult.errors && reconciliationResult.errors.length" class="q-mt-xs">
            <div v-for="(err, i) in reconciliationResult.errors" :key="i" class="text-caption">{{ err }}</div>
          </div>
        </q-banner>

        <!-- Tabs: P&L / Balance Sheet / Exceptions -->
        <q-card>
          <q-tabs v-model="activeTab" dense align="left" class="text-primary" active-color="primary" indicator-color="primary">
            <q-tab name="pnl" label="Profit & Loss" />
            <q-tab name="bs" label="Balance Sheet" />
            <q-tab name="exceptions" :label="'Exceptions (' + exceptionCount + ')'" />
          </q-tabs>
          <q-separator />

          <q-tab-panels v-model="activeTab" animated>

            <!-- P&L Tab -->
            <q-tab-panel name="pnl">
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
                      <q-td :props="props">
                        <q-badge :color="props.row.match_percentage >= 95 ? 'positive' : props.row.match_percentage >= 80 ? 'warning' : 'negative'">
                          {{ props.row.match_percentage.toFixed(1) }}%
                        </q-badge>
                      </q-td>
                    </template>
                    <template v-slot:body-cell-mismatches="props">
                      <q-td :props="props">
                        <span :class="props.row.mismatches > 0 ? 'text-negative text-weight-bold' : ''">{{ props.row.mismatches }}</span>
                      </q-td>
                    </template>
                  </q-table>
                </div>

              </div>
              <div v-else class="text-grey-6">No Profit & Loss data available.</div>
            </q-tab-panel>

            <!-- Balance Sheet Tab -->
            <q-tab-panel name="bs">
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
                      <q-input v-model="bsFilter" dense outlined placeholder="Filter accounts..." class="q-mr-sm">
                        <template v-slot:append><q-icon name="search" /></template>
                      </q-input>
                      <q-toggle v-model="bsShowMismatchOnly" label="Mismatches only" dense />
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
                    <template v-slot:body-cell-difference="props">
                      <q-td :props="props">
                        <span :class="parseFloat(props.row.difference) !== 0 ? 'text-negative text-weight-bold' : ''">
                          {{ formatNum(props.row.difference) }}
                        </span>
                      </q-td>
                    </template>
                  </q-table>
                </div>

              </div>
              <div v-else class="text-grey-6">No Balance Sheet data available.</div>
            </q-tab-panel>

            <!-- Exceptions Tab -->
            <q-tab-panel name="exceptions">
              <div v-if="allExceptions.length === 0" class="text-center q-pa-lg text-grey-6">
                <q-icon name="check_circle" size="3em" color="positive" />
                <div class="text-h6 q-mt-sm">No exceptions found</div>
              </div>
              <div v-else>
                <q-banner class="bg-orange-1 q-mb-md" rounded>
                  <template v-slot:avatar><q-icon name="warning" color="warning" /></template>
                  {{ allExceptions.length }} exception(s) require attention.
                </q-banner>

                <!-- P&L Period Exceptions -->
                <div v-if="pnlExceptionPeriods.length" class="q-mb-md">
                  <div class="text-subtitle1 q-mb-xs">P&L — Periods with Mismatches</div>
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
                      <q-td :props="props">
                        <q-badge :color="props.row.match_percentage >= 95 ? 'positive' : props.row.match_percentage >= 80 ? 'warning' : 'negative'">
                          {{ props.row.match_percentage.toFixed(1) }}%
                        </q-badge>
                      </q-td>
                    </template>
                    <template v-slot:body-cell-mismatches="props">
                      <q-td :props="props">
                        <span class="text-negative text-weight-bold">{{ props.row.mismatches }}</span>
                      </q-td>
                    </template>
                  </q-table>
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
                    <template v-slot:body-cell-difference="props">
                      <q-td :props="props">
                        <span class="text-negative text-weight-bold">{{ formatNum(props.row.difference) }}</span>
                      </q-td>
                    </template>
                  </q-table>
                </div>
              </div>
            </q-tab-panel>

          </q-tab-panels>
        </q-card>

      </div>
    </div>
  </q-page>
</template>

<script setup>
import { ref, reactive, computed } from 'vue';
import { useDataStore } from '../stores/data';
import { useProcessStore } from '../stores/processes';

const dataStore = useDataStore();
const processStore = useProcessStore();

const loading = ref(false);
const reconciliationResult = ref(null);
const activeTab = ref('pnl');
const bsFilter = ref('');
const bsShowMismatchOnly = ref(false);

const reconcileForm = reactive({
  financialYear: new Date().getFullYear(),
  fiscalYearStartMonth: 7,
  tolerance: 0.01,
});

function formatNum(val) {
  const n = parseFloat(val);
  if (isNaN(n)) return val;
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

// --- Balance Sheet computed ---

const bsValidation = computed(() => {
  return reconciliationResult.value?.balance_sheet?.validation || null;
});

const bsDetailColumns = [
  { name: 'account_code', label: 'Code', field: 'account_code', align: 'left', sortable: true },
  { name: 'account_name', label: 'Account', field: 'account_name', align: 'left', sortable: true },
  { name: 'account_type', label: 'Type', field: 'account_type', align: 'left', sortable: true },
  { name: 'xero_value', label: 'Xero Value', field: 'xero_value', align: 'right', sortable: true, format: v => formatNum(v) },
  { name: 'db_value', label: 'DB Value', field: 'db_value', align: 'right', sortable: true, format: v => formatNum(v) },
  { name: 'difference', label: 'Difference', field: 'difference', align: 'right', sortable: true },
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
