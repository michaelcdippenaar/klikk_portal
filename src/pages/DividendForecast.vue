<template>
  <div class="page-content">
    <PageHeader title="Dividend Forecast Budget" subtitle="Manage dividend calendar and TM1 forecast adjustments" />

    <KTabs
      :tabs="[
        { name: 'calendar', label: 'Dividend Calendar' },
        { name: 'forecast', label: 'TM1 Forecast' },
        { name: 'workflow', label: 'Workflow' },
      ]"
      v-model="tab"
      :url-sync="false"
    />

    <!-- ===================== CALENDAR TAB ===================== -->
    <div v-if="tab === 'calendar'" class="df-tab">
      <div class="df-toolbar">
        <button class="btn btn-primary btn-sm" :disabled="checking" @click="handleCheckDividends">
          <!-- Lucide refresh-cw -->
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          {{ checking ? 'Checking…' : 'Check all shares' }}
        </button>
        <KSelect
          v-model="calendarFilter"
          label=""
          :options="calendarFilterOpts"
          style="width: 160px;"
        />
        <div class="df-toolbar__spacer" />
        <button class="btn btn-ghost btn-sm" @click="loadCalendar">
          <!-- Lucide download -->
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Reload
        </button>
      </div>

      <div v-if="checkResult" class="klikk-alert-strip df-alert" :class="checkResult.error ? 'tone-error' : 'tone-success'" role="alert">
        <template v-if="checkResult.error">{{ checkResult.error }}</template>
        <template v-else>Checked {{ checkResult.checked }} symbols. {{ (checkResult.results || []).filter(r => r.new_record_saved).length }} new dividend(s) saved.</template>
        <button class="btn btn-ghost btn-sm" @click="checkResult = null">Dismiss</button>
      </div>

      <KTable
        :columns="calendarCols"
        :data="calendarRows"
        :loading="loadingCalendar"
        dense
        pagination="client"
        :pageSize="50"
      >
        <template #cell-tm1_status="{ row }">
          <StatusPill v-if="row.tm1_verified" tone="success" label="Verified" size="sm" />
          <StatusPill v-else-if="row.tm1_adjustment_written" tone="info" label="Written" size="sm" />
          <StatusPill v-else tone="warning" label="Pending" size="sm" />
        </template>
        <template #cell-tm1_adjustment_value="{ value }">
          {{ value != null ? value.toFixed(6) : '—' }}
        </template>
        <template #cell-amount="{ row }">
          {{ row.amount != null ? row.amount.toFixed(4) : '—' }}
          <span v-if="row.currency" class="df-currency">{{ row.currency }}</span>
        </template>
        <template #cell-prior_year_dps="{ value, row }">
          <span v-if="value != null" class="df-tooltip-host" :title="row.prior_year_date ? `Prior year: ${row.prior_year_date}` : ''">
            {{ value.toFixed(4) }}
          </span>
          <span v-else class="df-muted">—</span>
        </template>
        <template #cell-pct_change="{ value }">
          <span v-if="value != null" :class="value > 0 ? 'df-pos df-bold' : value < 0 ? 'df-neg df-bold' : 'df-muted'">
            {{ value > 0 ? '+' : '' }}{{ value.toFixed(1) }}%
          </span>
          <span v-else class="df-muted">—</span>
        </template>
        <template #cell-payment_date="{ row }">
          <input
            type="text"
            class="df-inline-input"
            :value="row.payment_date || ''"
            placeholder="YYYY-MM-DD"
            @change="handlePaymentDateChange(row, $event.target.value)"
          />
        </template>
        <template #cell-dividend_category="{ row }">
          <KSelect
            v-model="row.dividend_category"
            label=""
            :options="categoryOpts"
            style="min-width: 90px;"
            @update:model-value="v => handleCategoryChange(row, v)"
          />
        </template>
        <template #cell-actions="{ row }">
          <button
            v-if="!row.tm1_adjustment_written && row.share_code && row.amount"
            class="btn btn-ghost btn-sm"
            @click="openAdjustDialog(row)"
          >
            <!-- Lucide edit -->
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Adjust
          </button>
        </template>
      </KTable>
    </div>

    <!-- ===================== FORECAST TAB ===================== -->
    <div v-else-if="tab === 'forecast'" class="df-tab">
      <!-- Read forecast -->
      <div class="df-form-row">
        <KInput v-model="forecastShare" label="Share code" placeholder="e.g. ABG" style="flex: 1; max-width: 180px;" />
        <KInput v-model="forecastYear" label="Year" placeholder="2026" style="max-width: 100px;" />
        <KSelect v-model="forecastMonth" label="Month" :options="monthOpts" style="max-width: 120px;" />
        <button class="btn btn-primary btn-sm" :disabled="readingForecast" @click="handleReadForecast" style="align-self: flex-end;">
          <!-- Lucide search -->
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          {{ readingForecast ? 'Reading…' : 'Read forecast' }}
        </button>
      </div>

      <div v-if="forecastResult" class="df-card">
        <div v-if="forecastResult.error" class="df-neg">{{ forecastResult.error }}</div>
        <div v-else>
          <div class="df-forecast-grid">
            <div class="df-forecast-stat">
              <div class="df-forecast-stat__label">Total DPS (All Input Types)</div>
              <div class="df-forecast-stat__value">{{ forecastResult.all_input_types_dps?.toFixed(6) }}</div>
            </div>
            <div class="df-forecast-stat">
              <div class="df-forecast-stat__label">Declared Dividend Adjustment</div>
              <div class="df-forecast-stat__value">{{ forecastResult.declared_dividend_dps?.toFixed(6) }}</div>
            </div>
            <div class="df-forecast-stat">
              <div class="df-forecast-stat__label">Base DPS (rules)</div>
              <div class="df-forecast-stat__value">{{ forecastResult.base_dps?.toFixed(6) }}</div>
            </div>
          </div>
          <div class="df-caption">
            Cube: {{ forecastResult.cube }} | Version: {{ forecastResult.version }} | Entity: {{ forecastResult.entity }}
          </div>
        </div>
      </div>

      <!-- Quick adjust -->
      <div class="df-card">
        <div class="df-card__title">Write adjustment</div>
        <div class="df-form-row">
          <KInput v-model="adjustShare" label="Share code" style="flex: 1; max-width: 180px;" />
          <KInput v-model="adjustDps" label="Declared DPS" type="number" style="max-width: 140px;" />
          <KInput v-model="adjustYear" label="Year" style="max-width: 100px;" />
          <KSelect v-model="adjustMonth" label="Month" :options="monthOpts" style="max-width: 120px;" />
          <div class="df-btn-group" style="align-self: flex-end;">
            <button class="btn btn-ghost btn-sm" :disabled="adjusting" @click="handleAdjust(false)">Dry run</button>
            <button class="btn btn-primary btn-sm" :disabled="adjusting" @click="handleAdjust(true)">Write</button>
          </div>
        </div>
        <div v-if="adjustResult" class="klikk-alert-strip df-alert"
             :class="adjustResult.error ? 'tone-error' : adjustResult.status === 'written' ? 'tone-success' : 'tone-info'">
          <div v-if="adjustResult.error">{{ adjustResult.error }}</div>
          <div v-else>
            <strong>{{ adjustResult.status === 'written' ? 'Written' : 'Dry run' }}</strong> |
            Base DPS: {{ adjustResult.base_dps?.toFixed(6) }} |
            New adjustment: {{ adjustResult.new_adjustment?.toFixed(6) }} |
            Resulting total: {{ adjustResult.resulting_total_dps?.toFixed(6) }}
          </div>
        </div>
      </div>
    </div>

    <!-- ===================== WORKFLOW TAB ===================== -->
    <div v-else-if="tab === 'workflow'" class="df-tab">
      <div class="df-card">
        <div class="df-card__title">Dividend Forecast Pipeline</div>
        <p class="df-caption">Runs for all held shares automatically. No manual selection needed.</p>
        <div v-for="(s, idx) in workflowSteps" :key="idx" class="df-wf-step">
          <KCheckbox v-model="s.selected" :label="s.label" />
          <button
            class="btn btn-ghost btn-sm"
            :disabled="workflowRunning || s.status === 'running'"
            @click="runSingleWorkflowStep(idx)"
          >
            <!-- Lucide play -->
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Run
          </button>
        </div>
      </div>

      <button class="btn btn-primary" :disabled="workflowRunning" @click="runSelectedWorkflowSteps" style="margin-bottom: 16px;">
        <!-- Lucide play-circle -->
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
        {{ workflowRunning ? 'Running…' : 'Run selected steps' }}
      </button>

      <!-- Progress list -->
      <div v-if="workflowSteps.some(s => s.status !== 'idle')" class="df-card">
        <div class="df-card__title">Progress</div>
        <div class="df-progress-list">
          <div v-for="(s, idx) in workflowSteps" :key="'p' + idx" class="df-progress-row" :class="stepRowClass(s)">
            <div class="df-progress-row__icon">
              <!-- Running spinner -->
              <svg v-if="s.status === 'running'" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="df-spin df-icon--accent" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              <!-- Done -->
              <svg v-else-if="s.status === 'done'" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="df-icon--success" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              <!-- Error -->
              <svg v-else-if="s.status === 'error'" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="df-icon--error" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <!-- Skipped -->
              <svg v-else-if="s.status === 'skipped'" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="df-icon--muted" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
              <!-- Idle -->
              <svg v-else xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="df-icon--muted" aria-hidden="true"><circle cx="12" cy="12" r="10"/></svg>
            </div>
            <div class="df-progress-row__body">
              <div class="df-progress-row__label">{{ s.label }}</div>
              <div v-if="s.message" class="df-progress-row__message">{{ s.message }}</div>
            </div>
            <div v-if="s.elapsed != null" class="df-progress-row__elapsed">{{ s.elapsed }}s</div>
          </div>
        </div>
      </div>

      <!-- Verify results table -->
      <div v-if="verifyResults.length" class="df-card">
        <div class="df-card__title">Verification Results</div>
        <KTable
          :columns="verifyCols"
          :data="verifyResults"
          dense
          pagination="client"
          :pageSize="50"
        >
          <template #cell-status="{ value }">
            <StatusPill
              :tone="value === 'verified' ? 'success' : value === 'mismatch' ? 'error' : 'warning'"
              :label="value"
              size="sm"
            />
          </template>
        </KTable>
      </div>
    </div>

    <!-- ===================== ADJUST DIALOG ===================== -->
    <KDialog v-model="adjustDialogOpen" title="Adjust TM1 Forecast" size="md">
      <template v-if="adjustDialogRow">
        <div class="df-dialog-row">
          <strong>{{ adjustDialogRow?.share_code }}</strong>
          <span class="df-muted">({{ adjustDialogRow?.company }})</span>
          <StatusPill
            :tone="adjustDialogRow?.dividend_category === 'foreign' ? 'info' : adjustDialogRow?.dividend_category === 'special' ? 'warning' : 'success'"
            :label="adjustDialogRow?.dividend_category || 'regular'"
            size="sm"
          />
        </div>
        <div class="df-muted df-dialog-meta">
          Ex-date: {{ adjustDialogRow?.ex_dividend_date }} | Amount: {{ adjustDialogRow?.amount }}
        </div>
        <div class="df-dialog-fields">
          <KInput v-model="adjustDialogDps" label="Declared DPS" type="number" />
          <KInput v-model="adjustDialogYear" label="Year" />
          <KSelect v-model="adjustDialogMonth" label="Month" :options="monthOpts" />
        </div>
        <div v-if="adjustDialogResult" class="klikk-alert-strip df-alert"
             :class="adjustDialogResult.error ? 'tone-error' : adjustDialogResult.status === 'written' ? 'tone-success' : 'tone-info'">
          <div v-if="adjustDialogResult.error">{{ adjustDialogResult.error }}</div>
          <div v-else>
            {{ adjustDialogResult.status === 'written' ? 'Written!' : 'Dry run' }} |
            Adjustment: {{ adjustDialogResult.new_adjustment?.toFixed(6) }} |
            Total: {{ adjustDialogResult.resulting_total_dps?.toFixed(6) }}
            <span v-if="adjustDialogResult.txn_type"> | TM1: {{ adjustDialogResult.txn_type }}</span>
            <span v-if="adjustDialogResult.zero_base" class="df-warn"> | Zero base (new share?)</span>
          </div>
        </div>
      </template>
      <template #footer>
        <button class="btn btn-ghost btn-sm" :disabled="adjustDialogLoading" @click="handleDialogAdjust(false)">Dry run</button>
        <button class="btn btn-primary btn-sm" :disabled="adjustDialogLoading" @click="handleDialogAdjust(true)">Write to TM1</button>
        <button class="btn btn-ghost btn-sm" @click="adjustDialogOpen = false">Close</button>
      </template>
    </KDialog>
  </div>
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
import PageHeader from '../components/klikk/PageHeader.vue';
import KTabs from '../components/klikk/KTabs.vue';
import KTable from '../components/klikk/KTable.vue';
import KInput from '../components/klikk/KInput.vue';
import KSelect from '../components/klikk/KSelect.vue';
import KCheckbox from '../components/klikk/KCheckbox.vue';
import KDialog from '../components/klikk/KDialog.vue';
import StatusPill from '../components/klikk/StatusPill.vue';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default defineComponent({
  name: 'DividendForecast',
  components: { PageHeader, KTabs, KTable, KInput, KSelect, KCheckbox, KDialog, StatusPill },
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

    // KTable column definitions for calendar
    const calendarCols = [
      { accessorKey: 'share_code',           header: 'Share',        enableSorting: true },
      { accessorKey: 'company',              header: 'Company',      enableSorting: true },
      { accessorKey: 'symbol',               header: 'Ticker',       enableSorting: true },
      { accessorKey: 'ex_dividend_date',     header: 'Ex-Date',      enableSorting: true },
      { accessorKey: 'payment_date',         header: 'Pay Date',     enableSorting: true },
      { accessorKey: 'amount',               header: 'DPS',          meta: { align: 'right' }, enableSorting: true },
      { accessorKey: 'prior_year_dps',       header: 'Prior Yr DPS', meta: { align: 'right' }, enableSorting: true },
      { accessorKey: 'pct_change',           header: '% Chg',        meta: { align: 'right' }, enableSorting: true },
      { accessorKey: 'tm1_adjustment_written', header: 'TM1 Status', id: 'tm1_status', meta: { align: 'center' } },
      { accessorKey: 'tm1_target_month',     header: 'TM1 Month',   meta: { align: 'center' }, enableSorting: true },
      { accessorKey: 'tm1_adjustment_value', header: 'TM1 Adj',     meta: { align: 'right' }, enableSorting: true },
      {
        accessorKey: 'tm1_written_at',
        header: 'Written',
        enableSorting: true,
        cell: (info) => info.getValue() ? new Date(info.getValue()).toLocaleDateString() : '—',
      },
      { accessorKey: 'dividend_category',    header: 'Type',         meta: { align: 'center' }, enableSorting: true },
      { accessorKey: 'status',               header: 'Status',       enableSorting: true },
      { accessorKey: 'id',                   header: '',             id: 'actions',              meta: { align: 'center' } },
    ];

    const categoryOpts = [
      { label: 'Regular', value: 'regular' },
      { label: 'Special',  value: 'special' },
      { label: 'Foreign',  value: 'foreign' },
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
    const forecastYear  = ref(String(new Date().getFullYear()));
    const forecastMonth = ref(MONTHS[new Date().getMonth()]);
    const readingForecast = ref(false);
    const forecastResult  = ref(null);

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

    const adjustShare  = ref('');
    const adjustDps    = ref('');
    const adjustYear   = ref(String(new Date().getFullYear()));
    const adjustMonth  = ref(MONTHS[new Date().getMonth()]);
    const adjusting    = ref(false);
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
    const adjustDialogOpen    = ref(false);
    const adjustDialogRow     = ref(null);
    const adjustDialogDps     = ref('');
    const adjustDialogYear    = ref('');
    const adjustDialogMonth   = ref('');
    const adjustDialogLoading = ref(false);
    const adjustDialogResult  = ref(null);

    function openAdjustDialog(row) {
      adjustDialogRow.value = row;
      adjustDialogDps.value = row.amount;
      const targetDate = row.payment_date ? new Date(row.payment_date)
        : row.ex_dividend_date ? new Date(row.ex_dividend_date)
        : new Date();
      adjustDialogYear.value  = String(targetDate.getFullYear());
      adjustDialogMonth.value = MONTHS[targetDate.getMonth()];
      adjustDialogResult.value = null;
      adjustDialogOpen.value  = true;
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
    const verifyResults   = ref([]);
    const verifyCols = [
      { accessorKey: 'share_code',       header: 'Share',         enableSorting: true },
      { accessorKey: 'ex_dividend_date', header: 'Ex-Date',       enableSorting: true },
      { accessorKey: 'amount',           header: 'Declared DPS',  meta: { align: 'right' }, enableSorting: true, cell: (i) => i.getValue() != null ? i.getValue().toFixed(6) : '—' },
      { accessorKey: 'db_adjustment',    header: 'DB Adj',        meta: { align: 'right' }, enableSorting: true, cell: (i) => i.getValue() != null ? i.getValue().toFixed(6) : '—' },
      { accessorKey: 'tm1_adjustment',   header: 'TM1 Adj',       meta: { align: 'right' }, enableSorting: true, cell: (i) => i.getValue() != null ? i.getValue().toFixed(6) : '—' },
      { accessorKey: 'tm1_total_dps',    header: 'TM1 Total DPS', meta: { align: 'right' }, enableSorting: true, cell: (i) => i.getValue() != null ? i.getValue().toFixed(6) : '—' },
      { accessorKey: 'status',           header: 'Status',        meta: { align: 'center' }, enableSorting: true },
    ];

    const workflowSteps = ref([
      { key: 'check',          label: '1. Check yfinance for declared dividends (all shares)',  selected: true, status: 'idle', message: '', elapsed: null },
      { key: 'adjust_pending', label: '2. Write TM1 adjustments for all pending entries',       selected: true, status: 'idle', message: '', elapsed: null },
      { key: 'verify',         label: '3. Verify TM1 values match DB adjustments',              selected: true, status: 'idle', message: '', elapsed: null },
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
          workflowSteps.value[idx] = { ...workflowSteps.value[idx], status: 'done', message: `Checked ${res.checked || 0} symbols, ${saved} new dividend(s) saved`, elapsed: ((Date.now() - t0) / 1000).toFixed(1) };
          await loadCalendar();
          return;
        }
        if (s.key === 'adjust_pending') {
          res = await adjustAllPendingDividends();
          if (res.error) throw new Error(res.error);
          const specialMsg = res.skipped_special ? `, ${res.skipped_special} special skipped` : '';
          workflowSteps.value[idx] = { ...workflowSteps.value[idx], status: 'done', message: `${res.adjustments_written || 0} adjustment(s) written (${res.pending_found || 0} pending found${specialMsg})`, elapsed: ((Date.now() - t0) / 1000).toFixed(1) };
          await loadCalendar();
          return;
        }
        if (s.key === 'verify') {
          res = await verifyDividendForecasts();
          if (res.error) throw new Error(res.error);
          verifyResults.value = res.results || [];
          const statusMsg = `${res.verified || 0} verified, ${res.mismatches || 0} mismatch(es), ${res.errors || 0} error(s)`;
          workflowSteps.value[idx] = { ...workflowSteps.value[idx], status: (res.mismatches || 0) > 0 ? 'error' : 'done', message: statusMsg, elapsed: ((Date.now() - t0) / 1000).toFixed(1) };
          await loadCalendar();
          return;
        }
        if (s.key.startsWith('tm1:') && paApi) {
          res = await paApi.executeTm1Process(s.processName, s.parameters);
          const success = res?.success !== false;
          workflowSteps.value[idx] = { ...workflowSteps.value[idx], status: success ? 'done' : 'error', message: res?.message || (success ? 'OK' : 'Failed'), elapsed: ((Date.now() - t0) / 1000).toFixed(1) };
          return;
        }
        workflowSteps.value[idx] = { ...workflowSteps.value[idx], status: 'done', message: 'OK', elapsed: ((Date.now() - t0) / 1000).toFixed(1) };
      } catch (e) {
        workflowSteps.value[idx] = { ...workflowSteps.value[idx], status: 'error', message: e.response?.data?.error || e.message, elapsed: ((Date.now() - t0) / 1000).toFixed(1) };
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
      if (s.status === 'done')  return 'df-progress-row--done';
      if (s.status === 'error') return 'df-progress-row--error';
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

<style scoped>
.page-content {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.df-tab {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* Toolbar */
.df-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.df-toolbar__spacer {
  flex: 1;
}

/* Alert strip */
.df-alert {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

/* Cards */
.df-card {
  background: var(--kdl-card-bg);
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 8px;
  padding: 16px;
}

.df-card__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--kdl-text-primary);
  margin-bottom: 10px;
}

/* Form rows */
.df-form-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.df-btn-group {
  display: flex;
  gap: 6px;
}

/* Forecast grid */
.df-forecast-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 8px;
}

@media (max-width: 640px) {
  .df-forecast-grid { grid-template-columns: 1fr; }
}

.df-forecast-stat__label {
  font-size: 11px;
  color: var(--kdl-text-hint);
  margin-bottom: 4px;
}

.df-forecast-stat__value {
  font-size: 18px;
  font-weight: 700;
  color: var(--kdl-text-primary);
}

/* Caption */
.df-caption {
  font-size: 11px;
  color: var(--kdl-text-hint);
}

/* Workflow steps */
.df-wf-step {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

/* Progress list */
.df-progress-list {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 6px;
  overflow: hidden;
}

.df-progress-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--kdl-border-subtle);
  background: var(--kdl-card-bg);
}

.df-progress-row:last-child { border-bottom: none; }

.df-progress-row--done  { background: color-mix(in srgb, var(--kdl-status-success) 8%, transparent); }
.df-progress-row--error { background: color-mix(in srgb, var(--kdl-status-error) 8%, transparent); }

.df-progress-row__icon { flex-shrink: 0; display: flex; align-items: center; }
.df-progress-row__body { flex: 1 1 0; min-width: 0; }
.df-progress-row__label { font-size: 13px; color: var(--kdl-text-primary); }
.df-progress-row__message { font-size: 11px; color: var(--kdl-text-muted); margin-top: 2px; }
.df-progress-row__elapsed { font-size: 11px; color: var(--kdl-text-hint); flex-shrink: 0; }

/* Spinner animation */
.df-spin { animation: df-spin 0.8s linear infinite; }
@keyframes df-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .df-spin { animation: none; } }

/* Icon colours */
.df-icon--success { color: var(--kdl-status-success); }
.df-icon--error   { color: var(--kdl-status-error); }
.df-icon--accent  { color: var(--kdl-accent); }
.df-icon--muted   { color: var(--kdl-text-hint); }

/* Dialog internals */
.df-dialog-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}

.df-dialog-meta {
  margin-bottom: 12px;
  font-size: 13px;
}

.df-dialog-fields {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
}

/* Inline table input */
.df-inline-input {
  background: transparent;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 12px;
  color: var(--kdl-text-primary);
  min-width: 110px;
  font-family: inherit;
}

.df-inline-input:focus {
  outline: 2px solid var(--kdl-accent);
  outline-offset: 1px;
  border-color: var(--kdl-accent);
}

/* Utilities */
.df-muted   { color: var(--kdl-text-hint); font-size: 13px; }
.df-pos     { color: var(--kdl-status-success); }
.df-neg     { color: var(--kdl-status-error); }
.df-warn    { color: var(--kdl-status-warning); }
.df-bold    { font-weight: 600; }
.df-currency { font-size: 11px; color: var(--kdl-text-hint); margin-left: 3px; }
</style>
