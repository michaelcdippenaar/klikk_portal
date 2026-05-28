<template>
  <AppPage>
    <PageHeader title="Investment Strategy" subtitle="Portfolio policy, allocation bands and decision rules" />

    <KTabs
      v-model="tab"
      :tabs="[
        { name: 'performance', label: 'Performance' },
        { name: 'overview', label: 'Overview' },
        { name: 'allocation', label: 'Allocation' },
        { name: 'rules', label: 'Rules' },
      ]"
      :url-sync="false"
      class="fis-tabs"
    />

    <div v-if="tab === 'performance'" class="fis-page">
      <div class="fis-metrics" aria-label="Portfolio performance summary">
        <div v-for="metric in portfolioMetrics" :key="metric.label" class="fis-metric">
          <div class="fis-metric__label">{{ metric.label }}</div>
          <div class="fis-metric__value" :class="metric.className">{{ metric.value }}</div>
          <div class="fis-metric__detail">{{ metric.detail }}</div>
        </div>
      </div>

      <SectionCard
        title="All Stock Returns"
        description="Capital growth, dividend yield and ROI from latest Investec holdings"
      >
        <template #actions>
          <div class="fis-table-actions">
            <span v-if="latestPortfolioDate" class="fis-asof">As of {{ formatDate(latestPortfolioDate) }}</span>
            <button class="btn btn-ghost btn-sm" :disabled="loadingPortfolio" @click="fetchPortfolioPerformance">
              Refresh
            </button>
          </div>
        </template>

        <KTable
          class="fis-performance-table"
          :columns="performanceColumns"
          :data="portfolioPerformanceRows"
          :loading="loadingPortfolio"
          :error="portfolioError || undefined"
          dense
          pagination="client"
          :pageSize="25"
          :pageSizeOptions="[25, 50, 100]"
        >
          <template #cell-share="{ row }">
            <div class="fis-share-cell">
              <strong>{{ row.share_code || row.company || 'Unmapped holding' }}</strong>
              <span>{{ row.share_code ? row.company : 'No share code mapped' }}</span>
            </div>
          </template>
          <template #cell-total_value="{ value, row }">
            <span class="fis-number">{{ formatCurrency(value) }}</span>
            <span class="fis-number__sub">Cost {{ formatCurrency(row.total_cost) }}</span>
          </template>
          <template #cell-capital_growth="{ value, row }">
            <span class="fis-number" :class="returnClass(value)">{{ formatSignedCurrency(value) }}</span>
            <span class="fis-number__sub" :class="returnClass(row.capital_growth_pct)">
              {{ formatSignedPercent(row.capital_growth_pct) }}
            </span>
          </template>
          <template #cell-dividend_yield_pct="{ value, row }">
            <span class="fis-number">{{ formatPercent(value) }}</span>
            <span class="fis-number__sub">{{ formatCurrency(row.annual_income_zar) }} annual</span>
          </template>
          <template #cell-roi_pct="{ value }">
            <span class="fis-number fis-roi" :class="returnClass(value)">{{ formatSignedPercent(value) }}</span>
          </template>
          <template #empty>
            <div class="fis-empty">
              No Investec portfolio holdings loaded yet.
            </div>
          </template>
        </KTable>
      </SectionCard>

      <SectionCard
        title="Individual Purchase Returns"
        description="Each Investec buy lot valued as quantity times latest unit price"
      >
        <template #actions>
          <div class="fis-table-actions">
            <span class="fis-asof">Unit price from latest holding</span>
            <button class="btn btn-ghost btn-sm" :disabled="loadingPurchaseReturns || loadingPortfolio" @click="fetchPurchaseReturns">
              Refresh
            </button>
          </div>
        </template>

        <KTable
          :columns="purchaseReturnColumns"
          :data="purchaseReturnRows"
          :loading="loadingPurchaseReturns"
          :error="purchaseReturnError || undefined"
          dense
          pagination="client"
          :pageSize="25"
          :pageSizeOptions="[25, 50, 100]"
        >
          <template #cell-share="{ row }">
            <div class="fis-share-cell">
              <strong>{{ row.display_code }}</strong>
              <span>{{ row.company || row.share_name }}</span>
              <small>{{ row.account_number || 'No account' }} · {{ row.source_note }}</small>
            </div>
          </template>
          <template #cell-date="{ value }">
            {{ formatDate(value) }}
          </template>
          <template #cell-quantity="{ value }">
            <span class="fis-number">{{ formatQuantity(value) }}</span>
          </template>
          <template #cell-buy_price="{ value }">
            <span class="fis-number">{{ formatPrice(value) }}</span>
          </template>
          <template #cell-current_price="{ value }">
            <span class="fis-number">{{ formatPrice(value) }}</span>
          </template>
          <template #cell-current_value="{ value, row }">
            <span class="fis-number">{{ formatCurrency(value) }}</span>
            <span class="fis-number__sub">Cost {{ formatCurrency(row.cost_value) }}</span>
          </template>
          <template #cell-capital_return="{ value, row }">
            <span class="fis-number" :class="returnClass(value)">{{ formatSignedCurrency(value) }}</span>
            <span class="fis-number__sub" :class="returnClass(row.return_pct)">
              {{ formatSignedPercent(row.return_pct) }}
            </span>
          </template>
          <template #empty>
            <div class="fis-empty">
              No individual buy transactions matched to the current holdings yet.
            </div>
          </template>
        </KTable>
      </SectionCard>

      <SectionCard
        title="Long Period Underperformers"
        description="Held stocks ranked by weakest actual price history"
      >
        <template #actions>
          <div class="fis-table-actions">
            <div class="fis-period-toggle" aria-label="Underperformer period">
              <button
                v-for="period in underperformerPeriods"
                :key="period"
                class="btn btn-ghost btn-sm"
                :class="{ 'fis-period-toggle__button--active': underperformerPeriod === period }"
                :disabled="loadingUnderperformers"
                @click="setUnderperformerPeriod(period)"
              >
                {{ period }}
              </button>
            </div>
            <button class="btn btn-ghost btn-sm" :disabled="loadingUnderperformers" @click="fetchLongUnderperformers">
              Refresh
            </button>
          </div>
        </template>

        <KTable
          :columns="underperformerColumns"
          :data="displayUnderperformerRows"
          :loading="loadingUnderperformers"
          :error="underperformersError || undefined"
          dense
          pagination="client"
          :pageSize="10"
          :pageSizeOptions="[10, 25, 50]"
        >
          <template #cell-share="{ row }">
            <div class="fis-share-cell">
              <strong>{{ row.display_code || row.share_code || row.symbol }}</strong>
              <span>{{ row.company }}</span>
              <small>{{ formatCurrency(row.total_value) }} holding · {{ row.start_date }} to {{ row.end_date }}</small>
            </div>
          </template>
          <template #cell-long_return_pct="{ value }">
            <span class="fis-number fis-roi" :class="returnClass(value)">{{ formatSignedPercent(value) }}</span>
          </template>
          <template #cell-cagr_pct="{ value }">
            <span class="fis-number" :class="returnClass(value)">{{ formatSignedPercent(value) }}</span>
          </template>
          <template #cell-roi_pct="{ value }">
            <span class="fis-number" :class="returnClass(value)">{{ formatSignedPercent(value) }}</span>
          </template>
          <template #empty>
            <div class="fis-empty">
              No long-period price history found for the current holdings.
            </div>
          </template>
        </KTable>
      </SectionCard>
    </div>

    <div v-else-if="tab === 'overview'" class="fis-page">
      <div class="fis-metrics" aria-label="Strategy summary">
        <div v-for="metric in strategyMetrics" :key="metric.label" class="fis-metric">
          <div class="fis-metric__label">{{ metric.label }}</div>
          <div class="fis-metric__value">{{ metric.value }}</div>
          <div class="fis-metric__detail">{{ metric.detail }}</div>
        </div>
      </div>

      <SectionCard title="Current Posture" description="Balanced accumulation with dividend discipline and risk bands">
        <div class="fis-posture">
          <div>
            <div class="fis-posture__label">Primary objective</div>
            <div class="fis-posture__value">Compound quality holdings while keeping cash available for drawdowns.</div>
          </div>
          <div>
            <div class="fis-posture__label">Risk stance</div>
            <div class="fis-posture__value">Neutral to constructive. Add only when valuation and trend both support the trade.</div>
          </div>
          <div>
            <div class="fis-posture__label">Income rule</div>
            <div class="fis-posture__value">Prefer declared or forecastable dividends. Avoid chasing yield after price spikes.</div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Signal Board" description="Fast read of the signals used before a buy, hold or trim decision">
        <div class="fis-signal-grid">
          <div v-for="signal in signalBoard" :key="signal.name" class="fis-signal">
            <div class="fis-signal__top">
              <span>{{ signal.name }}</span>
              <KBadge :label="signal.status" :tone="signal.tone" size="sm" />
            </div>
            <div class="fis-signal__text">{{ signal.text }}</div>
          </div>
        </div>
      </SectionCard>
    </div>

    <div v-else-if="tab === 'allocation'" class="fis-page">
      <SectionCard title="Model Allocation" description="Target bands for the investment portfolio">
        <div class="fis-allocation">
          <div class="fis-allocation__row fis-allocation__row--head">
            <span>Sleeve</span>
            <span>Target</span>
            <span>Band</span>
            <span>Action</span>
          </div>
          <div v-for="row in allocationRows" :key="row.sleeve" class="fis-allocation__row">
            <span>
              <strong>{{ row.sleeve }}</strong>
              <small>{{ row.description }}</small>
            </span>
            <span>{{ row.target }}</span>
            <span>{{ row.band }}</span>
            <span>{{ row.action }}</span>
          </div>
        </div>
      </SectionCard>
    </div>

    <div v-else class="fis-page">
      <SectionCard title="Decision Rules" description="Rules applied before changing positions">
        <div class="fis-rule-list">
          <div v-for="rule in decisionRules" :key="rule.title" class="fis-rule">
            <div class="fis-rule__number">{{ rule.step }}</div>
            <div>
              <div class="fis-rule__title">{{ rule.title }}</div>
              <div class="fis-rule__body">{{ rule.body }}</div>
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  </AppPage>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import {
  getFinancialInvestmentsBuyTransactions,
  getFinancialInvestmentsHistory,
  getFinancialInvestmentsSymbols,
  getInvestecPortfolio,
} from '../api/endpoints';
import AppPage from '../components/shell/AppPage.vue';
import PageHeader from '../components/klikk/PageHeader.vue';
import SectionCard from '../components/klikk/SectionCard.vue';
import KBadge from '../components/klikk/KBadge.vue';
import KTable from '../components/klikk/KTable.vue';
import KTabs from '../components/klikk/KTabs.vue';

const tab = ref('performance');
const portfolioRows = ref([]);
const loadingPortfolio = ref(false);
const portfolioError = ref(null);
const trackedSymbols = ref([]);
const purchaseReturnRows = ref([]);
const loadingPurchaseReturns = ref(false);
const purchaseReturnError = ref(null);
const underperformerRows = ref([]);
const loadingUnderperformers = ref(false);
const underperformersError = ref(null);
const underperformerPeriod = ref('5Y');
let underperformerRequestId = 0;

const currencyFormatter = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
});

const priceFormatter = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

const decimalFormatter = new Intl.NumberFormat('en-ZA', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat('en-ZA', {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
});

const performanceColumns = [
  { accessorKey: 'share', header: 'Share', enableSorting: true, size: 280 },
  { accessorKey: 'total_value', header: 'Market value', enableSorting: true, meta: { align: 'right' } },
  { accessorKey: 'capital_growth', header: 'Capital growth', enableSorting: true, meta: { align: 'right' } },
  { accessorKey: 'dividend_yield_pct', header: 'Div yield', enableSorting: true, meta: { align: 'right' } },
  { accessorKey: 'roi_pct', header: 'ROI', enableSorting: true, meta: { align: 'right' } },
];

const purchaseReturnColumns = [
  { accessorKey: 'share', header: 'Share', enableSorting: true, size: 280 },
  { accessorKey: 'date', header: 'Bought', enableSorting: true, size: 110 },
  { accessorKey: 'quantity', header: 'Qty', enableSorting: true, meta: { align: 'right' } },
  { accessorKey: 'buy_price', header: 'Buy price', enableSorting: true, meta: { align: 'right' } },
  { accessorKey: 'current_price', header: 'Current price', enableSorting: true, meta: { align: 'right' } },
  { accessorKey: 'current_value', header: 'Lot value', enableSorting: true, meta: { align: 'right' } },
  { accessorKey: 'capital_return', header: 'Lot return', enableSorting: true, meta: { align: 'right' } },
];

const underperformerPeriods = ['5Y', 'ALL'];
const underperformerColumns = computed(() => [
  { accessorKey: 'share', header: 'Share', enableSorting: true, size: 280 },
  {
    accessorKey: 'long_return_pct',
    header: `${underperformerPeriod.value} return`,
    enableSorting: true,
    meta: { align: 'right' },
  },
  { accessorKey: 'cagr_pct', header: 'Annualised', enableSorting: true, meta: { align: 'right' } },
  { accessorKey: 'roi_pct', header: 'Portfolio ROI', enableSorting: true, meta: { align: 'right' } },
]);

const latestPortfolioDate = computed(() => {
  return portfolioRows.value.reduce((latest, row) => {
    if (!row.date) return latest;
    return !latest || row.date > latest ? row.date : latest;
  }, '');
});

const latestPortfolioRows = computed(() => {
  if (!latestPortfolioDate.value) return [];
  return portfolioRows.value.filter((row) => row.date === latestPortfolioDate.value);
});

const portfolioPerformanceRows = computed(() => {
  const byShare = new Map();

  latestPortfolioRows.value.forEach((row) => {
    if (isCashHolding(row)) return;

    const shareCode = String(row.share_code || '').trim().toUpperCase();
    const key = shareCode || String(row.company || 'UNKNOWN').trim().toUpperCase();
    const existing = byShare.get(key) || {
      share: key,
      share_code: shareCode,
      company: row.company || '',
      quantity: 0,
      total_cost: 0,
      total_value: 0,
      capital_growth: 0,
      annual_income_zar: 0,
      portfolio_percent: 0,
      current_price: 0,
      price_weighted_sum: 0,
    };

    const quantity = toNumber(row.quantity);
    const totalCost = normalisePortfolioValue(row, row.total_cost);
    const totalValue = normalisePortfolioValue(row, row.total_value);
    const unitPrice = normalisePortfolioPrice(row);
    const capitalGrowth = normalisePortfolioProfitLoss(row, totalValue, totalCost);
    const annualIncome = normaliseAnnualIncome(row);

    existing.quantity += quantity;
    existing.total_cost += totalCost;
    existing.total_value += totalValue;
    existing.annual_income_zar += annualIncome;
    existing.portfolio_percent += toNumber(row.portfolio_percent);
    existing.capital_growth += capitalGrowth;
    existing.price_weighted_sum += unitPrice && quantity ? unitPrice * quantity : totalValue;
    if (!existing.company && row.company) existing.company = row.company;
    if (!existing.share_code && shareCode) existing.share_code = shareCode;

    byShare.set(key, existing);
  });

  return Array.from(byShare.values())
    .map((row) => {
      const capitalGrowth = row.capital_growth;

      return {
        ...row,
        share: `${row.share_code || row.share} ${row.company || ''}`.trim(),
        capital_growth: capitalGrowth,
        capital_growth_pct: safePercent(capitalGrowth, row.total_cost),
        dividend_yield_pct: safePercent(row.annual_income_zar, row.total_value),
        roi_pct: safePercent(capitalGrowth + row.annual_income_zar, row.total_cost),
        current_price: row.quantity ? row.price_weighted_sum / row.quantity : row.current_price,
      };
    })
    .sort((a, b) => b.total_value - a.total_value);
});

const portfolioTotals = computed(() => {
  return portfolioPerformanceRows.value.reduce(
    (totals, row) => {
      totals.totalCost += row.total_cost;
      totals.totalValue += row.total_value;
      totals.capitalGrowth += row.capital_growth;
      totals.annualIncome += row.annual_income_zar;
      return totals;
    },
    {
      totalCost: 0,
      totalValue: 0,
      capitalGrowth: 0,
      annualIncome: 0,
    }
  );
});

const portfolioMetrics = computed(() => {
  const totals = portfolioTotals.value;
  const holdingsCount = portfolioPerformanceRows.value.length;
  const capitalGrowthPct = safePercent(totals.capitalGrowth, totals.totalCost);
  const dividendYieldPct = safePercent(totals.annualIncome, totals.totalValue);
  const roiPct = safePercent(totals.capitalGrowth + totals.annualIncome, totals.totalCost);

  return [
    {
      label: 'Total value',
      value: formatCurrency(totals.totalValue),
      detail: `${holdingsCount} stock${holdingsCount === 1 ? '' : 's'} on latest portfolio date.`,
    },
    {
      label: 'Capital growth',
      value: formatSignedCurrency(totals.capitalGrowth),
      detail: `${formatSignedPercent(capitalGrowthPct)} versus Investec cost.`,
      className: returnClass(totals.capitalGrowth),
    },
    {
      label: 'Dividend yield',
      value: formatPercent(dividendYieldPct),
      detail: `${formatCurrency(totals.annualIncome)} annual income over market value.`,
    },
    {
      label: 'ROI',
      value: formatSignedPercent(roiPct),
      detail: 'Capital growth plus annual income over cost.',
      className: returnClass(roiPct),
    },
  ];
});

const displayUnderperformerRows = computed(() => underperformerRows.value.slice(0, 25));

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function safePercent(value, base) {
  const denominator = toNumber(base);
  if (!denominator) return 0;
  return (toNumber(value) / denominator) * 100;
}

function portfolioValueScale(row) {
  const currency = String(row?.currency || '').trim().toUpperCase();
  if (currency === 'USD') {
    return toNumber(row.exchange_rate) || 1;
  }
  if (currency === 'ZAR') {
    return 100;
  }
  return toNumber(row.exchange_rate) || 1;
}

function portfolioPriceScale(row) {
  return portfolioValueScale(row);
}

function normalisePortfolioValue(row, value) {
  return toNumber(value) * portfolioValueScale(row);
}

function normalisePortfolioPrice(row) {
  const price = toNumber(row.price);
  if (price) return price * portfolioPriceScale(row);

  const quantity = toNumber(row.quantity);
  return quantity ? normalisePortfolioValue(row, row.total_value) / quantity : 0;
}

function normalisePortfolioProfitLoss(row, totalValue, totalCost) {
  if (row.profit_loss !== null && row.profit_loss !== undefined && row.profit_loss !== '') {
    return toNumber(row.profit_loss);
  }
  return totalValue - totalCost;
}

function pctChange(startValue, endValue) {
  const start = toNumber(startValue);
  if (!start) return 0;
  return ((toNumber(endValue) - start) / start) * 100;
}

function annualisedReturnPct(startValue, endValue, startDate, endDate) {
  const start = toNumber(startValue);
  const end = toNumber(endValue);
  const days = daysBetween(startDate, endDate);
  if (!start || !end || days <= 0) return pctChange(startValue, endValue);
  return (Math.pow(end / start, 365 / days) - 1) * 100;
}

function daysBetween(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(0, (end.getTime() - start.getTime()) / 86400000);
}

function normaliseAnnualIncome(row) {
  const annualIncome = toNumber(row.annual_income_zar);
  return annualIncome || 0;
}

function isCashHolding(row) {
  return String(row.company || '').trim().toUpperCase() === 'CASH';
}

function formatCurrency(value) {
  return currencyFormatter.format(toNumber(value));
}

function formatPrice(value) {
  return priceFormatter.format(toNumber(value));
}

function formatSignedCurrency(value) {
  const numeric = toNumber(value);
  const formatted = currencyFormatter.format(Math.abs(numeric));
  if (numeric > 0) return `+${formatted}`;
  if (numeric < 0) return `-${formatted}`;
  return formatted;
}

function formatPercent(value) {
  return `${decimalFormatter.format(toNumber(value))}%`;
}

function formatQuantity(value) {
  return decimalFormatter.format(toNumber(value));
}

function formatSignedPercent(value) {
  const numeric = toNumber(value);
  const formatted = formatPercent(Math.abs(numeric));
  if (numeric > 0) return `+${formatted}`;
  if (numeric < 0) return `-${formatted}`;
  return formatted;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

function returnClass(value) {
  const numeric = toNumber(value);
  if (numeric > 0) return 'fis-return--positive';
  if (numeric < 0) return 'fis-return--negative';
  return 'fis-return--flat';
}

async function fetchPortfolioPerformance() {
  loadingPortfolio.value = true;
  portfolioError.value = null;
  try {
    const data = await getInvestecPortfolio({ limit: 1000 });
    portfolioRows.value = data.results || [];
    fetchLongUnderperformers();
    fetchPurchaseReturns();
  } catch (err) {
    portfolioRows.value = [];
    purchaseReturnRows.value = [];
    underperformerRows.value = [];
    portfolioError.value =
      err.response?.data?.error || err.message || 'Failed to load Investec portfolio holdings.';
  } finally {
    loadingPortfolio.value = false;
  }
}

function normaliseLookupValue(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\b(LTD|LIMITED|PLC|INC|GROUP|HOLDINGS|HLDGS|COMPANY|CORP|CORPORATION|N V|NV)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSymbolLookup(symbols) {
  const byCode = new Map();
  const byName = new Map();

  symbols.forEach((symbolRow) => {
    const symbol = String(symbolRow.symbol || '').trim().toUpperCase();
    const baseCode = symbol.split('.')[0];
    if (baseCode) byCode.set(baseCode, symbol);

    const mapping = symbolRow.share_name_mapping || {};
    [mapping.share_code, mapping.company, mapping.share_name, mapping.share_name2, mapping.share_name3, symbolRow.name]
      .filter(Boolean)
      .forEach((value) => {
        const normalized = normaliseLookupValue(value);
        if (normalized) byName.set(normalized, symbol);
      });

    if (mapping.share_code) {
      byCode.set(String(mapping.share_code).trim().toUpperCase(), symbol);
    }
  });

  return { byCode, byName };
}

function findSymbolForHolding(row, lookup) {
  const shareCode = String(row.share_code || '').trim().toUpperCase();
  if (shareCode && lookup.byCode.has(shareCode)) return lookup.byCode.get(shareCode);

  const companyKey = normaliseLookupValue(row.company);
  if (companyKey && lookup.byName.has(companyKey)) return lookup.byName.get(companyKey);

  return '';
}

async function ensureTrackedSymbols() {
  if (trackedSymbols.value.length) return trackedSymbols.value;
  trackedSymbols.value = await getFinancialInvestmentsSymbols();
  return trackedSymbols.value;
}

function getUnderperformerStartDate() {
  if (underperformerPeriod.value === 'ALL') return undefined;
  const date = new Date();
  date.setFullYear(date.getFullYear() - 5);
  return date.toISOString().slice(0, 10);
}

async function mapWithConcurrency(items, limit, iterator) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await iterator(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function transactionBuyPrice(transaction) {
  const explicitPrice = toNumber(transaction.price ?? transaction.value_per_share ?? transaction.unit_price);
  if (explicitPrice > 0) return explicitPrice;

  const quantity = Math.abs(toNumber(transaction.quantity));
  const value = Math.abs(toNumber(transaction.value));
  return quantity && value ? value / quantity : 0;
}

function holdingCurrentUnitPrice(holding, buyPrice) {
  const unitPrice = toNumber(holding.current_price);
  return unitPrice || buyPrice;
}

function buildPurchaseReturnRow(transaction, holding, index) {
  const quantity = Math.abs(toNumber(transaction.quantity));
  const buyPrice = transactionBuyPrice(transaction);
  if (!quantity || !buyPrice) return null;

  const currentPrice = holdingCurrentUnitPrice(holding, buyPrice);
  if (!currentPrice) return null;

  const costValue = quantity * buyPrice;
  const currentValue = quantity * currentPrice;
  const capitalReturn = currentValue - costValue;
  const displayCode = displayCodeForSymbol(holding, holding.symbol);

  return {
    key: `${holding.symbol}:${transaction.id || index}:${transaction.date || ''}`,
    share: `${displayCode} ${holding.company || transaction.share_name || ''}`.trim(),
    display_code: displayCode,
    company: holding.company,
    symbol: holding.symbol,
    date: transaction.date,
    account_number: transaction.account_number || '',
    share_name: transaction.share_name || holding.company || '',
    quantity,
    buy_price: buyPrice,
    current_price: currentPrice,
    cost_value: costValue,
    current_value: currentValue,
    capital_return: capitalReturn,
    return_pct: safePercent(capitalReturn, costValue),
    source_note: transaction.source === 'portfolio'
      ? 'opening lot from first snapshot'
      : 'buy transaction',
  };
}

async function fetchPurchaseReturns() {
  const holdings = portfolioPerformanceRows.value;
  if (!holdings.length) {
    purchaseReturnRows.value = [];
    return;
  }

  loadingPurchaseReturns.value = true;
  purchaseReturnError.value = null;

  try {
    const symbols = await ensureTrackedSymbols();
    const lookup = buildSymbolLookup(symbols);
    const holdingsWithSymbols = combineHoldingsBySymbol(holdings
      .map((holding) => ({
        ...holding,
        symbol: findSymbolForHolding(holding, lookup),
      }))
      .filter((holding) => holding.symbol));

    const rowGroups = await mapWithConcurrency(holdingsWithSymbols, 6, async (holding) => {
      const result = await getFinancialInvestmentsBuyTransactions(holding.symbol);
      const transactions = result?.results ?? [];
      return transactions
        .map((transaction, index) => buildPurchaseReturnRow(transaction, holding, index))
        .filter(Boolean);
    });

    purchaseReturnRows.value = rowGroups
      .flat()
      .sort((a, b) => a.share.localeCompare(b.share) || String(b.date || '').localeCompare(String(a.date || '')));
  } catch (err) {
    purchaseReturnRows.value = [];
    purchaseReturnError.value =
      err.response?.data?.error || err.message || 'Failed to load individual purchase returns.';
  } finally {
    loadingPurchaseReturns.value = false;
  }
}

async function fetchLongUnderperformers() {
  const holdings = portfolioPerformanceRows.value;
  if (!holdings.length) {
    underperformerRows.value = [];
    return;
  }

  const requestId = underperformerRequestId + 1;
  underperformerRequestId = requestId;
  loadingUnderperformers.value = true;
  underperformersError.value = null;

  try {
    const symbols = await ensureTrackedSymbols();
    const lookup = buildSymbolLookup(symbols);
    const startDate = getUnderperformerStartDate();
    const holdingsWithSymbols = combineHoldingsBySymbol(holdings
      .map((holding) => ({
        ...holding,
        symbol: findSymbolForHolding(holding, lookup),
      }))
      .filter((holding) => holding.symbol));

    const rows = await mapWithConcurrency(holdingsWithSymbols, 6, async (holding) => {
      try {
        const history = await getFinancialInvestmentsHistory(holding.symbol, { start_date: startDate });
        const closes = (history || [])
          .map((point) => ({
            date: point.date,
            close: toNumber(point.adjusted_close ?? point.close),
          }))
          .filter((point) => point.date && point.close > 0);

        if (closes.length < 2) return null;

        const first = closes[0];
        const last = closes[closes.length - 1];
        const longReturnPct = pctChange(first.close, last.close);
        const cagrPct = annualisedReturnPct(first.close, last.close, first.date, last.date);

        return {
          ...holding,
          symbol: holding.symbol,
          long_return_pct: longReturnPct,
          cagr_pct: cagrPct,
          start_date: first.date,
          end_date: last.date,
          start_close: first.close,
          end_close: last.close,
          range: `${first.date} to ${last.date}`,
        };
      } catch (err) {
        return null;
      }
    });

    if (requestId !== underperformerRequestId) return;

    underperformerRows.value = rows
      .filter(Boolean)
      .sort((a, b) => a.cagr_pct - b.cagr_pct || a.long_return_pct - b.long_return_pct);
  } catch (err) {
    if (requestId !== underperformerRequestId) return;
    underperformerRows.value = [];
    underperformersError.value =
      err.response?.data?.error || err.message || 'Failed to load long-period underperformers.';
  } finally {
    if (requestId === underperformerRequestId) {
      loadingUnderperformers.value = false;
    }
  }
}

function setUnderperformerPeriod(period) {
  if (underperformerPeriod.value === period) return;
  underperformerPeriod.value = period;
  fetchLongUnderperformers();
}

function combineHoldingsBySymbol(holdings) {
  const bySymbol = new Map();

  holdings.forEach((holding) => {
    const symbol = String(holding.symbol || '').trim().toUpperCase();
    if (!symbol) return;

    const existing = bySymbol.get(symbol) || {
      ...holding,
      symbol,
      display_code: displayCodeForSymbol(holding, symbol),
      quantity: 0,
      total_cost: 0,
      total_value: 0,
      capital_growth: 0,
      annual_income_zar: 0,
      price_weighted_sum: 0,
    };

    existing.quantity += toNumber(holding.quantity);
    existing.total_cost += toNumber(holding.total_cost);
    existing.total_value += toNumber(holding.total_value);
    existing.capital_growth += toNumber(holding.capital_growth);
    existing.annual_income_zar += toNumber(holding.annual_income_zar);
    existing.price_weighted_sum += toNumber(holding.current_price) * toNumber(holding.quantity);
    existing.current_price = existing.quantity ? existing.price_weighted_sum / existing.quantity : toNumber(holding.current_price);
    existing.roi_pct = safePercent(existing.capital_growth + existing.annual_income_zar, existing.total_cost);
    if (!existing.company && holding.company) existing.company = holding.company;
    if (!existing.share_code && holding.share_code) existing.share_code = holding.share_code;

    bySymbol.set(symbol, existing);
  });

  return Array.from(bySymbol.values());
}

function displayCodeForSymbol(holding, symbol) {
  const shareCode = String(holding.share_code || '').trim().toUpperCase();
  if (shareCode && !shareCode.includes('.')) return shareCode;
  return symbol.replace(/\.JO$/, '');
}

onMounted(() => {
  fetchPortfolioPerformance();
});

const strategyMetrics = [
  {
    label: 'Core equity target',
    value: '70%',
    detail: 'Quality shares with repeatable earnings and liquidity.',
  },
  {
    label: 'Income sleeve',
    value: '20%',
    detail: 'Dividend visibility, TM1 forecast alignment and payout cover.',
  },
  {
    label: 'Cash reserve',
    value: '10%',
    detail: 'Dry powder for drawdowns, tax, fees and tactical entries.',
  },
  {
    label: 'Review cadence',
    value: 'Monthly',
    detail: 'Rebalance only when target bands or risk rules are breached.',
  },
];

const signalBoard = [
  {
    name: 'Trend',
    status: 'Watch',
    tone: 'default',
    text: 'Price trend must confirm before adding to an existing holding.',
  },
  {
    name: 'Dividend',
    status: 'Core',
    tone: 'accent',
    text: 'Declared and forecast dividends support income weighting.',
  },
  {
    name: 'Valuation',
    status: 'Gate',
    tone: 'muted',
    text: 'New buys need a valuation reason, not only short term momentum.',
  },
  {
    name: 'Liquidity',
    status: 'Required',
    tone: 'default',
    text: 'Avoid positions that cannot be trimmed cleanly during stress.',
  },
];

const allocationRows = [
  {
    sleeve: 'Core quality',
    description: 'Banks, insurers, industrials and durable compounders.',
    target: '45%',
    band: '35-55%',
    action: 'Add on confirmed weakness. Trim after band breach.',
  },
  {
    sleeve: 'Dividend income',
    description: 'Declared, recurring and forecast-backed distributions.',
    target: '20%',
    band: '15-25%',
    action: 'Prioritise cover and payment reliability over yield.',
  },
  {
    sleeve: 'Tactical value',
    description: 'Recovery trades, special situations and valuation gaps.',
    target: '15%',
    band: '0-20%',
    action: 'Size smaller. Require a catalyst and exit trigger.',
  },
  {
    sleeve: 'Cash',
    description: 'Reserve for drawdowns, fees and new opportunities.',
    target: '10%',
    band: '5-20%',
    action: 'Deploy only when risk rules are met.',
  },
  {
    sleeve: 'Watchlist reserve',
    description: 'Names waiting for price, result or news confirmation.',
    target: '10%',
    band: '0-15%',
    action: 'Move to active only after the decision checklist passes.',
  },
];

const decisionRules = [
  {
    step: '01',
    title: 'Start with the portfolio band',
    body: 'Do not add to a sleeve already above its upper band unless a position is being switched out at the same time.',
  },
  {
    step: '02',
    title: 'Check the chart event history',
    body: 'Review buys, dividends, financial results and news markers before deciding whether the current price is justified.',
  },
  {
    step: '03',
    title: 'Require a written reason',
    body: 'Every buy, hold or trim needs a valuation, income, trend or risk reason that can be reviewed later.',
  },
  {
    step: '04',
    title: 'Protect cash after sharp rallies',
    body: 'When the visible trend is extended, keep the cash reserve intact unless the income case has improved.',
  },
];
</script>

<style scoped>
.fis-tabs {
  margin-bottom: 12px;
}

.fis-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.fis-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.fis-metric,
.fis-signal {
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 6px;
  background: var(--kdl-card-bg);
  padding: 12px;
}

.fis-metric__label,
.fis-posture__label {
  color: var(--kdl-text-muted);
  font-size: 12px;
  margin-bottom: 4px;
}

.fis-metric__value {
  font-size: 22px;
  font-weight: 700;
  color: var(--kdl-text-primary);
}

.fis-metric__detail,
.fis-posture__value,
.fis-signal__text,
.fis-rule__body {
  color: var(--kdl-text-secondary);
  font-size: 13px;
  line-height: 1.45;
}

.fis-posture {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.fis-signal-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.fis-signal__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  font-weight: 600;
}

.fis-allocation {
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 6px;
  overflow: hidden;
}

.fis-allocation__row {
  display: grid;
  grid-template-columns: minmax(240px, 1.4fr) 90px 100px minmax(220px, 1fr);
  gap: 12px;
  align-items: center;
  min-height: 48px;
  padding: 10px 12px;
  border-top: 1px solid var(--kdl-border-subtle);
  font-size: 13px;
}

.fis-allocation__row:first-child {
  border-top: 0;
}

.fis-allocation__row--head {
  min-height: 34px;
  color: var(--kdl-text-muted);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0;
  background: var(--kdl-hover-bg);
}

.fis-allocation__row strong {
  display: block;
}

.fis-allocation__row small {
  display: block;
  margin-top: 2px;
  color: var(--kdl-text-muted);
}

.fis-rule-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.fis-rule {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
  padding: 12px;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 6px;
}

.fis-rule__number {
  color: var(--kdl-accent);
  font-weight: 700;
  font-size: 12px;
}

.fis-rule__title {
  color: var(--kdl-text-primary);
  font-weight: 650;
  margin-bottom: 3px;
}

.fis-table-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.fis-performance-table :deep(.ktable-scroll-container) {
  max-height: min(560px, calc(100vh - 300px));
  overflow-y: auto;
}

.fis-period-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.fis-period-toggle__button--active {
  border-color: var(--kdl-accent);
  background: var(--kdl-accent-soft);
  color: var(--kdl-accent);
}

.fis-asof {
  color: var(--kdl-text-muted);
  font-size: 12px;
}

.fis-share-cell {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.fis-share-cell strong {
  color: var(--kdl-text-primary);
  font-size: 13px;
}

.fis-share-cell span {
  overflow: hidden;
  color: var(--kdl-text-muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fis-share-cell small {
  color: var(--kdl-text-muted);
  font-size: 11px;
  white-space: nowrap;
}

.fis-number {
  display: block;
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}

.fis-number__sub {
  display: block;
  margin-top: 2px;
  color: var(--kdl-text-muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}

.fis-roi {
  font-weight: 700;
}

.fis-return--positive {
  color: #15803d;
}

.fis-return--negative {
  color: #b91c1c;
}

.fis-return--flat {
  color: var(--kdl-text-secondary);
}

.fis-empty {
  padding: 20px;
  color: var(--kdl-text-muted);
  text-align: center;
}

@media (max-width: 1100px) {
  .fis-metrics,
  .fis-signal-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .fis-posture {
    grid-template-columns: 1fr;
  }

  .fis-allocation__row {
    grid-template-columns: minmax(180px, 1fr) 70px 86px minmax(180px, 1fr);
  }
}

@media (max-width: 720px) {
  .fis-metrics,
  .fis-signal-grid {
    grid-template-columns: 1fr;
  }

  .fis-allocation__row {
    grid-template-columns: 1fr;
    gap: 4px;
  }

  .fis-allocation__row--head {
    display: none;
  }
}
</style>
