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
      <!-- Page-level error strip — shown when any fetcher fails -->
      <PersistentResultStrip
        v-if="pageError"
        :result="{ status: 'error', completedAt: null, error: pageError }"
        title="Load failed"
        compact
        class="q-mb-sm"
      />

      <!-- Recon-view segmented control — promoted out of buried card header -->
      <div class="dv-toolbar q-mb-sm">
        <KTabs :tabs="dataTabs" v-model="tab" />
        <div v-if="tab === 'trail-balance'" class="dv-toolbar__recon">
          <button
            class="dv-seg-btn"
            :class="{ 'dv-seg-btn--active': !reconView }"
            @click="reconView = false"
          >Detail</button>
          <button
            class="dv-seg-btn"
            :class="{ 'dv-seg-btn--active': reconView }"
            @click="reconView = true"
          >Recon</button>
        </div>
      </div>

      <!-- ══════════════════════════════════════════════════════════
           SUMMARY TAB
      ══════════════════════════════════════════════════════════ -->
      <div v-show="tab === 'summary'">
        <!-- Tab hint -->
        <p class="dv-tab-hint">Operational coverage and reconciliation status for income statement accounts.</p>

        <!-- Refresh button + freshness -->
        <div class="dv-freshness-row q-mb-sm">
          <FreshnessChip
            :value="summaryLoadedAt"
            prefix="Loaded"
            :stale-after="60"
          />
          <button class="dv-refresh-btn" :disabled="dataStore.loading" title="Refresh" @click="refreshSummary">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            <span class="sr-only">Refresh</span>
          </button>
        </div>

        <!-- Operational coverage metrics — replaces raw db-row-count klikk-stats -->
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
          <div v-if="dataStore.summary" class="dv-metrics-row">
            <MetricTile
              label="Tenant"
              :value="dataStore.summary.tenant_name || '—'"
            />
            <MetricTile
              label="Latest period covered"
              :value="latestPeriodLabel"
            />
            <MetricTile
              label="Last full sync"
              :value="lastSyncLabel"
            />
            <MetricTile
              label="Accounts on file"
              :value="dataStore.summary.accounts_count != null ? String(dataStore.summary.accounts_count) : null"
              unit="accounts"
            />
          </div>
          <EmptyState
            v-else-if="!dataStore.loading"
            title="No summary data"
            body="Click Refresh All to load."
          />
        </SectionCard>

        <!-- Reconciliation Diagnostics — structured dl, not prose -->
        <SectionCard
          v-if="dataStore.accountSummary?.diagnostics"
          title="Reconciliation Diagnostics"
          class="q-mb-md"
        >
          <dl class="dv-diag-list">
            <div class="dv-diag-item">
              <dt class="dv-diag-term">Compared period</dt>
              <dd class="dv-diag-def">
                {{ dataStore.accountSummary.diagnostics.date_range }}
                <span class="dv-diag-meta">({{ dataStore.accountSummary.diagnostics.xero_pnl_months }} months)</span>
              </dd>
            </div>
            <div class="dv-diag-item">
              <dt class="dv-diag-term">Xero P&amp;L filtered to</dt>
              <dd class="dv-diag-def">{{ dataStore.accountSummary.diagnostics.xero_pnl_filtered_to }} tracking</dd>
            </div>
            <div class="dv-diag-item">
              <dt class="dv-diag-term">Tracking categories</dt>
              <dd class="dv-diag-def">{{ (dataStore.accountSummary.diagnostics.tracking_categories || []).join(', ') || '—' }}</dd>
            </div>
          </dl>
        </SectionCard>

        <!-- Income Statement Accounts -->
        <SectionCard title="Income Statement Accounts" class="q-mb-md">
          <template #actions>
            <!-- StatusPills replacing q-badges; single inline balance summary -->
            <template v-if="dataStore.accountSummary">
              <div class="dv-is-status" role="group" aria-label="Income statement reconciliation summary">
                <StatusPill
                  tone="success"
                  :label="`${dataStore.accountSummary.income_statement.in_balance} matched`"
                  :icon="true"
                  size="sm"
                />
                <StatusPill
                  tone="error"
                  :label="`${dataStore.accountSummary.income_statement.out_of_balance} diff`"
                  :icon="true"
                  size="sm"
                />
                <StatusPill
                  tone="neutral"
                  :label="`${dataStore.accountSummary.income_statement.no_xero_data} no Xero`"
                  :icon="true"
                  size="sm"
                />
                <!-- Info tooltip explaining the tones -->
                <span class="dv-is-info" tabindex="0" title="Matched: DB total agrees with Xero P&amp;L. Diff: totals disagree — investigate in Comparison tab. No Xero: account has no Xero P&amp;L data for the period.">
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-label="Explanation of status tones"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                </span>
              </div>
            </template>
          </template>

          <PeriodFilter
            v-model:year="acctSummaryFilters.year"
            v-model:month="acctSummaryFilters.month"
            tab="summary"
            :tenant="dataStore.selectedTenant"
            :loading="dataStore.loading"
            @load="loadAccountSummary"
            @clear="loadAccountSummary"
            @restore="restoreAcctSummaryView"
          />

          <!-- Freshness + re-fetch -->
          <div class="dv-freshness-row q-mb-sm">
            <FreshnessChip
              :value="acctSummaryLoadedAt"
              prefix="Loaded"
              :stale-after="60"
            />
            <button v-if="acctSummaryLoadedAt" class="dv-refresh-btn" :disabled="dataStore.loading" @click="loadAccountSummary" title="Re-fetch">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            </button>
          </div>

          <!-- Error state -->
          <KAlert
            v-if="acctSummaryError"
            variant="error"
            :title="acctSummaryError"
            class="q-mb-sm"
            dismissible
          />

          <!-- Empty state before first load -->
          <EmptyState
            v-if="!dataStore.accountSummary && !dataStore.loading"
            title="No data loaded"
            body="Set a period above and click Load to view income statement accounts."
          >
            <template #cta>
              <q-btn label="Load now" color="primary" size="sm" outline @click="loadAccountSummary" />
            </template>
          </EmptyState>

          <q-table
            v-if="dataStore.accountSummary"
            :rows="dataStore.accountSummary.income_statement.accounts"
            :columns="accountSummaryColumns"
            row-key="account_code"
            :filter="acctFilter"
            :pagination="{ rowsPerPage: 25 }"
            selection="single"
            dense
            flat
            bordered
          >
            <template v-slot:top-right>
              <KInput
                ref="acctFilterInput"
                v-model="acctFilter"
                placeholder="Filter accounts…"
                icon="filter"
                class="filter-input-md"
              >
                <template #icon><DvFilterIcon /></template>
              </KInput>
            </template>
            <template v-slot:body-cell-db_total="props">
              <q-td :props="props" class="kdl-numeric text-right">{{ format(props.value) }}</q-td>
            </template>
            <template v-slot:body-cell-xero_total="props">
              <q-td :props="props" class="kdl-numeric text-right">{{ props.value != null ? format(props.value) : '-' }}</q-td>
            </template>
            <template v-slot:body-cell-diff="props">
              <q-td :props="props" class="kdl-numeric text-right">
                <span v-if="props.value != null" :class="diffClass(props.value)" class="text-weight-semibold">{{ format(props.value) }}</span>
                <span v-else class="dv-null">-</span>
              </q-td>
            </template>
            <template v-slot:body-cell-in_balance="props">
              <q-td :props="props">
                <template v-if="props.value === true">
                  <StatusPill tone="success" label="OK" size="sm" />
                </template>
                <template v-else-if="props.value === false">
                  <!-- DIFF badge: click navigates to Line Items filtered to this account -->
                  <button
                    class="dv-diff-btn"
                    :title="`Investigate ${props.row.account_name} in Line Items`"
                    @click="drillToLineItems(props.row)"
                  >
                    <StatusPill tone="error" label="DIFF" size="sm" />
                  </button>
                </template>
                <span v-else class="dv-null">-</span>
              </q-td>
            </template>
          </q-table>
        </SectionCard>
      </div>

      <!-- ══════════════════════════════════════════════════════════
           BALANCE SHEET TAB
      ══════════════════════════════════════════════════════════ -->
      <div v-show="tab === 'balance-sheet'">
        <p class="dv-tab-hint">Balance sheet accounts and their DB-computed totals for the selected period.</p>

        <SectionCard title="Balance Sheet Accounts">
          <template #actions>
            <StatusPill
              v-if="dataStore.accountSummary"
              tone="info"
              :label="`${dataStore.accountSummary.balance_sheet.total} accounts`"
              size="sm"
            />
          </template>

          <PeriodFilter
            v-model:year="acctSummaryFilters.year"
            v-model:month="acctSummaryFilters.month"
            tab="balance-sheet"
            :tenant="dataStore.selectedTenant"
            :loading="dataStore.loading"
            @load="loadAccountSummary"
            @clear="loadAccountSummary"
            @restore="restoreAcctSummaryView"
          />

          <!-- Freshness -->
          <div class="dv-freshness-row q-mb-sm">
            <FreshnessChip
              :value="acctSummaryLoadedAt"
              prefix="Loaded"
              :stale-after="60"
            />
            <button v-if="acctSummaryLoadedAt" class="dv-refresh-btn" :disabled="dataStore.loading" @click="loadAccountSummary" title="Re-fetch">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            </button>
          </div>

          <!-- Error state -->
          <KAlert
            v-if="acctSummaryError"
            variant="error"
            :title="acctSummaryError"
            class="q-mb-sm"
            dismissible
          />

          <EmptyState
            v-if="!dataStore.accountSummary && !dataStore.loading"
            title="No data loaded"
            body="Use the filters above to load balance sheet accounts."
          >
            <template #cta>
              <q-btn label="Load Balance Sheet" color="primary" size="sm" outline @click="loadAccountSummary" />
            </template>
          </EmptyState>

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
              <KInput
                v-model="bsFilter"
                placeholder="Filter accounts…"
                icon="filter"
                class="filter-input-md"
              >
                <template #icon><DvFilterIcon /></template>
              </KInput>
            </template>
            <template v-slot:body-cell-db_total="props">
              <q-td :props="props" class="kdl-numeric text-right">{{ format(props.value) }}</q-td>
            </template>
          </q-table>
        </SectionCard>
      </div>

      <!-- ══════════════════════════════════════════════════════════
           TRIAL BALANCE TAB
      ══════════════════════════════════════════════════════════ -->
      <div v-show="tab === 'trail-balance'">
        <p class="dv-tab-hint">Journal-sourced trial balance. Balance to Date applies to ASSET, LIABILITY, and EQUITY accounts only. Recon view groups by tracking + account + period for comparison against Xero P&amp;L.</p>

        <SectionCard title="Trial Balance" description="Balance to Date is calculated for balance sheet accounts (ASSET, LIABILITY, EQUITY) only.">
          <PeriodFilter
            v-model:year="trailBalanceFilters.year"
            v-model:month="trailBalanceFilters.month"
            tab="trail-balance"
            :tenant="dataStore.selectedTenant"
            :loading="dataStore.loading"
            :extra-filters="trailBalanceExtraFilters"
            @load="loadTrailBalance"
            @clear="handleTrailBalanceClear"
            @restore="restoreTrailBalanceView"
          >
            <!-- Extra fields beyond year/month -->
            <KInput
              v-model="trailBalanceFilters.contact_name"
              label="Search Contact"
              placeholder="Contact name"
              debounce="300"
              class="filter-input-lg"
              icon="search"
            >
              <template #icon>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </template>
            </KInput>
            <KInput
              v-model="trailBalanceFilters.account_id"
              label="Account ID"
              class="filter-input-md"
            />
            <KInput
              v-model.number="trailBalanceFilters.limit"
              label="Limit"
              type="number"
              class="filter-input-sm"
            />
          </PeriodFilter>

          <!-- Freshness -->
          <div class="dv-freshness-row q-mb-sm">
            <FreshnessChip
              :value="trailBalanceLoadedAt"
              prefix="Loaded"
              :stale-after="60"
            />
            <button v-if="trailBalanceLoadedAt" class="dv-refresh-btn" :disabled="dataStore.loading" @click="loadTrailBalance" title="Re-fetch">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            </button>
            <span v-if="trailBalanceData" class="dv-count-caption">{{ trailBalanceData.count }} records</span>
          </div>

          <!-- Error state -->
          <KAlert
            v-if="trailBalanceError"
            variant="error"
            :title="trailBalanceError"
            class="q-mb-sm"
            dismissible
          />

          <!-- Empty state before first load -->
          <EmptyState
            v-if="!dataStore.trailBalance && !dataStore.loading"
            title="Trial balance not loaded"
            body="Set filters above and click Load to view trial balance data."
          >
            <template #cta>
              <q-btn label="Load Trial Balance" color="primary" size="sm" outline @click="loadTrailBalance" />
            </template>
          </EmptyState>

          <!-- RECON VIEW -->
          <q-table
            v-if="reconView && dataStore.trailBalance"
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
              <KInput
                v-model="tableFilter"
                placeholder="Filter results…"
                icon="filter"
                class="filter-input-md"
              >
                <template #icon><DvFilterIcon /></template>
              </KInput>
            </template>
            <template v-slot:body-cell-db_total="props">
              <q-td :props="props" class="kdl-numeric text-right">{{ format(props.value) }}</q-td>
            </template>
            <template v-slot:body-cell-xero_pnl="props">
              <q-td :props="props" class="kdl-numeric text-right">{{ props.value != null ? format(props.value) : '-' }}</q-td>
            </template>
            <template v-slot:body-cell-diff="props">
              <q-td :props="props" class="kdl-numeric text-right">
                <span v-if="props.value != null" :class="diffClass(props.value)" class="text-weight-semibold">{{ format(props.value) }}</span>
                <span v-else class="dv-null">-</span>
              </q-td>
            </template>
            <template v-slot:body-cell-match="props">
              <q-td :props="props">
                <StatusPill v-if="props.value === true" tone="success" label="OK" size="sm" />
                <StatusPill v-else-if="props.value === false" tone="error" label="DIFF" size="sm" />
                <span v-else class="dv-null">-</span>
              </q-td>
            </template>
          </q-table>

          <!-- DETAIL VIEW -->
          <q-table
            v-if="!reconView && dataStore.trailBalance"
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
              <KInput
                v-model="tableFilter"
                placeholder="Filter results…"
                icon="filter"
                class="filter-input-md"
              >
                <template #icon><DvFilterIcon /></template>
              </KInput>
            </template>
            <template v-slot:body-cell-debit="props">
              <q-td :props="props" class="kdl-numeric text-right">
                <span v-if="props.value != null && props.value != 0">{{ format(props.value) }}</span>
                <span v-else class="dv-null">-</span>
              </q-td>
            </template>
            <template v-slot:body-cell-credit="props">
              <q-td :props="props" class="kdl-numeric text-right">
                <span v-if="props.value != null && props.value != 0">{{ format(Math.abs(props.value)) }}</span>
                <span v-else class="dv-null">-</span>
              </q-td>
            </template>
            <template v-slot:body-cell-balance_to_date="props">
              <q-td :props="props" class="kdl-numeric text-right">{{ props.value != null ? format(props.value) : '-' }}</q-td>
            </template>
          </q-table>
        </SectionCard>
      </div>

      <!-- ══════════════════════════════════════════════════════════
           P&L SUMMARY TAB
      ══════════════════════════════════════════════════════════ -->
      <div v-show="tab === 'pnl-summary'">
        <p class="dv-tab-hint">P&amp;L income and expense grouped by tracking category and period. Compares DB journal totals against Xero P&amp;L report figures.</p>

        <SectionCard title="P&amp;L Summary by Tracking">
          <PeriodFilter
            v-model:year="pnlSummaryFilters.year"
            v-model:month="pnlSummaryFilters.month"
            tab="pnl-summary"
            :tenant="dataStore.selectedTenant"
            :loading="dataStore.loading"
            @load="loadPnlSummary"
            @clear="loadPnlSummary"
            @restore="restorePnlView"
          />

          <!-- Freshness -->
          <div class="dv-freshness-row q-mb-sm">
            <FreshnessChip
              :value="pnlSummaryLoadedAt"
              prefix="Loaded"
              :stale-after="60"
            />
            <button v-if="pnlSummaryLoadedAt" class="dv-refresh-btn" :disabled="dataStore.loading" @click="loadPnlSummary" title="Re-fetch">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            </button>
            <span v-if="pnlSummaryData" class="dv-count-caption">{{ pnlSummaryData.count }} tracking groups</span>
          </div>

          <!-- Error state -->
          <KAlert
            v-if="pnlSummaryError"
            variant="error"
            :title="pnlSummaryError"
            class="q-mb-sm"
            dismissible
          />

          <!-- Empty state -->
          <EmptyState
            v-if="!dataStore.pnlSummary && !dataStore.loading"
            title="P&amp;L summary not loaded"
            body="Set a period above and click Load to view P&amp;L data by tracking category."
          >
            <template #cta>
              <q-btn label="Load P&L Summary" color="primary" size="sm" outline @click="loadPnlSummary" />
            </template>
          </EmptyState>

          <q-table
            v-if="dataStore.pnlSummary"
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
              <KInput
                v-model="pnlTableFilter"
                placeholder="Filter…"
                icon="filter"
                class="filter-input-md"
              >
                <template #icon><DvFilterIcon /></template>
              </KInput>
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
              <q-td :props="props" class="kdl-numeric text-right">{{ props.value != null ? format(props.value) : '-' }}</q-td>
            </template>
            <template v-slot:body-cell-xero_expense="props">
              <q-td :props="props" class="kdl-numeric text-right">{{ props.value != null ? format(props.value) : '-' }}</q-td>
            </template>
            <template v-slot:body-cell-xero_pnl="props">
              <q-td :props="props" class="kdl-numeric text-right text-weight-semibold">{{ props.value != null ? format(props.value) : '-' }}</q-td>
            </template>
            <template v-slot:body-cell-pnl_diff="props">
              <q-td :props="props" class="kdl-numeric text-right">
                <span v-if="props.value != null" :class="diffClass(props.value)" class="text-weight-semibold">{{ format(props.value) }}</span>
                <span v-else class="dv-null">-</span>
              </q-td>
            </template>
          </q-table>
        </SectionCard>
      </div>

      <!-- ══════════════════════════════════════════════════════════
           LINE ITEMS TAB
      ══════════════════════════════════════════════════════════ -->
      <div v-show="tab === 'line-items'">
        <p class="dv-tab-hint">Individual journal line items. Filter by date range, period, or account to investigate specific transactions. Use when a DIFF badge in Summary needs investigating.</p>

        <SectionCard title="Line Items">
          <PeriodFilter
            v-model:year="lineItemsFilters.year"
            v-model:month="lineItemsFilters.month"
            tab="line-items"
            :tenant="dataStore.selectedTenant"
            :loading="dataStore.loading"
            :extra-filters="lineItemsExtraFilters"
            @load="loadLineItems"
            @clear="handleLineItemsClear"
            @restore="restoreLineItemsView"
          >
            <KInput
              v-model="lineItemsFilters.date_from"
              label="Date From"
              placeholder="YYYY-MM-DD"
              class="filter-input-lg"
            />
            <KInput
              v-model="lineItemsFilters.date_to"
              label="Date To"
              placeholder="YYYY-MM-DD"
              class="filter-input-lg"
            />
            <KInput
              v-model.number="lineItemsFilters.limit"
              label="Limit"
              type="number"
              class="filter-input-sm"
            />
          </PeriodFilter>

          <!-- Result count — below FilterBar, above table -->
          <div class="dv-freshness-row q-mb-sm">
            <FreshnessChip
              :value="lineItemsLoadedAt"
              prefix="Loaded"
              :stale-after="60"
            />
            <button v-if="lineItemsLoadedAt" class="dv-refresh-btn" :disabled="dataStore.loading" @click="loadLineItems" title="Re-fetch">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            </button>
            <span v-if="lineItemsData" class="dv-count-caption">
              Showing {{ lineItemsData.count }} of {{ lineItemsData.total_count }}
              ({{ lineItemsData.remaining }} remaining)
            </span>
          </div>

          <!-- Error state -->
          <KAlert
            v-if="lineItemsError"
            variant="error"
            :title="lineItemsError"
            class="q-mb-sm"
            dismissible
          />

          <!-- Empty state -->
          <EmptyState
            v-if="!dataStore.lineItems && !dataStore.loading"
            title="Line items not loaded"
            body="Set filters above and click Load to view journal line items."
          >
            <template #cta>
              <q-btn label="Load Line Items" color="primary" size="sm" outline @click="loadLineItems" />
            </template>
          </EmptyState>

          <q-table
            v-if="dataStore.lineItems"
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
                <span v-else class="dv-null">-</span>
              </q-td>
            </template>
            <template v-slot:body-cell-credit="props">
              <q-td :props="props" class="kdl-numeric text-right">
                <span v-if="props.value != null && props.value != 0">{{ format(Math.abs(props.value)) }}</span>
                <span v-else class="dv-null">-</span>
              </q-td>
            </template>
          </q-table>
        </SectionCard>
      </div>
    </template>
  </q-page>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDataStore } from '../stores/data';
import { useFormatCurrency } from '../composables/useFormatCurrency.js';
import PageHeader from '../components/klikk/PageHeader.vue';
import SectionCard from '../components/klikk/SectionCard.vue';
import EmptyState from '../components/klikk/EmptyState.vue';
import KInput from '../components/klikk/KInput.vue';
import KAlert from '../components/klikk/KAlert.vue';
import KTabs from '../components/klikk/KTabs.vue';
import MetricTile from '../components/klikk/MetricTile.vue';
import FreshnessChip from '../components/klikk/FreshnessChip.vue';
import StatusPill from '../components/klikk/StatusPill.vue';
import PersistentResultStrip from '../components/klikk/PersistentResultStrip.vue';
import TenantSelector from '../components/TenantSelector.vue';
import PeriodFilter from '../components/data-viewer/PeriodFilter.vue';
import DvFilterIcon from '../components/data-viewer/DvFilterIcon.vue';

const route = useRoute();
const router = useRouter();
const dataStore = useDataStore();
const { format } = useFormatCurrency();

// ── Tab setup ────────────────────────────────────────────────────────────────

const VALID_TABS = ['summary', 'trail-balance', 'pnl-summary', 'line-items', 'balance-sheet'];

function resolveTab(slug) {
  return VALID_TABS.includes(slug) ? slug : VALID_TABS[0];
}

const tab = ref(resolveTab(route.query.tab));

const dataTabs = [
  { name: 'summary',       label: 'Summary' },
  { name: 'trail-balance', label: 'Trial Balance' },
  { name: 'pnl-summary',   label: 'P&L Summary' },
  { name: 'line-items',    label: 'Line Items' },
  { name: 'balance-sheet', label: 'Balance Sheet' },
];

// ── Recon / view state ───────────────────────────────────────────────────────

const reconView = ref(false);
const tableFilter = ref('');
const pnlTableFilter = ref('');
const acctFilter = ref('');
const bsFilter = ref('');

// Ref to the account-filter input (for keyboard / shortcut)
const acctFilterInput = ref(null);

// ── Per-table freshness timestamps ───────────────────────────────────────────

const summaryLoadedAt = ref(null);
const acctSummaryLoadedAt = ref(null);
const trailBalanceLoadedAt = ref(null);
const pnlSummaryLoadedAt = ref(null);
const lineItemsLoadedAt = ref(null);

// ── Per-table error state ────────────────────────────────────────────────────

const pageError = ref(null);           // page-level strip (used for refreshSummary)
const acctSummaryError = ref(null);
const trailBalanceError = ref(null);
const pnlSummaryError = ref(null);
const lineItemsError = ref(null);

// ── Filter state ─────────────────────────────────────────────────────────────

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

// Extra filter objects passed to PeriodFilter for saved views.
const trailBalanceExtraFilters = computed(() => ({
  contact_name: trailBalanceFilters.contact_name,
  account_id: trailBalanceFilters.account_id,
  limit: trailBalanceFilters.limit,
}));

const lineItemsExtraFilters = computed(() => ({
  date_from: lineItemsFilters.date_from,
  date_to: lineItemsFilters.date_to,
  limit: lineItemsFilters.limit,
}));

// ── Saved view restore handlers ──────────────────────────────────────────────

function restoreAcctSummaryView(filters) {
  if (filters.year != null) acctSummaryFilters.year = filters.year;
  if (filters.month != null) acctSummaryFilters.month = filters.month;
  loadAccountSummary();
}

function restoreTrailBalanceView(filters) {
  if (filters.year != null) trailBalanceFilters.year = filters.year;
  if (filters.month != null) trailBalanceFilters.month = filters.month;
  if (filters.contact_name != null) trailBalanceFilters.contact_name = filters.contact_name;
  if (filters.account_id != null) trailBalanceFilters.account_id = filters.account_id;
  if (filters.limit != null) trailBalanceFilters.limit = filters.limit;
  loadTrailBalance();
}

function restorePnlView(filters) {
  if (filters.year != null) pnlSummaryFilters.year = filters.year;
  if (filters.month != null) pnlSummaryFilters.month = filters.month;
  loadPnlSummary();
}

function restoreLineItemsView(filters) {
  if (filters.year != null) lineItemsFilters.year = filters.year;
  if (filters.month != null) lineItemsFilters.month = filters.month;
  if (filters.date_from != null) lineItemsFilters.date_from = filters.date_from;
  if (filters.date_to != null) lineItemsFilters.date_to = filters.date_to;
  if (filters.limit != null) lineItemsFilters.limit = filters.limit;
  loadLineItems();
}

// ── Clear helpers (reset extra fields beyond year/month) ─────────────────────

function handleTrailBalanceClear() {
  trailBalanceFilters.contact_name = '';
  trailBalanceFilters.account_id = '';
  loadTrailBalance();
}

function handleLineItemsClear() {
  lineItemsFilters.date_from = '';
  lineItemsFilters.date_to = '';
  loadLineItems();
}

// ── Column definitions ────────────────────────────────────────────────────────

const accountSummaryColumns = [
  { name: 'account_code', label: 'Code',      field: 'account_code', align: 'left',   sortable: true },
  { name: 'account_name', label: 'Account',   field: 'account_name', align: 'left',   sortable: true },
  { name: 'account_type', label: 'Type',      field: 'account_type', align: 'left',   sortable: true },
  { name: 'db_total',     label: 'DB Total (R)',       field: 'db_total',   align: 'right',  sortable: true },
  { name: 'xero_total',   label: 'Xero P&L Total (R)', field: 'xero_total', align: 'right',  sortable: true },
  { name: 'diff',         label: 'Diff (R)',   field: 'diff',         align: 'right',  sortable: true },
  { name: 'in_balance',   label: 'Status',    field: 'in_balance',   align: 'center', sortable: true },
];

const bsAccountColumns = [
  { name: 'account_code', label: 'Code',      field: 'account_code', align: 'left',   sortable: true },
  { name: 'account_name', label: 'Account',   field: 'account_name', align: 'left',   sortable: true },
  { name: 'account_type', label: 'Type',      field: 'account_type', align: 'left',   sortable: true },
  { name: 'db_total',     label: 'DB Total (R)', field: 'db_total',  align: 'right',  sortable: true },
];

const trailBalanceColumns = [
  { name: 'year',           label: 'Year',    field: 'year',           align: 'left',  sortable: true },
  { name: 'month',          label: 'Month',   field: 'month',          align: 'left',  sortable: true },
  { name: 'account_code',   label: 'Code',    field: 'account_code',   align: 'left',  sortable: true },
  { name: 'account_name',   label: 'Account', field: 'account_name',   align: 'left',  sortable: true },
  { name: 'contact_name',   label: 'Contact', field: 'contact_name',   align: 'left',  sortable: true },
  { name: 'tracking1',      label: 'Tracking 1', field: 'tracking1',   align: 'left',  sortable: true },
  { name: 'tracking2',      label: 'Tracking 2', field: 'tracking2',   align: 'left',  sortable: true },
  { name: 'debit',          label: 'Debit (R)',  field: 'debit',        align: 'right', sortable: true },
  { name: 'credit',         label: 'Credit (R)', field: 'credit',       align: 'right', sortable: true },
  { name: 'balance_to_date',label: 'Balance to Date BS (R)', field: 'balance_to_date', align: 'right', sortable: true },
];

const reconColumns = [
  { name: 'year',         label: 'Year',       field: 'year',         align: 'left',  sortable: true },
  { name: 'month',        label: 'Month',      field: 'month',        align: 'left',  sortable: true },
  { name: 'account_code', label: 'Code',       field: 'account_code', align: 'left',  sortable: true },
  { name: 'account_name', label: 'Account',    field: 'account_name', align: 'left',  sortable: true },
  { name: 'tracking1',    label: 'Tracking 1', field: 'tracking1',    align: 'left',  sortable: true },
  { name: 'db_total',     label: 'DB Total (R)',  field: 'db_total',  align: 'right', sortable: true },
  { name: 'xero_pnl',    label: 'Xero P&L (R)',  field: 'xero_pnl',  align: 'right', sortable: true },
  { name: 'diff',         label: 'Diff (R)',   field: 'diff',         align: 'right', sortable: true },
  { name: 'match',        label: 'Match',      field: 'match',        align: 'center', sortable: true },
];

const pnlSummaryColumns = [
  { name: 'tracking1',   label: 'Tracking',         field: 'tracking1',   align: 'left',  sortable: true },
  { name: 'year',        label: 'Year',             field: 'year',        align: 'left',  sortable: true },
  { name: 'month',       label: 'Month',            field: 'month',       align: 'left',  sortable: true },
  { name: 'db_income',   label: 'DB Income (R)',    field: 'db_income',   align: 'right', sortable: true },
  { name: 'db_expense',  label: 'DB Expense (R)',   field: 'db_expense',  align: 'right', sortable: true },
  { name: 'db_pnl',     label: 'DB P&L (R)',       field: 'db_pnl',      align: 'right', sortable: true },
  { name: 'xero_income', label: 'Xero Income (R)',  field: 'xero_income', align: 'right', sortable: true },
  { name: 'xero_expense',label: 'Xero Expense (R)', field: 'xero_expense',align: 'right', sortable: true },
  { name: 'xero_pnl',   label: 'Xero P&L (R)',     field: 'xero_pnl',    align: 'right', sortable: true },
  { name: 'pnl_diff',   label: 'P&L Diff (R)',     field: 'pnl_diff',    align: 'right', sortable: true },
];

const lineItemsColumns = [
  { name: 'date',                    label: 'Date',        field: 'date',                    align: 'left',  sortable: true },
  { name: 'account_code',            label: 'Code',        field: 'account_code',            align: 'left',  sortable: true },
  { name: 'account_name',            label: 'Account',     field: 'account_name',            align: 'left',  sortable: true },
  { name: 'contact_name',            label: 'Contact',     field: 'contact_name',            align: 'left',  sortable: true },
  { name: 'description',             label: 'Description', field: 'description',             align: 'left' },
  { name: 'debit',                   label: 'Debit (R)',   field: 'debit',                   align: 'right', sortable: true },
  { name: 'credit',                  label: 'Credit (R)',  field: 'credit',                  align: 'right', sortable: true },
  { name: 'transaction_source_type', label: 'Source',      field: 'transaction_source_type', align: 'left',  sortable: true },
];

// ── Computed rows ─────────────────────────────────────────────────────────────

const trailBalanceRows = computed(() => {
  const results = dataStore.trailBalance?.results || [];
  return results.map((r) => ({
    ...r,
    debit:  r.debit  != null ? Number(r.debit)  : null,
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
        _key:         key,
        year:         r.year,
        month:        r.month,
        account_code: r.account_code,
        account_name: r.account_name,
        tracking1:    r.tracking1,
        db_total:     0,
        xero_pnl:     r.xero_pnl != null ? Number(r.xero_pnl) : null,
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
      g.diff  = Math.round((g.xero_pnl - g.db_total) * 100) / 100;
      g.match = Math.abs(g.diff) < 0.01;
    } else {
      g.diff  = null;
      g.match = null;
    }
    return g;
  }).sort((a, b) => {
    if (a.year  !== b.year)  return a.year  - b.year;
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

const pnlSummaryData  = computed(() => dataStore.pnlSummary);
const trailBalanceData = computed(() => dataStore.trailBalance);

const lineItemsRows = computed(() => {
  const results = dataStore.lineItems?.results || [];
  return results.map((r) => ({
    ...r,
    debit:  r.debit  != null ? Number(r.debit)  : null,
    credit: r.credit != null ? Number(r.credit) : null,
  }));
});

const lineItemsData = computed(() => dataStore.lineItems);

// ── Summary display helpers ───────────────────────────────────────────────────

/**
 * Backend doesn't yet expose latest_period or last_sync_at on the summary
 * endpoint. These fall back gracefully to '—' via MetricTile's null handling.
 * PRIMITIVE GAP NOTE: expose `latest_period_label` and `last_sync_at` from the
 * summary API so MetricTile can surface real operational coverage data.
 */
const latestPeriodLabel = computed(() => {
  return dataStore.summary?.latest_period_label ?? null;
});

const lastSyncLabel = computed(() => {
  return dataStore.summary?.last_sync_at ?? null;
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * diffClass — used only on explicit variance/diff columns.
 * Red means the two sides don't match, green means they do.
 * This is the only place colour carries semantic load (ADR §3).
 */
function diffClass(val) {
  if (val === null || val === undefined) return 'dv-null';
  const n = Number(val);
  if (Math.abs(n) < 0.01) return 'text-positive';
  return 'text-negative';
}

/**
 * DIFF badge drill-down: navigate to Line Items tab filtered to the account.
 * Uses query params so state is URL-shareable without a new store.
 */
function drillToLineItems(row) {
  tab.value = 'line-items';
  lineItemsFilters.year       = acctSummaryFilters.year  || trailBalanceFilters.year  || null;
  lineItemsFilters.month      = acctSummaryFilters.month || trailBalanceFilters.month || null;
  lineItemsFilters.date_from  = '';
  lineItemsFilters.date_to    = '';
  // account_id isn't a line-items filter in the current API, but we set limit so
  // the load is narrower. If the backend gains account_id filtering, wire it here.
  lineItemsFilters.limit = 5000;
  loadLineItems();
  router.replace({ query: { ...route.query, tab: 'line-items', account: row.account_code } });
}

// ── Keyboard shortcuts ─────────────────────────────────────────────────────────

function handleKeydown(e) {
  // "/" → focus the active tab's filter input
  if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
    e.preventDefault();
    // Focus the filter input of the visible table (all use the same ref approach;
    // Quasar q-table top-right inputs aren't directly ref-able, so we query the DOM)
    const input = document.querySelector('.q-table__top-right .kinput-field');
    if (input) input.focus();
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
  if (dataStore.selectedTenant) {
    Promise.all([dataStore.fetchSummary(), dataStore.fetchAccountSummary()])
      .then(() => {
        summaryLoadedAt.value = new Date();
        acctSummaryLoadedAt.value = new Date();
      })
      .catch((err) => {
        pageError.value = err?.message || 'Failed to load summary';
      });
  }

  // Restore DIFF drill-down query param if arriving from a DIFF click
  if (route.query.tab) {
    tab.value = resolveTab(route.query.tab);
  }
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});

// ── Data loaders with try/catch ───────────────────────────────────────────────

async function refreshSummary() {
  pageError.value = null;
  try {
    await Promise.all([dataStore.fetchSummary(), loadAccountSummary()]);
    summaryLoadedAt.value = new Date();
  } catch (err) {
    pageError.value = err?.message || 'Refresh failed';
  }
}

async function loadAccountSummary() {
  acctSummaryError.value = null;
  const filters = {};
  if (acctSummaryFilters.year)  filters.year  = acctSummaryFilters.year;
  if (acctSummaryFilters.month) filters.month = acctSummaryFilters.month;
  try {
    await dataStore.fetchAccountSummary(filters);
    acctSummaryLoadedAt.value = new Date();
  } catch (err) {
    acctSummaryError.value = err?.message || 'Failed to load account summary';
  }
}

async function loadTrailBalance() {
  trailBalanceError.value = null;
  const filters = {};
  if (trailBalanceFilters.year)         filters.year         = trailBalanceFilters.year;
  if (trailBalanceFilters.month)        filters.month        = trailBalanceFilters.month;
  if (trailBalanceFilters.account_id)   filters.account_id   = trailBalanceFilters.account_id;
  if (trailBalanceFilters.contact_name) filters.contact_name = trailBalanceFilters.contact_name;
  if (trailBalanceFilters.limit)        filters.limit        = trailBalanceFilters.limit;
  try {
    await dataStore.fetchTrailBalance(filters);
    trailBalanceLoadedAt.value = new Date();
  } catch (err) {
    trailBalanceError.value = err?.message || 'Failed to load trial balance';
  }
}

async function loadPnlSummary() {
  pnlSummaryError.value = null;
  const filters = {};
  if (pnlSummaryFilters.year)  filters.year  = pnlSummaryFilters.year;
  if (pnlSummaryFilters.month) filters.month = pnlSummaryFilters.month;
  try {
    await dataStore.fetchPnlSummary(filters);
    pnlSummaryLoadedAt.value = new Date();
  } catch (err) {
    pnlSummaryError.value = err?.message || 'Failed to load P&L summary';
  }
}

async function loadLineItems() {
  lineItemsError.value = null;
  const filters = {};
  if (lineItemsFilters.date_from) filters.date_from = lineItemsFilters.date_from;
  if (lineItemsFilters.date_to)   filters.date_to   = lineItemsFilters.date_to;
  if (lineItemsFilters.year)      filters.year      = lineItemsFilters.year;
  if (lineItemsFilters.month)     filters.month     = lineItemsFilters.month;
  if (lineItemsFilters.limit)     filters.limit     = lineItemsFilters.limit;
  try {
    await dataStore.fetchLineItems(filters);
    lineItemsLoadedAt.value = new Date();
  } catch (err) {
    lineItemsError.value = err?.message || 'Failed to load line items';
  }
}
</script>

<style scoped>
/* ── Size helpers ──────────────────────────────────────────────────────────── */
.filter-input-sm  { min-width: 110px; max-width: 130px; }
.filter-input-md  { min-width: 180px; max-width: 220px; }
.filter-input-lg  { min-width: 200px; }

/* ── Null/empty placeholder ────────────────────────────────────────────────── */
.dv-null {
  color: var(--kdl-text-hint);
}

/* ── Tab toolbar row (tabs + recon segmented control) ──────────────────────── */
.dv-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.dv-toolbar__recon {
  display: inline-flex;
  border: 1px solid var(--kdl-border);
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
}

.dv-seg-btn {
  border: none;
  background: transparent;
  font-size: 13px;
  font-weight: 500;
  color: var(--kdl-text-muted);
  padding: 5px 14px;
  cursor: pointer;
  transition: background 150ms, color 150ms;
}

.dv-seg-btn + .dv-seg-btn {
  border-left: 1px solid var(--kdl-border);
}

.dv-seg-btn--active {
  background: var(--kdl-accent);
  color: #fff;
}

.dv-seg-btn:not(.dv-seg-btn--active):hover {
  background: var(--kdl-hover-bg);
  color: var(--kdl-text-primary);
}

/* ── Tab hint caption ──────────────────────────────────────────────────────── */
.dv-tab-hint {
  font-size: 13px;
  color: var(--kdl-text-muted);
  margin: 0 0 12px;
  line-height: 1.5;
}

/* ── Freshness row ─────────────────────────────────────────────────────────── */
.dv-freshness-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ── Refresh icon button ───────────────────────────────────────────────────── */
.dv-refresh-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--kdl-text-hint);
  cursor: pointer;
  padding: 3px;
  border-radius: 4px;
  transition: color 150ms, background 150ms;
}

.dv-refresh-btn:hover:not(:disabled) {
  color: var(--kdl-text-primary);
  background: var(--kdl-hover-bg);
}

.dv-refresh-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ── Count caption (records, groups) ───────────────────────────────────────── */
.dv-count-caption {
  font-size: 12px;
  color: var(--kdl-text-muted);
  margin-left: 4px;
}

/* ── Operational metrics row ───────────────────────────────────────────────── */
.dv-metrics-row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}

/* ── Reconciliation diagnostics definition list ───────────────────────────── */
.dv-diag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0 24px;
  margin: 0;
  padding: 0;
}

.dv-diag-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 0;
  min-width: 160px;
}

.dv-diag-term {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--kdl-text-hint);
  margin: 0;
}

.dv-diag-def {
  font-size: 14px;
  font-weight: 500;
  color: var(--kdl-text-primary);
  margin: 0;
}

.dv-diag-meta {
  font-size: 12px;
  font-weight: 400;
  color: var(--kdl-text-muted);
  margin-left: 4px;
}

/* ── Income Statement status pill row ─────────────────────────────────────── */
.dv-is-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.dv-is-info {
  display: inline-flex;
  align-items: center;
  color: var(--kdl-text-hint);
  cursor: help;
  border-radius: 4px;
  padding: 1px;
}

.dv-is-info:focus-visible {
  outline: 2px solid var(--kdl-accent);
  outline-offset: 2px;
}

/* ── DIFF drill-down button ────────────────────────────────────────────────── */
.dv-diff-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 0;
  display: inline-flex;
  border-radius: 6px;
  transition: box-shadow 150ms;
}

.dv-diff-btn:hover {
  box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.2);
}

.dv-diff-btn:focus-visible {
  outline: 2px solid var(--kdl-accent);
  outline-offset: 2px;
}

/* ── Screen reader only ────────────────────────────────────────────────────── */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
</style>
