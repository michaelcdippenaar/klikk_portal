<template>
  <AppPage>
    <PageHeader title="Watchlist" subtitle="Stock data from yfinance — select a symbol for details and chart" />

    <div class="fi-toolbar">
      <span v-if="lastRefreshedAt" class="text-muted">Last updated {{ lastRefreshedAt.toLocaleTimeString() }}</span>
      <div class="fi-toolbar__right">
        <KInput
          v-model="newSymbol"
          label=""
          placeholder="Add symbol"
          class="fi-symbol-input"
          @keyup.enter="addSymbol"
        />
        <button class="btn btn-primary btn-sm" :disabled="addingSymbol || !newSymbol.trim()" @click="addSymbol">
          {{ addingSymbol ? 'Adding…' : 'Add' }}
        </button>
      </div>
    </div>

    <div class="fi-layout">
      <!-- Left: Watchlist -->
      <div class="fi-layout__left">
        <SectionCard>
          <template #actions>
            <!-- Column visibility toggle via KTable's showVisibilityMenu -->
          </template>
          <span class="text-muted">Toggle columns to show</span>
          <KTable
            :columns="watchlistColumns"
            :data="symbols"
            :loading="loadingSymbols"
            dense
            pagination="client"
            :pageSize="25"
            :pageSizeOptions="[25, 50, 100]"
            :showVisibilityMenu="true"
            v-model:visibleColumns="watchlistVisibility"
            @row-click="onSymbolRowClick"
          >
            <template #cell-last_close="{ row }">
              <span class="text-right fi-num">{{ row.last_close != null ? Number(row.last_close).toFixed(2) : '—' }}</span>
            </template>
            <template #cell-change="{ row }">
              <span class="fi-num" :class="row.change != null && row.change >= 0 ? 'fi-pos' : row.change != null ? 'fi-neg' : ''">
                {{ row.change != null ? Number(row.change).toFixed(2) : '—' }}
              </span>
            </template>
            <template #cell-change_pct="{ row }">
              <span class="fi-num" :class="row.change_pct != null && row.change_pct >= 0 ? 'fi-pos' : row.change_pct != null ? 'fi-neg' : ''">
                {{ row.change_pct != null ? Number(row.change_pct).toFixed(2) + '%' : '—' }}
              </span>
            </template>
            <template #cell-pe_ratio="{ row }">
              <span class="fi-num">{{ row.pe_ratio != null ? Number(row.pe_ratio).toFixed(1) : '—' }}</span>
            </template>
            <template #cell-forward_pe="{ row }">
              <span class="fi-num">{{ row.forward_pe != null ? Number(row.forward_pe).toFixed(1) : '—' }}</span>
            </template>
            <template #cell-dividend_yield="{ row }">
              <span class="fi-num">{{ row.dividend_yield != null ? Number(row.dividend_yield).toFixed(2) + '%' : '—' }}</span>
            </template>
            <template #cell-recommendation="{ row }">
              <span :class="{ 'fi-pos': row.recommendation === 'Buy', 'fi-neg': row.recommendation === 'Sell' }">
                {{ row.recommendation || '—' }}
              </span>
            </template>
          </KTable>
        </SectionCard>
      </div>

      <!-- Right: Symbol detail -->
      <div class="fi-layout__right">
        <SectionCard v-if="selectedSymbol">
          <template #actions>
            <button class="btn btn-primary btn-sm" :disabled="refreshing" @click="refreshSelected">
              <!-- Lucide refresh-cw -->
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
              {{ refreshing ? 'Refreshing…' : 'Refresh prices' }}
            </button>
            <button class="btn btn-ghost btn-sm" :disabled="refreshingExtra" @click="refreshExtraSelected">
              <!-- Lucide sync / rotate-cw -->
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.43"/></svg>
              {{ refreshingExtra ? 'Refreshing…' : 'Refresh extra' }}
            </button>
          </template>

          <div class="fi-symbol-header">
            <span class="fi-symbol-header__symbol">{{ selectedSymbol }}</span>
            <span class="text-muted">{{ selectedSymbolCompany }}</span>
            <span v-if="selectedSymbolLastClose != null" class="fi-symbol-header__price">{{ Number(selectedSymbolLastClose).toFixed(2) }}</span>
            <span v-if="selectedSymbolChange != null" :class="selectedSymbolChange >= 0 ? 'fi-pos' : 'fi-neg'">
              {{ selectedSymbolChange >= 0 ? '+' : '' }}{{ Number(selectedSymbolChange).toFixed(2) }}
              ({{ selectedSymbolChangePct != null ? (selectedSymbolChangePct >= 0 ? '+' : '') + Number(selectedSymbolChangePct).toFixed(2) + '%' : '—' }})
            </span>
          </div>

          <!-- Period buttons -->
          <div class="fi-periods">
            <button
              v-for="p in periodOptions"
              :key="p.key"
              class="btn btn-sm"
              :class="selectedPeriod === p.key ? 'btn-primary' : 'btn-ghost'"
              @click="setPeriod(p.key)"
            >{{ p.label }}</button>
          </div>

          <FinancialLineChart v-if="chartLabels.length" :labels="chartLabels" :data="chartData" class="fi-chart" />

          <!-- Tabs -->
          <KTabs
            :tabs="[
              { name: 'prices', label: 'Overview' },
              { name: 'dividends', label: 'Dividends' },
              { name: 'splits', label: 'Splits' },
              { name: 'info', label: 'Company info' },
              { name: 'financials', label: 'Financials' },
              { name: 'earnings', label: 'Earnings' },
              { name: 'analyst', label: 'Analyst' },
              { name: 'ownership', label: 'Ownership' },
              { name: 'news', label: 'News' },
            ]"
            v-model="detailTab"
            :url-sync="false"
          />

          <!-- Tab panels -->
          <div class="fi-tab-panel">

            <!-- Prices / Overview -->
            <template v-if="detailTab === 'prices'">
              <div class="fi-date-row">
                <KInput v-model="startDate" label="From" type="date" class="fi-date-input" />
                <KInput v-model="endDate" label="To" type="date" class="fi-date-input" />
                <button class="btn btn-ghost btn-sm fi-date-btn" :disabled="loadingHistory" @click="loadHistory">
                  {{ loadingHistory ? 'Loading…' : 'Load' }}
                </button>
              </div>
              <KTable
                :columns="historyColumns"
                :data="history"
                :loading="loadingHistory"
                dense
                pagination="client"
                :pageSize="10"
                :pageSizeOptions="[10, 25, 50]"
              />
            </template>

            <!-- Dividends -->
            <template v-else-if="detailTab === 'dividends'">
              <p v-if="trailingDividendYieldPct != null" class="text-muted fi-note">
                <strong>Trailing dividend yield (12m):</strong> {{ Number(trailingDividendYieldPct).toFixed(2) }}%
              </p>
              <KTable
                :columns="dividendColumns"
                :data="dividends"
                :loading="loadingExtra.dividends"
                dense
                pagination="none"
              />
              <p v-if="!loadingExtra.dividends && dividends.length === 0" class="text-muted">No dividends stored. Click "Refresh extra data" to fetch.</p>
            </template>

            <!-- Splits -->
            <template v-else-if="detailTab === 'splits'">
              <KTable
                :columns="splitColumns"
                :data="splits"
                :loading="loadingExtra.splits"
                dense
                pagination="none"
              />
              <p v-if="!loadingExtra.splits && splits.length === 0" class="text-muted">No splits stored. Click "Refresh extra data" to fetch.</p>
            </template>

            <!-- Info -->
            <template v-else-if="detailTab === 'info'">
              <div v-if="loadingExtra.info" class="text-muted">Loading…</div>
              <pre v-else-if="companyInfo" class="fi-json-pre fi-json-pre--tall">{{ JSON.stringify(companyInfo, null, 2) }}</pre>
              <p v-else class="text-muted">No company info. Click "Refresh extra data" to fetch.</p>
            </template>

            <!-- Financials -->
            <template v-else-if="detailTab === 'financials'">
              <KSelect v-model="financialsFreq" label="" :options="['yearly', 'quarterly', 'trailing']" class="fi-freq-select" @update:model-value="loadFinancials" />
              <div v-if="loadingExtra.financials" class="text-muted">Loading…</div>
              <div v-else-if="financialStatements.length">
                <div v-for="stmt in financialStatements" :key="stmt.statement_type" class="fi-stmt">
                  <div class="section-header fi-stmt__title">{{ stmt.statement_type }}</div>
                  <pre class="fi-json-pre fi-json-pre--medium">{{ JSON.stringify(stmt.data, null, 2) }}</pre>
                </div>
              </div>
              <p v-else class="text-muted">No financial statements. Click "Refresh extra data" to fetch.</p>
            </template>

            <!-- Earnings -->
            <template v-else-if="detailTab === 'earnings'">
              <KSelect v-model="earningsFreq" label="" :options="['yearly', 'quarterly', 'trailing']" class="fi-freq-select" @update:model-value="loadEarnings" />
              <div v-if="loadingExtra.earnings" class="text-muted">Loading…</div>
              <pre v-else-if="earningsData.length" class="fi-json-pre fi-json-pre--tall">{{ JSON.stringify(earningsData, null, 2) }}</pre>
              <p v-else class="text-muted">No earnings data. Click "Refresh extra data" to fetch.</p>
              <div v-if="earningsEstimate && Object.keys(earningsEstimate.data || {}).length" class="fi-stmt">
                <div class="section-header fi-stmt__title">Earnings estimate</div>
                <pre class="fi-json-pre fi-json-pre--short">{{ JSON.stringify(earningsEstimate.data, null, 2) }}</pre>
              </div>
            </template>

            <!-- Analyst -->
            <template v-else-if="detailTab === 'analyst'">
              <div v-if="loadingExtra.analyst" class="text-muted">Loading…</div>
              <template v-else>
                <div v-if="analystPriceTarget && Object.keys(analystPriceTarget.data || {}).length" class="fi-stmt">
                  <div class="section-header fi-stmt__title">Price target</div>
                  <pre class="fi-json-pre">{{ JSON.stringify(analystPriceTarget.data, null, 2) }}</pre>
                </div>
                <div v-if="analystRecommendations && (analystRecommendations.data || []).length" class="fi-stmt">
                  <div class="section-header fi-stmt__title">Recommendations</div>
                  <pre class="fi-json-pre fi-json-pre--medium">{{ JSON.stringify(analystRecommendations.data, null, 2) }}</pre>
                </div>
                <p v-if="(!analystPriceTarget || !Object.keys(analystPriceTarget.data || {}).length) && (!analystRecommendations || !(analystRecommendations.data || []).length)" class="text-muted">No analyst data. Click "Refresh extra data" to fetch.</p>
              </template>
            </template>

            <!-- Ownership -->
            <template v-else-if="detailTab === 'ownership'">
              <div v-if="loadingExtra.ownership" class="text-muted">Loading…</div>
              <div v-else-if="ownershipData.length">
                <div v-for="o in ownershipData" :key="o.holder_type" class="fi-stmt">
                  <div class="section-header fi-stmt__title">{{ o.holder_type }}</div>
                  <pre class="fi-json-pre fi-json-pre--medium">{{ JSON.stringify(o.data, null, 2) }}</pre>
                </div>
              </div>
              <p v-else class="text-muted">No ownership data. Click "Refresh extra data" to fetch.</p>
            </template>

            <!-- News -->
            <template v-else-if="detailTab === 'news'">
              <div v-if="loadingExtra.news" class="text-muted">Loading…</div>
              <div v-else-if="newsItems.length" class="fi-news">
                <article v-for="n in newsItems" :key="n.title + (n.published_at || '')" class="fi-news-article">
                  <h3 class="fi-news-article__title">
                    <a v-if="n.link" :href="n.link" target="_blank" rel="noopener" class="fi-news-article__link">{{ n.title }}</a>
                    <span v-else>{{ n.title }}</span>
                  </h3>
                  <div class="text-muted fi-news-article__meta">
                    <span v-if="n.publisher">{{ n.publisher }}</span>
                    <span v-if="n.publisher && n.published_at"> · </span>
                    <span v-if="n.published_at">{{ new Date(n.published_at).toLocaleString() }}</span>
                  </div>
                  <p v-if="n.summary" class="fi-news-article__summary">{{ n.summary }}</p>
                </article>
              </div>
              <p v-else class="text-muted">No news. Click "Refresh extra data" to fetch.</p>
            </template>

          </div>

          <!-- Refresh result banners -->
          <div v-if="refreshResult" class="klikk-alert-strip fi-result-strip" :class="refreshResult.error ? 'tone-error' : 'tone-success'">
            {{ refreshResult.error || `Refreshed ${refreshResult.created ?? 0} points.` }}
          </div>
          <div v-if="refreshExtraResult" class="klikk-alert-strip fi-result-strip" :class="refreshExtraResult.error ? 'tone-error' : 'tone-success'">
            {{ refreshExtraResult.error || (refreshExtraResult.results ? 'Extra data refreshed.' : '') }}
          </div>
        </SectionCard>

        <div v-else class="klikk-alert-strip tone-info fi-select-hint">
          Select a symbol from the watchlist to view chart, price history and extra data (dividends, company info, financials, earnings, analyst, ownership, news).
        </div>
      </div>
    </div>
  </AppPage>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import AppPage from '../components/shell/AppPage.vue';
import FinancialLineChart from '../components/FinancialLineChart.vue';
import PageHeader from '../components/klikk/PageHeader.vue';
import SectionCard from '../components/klikk/SectionCard.vue';
import KTable from '../components/klikk/KTable.vue';
import KInput from '../components/klikk/KInput.vue';
import KSelect from '../components/klikk/KSelect.vue';
import KTabs from '../components/klikk/KTabs.vue';
import {
  getFinancialInvestmentsSymbols,
  getFinancialInvestmentsHistory,
  refreshFinancialInvestmentsSymbol,
  refreshFinancialInvestmentsExtra,
  getFinancialInvestmentsDividends,
  getFinancialInvestmentsSplits,
  getFinancialInvestmentsInfo,
  getFinancialInvestmentsFinancialStatements,
  getFinancialInvestmentsEarnings,
  getFinancialInvestmentsEarningsEstimate,
  getFinancialInvestmentsAnalystRecommendations,
  getFinancialInvestmentsAnalystPriceTarget,
  getFinancialInvestmentsOwnership,
  getFinancialInvestmentsNews,
  getFinancialInvestmentsWatchlistPreference,
  saveFinancialInvestmentsWatchlistPreference,
} from '../api/endpoints.js';

const symbols = ref([]);
const loadingSymbols = ref(false);
const addingSymbol = ref(false);

// ── KTable columns for the watchlist ──────────────────────────────────────────
// TanStack column definitions — accessorKey maps to row field names
const ALL_WATCHLIST_COLUMN_DEFS = [
  { accessorKey: 'symbol',           header: 'Symbol',          enableSorting: true },
  { accessorKey: 'name',             header: 'Name',            enableSorting: true },
  { accessorKey: 'last_close',       header: 'Last',            meta: { align: 'right' }, enableSorting: true },
  { accessorKey: 'change',           header: 'Change',          meta: { align: 'right' }, enableSorting: true },
  { accessorKey: 'change_pct',       header: 'Chg %',           meta: { align: 'right' }, enableSorting: true },
  { accessorKey: 'pe_ratio',         header: 'P/E',             meta: { align: 'right' }, enableSorting: true },
  { accessorKey: 'forward_pe',       header: 'Fwd P/E',         meta: { align: 'right' }, enableSorting: true },
  { accessorKey: 'dividend_yield',   header: 'Div yield %',     meta: { align: 'right' }, enableSorting: true },
  { accessorKey: 'recommendation',   header: 'Recommendation',  enableSorting: true },
  { accessorKey: 'exchange',         header: 'Exchange',        enableSorting: true },
];

const watchlistColumns = ALL_WATCHLIST_COLUMN_DEFS;

// v-model:visibleColumns for KTable's built-in visibility menu
// { [columnId]: boolean }
const watchlistVisibility = ref(
  Object.fromEntries(ALL_WATCHLIST_COLUMN_DEFS.map((c) => [c.accessorKey, true]))
);

const selectedSymbol = ref(null);
const newSymbol = ref('');

const selectedSymbolCompany = computed(() => {
  if (!selectedSymbol.value) return '';
  const row = symbols.value.find((r) => r.symbol === selectedSymbol.value);
  return (row?.share_name_mapping?.company || row?.name || selectedSymbol.value);
});

const selectedSymbolRowData = computed(() => {
  if (!selectedSymbol.value) return null;
  return symbols.value.find((r) => r.symbol === selectedSymbol.value);
});
const selectedSymbolLastClose = computed(() => selectedSymbolRowData.value?.last_close ?? null);
const selectedSymbolChange    = computed(() => selectedSymbolRowData.value?.change ?? null);
const selectedSymbolChangePct = computed(() => selectedSymbolRowData.value?.change_pct ?? null);

const periodOptions = [
  { key: '1D', label: '1D', days: 1 },
  { key: '5D', label: '5D', days: 5 },
  { key: '1M', label: '1M', days: 30 },
  { key: '3M', label: '3M', days: 90 },
  { key: '6M', label: '6M', days: 180 },
  { key: '1Y', label: '1Y', days: 365 },
];
const selectedPeriod = ref('3M');

const chartLabels = computed(() => history.value.map((h) => h.date));
const chartData   = computed(() => history.value.map((h) => h.close));

const history = ref([]);
const loadingHistory = ref(false);
const refreshing = ref(false);
const refreshingExtra = ref(false);
const refreshResult = ref(null);
const refreshExtraResult = ref(null);
const lastRefreshedAt = ref(null);
const startDate = ref('');
const endDate = ref('');
const detailTab = ref('prices');

// History table columns
const historyColumns = [
  { accessorKey: 'date',   header: 'Date',   enableSorting: true },
  { accessorKey: 'open',   header: 'Open',   meta: { align: 'right' }, cell: (i) => i.getValue() != null ? Number(i.getValue()).toFixed(2) : '' },
  { accessorKey: 'high',   header: 'High',   meta: { align: 'right' }, cell: (i) => i.getValue() != null ? Number(i.getValue()).toFixed(2) : '' },
  { accessorKey: 'low',    header: 'Low',    meta: { align: 'right' }, cell: (i) => i.getValue() != null ? Number(i.getValue()).toFixed(2) : '' },
  { accessorKey: 'close',  header: 'Close',  meta: { align: 'right' }, cell: (i) => i.getValue() != null ? Number(i.getValue()).toFixed(2) : '' },
  { accessorKey: 'volume', header: 'Volume', meta: { align: 'right' }, cell: (i) => i.getValue() != null ? Number(i.getValue()).toLocaleString() : '' },
];

const dividends = ref([]);
const trailingDividendYieldPct = ref(null);
const splits = ref([]);
const companyInfo = ref(null);
const financialStatements = ref([]);
const financialsFreq = ref('yearly');
const earningsData = ref([]);
const earningsEstimate = ref(null);
const earningsFreq = ref('yearly');
const analystRecommendations = ref(null);
const analystPriceTarget = ref(null);
const ownershipData = ref([]);
const newsItems = ref([]);

// Dividend / split table columns
const dividendColumns = [
  { accessorKey: 'paid_on',    header: 'Paid on' },
  { accessorKey: 'amount',     header: 'Amount',   meta: { align: 'right' }, cell: (i) => i.getValue() != null ? Number(i.getValue()).toFixed(4) : '' },
  { accessorKey: 'yield_pct',  header: 'Yield %',  meta: { align: 'right' }, cell: (i) => i.getValue() != null ? Number(i.getValue()).toFixed(2) + '%' : '—' },
  { accessorKey: 'currency',   header: 'Currency' },
];

const splitColumns = [
  { accessorKey: 'date',  header: 'Date' },
  { accessorKey: 'ratio', header: 'Ratio', meta: { align: 'right' }, cell: (i) => i.getValue() != null ? Number(i.getValue()) : '' },
];

const loadingExtra = ref({
  dividends: false, splits: false, info: false,
  financials: false, earnings: false, analyst: false, ownership: false, news: false,
});

function setDefaultDates() {
  const end = new Date();
  const start = new Date();
  const period = periodOptions.find((p) => p.key === selectedPeriod.value) || periodOptions.find((p) => p.key === '3M');
  start.setDate(start.getDate() - (period?.days ?? 90));
  endDate.value = end.toISOString().slice(0, 10);
  startDate.value = start.toISOString().slice(0, 10);
}

function setPeriod(key) {
  selectedPeriod.value = key;
  const period = periodOptions.find((p) => p.key === key);
  if (!period) return;
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - period.days);
  endDate.value = end.toISOString().slice(0, 10);
  startDate.value = start.toISOString().slice(0, 10);
  if (selectedSymbol.value) loadHistory();
}

async function loadSymbols() {
  loadingSymbols.value = true;
  try {
    symbols.value = await getFinancialInvestmentsSymbols();
    lastRefreshedAt.value = new Date();
  } catch (e) {
    console.error(e);
    symbols.value = [];
  } finally {
    loadingSymbols.value = false;
  }
}

async function saveWatchlistColumns() {
  try {
    // Convert KTable visibility state { colId: bool } back to array of visible keys
    const visibleKeys = Object.entries(watchlistVisibility.value)
      .filter(([, v]) => v)
      .map(([k]) => k);
    await saveFinancialInvestmentsWatchlistPreference({ visible_columns: visibleKeys });
  } catch (e) {
    console.error('Failed to save column preference', e);
  }
}

// Persist column visibility changes
watch(watchlistVisibility, saveWatchlistColumns, { deep: true });

function onSymbolRowClick(row) {
  selectedSymbol.value = row.symbol;
  refreshResult.value = null;
  refreshExtraResult.value = null;
  setDefaultDates();
  loadHistory();
  detailTab.value = 'prices';
  loadExtraForTab('prices');
}

watch(detailTab, (tab) => {
  if (selectedSymbol.value) loadExtraForTab(tab);
});

async function loadExtraForTab(tab) {
  const sym = selectedSymbol.value;
  if (!sym) return;
  if (tab === 'dividends') {
    loadingExtra.value.dividends = true;
    try {
      const res = await getFinancialInvestmentsDividends(sym);
      dividends.value = Array.isArray(res) ? res : (res?.dividends ?? []);
      trailingDividendYieldPct.value = res?.trailing_dividend_yield_pct ?? null;
    } catch (e) {
      dividends.value = [];
      trailingDividendYieldPct.value = null;
    } finally {
      loadingExtra.value.dividends = false;
    }
  } else if (tab === 'splits') {
    loadingExtra.value.splits = true;
    try { splits.value = await getFinancialInvestmentsSplits(sym); }
    catch (e) { splits.value = []; }
    finally { loadingExtra.value.splits = false; }
  } else if (tab === 'info') {
    loadingExtra.value.info = true;
    try { const res = await getFinancialInvestmentsInfo(sym); companyInfo.value = res?.data ?? null; }
    catch (e) { companyInfo.value = null; }
    finally { loadingExtra.value.info = false; }
  } else if (tab === 'financials') {
    loadingExtra.value.financials = true;
    try { financialStatements.value = await getFinancialInvestmentsFinancialStatements(sym, financialsFreq.value); }
    catch (e) { financialStatements.value = []; }
    finally { loadingExtra.value.financials = false; }
  } else if (tab === 'earnings') {
    loadingExtra.value.earnings = true;
    try {
      earningsData.value = await getFinancialInvestmentsEarnings(sym, earningsFreq.value);
      earningsEstimate.value = await getFinancialInvestmentsEarningsEstimate(sym);
    } catch (e) { earningsData.value = []; earningsEstimate.value = null; }
    finally { loadingExtra.value.earnings = false; }
  } else if (tab === 'analyst') {
    loadingExtra.value.analyst = true;
    try {
      analystPriceTarget.value = await getFinancialInvestmentsAnalystPriceTarget(sym);
      analystRecommendations.value = await getFinancialInvestmentsAnalystRecommendations(sym);
    } catch (e) { analystPriceTarget.value = null; analystRecommendations.value = null; }
    finally { loadingExtra.value.analyst = false; }
  } else if (tab === 'ownership') {
    loadingExtra.value.ownership = true;
    try { ownershipData.value = await getFinancialInvestmentsOwnership(sym); }
    catch (e) { ownershipData.value = []; }
    finally { loadingExtra.value.ownership = false; }
  } else if (tab === 'news') {
    loadingExtra.value.news = true;
    try { newsItems.value = await getFinancialInvestmentsNews(sym, 20); }
    catch (e) { newsItems.value = []; }
    finally { loadingExtra.value.news = false; }
  }
}

function loadFinancials() {
  if (detailTab.value === 'financials') loadExtraForTab('financials');
}

function loadEarnings() {
  if (detailTab.value === 'earnings') loadExtraForTab('earnings');
}

async function loadHistory() {
  if (!selectedSymbol.value) return;
  loadingHistory.value = true;
  try {
    history.value = await getFinancialInvestmentsHistory(selectedSymbol.value, {
      start_date: startDate.value || undefined,
      end_date: endDate.value || undefined,
    });
  } catch (e) {
    console.error(e);
    history.value = [];
  } finally {
    loadingHistory.value = false;
  }
}

async function refreshSelected() {
  if (!selectedSymbol.value) return;
  const sym = selectedSymbol.value;
  refreshing.value = true;
  refreshResult.value = null;
  try {
    const result = await refreshFinancialInvestmentsSymbol(sym, {
      start_date: startDate.value || undefined,
      end_date: endDate.value || undefined,
    });
    refreshResult.value = result;
    await loadSymbols();
    selectedSymbol.value = sym;
    await loadHistory();
    lastRefreshedAt.value = new Date();
  } catch (e) {
    const errMsg = e.response?.data?.error || e.response?.data?.detail || e.message || 'Refresh failed';
    refreshResult.value = { error: errMsg };
  } finally {
    refreshing.value = false;
  }
}

async function refreshExtraSelected() {
  if (!selectedSymbol.value) return;
  refreshingExtra.value = true;
  refreshExtraResult.value = null;
  try {
    const result = await refreshFinancialInvestmentsExtra(selectedSymbol.value);
    refreshExtraResult.value = result;
    if (result.results) {
      loadExtraForTab(detailTab.value);
      lastRefreshedAt.value = new Date();
    }
    if (result.errors && Object.keys(result.errors).length) {
      refreshExtraResult.value = { ...result, error: Object.entries(result.errors).map(([k, v]) => `${k}: ${v}`).join('; ') };
    }
  } catch (e) {
    refreshExtraResult.value = { error: e.response?.data?.detail || e.response?.data?.error || e.message || 'Refresh extra failed' };
  } finally {
    refreshingExtra.value = false;
  }
}

async function addSymbol() {
  const sym = (newSymbol.value || '').trim().toUpperCase();
  if (!sym) return;
  addingSymbol.value = true;
  refreshResult.value = null;
  try {
    const result = await refreshFinancialInvestmentsSymbol(sym);
    if (result.error) {
      refreshResult.value = result;
    } else {
      refreshResult.value = { created: result.created };
      newSymbol.value = '';
      await loadSymbols();
      selectedSymbol.value = sym;
      setDefaultDates();
      await loadHistory();
      loadExtraForTab(detailTab.value);
    }
  } catch (e) {
    refreshResult.value = { error: e.response?.data?.error || e.message || 'Failed to add symbol' };
  } finally {
    addingSymbol.value = false;
  }
}

onMounted(async () => {
  setDefaultDates();
  try {
    const res = await getFinancialInvestmentsWatchlistPreference();
    const cols = res?.value?.visible_columns;
    const validKeys = new Set(ALL_WATCHLIST_COLUMN_DEFS.map((c) => c.accessorKey));
    if (Array.isArray(cols) && cols.length) {
      // Build visibility state from saved columns
      const newVis = Object.fromEntries(ALL_WATCHLIST_COLUMN_DEFS.map((c) => [c.accessorKey, false]));
      for (const col of cols) {
        if (validKeys.has(col)) newVis[col] = true;
      }
      watchlistVisibility.value = newVis;
    }
  } catch (_) {
    // default visibility is all-visible; keep as-is
  }
  loadSymbols();
});
</script>

<style scoped>
.page-content {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.fi-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.fi-toolbar__right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.fi-layout {
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 16px;
  align-items: start;
}

@media (max-width: 1024px) {
  .fi-layout {
    grid-template-columns: 1fr;
  }
}

.fi-layout__left {}
.fi-layout__right {}

/* Symbol header */
.fi-symbol-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.fi-symbol-header__symbol {
  font-size: 20px;
  font-weight: 700;
  color: var(--kdl-text-primary);
}

.fi-symbol-header__price {
  font-size: 20px;
  font-weight: 700;
  color: var(--kdl-text-primary);
}

/* Period buttons */
.fi-periods {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
}

/* Chart */
.fi-chart {
  margin-bottom: 16px;
}

/* Tab panel */
.fi-tab-panel {
  margin-top: 12px;
}

/* Date row in prices tab */
.fi-date-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.fi-note {
  margin-bottom: 8px;
  font-size: 13px;
}

/* Statement blocks */
.fi-stmt {
  margin-bottom: 16px;
}

.fi-stmt__title {
  margin-bottom: 6px;
}

/* Select hint */
.fi-select-hint {
  margin-top: 8px;
}

/* Result strip */
.fi-result-strip {
  margin-top: 10px;
}

/* JSON pre blocks */
.fi-json-pre {
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--kdl-hover-bg);
  border: 1px solid var(--kdl-border-subtle);
  color: var(--kdl-text-secondary);
  font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, monospace;
  font-size: 12px;
  overflow-x: auto;
  overflow-y: auto;
  white-space: pre;
  margin: 0;
}
.fi-json-pre--short  { max-height: 200px; }
.fi-json-pre--medium { max-height: 300px; }
.fi-json-pre--tall   { max-height: 400px; }

/* News */
.fi-news {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.fi-news-article {
  padding: 14px 16px;
  border-radius: 8px;
  border: 1px solid var(--kdl-border-subtle);
  background: var(--kdl-card-bg);
  max-width: 720px;
}

.fi-news-article__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--kdl-text-primary);
  margin: 0 0 6px;
  line-height: 1.4;
}

.fi-news-article__link {
  color: var(--kdl-accent);
  text-decoration: none;
}
.fi-news-article__link:hover { text-decoration: underline; }

.fi-news-article__meta { margin-bottom: 6px; }

.fi-news-article__summary {
  font-size: 12px;
  color: var(--kdl-text-secondary);
  margin: 0;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

/* Number cells */
.fi-num { display: block; text-align: right; }
.fi-pos { color: var(--kdl-status-success); }
.fi-neg { color: var(--kdl-status-error); }

/* Toolbar symbol add input */
.fi-symbol-input {
  max-width: 140px;
}

/* Date range inputs + load button in prices tab */
.fi-date-input {
  max-width: 160px;
}
.fi-date-btn {
  align-self: flex-end;
}

/* Frequency select in financials / earnings tabs */
.fi-freq-select {
  max-width: 140px;
  margin-bottom: 8px;
}
</style>
