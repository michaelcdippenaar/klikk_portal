import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const endpointMocks = vi.hoisted(() => ({
  getTenants: vi.fn(),
  getSummary: vi.fn(),
  getTrailBalance: vi.fn(),
  getLineItems: vi.fn(),
  getPnlSummary: vi.fn(),
  getAccountSummary: vi.fn(),
  updateMetadata: vi.fn(),
  updateData: vi.fn(),
  processJournals: vi.fn(),
  processTrailBalance: vi.fn(),
  reconcileReports: vi.fn(),
  importPnlByTracking: vi.fn(),
  syncXeroDocuments: vi.fn(),
  syncInvoices: vi.fn(),
  syncAgedPayables: vi.fn(),
  syncAgedReceivables: vi.fn(),
}));

vi.mock('../../api/endpoints', () => endpointMocks);

import { DEMO_ENTITY_ID, useDataStore } from '../data';
import { useProcessStore } from '../processes';

describe('data store — preview demo entity', () => {
  beforeEach(() => {
    const values = new Map();
    vi.stubGlobal('localStorage', {
      clear: () => values.clear(),
      getItem: (key) => values.get(key) ?? null,
      removeItem: (key) => values.delete(key),
      setItem: (key, value) => values.set(key, String(value)),
    });
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it.each([
    ['empty response', () => endpointMocks.getTenants.mockResolvedValue([])],
    [
      'unavailable response',
      () => endpointMocks.getTenants.mockRejectedValue(new Error('Unavailable')),
    ],
  ])('injects and selects the demo only for preview on %s', async (_label, arrange) => {
    arrange();
    const store = useDataStore();

    await store.loadTenants({ allowDemoFallback: true });

    expect(store.tenants).toEqual([
      expect.objectContaining({
        id: DEMO_ENTITY_ID,
        name: 'Klikk (Pty) Ltd',
        source: 'demo',
        mode: 'demo',
      }),
    ]);
    expect(store.selectedTenant).toBe(DEMO_ENTITY_ID);
    expect(store.selectionSource).toBe('demo');
    expect(store.isDemo).toBe(true);
    expect(localStorage.getItem('selected_tenant')).toBeNull();
  });

  it('never injects the demo for /app empty state', async () => {
    endpointMocks.getTenants.mockResolvedValue([]);
    const store = useDataStore();

    await store.loadTenants();

    expect(store.tenants).toEqual([]);
    expect(store.selectedTenant).toBeNull();
    expect(store.isDemo).toBe(false);
  });

  it('gives real API entities precedence and restores a valid persisted selection', async () => {
    localStorage.setItem('selected_tenant', 'real-entity');
    endpointMocks.getTenants
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'real-entity', name: 'Real Entity', active: true }]);
    const store = useDataStore();

    await store.loadTenants({ allowDemoFallback: true });
    expect(store.isDemo).toBe(true);

    await store.loadTenants({ allowDemoFallback: true });

    expect(store.tenants).toEqual([{ id: 'real-entity', name: 'Real Entity', active: true }]);
    expect(store.selectedTenant).toBe('real-entity');
    expect(store.selectionSource).toBe('persisted');
    expect(store.isDemo).toBe(false);
  });

  it('does not call production process APIs for the demo entity', async () => {
    endpointMocks.getTenants.mockResolvedValue([]);
    const dataStore = useDataStore();
    await dataStore.loadTenants({ allowDemoFallback: true });

    const result = await useProcessStore().runProcess('metadata', { tenantId: DEMO_ENTITY_ID });

    expect(result).toEqual({
      success: false,
      error: 'Demo data is read-only. No production process was started.',
    });
    expect(endpointMocks.updateMetadata).not.toHaveBeenCalled();
  });

  it('never sends the frontend-only demo id to entity-scoped read APIs', async () => {
    endpointMocks.getTenants.mockResolvedValue([]);
    const store = useDataStore();
    await store.loadTenants({ allowDemoFallback: true });

    const result = await store.fetchSummary();

    expect(result).toEqual({
      success: false,
      error: 'Demo data is read-only and does not query production entity data.',
    });
    expect(endpointMocks.getSummary).not.toHaveBeenCalled();
  });
});
