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

    <div class="reporting-grid">
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
  </AppPage>
</template>

<script setup>
import AppPage from '../components/shell/AppPage.vue';
import PageHeader from '../components/klikk/PageHeader.vue';
import SectionCard from '../components/klikk/SectionCard.vue';

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

const coreReports = [
  { title: 'Monthly management pack', source: 'Xero + Planning Analytics' },
  { title: 'Portfolio returns', source: 'Investec + market data' },
  { title: 'Dividend income forecast', source: 'Investec + yfinance + TM1' },
  { title: 'Bank reconciliation summary', source: 'Investec banking + Xero' },
  { title: 'Data freshness and gaps', source: 'All source systems' },
];

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
</script>

<style scoped>
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

@media (max-width: 1180px) {
  .reporting-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .reporting-grid,
  .reporting-builder {
    grid-template-columns: 1fr;
  }
}
</style>
