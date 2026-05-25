<template>
  <q-page class="q-pa-md">
    <PageHeader title="Data Viewer" subtitle="Explore trial balance, P&amp;L summaries, and line items">
      <template #tenantContext>
        <TenantSelector />
      </template>
    </PageHeader>

    <EmptyState
      v-if="!dataStore.selectedTenant"
      icon="domain"
      title="No tenant selected"
      body="Select a tenant to explore financial data."
    >
      <template #cta>
        <q-btn label="Select Tenant" color="primary" outline size="sm" @click="$router.push({ name: 'credentials' })" />
      </template>
    </EmptyState>

    <template v-else>
      <q-tabs
        v-model="tab"
        class="text-grey q-mb-md"
        active-color="primary"
        indicator-color="primary"
        @update:model-value="onTabChange"
      >
        <q-tab name="summary" label="Summary" />
        <q-tab name="trail-balance" label="Trial Balance" />
        <q-tab name="pnl-summary" label="P&amp;L Summary" />
        <q-tab name="line-items" label="Line Items" />
        <q-tab name="balance-sheet" label="Balance Sheet" />
      </q-tabs>

      <q-tab-panels v-model="tab" animated>

        <!-- Summary Tab -->
        <q-tab-panel name="summary">
          <SectionCard class="q-mb-md">
            <template #actions>
              <q-btn
                label="Refresh All"
                color="primary"
                outline
                size="sm"
                :loading="dataStore.loading"
                @click="refreshSummary"
              />
            </template>
            <div v-if="dataStore.summary" class="row q-gutter-md">
              <div class="col-12 col-sm-6 col-md-3 klikk-stat">
                <div class="label">Tenant</div>
                <div class="value">{{ dataStore.summary.tenant_name }}</div>
              </div>
              <div class="col-12 col-sm-6 col-md-3 klikk-stat">
                <div class="label">Accounts</div>
                <div class="value">{{ dataStore.summary.accounts_count }}</div>
              </div>
              <div class="col-12 col-sm-6 col-md-3 klikk-stat">
                <div class="label">Journals</div>
                <div class="value">{{ dataStore.summary.journals_count }}</div>
              </div>
              <div class="col-12 col-sm-6 col-md-3 klikk-stat">
                <div class="label">Trial Balance</div>
                <div class="value">{{ dataStore.summary.trail_balance_count }}</div>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            v-if="dataStore.accountSummary?.diagnostics"
            title="Reconciliation Diagnostics"
            class="q-mb-md"
          >
            <div class="row q-gutter-md q-mb-sm">
              <div class="col-auto">
                <span class="text-muted">Compared period: </span>
                <strong>{{ dataStore.accountSummary.diagnostics.date_range }}</strong>
                <span class="text-muted"> ({{ dataStore.accountSummary.diagnostics.xero_pnl_months }} months)</span>
              </div>
              <div class="col-auto">
                <span class="text-muted">Xero P&amp;L filtered to: </span>
                <strong>{{ dataStore.accountSummary.diagnostics.xero_pnl_filtered_to }}</strong> tracking
              </div>
              <div class="col-auto">
                <span class="text-muted">Tracking categories: </span>
                <span>{{ (dataStore.accountSummary.diagnostics.tracking_categories || []).join(', ') }}</span>
              </div>
            </div>
            <q-banner dense class="bg-light-blue-1 text-light-blue-10" rounded>
              <strong>Comparing:</strong> DB trial balance (from journals) vs Xero P&amp;L report (unfiltered).
              ~88% of accounts match. Remaining differences are typically property-related accounts
              where multi-line transactions are not fully captured by the journal import.
            </q-banner>
          </SectionCard>

          <SectionCard title="Income Statement Accounts" class="q-mb-md">
            <template #actions>
              <q-badge v-if="dataStore.accountSummary" color="positive" :label="`${dataStore.accountSummary.income_statement.in_balance} OK`" />
              <q-badge v-if="dataStore.accountSummary" color="negative" :label="`${dataStore.accountSummary.income_statement.out_of_balance} DIFF`" />
              <q-badge v-if="dataStore.accountSummary" color="grey" :label="`${dataStore.accountSummary.income_statement.no_xero_data} No Xero`" />
            </template>

            <FilterBar class="q-mb-sm">
              <q-input
                v-model.number="acctSummaryFilters.year"
                label="Year"
                type="number"
                outlined
                dense
                clearable
                class="filter-input-sm"
              />
              <q-input
                v-model.number="acctSummaryFilters.month"
                label="Month (1-12)"
                type="number"
                outlined
                dense
                clearable
                class="filter-input-sm"
                :rules="[v => !v || (v >= 1 && v <= 12) || '1-12']"
              />
              <q-btn label="Load" color="primary" size="sm" :loading="dataStore.loading" @click="loadAccountSummary" />
              <q-btn
                label="Clear"
                color="grey"
                flat
                size="sm"
                @click="acctSummaryFilters.year = null; acctSummaryFilters.month = null; loadAccountSummary()"
              />
            </FilterBar>

            <q-table
              v-if="dataStore.accountSummary"
              :rows="dataStore.accountSummary.income_statement.accounts"
              :columns="accountSummaryColumns"
              row-key="account_code"
              :filter="acctFilter"
              :pagination="{ rowsPerPage: 25 }"
              dense
              flat
              bordered
            >
              <template v-slot:top-right>
                <q-input
                  v-model="acctFilter"
                  placeholder="Filter accounts..."
                  outlined
                  dense
                  clearable
                  class="filter-input-md"
                >
                  <template v-slot:prepend>
                    <q-icon name="filter_list" />
                  </template>
                </q-input>
              </template>
              <template v-slot:body-cell-db_total="props">
                <q-td :props="props" class="kdl-numeric text-right">
                  {{ format(props.value) }}
                </q-td>
              </template>
              <template v-slot:body-cell-xero_total="props">
                <q-td :props="props" class="kdl-numeric text-right">
                  {{ props.value != null ? format(props.value) : '-' }}
                </q-td>
              </template>
              <template v-slot:body-cell-diff="props">
                <q-td :props="props" class="kdl-numeric text-right">
                  <span v-if="props.value != null" :class="diffClass(props.value)" class="text-weight-semibold">
                    {{ format(props.value) }}
                  </span>
                  <span v-else class="text-grey-5">-</span>
                </q-td>
              </template>
              <template v-slot:body-cell-in_balance="props">
                <q-td :props="props">
                  <q-badge v-if="props.value === true" color="positive" label="OK" />
                  <q-badge v-else-if="props.value === false" color="negative" label="DIFF" />
                  <span v-else class="text-grey-5">-</span>
                </q-td>
              </template>
            </q-table>
          </SectionCard>
        </q-tab-panel>

        <!-- Balance Sheet Tab -->
        <q-tab-panel name="balance-sheet">
          <SectionCard title="Balance Sheet Accounts">
            <template #actions>
              <q-badge v-if="dataStore.accountSummary" color="info" :label="`${dataStore.accountSummary.balance_sheet.total} accounts`" />
            </template>

            <FilterBar class="q-mb-sm">
              <q-input
                v-model.number="acctSummaryFilters.year"
                label="Year"
                type="number"
                outlined
                dense
                clearable
                class="filter-input-sm"
              />
              <q-input
                v-model.number="acctSummaryFilters.month"
                label="Month (1-12)"
                type="number"
                outlined
                dense
                clearable
                class="filter-input-sm"
                :rules="[v => !v || (v >= 1 && v <= 12) || '1-12']"
              />
              <q-btn label="Load" color="primary" size="sm" :loading="dataStore.loading" @click="loadAccountSummary" />
              <q-btn
                label="Clear"
                color="grey"
                flat
                size="sm"
                @click="acctSummaryFilters.year = null; acctSummaryFilters.month = null; loadAccountSummary()"
              />
            </FilterBar>

            <q-table
              v-if="dataStore.accountSummary"
              :rows="dataStore.accountSummary.balance_sheet.accounts"
              :columns="bsAccountColumns"
              row-key="account_code"
              :filter="bsFilter"
              :pagination="{ rowsPerPage: 25 }"
              dense
              flat
              bordered
            >
              <template v-slot:top-right>
                <q-input
                  v-model="bsFilter"
                  placeholder="Filter accounts..."
                  outlined
                  dense
                  clearable
                  class="filter-input-md"
                >
                  <template v-slot:prepend>
                    <q-icon name="filter_list" />
                  </template>
                </q-input>
              </template>
              <template v-slot:body-cell-db_total="props">
                <q-td :props="props" class="kdl-numeric text-right">
                  {{ format(props.value) }}
                </q-td>
              </template>
            </q-table>

            <EmptyState
              v-if="!dataStore.accountSummary"
              icon="table_chart"
              title="No data loaded"
              body="Use the filters above to load balance sheet accounts."
            />
          </SectionCard>
        </q-tab-panel>

        <!-- Trial Balance Tab -->
        <q-tab-panel name="trail-balance">
          <SectionCard title="Trial Balance" description="Balance to Date is calculated for balance sheet accounts (ASSET, LIABILITY, EQUITY) only.">
            <template #actions>
              <q-toggle v-model="reconView" label="Recon View" color="primary" dense />
            </template>

            <FilterBar class="q-mb-sm">
              <q-input
                v-model="trailBalanceFilters.contact_name"
                label="Search Contact"
                outlined
                dense
                clearable
                debounce="300"
                class="filter-input-lg"
              >
                <template v-slot:prepend>
                  <q-icon name="search" />
                </template>
              </q-input>
              <q-input
                v-model.number="trailBalanceFilters.year"
                label="Year"
                type="number"
                outlined
                dense
                class="filter-input-sm"
              />
              <q-input
                v-model.number="trailBalanceFilters.month"
                label="Month"
                type="number"
                min="1"
                max="12"
                outlined
                dense
                class="filter-input-sm"
              />
              <q-input
                v-model="trailBalanceFilters.account_id"
                label="Account ID"
                outlined
                dense
                class="filter-input-md"
              />
              <q-input
                v-model.number="trailBalanceFilters.limit"
                label="Limit"
                type="number"
                outlined
                dense
                class="filter-input-sm"
              />
              <q-btn label="Load" color="primary" size="sm" :loading="dataStore.loading" @click="loadTrailBalance" />
            </FilterBar>

            <div v-if="trailBalanceData" class="text-micro q-mb-sm">
              Showing {{ trailBalanceData.count }} records
            </div>

            <!-- RECON VIEW: grouped by tracking+account+year+month -->
            <q-table
              v-if="reconView"
              :rows="reconRows"
              :columns="reconColumns"
              :loading="dataStore.loading"
              row-key="_key"
              :filter="tableFilter"
              :pagination="{ rowsPerPage: 50 }"
              dense
              flat
              bordered
            >
              <template v-slot:top-right>
                <q-input
                  v-model="tableFilter"
                  placeholder="Filter results..."
                  outlined
                  dense
                  clearable
                  class="filter-input-md"
                >
                  <template v-slot:prepend>
                    <q-icon name="filter_list" />
                  </template>
                </q-input>
              </template>
              <template v-slot:body-cell-db_total="props">
                <q-td :props="props" class="kdl-numeric text-right">
                  {{ format(props.value) }}
                </q-td>
              </template>
              <template v-slot:body-cell-xero_pnl="props">
                <q-td :props="props" class="kdl-numeric text-right">
                  {{ props.value != null ? format(props.value) : '-' }}
                </q-td>
              </template>
              <template v-slot:body-cell-diff="props">
                <q-td :props="props" class="kdl-numeric text-right">
                  <span v-if="props.value != null" :class="diffClass(props.value)" class="text-weight-semibold">
                    {{ format(props.value) }}
                  </span>
                  <span v-else class="text-grey-5">-</span>
                </q-td>
              </template>
              <template v-slot:body-cell-match="props">
                <q-td :props="props">
                  <q-badge v-if="props.value === true" color="positive" label="OK" />
                  <q-badge v-else-if="props.value === false" color="negative" label="DIFF" />
                  <span v-else class="text-grey-5">-</span>
                </q-td>
              </template>
            </q-table>

            <!-- DETAIL VIEW: individual rows -->
            <q-table
              v-else
              :rows="trailBalanceRows"
              :columns="trailBalanceColumns"
              :loading="dataStore.loading"
              row-key="id"
              :filter="tableFilter"
              :pagination="{ rowsPerPage: 50 }"
              dense
              flat
              bordered
            >
              <template v-slot:top-right>
                <q-input
                  v-model="tableFilter"
                  placeholder="Filter results..."
                  outlined
                  dense
                  clearable
                  class="filter-input-md"
                >
                  <template v-slot:prepend>
                    <q-icon name="filter_list" />
                  </template>
                </q-input>
              </template>
              <template v-slot:body-cell-debit="props">
                <q-td :props="props" class="kdl-numeric text-right">
                  <span v-if="props.value != null && props.value != 0">{{ format(props.value) }}</span>
                  <span v-else class="text-grey-5">-</span>
                </q-td>
              </template>
              <template v-slot:body-cell-credit="props">
                <q-td :props="props" class="kdl-numeric text-right">
                  <span v-if="props.value != null && props.value != 0">{{ format(Math.abs(props.value)) }}</span>
                  <span v-else class="text-grey-5">-</span>
                </q-td>
              </template>
              <template v-slot:body-cell-balance_to_date="props">
                <q-td :props="props" class="kdl-numeric text-right">
                  {{ props.value != null ? format(props.value) : '-' }}
                </q-td>
              </template>
            </q-table>
          </SectionCard>
        </q-tab-panel>

        <!-- P&L Summary Tab -->
        <q-tab-panel name="pnl-summary">
          <SectionCard title="P&amp;L Summary by Tracking">
            <FilterBar class="q-mb-sm">
              <q-input
                v-model.number="pnlSummaryFilters.year"
                label="Year"
                type="number"
                outlined
                dense
                class="filter-input-sm"
              />
              <q-input
                v-model.number="pnlSummaryFilters.month"
                label="Month"
                type="number"
                min="1"
                max="12"
                outlined
                dense
                class="filter-input-sm"
              />
              <q-btn label="Load" color="primary" size="sm" :loading="dataStore.loading" @click="loadPnlSummary" />
            </FilterBar>

            <div v-if="pnlSummaryData" class="text-micro q-mb-sm">
              {{ pnlSummaryData.count }} tracking groups
            </div>

            <q-table
              :rows="pnlSummaryRows"
              :columns="pnlSummaryColumns"
              :loading="dataStore.loading"
              row-key="_key"
              :filter="pnlTableFilter"
              :pagination="{ rowsPerPage: 50 }"
              dense
              flat
              bordered
            >
              <template v-slot:top-right>
                <q-input
                  v-model="pnlTableFilter"
                  placeholder="Filter..."
                  outlined
                  dense
                  clearable
                  class="filter-input-md"
                >
                  <template v-slot:prepend>
                    <q-icon name="filter_list" />
                  </template>
                </q-input>
              </template>
              <template v-slot:body-cell-db_income="props">
                <q-td :props="props" class="kdl-numeric text-right">{{ format(props.value) }}</q-td>
              </template>
              <template v-slot:body-cell-db_expense="props">
                <q-td :props="props" class="kdl-numeric text-right">{{ format(props.value) }}</q-td>
              </template>
              <template v-slot:body-cell-db_pnl="props">
                <q-td :props="props" class="kdl-numeric text-right text-weight-semibold">{{ format(props.value) }}</q-td>
              </template>
              <template v-slot:body-cell-xero_income="props">
                <q-td :props="props" class="kdl-numeric text-right">
                  {{ props.value != null ? format(props.value) : '-' }}
                </q-td>
              </template>
              <template v-slot:body-cell-xero_expense="props">
                <q-td :props="props" class="kdl-numeric text-right">
                  {{ props.value != null ? format(props.value) : '-' }}
                </q-td>
              </template>
              <template v-slot:body-cell-xero_pnl="props">
                <q-td :props="props" class="kdl-numeric text-right text-weight-semibold">
                  {{ props.value != null ? format(props.value) : '-' }}
                </q-td>
              </template>
              <template v-slot:body-cell-pnl_diff="props">
                <q-td :props="props" class="kdl-numeric text-right">
                  <span v-if="props.value != null" :class="diffClass(props.value)" class="text-weight-semibold">
                    {{ format(props.value) }}
                  </span>
                  <span v-else class="text-grey-5">-</span>
                </q-td>
              </template>
            </q-table>
          </SectionCard>
        </q-tab-panel>

        <!-- Line Items Tab -->
        <q-tab-panel name="line-items">
          <SectionCard title="Line Items">
            <template #actions>
              <span v-if="lineItemsData" class="text-micro">
                Showing {{ lineItemsData.count }} of {{ lineItemsData.total_count }}
                ({{ lineItemsData.remaining }} remaining)
              </span>
            </template>

            <FilterBar class="q-mb-sm">
              <q-input
                v-model="lineItemsFilters.date_from"
                label="Date From (YYYY-MM-DD)"
                outlined
                dense
                class="filter-input-lg"
              />
              <q-input
                v-model="lineItemsFilters.date_to"
                label="Date To (YYYY-MM-DD)"
                outlined
                dense
                class="filter-input-lg"
              />
              <q-input
                v-model.number="lineItemsFilters.year"
                label="Year"
                type="number"
                outlined
                dense
                class="filter-input-sm"
              />
              <q-input
                v-model.number="lineItemsFilters.month"
                label="Month"
                type="number"
                min="1"
                max="12"
                outlined
                dense
                class="filter-input-sm"
              />
              <q-input
                v-model.number="lineItemsFilters.limit"
                label="Limit"
                type="number"
                outlined
                dense
                class="filter-input-sm"
              />
              <q-btn label="Load" color="primary" size="sm" :loading="dataStore.loading" @click="loadLineItems" />
            </FilterBar>

            <q-table
              :rows="lineItemsRows"
              :columns="lineItemsColumns"
              :loading="dataStore.loading"
              row-key="id"
              :pagination="{ rowsPerPage: 25 }"
              dense
              flat
              bordered
            >
              <template v-slot:body-cell-debit="props">
                <q-td :props="props" class="kdl-numeric text-right">
                  <span v-if="props.value != null && props.value != 0">{{ format(props.value) }}</span>
                  <span v-else class="text-grey-5">-</span>
                </q-td>
              </template>
              <template v-slot:body-cell-credit="props">
                <q-td :props="props" class="kdl-numeric text-right">
                  <span v-if="props.value != null && props.value != 0">{{ format(Math.abs(props.value)) }}</span>
                  <span v-else class="text-grey-5">-</span>
                </q-td>
              </template>
            </q-table>
          </SectionCard>
        </q-tab-panel>

      </q-tab-panels>
    </template>
  </q-page>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDataStore } from '../stores/data';
import { useFormatCurrency } from '../composables/useFormatCurrency.js';
import PageHeader from '../components/klikk/PageHeader.vue';
import SectionCard from '../components/klikk/SectionCard.vue';
import FilterBar from '../components/klikk/FilterBar.vue';
import EmptyState from '../components/klikk/EmptyState.vue';
import TenantSelector from '../components/TenantSelector.vue';

const route = useRoute();
const router = useRouter();
const dataStore = useDataStore();
const { format, formatRaw } = useFormatCurrency();

// Valid tab slugs — first entry is the default.
const VALID_TABS = ['summary', 'trail-balance', 'pnl-summary', 'line-items', 'balance-sheet'];

function resolveTab(slug) {
  return VALID_TABS.includes(slug) ? slug : VALID_TABS[0];
}

const tab = ref(resolveTab(route.query.tab));

// Keep URL in sync when the tab ref changes programmatically (e.g. on mount).
watch(tab, (newTab) => {
  if (route.query.tab !== newTab) {
    router.replace({ query: { ...route.query, tab: newTab } });
  }
});

// Sync tab when URL changes externally (back/forward navigation).
watch(() => route.query.tab, (slug) => {
  const resolved = resolveTab(slug);
  if (tab.value !== resolved) {
    tab.value = resolved;
  }
});

function onTabChange(newTab) {
  router.replace({ query: { ...route.query, tab: newTab } });
}

const tableFilter = ref('');
const pnlTableFilter = ref('');
const reconView = ref(false);
const acctFilter = ref('');
const bsFilter = ref('');

const acctSummaryFilters = reactive({ year: null, month: null });
const trailBalanceFilters = reactive({
  year: null,
  month: null,
  account_id: '',
  contact_name: '',
  limit: 5000,
});
const pnlSummaryFilters = reactive({ year: null, month: null });
const lineItemsFilters = reactive({
  date_from: '',
  date_to: '',
  year: null,
  month: null,
  limit: 5000,
});

// ─── Column definitions ────────────────────────────────────────────────────

const accountSummaryColumns = [
  { name: 'account_code', label: 'Code', field: 'account_code', align: 'left', sortable: true },
  { name: 'account_name', label: 'Account', field: 'account_name', align: 'left', sortable: true },
  { name: 'account_type', label: 'Type', field: 'account_type', align: 'left', sortable: true },
  { name: 'db_total', label: 'DB Total (R)', field: 'db_total', align: 'right', sortable: true },
  { name: 'xero_total', label: 'Xero P&L Total (R)', field: 'xero_total', align: 'right', sortable: true },
  { name: 'diff', label: 'Diff (R)', field: 'diff', align: 'right', sortable: true },
  { name: 'in_balance', label: 'Status', field: 'in_balance', align: 'center', sortable: true },
];

const bsAccountColumns = [
  { name: 'account_code', label: 'Code', field: 'account_code', align: 'left', sortable: true },
  { name: 'account_name', label: 'Account', field: 'account_name', align: 'left', sortable: true },
  { name: 'account_type', label: 'Type', field: 'account_type', align: 'left', sortable: true },
  { name: 'db_total', label: 'DB Total (R)', field: 'db_total', align: 'right', sortable: true },
];

const trailBalanceColumns = [
  { name: 'year', label: 'Year', field: 'year', align: 'left', sortable: true },
  { name: 'month', label: 'Month', field: 'month', align: 'left', sortable: true },
  { name: 'account_code', label: 'Code', field: 'account_code', align: 'left', sortable: true },
  { name: 'account_name', label: 'Account', field: 'account_name', align: 'left', sortable: true },
  { name: 'contact_name', label: 'Contact', field: 'contact_name', align: 'left', sortable: true },
  { name: 'tracking1', label: 'Tracking 1', field: 'tracking1', align: 'left', sortable: true },
  { name: 'tracking2', label: 'Tracking 2', field: 'tracking2', align: 'left', sortable: true },
  { name: 'debit', label: 'Debit (R)', field: 'debit', align: 'right', sortable: true },
  { name: 'credit', label: 'Credit (R)', field: 'credit', align: 'right', sortable: true },
  { name: 'balance_to_date', label: 'Balance to Date BS (R)', field: 'balance_to_date', align: 'right', sortable: true },
];

const reconColumns = [
  { name: 'year', label: 'Year', field: 'year', align: 'left', sortable: true },
  { name: 'month', label: 'Month', field: 'month', align: 'left', sortable: true },
  { name: 'account_code', label: 'Code', field: 'account_code', align: 'left', sortable: true },
  { name: 'account_name', label: 'Account', field: 'account_name', align: 'left', sortable: true },
  { name: 'tracking1', label: 'Tracking 1', field: 'tracking1', align: 'left', sortable: true },
  { name: 'db_total', label: 'DB Total (R)', field: 'db_total', align: 'right', sortable: true },
  { name: 'xero_pnl', label: 'Xero P&L (R)', field: 'xero_pnl', align: 'right', sortable: true },
  { name: 'diff', label: 'Diff (R)', field: 'diff', align: 'right', sortable: true },
  { name: 'match', label: 'Match', field: 'match', align: 'center', sortable: true },
];

const pnlSummaryColumns = [
  { name: 'tracking1', label: 'Tracking', field: 'tracking1', align: 'left', sortable: true },
  { name: 'year', label: 'Year', field: 'year', align: 'left', sortable: true },
  { name: 'month', label: 'Month', field: 'month', align: 'left', sortable: true },
  { name: 'db_income', label: 'DB Income (R)', field: 'db_income', align: 'right', sortable: true },
  { name: 'db_expense', label: 'DB Expense (R)', field: 'db_expense', align: 'right', sortable: true },
  { name: 'db_pnl', label: 'DB P&L (R)', field: 'db_pnl', align: 'right', sortable: true },
  { name: 'xero_income', label: 'Xero Income (R)', field: 'xero_income', align: 'right', sortable: true },
  { name: 'xero_expense', label: 'Xero Expense (R)', field: 'xero_expense', align: 'right', sortable: true },
  { name: 'xero_pnl', label: 'Xero P&L (R)', field: 'xero_pnl', align: 'right', sortable: true },
  { name: 'pnl_diff', label: 'P&L Diff (R)', field: 'pnl_diff', align: 'right', sortable: true },
];

const lineItemsColumns = [
  { name: 'date', label: 'Date', field: 'date', align: 'left', sortable: true },
  { name: 'account_code', label: 'Code', field: 'account_code', align: 'left', sortable: true },
  { name: 'account_name', label: 'Account', field: 'account_name', align: 'left', sortable: true },
  { name: 'contact_name', label: 'Contact', field: 'contact_name', align: 'left', sortable: true },
  { name: 'description', label: 'Description', field: 'description', align: 'left' },
  { name: 'debit', label: 'Debit (R)', field: 'debit', align: 'right', sortable: true },
  { name: 'credit', label: 'Credit (R)', field: 'credit', align: 'right', sortable: true },
  { name: 'transaction_source_type', label: 'Source', field: 'transaction_source_type', align: 'left', sortable: true },
];

// ─── Computed rows ─────────────────────────────────────────────────────────

const trailBalanceRows = computed(() => {
  const results = dataStore.trailBalance?.results || [];
  return results.map((r) => ({
    ...r,
    debit: r.debit != null ? Number(r.debit) : null,
    credit: r.credit != null ? Number(r.credit) : null,
  }));
});

const reconRows = computed(() => {
  const results = dataStore.trailBalance?.results || [];
  if (!results.length) return [];

  const groups = {};
  for (const r of results) {
    const key = `${r.tracking1 || ''}|${r.account_code}|${r.year}|${r.month}`;
    if (!groups[key]) {
      groups[key] = {
        _key: key,
        year: r.year,
        month: r.month,
        account_code: r.account_code,
        account_name: r.account_name,
        tracking1: r.tracking1,
        db_total: 0,
        xero_pnl: r.xero_pnl != null ? Number(r.xero_pnl) : null,
      };
    }
    groups[key].db_total += Number(r.amount || 0);
    if (groups[key].xero_pnl === null && r.xero_pnl != null) {
      groups[key].xero_pnl = Number(r.xero_pnl);
    }
  }

  return Object.values(groups).map(g => {
    g.db_total = Math.round(g.db_total * 100) / 100;
    if (g.xero_pnl != null) {
      g.diff = Math.round((g.xero_pnl - g.db_total) * 100) / 100;
      g.match = Math.abs(g.diff) < 0.01;
    } else {
      g.diff = null;
      g.match = null;
    }
    return g;
  }).sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    if (a.month !== b.month) return a.month - b.month;
    if (a.account_code !== b.account_code) return (a.account_code || '').localeCompare(b.account_code || '');
    return (a.tracking1 || '').localeCompare(b.tracking1 || '');
  });
});

const pnlSummaryRows = computed(() => {
  const results = dataStore.pnlSummary?.results || [];
  return results.map((r, i) => ({
    ...r,
    _key: `${r.tracking1 || 'none'}|${r.year}|${r.month}|${i}`,
  }));
});

const pnlSummaryData = computed(() => dataStore.pnlSummary);
const trailBalanceData = computed(() => dataStore.trailBalance);

const lineItemsRows = computed(() => {
  const results = dataStore.lineItems?.results || [];
  return results.map((r) => ({
    ...r,
    debit: r.debit != null ? Number(r.debit) : null,
    credit: r.credit != null ? Number(r.credit) : null,
  }));
});

const lineItemsData = computed(() => dataStore.lineItems);

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * diffClass — used only on explicit variance/diff columns.
 * Red means the two sides don't match, green means they do.
 * This is the only place colour carries semantic load (ADR §3).
 */
function diffClass(val) {
  if (val === null || val === undefined) return 'text-grey-5';
  const n = Number(val);
  if (Math.abs(n) < 0.01) return 'text-positive';
  return 'text-negative';
}

// ─── Data loaders ──────────────────────────────────────────────────────────

async function refreshSummary() {
  await Promise.all([dataStore.fetchSummary(), loadAccountSummary()]);
}

async function loadAccountSummary() {
  const filters = {};
  if (acctSummaryFilters.year) filters.year = acctSummaryFilters.year;
  if (acctSummaryFilters.month) filters.month = acctSummaryFilters.month;
  await dataStore.fetchAccountSummary(filters);
}

async function loadTrailBalance() {
  const filters = {};
  if (trailBalanceFilters.year) filters.year = trailBalanceFilters.year;
  if (trailBalanceFilters.month) filters.month = trailBalanceFilters.month;
  if (trailBalanceFilters.account_id) filters.account_id = trailBalanceFilters.account_id;
  if (trailBalanceFilters.contact_name) filters.contact_name = trailBalanceFilters.contact_name;
  if (trailBalanceFilters.limit) filters.limit = trailBalanceFilters.limit;
  await dataStore.fetchTrailBalance(filters);
}

async function loadPnlSummary() {
  const filters = {};
  if (pnlSummaryFilters.year) filters.year = pnlSummaryFilters.year;
  if (pnlSummaryFilters.month) filters.month = pnlSummaryFilters.month;
  await dataStore.fetchPnlSummary(filters);
}

async function loadLineItems() {
  const filters = {};
  if (lineItemsFilters.date_from) filters.date_from = lineItemsFilters.date_from;
  if (lineItemsFilters.date_to) filters.date_to = lineItemsFilters.date_to;
  if (lineItemsFilters.year) filters.year = lineItemsFilters.year;
  if (lineItemsFilters.month) filters.month = lineItemsFilters.month;
  if (lineItemsFilters.limit) filters.limit = lineItemsFilters.limit;
  await dataStore.fetchLineItems(filters);
}

onMounted(async () => {
  // Resolve URL tab on mount — also pushes tab to URL if absent.
  const resolved = resolveTab(route.query.tab);
  if (!route.query.tab || route.query.tab !== resolved) {
    router.replace({ query: { ...route.query, tab: resolved } });
  }
  tab.value = resolved;

  if (dataStore.selectedTenant) {
    await Promise.all([dataStore.fetchSummary(), dataStore.fetchAccountSummary()]);
  }
});
</script>

<style scoped>
.filter-input-sm  { min-width: 110px; max-width: 130px; }
.filter-input-md  { min-width: 180px; max-width: 220px; }
.filter-input-lg  { min-width: 200px; }
</style>
