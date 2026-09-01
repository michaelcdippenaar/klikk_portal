import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { getSummary, getTrailBalance, getLineItems, getTenants, getPnlSummary, getAccountSummary } from '../api/endpoints';
import { STORAGE_KEYS } from '../utils/constants';

export const DEMO_ENTITY_ID = 'demo-klikk-pty-ltd';

// Frontend-only adapter used by the public Overview preview. The production
// entity DTO deliberately has no demo/source fields; keep this object out of
// backend requests and server-backed preferences.
export const DEMO_PREVIEW_ENTITY = Object.freeze({
  id: DEMO_ENTITY_ID,
  name: 'Klikk (Pty) Ltd',
  tenant_id: DEMO_ENTITY_ID,
  tenant_name: 'Klikk (Pty) Ltd',
  source: 'demo',
  mode: 'demo',
  isDemo: true,
});

export function entityId(entity) {
  return entity?.id || entity?.tenant_id || null;
}

export function entityName(entity) {
  return entity?.name || entity?.tenant_name || null;
}

export const useDataStore = defineStore('data', () => {
  const preferenceStorage = typeof localStorage === 'undefined' ? null : localStorage;
  const persistedTenantId = preferenceStorage?.getItem(STORAGE_KEYS.SELECTED_TENANT) || null;
  const selectedTenant = ref(persistedTenantId);
  const selectionSource = ref(persistedTenantId ? 'persisted' : null);
  const tenants = ref([]);
  const summary = ref(null);
  const trailBalance = ref(null);
  const lineItems = ref(null);
  const pnlSummary = ref(null);
  const accountSummary = ref(null);
  const loading = ref(false);
  const error = ref(null);

  let tenantRequestVersion = 0;

  function selectDemoEntity() {
    tenants.value = [DEMO_PREVIEW_ENTITY];
    selectedTenant.value = DEMO_ENTITY_ID;
    selectionSource.value = 'demo';
  }

  function clearSelectedTenant({ clearPersisted = false } = {}) {
    selectedTenant.value = null;
    selectionSource.value = null;
    if (clearPersisted) preferenceStorage?.removeItem(STORAGE_KEYS.SELECTED_TENANT);
  }

  function clearDemoContext() {
    tenantRequestVersion += 1;
    tenants.value = tenants.value.filter((entity) => !entity?.isDemo);
    if (selectedTenant.value === DEMO_ENTITY_ID) clearSelectedTenant();
  }

  // Load accessible entities. Demo fallback is opt-in and must only be used by
  // the exact public Overview preview route.
  async function loadTenants({ allowDemoFallback = false } = {}) {
    const requestVersion = ++tenantRequestVersion;
    try {
      const data = await getTenants();
      if (requestVersion !== tenantRequestVersion) return { success: false, stale: true };
      const accessibleEntities = Array.isArray(data) ? data : [];

      if (accessibleEntities.length > 0) {
        tenants.value = accessibleEntities;
        const storedTenantId = preferenceStorage?.getItem(STORAGE_KEYS.SELECTED_TENANT) || null;
        const candidateId = selectedTenant.value === DEMO_ENTITY_ID ? storedTenantId : selectedTenant.value;
        const selectionExists = accessibleEntities.some((entity) => entityId(entity) === candidateId);
        if (selectionExists) {
          selectedTenant.value = candidateId;
          selectionSource.value = candidateId === storedTenantId ? 'persisted' : selectionSource.value;
        } else {
          clearSelectedTenant({ clearPersisted: Boolean(candidateId) });
        }
      } else if (allowDemoFallback) {
        selectDemoEntity();
      } else {
        tenants.value = [];
        clearSelectedTenant({ clearPersisted: Boolean(selectedTenant.value) });
      }

      return { success: true };
    } catch (err) {
      if (requestVersion !== tenantRequestVersion) return { success: false, stale: true };
      error.value = err.response?.data?.error || err.message;
      if (allowDemoFallback) selectDemoEntity();
      return { success: false, error: error.value };
    }
  }

  function setSelectedTenant(tenantId, { source = 'user' } = {}) {
    const selectedEntity = tenants.value.find((entity) => entityId(entity) === tenantId);
    const demoSelection = selectedEntity?.isDemo === true || tenantId === DEMO_ENTITY_ID;
    selectedTenant.value = tenantId;
    selectionSource.value = tenantId ? (demoSelection ? 'demo' : source) : null;
    if (tenantId && !demoSelection) {
      preferenceStorage?.setItem(STORAGE_KEYS.SELECTED_TENANT, tenantId);
    } else {
      if (!demoSelection) preferenceStorage?.removeItem(STORAGE_KEYS.SELECTED_TENANT);
    }
    // Clear data when tenant changes
    summary.value = null;
    trailBalance.value = null;
    lineItems.value = null;
    pnlSummary.value = null;
    accountSummary.value = null;
  }

  const selectedTenantName = computed(() => {
    if (!selectedTenant.value) return null;
    const tenant = tenants.value.find((entity) => entityId(entity) === selectedTenant.value);
    return entityName(tenant);
  });

  const selectedEntity = computed(() => tenants.value.find((entity) => entityId(entity) === selectedTenant.value) || null);
  const isDemo = computed(() => selectedEntity.value?.isDemo === true && selectionSource.value === 'demo');

  function blockDemoBackendRequest() {
    if (!isDemo.value) return null;
    error.value = 'Demo data is read-only and does not query production entity data.';
    return { success: false, error: error.value };
  }

  async function fetchSummary() {
    const demoBlock = blockDemoBackendRequest();
    if (demoBlock) return demoBlock;
    if (!selectedTenant.value) {
      error.value = 'No tenant selected';
      return { success: false, error: error.value };
    }

    loading.value = true;
    error.value = null;
    try {
      const data = await getSummary(selectedTenant.value);
      summary.value = data;
      return { success: true, data };
    } catch (err) {
      error.value = err.response?.data?.error || err.message;
      return { success: false, error: error.value };
    } finally {
      loading.value = false;
    }
  }

  async function fetchTrailBalance(filters = {}) {
    const demoBlock = blockDemoBackendRequest();
    if (demoBlock) return demoBlock;
    if (!selectedTenant.value) {
      error.value = 'No tenant selected';
      return { success: false, error: error.value };
    }

    loading.value = true;
    error.value = null;
    try {
      const data = await getTrailBalance(selectedTenant.value, filters);
      trailBalance.value = data;
      return { success: true, data };
    } catch (err) {
      error.value = err.response?.data?.error || err.message;
      return { success: false, error: error.value };
    } finally {
      loading.value = false;
    }
  }

  async function fetchAccountSummary(filters = {}) {
    const demoBlock = blockDemoBackendRequest();
    if (demoBlock) return demoBlock;
    if (!selectedTenant.value) {
      error.value = 'No tenant selected';
      return { success: false, error: error.value };
    }

    loading.value = true;
    error.value = null;
    try {
      const data = await getAccountSummary(selectedTenant.value, filters);
      accountSummary.value = data;
      return { success: true, data };
    } catch (err) {
      error.value = err.response?.data?.error || err.message;
      return { success: false, error: error.value };
    } finally {
      loading.value = false;
    }
  }

  async function fetchPnlSummary(filters = {}) {
    const demoBlock = blockDemoBackendRequest();
    if (demoBlock) return demoBlock;
    if (!selectedTenant.value) {
      error.value = 'No tenant selected';
      return { success: false, error: error.value };
    }

    loading.value = true;
    error.value = null;
    try {
      const data = await getPnlSummary(selectedTenant.value, filters);
      pnlSummary.value = data;
      return { success: true, data };
    } catch (err) {
      error.value = err.response?.data?.error || err.message;
      return { success: false, error: error.value };
    } finally {
      loading.value = false;
    }
  }

  async function fetchLineItems(filters = {}) {
    const demoBlock = blockDemoBackendRequest();
    if (demoBlock) return demoBlock;
    if (!selectedTenant.value) {
      error.value = 'No tenant selected';
      return { success: false, error: error.value };
    }

    loading.value = true;
    error.value = null;
    try {
      const data = await getLineItems(selectedTenant.value, filters);
      lineItems.value = data;
      return { success: true, data };
    } catch (err) {
      error.value = err.response?.data?.error || err.message;
      return { success: false, error: error.value };
    } finally {
      loading.value = false;
    }
  }

  return {
    selectedTenant,
    selectedTenantName,
    selectedEntity,
    selectionSource,
    isDemo,
    tenants,
    summary,
    trailBalance,
    lineItems,
    pnlSummary,
    accountSummary,
    loading,
    error,
    loadTenants,
    setSelectedTenant,
    clearDemoContext,
    fetchSummary,
    fetchAccountSummary,
    fetchTrailBalance,
    fetchPnlSummary,
    fetchLineItems,
  };
});
