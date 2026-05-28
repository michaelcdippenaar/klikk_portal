<template>
  <AppPage>
    <PageHeader
      title="Reporting"
      subtitle="Build reports across Xero, Investec, market data, and Planning Analytics"
    >
      <template #actions>
        <button class="btn btn-primary btn-sm">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
          New report
        </button>
      </template>
    </PageHeader>

    <div class="reporting-workspace">
      <aside class="reporting-menu" aria-label="Reporting menu">
        <div class="reporting-menu__header">
          <span class="reporting-menu__eyebrow">Reports</span>
          <strong>Library</strong>
        </div>

        <div
          v-for="group in reportGroups"
          :key="group.label"
          class="reporting-menu__group"
        >
          <div class="reporting-menu__group-label">{{ group.label }}</div>
          <button
            v-for="report in group.items"
            :key="report.id"
            class="reporting-menu__item"
            :class="{ 'reporting-menu__item--active': selectedReportId === report.id }"
            type="button"
            @click="selectReport(report.id)"
          >
            <span class="reporting-menu__item-text">
              <strong>{{ report.title }}</strong>
              <small>{{ report.source }}</small>
            </span>
          </button>
        </div>
      </aside>

      <div class="reporting-main">
        <div class="reporting-selected">
          <div>
            <span class="reporting-selected__source">{{ activeReport.source }}</span>
            <h2>{{ activeReport.title }}</h2>
            <p>{{ activeReport.body }}</p>
          </div>
          <button class="btn btn-ghost btn-sm" type="button">Configure</button>
        </div>

        <SectionCard
          v-if="activeReport.id === 'bank-costs'"
          title="Bank cost by account"
          description="Investec FeesAndInterest transactions grouped by account and fee line item."
        >
          <div class="bank-cost-report">
            <div class="bank-cost-report__filters">
              <label>
                <span>From</span>
                <input v-model="bankCostFilters.date_from" class="reporting-input" type="date">
              </label>
              <label>
                <span>To</span>
                <input v-model="bankCostFilters.date_to" class="reporting-input" type="date">
              </label>
              <label>
                <span>Account</span>
                <select v-model="bankCostFilters.account" class="reporting-input">
                  <option value="">All accounts</option>
                  <option
                    v-for="account in bankAccounts"
                    :key="account.account_number"
                    :value="account.account_number"
                  >
                    {{ account.account_number }} · {{ account.account_name }}
                  </option>
                </select>
              </label>
              <button class="btn btn-primary btn-sm" type="button" @click="loadBankCostReport">
                Load
              </button>
            </div>

            <div v-if="bankCostLoading" class="reporting-status">Loading bank cost report...</div>
            <div v-else-if="bankCostError" class="reporting-status reporting-status--error">
              {{ bankCostError }}
            </div>
            <template v-else-if="bankCostReport">
              <div class="bank-cost-report__summary">
                <div>
                  <span>Total bank cost</span>
                  <strong>{{ formatCurrency(bankCostReport.summary.net_cost) }}</strong>
                </div>
                <div>
                  <span>Gross fees and interest</span>
                  <strong>{{ formatCurrency(bankCostReport.summary.debit_total) }}</strong>
                </div>
                <div>
                  <span>Credits and reversals</span>
                  <strong>{{ formatCurrency(bankCostReport.summary.credit_total) }}</strong>
                </div>
                <div>
                  <span>Transactions</span>
                  <strong>{{ bankCostReport.summary.transaction_count }}</strong>
                </div>
              </div>

              <div class="bank-cost-report__table-wrap">
                <table class="reporting-table">
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th>Line item</th>
                      <th class="text-right">Count</th>
                      <th class="text-right">Gross fees</th>
                      <th class="text-right">Credits</th>
                      <th class="text-right">Net cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    <template v-for="account in bankCostReport.accounts" :key="account.account_number">
                      <tr class="reporting-table__account-row">
                        <td>
                          <strong>{{ account.account_name || 'Unnamed account' }}</strong>
                          <small>{{ account.account_number }} · {{ account.product_name }}</small>
                        </td>
                        <td>Total</td>
                        <td class="text-right">{{ account.transaction_count }}</td>
                        <td class="text-right">{{ formatCurrency(account.debit_total) }}</td>
                        <td class="text-right">{{ formatCurrency(account.credit_total) }}</td>
                        <td class="text-right">{{ formatCurrency(account.net_cost) }}</td>
                      </tr>
                      <tr
                        v-for="line in account.line_items"
                        :key="`${account.account_number}:${line.line_item}`"
                      >
                        <td></td>
                        <td>{{ line.line_item }}</td>
                        <td class="text-right">{{ line.transaction_count }}</td>
                        <td class="text-right">{{ formatCurrency(line.debit_total) }}</td>
                        <td class="text-right">{{ formatCurrency(line.credit_total) }}</td>
                        <td class="text-right">{{ formatCurrency(line.net_cost) }}</td>
                      </tr>
                    </template>
                  </tbody>
                </table>
              </div>

              <div class="bank-cost-report__line-items">
                <h3 class="reporting-builder__heading">Line item totals</h3>
                <div class="reporting-table__compact">
                  <div v-for="line in bankCostReport.line_items" :key="line.line_item">
                    <span>{{ line.line_item }}</span>
                    <strong>{{ formatCurrency(line.net_cost) }}</strong>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </SectionCard>

        <div v-else class="reporting-grid">
          <section
            v-for="card in reportCards"
            :key="card.title"
            class="reporting-card"
          >
            <div class="reporting-card__icon" aria-hidden="true">
              <svg
                v-if="card.icon === 'finance'"
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M3 3v18h18" />
                <path d="m19 9-5 5-4-4-3 3" />
              </svg>
              <svg
                v-else-if="card.icon === 'cash'"
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect x="2" y="6" width="20" height="12" rx="2" />
                <circle cx="12" cy="12" r="2" />
                <path d="M6 12h.01M18 12h.01" />
              </svg>
              <svg
                v-else-if="card.icon === 'portfolio'"
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                <path d="M3.3 7 12 12l8.7-5" />
                <path d="M12 22V12" />
              </svg>
              <svg
                v-else
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                <path d="M14 2v6h6" />
                <path d="M8 13h8" />
                <path d="M8 17h5" />
              </svg>
            </div>
            <div>
              <h2 class="reporting-card__title">{{ card.title }}</h2>
              <p class="reporting-card__body">{{ card.body }}</p>
            </div>
          </section>
        </div>

        <SectionCard
          title="Report builder"
          description="Start with a report type, then choose the source data and period."
        >
          <div class="reporting-builder">
            <div class="reporting-builder__panel">
              <h3 class="reporting-builder__heading">Core reports</h3>
              <div class="reporting-list">
            <button
              v-for="item in coreReports"
              :key="item.title"
              class="reporting-list__item"
              type="button"
              @click="selectReport(item.id)"
            >
              <span>
                <strong>{{ item.title }}</strong>
                <small>{{ item.source }}</small>
              </span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
              </div>
            </div>

            <div class="reporting-builder__panel">
              <h3 class="reporting-builder__heading">Data domains</h3>
              <div class="reporting-domain-grid">
                <span v-for="domain in dataDomains" :key="domain" class="reporting-domain">
                  {{ domain }}
                </span>
              </div>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  </AppPage>
</template>

<script setup>
import { computed, ref } from 'vue';
import AppPage from '../components/shell/AppPage.vue';
import PageHeader from '../components/klikk/PageHeader.vue';
import SectionCard from '../components/klikk/SectionCard.vue';
import {
  getInvestecBankAccounts,
  getInvestecBankCostReport,
} from '../api/endpoints';

const selectedReportId = ref('management-pack');
const bankAccounts = ref([]);
const bankCostReport = ref(null);
const bankCostLoading = ref(false);
const bankCostError = ref('');
const bankCostFilters = ref({
  date_from: '',
  date_to: '',
  account: '',
});

const reportCards = [
  {
    title: 'Financial statements',
    body: 'P&L, balance sheet, trial balance, budget and actual reporting.',
    icon: 'finance',
  },
  {
    title: 'Cash and banking',
    body: 'Bank movement, account activity, cash visibility, and reconciliation views.',
    icon: 'cash',
  },
  {
    title: 'Portfolio reporting',
    body: 'Investec holdings, stock returns, dividends, market events, and strategy views.',
    icon: 'portfolio',
  },
  {
    title: 'Operational packs',
    body: 'Month-end packs, exception reports, sync status, and data quality checks.',
    icon: 'document',
  },
];

const reportGroups = [
  {
    label: 'Executive',
    items: [
      { id: 'management-pack', title: 'Monthly management pack', source: 'Xero + Planning Analytics', body: 'Board-ready monthly view of financial performance, variances, cash, and key exceptions.' },
      { id: 'dashboard-pack', title: 'Business dashboard', source: 'All source systems', body: 'A compact operating dashboard across finance, cash, investments, and data freshness.' },
    ],
  },
  {
    label: 'Financials',
    items: [
      { id: 'profit-loss', title: 'Profit and loss', source: 'Xero + TM1', body: 'Income statement by tenant, period, account, tracking category, and budget version.' },
      { id: 'balance-sheet', title: 'Balance sheet', source: 'Xero + TM1', body: 'Assets, liabilities, equity, and reconciliation checks by reporting period.' },
      { id: 'trial-balance', title: 'Trial balance', source: 'Xero', body: 'Account-level trial balance with drill-through to source line items.' },
      { id: 'cash-flow', title: 'Cash flow', source: 'Xero + Investec banking', body: 'Cash movements, operating flows, bank balance trend, and liquidity signals.' },
    ],
  },
  {
    label: 'Debtors and Creditors',
    items: [
      { id: 'aged-receivables', title: 'Aged receivables', source: 'Xero', body: 'Customer ageing, overdue balances, collections risk, and period movement.' },
      { id: 'aged-payables', title: 'Aged payables', source: 'Xero', body: 'Supplier ageing, due payments, overdue exposure, and cash requirement planning.' },
    ],
  },
  {
    label: 'Banking',
    items: [
      { id: 'bank-reconciliation', title: 'Bank reconciliation summary', source: 'Investec banking + Xero', body: 'Bank account movement, reconciliation status, unmatched items, and month coverage.' },
      { id: 'bank-transactions', title: 'Bank transactions', source: 'Investec banking', body: 'Transaction-level banking report with account filters and export-ready detail.' },
      { id: 'bank-costs', title: 'Bank cost by account', source: 'Investec banking', body: 'Total Investec bank cost by account, line item, gross fee, credit, and net cost.' },
    ],
  },
  {
    label: 'Investments',
    items: [
      { id: 'portfolio-returns', title: 'Portfolio returns', source: 'Investec + market data', body: 'Capital growth, dividend yield, ROI, holdings concentration, and underperformers.' },
      { id: 'dividend-forecast', title: 'Dividend income forecast', source: 'Investec + yfinance + TM1', body: 'Expected dividends from holdings, declared DPS, payment timing, and TM1 forecast adjustments.' },
      { id: 'market-events', title: 'Market events and news', source: 'Market data + AI analysis', body: 'Stock news, dividend declarations, financial results, global events, and price impact notes.' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { id: 'data-freshness', title: 'Data freshness and gaps', source: 'All source systems', body: 'Coverage checks for Xero, Investec banking, holdings, transactions, and market data.' },
      { id: 'process-audit', title: 'Process run audit', source: 'Console processes', body: 'Sync runs, failures, latest refresh times, and operational exceptions.' },
    ],
  },
];

const allReports = computed(() => reportGroups.flatMap((group) => group.items));

const activeReport = computed(() =>
  allReports.value.find((report) => report.id === selectedReportId.value) || allReports.value[0]
);

const coreReports = computed(() =>
  allReports.value.filter((report) =>
    ['management-pack', 'portfolio-returns', 'dividend-forecast', 'bank-reconciliation', 'data-freshness'].includes(report.id)
  )
);

const dataDomains = [
  'Xero',
  'Investec banking',
  'Investec shares',
  'Market data',
  'Dividends',
  'Planning Analytics',
  'AI analysis',
  'Data quality',
];

const currencyFormatter = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
});

function formatCurrency(value) {
  const number = Number(value || 0);
  return currencyFormatter.format(Number.isFinite(number) ? number : 0);
}

async function loadBankAccounts() {
  if (bankAccounts.value.length) return;
  const data = await getInvestecBankAccounts();
  bankAccounts.value = Array.isArray(data?.results) ? data.results : [];
}

async function loadBankCostReport() {
  bankCostLoading.value = true;
  bankCostError.value = '';
  try {
    await loadBankAccounts();
    bankCostReport.value = await getInvestecBankCostReport(bankCostFilters.value);
  } catch (error) {
    bankCostError.value = error?.response?.data?.error || error?.message || 'Could not load bank cost report.';
  } finally {
    bankCostLoading.value = false;
  }
}

async function selectReport(reportId) {
  selectedReportId.value = reportId;
  if (reportId === 'bank-costs' && !bankCostReport.value) {
    await loadBankCostReport();
  }
}
</script>

<style scoped>
.reporting-workspace {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.reporting-menu {
  position: sticky;
  top: 0;
  max-height: calc(100vh - 160px);
  overflow-y: auto;
  padding: 12px;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 8px;
  background: var(--kdl-surface);
}

.reporting-menu__header {
  display: grid;
  gap: 2px;
  padding: 2px 4px 10px;
  border-bottom: 1px solid var(--kdl-border-subtle);
  margin-bottom: 10px;
}

.reporting-menu__header strong {
  font-size: 14px;
  color: var(--kdl-text-primary);
}

.reporting-menu__eyebrow,
.reporting-menu__group-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--kdl-text-muted);
}

.reporting-menu__group {
  display: grid;
  gap: 4px;
}

.reporting-menu__group + .reporting-menu__group {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--kdl-border-subtle);
}

.reporting-menu__group-label {
  padding: 0 4px 2px;
}

.reporting-menu__item {
  display: flex;
  width: 100%;
  padding: 8px 9px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--kdl-text-secondary);
  text-align: left;
  cursor: pointer;
}

.reporting-menu__item:hover {
  background: var(--kdl-hover-bg);
  color: var(--kdl-text-primary);
}

.reporting-menu__item--active {
  background: color-mix(in srgb, var(--kdl-accent) 12%, transparent);
  color: var(--kdl-accent);
}

.reporting-menu__item-text {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.reporting-menu__item strong {
  overflow: hidden;
  font-size: 12px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reporting-menu__item small {
  overflow: hidden;
  font-size: 11px;
  color: var(--kdl-text-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reporting-main {
  min-width: 0;
}

.reporting-selected {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 16px;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 8px;
  background: var(--kdl-surface);
  margin-bottom: 16px;
}

.reporting-selected__source {
  display: block;
  margin-bottom: 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--kdl-accent);
}

.reporting-selected h2 {
  margin: 0 0 6px;
  font-size: 16px;
  color: var(--kdl-text-primary);
}

.reporting-selected p {
  max-width: 780px;
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--kdl-text-secondary);
}

.reporting-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.reporting-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  min-height: 132px;
  padding: 16px;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 8px;
  background: var(--kdl-surface);
}

.reporting-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 7px;
  color: var(--kdl-accent);
  background: color-mix(in srgb, var(--kdl-accent) 10%, transparent);
}

.reporting-card__title {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 700;
  color: var(--kdl-text-primary);
}

.reporting-card__body {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--kdl-text-secondary);
}

.reporting-builder {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(280px, 0.7fr);
  gap: 20px;
}

.reporting-builder__panel {
  min-width: 0;
}

.reporting-builder__heading {
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 700;
  color: var(--kdl-text-primary);
}

.reporting-list {
  display: grid;
  gap: 8px;
}

.reporting-list__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 7px;
  background: var(--kdl-surface);
  color: var(--kdl-text-primary);
  text-align: left;
  cursor: pointer;
}

.reporting-list__item:hover {
  border-color: color-mix(in srgb, var(--kdl-accent) 40%, var(--kdl-border-subtle));
  background: var(--kdl-hover-bg);
}

.reporting-list__item strong,
.reporting-list__item small {
  display: block;
}

.reporting-list__item strong {
  font-size: 12px;
  font-weight: 650;
}

.reporting-list__item small {
  margin-top: 2px;
  font-size: 11px;
  color: var(--kdl-text-muted);
}

.reporting-domain-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.reporting-domain {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 6px 10px;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 999px;
  background: var(--kdl-page-bg);
  color: var(--kdl-text-secondary);
  font-size: 12px;
  font-weight: 500;
}

.bank-cost-report {
  display: grid;
  gap: 16px;
}

.bank-cost-report__filters {
  display: grid;
  grid-template-columns: repeat(3, minmax(160px, 1fr)) auto;
  gap: 12px;
  align-items: end;
}

.bank-cost-report__filters label {
  display: grid;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--kdl-text-secondary);
}

.reporting-input {
  width: 100%;
  min-height: 36px;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 6px;
  padding: 7px 10px;
  background: var(--kdl-surface);
  color: var(--kdl-text-primary);
  font: inherit;
}

.bank-cost-report__summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(130px, 1fr));
  gap: 10px;
}

.bank-cost-report__summary > div {
  display: grid;
  gap: 4px;
  padding: 12px;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 8px;
  background: var(--kdl-page-bg);
}

.bank-cost-report__summary span {
  font-size: 11px;
  font-weight: 700;
  color: var(--kdl-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.bank-cost-report__summary strong {
  font-size: 20px;
  color: var(--kdl-text-primary);
}

.bank-cost-report__table-wrap {
  overflow-x: auto;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 8px;
}

.reporting-table {
  width: 100%;
  min-width: 760px;
  border-collapse: collapse;
}

.reporting-table th,
.reporting-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--kdl-border-subtle);
  text-align: left;
  vertical-align: top;
}

.reporting-table th {
  background: var(--kdl-page-bg);
  color: var(--kdl-text-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.reporting-table td {
  color: var(--kdl-text-primary);
  font-size: 13px;
}

.reporting-table td small {
  display: block;
  margin-top: 2px;
  color: var(--kdl-text-muted);
}

.reporting-table__account-row td {
  background: var(--kdl-page-bg);
  font-weight: 600;
}

.reporting-table__compact {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 8px;
}

.reporting-table__compact > div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 8px;
  color: var(--kdl-text-secondary);
}

.reporting-status {
  padding: 12px;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 8px;
  background: var(--kdl-page-bg);
  color: var(--kdl-text-secondary);
}

.reporting-status--error {
  color: var(--kdl-danger, #b42318);
}

.text-right {
  text-align: right !important;
}

@media (max-width: 1180px) {
  .reporting-workspace {
    grid-template-columns: 240px minmax(0, 1fr);
  }

  .reporting-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .reporting-workspace {
    grid-template-columns: 1fr;
  }

  .reporting-menu {
    position: static;
    max-height: none;
  }

  .reporting-selected {
    flex-direction: column;
  }

  .reporting-grid,
  .reporting-builder {
    grid-template-columns: 1fr;
  }

  .bank-cost-report__filters,
  .bank-cost-report__summary {
    grid-template-columns: 1fr;
  }
}
</style>
