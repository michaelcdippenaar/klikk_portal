import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useOverviewStore } from '../overview';

describe('overview store', () => {
  beforeEach(() => {
    const values = new Map();
    vi.stubGlobal('localStorage', {
      clear: () => values.clear(),
      getItem: (key) => values.get(key) ?? null,
      removeItem: (key) => values.delete(key),
      setItem: (key, value) => values.set(key, String(value)),
    });
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('owns the selected period and close stage', () => {
    const store = useOverviewStore();
    expect(store.selectedCoverage).toBe('Jul 2026');

    store.selectMonths(['aug']);
    expect(store.selectedCoverage).toBe('Aug 2026');
    store.selectStage('reconcile');
    expect(store.selectedStage).toBe('reconcile');

    store.selectFinancialYear('FY 2025');
    expect(store.selectedFinancialYear).toBe('FY 2025');
    expect(store.selectedCoverage).toBe('Aug 2025');
  });

  it('rejects unknown period and stage keys', () => {
    const store = useOverviewStore();
    store.selectMonths(['bad-period']);
    store.selectStage('unknown');
    store.selectFinancialYear('FY 2040');
    expect(store.selectedMonths).toEqual(['jul']);
    expect(store.selectedStage).toBe('review');
    expect(store.selectedFinancialYear).toBe('FY 2026');
  });

  it('supports multiple and all-month close scopes', () => {
    const store = useOverviewStore();
    store.selectMonths(['jul', 'aug', 'sep']);
    expect(store.selectedMonths).toEqual(['jul', 'aug', 'sep']);
    expect(store.selectedCoverage).toBe('Jul + 2 months · 2026');

    store.selectMonths(store.months.map((month) => month.key));
    expect(store.selectedCoverage).toBe('All months · 2026');
  });

  it('persists the default financial year per user', () => {
    localStorage.setItem('user', JSON.stringify({ email: 'owner@klikk.co.za' }));
    const store = useOverviewStore();
    store.selectFinancialYear('FY 2025');
    expect(localStorage.getItem('overview_financial_year:owner@klikk.co.za')).toBe('FY 2025');
  });

  it('updates source freshness through the domain action', () => {
    const store = useOverviewStore();
    store.updateSource('xero', { state: 'attention', timestampLabel: 'Refresh required' });
    expect(store.sources[0]).toMatchObject({ state: 'attention', timestampLabel: 'Refresh required' });
  });

  it('owns exception, cube-comment, and contextual detail state', () => {
    const store = useOverviewStore();
    expect(store.exceptions.count).toBe(6);
    store.selectDetail('work', store.activeWork.items[0]);
    expect(store.selectedDetail).toMatchObject({ kind: 'work', item: { id: 'receipt-office-crew' } });
    store.clearDetail();
    expect(store.selectedDetail).toBeNull();
    store.setCubeComments([]);
    expect(store.cubeComments).toEqual([]);
  });

  it('stores one accountable row per receipt and journal task', () => {
    const store = useOverviewStore();
    const receiptItems = store.activeWork.items.filter((item) => item.category === 'receipt');
    const journalItems = store.activeWork.items.filter((item) => item.category === 'journal');
    expect(receiptItems).toHaveLength(7);
    expect(journalItems).toHaveLength(3);
    expect(store.activeWork.items).toHaveLength(11);
    expect(new Set(store.activeWork.items.map((item) => item.id)).size).toBe(11);
  });

  it('models each ingest source as an accountable source job', () => {
    const store = useOverviewStore();
    store.selectStage('ingest');

    expect(store.activeWork.items).toHaveLength(8);
    expect(new Set(store.activeWork.items.map((item) => item.id)).size).toBe(8);
    expect(store.activeWork.items.find((item) => item.id === 'ingest-xero')).toMatchObject({
      routeName: 'processes', mode: 'Automatic', category: 'ingest',
    });
    expect(store.activeWork.items.find((item) => item.id === 'ingest-holdings')).toMatchObject({
      routeName: 'investec-holdings', mode: 'Manual upload',
    });
    expect(store.activeWork.items.find((item) => item.id === 'ingest-share-transactions')).toMatchObject({
      routeName: 'investec-transactions', mode: 'Manual upload',
    });
    expect(store.activeWork.items.find((item) => item.id === 'ingest-tm1-targets')).toMatchObject({
      routeName: 'planning-analytics', mode: 'Read only',
    });
    expect(store.activeWork.items.find((item) => item.id === 'ingest-whatsapp').routeName).toBeUndefined();
  });

  it('updates live ingest state through the domain action', () => {
    const store = useOverviewStore();
    store.updateIngestTask('ingest-xero', { status: 'Attention', validationLabel: 'Connection required' });
    const item = store.workByStage.ingest.items.find((task) => task.id === 'ingest-xero');
    expect(item).toMatchObject({ status: 'Attention', validationLabel: 'Connection required' });
  });

  it('separates cross-system reconciliation controls from human review work', () => {
    const store = useOverviewStore();
    store.selectStage('reconcile');

    expect(store.activeWork.items.map((item) => item.routeName)).toEqual(['compare', 'data', 'planning-analytics']);
    expect(store.activeWork.items.map((item) => item.label)).toEqual([
      'Xero ↔ PostgreSQL P&L agreement',
      'PostgreSQL ledger completeness',
      'PostgreSQL ↔ Planning Analytics actuals',
    ]);
    expect(store.activeWork.items.every((item) => item.category === 'reconciliation')).toBe(true);
  });

  it('rejects unsupported contextual detail kinds', () => {
    const store = useOverviewStore();
    store.selectDetail('kpi', { id: 'gross-margin' });
    expect(store.selectedDetail).toBeNull();
  });
});
