import { API_ENDPOINTS } from '../utils/constants';

let _client = null;
async function getClient() {
  if (!_client) {
    const mod = await import('./client');
    _client = mod.default;
  }
  return _client;
}

export async function getAiAgentHealth() {
  const client = await getClient();
  const resp = await client.get(API_ENDPOINTS.AI_AGENT_HEALTH);
  return resp.data;
}

export async function getAiAgentStatus() {
  const client = await getClient();
  const resp = await client.get(API_ENDPOINTS.AI_AGENT_STATUS);
  return resp.data;
}

export async function createAiAgentSession(payload = {}) {
  const client = await getClient();
  const resp = await client.post(API_ENDPOINTS.AI_AGENT_SESSIONS, payload);
  return resp.data;
}

export async function listAiAgentProjects() {
  const client = await getClient();
  const resp = await client.get(API_ENDPOINTS.AI_AGENT_PROJECTS);
  return resp.data;
}

export async function createAiAgentProject(payload = {}) {
  const client = await getClient();
  const resp = await client.post(API_ENDPOINTS.AI_AGENT_PROJECTS, payload);
  return resp.data;
}

export async function getAiAgentProject(projectId) {
  const client = await getClient();
  const resp = await client.get(`${API_ENDPOINTS.AI_AGENT_PROJECTS}${projectId}/`);
  return resp.data;
}

export async function updateAiAgentProject(projectId, payload = {}) {
  const client = await getClient();
  const resp = await client.post(`${API_ENDPOINTS.AI_AGENT_PROJECTS}${projectId}/`, payload);
  return resp.data;
}

export async function importTm1DocsToProject(projectId, payload = {}) {
  const client = await getClient();
  const resp = await client.post(
    `${API_ENDPOINTS.AI_AGENT_PROJECTS}${projectId}${API_ENDPOINTS.AI_AGENT_PROJECT_IMPORT_TM1_DOCS_SUFFIX}`,
    payload
  );
  return resp.data;
}

export async function listAiAgentSessions() {
  const client = await getClient();
  const resp = await client.get(API_ENDPOINTS.AI_AGENT_SESSIONS);
  return resp.data;
}

export async function listAiAgentSessionsByProject(projectId) {
  const client = await getClient();
  const resp = await client.get(API_ENDPOINTS.AI_AGENT_SESSIONS, { params: { project_id: projectId } });
  return resp.data;
}

export async function createSessionMessage(sessionId, payload) {
  const client = await getClient();
  const resp = await client.post(`${API_ENDPOINTS.AI_AGENT_SESSIONS}${sessionId}/messages/`, payload);
  return resp.data;
}

export async function getSessionMessages(sessionId) {
  const client = await getClient();
  const resp = await client.get(`${API_ENDPOINTS.AI_AGENT_SESSIONS}${sessionId}/messages/`);
  return resp.data;
}

export async function getSessionExecutions(sessionId) {
  const client = await getClient();
  const resp = await client.get(`${API_ENDPOINTS.AI_AGENT_SESSIONS}${sessionId}/executions/`);
  return resp.data;
}

export async function runSession(sessionId, payload) {
  const client = await getClient();
  const resp = await client.post(`${API_ENDPOINTS.AI_AGENT_SESSIONS}${sessionId}/run/`, payload);
  return resp.data;
}

export async function runSessionWithTools(sessionId, payload) {
  const client = await getClient();
  const resp = await client.post(`${API_ENDPOINTS.AI_AGENT_SESSIONS}${sessionId}/run-with-tools/`, payload);
  return resp.data;
}

export async function getAiAgentTm1Config() {
  const client = await getClient();
  const resp = await client.get(API_ENDPOINTS.AI_AGENT_TM1_CONFIG);
  return resp.data;
}

export async function saveAiAgentTm1Config(payload) {
  const client = await getClient();
  const resp = await client.post(API_ENDPOINTS.AI_AGENT_TM1_CONFIG, payload);
  return resp.data;
}

export async function testAiAgentTm1Connection() {
  const client = await getClient();
  const resp = await client.post(API_ENDPOINTS.AI_AGENT_TM1_TEST_CONNECTION);
  return resp.data;
}

export async function refreshAiAgentGlossary(payload = {}) {
  const client = await getClient();
  const resp = await client.post(API_ENDPOINTS.AI_AGENT_GLOSSARY_REFRESH, payload);
  return resp.data;
}

export async function executeAiAgentTm1Proxy(payload) {
  const client = await getClient();
  const resp = await client.post(API_ENDPOINTS.AI_AGENT_TM1_PROXY, payload);
  return resp.data;
}

export async function importCursorChatToSession(sessionId, payload = {}) {
  const client = await getClient();
  const resp = await client.post(`${API_ENDPOINTS.AI_AGENT_SESSIONS}${sessionId}/import-cursor-chat/`, payload);
  return resp.data;
}

export async function listSystemDocuments(projectId = null) {
  const client = await getClient();
  const resp = await client.get(API_ENDPOINTS.AI_AGENT_SYSTEM_DOCS, {
    params: projectId ? { project_id: projectId } : {},
  });
  return resp.data;
}

export async function getSystemDocument(docId) {
  const client = await getClient();
  const resp = await client.get(`${API_ENDPOINTS.AI_AGENT_SYSTEM_DOCS}${docId}/`);
  return resp.data;
}

export async function updateSystemDocument(docId, payload = {}) {
  const client = await getClient();
  const resp = await client.post(`${API_ENDPOINTS.AI_AGENT_SYSTEM_DOCS}${docId}/`, payload);
  return resp.data;
}

export async function generateSystemDocument(payload = {}) {
  const client = await getClient();
  const resp = await client.post(API_ENDPOINTS.AI_AGENT_SYSTEM_DOCS_GENERATE, payload);
  return resp.data;
}

export async function exportSessionToSystemDoc(sessionId, payload = {}) {
  const client = await getClient();
  const resp = await client.post(`${API_ENDPOINTS.AI_AGENT_SESSIONS}${sessionId}/export-to-system-doc/`, payload);
  return resp.data;
}

