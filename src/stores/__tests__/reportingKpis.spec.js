import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useReportingKpiStore } from '../reportingKpis';

describe('reporting KPI store', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('owns the management KPIs and variance report data', () => {
    const store = useReportingKpiStore();
    expect(store.performanceKpis).toHaveLength(4);
    expect(store.performanceVarianceTable.rows).toHaveLength(4);
    expect(store.performanceVarianceTable.actions).toBe(false);
  });
});
