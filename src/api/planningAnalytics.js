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
