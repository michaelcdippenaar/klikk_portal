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

    <div class="fi-layout" :class="{ 'fi-layout--shares-collapsed': shareMenuCollapsed }">
      <!-- Left: Watchlist -->
      <div class="fi-layout__left" :class="{ 'fi-layout__left--collapsed': shareMenuCollapsed }">
        <div v-if="shareMenuCollapsed" class="fi-share-rail">
          <button
            class="fi-share-rail__button"
            aria-label="Expand share menu"
            title="Expand share menu"
            @click="shareMenuCollapsed = false"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><polyline points="3 8 5 12 3 16"/></svg>
          </button>
        </div>

        <SectionCard v-else>
          <template #actions>
            <!-- Column visibility toggle via KTable's showVisibilityMenu -->
          </template>
          <div class="fi-share-panel-header">
            <div>
              <div class="section-header">Shares</div>
              <span class="text-muted">Toggle columns to show</span>
            </div>
            <button
              class="btn btn-ghost btn-sm fi-share-panel-header__button"
              aria-label="Collapse share menu"
              title="Collapse share menu"
              @click="shareMenuCollapsed = true"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
          </div>
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

          <FinancialLineChart
            v-if="chartLabels.length"
            :labels="chartLabels"
            :data="chartData"
            :markers="chartMarkers"
            :highlighted-marker-key="highlightedChartMarkerKey"
            class="fi-chart"
          />
          <div v-if="chartMarkerLegend.length" class="fi-chart-legend" aria-label="Events shown on chart">
            <span v-for="item in chartMarkerLegend" :key="item.type" class="fi-chart-legend__item">
              <span class="fi-chart-legend__marker" :class="`fi-chart-legend__marker--${item.type}`" aria-hidden="true"></span>
              {{ item.count }} {{ item.label }}{{ item.count === 1 ? '' : 's' }}
            </span>
          </div>

          <!-- Tabs -->
          <KTabs
            :tabs="[
              { name: 'overview', label: 'Overview' },
              { name: 'prices', label: 'Prices' },
              { name: 'trends', label: 'Trends' },
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

            <!-- Overview -->
            <template v-if="detailTab === 'overview'">
              <div class="fi-overview">
                <div class="fi-overview__metrics" aria-label="Selected share summary">
                  <div class="fi-overview__metric">
                    <span>Last close</span>
                    <strong>{{ formatOptionalNumber(overviewMetrics.close) }}</strong>
                    <small>{{ overviewMetrics.to }}</small>
                  </div>
                  <div class="fi-overview__metric">
                    <span>Window return</span>
                    <strong :class="impactClass(overviewMetrics.windowReturn)">{{ formatSignedPct(overviewMetrics.windowReturn) }}</strong>
                    <small>{{ overviewMetrics.from }} to {{ overviewMetrics.to }}</small>
                  </div>
                  <div class="fi-overview__metric">
                    <span>High close</span>
                    <strong>{{ formatOptionalNumber(overviewMetrics.high) }}</strong>
                    <small>Low {{ formatOptionalNumber(overviewMetrics.low) }} · {{ overviewMetrics.rows.toLocaleString() }} rows</small>
                  </div>
                  <div class="fi-overview__metric">
                    <span>Latest volume</span>
                    <strong>{{ formatInteger(overviewMetrics.volume) }}</strong>
                    <small>{{ selectedPeriod === 'ALL' ? 'All history' : selectedPeriod }}</small>
                  </div>
                </div>

                <div class="fi-overview__body">
                  <div class="fi-overview__section">
                    <div class="fi-overview__section-head">
                      <div class="section-header">Visible markers</div>
                      <button class="btn btn-ghost btn-sm" @click="detailTab = 'prices'">Open prices</button>
                    </div>
                    <div v-if="chartMarkerLegend.length" class="fi-overview__marker-list">
                      <span v-for="item in chartMarkerLegend" :key="`overview:${item.type}`" class="fi-overview__marker-item">
                        <span class="fi-chart-legend__marker" :class="`fi-chart-legend__marker--${item.type}`" aria-hidden="true"></span>
                        {{ item.count }} {{ item.label }}{{ item.count === 1 ? '' : 's' }}
                      </span>
                    </div>
                    <p v-else class="text-muted fi-overview__empty">No markers in the selected chart window.</p>
                  </div>

                  <div class="fi-overview__section">
                    <div class="fi-overview__section-head">
                      <div class="section-header">Event reaction</div>
                      <button class="btn btn-ghost btn-sm" @click="detailTab = 'trends'">Open trends</button>
                    </div>
                    <div v-if="overviewEventRows.length" class="fi-overview__events">
                      <a
                        v-for="row in overviewEventRows"
                        :key="`overview:${row.markerKey}`"
                        class="fi-overview__event"
                        :class="{ 'fi-overview__event--active': highlightedChartMarkerKey === row.markerKey }"
                        :href="row.link || undefined"
                        :target="row.link ? '_blank' : undefined"
                        :rel="row.link ? 'noopener' : undefined"
                        @mouseenter="highlightedChartMarkerKey = row.markerKey"
                        @mouseleave="highlightedChartMarkerKey = ''"
                        @focus="highlightedChartMarkerKey = row.markerKey"
                        @blur="highlightedChartMarkerKey = ''"
                      >
                        <span>{{ row.date }}</span>
                        <strong>{{ row.title }}</strong>
                        <span :class="impactClass(row.fiveDayPct)">{{ formatSignedPct(row.fiveDayPct) }}</span>
                      </a>
                    </div>
                    <p v-else class="text-muted fi-overview__empty">No dated news or market events in this window.</p>
                  </div>
                </div>
              </div>
            </template>

            <!-- Prices -->
            <template v-else-if="detailTab === 'prices'">
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

            <!-- Trends -->
            <template v-else-if="detailTab === 'trends'">
              <div v-if="newsTrendAnalysis" class="fi-news-impact">
                <div class="fi-news-impact__header">
                  <div>
                    <div class="section-header">News trend analysis</div>
                    <p class="text-muted fi-news-impact__subtitle">News and major market markers are plotted on the chart and measured against the next trading closes.</p>
                  </div>
                  <div class="fi-news-impact__actions">
                    <button class="btn btn-ghost btn-sm" :disabled="vectorizingArticles" @click="vectorizeSelectedArticles">
                      {{ vectorizingArticles ? 'Vectorising…' : 'Vectorise articles' }}
                    </button>
                    <span class="fi-news-impact__badge" :class="`fi-news-impact__badge--${newsTrendAnalysis.tone}`">
                      {{ newsTrendAnalysis.label }}
                    </span>
                  </div>
                </div>
                <div
                  v-if="articleVectorResult"
                  class="klikk-alert-strip fi-result-strip"
                  :class="articleVectorResult.vectorize_error ? 'tone-error' : 'tone-success'"
                >
                  {{ articleVectorResult.vectorize_error
                    ? `Prepared ${articleVectorResult.documents_written ?? 0} article document(s), but vectorising failed: ${articleVectorResult.vectorize_error}`
                    : `Vectorised ${articleVectorResult.documents_written ?? 0} article document(s) into ${articleVectorResult.corpus_slug}. ${articleVectorResult.chunks_written ?? 0} new chunk(s).` }}
                </div>
                <div class="fi-news-impact__summary">
                  <span>{{ newsTrendAnalysis.summary }}</span>
                  <span>{{ newsTrendAnalysis.newsSummary }}</span>
                  <span>{{ newsTrendAnalysis.strongestSummary }}</span>
                </div>
                <div v-if="newsImpactRows.length" class="fi-news-impact__table" aria-label="News price impact">
                  <div class="fi-news-impact__row fi-news-impact__row--head">
                    <span>Date</span>
                    <span>Event</span>
                    <span>1D</span>
                    <span>5D</span>
                  </div>
                  <a
                    v-for="row in newsImpactRows.slice(0, 5)"
                    :key="row.markerKey"
                    class="fi-news-impact__row"
                    :class="{ 'fi-news-impact__row--active': highlightedChartMarkerKey === row.markerKey }"
                    :href="row.link || undefined"
                    :target="row.link ? '_blank' : undefined"
                    :rel="row.link ? 'noopener' : undefined"
                    @mouseenter="highlightedChartMarkerKey = row.markerKey"
                    @mouseleave="highlightedChartMarkerKey = ''"
                    @focus="highlightedChartMarkerKey = row.markerKey"
                    @blur="highlightedChartMarkerKey = ''"
                  >
                    <span>{{ row.date }}</span>
                    <span>
                      <strong>{{ row.title }}</strong>
                      <small v-if="row.publisher">{{ row.publisher }}</small>
                    </span>
                    <span :class="impactClass(row.oneDayPct)">{{ formatSignedPct(row.oneDayPct) }}</span>
                    <span :class="impactClass(row.fiveDayPct)">{{ formatSignedPct(row.fiveDayPct) }}</span>
                  </a>
                </div>
                <div class="fi-market-events" aria-label="Major market events tracked">
                  <div class="section-header">Major market events tracked</div>
                  <div class="fi-market-events__list">
                    <a
                      v-for="event in marketEventRows"
                      :key="event.slug"
                      class="fi-market-events__item"
                      :href="event.link || undefined"
                      :target="event.link ? '_blank' : undefined"
                      :rel="event.link ? 'noopener' : undefined"
                    >
                      <span class="fi-market-events__date">{{ event.date }}</span>
                      <span>
                        <strong>{{ event.title }}</strong>
                        <small>{{ event.scope }} · {{ event.publisher }} · {{ event.inWindow ? 'visible in chart' : 'outside current price history' }}</small>
                      </span>
                      <span :class="impactClass(event.fiveDayPct)">{{ formatSignedPct(event.fiveDayPct) }}</span>
                    </a>
                  </div>
                </div>
              </div>
              <p v-else class="text-muted">No trend analysis available for the selected chart window.</p>
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
              >
                <template #cell-date="{ row }">
                  {{ row.date || row.paid_on || '—' }}
                </template>
                <template #cell-paid_on="{ value }">
                  {{ value || '—' }}
                </template>
                <template #cell-amount="{ value, row }">
                  <span class="fi-num">{{ formatDividendAmount(value, row.currency) }}</span>
                </template>
                <template #cell-yield_pct="{ value }">
                  <span class="fi-num">{{ formatDividendYield(value) }}</span>
                </template>
                <template #cell-price_on_date="{ value }">
                  <span class="fi-num">{{ formatOptionalNumber(value) }}</span>
                </template>
              </KTable>
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
              <div v-else-if="companyProfile.hasData" class="fi-company-profile">
                <div v-if="companyProfile.summary" class="fi-company-profile__summary">
                  {{ companyProfile.summary }}
                </div>
                <div class="fi-fact-grid">
                  <div v-for="fact in companyProfile.facts" :key="fact.label" class="fi-fact">
                    <span>{{ fact.label }}</span>
                    <strong>{{ fact.value }}</strong>
                  </div>
                </div>
                <div v-if="companyProfile.officers.length" class="fi-stmt">
                  <div class="section-header fi-stmt__title">Leadership</div>
                  <div class="fi-data-table-wrap">
                    <table class="fi-data-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Role</th>
                          <th class="text-right">Pay</th>
                          <th class="text-right">Year</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="officer in companyProfile.officers" :key="`${officer.name}:${officer.title}`">
                          <td>{{ officer.name || '—' }}</td>
                          <td>{{ officer.title || '—' }}</td>
                          <td class="text-right">{{ formatLargeNumber(officer.totalPay) }}</td>
                          <td class="text-right">{{ officer.fiscalYear || '—' }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              <p v-else class="text-muted">No company info. Click "Refresh extra data" to fetch.</p>
            </template>

            <!-- Financials -->
            <template v-else-if="detailTab === 'financials'">
              <KSelect v-model="financialsFreq" label="" :options="['yearly', 'quarterly', 'trailing']" class="fi-freq-select" @update:model-value="loadFinancials" />
              <div v-if="loadingExtra.financials" class="text-muted">Loading…</div>
              <div v-else-if="parsedFinancialStatements.length" class="fi-statement-stack">
                <div v-for="stmt in parsedFinancialStatements" :key="stmt.key" class="fi-stmt">
                  <div class="fi-stmt__head">
                    <div>
                      <div class="section-header fi-stmt__title">{{ stmt.title }}</div>
                      <div class="text-muted">{{ stmt.subtitle }}</div>
                    </div>
                    <span class="fi-stmt__count">{{ stmt.rows.length }} line items</span>
                  </div>
                  <div class="fi-data-table-wrap">
                    <table class="fi-data-table">
                      <thead>
                        <tr>
                          <th>{{ stmt.labelHeader }}</th>
                          <th v-for="column in stmt.columns" :key="column.key" class="text-right">{{ column.label }}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="row in stmt.rows" :key="row.key">
                          <th scope="row" :title="row.rawLabel">{{ row.label }}</th>
                          <td v-for="column in stmt.columns" :key="`${row.key}:${column.key}`" class="text-right">
                            {{ formatFinancialCell(row.values[column.key], row.rawLabel) }}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              <p v-else class="text-muted">No financial statements. Click "Refresh extra data" to fetch.</p>
            </template>

            <!-- Earnings -->
            <template v-else-if="detailTab === 'earnings'">
              <KSelect v-model="earningsFreq" label="" :options="['yearly', 'quarterly', 'trailing']" class="fi-freq-select" @update:model-value="loadEarnings" />
              <div v-if="loadingExtra.earnings" class="text-muted">Loading…</div>
              <div v-else-if="parsedEarningsReports.length || parsedEarningsEstimate" class="fi-statement-stack">
                <div v-for="report in parsedEarningsReports" :key="report.key" class="fi-stmt">
                  <div class="fi-stmt__head">
                    <div>
                      <div class="section-header fi-stmt__title">{{ report.title }}</div>
                      <div class="text-muted">{{ report.subtitle }}</div>
                    </div>
                    <span class="fi-stmt__count">{{ report.rows.length }} rows</span>
                  </div>
                  <div class="fi-data-table-wrap">
                    <table class="fi-data-table">
                      <thead>
                        <tr>
                          <th>{{ report.labelHeader }}</th>
                          <th v-for="column in report.columns" :key="column.key" class="text-right">{{ column.label }}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="row in report.rows" :key="row.key">
                          <th scope="row" :title="row.rawLabel">{{ row.label }}</th>
                          <td v-for="column in report.columns" :key="`${row.key}:${column.key}`" class="text-right">
                            {{ formatFinancialCell(row.values[column.key], row.rawLabel) }}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
                <div v-if="parsedEarningsEstimate" class="fi-stmt">
                  <div class="fi-stmt__head">
                    <div>
                      <div class="section-header fi-stmt__title">Earnings estimate</div>
                      <div class="text-muted">{{ parsedEarningsEstimate.subtitle }}</div>
                    </div>
                    <span class="fi-stmt__count">{{ parsedEarningsEstimate.rows.length }} rows</span>
                  </div>
                  <div class="fi-data-table-wrap">
                    <table class="fi-data-table">
                      <thead>
                        <tr>
                          <th>{{ parsedEarningsEstimate.labelHeader }}</th>
                          <th v-for="column in parsedEarningsEstimate.columns" :key="column.key" class="text-right">{{ column.label }}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="row in parsedEarningsEstimate.rows" :key="row.key">
                          <th scope="row" :title="row.rawLabel">{{ row.label }}</th>
                          <td v-for="column in parsedEarningsEstimate.columns" :key="`${row.key}:${column.key}`" class="text-right">
                            {{ formatFinancialCell(row.values[column.key], row.rawLabel) }}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              <p v-else class="text-muted">No earnings data. Click "Refresh extra data" to fetch.</p>
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
  getFinancialInvestmentsBuyTransactions,
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
  vectorizeFinancialInvestmentsArticles,
  getFinancialInvestmentsWatchlistPreference,
  saveFinancialInvestmentsWatchlistPreference,
  getDividendCalendar,
} from '../api/endpoints.js';

const symbols = ref([]);
const loadingSymbols = ref(false);
const addingSymbol = ref(false);
const SHARE_MENU_COLLAPSED_KEY = 'klikk:financial-investments:share-menu-collapsed';
const shareMenuCollapsed = ref(loadShareMenuCollapsed());

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
  { key: '5Y', label: '5Y', days: 365 * 5 },
  { key: 'ALL', label: 'All', all: true },
];
const selectedPeriod = ref('3M');

const MAJOR_MARKET_EVENTS = [
  {
    slug: 'who-covid-pandemic',
    type: 'market',
    date: '2020-03-11',
    title: 'WHO characterises COVID-19 as a pandemic',
    publisher: 'WHO',
    scope: 'global macro',
    link: 'https://www.who.int/europe/emergencies/situations/covid-19',
    summary: 'Global risk marker for liquidity, consumer demand, supply chains, interest rates and market volatility.',
  },
  {
    slug: 'south-africa-lockdown',
    type: 'market',
    date: '2020-03-23',
    title: 'South Africa nationwide lockdown announced',
    publisher: 'SA Government',
    scope: 'South Africa macro',
    link: 'https://www.sanews.gov.za/south-africa/president-ramaphosa-announces-nationwide-lockdown',
    summary: 'Local JSE marker for consumer activity, logistics, employment and earnings expectations.',
  },
  {
    slug: 'trump-reciprocal-tariffs',
    type: 'market',
    date: '2025-04-02',
    title: 'Trump reciprocal tariffs announced',
    publisher: 'White House',
    scope: 'global trade',
    link: 'https://www.whitehouse.gov/presidential-actions/2025/04/regulating-imports-with-a-reciprocal-tariff-to-rectify-trade-practices-that-contribute-to-large-and-persistent-annual-united-states-goods-trade-deficits/',
    summary: 'Global trade marker for import costs, exporters, retailers, commodity demand, currency moves and broad risk appetite.',
  },
];

const chartLabels = computed(() => history.value.map((h) => h.date));
const chartData   = computed(() => history.value.map((h) => h.close));
const visibleHistoryRange = computed(() => {
  const times = chartLabels.value
    .map((date) => toChartDateTime(date))
    .filter((time) => time != null);
  if (!times.length) return null;
  return {
    start: Math.min(...times),
    end: Math.max(...times),
  };
});
const visibleBuyTransactions = computed(() => {
  const range = visibleHistoryRange.value;
  if (!range) return [];
  return buyTransactions.value.filter((transaction) => {
    const time = toChartDateTime(transaction.date);
    return time != null && time >= range.start && time <= range.end;
  });
});
const chartBuyPriceScale = computed(() => {
  const closeValues = chartData.value.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  const buyPrices = visibleBuyTransactions.value
    .map((transaction) => Number(transaction.price))
    .filter((price) => Number.isFinite(price) && price > 0)
    .sort((a, b) => a - b);
  if (!closeValues.length || !buyPrices.length) return 1;

  const medianClose = closeValues[Math.floor(closeValues.length / 2)];
  const medianBuy = buyPrices[Math.floor(buyPrices.length / 2)];
  return medianClose > 10 && medianBuy * 20 < medianClose ? 100 : 1;
});

function tradeMarkerType(transaction) {
  if (transaction.source === 'portfolio') return 'buy';
  const type = String(transaction.type || transaction.transaction_type || '').toLowerCase();
  return ['sell', 'sale', 'sold'].includes(type)
    ? 'sell'
    : 'buy';
}

const chartBuyMarkers = computed(() => visibleBuyTransactions.value.map((transaction) => ({
  type: tradeMarkerType(transaction),
  date: transaction.date,
  price: transaction.price != null ? Number(transaction.price) * chartBuyPriceScale.value : transaction.price,
  display_price: transaction.price,
  quantity: transaction.quantity,
  share_name: transaction.share_name,
  transaction_type: transaction.type,
  source: transaction.source,
  description: transaction.description,
})));
const dividendMarkerEvents = computed(() => {
  const seenDates = new Set();
  const events = [];

  for (const event of dividendCalendarEvents.value) {
    const declarationDate = dateOnly(event.declaration_date);
    const exDate = dateOnly(event.ex_dividend_date);
    const paymentDate = dateOnly(event.payment_date);
    const date = declarationDate || exDate || paymentDate;
    if (!date || seenDates.has(date)) continue;
    seenDates.add(date);
    events.push({
      type: 'dividend',
      date,
      dateLabel: declarationDate ? 'Declared' : exDate ? 'Ex-date' : 'Payment',
      amount: event.amount,
      currency: event.currency,
      yield_pct: event.yield_pct ?? event.dividend_yield_pct ?? event.dividend_yield,
      price_on_date: event.price_on_date ?? event.closing_price,
    });
  }

  for (const dividend of dividends.value) {
    const date = dateOnly(dividend.date || dividend.paid_on);
    if (!date || seenDates.has(date)) continue;
    seenDates.add(date);
    events.push({
      type: 'dividend',
      date,
      dateLabel: 'Paid',
      amount: dividend.amount,
      currency: dividend.currency,
      yield_pct: dividend.yield_pct,
      price_on_date: dividend.price_on_date,
    });
  }

  return events;
});
const chartDividendMarkers = computed(() => visibleDateEvents(dividendMarkerEvents.value));
const chartResultMarkers = computed(() => visibleDateEvents(buildFinancialResultEvents()));
const chartNewsMarkers = computed(() => visibleDateEvents(newsItems.value.map((item) => ({
  type: 'news',
  date: dateOnly(item.published_at),
  title: item.title,
  publisher: item.publisher,
  link: item.link,
}))));
const chartMarketMarkers = computed(() => visibleDateEvents(MAJOR_MARKET_EVENTS));
const chartMarkers = computed(() => [
  ...chartBuyMarkers.value,
  ...chartDividendMarkers.value,
  ...chartResultMarkers.value,
  ...chartNewsMarkers.value,
  ...chartMarketMarkers.value,
]);
const chartMarkerLegend = computed(() => {
  const counts = chartMarkers.value.reduce((acc, marker) => {
    acc[marker.type] = (acc[marker.type] || 0) + 1;
    return acc;
  }, {});
  return [
    { type: 'buy', label: 'buy marker', count: counts.buy || 0 },
    { type: 'sell', label: 'sell marker', count: counts.sell || 0 },
    { type: 'dividend', label: 'dividend', count: counts.dividend || 0 },
    { type: 'results', label: 'results marker', count: counts.results || 0 },
    { type: 'news', label: 'news marker', count: counts.news || 0 },
    { type: 'market', label: 'major market event', count: counts.market || 0 },
  ].filter((item) => item.count > 0);
});
const newsImpactRows = computed(() => [...chartNewsMarkers.value, ...chartMarketMarkers.value]
  .map((marker) => buildNewsImpactRow(marker))
  .filter(Boolean)
  .sort((a, b) => (b.date || '').localeCompare(a.date || '')));
const overviewEventRows = computed(() => newsImpactRows.value.slice(0, 3));
const marketEventRows = computed(() => MAJOR_MARKET_EVENTS.map((event) => {
  const impact = buildNewsImpactRow(event);
  return {
    ...event,
    inWindow: Boolean(impact),
    oneDayPct: impact?.oneDayPct ?? null,
    fiveDayPct: impact?.fiveDayPct ?? null,
  };
}));
const newsTrendAnalysis = computed(() => buildNewsTrendAnalysis());
const overviewMetrics = computed(() => {
  const rows = history.value.filter((row) => finiteClose(row) != null);
  const first = rows[0] || null;
  const last = rows[rows.length - 1] || null;
  let high = null;
  let low = null;

  for (const row of rows) {
    const close = finiteClose(row);
    if (close == null) continue;
    high = high == null ? close : Math.max(high, close);
    low = low == null ? close : Math.min(low, close);
  }

  return {
    from: first?.date || '—',
    to: last?.date || '—',
    rows: history.value.length,
    close: finiteClose(last),
    high,
    low,
    volume: last?.volume ?? null,
    windowReturn: first && last ? pctChange(finiteClose(first), finiteClose(last)) : null,
  };
});
const companyProfile = computed(() => buildCompanyProfile(companyInfo.value));
const parsedFinancialStatements = computed(() => {
  const statements = Array.isArray(financialStatements.value) ? financialStatements.value : [];
  return statements
    .map((statement, index) => normaliseFinancialStatement(statement, `Statement ${index + 1}`, index))
    .filter(Boolean);
});
const parsedEarningsReports = computed(() => {
  const reports = Array.isArray(earningsData.value) ? earningsData.value : [earningsData.value].filter(Boolean);
  return reports
    .map((report, index) => normaliseFinancialStatement(report, `Earnings ${index + 1}`, index, 'Period'))
    .filter(Boolean);
});
const parsedEarningsEstimate = computed(() => {
  const data = earningsEstimate.value?.data ?? earningsEstimate.value;
  return normaliseTabularData(data, {
    key: 'earnings-estimate',
    title: 'Earnings estimate',
    subtitle: earningsEstimate.value?.fetched_at ? `Fetched ${formatDateTime(earningsEstimate.value.fetched_at)}` : 'Consensus estimate',
    labelHeader: 'Period',
  });
});

const history = ref([]);
const buyTransactions = ref([]);
const dividendCalendarEvents = ref([]);
const highlightedChartMarkerKey = ref('');
const loadingHistory = ref(false);
const refreshing = ref(false);
const refreshingExtra = ref(false);
const vectorizingArticles = ref(false);
const refreshResult = ref(null);
const refreshExtraResult = ref(null);
const articleVectorResult = ref(null);
const lastRefreshedAt = ref(null);
const startDate = ref('');
const endDate = ref('');
const detailTab = ref('overview');

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
  { accessorKey: 'date',       header: 'Dividend date', enableSorting: true },
  { accessorKey: 'paid_on',    header: 'Paid on' },
  { accessorKey: 'amount',     header: 'Amount',        meta: { align: 'right' } },
  { accessorKey: 'yield_pct',  header: 'Yield',         meta: { align: 'right' } },
  { accessorKey: 'price_on_date', header: 'Price on date', meta: { align: 'right' } },
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
const extraRefreshAttempts = new Set();
const AUTO_REFRESH_TYPES_BY_TAB = {
  dividends: ['dividends'],
  splits: ['splits'],
  info: ['company_info'],
  financials: ['financial_statements'],
  earnings: ['earnings', 'earnings_estimate'],
  analyst: ['analyst_recommendations', 'analyst_price_target'],
  ownership: ['ownership'],
  news: ['news'],
};
const FULL_EXTRA_REFRESH_TYPES = [
  'dividends',
  'splits',
  'company_info',
  'financial_statements',
  'earnings',
  'earnings_estimate',
  'analyst_recommendations',
  'analyst_price_target',
  'ownership',
  'news',
];

function setDefaultDates() {
  const period = periodOptions.find((p) => p.key === selectedPeriod.value) || periodOptions.find((p) => p.key === '3M');
  applyPeriodDates(period);
}

function applyPeriodDates(period) {
  const end = new Date();
  endDate.value = end.toISOString().slice(0, 10);
  if (period?.all) {
    startDate.value = '';
    return;
  }
  const start = new Date();
  start.setDate(start.getDate() - (period?.days ?? 90));
  startDate.value = start.toISOString().slice(0, 10);
}

function toChartDateTime(value) {
  if (!value) return null;
  const time = new Date(`${String(value).slice(0, 10)}T00:00:00`).getTime();
  return Number.isFinite(time) ? time : null;
}

function dateOnly(value) {
  if (!value) return null;
  const date = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function visibleDateEvents(events) {
  const range = visibleHistoryRange.value;
  if (!range) return [];
  return events.filter((event) => {
    const time = toChartDateTime(event.date);
    return time != null && time >= range.start && time <= range.end;
  });
}

function extractStatementDates(statement) {
  const dates = new Set();
  const addDate = (value) => {
    const date = dateOnly(value);
    if (date) dates.add(date);
  };

  addDate(statement?.period_end);
  const data = statement?.data;
  if (Array.isArray(data?.columns)) {
    data.columns.forEach(addDate);
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    Object.keys(data)
      .filter((key) => !['columns', 'index', 'data'].includes(key))
      .forEach(addDate);
  }
  return Array.from(dates);
}

function buildFinancialResultEvents() {
  const events = [];
  const seenDates = new Set();

  for (const statement of financialStatements.value) {
    for (const date of extractStatementDates(statement)) {
      if (seenDates.has(date)) continue;
      seenDates.add(date);
      events.push({
        type: 'results',
        date,
        period: `Financial results ${date}`,
        statement_type: statement.statement_type,
      });
    }
  }

  for (const report of earningsData.value) {
    for (const date of extractStatementDates(report)) {
      if (seenDates.has(date)) continue;
      seenDates.add(date);
      events.push({
        type: 'results',
        date,
        period: `Earnings ${date}`,
        statement_type: 'earnings',
      });
    }
  }

  return events;
}

function finiteClose(row) {
  const close = Number(row?.close);
  return Number.isFinite(close) ? close : null;
}

function historyIndexOnOrAfter(date) {
  const targetTime = toChartDateTime(date);
  if (targetTime == null) return -1;
  return history.value.findIndex((row) => {
    const rowTime = toChartDateTime(row.date);
    return rowTime != null && rowTime >= targetTime && finiteClose(row) != null;
  });
}

function pctChange(from, to) {
  if (from == null || to == null || from === 0) return null;
  return ((to - from) / from) * 100;
}

function formatSignedPct(value) {
  if (!Number.isFinite(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function formatOptionalNumber(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return number.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatDividendAmount(value, currency = '') {
  const formatted = formatOptionalNumber(value, 4);
  if (formatted === '—') return formatted;
  return currency ? `${currency} ${formatted}` : formatted;
}

function formatDividendYield(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return `${number.toFixed(2)}%`;
}

function formatInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return Math.round(number).toLocaleString();
}

function formatLargeNumber(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return value == null || value === '' ? '—' : String(value);
  const sign = number < 0 ? '-' : '';
  const abs = Math.abs(number);
  if (abs >= 1_000_000_000_000) return `${sign}${(abs / 1_000_000_000_000).toFixed(digits)}T`;
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(digits)}B`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(digits)}M`;
  if (abs >= 10_000) return `${sign}${Math.round(abs).toLocaleString()}`;
  if (abs >= 100) return `${sign}${abs.toFixed(0)}`;
  if (abs >= 10) return `${sign}${abs.toFixed(2)}`;
  return `${sign}${abs.toFixed(3).replace(/\.?0+$/, '')}`;
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value);
  return date.toLocaleString();
}

function parseJsonPayload(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!['{', '['].includes(trimmed[0])) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function isDisplayableValue(value) {
  return value == null || ['string', 'number', 'boolean'].includes(typeof value);
}

function humaniseKey(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function formatPeriodColumn(value) {
  const text = String(value ?? '').trim();
  if (!text) return '—';
  const date = new Date(text);
  if (Number.isFinite(date.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(text)) {
    return date.getFullYear().toString();
  }
  return text;
}

function formatCompanyFactValue(key, value) {
  if (value == null || value === '') return '—';
  const keyName = String(key || '').toLowerCase();
  const number = Number(value);
  if (keyName.includes('date') || keyName.includes('timestamp') || keyName.includes('fiscalyearend')) {
    if (Number.isFinite(number) && number > 10_000_000) return new Date(number * 1000).toLocaleDateString();
    return String(value);
  }
  if (keyName.includes('yield') || keyName.includes('margin') || keyName.includes('growth') || keyName.includes('returnon') || keyName.includes('changepercent')) {
    if (Number.isFinite(number)) return `${(Math.abs(number) <= 1.5 ? number * 100 : number).toFixed(2)}%`;
  }
  if (keyName.includes('marketcap') || keyName.includes('enterprisevalue') || keyName.includes('revenue') || keyName.includes('cash') || keyName.includes('debt')) {
    return formatLargeNumber(value);
  }
  if (keyName.includes('employees') || keyName.includes('shares') || keyName.includes('volume')) {
    return Number.isFinite(number) ? Math.round(number).toLocaleString() : String(value);
  }
  if (typeof value === 'number') return formatLargeNumber(value);
  return String(value);
}

function buildCompanyProfile(rawValue) {
  const data = parseJsonPayload(rawValue);
  if (!isPlainObject(data)) {
    return { hasData: false, summary: '', facts: [], officers: [] };
  }

  const factKeys = [
    ['longName', 'Company'],
    ['symbol', 'Symbol'],
    ['fullExchangeName', 'Exchange'],
    ['sector', 'Sector'],
    ['industry', 'Industry'],
    ['country', 'Country'],
    ['city', 'City'],
    ['website', 'Website'],
    ['fullTimeEmployees', 'Employees'],
    ['marketCap', 'Market cap'],
    ['enterpriseValue', 'Enterprise value'],
    ['currentPrice', 'Current price'],
    ['fiftyTwoWeekRange', '52 week range'],
    ['beta', 'Beta'],
    ['trailingPE', 'Trailing P/E'],
    ['forwardPE', 'Forward P/E'],
    ['epsTrailingTwelveMonths', 'EPS TTM'],
    ['dividendYield', 'Dividend yield'],
    ['dividendRate', 'Dividend rate'],
    ['payoutRatio', 'Payout ratio'],
    ['returnOnEquity', 'Return on equity'],
    ['totalRevenue', 'Revenue'],
    ['profitMargins', 'Profit margin'],
    ['averageAnalystRating', 'Analyst rating'],
    ['recommendationKey', 'Recommendation'],
  ];
  const facts = factKeys
    .map(([key, label]) => (data[key] == null || data[key] === '' ? null : {
      label,
      value: formatCompanyFactValue(key, data[key]),
    }))
    .filter(Boolean);

  if (!facts.length) {
    Object.entries(data)
      .filter(([, value]) => isDisplayableValue(value))
      .slice(0, 24)
      .forEach(([key, value]) => facts.push({
        label: humaniseKey(key),
        value: formatCompanyFactValue(key, value),
      }));
  }

  const officers = (Array.isArray(data.companyOfficers) ? data.companyOfficers : [])
    .slice(0, 10)
    .map((officer) => ({
      name: officer?.name || '',
      title: officer?.title || '',
      totalPay: officer?.totalPay,
      fiscalYear: officer?.fiscalYear || '',
    }));

  return {
    hasData: facts.length > 0 || Boolean(data.longBusinessSummary) || officers.length > 0,
    summary: data.longBusinessSummary || data.businessSummary || data.description || '',
    facts,
    officers,
  };
}

function makeColumn(key, label = key) {
  return { key: String(key), label: formatPeriodColumn(label) };
}

function rowValueObject(columns, values) {
  return columns.reduce((acc, column, index) => {
    acc[column.key] = values?.[index] ?? null;
    return acc;
  }, {});
}

function normaliseSplitMatrix(value, options) {
  if (!Array.isArray(value?.columns) || !Array.isArray(value?.index) || !Array.isArray(value?.data)) return null;
  const columns = value.columns.map((column) => makeColumn(column, column));
  const rows = value.index.map((label, index) => {
    const rawLabel = String(label ?? `Row ${index + 1}`);
    return {
      key: `${rawLabel}:${index}`,
      rawLabel,
      label: humaniseKey(rawLabel),
      values: rowValueObject(columns, value.data[index]),
    };
  }).filter((row) => Object.values(row.values).some((cell) => cell != null && cell !== ''));

  return rows.length ? {
    ...options,
    columns,
    rows,
  } : null;
}

function normaliseRecordArray(value, options) {
  if (!Array.isArray(value) || !value.length || !value.every(isPlainObject)) return null;
  const labelCandidates = ['date', 'period', 'quarter', 'year', 'index'];
  const labelKey = labelCandidates.find((key) => value.some((row) => row[key] != null));
  const columnKeys = Array.from(value.reduce((set, row) => {
    Object.keys(row).forEach((key) => {
      if (key !== labelKey && isDisplayableValue(row[key])) set.add(key);
    });
    return set;
  }, new Set()));
  if (!columnKeys.length) return null;
  const columns = columnKeys.map((key) => makeColumn(key, humaniseKey(key)));
  const rows = value.map((row, index) => {
    const rawLabel = String(labelKey ? row[labelKey] : `Row ${index + 1}`);
    return {
      key: `${rawLabel}:${index}`,
      rawLabel,
      label: rawLabel,
      values: columns.reduce((acc, column) => {
        acc[column.key] = row[column.key];
        return acc;
      }, {}),
    };
  });
  return { ...options, columns, rows };
}

function normaliseObjectMatrix(value, options) {
  if (!isPlainObject(value)) return null;
  const entries = Object.entries(value).filter(([, cell]) => cell != null);
  const matrixEntries = entries.filter(([, cell]) => isPlainObject(cell));
  if (matrixEntries.length && matrixEntries.length === entries.length) {
    const columns = Array.from(matrixEntries.reduce((set, [, row]) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set())).map((key) => makeColumn(key, key));
    if (!columns.length) return null;
    const rows = matrixEntries.map(([label, row], index) => ({
      key: `${label}:${index}`,
      rawLabel: label,
      label: humaniseKey(label),
      values: columns.reduce((acc, column) => {
        acc[column.key] = row[column.key];
        return acc;
      }, {}),
    }));
    return { ...options, columns, rows };
  }

  const primitiveEntries = entries.filter(([, cell]) => isDisplayableValue(cell));
  if (!primitiveEntries.length) return null;
  const columns = [makeColumn('value', 'Value')];
  const rows = primitiveEntries.map(([label, cell], index) => ({
    key: `${label}:${index}`,
    rawLabel: label,
    label: humaniseKey(label),
    values: { value: cell },
  }));
  return { ...options, columns, rows };
}

function normaliseTabularData(rawValue, options) {
  const value = parseJsonPayload(rawValue);
  return normaliseSplitMatrix(value, options)
    || normaliseRecordArray(value, options)
    || normaliseObjectMatrix(value, options);
}

function normaliseFinancialStatement(statement, fallbackTitle, index, labelHeader = 'Line item') {
  const parsedStatement = parseJsonPayload(statement);
  if (!parsedStatement) return null;
  const rawTitle = parsedStatement.statement_type || parsedStatement.type || fallbackTitle;
  const title = humaniseKey(rawTitle);
  const subtitleParts = [
    parsedStatement.freq,
    parsedStatement.period_end ? `Period end ${parsedStatement.period_end}` : '',
    parsedStatement.fetched_at ? `Fetched ${formatDateTime(parsedStatement.fetched_at)}` : '',
  ].filter(Boolean);
  return normaliseTabularData(parsedStatement.data ?? parsedStatement, {
    key: `${rawTitle}:${index}`,
    title,
    subtitle: subtitleParts.join(' · ') || 'Stored JSON parsed into table rows',
    labelHeader,
  });
}

function formatFinancialCell(value, rawLabel = '') {
  if (value == null || value === '') return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  const key = String(rawLabel || '').toLowerCase();
  if (key.includes('eps')) return number.toFixed(2);
  if (
    key.includes('rate')
    || key.includes('ratio')
    || key.includes('margin')
    || key.includes('yield')
    || key.includes('growth')
    || key.includes('percent')
  ) {
    return `${(Math.abs(number) <= 1.5 ? number * 100 : number).toFixed(2)}%`;
  }
  return formatLargeNumber(number);
}

function impactClass(value) {
  if (!Number.isFinite(value)) return '';
  return value >= 0 ? 'fi-pos' : 'fi-neg';
}

function truncateText(value, length = 86) {
  const text = String(value || '').trim();
  if (text.length <= length) return text;
  return `${text.slice(0, length - 1)}…`;
}

function buildNewsImpactRow(marker) {
  const eventTime = toChartDateTime(marker.date);
  const range = visibleHistoryRange.value;
  if (eventTime == null || !range || eventTime < range.start || eventTime > range.end) return null;
  const index = historyIndexOnOrAfter(marker.date);
  if (index < 0) return null;
  const markerType = marker.type || marker.kind || 'news';
  const chartDate = history.value[index]?.date || marker.date;
  const baseClose = finiteClose(history.value[index]);
  const oneDayClose = index + 1 < history.value.length ? finiteClose(history.value[index + 1]) : null;
  const fiveDayClose = index + 5 < history.value.length ? finiteClose(history.value[index + 5]) : null;
  return {
    date: marker.date,
    markerType,
    markerKey: `${markerType}:${chartDate}`,
    title: truncateText(marker.title || 'News'),
    publisher: marker.publisher || '',
    link: marker.link || '',
    baseClose,
    oneDayPct: pctChange(baseClose, oneDayClose),
    fiveDayPct: pctChange(baseClose, fiveDayClose),
  };
}

function average(values) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return null;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function buildNewsTrendAnalysis() {
  if (!history.value.length) return null;
  const first = history.value.find((row) => finiteClose(row) != null);
  const last = [...history.value].reverse().find((row) => finiteClose(row) != null);
  if (!first || !last) return null;

  const periodReturn = pctChange(finiteClose(first), finiteClose(last));
  const avgOneDay = average(newsImpactRows.value.map((row) => row.oneDayPct));
  const avgFiveDay = average(newsImpactRows.value.map((row) => row.fiveDayPct));
  const strongest = [...newsImpactRows.value]
    .filter((row) => Number.isFinite(row.fiveDayPct) || Number.isFinite(row.oneDayPct))
    .sort((a, b) => Math.abs(b.fiveDayPct ?? b.oneDayPct ?? 0) - Math.abs(a.fiveDayPct ?? a.oneDayPct ?? 0))[0] || null;

  let tone = 'neutral';
  let label = 'News watch';
  if (Number.isFinite(periodReturn) && periodReturn >= 5 && (!Number.isFinite(avgFiveDay) || avgFiveDay >= 0)) {
    tone = 'positive';
    label = 'Bullish trend';
  } else if (Number.isFinite(periodReturn) && periodReturn <= -5 && (!Number.isFinite(avgFiveDay) || avgFiveDay <= 0)) {
    tone = 'negative';
    label = 'Bearish trend';
  } else if (newsImpactRows.value.length) {
    tone = 'mixed';
    label = 'Mixed news reaction';
  }

  const summary = `Price is ${formatSignedPct(periodReturn)} over the visible window (${first.date} to ${last.date}).`;
  const newsSummary = newsImpactRows.value.length
    ? `Average post-event move: 1D ${formatSignedPct(avgOneDay)}, 5D ${formatSignedPct(avgFiveDay)} across ${newsImpactRows.value.length} event${newsImpactRows.value.length === 1 ? '' : 's'}.`
    : 'No dated news or major market events fall inside this chart window yet; use All or Refresh extra to widen the evidence.';
  const strongestSummary = strongest
    ? `Largest event-linked move: ${truncateText(strongest.title, 54)} (${formatSignedPct(strongest.fiveDayPct ?? strongest.oneDayPct)}).`
    : 'No forward price reaction is available for the current news window yet.';

  return { tone, label, summary, newsSummary, strongestSummary };
}

function setPeriod(key) {
  selectedPeriod.value = key;
  const period = periodOptions.find((p) => p.key === key);
  if (!period) return;
  applyPeriodDates(period);
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
watch(shareMenuCollapsed, persistShareMenuCollapsed);

function onSymbolRowClick(row) {
  selectedSymbol.value = row.symbol;
  refreshResult.value = null;
  refreshExtraResult.value = null;
  articleVectorResult.value = null;
  buyTransactions.value = [];
  dividends.value = [];
  trailingDividendYieldPct.value = null;
  dividendCalendarEvents.value = [];
  splits.value = [];
  companyInfo.value = null;
  financialStatements.value = [];
  earningsData.value = [];
  earningsEstimate.value = null;
  newsItems.value = [];
  setDefaultDates();
  loadHistory();
  loadBuyTransactions(row.symbol);
  loadGraphEvents(row.symbol);
  detailTab.value = 'overview';
  loadExtraForTab('overview');
}

watch(detailTab, (tab) => {
  if (selectedSymbol.value) loadExtraForTab(tab);
});

function loadShareMenuCollapsed() {
  try {
    return localStorage.getItem(SHARE_MENU_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function persistShareMenuCollapsed() {
  try {
    localStorage.setItem(SHARE_MENU_COLLAPSED_KEY, String(shareMenuCollapsed.value));
  } catch {
    // ignore
  }
}

function hasExtraDataForTab(tab) {
  if (tab === 'dividends') return dividends.value.length > 0;
  if (tab === 'splits') return splits.value.length > 0;
  if (tab === 'info') return Boolean(companyInfo.value && Object.keys(companyInfo.value).length);
  if (tab === 'financials') return financialStatements.value.length > 0;
  if (tab === 'earnings') {
    return earningsData.value.length > 0 || Boolean(earningsEstimate.value && Object.keys(earningsEstimate.value.data || {}).length);
  }
  if (tab === 'analyst') {
    return Boolean(analystPriceTarget.value && Object.keys(analystPriceTarget.value.data || {}).length)
      || Boolean(analystRecommendations.value && (analystRecommendations.value.data || []).length);
  }
  if (tab === 'ownership') return ownershipData.value.length > 0;
  if (tab === 'news') return newsItems.value.length > 0;
  return true;
}

function extraRefreshKey(sym, tab) {
  const freq = tab === 'financials' ? financialsFreq.value : tab === 'earnings' ? earningsFreq.value : '';
  return `${sym}:${tab}:${freq}`;
}

async function refreshEmptyExtraTab(tab, sym) {
  const types = AUTO_REFRESH_TYPES_BY_TAB[tab];
  if (!types || hasExtraDataForTab(tab)) return false;
  const key = extraRefreshKey(sym, tab);
  if (extraRefreshAttempts.has(key)) return false;
  extraRefreshAttempts.add(key);

  try {
    const result = await refreshFinancialInvestmentsExtra(sym, types);
    if (result?.errors && Object.keys(result.errors).length) {
      refreshExtraResult.value = {
        ...result,
        error: Object.entries(result.errors).map(([name, value]) => `${name}: ${value}`).join('; '),
      };
    }
    return true;
  } catch (e) {
    refreshExtraResult.value = { error: e.response?.data?.detail || e.response?.data?.error || e.message || 'Refresh extra failed' };
    return false;
  }
}

async function loadExtraForTab(tab, options = {}) {
  const sym = selectedSymbol.value;
  if (!sym) return;
  const shouldAutoRefresh = options.autoRefresh !== false;
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

  if (shouldAutoRefresh && !hasExtraDataForTab(tab)) {
    const refreshed = await refreshEmptyExtraTab(tab, sym);
    if (refreshed && selectedSymbol.value === sym && detailTab.value === tab) {
      await loadExtraForTab(tab, { autoRefresh: false });
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
  const sym = selectedSymbol.value;
  if (!sym) return;
  loadingHistory.value = true;
  try {
    const params = {
      start_date: startDate.value || undefined,
      end_date: endDate.value || undefined,
    };
    const result = await getFinancialInvestmentsHistory(sym, params);
    if (selectedSymbol.value !== sym) return;
    history.value = result;
  } catch (e) {
    console.error(e);
    if (selectedSymbol.value === sym) history.value = [];
  } finally {
    if (selectedSymbol.value === sym) loadingHistory.value = false;
  }
}

async function loadBuyTransactions(sym = selectedSymbol.value) {
  if (!sym) return;
  try {
    const result = await getFinancialInvestmentsBuyTransactions(sym, { include_sells: true });
    if (selectedSymbol.value === sym) {
      buyTransactions.value = result?.results ?? [];
    }
  } catch (e) {
    console.error(e);
    if (selectedSymbol.value === sym) buyTransactions.value = [];
  }
}

async function loadGraphEvents(sym = selectedSymbol.value) {
  if (!sym) return;
  const [calendarResult, dividendsResult, financialsResult, earningsResult, newsResult] = await Promise.allSettled([
    getDividendCalendar(),
    getFinancialInvestmentsDividends(sym),
    getFinancialInvestmentsFinancialStatements(sym, financialsFreq.value),
    getFinancialInvestmentsEarnings(sym, earningsFreq.value),
    getFinancialInvestmentsNews(sym, 20),
  ]);
  if (selectedSymbol.value !== sym) return;

  if (calendarResult.status === 'fulfilled') {
    const rows = calendarResult.value?.results ?? [];
    dividendCalendarEvents.value = rows.filter((row) => row.symbol === sym);
  } else {
    console.error(calendarResult.reason);
    dividendCalendarEvents.value = [];
  }

  if (dividendsResult.status === 'fulfilled') {
    const res = dividendsResult.value;
    dividends.value = Array.isArray(res) ? res : (res?.dividends ?? []);
    trailingDividendYieldPct.value = res?.trailing_dividend_yield_pct ?? null;
  } else {
    console.error(dividendsResult.reason);
    dividends.value = [];
    trailingDividendYieldPct.value = null;
  }

  if (financialsResult.status === 'fulfilled') {
    financialStatements.value = financialsResult.value;
  } else {
    console.error(financialsResult.reason);
    financialStatements.value = [];
  }

  if (earningsResult.status === 'fulfilled') {
    earningsData.value = earningsResult.value;
  } else {
    console.error(earningsResult.reason);
    earningsData.value = [];
  }

  if (newsResult.status === 'fulfilled') {
    newsItems.value = newsResult.value;
  } else {
    console.error(newsResult.reason);
    newsItems.value = [];
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
    await loadBuyTransactions(sym);
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
    const result = await refreshFinancialInvestmentsExtra(selectedSymbol.value, FULL_EXTRA_REFRESH_TYPES);
    refreshExtraResult.value = result;
    if (result.results) {
      loadExtraForTab(detailTab.value);
      loadGraphEvents(selectedSymbol.value);
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

async function vectorizeSelectedArticles() {
  if (!selectedSymbol.value || vectorizingArticles.value) return;
  vectorizingArticles.value = true;
  articleVectorResult.value = null;
  try {
    articleVectorResult.value = await vectorizeFinancialInvestmentsArticles(selectedSymbol.value, {
      vectorize: true,
      limit: 30,
    });
  } catch (e) {
    articleVectorResult.value = {
      vectorize_error: e.response?.data?.detail || e.response?.data?.error || e.message || 'Vectorise articles failed',
      documents_written: 0,
    };
  } finally {
    vectorizingArticles.value = false;
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
      articleVectorResult.value = null;
      buyTransactions.value = [];
      dividends.value = [];
      trailingDividendYieldPct.value = null;
      dividendCalendarEvents.value = [];
      splits.value = [];
      companyInfo.value = null;
      financialStatements.value = [];
      earningsData.value = [];
      earningsEstimate.value = null;
      newsItems.value = [];
      setDefaultDates();
      await loadHistory();
      await loadBuyTransactions(sym);
      await loadGraphEvents(sym);
      detailTab.value = 'overview';
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
  grid-template-columns: minmax(320px, 380px) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.fi-layout--shares-collapsed {
  grid-template-columns: 48px minmax(0, 1fr);
}

@media (max-width: 1024px) {
  .fi-layout {
    grid-template-columns: 1fr;
  }

  .fi-layout--shares-collapsed {
    grid-template-columns: 44px minmax(0, 1fr);
  }
}

.fi-layout__left {
  min-width: 0;
}

.fi-layout__left--collapsed {
  align-self: stretch;
}

.fi-layout__right {}

.fi-share-panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.fi-share-panel-header__button {
  flex: 0 0 auto;
}

.fi-share-rail {
  display: flex;
  justify-content: center;
  min-height: 200px;
  padding: 8px 0;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 6px;
  background: var(--kdl-card-bg);
}

.fi-share-rail__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
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

.fi-share-rail__button:hover {
  color: var(--kdl-text-primary);
  background: var(--kdl-hover-bg);
  border-color: var(--kdl-border-strong);
}

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
  margin-bottom: 8px;
}

.fi-chart-legend {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 14px;
  color: var(--kdl-text-secondary);
  font-size: 12px;
  font-weight: 600;
  margin: 0 0 16px;
}

.fi-chart-legend__item {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 4px 8px;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 6px;
  background: var(--kdl-card-bg);
}

.fi-chart-legend__marker {
  display: inline-block;
  flex: 0 0 auto;
}

.fi-chart-legend__marker--buy {
  width: 0;
  height: 0;
  border-left: 7px solid transparent;
  border-right: 7px solid transparent;
  border-bottom: 13px solid rgb(22, 163, 74);
  filter: drop-shadow(0 0 2px rgba(22, 163, 74, 0.45));
}

.fi-chart-legend__marker--sell {
  width: 0;
  height: 0;
  border-left: 7px solid transparent;
  border-right: 7px solid transparent;
  border-top: 13px solid rgb(220, 38, 38);
  filter: drop-shadow(0 0 2px rgba(220, 38, 38, 0.45));
}

.fi-chart-legend__marker--dividend {
  width: 11px;
  height: 11px;
  background: rgb(245, 158, 11);
  transform: rotate(45deg);
}

.fi-chart-legend__marker--results {
  width: 11px;
  height: 11px;
  background: rgb(124, 58, 237);
}

.fi-chart-legend__marker--news {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: rgb(14, 165, 233);
}

.fi-chart-legend__marker--market {
  width: 16px;
  height: 16px;
  background: rgb(220, 38, 38);
  clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 56%, 79% 91%, 50% 69%, 21% 91%, 32% 56%, 2% 35%, 39% 35%);
}

.fi-news-impact {
  border-top: 1px solid var(--kdl-border-subtle);
  border-bottom: 1px solid var(--kdl-border-subtle);
  padding: 12px 0;
  margin: 0 0 14px;
}

.fi-news-impact__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.fi-news-impact__actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}

.fi-news-impact__subtitle {
  margin: 3px 0 0;
  font-size: 12px;
}

.fi-news-impact__badge {
  flex: 0 0 auto;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid var(--kdl-border-subtle);
  color: var(--kdl-text-secondary);
  background: var(--kdl-hover-bg);
}

.fi-news-impact__badge--positive {
  color: var(--kdl-status-success);
  background: color-mix(in srgb, var(--kdl-status-success) 10%, transparent);
}

.fi-news-impact__badge--negative {
  color: var(--kdl-status-error);
  background: color-mix(in srgb, var(--kdl-status-error) 10%, transparent);
}

.fi-news-impact__badge--mixed {
  color: rgb(124, 58, 237);
  background: rgba(124, 58, 237, 0.08);
}

.fi-news-impact__summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  color: var(--kdl-text-secondary);
  font-size: 12px;
  line-height: 1.45;
  margin-bottom: 10px;
}

.fi-news-impact__table {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 12px;
}

.fi-news-impact__row {
  display: grid;
  grid-template-columns: 96px minmax(220px, 1fr) 70px 70px;
  gap: 10px;
  align-items: center;
  min-height: 38px;
  padding: 7px 10px;
  border-top: 1px solid var(--kdl-border-subtle);
  color: var(--kdl-text-primary);
  text-decoration: none;
  font-size: 12px;
}

.fi-news-impact__row:first-child {
  border-top: 0;
}

.fi-news-impact__row:hover {
  background: var(--kdl-hover-bg);
}

.fi-news-impact__row--active {
  background: color-mix(in srgb, rgb(14, 165, 233) 10%, transparent);
  box-shadow: inset 3px 0 0 rgb(14, 165, 233);
}

.fi-news-impact__row--head {
  min-height: 30px;
  color: var(--kdl-text-muted);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0;
  background: var(--kdl-hover-bg);
}

.fi-news-impact__row strong {
  display: block;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
}

.fi-news-impact__row small {
  display: block;
  color: var(--kdl-text-muted);
  margin-top: 2px;
}

.fi-market-events {
  padding-top: 4px;
}

.fi-market-events__list {
  display: flex;
  flex-direction: column;
  margin-top: 8px;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 6px;
  overflow: hidden;
}

.fi-market-events__item {
  display: grid;
  grid-template-columns: 96px minmax(220px, 1fr) 70px;
  gap: 10px;
  align-items: center;
  min-height: 44px;
  padding: 8px 10px;
  border-top: 1px solid var(--kdl-border-subtle);
  color: var(--kdl-text-primary);
  text-decoration: none;
  font-size: 12px;
}

.fi-market-events__item:first-child {
  border-top: 0;
}

.fi-market-events__item:hover {
  background: var(--kdl-hover-bg);
}

.fi-market-events__item strong {
  display: block;
  font-size: 12px;
  font-weight: 600;
}

.fi-market-events__item small {
  display: block;
  color: var(--kdl-text-muted);
  margin-top: 2px;
}

.fi-market-events__date {
  color: var(--kdl-text-secondary);
  font-weight: 600;
}

@media (max-width: 900px) {
  .fi-news-impact__summary {
    grid-template-columns: 1fr;
  }

  .fi-news-impact__row {
    grid-template-columns: 82px minmax(150px, 1fr) 52px 52px;
    gap: 8px;
  }

  .fi-market-events__item {
    grid-template-columns: 82px minmax(150px, 1fr) 52px;
    gap: 8px;
  }
}

/* Overview */
.fi-overview {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.fi-overview__metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 6px;
  overflow: hidden;
}

.fi-overview__metric {
  min-width: 0;
  padding: 10px 12px;
  border-left: 1px solid var(--kdl-border-subtle);
  background: color-mix(in srgb, var(--kdl-card-bg) 86%, var(--kdl-hover-bg));
}

.fi-overview__metric:first-child {
  border-left: 0;
}

.fi-overview__metric span,
.fi-overview__metric small {
  display: block;
  color: var(--kdl-text-muted);
  font-size: 11px;
  line-height: 1.35;
}

.fi-overview__metric strong {
  display: block;
  margin: 3px 0;
  color: var(--kdl-text-primary);
  font-size: 18px;
  font-weight: 700;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fi-overview__body {
  display: grid;
  grid-template-columns: minmax(240px, 0.85fr) minmax(320px, 1.15fr);
  gap: 14px;
}

.fi-overview__section {
  min-width: 0;
  border-top: 1px solid var(--kdl-border-subtle);
  padding-top: 12px;
}

.fi-overview__section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.fi-overview__marker-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.fi-overview__marker-item {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 28px;
  padding: 4px 8px;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 6px;
  color: var(--kdl-text-secondary);
  font-size: 12px;
  font-weight: 600;
  background: var(--kdl-hover-bg);
}

.fi-overview__events {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 6px;
  overflow: hidden;
}

.fi-overview__event {
  display: grid;
  grid-template-columns: 86px minmax(0, 1fr) 64px;
  gap: 10px;
  align-items: center;
  min-height: 40px;
  padding: 8px 10px;
  border-top: 1px solid var(--kdl-border-subtle);
  color: var(--kdl-text-primary);
  text-decoration: none;
  font-size: 12px;
}

.fi-overview__event:first-child {
  border-top: 0;
}

.fi-overview__event:hover,
.fi-overview__event--active {
  background: color-mix(in srgb, rgb(14, 165, 233) 10%, transparent);
  box-shadow: inset 3px 0 0 rgb(14, 165, 233);
}

.fi-overview__event span:first-child {
  color: var(--kdl-text-muted);
  font-weight: 600;
}

.fi-overview__event strong {
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fi-overview__event span:last-child {
  text-align: right;
  font-weight: 600;
}

.fi-overview__empty {
  margin: 0;
  font-size: 12px;
}

@media (max-width: 980px) {
  .fi-overview__metrics,
  .fi-overview__body {
    grid-template-columns: 1fr;
  }

  .fi-overview__metric {
    border-left: 0;
    border-top: 1px solid var(--kdl-border-subtle);
  }

  .fi-overview__metric:first-child {
    border-top: 0;
  }
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
.fi-statement-stack {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.fi-stmt {
  margin-bottom: 16px;
}

.fi-stmt__title {
  margin-bottom: 6px;
}

.fi-stmt__head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 8px;
}

.fi-stmt__count {
  flex: 0 0 auto;
  color: var(--kdl-text-muted);
  font-size: 12px;
  font-weight: 600;
}

.fi-company-profile {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 980px;
}

.fi-company-profile__summary {
  max-width: 920px;
  color: var(--kdl-text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.fi-fact-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 8px;
}

.fi-fact {
  min-width: 0;
  padding: 9px 10px;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 6px;
  background: color-mix(in srgb, var(--kdl-card-bg) 94%, var(--kdl-accent) 6%);
}

.fi-fact span {
  display: block;
  color: var(--kdl-text-muted);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.2;
}

.fi-fact strong {
  display: block;
  min-width: 0;
  margin-top: 4px;
  color: var(--kdl-text-primary);
  font-size: 13px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.fi-data-table-wrap {
  max-width: 100%;
  max-height: 430px;
  overflow: auto;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 6px;
  background: var(--kdl-card-bg);
}

.fi-data-table {
  width: 100%;
  min-width: 640px;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 12px;
}

.fi-data-table th,
.fi-data-table td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--kdl-border-subtle);
  color: var(--kdl-text-secondary);
  white-space: nowrap;
}

.fi-data-table thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--kdl-card-bg);
  color: var(--kdl-text-muted);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.fi-data-table th:first-child {
  position: sticky;
  left: 0;
  z-index: 1;
  max-width: 260px;
  background: var(--kdl-card-bg);
  color: var(--kdl-text-primary);
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fi-data-table thead th:first-child {
  z-index: 3;
}

.fi-data-table tbody tr:last-child th,
.fi-data-table tbody tr:last-child td {
  border-bottom: 0;
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
