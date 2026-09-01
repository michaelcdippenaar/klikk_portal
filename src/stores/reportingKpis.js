import { ref } from 'vue';
import { defineStore } from 'pinia';

export const useReportingKpiStore = defineStore('reporting-kpis', () => {
  const performanceKpis = ref([
    { label: 'Revenue attainment', value: '106.2%', detail: 'R 4.82m actual · R 4.54m budget', status: 'Above target', tone: 'positive', source: 'Xero + TM1 · Jul 2026' },
    { label: 'Gross margin', value: '38.4%', detail: 'Target 39.5% · 1.1 pp adverse', status: 'Below target', tone: 'warning', source: 'Xero + TM1 · Jul 2026' },
    { label: 'EBITDA margin', value: '14.6%', detail: 'R 702.8k actual · Target 17.0%', status: 'Needs attention', tone: 'danger', source: 'Xero + TM1 · Jul 2026' },
    { label: 'Cost ratio', value: '44.6%', detail: 'R 2.15m operating expenses', status: '0.6 pp adverse', tone: 'warning', source: 'Xero + TM1 · Jul 2026' },
  ]);

  const performanceVarianceTable = ref({
    title: 'Management variance',
    description: 'Material movements requiring explanation before reporting sign-off.',
    actions: false,
    columns: [
      { key: 'line', label: 'Reporting line' }, { key: 'actual', label: 'Actual', align: 'right' },
      { key: 'budget', label: 'Budget', align: 'right' }, { key: 'variance', label: 'Variance', align: 'right' },
      { key: 'movement', label: 'Movement' }, { key: 'status', label: 'Review state' },
    ],
    rows: [
      { id: 'revenue', line: { primary: 'Revenue', secondary: 'Product and service income' }, actual: 'R 4,820,600', budget: 'R 4,538,900', variance: { primary: '+R 281,700', tone: 'positive' }, movement: '+6.2%', status: { primary: 'On track', tone: 'positive', status: true } },
      { id: 'cost-sales', line: { primary: 'Cost of sales', secondary: 'Purchases, freight and stock adjustments' }, actual: 'R 2,969,200', budget: 'R 2,744,100', variance: { primary: '-R 225,100', tone: 'danger' }, movement: '-8.2%', status: { primary: 'Explain', tone: 'warning', status: true } },
      { id: 'opex', line: { primary: 'Operating expenses', secondary: 'Controllable overheads' }, actual: 'R 2,148,300', budget: 'R 2,021,849', variance: { primary: '-R 126,451', tone: 'danger' }, movement: '-6.3%', status: { primary: 'Review', tone: 'warning', status: true } },
      { id: 'ebitda', line: { primary: 'EBITDA', secondary: 'Before exceptional items' }, actual: 'R 702,840', budget: 'R 769,600', variance: { primary: '-R 66,760', tone: 'danger' }, movement: '-8.7%', status: { primary: 'Attention', tone: 'danger', status: true } },
    ],
  });

  return { performanceKpis, performanceVarianceTable };
});
