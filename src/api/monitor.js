/**
 * Agent Monitor API client.
 * Fetches performance, session, health, error, and slow-tool data.
 */

let _client = null;
async function getClient() {
  if (!_client) {
    const mod = await import('./client');
    _client = mod.default;
  }
  return _client;
}

export async function fetchPerformance(hours = 24, toolName = '') {
  const client = await getClient();
  const params = { hours };
  if (toolName) params.tool_name = toolName;
  const resp = await client.get('/api/ai-agent/monitor/performance/', { params });
  return resp.data;
}

export async function fetchSessions(days = 7) {
  const client = await getClient();
  const resp = await client.get('/api/ai-agent/monitor/sessions/', { params: { days } });
  return resp.data;
}

export async function fetchHealth() {
  const client = await getClient();
  const resp = await client.get('/api/ai-agent/monitor/health/');
  return resp.data;
}

export async function fetchErrors(hours = 24, toolName = '', limit = 20) {
  const client = await getClient();
  const params = { hours, limit };
  if (toolName) params.tool_name = toolName;
  const resp = await client.get('/api/ai-agent/monitor/errors/', { params });
  return resp.data;
}

export async function fetchSlowTools(hours = 24, thresholdMs = 2000, limit = 20) {
  const client = await getClient();
  const resp = await client.get('/api/ai-agent/monitor/slow-tools/', {
    params: { hours, threshold_ms: thresholdMs, limit },
  });
  return resp.data;
}
