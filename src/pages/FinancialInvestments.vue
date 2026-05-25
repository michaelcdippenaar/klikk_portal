<template>
  <q-page class="q-pa-md">
    <PageHeader title="Watchlist" subtitle="Stock data from yfinance — select a symbol for details and chart" />
    <div class="row items-center justify-end q-mb-md">
      <div class="row items-center q-gutter-sm">
        <span v-if="lastRefreshedAt" class="text-muted">Last updated {{ lastRefreshedAt.toLocaleTimeString() }}</span>
        <q-input
          v-model="newSymbol"
          label="Add symbol"
          dense
          outlined
          class="fi-symbol-input"
          @keyup.enter="addSymbol"
        />
        <q-btn label="Add" color="primary" :loading="addingSymbol" :disable="!newSymbol.trim()" @click="addSymbol" />
      </div>
    </div>

    <div class="row q-col-gutter-lg">
      <div class="col-12 col-lg-4 col-xl-3">
        <SectionCard class="q-mb-lg">
          <template #actions>
            <q-btn flat dense icon="view_column" size="sm" class="kdl-icon-action">
              <q-menu anchor="top right" self="top left">
                <q-list dense class="fi-col-menu">
                  <q-item v-for="col in allSymbolColumnOptions" :key="col.name" dense>
                    <q-item-section side>
                      <q-checkbox v-model="visibleColumns" :val="col.name" dense @update:model-value="saveWatchlistColumns" />
                    </q-item-section>
                    <q-item-section>{{ col.label }}</q-item-section>
                  </q-item>
                </q-list>
              </q-menu>
            </q-btn>
          </template>
          <span class="text-muted">Toggle columns to show</span>
          <q-table
            :rows="symbols"
            :columns="visibleTableColumns"
            row-key="symbol"
            flat
            bordered
            :loading="loadingSymbols"
            selection="single"
            v-model:selected="selectedSymbolRow"
            @update:selected="onSymbolSelected"
            :pagination="symbolsPagination"
            :rows-per-page-options="[25, 50, 100, 0]"
            dense
            class="watchlist-table"
          >
            <template #body-cell-last_close="props">
              <q-td :props="props" class="text-right">
                {{ props.row.last_close != null ? Number(props.row.last_close).toFixed(2) : '—' }}
              </q-td>
            </template>
            <template #body-cell-change="props">
              <q-td :props="props" class="text-right" :class="props.row.change != null && props.row.change >= 0 ? 'text-positive' : props.row.change != null ? 'text-negative' : ''">
                {{ props.row.change != null ? Number(props.row.change).toFixed(2) : '—' }}
              </q-td>
            </template>
            <template #body-cell-change_pct="props">
              <q-td :props="props" class="text-right" :class="props.row.change_pct != null && props.row.change_pct >= 0 ? 'text-positive' : props.row.change_pct != null ? 'text-negative' : ''">
                {{ props.row.change_pct != null ? Number(props.row.change_pct).toFixed(2) + '%' : '—' }}
              </q-td>
            </template>
            <template #body-cell-pe_ratio="props">
              <q-td :props="props" class="text-right">
                {{ props.row.pe_ratio != null ? Number(props.row.pe_ratio).toFixed(1) : '—' }}
              </q-td>
            </template>
            <template #body-cell-forward_pe="props">
              <q-td :props="props" class="text-right">
                {{ props.row.forward_pe != null ? Number(props.row.forward_pe).toFixed(1) : '—' }}
              </q-td>
            </template>
            <template #body-cell-dividend_yield="props">
              <q-td :props="props" class="text-right">
                {{ props.row.dividend_yield != null ? Number(props.row.dividend_yield).toFixed(2) + '%' : '—' }}
              </q-td>
            </template>
            <template #body-cell-recommendation="props">
              <q-td :props="props" class="text-left">
                <span
                  :class="{
                    'text-positive': props.row.recommendation === 'Buy',
                    'text-negative': props.row.recommendation === 'Sell',
                  }"
                >
                  {{ props.row.recommendation || '—' }}
                </span>
              </q-td>
            </template>
          </q-table>
        </SectionCard>
      </div>

      <div class="col-12 col-lg-8 col-xl-9">
        <SectionCard v-if="selectedSymbol" class="q-mb-lg">
          <template #actions>
            <q-btn label="Refresh prices" color="primary" icon="refresh" :loading="refreshing" dense @click="refreshSelected" />
            <q-btn label="Refresh extra" color="secondary" icon="sync" :loading="refreshingExtra" dense @click="refreshExtraSelected" />
          </template>

          <div class="row items-center q-gutter-md q-mb-md">
            <span class="section-header">{{ selectedSymbol }}</span>
            <span class="text-muted">{{ selectedSymbolCompany }}</span>
            <span v-if="selectedSymbolLastClose != null" class="section-header">{{ Number(selectedSymbolLastClose).toFixed(2) }}</span>
            <span v-if="selectedSymbolChange != null" :class="selectedSymbolChange >= 0 ? 'text-positive' : 'text-negative'">
              {{ selectedSymbolChange >= 0 ? '+' : '' }}{{ Number(selectedSymbolChange).toFixed(2) }}
              ({{ selectedSymbolChangePct != null ? (selectedSymbolChangePct >= 0 ? '+' : '') + Number(selectedSymbolChangePct).toFixed(2) + '%' : '—' }})
            </span>
          </div>

          <div class="row q-gutter-xs q-mb-md">
            <q-btn v-for="p in periodOptions" :key="p.key" :label="p.label" :color="selectedPeriod === p.key ? 'primary' : 'grey-7'" flat dense no-caps :outline="selectedPeriod !== p.key" @click="setPeriod(p.key)" />
          </div>

          <FinancialLineChart v-if="chartLabels.length" :labels="chartLabels" :data="chartData" class="q-mb-lg" />

          <q-tabs v-model="detailTab" dense align="left" class="q-mb-md">
            <q-tab name="prices" label="Overview" />
            <q-tab name="dividends" label="Dividends" />
            <q-tab name="splits" label="Splits" />
            <q-tab name="info" label="Company info" />
            <q-tab name="financials" label="Financials" />
            <q-tab name="earnings" label="Earnings" />
            <q-tab name="analyst" label="Analyst" />
            <q-tab name="ownership" label="Ownership" />
            <q-tab name="news" label="News" />
          </q-tabs>
          <q-separator />

          <q-tab-panels v-model="detailTab" animated class="q-pt-md">
            <q-tab-panel name="prices">
              <div class="row q-col-gutter-sm q-mb-sm">
                <q-input v-model="startDate" label="From" type="date" dense outlined class="fi-date-input" />
                <q-input v-model="endDate" label="To" type="date" dense outlined class="fi-date-input" />
                <q-btn label="Load" color="primary" flat dense :loading="loadingHistory" @click="loadHistory" />
              </div>
              <q-table
                :rows="history"
                :columns="historyColumns"
                row-key="date"
                flat
                bordered
                :loading="loadingHistory"
                :rows-per-page-options="[10, 25, 50]"
                dense
              />
            </q-tab-panel>

            <q-tab-panel name="dividends">
              <p v-if="trailingDividendYieldPct != null" class="text-muted q-mb-sm">
                <strong>Trailing dividend yield (12m):</strong> {{ Number(trailingDividendYieldPct).toFixed(2) }}%
              </p>
              <q-table
                :rows="dividends"
                :columns="dividendColumns"
                row-key="date"
                flat
                bordered
                :loading="loadingExtra.dividends"
                dense
                hide-bottom
              />
              <p v-if="!loadingExtra.dividends && dividends.length === 0" class="text-muted">No dividends stored. Click "Refresh extra data" to fetch.</p>
            </q-tab-panel>

            <q-tab-panel name="splits">
              <q-table
                :rows="splits"
                :columns="splitColumns"
                row-key="date"
                flat
                bordered
                :loading="loadingExtra.splits"
                dense
                hide-bottom
              />
              <p v-if="!loadingExtra.splits && splits.length === 0" class="text-muted">No splits stored. Click "Refresh extra data" to fetch.</p>
            </q-tab-panel>

            <q-tab-panel name="info">
              <div v-if="loadingExtra.info" class="text-muted">Loading…</div>
              <pre v-else-if="companyInfo" class="fi-json-pre fi-json-pre--tall">{{ JSON.stringify(companyInfo, null, 2) }}</pre>
              <p v-else class="text-muted">No company info. Click "Refresh extra data" to fetch.</p>
            </q-tab-panel>

            <q-tab-panel name="financials">
              <q-select v-model="financialsFreq" :options="['yearly', 'quarterly', 'trailing']" dense outlined class="fi-freq-select q-mb-sm" @update:model-value="loadFinancials" />
              <div v-if="loadingExtra.financials" class="text-muted">Loading…</div>
              <div v-else-if="financialStatements.length">
                <div v-for="stmt in financialStatements" :key="stmt.statement_type" class="q-mb-lg">
                  <div class="section-header q-mb-sm">{{ stmt.statement_type }}</div>
                  <pre class="fi-json-pre fi-json-pre--medium">{{ JSON.stringify(stmt.data, null, 2) }}</pre>
                </div>
              </div>
              <p v-else class="text-muted">No financial statements. Click "Refresh extra data" to fetch.</p>
            </q-tab-panel>

            <q-tab-panel name="earnings">
              <q-select v-model="earningsFreq" :options="['yearly', 'quarterly', 'trailing']" dense outlined class="fi-freq-select q-mb-sm" @update:model-value="loadEarnings" />
              <div v-if="loadingExtra.earnings" class="text-muted">Loading…</div>
              <pre v-else-if="earningsData.length" class="fi-json-pre fi-json-pre--tall">{{ JSON.stringify(earningsData, null, 2) }}</pre>
              <p v-else class="text-muted">No earnings data. Click "Refresh extra data" to fetch.</p>
              <div v-if="earningsEstimate && Object.keys(earningsEstimate.data || {}).length" class="q-mt-md">
                <div class="section-header q-mb-sm">Earnings estimate</div>
                <pre class="fi-json-pre fi-json-pre--short">{{ JSON.stringify(earningsEstimate.data, null, 2) }}</pre>
              </div>
            </q-tab-panel>

            <q-tab-panel name="analyst">
              <div v-if="loadingExtra.analyst" class="text-muted">Loading…</div>
              <template v-else>
                <div v-if="analystPriceTarget && Object.keys(analystPriceTarget.data || {}).length" class="q-mb-md">
                  <div class="section-header q-mb-sm">Price target</div>
                  <pre class="fi-json-pre">{{ JSON.stringify(analystPriceTarget.data, null, 2) }}</pre>
                </div>
                <div v-if="analystRecommendations && (analystRecommendations.data || []).length">
                  <div class="section-header q-mb-sm">Recommendations</div>
                  <pre class="fi-json-pre fi-json-pre--medium">{{ JSON.stringify(analystRecommendations.data, null, 2) }}</pre>
                </div>
                <p v-if="(!analystPriceTarget || !Object.keys(analystPriceTarget.data || {}).length) && (!analystRecommendations || !(analystRecommendations.data || []).length)" class="text-muted">No analyst data. Click "Refresh extra data" to fetch.</p>
              </template>
            </q-tab-panel>

            <q-tab-panel name="ownership">
              <div v-if="loadingExtra.ownership" class="text-muted">Loading…</div>
              <div v-else-if="ownershipData.length">
                <div v-for="o in ownershipData" :key="o.holder_type" class="q-mb-md">
                  <div class="section-header q-mb-sm">{{ o.holder_type }}</div>
                  <pre class="fi-json-pre fi-json-pre--medium">{{ JSON.stringify(o.data, null, 2) }}</pre>
                </div>
              </div>
              <p v-else class="text-muted">No ownership data. Click "Refresh extra data" to fetch.</p>
            </q-tab-panel>

            <q-tab-panel name="news">
              <div v-if="loadingExtra.news" class="text-muted">Loading…</div>
              <div v-else-if="newsItems.length" class="column q-gutter-md">
                <article
                  v-for="n in newsItems"
                  :key="n.title + (n.published_at || '')"
                  class="fi-news-article"
                >
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
            </q-tab-panel>
          </q-tab-panels>

          <q-banner v-if="refreshResult" rounded dense :class="refreshResult.error ? 'bg-negative' : 'bg-positive'" class="text-white q-mt-md">
            {{ refreshResult.error || `Refreshed ${refreshResult.created ?? 0} points.` }}
          </q-banner>
          <q-banner v-if="refreshExtraResult" rounded dense :class="refreshExtraResult.error ? 'bg-negative' : 'bg-positive'" class="text-white q-mt-sm">
            {{ refreshExtraResult.error || (refreshExtraResult.results ? `Extra data refreshed.` : '') }}
          </q-banner>
        </SectionCard>

        <div v-else class="klikk-alert-strip tone-info q-mt-md">
          Select a symbol from the watchlist to view chart, price history and extra data (dividends, company info, financials, earnings, analyst, ownership, news).
        </div>
      </div>
    </div>
  </q-page>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import FinancialLineChart from '../components/FinancialLineChart.vue';
import PageHeader from '../components/klikk/PageHeader.vue';
import SectionCard from '../components/klikk/SectionCard.vue';
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

const ALL_SYMBOL_COLUMNS = [
  { name: 'symbol', label: 'Symbol', field: 'symbol', align: 'left' },
  { name: 'name', label: 'Name', field: 'name', align: 'left' },
  { name: 'last_close', label: 'Last', field: 'last_close', align: 'right' },
  { name: 'change', label: 'Change', field: 'change', align: 'right' },
  { name: 'change_pct', label: 'Chg %', field: 'change_pct', align: 'right' },
  { name: 'pe_ratio', label: 'P/E', field: 'pe_ratio', align: 'right' },
  { name: 'forward_pe', label: 'Fwd P/E', field: 'forward_pe', align: 'right' },
  { name: 'dividend_yield', label: 'Div yield %', field: 'dividend_yield', align: 'right' },
  { name: 'recommendation', label: 'Recommendation', field: 'recommendation', align: 'left' },
  { name: 'exchange', label: 'Exchange', field: 'exchange', align: 'left' },
];
const defaultVisibleColumns = ['symbol', 'name', 'last_close', 'change', 'change_pct', 'pe_ratio', 'forward_pe', 'dividend_yield', 'recommendation', 'exchange'];
const visibleColumns = ref([...defaultVisibleColumns]);
const allSymbolColumnOptions = ALL_SYMBOL_COLUMNS.map((c) => ({ name: c.name, label: c.label }));
const visibleTableColumns = computed(() => {
  const set = new Set(visibleColumns.value);
  return ALL_SYMBOL_COLUMNS.filter((c) => set.has(c.name));
});
const symbolColumns = ALL_SYMBOL_COLUMNS;
const selectedSymbolRow = ref([]);
const selectedSymbol = ref(null);
const newSymbol = ref('');
const symbolsPagination = ref({ rowsPerPage: 25 });

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
const selectedSymbolChange = computed(() => selectedSymbolRowData.value?.change ?? null);
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
const chartData = computed(() => history.value.map((h) => h.close));

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

const historyColumns = [
  { name: 'date', label: 'Date', field: 'date', align: 'left' },
  { name: 'open', label: 'Open', field: 'open', align: 'right', format: (v) => (v != null ? Number(v).toFixed(2) : '') },
  { name: 'high', label: 'High', field: 'high', align: 'right', format: (v) => (v != null ? Number(v).toFixed(2) : '') },
  { name: 'low', label: 'Low', field: 'low', align: 'right', format: (v) => (v != null ? Number(v).toFixed(2) : '') },
  { name: 'close', label: 'Close', field: 'close', align: 'right', format: (v) => (v != null ? Number(v).toFixed(2) : '') },
  { name: 'volume', label: 'Volume', field: 'volume', align: 'right', format: (v) => (v != null ? Number(v).toLocaleString() : '') },
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

const dividendColumns = [
  { name: 'paid_on', label: 'Paid on', field: 'paid_on', align: 'left' },
  { name: 'amount', label: 'Amount', field: 'amount', align: 'right', format: (v) => (v != null ? Number(v).toFixed(4) : '') },
  { name: 'yield_pct', label: 'Yield %', field: 'yield_pct', align: 'right', format: (v) => (v != null ? Number(v).toFixed(2) + '%' : '—') },
  { name: 'currency', label: 'Currency', field: 'currency', align: 'left' },
];
const splitColumns = [
  { name: 'date', label: 'Date', field: 'date', align: 'left' },
  { name: 'ratio', label: 'Ratio', field: 'ratio', align: 'right', format: (v) => (v != null ? Number(v) : '') },
];

const loadingExtra = ref({
  dividends: false,
  splits: false,
  info: false,
  financials: false,
  earnings: false,
  analyst: false,
  ownership: false,
  news: false,
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
    await saveFinancialInvestmentsWatchlistPreference({ visible_columns: visibleColumns.value });
  } catch (e) {
    console.error('Failed to save column preference', e);
  }
}

function onSymbolSelected(rows) {
  const row = rows[0];
  selectedSymbol.value = row ? row.symbol : null;
  refreshResult.value = null;
  refreshExtraResult.value = null;
  if (selectedSymbol.value) {
    setDefaultDates();
    loadHistory();
    detailTab.value = 'prices';
    loadExtraForTab('prices');
  } else {
    history.value = [];
    dividends.value = [];
    trailingDividendYieldPct.value = null;
    splits.value = [];
    companyInfo.value = null;
    financialStatements.value = [];
    earningsData.value = [];
    earningsEstimate.value = null;
    analystRecommendations.value = null;
    analystPriceTarget.value = null;
    ownershipData.value = [];
    newsItems.value = [];
  }
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
    try {
      splits.value = await getFinancialInvestmentsSplits(sym);
    } catch (e) {
      splits.value = [];
    } finally {
      loadingExtra.value.splits = false;
    }
  } else if (tab === 'info') {
    loadingExtra.value.info = true;
    try {
      const res = await getFinancialInvestmentsInfo(sym);
      companyInfo.value = res?.data ?? null;
    } catch (e) {
      companyInfo.value = null;
    } finally {
      loadingExtra.value.info = false;
    }
  } else if (tab === 'financials') {
    loadingExtra.value.financials = true;
    try {
      financialStatements.value = await getFinancialInvestmentsFinancialStatements(sym, financialsFreq.value);
    } catch (e) {
      financialStatements.value = [];
    } finally {
      loadingExtra.value.financials = false;
    }
  } else if (tab === 'earnings') {
    loadingExtra.value.earnings = true;
    try {
      earningsData.value = await getFinancialInvestmentsEarnings(sym, earningsFreq.value);
      earningsEstimate.value = await getFinancialInvestmentsEarningsEstimate(sym);
    } catch (e) {
      earningsData.value = [];
      earningsEstimate.value = null;
    } finally {
      loadingExtra.value.earnings = false;
    }
  } else if (tab === 'analyst') {
    loadingExtra.value.analyst = true;
    try {
      analystPriceTarget.value = await getFinancialInvestmentsAnalystPriceTarget(sym);
      analystRecommendations.value = await getFinancialInvestmentsAnalystRecommendations(sym);
    } catch (e) {
      analystPriceTarget.value = null;
      analystRecommendations.value = null;
    } finally {
      loadingExtra.value.analyst = false;
    }
  } else if (tab === 'ownership') {
    loadingExtra.value.ownership = true;
    try {
      ownershipData.value = await getFinancialInvestmentsOwnership(sym);
    } catch (e) {
      ownershipData.value = [];
    } finally {
      loadingExtra.value.ownership = false;
    }
  } else if (tab === 'news') {
    loadingExtra.value.news = true;
    try {
      newsItems.value = await getFinancialInvestmentsNews(sym, 20);
    } catch (e) {
      newsItems.value = [];
    } finally {
      loadingExtra.value.news = false;
    }
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
    selectedSymbolRow.value = symbols.value.filter((r) => r.symbol === sym);
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
      selectedSymbolRow.value = symbols.value.filter((r) => r.symbol === sym);
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
    const validNames = new Set(ALL_SYMBOL_COLUMNS.map((c) => c.name));
    if (Array.isArray(cols) && cols.length) {
      visibleColumns.value = cols.filter((c) => validNames.has(c));
    }
    if (!visibleColumns.value.length) {
      visibleColumns.value = [...defaultVisibleColumns];
    }
  } catch (_) {
    visibleColumns.value = [...defaultVisibleColumns];
  }
  loadSymbols();
});
</script>

<style scoped>
/* JSON viewer pre blocks — tokenised, no inline styles */
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
}
.fi-json-pre--short  { max-height: 200px; }
.fi-json-pre--medium { max-height: 300px; }
.fi-json-pre--tall   { max-height: 400px; }

/* News article card */
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

.fi-news-article__link:hover {
  text-decoration: underline;
}

.fi-news-article__meta {
  margin-bottom: 6px;
}

.fi-news-article__summary {
  font-size: 12px;
  color: var(--kdl-text-secondary);
  margin: 0;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

/* Column toggle icon button */
.kdl-icon-action {
  color: var(--kdl-text-muted);
}

/* Constrained inputs — no inline style */
.fi-symbol-input {
  max-width: 140px;
}

.fi-date-input {
  max-width: 160px;
}

.fi-freq-select {
  max-width: 140px;
}

.fi-col-menu {
  min-width: 200px;
}
</style>
