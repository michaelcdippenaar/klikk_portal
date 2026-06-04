import { API_ENDPOINTS } from '../utils/constants';

let _client = null;
async function getClient() {
  if (!_client) {
    const mod = await import('./client');
    _client = mod.default;
  }
  return _client;
}

export async function testTm1Connection(payload = {}) {
  const client = await getClient();
  const resp = await client.post(API_ENDPOINTS.PA_TM1_TEST_CONNECTION, payload);
  return resp.data;
}

export async function updatePostgres(tenantId, loadAll = false) {
  const client = await getClient();
  const resp = await client.post(API_ENDPOINTS.PA_PIPELINE_RUN, {
    tenant_id: tenantId,
    load_all: loadAll,
  });
  return resp.data;
}

export async function buildTrailBalance(tenantId, rebuild = false, excludeManual = false, calculatePnlYtd = true) {
  const client = await getClient();
  const resp = await client.post('/xero/cube/process/', {
    tenant_id: tenantId,
    rebuild_trail_balance: rebuild,
    exclude_manual_journals: excludeManual,
    calculate_pnl_ytd: calculatePnlYtd,
  }, { timeout: 600000 });
  return resp.data;
}

export async function executeTm1Process(processName, parameters = null) {
  const client = await getClient();
  const resp = await client.post(
    API_ENDPOINTS.PA_TM1_EXECUTE,
    { process_name: processName, parameters },
    { timeout: 300000 },
  );
  return resp.data;
}

export async function getTm1Config() {
  const client = await getClient();
  const resp = await client.get(API_ENDPOINTS.PA_TM1_CONFIG);
  return resp.data;
}

export async function saveTm1Config(payload) {
  const client = await getClient();
  const resp = await client.post(API_ENDPOINTS.PA_TM1_CONFIG, payload);
  return resp.data;
}

export async function getTm1Processes() {
  const client = await getClient();
  const resp = await client.get(API_ENDPOINTS.PA_TM1_PROCESSES);
  return resp.data;
}

export async function saveTm1Processes(processes) {
  const client = await getClient();
  const resp = await client.post(API_ENDPOINTS.PA_TM1_PROCESSES, { processes });
  return resp.data;
}

export async function getTm1Credentials() {
  const client = await getClient();
  const resp = await client.get(API_ENDPOINTS.PA_TM1_CREDENTIALS);
  return resp.data;
}

export async function saveTm1Credentials(payload) {
  const client = await getClient();
  const resp = await client.put(API_ENDPOINTS.PA_TM1_CREDENTIALS, payload);
  return resp.data;
}

export async function deleteTm1Credentials() {
  const client = await getClient();
  const resp = await client.delete(API_ENDPOINTS.PA_TM1_CREDENTIALS);
  return resp.data;
}

export async function getTrackingMapping(tenantId) {
  const client = await getClient();
  const resp = await client.get(API_ENDPOINTS.PA_TRACKING_MAPPING, {
    params: { tenant_id: tenantId },
  });
  return resp.data;
}

export async function addTrackingElement(payload) {
  const client = await getClient();
  const resp = await client.post(API_ENDPOINTS.PA_TRACKING_MAPPING_ADD, payload);
  return resp.data;
}

// ── TM1 slice-and-dice / pivot explorer ─────────────────────────────────────
// Backed by the verified DRF pivot engine. The Django backend lives in a
// separate repo; shapes are normalised defensively in PivotExplorer.vue.

// GET /tm1/cubes/ -> { cubes: [name, ...] }
export async function getTm1Cubes() {
  const client = await getClient();
  const resp = await client.get(API_ENDPOINTS.PA_TM1_CUBES);
  return resp.data;
}

// GET /tm1/cube-dimensions/?cube=NAME -> the cube's dimension names
export async function getTm1CubeDimensions(cube) {
  const client = await getClient();
  const resp = await client.get(API_ENDPOINTS.PA_TM1_CUBE_DIMENSIONS, {
    params: { cube },
  });
  return resp.data;
}

// GET /tm1/dimension-elements/?dimension=NAME -> elements of a dimension.
// Members can be large (hundreds); callers lazy-load only when a picker opens.
export async function getTm1DimensionElements(dimension, hierarchy = null) {
  const client = await getClient();
  const params = { dimension };
  if (hierarchy) params.hierarchy = hierarchy;
  const resp = await client.get(API_ENDPOINTS.PA_TM1_DIMENSION_ELEMENTS, { params });
  return resp.data;
}

// GET /tm1/dimension-hierarchies/?dimension=NAME -> visible hierarchies of a
// dimension (system 'Leaves' hidden), each {name, is_default}, plus has_alternates.
// e.g. account -> account (default) + EBITDA / Grouping / IS (excl non-cash) / is_non_cashflow.
export async function getTm1DimensionHierarchies(dimension) {
  const client = await getClient();
  const resp = await client.get(API_ENDPOINTS.PA_TM1_DIMENSION_HIERARCHIES, {
    params: { dimension },
  });
  return resp.data;
}

// GET /tm1/subsets/?dimension=NAME[&hierarchy=H] -> public subsets [{name, dynamic}].
export async function getTm1Subsets(dimension, hierarchy = null) {
  const client = await getClient();
  const params = { dimension };
  if (hierarchy) params.hierarchy = hierarchy;
  const resp = await client.get(API_ENDPOINTS.PA_TM1_SUBSETS, { params });
  return resp.data;
}

// GET /tm1/subset-members/?dimension=NAME&subset=S[&hierarchy=H&top=N] -> resolved
// members of a (static or dynamic) subset, capped: { subset, dynamic, members, truncated }.
export async function getTm1SubsetMembers(dimension, subset, hierarchy = null, top = null) {
  const client = await getClient();
  const params = { dimension, subset };
  if (hierarchy) params.hierarchy = hierarchy;
  if (top) params.top = top;
  const resp = await client.get(API_ENDPOINTS.PA_TM1_SUBSET_MEMBERS, { params });
  return resp.data;
}

// GET /tm1/dimension-aliases/?dimension=NAME[&hierarchy=H] -> { dimension, aliases:[name,…] }
// (Alias-type element attributes — the display-label choices for the dimension.)
export async function getTm1DimensionAliases(dimension, hierarchy = null) {
  const client = await getClient();
  const params = { dimension };
  if (hierarchy) params.hierarchy = hierarchy;
  const resp = await client.get(API_ENDPOINTS.PA_TM1_DIMENSION_ALIASES, { params });
  return resp.data;
}

// GET /tm1/dimension-children/?dimension=NAME&parent=ELEMENT -> the immediate
// children of a consolidation, e.g. dimension=account&parent=All_Account ->
// [{name:'EXPENSE',type}, {name:'ASSET',type}, …]. Used to (a) seed a populated
// default for Rows/Cols dims (children of the top element, not the grand total)
// and (b) drill a consolidation member down to its children in the rendered pivot.
export async function getTm1DimensionChildren(dimension, parent, hierarchy = null) {
  const client = await getClient();
  const params = { dimension, parent };
  if (hierarchy) params.hierarchy = hierarchy;
  const resp = await client.get(API_ENDPOINTS.PA_TM1_DIMENSION_CHILDREN, { params });
  return resp.data;
}

// POST /tm1/query/ — body { cube, rows, cols, filters, suppress } -> pivot cellset.
// A TM1 query can be slow on a wide slice; give it a generous timeout.
export async function runTm1Query(payload) {
  const client = await getClient();
  const resp = await client.post(API_ENDPOINTS.PA_TM1_QUERY, payload, {
    timeout: 120000,
  });
  return resp.data;
}

// ── Cost & Sustainability Cockpit — Recurring-Cash Cost-Cut Finder ──────────

export async function getCostCutReport(entity, year) {
  const client = await getClient();
  const resp = await client.get(API_ENDPOINTS.PA_COST_CUT, {
    params: { entity, year },
  });
  return resp.data;
}

// Upsert a cost-behaviour override for one account. Source becomes
// "user_override" server-side. Returns the updated row.
export async function saveCostBehaviour(payload) {
  const client = await getClient();
  const resp = await client.post(API_ENDPOINTS.PA_COST_BEHAVIOUR, payload);
  return resp.data;
}

export async function getKpiTargets(entity, year) {
  const client = await getClient();
  const resp = await client.get(API_ENDPOINTS.PA_KPI_TARGETS, {
    params: { entity, year },
  });
  return resp.data;
}

export async function saveKpiTarget(payload) {
  const client = await getClient();
  const resp = await client.post(API_ENDPOINTS.PA_KPI_TARGETS, payload);
  return resp.data;
}

export async function deleteKpiTarget(params) {
  const client = await getClient();
  const resp = await client.delete(API_ENDPOINTS.PA_KPI_TARGETS, { params });
  return resp.data;
}
