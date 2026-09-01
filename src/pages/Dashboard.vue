<template>
  <main class="close-overview-page" :class="{ 'close-overview-page--detail-open': selectedDetail }">
    <div class="close-overview-page__main">
      <div class="close-overview-page__scroll close-overview-page__periods">
        <FinancialYearSelector
          :years="financialYears"
          :model-value="selectedFinancialYear"
          @update:model-value="selectFinancialYear"
        />
        <MonthCloseStrip
          :months="months"
          :model-value="selectedMonths"
          :disabled="!selectedFinancialYear"
          @update:model-value="handleMonthSelect"
        />
      </div>

      <OverviewContextEmpty
        v-if="!hasRequiredContext"
        :missing-entity="!selectedTenant"
        :missing-financial-year="!selectedFinancialYear"
      />

      <template v-else>
        <div class="close-overview-page__scroll">
          <CloseStageNav :stages="stages" :model-value="selectedStage" @update:model-value="handleStageSelect" />
        </div>

        <IngestSourceWidgets
          v-if="selectedStage === 'ingest'"
          :title="activeWork.title"
          :description="activeWork.description"
          :items="activeWork.items"
          @open="selectDetail('work', $event)"
        />

        <ReconciliationControlGrid
          v-else-if="selectedStage === 'reconcile'"
          :title="activeWork.title"
          :description="activeWork.description"
          :items="activeWork.items"
          @open="selectDetail('work', $event)"
        />

        <CloseWorkTable
          v-else
          :title="activeWork.title"
          :description="activeWork.description"
          :items="activeWork.items"
          :reviewer-label="reviewerLabel"
          @open="selectDetail('work', $event)"
        />

        <CloseCubeComments
          v-if="selectedStage === 'review'"
          :comments="cubeComments"
          @open="selectDetail('comment', $event)"
          @view-all="openRoute('audit-comments')"
        />

        <CloseExceptionsPanel
          :exceptions="exceptions"
          @open="selectDetail('exception', $event)"
          @view-all="openRoute('audit-findings')"
        />
      </template>
    </div>

    <OverviewDetailPanel
      v-if="selectedDetail"
      :selection="selectedDetail"
      @close="clearDetail"
      @open="openOverviewItem"
    />
  </main>
</template>

<script setup>
import { computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import CloseStageNav from '../components/close-overview/CloseStageNav.vue';
import CloseCubeComments from '../components/close-overview/CloseCubeComments.vue';
import CloseExceptionsPanel from '../components/close-overview/CloseExceptionsPanel.vue';
import CloseWorkTable from '../components/close-overview/CloseWorkTable.vue';
import FinancialYearSelector from '../components/close-overview/FinancialYearSelector.vue';
import IngestSourceWidgets from '../components/close-overview/IngestSourceWidgets.vue';
import MonthCloseStrip from '../components/close-overview/MonthCloseStrip.vue';
import ReconciliationControlGrid from '../components/close-overview/ReconciliationControlGrid.vue';
import OverviewContextEmpty from '../components/overview/OverviewContextEmpty.vue';
import OverviewDetailPanel from '../components/overview/OverviewDetailPanel.vue';
import { useOverviewStore } from '../stores/overview';
import { useDataStore } from '../stores/data';
import { useToast } from '../composables/useToast';
import { commentCoordinates, getComments } from '../api/cubeComments';
import { getInvestecBankSyncStatus, getXeroConnectionStatus } from '../api/endpoints';
import apiClient from '../api/client';
import { API_ENDPOINTS } from '../utils/constants';

const router = useRouter();
const overviewStore = useOverviewStore();
const dataStore = useDataStore();
const toast = useToast();
const {
  selectedFinancialYear, selectedMonths, selectedStage, selectedDetail, financialYears, months, stages,
  cubeComments, exceptions, activeWork,
} = storeToRefs(overviewStore);
const { selectedTenant } = storeToRefs(dataStore);
const {
  selectFinancialYear, selectMonths, selectStage, selectDetail, clearDetail, updateSource, updateIngestTask, setCubeComments,
} = overviewStore;

const hasRequiredContext = computed(() => Boolean(selectedTenant.value && selectedFinancialYear.value));

const reviewerLabel = computed(() => ({
  reconcile: 'Verifier',
  review: 'Reviewer',
  signoff: 'Approver',
}[selectedStage.value] || 'Reviewer'));

function openOverviewItem(item) {
  if (dataStore.isDemo) {
    notifyDemoReadOnly();
    return;
  }
  if (item?.routeName && router.hasRoute(item.routeName)) router.push({ name: item.routeName, query: item.query || undefined });
}
function openRoute(routeName) {
  if (dataStore.isDemo) {
    notifyDemoReadOnly();
    return;
  }
  if (router.hasRoute(routeName)) router.push({ name: routeName });
}
function notifyDemoReadOnly() {
  toast.info('Demo data is read-only. No production action or workspace was opened.', { title: 'Demo data' });
}
function handleMonthSelect(monthKeys) { clearDetail(); selectMonths(monthKeys); }
function handleStageSelect(stage) { clearDetail(); selectStage(stage); }

function dateLabel(value, prefix) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const formatted = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(parsed).replace(',', '');
  return `${prefix} ${formatted}`;
}

async function refreshSourceFreshness() {
  const [xeroResult, bankResult, tm1Result] = await Promise.allSettled([
    getXeroConnectionStatus(), getInvestecBankSyncStatus(), apiClient.get(API_ENDPOINTS.PA_TM1_TEST_CONNECTION),
  ]);
  if (xeroResult.status === 'fulfilled') {
    const connected = xeroResult.value?.connected !== false;
    const patch = { state: connected ? 'current' : 'attention' };
    const label = dateLabel(xeroResult.value?.last_refreshed, 'Last synced');
    if (label) patch.timestampLabel = label;
    updateSource('xero', patch);
    const ingestPatch = {
      status: connected ? 'Complete' : 'Attention',
      statusTone: connected ? 'success' : 'warning',
      tone: connected ? 'positive' : 'warning',
      validationLabel: connected ? 'All required processes current' : 'Xero connection requires attention',
    };
    const ingestLabel = dateLabel(xeroResult.value?.last_refreshed, 'Synced');
    if (ingestLabel) ingestPatch.freshnessLabel = ingestLabel;
    updateIngestTask('ingest-xero', ingestPatch);
  }
  if (bankResult.status === 'fulfilled') {
    const lastSync = bankResult.value?.last_synced_at;
    const current = Boolean(lastSync);
    const patch = { state: current ? 'current' : 'attention' };
    const label = dateLabel(lastSync, 'Last updated');
    if (label) patch.timestampLabel = label;
    updateSource('bank', patch);
    const ingestPatch = {
      status: current ? 'Complete' : 'Attention',
      statusTone: current ? 'success' : 'warning',
      tone: current ? 'positive' : 'warning',
      validationLabel: current ? 'No import errors' : 'Bank feed has not completed a sync',
    };
    const ingestLabel = dateLabel(lastSync, 'Updated');
    if (ingestLabel) ingestPatch.freshnessLabel = ingestLabel;
    updateIngestTask('ingest-bank', ingestPatch);
  }
  if (tm1Result.status === 'fulfilled') {
    const data = tm1Result.value?.data || {};
    const current = data.success !== false && data.connected !== false;
    updateSource('tm1', { state: current ? 'current' : 'attention' });
    updateIngestTask('ingest-tm1-targets', {
      status: current ? 'Complete' : 'Attention',
      statusTone: current ? 'success' : 'warning',
      tone: current ? 'positive' : 'warning',
      validationLabel: current ? 'Connection current' : 'Planning Analytics connection requires attention',
    });
  }
}

function commentValue(row) {
  const value = Number(row.cell_value);
  if (!Number.isFinite(value)) return row.cell_value || '—';
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(value);
}

async function refreshCubeComments() {
  try {
    const data = await getComments({ status: 'open', subject_type: 'cube_cell', limit: 3 });
    const items = (data?.results || []).slice(0, 3).map((row) => {
      const coordinates = Object.values(commentCoordinates(row)).filter(Boolean);
      return {
        id: row.id,
        comment: row.comment,
        intersection: coordinates.length ? coordinates.join(' · ') : (row.subject_label || 'Cube cell'),
        value: commentValue(row),
        author: row.author || 'Unattributed',
        when: dateLabel(row.updated_at, '')?.trim() || 'Updated recently',
        status: row.status === 'open' ? 'Open' : row.status,
        tone: row.status === 'open' ? 'warning' : 'neutral',
        routeName: 'audit-comments',
      };
    });
    setCubeComments(items);
  } catch {
    // Keep the last Pinia snapshot when the comments service is unavailable.
  }
}

onMounted(() => Promise.allSettled([refreshSourceFreshness(), refreshCubeComments()]));
</script>
