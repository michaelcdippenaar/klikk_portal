import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { STORAGE_KEYS } from '../utils/constants';

const people = {
  lindwe: { initials: 'LM', name: 'Lindiwe M.', role: 'AP Manager' },
  jaco: { initials: 'JP', name: 'Jaco P.', role: 'Senior Accountant' },
  jacques: { initials: 'JP', name: 'Jacques P.', role: 'Financial Controller' },
  christo: { initials: 'CH', name: 'Christo H.', role: 'Accountant' },
  thabo: { initials: 'TN', name: 'Thabo N.', role: 'Finance Manager' },
  kobus: { initials: 'KM', name: 'Kobus M.', role: 'Financial Accountant' },
};

export const useOverviewStore = defineStore('overview', () => {
  const financialYears = ref(['FY 2026', 'FY 2025']);
  const preferenceStorage = typeof localStorage === 'undefined' ? null : localStorage;

  function financialYearPreferenceKey() {
    let userScope = 'anonymous';
    try {
      const storedUser = JSON.parse(preferenceStorage?.getItem(STORAGE_KEYS.USER) || 'null');
      userScope = storedUser?.id || storedUser?.pk || storedUser?.email || storedUser?.username || userScope;
    } catch {
      userScope = 'anonymous';
    }
    return `${STORAGE_KEYS.OVERVIEW_FINANCIAL_YEAR}:${userScope}`;
  }

  function initialFinancialYear() {
    const storedYear = preferenceStorage?.getItem(financialYearPreferenceKey());
    return financialYears.value.includes(storedYear) ? storedYear : financialYears.value[0];
  }

  const selectedFinancialYear = ref(initialFinancialYear());
  const selectedMonths = ref(['jul']);
  const selectedStage = ref('review');
  const selectedDetail = ref(null);

  const months = ref([
    { key: 'jul', label: 'Jul', progress: 72 }, { key: 'aug', label: 'Aug', progress: 0 },
    { key: 'sep', label: 'Sep', progress: 0 }, { key: 'oct', label: 'Oct', progress: 0 },
    { key: 'nov', label: 'Nov', progress: 0 }, { key: 'dec', label: 'Dec', progress: 0 },
    { key: 'jan', label: 'Jan', progress: 0 }, { key: 'feb', label: 'Feb', progress: 0 },
    { key: 'mar', label: 'Mar', progress: 0 }, { key: 'apr', label: 'Apr', progress: 0 },
    { key: 'may', label: 'May', progress: 0 }, { key: 'jun', label: 'Jun', progress: 0 },
  ]);

  const stages = ref([
    { key: 'ingest', label: 'Ingest', progress: 100, state: 'complete', tone: 'success' },
    { key: 'reconcile', label: 'Reconcile', progress: 65, state: 'warning', tone: 'info' },
    { key: 'review', label: 'Review', progress: 40, state: 'warning', tone: 'warning' },
    { key: 'signoff', label: 'Sign off', progress: 0, state: 'pending', tone: 'pending' },
  ]);

  const receiptWorkItems = [
    { id: 'receipt-office-crew', supplier: 'The Office Crew (Pty) Ltd', amount: 'R 388.00', confidence: '84%', owner: people.lindwe, reviewer: people.jaco, dueLabel: 'Tomorrow', dueTone: 'danger', status: 'Attention', statusTone: 'danger', tone: 'attention' },
    { id: 'receipt-shell', supplier: 'Shell Welgevonden', amount: 'R 1,245.60', confidence: '92%', owner: people.lindwe, reviewer: people.christo, dueLabel: 'In 2 days', dueTone: 'warning', status: 'Needs review', statusTone: 'warning' },
    { id: 'receipt-takealot', supplier: 'Takealot Online', amount: 'R 2,899.00', confidence: '88%', owner: people.jacques, reviewer: people.jaco, dueLabel: 'In 2 days', dueTone: 'warning', status: 'Needs review', statusTone: 'warning' },
    { id: 'receipt-uber', supplier: 'Uber South Africa', amount: 'R 312.50', confidence: '76%', owner: people.lindwe, reviewer: people.kobus, dueLabel: 'In 3 days', dueTone: 'warning', status: 'Needs review', statusTone: 'warning' },
    { id: 'receipt-woolworths', supplier: 'Woolworths Food', amount: 'R 684.30', confidence: '90%', owner: people.lindwe, reviewer: people.christo, dueLabel: 'In 3 days', dueTone: 'warning', status: 'Needs review', statusTone: 'warning' },
    { id: 'receipt-builders', supplier: 'Builders Warehouse', amount: 'R 1,978.45', confidence: '81%', owner: people.jacques, reviewer: people.jaco, dueLabel: 'In 4 days', dueTone: 'warning', status: 'Needs review', statusTone: 'warning' },
    { id: 'receipt-city-lodge', supplier: 'City Lodge Hotel', amount: 'R 3,420.00', confidence: '87%', owner: people.lindwe, reviewer: people.kobus, dueLabel: 'In 4 days', dueTone: 'warning', status: 'Needs review', statusTone: 'warning' },
  ].map((item) => ({
    ...item, category: 'receipt', icon: 'receipt', label: `Receipt · ${item.supplier}`, dueDate: '21 Aug 2026',
    exposure: item.amount, routeName: 'audit-receipts-v2',
    evidence: { title: item.supplier, amount: item.amount, confidence: item.confidence },
  }));

  const journalWorkItems = [
    { id: 'journal-payroll', label: 'Journal · July payroll accrual', owner: people.jacques, reviewer: people.christo, exposure: 'R 28,400.00' },
    { id: 'journal-depreciation', label: 'Journal · Depreciation adjustment', owner: people.kobus, reviewer: people.jaco, exposure: 'R 16,810.00' },
    { id: 'journal-prepaid-insurance', label: 'Journal · Prepaid insurance release', owner: people.christo, reviewer: people.thabo, exposure: 'R 9,000.00' },
  ].map((item) => ({
    ...item, category: 'journal', icon: 'journal', dueDate: '24 Aug 2026', dueLabel: 'In 4 days', dueTone: 'warning',
    status: 'Awaiting approval', statusTone: 'warning', routeName: 'processes',
  }));

  const reviewItems = [
    ...receiptWorkItems,
    ...journalWorkItems,
    {
      id: 'variance-review', category: 'variance', icon: 'variance', label: 'Expense variance review', owner: people.thabo, reviewer: people.kobus,
      dueDate: '26 Aug 2026', dueLabel: 'In 6 days', dueTone: 'warning', exposure: 'R 126,450.75', status: 'In progress',
      statusTone: 'warning', routeName: 'reporting',
    },
  ];

  const ingestItems = [
    {
      id: 'ingest-xero', category: 'ingest', icon: 'database', vendor: 'xero', label: 'Xero ledger and documents', source: 'Xero',
      mode: 'Automatic', freshnessLabel: 'Synced 20 Aug 2026, 08:15', recordsLabel: '4,084 journal lines',
      validationLabel: 'All required processes current', status: 'Complete', statusTone: 'success', tone: 'positive',
      owner: people.kobus, reviewer: people.thabo, period: 'Jul 2026', routeName: 'processes', actionLabel: 'Open Xero processes',
    },
    {
      id: 'ingest-bank', category: 'ingest', icon: 'bank', vendor: 'investec', label: 'Investec bank transactions', source: 'Investec Bank',
      mode: 'Automatic', freshnessLabel: 'Updated 20 Aug 2026, 07:45', recordsLabel: '246 transactions',
      validationLabel: 'No import errors', status: 'Complete', statusTone: 'success', tone: 'positive',
      owner: people.thabo, reviewer: people.kobus, period: 'Jul 2026', routeName: 'investec-account', actionLabel: 'Open bank import',
    },
    {
      id: 'ingest-holdings', category: 'ingest', icon: 'holdings', vendor: 'investec', label: 'Investment holdings', source: 'Investec Wealth',
      mode: 'Manual upload', freshnessLabel: 'Updated 20 Aug 2026, 07:30', recordsLabel: '18 holdings',
      validationLabel: '2 prices require review', status: 'Attention', statusTone: 'warning', tone: 'warning',
      owner: people.jacques, reviewer: people.thabo, period: 'Jul 2026', routeName: 'investec-holdings', actionLabel: 'Open investment holdings',
    },
    {
      id: 'ingest-share-transactions', category: 'ingest', icon: 'transactions', vendor: 'investec', label: 'Share transactions', source: 'Investec Wealth',
      mode: 'Manual upload', freshnessLabel: 'Imported 19 Aug 2026, 16:20', recordsLabel: '12 transactions',
      validationLabel: '1 share code requires mapping', status: 'Attention', statusTone: 'warning', tone: 'warning',
      owner: people.jacques, reviewer: people.kobus, period: 'Jul 2026', routeName: 'investec-transactions', actionLabel: 'Open share transactions',
    },
    {
      id: 'ingest-whatsapp', category: 'ingest', icon: 'message', vendor: 'whatsapp', label: 'WhatsApp receipts', source: 'WhatsApp',
      mode: 'Not connected', freshnessLabel: 'No connection', recordsLabel: '—', validationLabel: 'Connection required',
      status: 'Not configured', statusTone: 'neutral', tone: 'neutral', owner: people.lindwe, reviewer: people.jaco,
      period: 'Jul 2026', actionUnavailableMessage: 'A WhatsApp evidence connection has not been configured yet.',
    },
    {
      id: 'ingest-email', category: 'ingest', icon: 'mail', label: 'Email documents', source: 'Email',
      mode: 'Not connected', freshnessLabel: 'No connection', recordsLabel: '—', validationLabel: 'Connection required',
      status: 'Not configured', statusTone: 'neutral', tone: 'neutral', owner: people.lindwe, reviewer: people.jaco,
      period: 'Jul 2026', actionUnavailableMessage: 'An email evidence connection has not been configured yet.',
    },
    {
      id: 'ingest-manual-documents', category: 'ingest', icon: 'upload', label: 'Manual document uploads', source: 'Klikk',
      mode: 'On demand', freshnessLabel: 'Ready', recordsLabel: '0 pending files', validationLabel: 'Ready to receive evidence',
      status: 'Ready', statusTone: 'success', tone: 'positive', owner: people.lindwe, reviewer: people.jaco,
      period: 'Jul 2026', actionUnavailableMessage: 'The consolidated manual upload workspace is planned for the next Ingest release.',
    },
    {
      id: 'ingest-tm1-targets', category: 'ingest', icon: 'planning', vendor: 'ibm', label: 'Planning Analytics targets', source: 'TM1',
      mode: 'Read only', freshnessLabel: 'Refreshed 20 Aug 2026, 08:10', recordsLabel: 'FY 2026 target version',
      validationLabel: 'Connection current', status: 'Complete', statusTone: 'success', tone: 'positive',
      owner: people.thabo, reviewer: people.kobus, period: 'Jul 2026', routeName: 'planning-analytics', actionLabel: 'Open Planning Analytics',
    },
  ];

  const workByStage = ref({
    ingest: { title: 'Ingest source jobs', description: 'Collect, validate, and assign source data and evidence to the July 2026 close.', items: ingestItems },
    reconcile: {
      title: 'Reconciliation controls', description: 'Prove that Xero, PostgreSQL, and Planning Analytics agree for the July 2026 close.',
      items: [
        {
          id: 'reconcile-xero-postgres', category: 'reconciliation', icon: 'variance', label: 'Xero ↔ PostgreSQL P&L agreement',
          owner: people.thabo, reviewer: people.kobus, dueDate: '22 Aug 2026', dueLabel: 'In 2 days', dueTone: 'warning',
          exposure: 'R 126,450.75', status: 'Action required', statusTone: 'warning', routeName: 'compare',
          sourceA: { label: 'Xero actuals', value: 'R 4.82m', detail: '4,084 journal lines' },
          sourceB: { label: 'PostgreSQL actuals', value: 'R 4.69m', detail: '4,077 validated lines' },
          difference: { label: 'Difference', value: 'R 126,450.75', detail: '7 lines need investigation' },
        },
        {
          id: 'reconcile-postgres-completeness', category: 'reconciliation', icon: 'variance', label: 'PostgreSQL ledger completeness',
          owner: people.kobus, reviewer: people.thabo, dueDate: '22 Aug 2026', dueLabel: 'In 2 days', dueTone: 'warning',
          exposure: '—', status: 'In progress', statusTone: 'warning', routeName: 'data',
          sourceA: { label: 'Expected from Xero', value: '4,084', detail: 'Journal lines' },
          sourceB: { label: 'Loaded to PostgreSQL', value: '4,077', detail: 'Validated lines' },
          difference: { label: 'Missing', value: '7', detail: 'Evidence links outstanding' },
        },
        {
          id: 'reconcile-postgres-tm1', category: 'reconciliation', icon: 'variance', label: 'PostgreSQL ↔ Planning Analytics actuals',
          owner: people.thabo, reviewer: people.jaco, dueDate: '23 Aug 2026', dueLabel: 'In 3 days', dueTone: 'warning',
          exposure: '—', status: 'Check required', statusTone: 'warning', routeName: 'planning-analytics',
          sourceA: { label: 'PostgreSQL actuals', value: 'R 4.69m', detail: 'Current close ledger' },
          sourceB: { label: 'Planning Analytics', value: 'R 4.69m', detail: 'TM1 actual version' },
          difference: { label: 'Difference', value: 'R 0.00', detail: 'Awaiting controller sign-off' },
        },
      ],
    },
    review: { title: 'Assigned review work', description: 'Review items assigned for the July 2026 close.', items: reviewItems },
    signoff: { title: 'Assigned sign-off work', description: 'Final approvals assigned for the July 2026 close.', items: [] },
  });

  const sources = ref([
    { key: 'xero', name: 'Xero', state: 'current', timestampLabel: 'Last synced 20 Aug 2026, 08:15', ageLabel: '15 min ago', routeName: 'credentials', query: { tab: 'xero' } },
    { key: 'bank', name: 'Bank feeds', state: 'current', timestampLabel: 'Last updated 20 Aug 2026, 07:45', ageLabel: '45 min ago', routeName: 'investec-account' },
    { key: 'tm1', name: 'TM1', state: 'current', timestampLabel: 'Last updated 20 Aug 2026, 08:10', ageLabel: '20 min ago', routeName: 'planning-analytics' },
  ]);

  const cubeComments = ref([
    { id: 'comment-gross-margin', comment: 'Margin pressure is driven by freight and supplier price increases; validate the August recovery plan.', intersection: 'P&L · Gross profit · Jul 2026', value: '38.4%', author: 'Jaco Pretorius', when: '20 Aug 2026, 16:15', status: 'Open', tone: 'warning', routeName: 'audit-comments' },
    { id: 'comment-opex', comment: 'Operating expense variance requires a department-level explanation before reviewer sign-off.', intersection: 'P&L · Operating expenses · Jul 2026', value: 'R 126,451', author: 'Thabo Mthembu', when: '20 Aug 2026, 15:42', status: 'Open', tone: 'danger', routeName: 'audit-comments' },
  ]);

  const exceptions = ref({
    count: 6,
    items: [
      { id: 'exception-bank', title: 'Investec balance not reconciled', detail: 'Ledger differs from available balance', owner: 'Thabo N.', impact: 'R 126,450.75', severity: 'Critical', tone: 'danger', routeName: 'investec-account' },
      { id: 'exception-receipts', title: '7 receipts missing from Xero', detail: 'Evidence gap in the expense population', owner: 'Lindiwe M.', impact: 'R 388.00', severity: 'High', tone: 'danger', routeName: 'audit-receipts-v2' },
      { id: 'exception-ap', title: 'AP control account variance', detail: 'Aged payables do not agree to the ledger', owner: 'Kobus M.', impact: 'R 0.00', severity: 'Medium', tone: 'warning', routeName: 'audit-procedures' },
    ],
  });

  const selectedCoverage = computed(() => {
    if (!selectedFinancialYear.value) return 'Select period';
    const year = selectedFinancialYear.value.replace('FY ', '');
    if (selectedMonths.value.length === months.value.length) return `All months · ${year}`;
    const labels = months.value.filter((item) => selectedMonths.value.includes(item.key)).map((item) => item.label);
    if (labels.length === 1) return `${labels[0]} ${year}`;
    return `${labels[0]} + ${labels.length - 1} months · ${year}`;
  });
  const activeWork = computed(() => {
    const base = workByStage.value[selectedStage.value] || workByStage.value.review;
    const includesAvailablePeriod = selectedMonths.value.includes('jul');
    const descriptions = {
      ingest: `Collect, validate, and assign source data and evidence for ${selectedCoverage.value}.`,
      reconcile: `Prove that Xero, PostgreSQL, and Planning Analytics agree for ${selectedCoverage.value}.`,
      review: `Review items assigned for ${selectedCoverage.value}.`,
      signoff: `Complete final approvals assigned for ${selectedCoverage.value}.`,
    };
    return {
      ...base,
      description: includesAvailablePeriod ? descriptions[selectedStage.value] : `No close work has been scheduled for ${selectedCoverage.value}.`,
      items: includesAvailablePeriod ? base.items : [],
    };
  });
  function selectFinancialYear(year) {
    if (year === '') {
      selectedFinancialYear.value = '';
      preferenceStorage?.removeItem(financialYearPreferenceKey());
      return;
    }
    if (financialYears.value.includes(year)) {
      selectedFinancialYear.value = year;
      preferenceStorage?.setItem(financialYearPreferenceKey(), year);
    }
  }
  function selectMonths(monthKeys) {
    if (!Array.isArray(monthKeys)) return;
    const validKeys = months.value.map((item) => item.key).filter((key) => monthKeys.includes(key));
    if (validKeys.length) selectedMonths.value = validKeys;
  }
  function selectStage(stage) { if (stages.value.some((item) => item.key === stage)) selectedStage.value = stage; }
  function selectDetail(kind, item) {
    if (item && ['work', 'comment', 'exception'].includes(kind)) selectedDetail.value = { kind, item };
  }
  function clearDetail() { selectedDetail.value = null; }
  function updateSource(key, patch) {
    const source = sources.value.find((item) => item.key === key);
    if (source) Object.assign(source, patch);
  }
  function updateIngestTask(id, patch) {
    const item = workByStage.value.ingest.items.find((task) => task.id === id);
    if (item) Object.assign(item, patch);
  }
  function setCubeComments(items) {
    if (Array.isArray(items)) cubeComments.value = items;
  }

  return {
    selectedFinancialYear, selectedMonths, selectedStage, selectedDetail, financialYears, months, stages, workByStage, sources,
    cubeComments, exceptions, selectedCoverage, activeWork,
    selectFinancialYear, selectMonths, selectStage, selectDetail, clearDetail, updateSource, updateIngestTask, setCubeComments,
  };
});
