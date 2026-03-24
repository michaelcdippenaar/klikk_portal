<template>
  <q-page class="q-pa-md">
    <div class="text-h5 q-mb-md">Dividend Forecast Budget</div>

    <q-tabs v-model="tab" dense class="text-grey" active-color="primary" indicator-color="primary" align="left">
      <q-tab name="calendar" label="Dividend Calendar" icon="event" />
      <q-tab name="forecast" label="TM1 Forecast" icon="analytics" />
      <q-tab name="workflow" label="Workflow" icon="play_circle" />
    </q-tabs>
    <q-separator />

    <q-tab-panels v-model="tab" animated>

      <!-- ===================== CALENDAR TAB ===================== -->
      <q-tab-panel name="calendar">
        <div class="row q-col-gutter-sm q-mb-md items-center">
          <div class="col-auto">
            <q-btn label="Check all shares" icon="refresh" color="primary" :loading="checking" @click="handleCheckDividends" no-caps />
          </div>
          <div class="col-auto">
            <q-select v-model="calendarFilter" :options="calendarFilterOpts" dense outlined emit-value map-options style="width: 160px;" label="Filter" />
          </div>
          <div class="col" />
          <div class="col-auto">
            <q-btn flat icon="download" label="Reload" @click="loadCalendar" no-caps />
          </div>
        </div>

        <q-banner v-if="checkResult" :class="checkResult.error ? 'bg-negative text-white' : 'bg-positive text-white'" dense rounded class="q-mb-md">
          <template v-if="checkResult.error">{{ checkResult.error }}</template>
          <template v-else>Checked {{ checkResult.checked }} symbols. {{ (checkResult.results || []).filter(r => r.new_record_saved).length }} new dividend(s) saved.</template>
          <template #action><q-btn flat label="Dismiss" @click="checkResult = null" /></template>
        </q-banner>

        <q-table
          :rows="calendarRows"
          :columns="calendarCols"
          row-key="id"
          dense
          :loading="loadingCalendar"
          :pagination="{ rowsPerPage: 50 }"
          flat bordered
        >
          <template #body-cell-tm1_status="props">
            <q-td :props="props">
              <q-badge v-if="props.row.tm1_verified" color="positive" label="Verified" />
              <q-badge v-else-if="props.row.tm1_adjustment_written" color="info" label="Written" />
              <q-badge v-else color="warning" text-color="dark" label="Pending" />
            </q-td>
          </template>
          <template #body-cell-tm1_adjustment_value="props">
            <q-td :props="props">
              {{ props.value != null ? props.value.toFixed(6) : '-' }}
            </q-td>
          </template>
          <template #body-cell-amount="props">
            <q-td :props="props">
              {{ props.value != null ? props.value.toFixed(4) : '-' }}
              <span v-if="props.row.currency" class="text-caption text-grey-6">{{ props.row.currency }}</span>
            </q-td>
          </template>
          <template #body-cell-prior_year_dps="props">
            <q-td :props="props">
              <span v-if="props.value != null">
                {{ props.value.toFixed(4) }}
                <q-tooltip v-if="props.row.prior_year_date">Prior year: {{ props.row.prior_year_date }}</q-tooltip>
              </span>
              <span v-else class="text-grey-5">-</span>
            </q-td>
          </template>
          <template #body-cell-pct_change="props">
            <q-td :props="props">
              <span v-if="props.value != null"
                    :class="props.value > 0 ? 'text-positive text-weight-medium' : props.value < 0 ? 'text-negative text-weight-medium' : 'text-grey-7'">
                {{ props.value > 0 ? '+' : '' }}{{ props.value.toFixed(1) }}%
              </span>
              <span v-else class="text-grey-5">-</span>
            </q-td>
          </template>
          <template #body-cell-payment_date="props">
            <q-td :props="props">
              <q-input
                :model-value="props.row.payment_date || ''"
                dense borderless
                placeholder="YYYY-MM-DD"
                style="min-width: 110px;"
                @change="v => handlePaymentDateChange(props.row, v)"
              >
                <template #append>
                  <q-icon v-if="props.row.payment_date" name="clear" class="cursor-pointer" size="xs"
                          @click.stop="handlePaymentDateChange(props.row, '')" />
                </template>
              </q-input>
            </q-td>
          </template>
          <template #body-cell-dividend_category="props">
            <q-td :props="props">
              <q-select
                v-model="props.row.dividend_category"
                :options="categoryOpts"
                dense borderless emit-value map-options
                style="min-width: 90px;"
                @update:model-value="v => handleCategoryChange(props.row, v)"
              />
            </q-td>
          </template>
          <template #body-cell-actions="props">
            <q-td :props="props">
              <q-btn v-if="!props.row.tm1_adjustment_written && props.row.share_code && props.row.amount"
                     flat dense size="sm" icon="edit" color="primary" label="Adjust"
                     @click="openAdjustDialog(props.row)" no-caps />
            </q-td>
          </template>
        </q-table>
      </q-tab-panel>

      <!-- ===================== FORECAST TAB ===================== -->
      <q-tab-panel name="forecast">
        <div class="row q-col-gutter-sm q-mb-md items-center">
          <div class="col-12 col-sm-3">
            <q-input v-model="forecastShare" label="Share code" dense outlined placeholder="e.g. ABG" />
          </div>
          <div class="col-12 col-sm-2">
            <q-input v-model="forecastYear" label="Year" dense outlined placeholder="2026" />
          </div>
          <div class="col-12 col-sm-2">
            <q-select v-model="forecastMonth" :options="monthOpts" dense outlined emit-value map-options label="Month" />
          </div>
          <div class="col-auto">
            <q-btn label="Read forecast" icon="search" color="primary" :loading="readingForecast" @click="handleReadForecast" no-caps />
          </div>
        </div>

        <q-card v-if="forecastResult" class="q-mb-md">
          <q-card-section>
            <div v-if="forecastResult.error" class="text-negative">{{ forecastResult.error }}</div>
            <div v-else>
              <div class="row q-col-gutter-md">
                <div class="col-12 col-sm-4">
                  <div class="text-caption text-grey-7">Total DPS (All Input Types)</div>
                  <div class="text-h6">{{ forecastResult.all_input_types_dps?.toFixed(6) }}</div>
                </div>
                <div class="col-12 col-sm-4">
                  <div class="text-caption text-grey-7">Declared Dividend Adjustment</div>
                  <div class="text-h6">{{ forecastResult.declared_dividend_dps?.toFixed(6) }}</div>
                </div>
                <div class="col-12 col-sm-4">
                  <div class="text-caption text-grey-7">Base DPS (rules)</div>
                  <div class="text-h6">{{ forecastResult.base_dps?.toFixed(6) }}</div>
                </div>
              </div>
              <div class="text-caption text-grey-5 q-mt-sm">
                Cube: {{ forecastResult.cube }} | Version: {{ forecastResult.version }} | Entity: {{ forecastResult.entity }}
              </div>
            </div>
          </q-card-section>
        </q-card>

        <!-- Quick adjust -->
        <q-card>
          <q-card-section>
            <div class="text-subtitle1 q-mb-sm">Write adjustment</div>
            <div class="row q-col-gutter-sm items-end">
              <div class="col-12 col-sm-3">
                <q-input v-model="adjustShare" label="Share code" dense outlined />
              </div>
              <div class="col-12 col-sm-2">
                <q-input v-model="adjustDps" label="Declared DPS" dense outlined type="number" step="0.0001" />
              </div>
              <div class="col-12 col-sm-2">
                <q-input v-model="adjustYear" label="Year" dense outlined />
              </div>
              <div class="col-12 col-sm-2">
                <q-select v-model="adjustMonth" :options="monthOpts" dense outlined emit-value map-options label="Month" />
              </div>
              <div class="col-auto q-gutter-sm">
                <q-btn label="Dry run" color="secondary" :loading="adjusting" @click="handleAdjust(false)" no-caps />
                <q-btn label="Write" color="primary" :loading="adjusting" @click="handleAdjust(true)" no-caps />
              </div>
            </div>
            <q-banner v-if="adjustResult" :class="adjustResult.error ? 'bg-negative text-white' : adjustResult.status === 'written' ? 'bg-positive text-white' : 'bg-info text-white'" dense rounded class="q-mt-sm">
              <div v-if="adjustResult.error">{{ adjustResult.error }}</div>
              <div v-else>
                <strong>{{ adjustResult.status === 'written' ? 'Written' : 'Dry run' }}</strong> |
                Base DPS: {{ adjustResult.base_dps?.toFixed(6) }} |
                New adjustment: {{ adjustResult.new_adjustment?.toFixed(6) }} |
                Resulting total: {{ adjustResult.resulting_total_dps?.toFixed(6) }}
              </div>
            </q-banner>
          </q-card-section>
        </q-card>
      </q-tab-panel>

      <!-- ===================== WORKFLOW TAB ===================== -->
      <q-tab-panel name="workflow">
        <q-card class="q-mb-md">
          <q-card-section>
            <div class="text-subtitle1 q-mb-xs">Dividend Forecast Pipeline</div>
            <div class="text-caption text-grey-7 q-mb-sm">Runs for all held shares automatically. No manual selection needed.</div>
            <div v-for="(s, idx) in workflowSteps" :key="idx" class="row items-center q-mb-xs">
              <q-checkbox v-model="s.selected" :label="s.label" dense class="col" />
              <q-btn flat dense size="sm" label="Run" icon="play_arrow" color="primary"
                     :loading="s.status === 'running'" :disable="workflowRunning"
                     @click="runSingleWorkflowStep(idx)" no-caps />
            </div>
          </q-card-section>
        </q-card>

        <q-btn label="Run selected steps" icon="play_circle" color="primary" :loading="workflowRunning" @click="runSelectedWorkflowSteps" no-caps class="q-mb-md" />

        <q-card v-if="workflowSteps.some(s => s.status !== 'idle')">
          <q-card-section>
            <div class="text-subtitle1 q-mb-sm">Progress</div>
            <q-list separator>
              <q-item v-for="(s, idx) in workflowSteps" :key="'p' + idx" :class="stepRowClass(s)">
                <q-item-section avatar>
                  <q-spinner v-if="s.status === 'running'" color="primary" size="1.5em" />
                  <q-icon v-else-if="s.status === 'done'" name="check_circle" color="positive" />
                  <q-icon v-else-if="s.status === 'error'" name="error" color="negative" />
                  <q-icon v-else-if="s.status === 'skipped'" name="remove_circle_outline" color="grey" />
                  <q-icon v-else name="radio_button_unchecked" color="grey-4" />
                </q-item-section>
                <q-item-section>
                  <q-item-label>{{ s.label }}</q-item-label>
                  <q-item-label caption v-if="s.message">{{ s.message }}</q-item-label>
                </q-item-section>
                <q-item-section side v-if="s.elapsed != null">{{ s.elapsed }}s</q-item-section>
              </q-item>
            </q-list>
          </q-card-section>
        </q-card>

        <!-- Verify results table -->
        <q-card v-if="verifyResults.length" class="q-mt-md">
          <q-card-section>
            <div class="text-subtitle1 q-mb-sm">Verification Results</div>
            <q-table
              :rows="verifyResults"
              :columns="verifyCols"
              row-key="id"
              dense flat bordered
              :pagination="{ rowsPerPage: 50 }"
            >
              <template #body-cell-status="props">
                <q-td :props="props">
                  <q-badge :color="props.value === 'verified' ? 'positive' : props.value === 'mismatch' ? 'negative' : 'warning'" :label="props.value" />
                </q-td>
              </template>
            </q-table>
          </q-card-section>
        </q-card>
      </q-tab-panel>
    </q-tab-panels>

    <!-- Adjust dialog -->
    <q-dialog v-model="adjustDialogOpen">
      <q-card style="min-width: 400px;">
        <q-card-section>
          <div class="text-h6">Adjust TM1 Forecast</div>
        </q-card-section>
        <q-card-section>
          <div class="q-mb-sm"><strong>{{ adjustDialogRow?.share_code }}</strong> ({{ adjustDialogRow?.company }})</div>
          <div class="q-mb-sm">
            Ex-date: {{ adjustDialogRow?.ex_dividend_date }} | Amount: {{ adjustDialogRow?.amount }}
            <q-badge :color="adjustDialogRow?.dividend_category === 'foreign' ? 'blue' : adjustDialogRow?.dividend_category === 'special' ? 'orange' : 'green'" :label="adjustDialogRow?.dividend_category || 'regular'" class="q-ml-sm" />
          </div>
          <q-input v-model="adjustDialogDps" label="Declared DPS" dense outlined type="number" step="0.0001" class="q-mb-sm" />
          <q-input v-model="adjustDialogYear" label="Year" dense outlined class="q-mb-sm" />
          <q-select v-model="adjustDialogMonth" :options="monthOpts" dense outlined emit-value map-options label="Month" />
        </q-card-section>
        <q-card-section v-if="adjustDialogResult">
          <q-banner :class="adjustDialogResult.error ? 'bg-negative text-white' : adjustDialogResult.status === 'written' ? 'bg-positive text-white' : 'bg-info text-white'" dense rounded>
            <div v-if="adjustDialogResult.error">{{ adjustDialogResult.error }}</div>
            <div v-else>
              {{ adjustDialogResult.status === 'written' ? 'Written!' : 'Dry run' }} |
              Adjustment: {{ adjustDialogResult.new_adjustment?.toFixed(6) }} |
              Total: {{ adjustDialogResult.resulting_total_dps?.toFixed(6) }}
              <span v-if="adjustDialogResult.txn_type"> | TM1: {{ adjustDialogResult.txn_type }}</span>
              <span v-if="adjustDialogResult.zero_base" class="text-warning"> | Zero base (new share?)</span>
            </div>
          </q-banner>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Dry run" color="secondary" :loading="adjustDialogLoading" @click="handleDialogAdjust(false)" no-caps />
          <q-btn flat label="Write to TM1" color="primary" :loading="adjustDialogLoading" @click="handleDialogAdjust(true)" no-caps />
          <q-btn flat label="Close" v-close-popup no-caps />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script>
import { defineComponent, ref, onMounted } from 'vue';
import {
  getDividendCalendar,
  checkDeclaredDividends,
  getDividendForecast,
  adjustDividendForecast,
  adjustAllPendingDividends,
  verifyDividendForecasts,
  updateDividendCalendarCategory,
  updateDividendCalendarPaymentDate,
} from '../api/endpoints';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default defineComponent({
  name: 'DividendForecast',
  setup() {
    const tab = ref('calendar');

    // -- Calendar --
    const calendarRows = ref([]);
    const loadingCalendar = ref(false);
    const calendarFilter = ref('all');
    const calendarFilterOpts = [
      { label: 'All', value: 'all' },
      { label: 'Pending TM1', value: 'pending' },
      { label: 'Declared', value: 'declared' },
      { label: 'Paid', value: 'paid' },
      { label: 'Estimated', value: 'estimated' },
    ];
    const calendarCols = [
      { name: 'share_code', label: 'Share', field: 'share_code', sortable: true, align: 'left' },
      { name: 'company', label: 'Company', field: 'company', sortable: true, align: 'left' },
      { name: 'symbol', label: 'Ticker', field: 'symbol', sortable: true, align: 'left' },
      { name: 'ex_dividend_date', label: 'Ex-Date', field: 'ex_dividend_date', sortable: true, align: 'left' },
      { name: 'payment_date', label: 'Pay Date', field: 'payment_date', sortable: true, align: 'left' },
      { name: 'amount', label: 'DPS', field: 'amount', sortable: true, align: 'right' },
      { name: 'prior_year_dps', label: 'Prior Yr DPS', field: 'prior_year_dps', sortable: true, align: 'right' },
      { name: 'pct_change', label: '% Chg', field: 'pct_change', sortable: true, align: 'right' },
      { name: 'tm1_status', label: 'TM1 Status', field: 'tm1_adjustment_written', sortable: true, align: 'center' },
      { name: 'tm1_target_month', label: 'TM1 Month', field: 'tm1_target_month', sortable: true, align: 'center' },
      { name: 'tm1_adjustment_value', label: 'TM1 Adj', field: 'tm1_adjustment_value', sortable: true, align: 'right' },
      { name: 'tm1_written_at', label: 'Written', field: 'tm1_written_at', sortable: true, align: 'left',
        format: v => v ? new Date(v).toLocaleDateString() : '-' },
      { name: 'dividend_category', label: 'Type', field: 'dividend_category', sortable: true, align: 'center' },
      { name: 'status', label: 'Status', field: 'status', sortable: true, align: 'left' },
      { name: 'actions', label: '', field: 'id', align: 'center' },
    ];

    const categoryOpts = [
      { label: 'Regular', value: 'regular' },
      { label: 'Special', value: 'special' },
      { label: 'Foreign', value: 'foreign' },
    ];

    const checking = ref(false);
    const checkResult = ref(null);

    async function loadCalendar() {
      loadingCalendar.value = true;
      try {
        const params = {};
        if (calendarFilter.value === 'pending') params.pending_tm1 = '1';
        else if (calendarFilter.value !== 'all') params.status = calendarFilter.value;
        const data = await getDividendCalendar(params);
        calendarRows.value = data.results || [];
      } catch (e) {
        console.error('loadCalendar', e);
      }
      loadingCalendar.value = false;
    }

    async function handleCategoryChange(row, category) {
      try {
        await updateDividendCalendarCategory(row.id, category);
      } catch (e) {
        console.error('Failed to update category', e);
        // Revert on failure
        await loadCalendar();
      }
    }

    async function handlePaymentDateChange(row, value) {
      try {
        await updateDividendCalendarPaymentDate(row.id, value || null);
        row.payment_date = value || null;
      } catch (e) {
        console.error('Failed to update payment date', e);
        await loadCalendar();
      }
    }

    async function handleCheckDividends() {
      checking.value = true;
      checkResult.value = null;
      try {
        checkResult.value = await checkDeclaredDividends('');
        await loadCalendar();
      } catch (e) {
        checkResult.value = { error: e.response?.data?.error || e.message };
      }
      checking.value = false;
    }

    // -- Forecast --
    const monthOpts = MONTHS.map(m => ({ label: m, value: m }));
    const forecastShare = ref('');
    const forecastYear = ref(String(new Date().getFullYear()));
    const forecastMonth = ref(MONTHS[new Date().getMonth()]);
    const readingForecast = ref(false);
    const forecastResult = ref(null);

    async function handleReadForecast() {
      if (!forecastShare.value) return;
      readingForecast.value = true;
      forecastResult.value = null;
      try {
        forecastResult.value = await getDividendForecast(forecastShare.value, forecastYear.value, forecastMonth.value);
      } catch (e) {
        forecastResult.value = { error: e.response?.data?.error || e.message };
      }
      readingForecast.value = false;
    }

    const adjustShare = ref('');
    const adjustDps = ref('');
    const adjustYear = ref(String(new Date().getFullYear()));
    const adjustMonth = ref(MONTHS[new Date().getMonth()]);
    const adjusting = ref(false);
    const adjustResult = ref(null);

    async function handleAdjust(confirm) {
      if (!adjustShare.value || !adjustDps.value) return;
      adjusting.value = true;
      adjustResult.value = null;
      try {
        adjustResult.value = await adjustDividendForecast({
          share_code: adjustShare.value,
          declared_dps: parseFloat(adjustDps.value),
          year: adjustYear.value,
          month: adjustMonth.value,
          confirm,
        });
      } catch (e) {
        adjustResult.value = { error: e.response?.data?.error || e.message };
      }
      adjusting.value = false;
    }

    // -- Adjust dialog (from calendar row) --
    const adjustDialogOpen = ref(false);
    const adjustDialogRow = ref(null);
    const adjustDialogDps = ref('');
    const adjustDialogYear = ref('');
    const adjustDialogMonth = ref('');
    const adjustDialogLoading = ref(false);
    const adjustDialogResult = ref(null);

    function openAdjustDialog(row) {
      adjustDialogRow.value = row;
      adjustDialogDps.value = row.amount;
      // Use payment_date for TM1 month (when cash is received), fallback to ex_dividend_date
      const targetDate = row.payment_date ? new Date(row.payment_date)
        : row.ex_dividend_date ? new Date(row.ex_dividend_date)
        : new Date();
      adjustDialogYear.value = String(targetDate.getFullYear());
      adjustDialogMonth.value = MONTHS[targetDate.getMonth()];
      adjustDialogResult.value = null;
      adjustDialogOpen.value = true;
    }

    async function handleDialogAdjust(confirm) {
      adjustDialogLoading.value = true;
      adjustDialogResult.value = null;
      try {
        adjustDialogResult.value = await adjustDividendForecast({
          share_code: adjustDialogRow.value.share_code,
          declared_dps: parseFloat(adjustDialogDps.value),
          year: adjustDialogYear.value,
          month: adjustDialogMonth.value,
          dividend_category: adjustDialogRow.value.dividend_category || 'regular',
          confirm,
        });
        if (confirm && adjustDialogResult.value.status === 'written') {
          await loadCalendar();
        }
      } catch (e) {
        adjustDialogResult.value = { error: e.response?.data?.error || e.message };
      }
      adjustDialogLoading.value = false;
    }

    // -- Workflow --
    const workflowRunning = ref(false);
    const verifyResults = ref([]);
    const verifyCols = [
      { name: 'share_code', label: 'Share', field: 'share_code', sortable: true, align: 'left' },
      { name: 'ex_dividend_date', label: 'Ex-Date', field: 'ex_dividend_date', sortable: true, align: 'left' },
      { name: 'amount', label: 'Declared DPS', field: 'amount', sortable: true, align: 'right',
        format: v => v != null ? v.toFixed(6) : '-' },
      { name: 'db_adjustment', label: 'DB Adj', field: 'db_adjustment', sortable: true, align: 'right',
        format: v => v != null ? v.toFixed(6) : '-' },
      { name: 'tm1_adjustment', label: 'TM1 Adj', field: 'tm1_adjustment', sortable: true, align: 'right',
        format: v => v != null ? v.toFixed(6) : '-' },
      { name: 'tm1_total_dps', label: 'TM1 Total DPS', field: 'tm1_total_dps', sortable: true, align: 'right',
        format: v => v != null ? v.toFixed(6) : '-' },
      { name: 'status', label: 'Status', field: 'status', sortable: true, align: 'center' },
    ];

    const workflowSteps = ref([
      { key: 'check', label: '1. Check yfinance for declared dividends (all shares)', selected: true, status: 'idle', message: '', elapsed: null },
      { key: 'adjust_pending', label: '2. Write TM1 adjustments for all pending entries', selected: true, status: 'idle', message: '', elapsed: null },
      { key: 'verify', label: '3. Verify TM1 values match DB adjustments', selected: true, status: 'idle', message: '', elapsed: null },
    ]);

    let paApi = null;

    async function loadTm1Processes() {
      try {
        paApi = await import('../api/planningAnalytics');
        const procs = await paApi.getTm1Processes();
        const tm1Steps = (procs || [])
          .filter(p => p.enabled)
          .map((p, i) => ({
            key: `tm1:${p.process_name}`,
            label: `4${String.fromCharCode(97 + i)}. TM1: ${p.process_name}`,
            selected: false,
            status: 'idle',
            message: '',
            elapsed: null,
            processName: p.process_name,
            parameters: p.parameters || {},
          }));
        workflowSteps.value = [...workflowSteps.value.slice(0, 3), ...tm1Steps];
      } catch (e) {
        console.warn('Could not load TM1 processes', e);
      }
    }

    async function runWorkflowStep(idx) {
      const s = workflowSteps.value[idx];
      workflowSteps.value[idx] = { ...s, status: 'running', message: '', elapsed: null };
      const t0 = Date.now();
      try {
        let res;
        if (s.key === 'check') {
          res = await checkDeclaredDividends('');
          const saved = (res.results || []).filter(r => r.new_record_saved).length;
          workflowSteps.value[idx] = {
            ...workflowSteps.value[idx],
            status: 'done',
            message: `Checked ${res.checked || 0} symbols, ${saved} new dividend(s) saved`,
            elapsed: ((Date.now() - t0) / 1000).toFixed(1),
          };
          await loadCalendar();
          return;
        }
        if (s.key === 'adjust_pending') {
          res = await adjustAllPendingDividends();
          if (res.error) throw new Error(res.error);
          const specialMsg = res.skipped_special ? `, ${res.skipped_special} special skipped` : '';
          workflowSteps.value[idx] = {
            ...workflowSteps.value[idx],
            status: 'done',
            message: `${res.adjustments_written || 0} adjustment(s) written (${res.pending_found || 0} pending found${specialMsg})`,
            elapsed: ((Date.now() - t0) / 1000).toFixed(1),
          };
          await loadCalendar();
          return;
        }
        if (s.key === 'verify') {
          res = await verifyDividendForecasts();
          if (res.error) throw new Error(res.error);
          verifyResults.value = res.results || [];
          const statusMsg = `${res.verified || 0} verified, ${res.mismatches || 0} mismatch(es), ${res.errors || 0} error(s)`;
          workflowSteps.value[idx] = {
            ...workflowSteps.value[idx],
            status: (res.mismatches || 0) > 0 ? 'error' : 'done',
            message: statusMsg,
            elapsed: ((Date.now() - t0) / 1000).toFixed(1),
          };
          await loadCalendar();
          return;
        }
        if (s.key.startsWith('tm1:') && paApi) {
          res = await paApi.executeTm1Process(s.processName, s.parameters);
          const success = res?.success !== false;
          workflowSteps.value[idx] = {
            ...workflowSteps.value[idx],
            status: success ? 'done' : 'error',
            message: res?.message || (success ? 'OK' : 'Failed'),
            elapsed: ((Date.now() - t0) / 1000).toFixed(1),
          };
          return;
        }
        workflowSteps.value[idx] = { ...workflowSteps.value[idx], status: 'done', message: 'OK', elapsed: ((Date.now() - t0) / 1000).toFixed(1) };
      } catch (e) {
        workflowSteps.value[idx] = {
          ...workflowSteps.value[idx],
          status: 'error',
          message: e.response?.data?.error || e.message,
          elapsed: ((Date.now() - t0) / 1000).toFixed(1),
        };
      }
    }

    async function runSingleWorkflowStep(idx) {
      if (workflowRunning.value) return;
      workflowRunning.value = true;
      workflowSteps.value.forEach((s, i) => {
        if (i !== idx) workflowSteps.value[i] = { ...s, status: 'idle', message: '', elapsed: null };
      });
      await runWorkflowStep(idx);
      workflowRunning.value = false;
    }

    async function runSelectedWorkflowSteps() {
      if (workflowRunning.value) return;
      workflowRunning.value = true;
      verifyResults.value = [];
      workflowSteps.value.forEach((s, i) => {
        workflowSteps.value[i] = { ...s, status: 'idle', message: '', elapsed: null };
      });
      for (let i = 0; i < workflowSteps.value.length; i++) {
        if (!workflowSteps.value[i].selected) {
          workflowSteps.value[i] = { ...workflowSteps.value[i], status: 'skipped', message: 'Skipped', elapsed: null };
          continue;
        }
        await runWorkflowStep(i);
        if (workflowSteps.value[i].status === 'error') break;
      }
      workflowRunning.value = false;
    }

    function stepRowClass(s) {
      if (s.status === 'done') return 'bg-green-1';
      if (s.status === 'error') return 'bg-red-1';
      return '';
    }

    onMounted(async () => {
      await loadCalendar();
      await loadTm1Processes();
    });

    return {
      tab,
      // Calendar
      calendarRows, loadingCalendar, calendarFilter, calendarFilterOpts, calendarCols, categoryOpts,
      checking, checkResult,
      loadCalendar, handleCheckDividends, handleCategoryChange, handlePaymentDateChange,
      // Forecast
      monthOpts, forecastShare, forecastYear, forecastMonth, readingForecast, forecastResult,
      handleReadForecast,
      adjustShare, adjustDps, adjustYear, adjustMonth, adjusting, adjustResult, handleAdjust,
      // Adjust dialog
      adjustDialogOpen, adjustDialogRow, adjustDialogDps, adjustDialogYear, adjustDialogMonth,
      adjustDialogLoading, adjustDialogResult, openAdjustDialog, handleDialogAdjust,
      // Workflow
      workflowRunning, workflowSteps, verifyResults, verifyCols,
      runSingleWorkflowStep, runSelectedWorkflowSteps, stepRowClass,
    };
  },
});
</script>
