<template>
  <AppPage
    class="reporting-page"
    :class="{ 'reporting-page--menu-collapsed': reportingMenuCollapsed }"
  >
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

    <div
      class="reporting-workspace"
      :class="{ 'reporting-workspace--menu-collapsed': reportingMenuCollapsed }"
    >
      <aside
        class="reporting-menu"
        :class="{ 'reporting-menu--collapsed': reportingMenuCollapsed }"
        aria-label="Reporting menu"
      >
        <div class="reporting-menu__top">
          <button
            class="reporting-menu__collapse"
            :aria-label="reportingMenuCollapsed ? 'Expand reporting menu' : 'Collapse reporting menu'"
            :title="reportingMenuCollapsed ? 'Expand reporting menu' : 'Collapse reporting menu'"
            type="button"
            @click="reportingMenuCollapsed = !reportingMenuCollapsed"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <polyline v-if="reportingMenuCollapsed" points="9 18 15 12 9 6" />
              <polyline v-else points="15 18 9 12 15 6" />
            </svg>
          </button>
        </div>

        <div v-show="!reportingMenuCollapsed" class="reporting-menu__groups">
          <div
            v-for="(group, groupIndex) in reportGroups"
            :key="group.label"
            class="reporting-menu__group"
          >
            <div v-if="groupIndex > 0" class="reporting-menu__divider" aria-hidden="true" />

            <button
              class="reporting-menu__group-toggle"
              :class="{ 'reporting-menu__group-toggle--active': isReportGroupActive(group) }"
              :aria-expanded="expandedReportGroups[group.label]"
              type="button"
              @click="toggleReportGroup(group.label)"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="reporting-menu__caret"
                :class="{ 'reporting-menu__caret--collapsed': !expandedReportGroups[group.label] }"
                aria-hidden="true"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
              <span class="reporting-menu__group-label">{{ group.label }}</span>
              <span
                v-if="group.items.length > 1"
                class="reporting-menu__count"
                :aria-label="`${group.items.length} reports`"
              >
                {{ group.items.length }}
              </span>
            </button>

            <transition name="reporting-collapse">
              <div v-show="expandedReportGroups[group.label]" class="reporting-menu__items">
                <button
                  v-for="report in group.items"
                  :key="report.id"
                  class="reporting-menu__item"
                  :class="{ 'reporting-menu__item--active': selectedReportId === report.id }"
                  :title="`${report.title} · ${report.source}`"
                  type="button"
                  @click="selectReport(report.id)"
                >
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
                    class="reporting-menu__item-icon"
                    aria-hidden="true"
                  >
                    <template v-if="reportIcon(report) === 'layout-dashboard'">
                      <rect x="3" y="3" width="7" height="9" rx="1" />
                      <rect x="14" y="3" width="7" height="5" rx="1" />
                      <rect x="14" y="12" width="7" height="9" rx="1" />
                      <rect x="3" y="16" width="7" height="5" rx="1" />
                    </template>
                    <template v-else-if="reportIcon(report) === 'bar-chart-2'">
                      <line x1="18" y1="20" x2="18" y2="10" />
                      <line x1="12" y1="20" x2="12" y2="4" />
                      <line x1="6" y1="20" x2="6" y2="14" />
                    </template>
                    <template v-else-if="reportIcon(report) === 'landmark'">
                      <line x1="3" y1="22" x2="21" y2="22" />
                      <line x1="6" y1="18" x2="6" y2="11" />
                      <line x1="10" y1="18" x2="10" y2="11" />
                      <line x1="14" y1="18" x2="14" y2="11" />
                      <line x1="18" y1="18" x2="18" y2="11" />
                      <polygon points="12 2 20 7 4 7" />
                    </template>
                    <template v-else-if="reportIcon(report) === 'trending-up'">
                      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                      <polyline points="17 6 23 6 23 12" />
                    </template>
                    <template v-else-if="reportIcon(report) === 'dollar-sign'">
                      <line x1="12" y1="1" x2="12" y2="23" />
                      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                    </template>
                    <template v-else-if="reportIcon(report) === 'list'">
                      <line x1="8" y1="6" x2="21" y2="6" />
                      <line x1="8" y1="12" x2="21" y2="12" />
                      <line x1="8" y1="18" x2="21" y2="18" />
                      <line x1="3" y1="6" x2="3.01" y2="6" />
                      <line x1="3" y1="12" x2="3.01" y2="12" />
                      <line x1="3" y1="18" x2="3.01" y2="18" />
                    </template>
                    <template v-else>
                      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
                    </template>
                  </svg>
                  <span class="reporting-menu__item-text">
                    {{ report.title }}
                  </span>
                </button>
              </div>
            </transition>
          </div>
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
                      <th>Month</th>
                      <th>Top line items</th>
                      <th class="text-right">Count</th>
                      <th class="text-right">Gross fees</th>
                      <th class="text-right">Credits</th>
                      <th class="text-right">Net cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="month in bankCostReport.months" :key="month.month">
                      <td>
                        <strong>{{ month.label }}</strong>
                      </td>
                      <td>
                        <span class="reporting-line-list">
                          {{ topLineItems(month.line_items) }}
                        </span>
                      </td>
                      <td class="text-right">{{ month.transaction_count }}</td>
                      <td class="text-right">{{ formatCurrency(month.debit_total) }}</td>
                      <td class="text-right">{{ formatCurrency(month.credit_total) }}</td>
                      <td class="text-right">{{ formatCurrency(month.net_cost) }}</td>
                    </tr>
                  </tbody>
                </table>
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
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppPage from '../components/shell/AppPage.vue';
import PageHeader from '../components/klikk/PageHeader.vue';
import SectionCard from '../components/klikk/SectionCard.vue';
import {
  getInvestecBankAccounts,
  getInvestecBankCostReport,
} from '../api/endpoints';

const selectedReportId = ref('bank-costs');
const route = useRoute();
const router = useRouter();
const reportingMenuCollapsed = ref(false);
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

// Placeholder reports cleared 2026-06 — rebuilding a deliberate FP&A pack.
// Only implemented reports live here; new ones are added as they are built.
const reportGroups = [
  {
    label: 'Banking',
    items: [
      { id: 'bank-costs', title: 'Bank cost by account', source: 'Investec banking', body: 'Total Investec bank cost by account, line item, gross fee, credit, and net cost.' },
    ],
  },
];

const allReports = computed(() => reportGroups.flatMap((group) => group.items));
const expandedReportGroups = reactive(
  Object.fromEntries(reportGroups.map((group) => [group.label, true]))
);

const activeReport = computed(() =>
  allReports.value.find((report) => report.id === selectedReportId.value) || allReports.value[0]
);

const coreReports = computed(() =>
  allReports.value.filter((report) =>
    ['bank-costs'].includes(report.id)
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

function topLineItems(lineItems = []) {
  return lineItems
    .slice(0, 3)
    .map((line) => `${line.line_item}: ${formatCurrency(line.net_cost)}`)
    .join(' · ');
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

function isKnownReport(reportId) {
  return allReports.value.some((report) => report.id === reportId);
}

function isReportGroupActive(group) {
  return group.items.some((report) => report.id === selectedReportId.value);
}

function toggleReportGroup(label) {
  expandedReportGroups[label] = !expandedReportGroups[label];
}

function reportIcon(report) {
  if (['management-pack', 'dashboard-pack'].includes(report.id)) return 'layout-dashboard';
  if (['profit-loss', 'balance-sheet', 'trial-balance', 'cash-flow'].includes(report.id)) return 'bar-chart-2';
  if (['bank-reconciliation', 'bank-transactions', 'bank-costs'].includes(report.id)) return 'landmark';
  if (['portfolio-returns', 'market-events'].includes(report.id)) return 'trending-up';
  if (['dividend-forecast'].includes(report.id)) return 'dollar-sign';
  if (['aged-receivables', 'aged-payables', 'data-freshness', 'process-audit'].includes(report.id)) return 'list';
  return 'dot';
}

async function selectReport(reportId, updateRoute = true) {
  if (!isKnownReport(reportId)) return;
  selectedReportId.value = reportId;
  if (updateRoute && route.query.report !== reportId) {
    router.replace({ query: { ...route.query, report: reportId } }).catch(() => {});
  }
  if (reportId === 'bank-costs' && !bankCostReport.value) {
    await loadBankCostReport();
  }
}

onMounted(() => {
  const routeReport = typeof route.query.report === 'string' ? route.query.report : '';
  if (routeReport) {
    selectReport(routeReport, false);
  }
});

watch(
  () => route.query.report,
  (report) => {
    const routeReport = typeof report === 'string' ? report : '';
    if (routeReport && routeReport !== selectedReportId.value) {
      selectReport(routeReport, false);
    }
  }
);
</script>

<style scoped>
.reporting-page {
  padding-left: 264px;
  transition: padding-left var(--duration-short) var(--ease-standard);
}

.reporting-page--menu-collapsed {
  padding-left: 72px;
}

.reporting-workspace {
  display: block;
}

.reporting-workspace--menu-collapsed {
  display: block;
}

.reporting-menu {
  position: fixed;
  top: 44px;
  left: 0;
  z-index: 10;
  width: 240px;
  height: calc(100vh - 44px);
  max-height: none;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px 6px;
  border: 0;
  border-right: 1px solid var(--kdl-border-subtle);
  border-radius: 0;
  background: var(--kdl-card-bg);
  transition: width var(--duration-short) var(--ease-standard);
}

.reporting-menu--collapsed {
  width: 48px;
  overflow: visible;
  padding-inline: 4px;
}

.reporting-menu__top {
  display: flex;
  justify-content: flex-end;
  padding: 2px 2px 6px;
}

.reporting-menu--collapsed .reporting-menu__top {
  justify-content: center;
  padding-inline: 0;
}

.reporting-menu__collapse {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 6px;
  color: var(--kdl-text-secondary);
  background: var(--kdl-card-bg);
  cursor: pointer;
  transition: background var(--duration-short) var(--ease-standard),
              color var(--duration-short) var(--ease-standard),
              border-color var(--duration-short) var(--ease-standard);
}

.reporting-menu__collapse:hover {
  color: var(--kdl-text-primary);
  background: var(--kdl-hover-bg);
  border-color: var(--kdl-border-strong);
}

.reporting-menu__groups {
  width: 100%;
}

.reporting-menu__group {
  border-radius: 6px;
  overflow: hidden;
}

.reporting-menu__divider {
  height: 1px;
  background: var(--kdl-border-subtle);
  margin: 4px 2px 0;
}

.reporting-menu__group-toggle {
  display: flex;
  align-items: center;
  gap: 5px;
  width: 100%;
  margin-top: 4px;
  padding: 8px 12px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--kdl-text-muted);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: background var(--duration-short) var(--ease-standard),
              color var(--duration-short) var(--ease-standard);
}

.reporting-menu__group-toggle:hover {
  background: var(--kdl-hover-bg);
}

.reporting-menu__group-toggle--active .reporting-menu__group-label {
  font-weight: 700;
  color: var(--kdl-text-secondary);
}

.reporting-menu__caret {
  flex-shrink: 0;
  color: var(--kdl-text-hint);
  transition: transform var(--duration-short) var(--ease-standard);
}

.reporting-menu__caret--collapsed {
  transform: rotate(-90deg);
}

.reporting-menu__group-label {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--kdl-text-muted);
  transition: color var(--duration-short) var(--ease-standard),
              font-weight var(--duration-short) var(--ease-standard);
}

.reporting-menu__count {
  flex-shrink: 0;
  padding: 1px 5px;
  border-radius: 999px;
  background: var(--kdl-border-subtle);
  color: var(--kdl-text-hint);
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
}

.reporting-menu__items {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding-bottom: 4px;
}

.reporting-menu__item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 26px;
  padding: 5px 8px 5px 22px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--kdl-text-secondary);
  font-family: inherit;
  font-size: 12px;
  font-weight: 400;
  letter-spacing: -0.005em;
  text-align: left;
  cursor: pointer;
  transition: background var(--duration-short) var(--ease-standard),
              color var(--duration-short) var(--ease-standard);
}

.reporting-menu__item:hover {
  background: var(--kdl-hover-bg);
  color: var(--kdl-text-primary);
}

.reporting-menu__item--active {
  background: color-mix(in srgb, var(--kdl-accent) 12%, transparent);
  color: var(--kdl-accent);
  font-weight: 600;
}

.reporting-menu__item--active:hover {
  background: color-mix(in srgb, var(--kdl-accent) 16%, transparent);
}

.reporting-menu__item-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reporting-menu__item-icon {
  flex-shrink: 0;
  color: inherit;
  opacity: 0.7;
}

.reporting-collapse-enter-active,
.reporting-collapse-leave-active {
  transition: opacity var(--duration-short) var(--ease-standard),
              transform var(--duration-short) var(--ease-standard);
  transform-origin: top;
}

.reporting-collapse-enter-from,
.reporting-collapse-leave-to {
  opacity: 0;
  transform: scaleY(0.95);
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

.reporting-line-list {
  display: block;
  max-width: 520px;
  color: var(--kdl-text-secondary);
  line-height: 1.4;
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
  .reporting-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .reporting-page,
  .reporting-page--menu-collapsed {
    padding-left: 16px;
  }

  .reporting-menu {
    position: static;
    width: auto;
    height: auto;
    max-height: none;
    margin-bottom: 16px;
    border: 1px solid var(--kdl-border-subtle);
    border-radius: 8px;
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
