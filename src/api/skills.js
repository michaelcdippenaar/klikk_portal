import { STORAGE_KEYS } from '../utils/constants';

/**
 * Skills & Credentials API client.
 *
 * Now routed through the Django backend (port 8001) at /api/ai-agent/...
 * Uses the same shared axios client as aiAgent.js so JWT auth is handled.
 */

let _client = null;
async function getClient() {
  if (!_client) {
    const mod = await import('./client');
    _client = mod.default;
  }
  return _client;
}

// --- Skills ---

export async function listSkills() {
  const client = await getClient();
  const resp = await client.get('/api/ai-agent/skills/registry/');
  return resp.data;
}

export async function getSkillDetail(moduleName) {
  const client = await getClient();
  const resp = await client.get(`/api/ai-agent/skills/registry/${moduleName}/`);
  return resp.data;
}

export async function updateSkill(moduleName, payload) {
  const client = await getClient();
  const resp = await client.put(`/api/ai-agent/skills/registry/${moduleName}/`, payload);
  return resp.data;
}

// --- Credentials ---

export async function listCredentials() {
  const client = await getClient();
  const resp = await client.get('/api/ai-agent/credentials/');
  return resp.data;
}

export async function setCredential(key, value, label = '') {
  const client = await getClient();
  const resp = await client.put(`/api/ai-agent/credentials/${key}/`, { value, label });
  return resp.data;
}

export async function deleteCredential(key) {
  const client = await getClient();
  const resp = await client.delete(`/api/ai-agent/credentials/${key}/`);
  return resp.data;
}

// --- MCP Agent Chat ---

export async function mcpChat(payload) {
  const client = await getClient();
  const resp = await client.post('/api/ai-agent/mcp/chat/', payload);
  return resp.data;
}
