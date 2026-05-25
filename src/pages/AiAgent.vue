<template>
  <div class="ai-agent-page">
    <!-- Custom topbar with session/project badges -->
    <div class="ai-topbar">
      <div class="ai-topbar__inner">
        <div class="ai-topbar__left">
          <span class="ai-topbar__title">AI Agent</span>
          <KBadge v-if="activeProject" :label="`Project: ${activeProject.name}`" tone="muted" size="sm" />
          <KBadge v-if="activeSession" :label="`Chat: ${activeSession.title}`" tone="muted" size="sm" />
        </div>
        <div class="ai-topbar__right">
          <!-- Mode toggle — chat / setup -->
          <div class="ai-mode-toggle" role="group" aria-label="Mode">
            <button
              class="ai-mode-toggle__btn"
              :class="{ 'ai-mode-toggle__btn--active': mode === 'chat' }"
              @click="mode = 'chat'"
            >Chat</button>
            <button
              class="ai-mode-toggle__btn"
              :class="{ 'ai-mode-toggle__btn--active': mode === 'setup' }"
              @click="mode = 'setup'"
            >Setup</button>
          </div>
        </div>
      </div>
    </div>

    <!-- CHAT MODE -->
    <div v-if="mode === 'chat'" class="ai-shell">
      <div class="ai-sidebar">
        <div class="ai-sidebar-header">
          <div class="ai-sidebar-row ai-sidebar-row--between">
            <span class="ai-section-label">Projects</span>
            <button class="ai-icon-btn" aria-label="New project" @click="handleNewProject">
              <!-- Lucide plus -->
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          </div>
          <KSelect
            v-model="activeProjectId"
            label="Active project"
            :options="projectOptions"
            class="ai-sidebar-select"
            @update:model-value="handleProjectChanged"
          />
          <div class="ai-sidebar-row ai-sidebar-row--between ai-sidebar-row--mt">
            <span class="ai-section-label">Chats</span>
            <button class="ai-icon-btn" aria-label="New chat" :disabled="!activeProjectId" @click="handleNewChat">
              <!-- Lucide message-square -->
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </button>
          </div>
        </div>

        <div class="ai-sidebar-scroll">
          <ul class="ai-session-list" role="listbox" aria-label="Chat sessions">
            <li
              v-for="s in sessions"
              :key="s.id"
              class="ai-session-item"
              :class="{ 'ai-session-item--active': s.id === activeSessionId }"
              role="option"
              :aria-selected="s.id === activeSessionId"
              tabindex="0"
              @click="selectSession(s.id)"
              @keydown.enter.space.prevent="selectSession(s.id)"
            >
              <span class="ai-session-title">{{ s.title || `Chat ${s.id}` }}</span>
              <span class="ai-session-date">{{ formatUpdatedAt(s.updated_at) }}</span>
            </li>
          </ul>
        </div>
      </div>

      <div class="ai-chat">
        <!-- Scroll container — native overflow-y: auto -->
        <div ref="chatScrollRef" class="ai-chat-scroll">
          <div class="ai-chat-inner">
            <p v-if="!activeSessionId" class="ai-empty-hint">
              Select a chat, or create a new one.
            </p>

            <template v-else>
              <div
                v-for="m in messages"
                :key="m.id"
                class="ai-msg-row"
                :class="m.role === 'user' ? 'ai-msg-row--user' : 'ai-msg-row--assistant'"
              >
                <div class="ai-msg-bubble" :class="m.role === 'user' ? 'ai-msg-bubble--user' : ''">
                  <div class="ai-msg-meta">
                    {{ m.role === 'user' ? 'You' : (m.role === 'system' ? 'System' : 'Agent') }}
                  </div>
                  <div v-if="m.role === 'user'" class="ai-msg-content">{{ m.content }}</div>
                  <div v-else class="ai-msg-content ai-msg-markdown" v-html="renderMarkdown(m.content)" />
                </div>
              </div>

              <div v-if="chatLoading" class="ai-msg-row ai-msg-row--assistant">
                <div class="ai-msg-bubble ai-thinking-bubble">
                  <div class="ai-msg-meta">Agent</div>
                  <div class="ai-msg-content">
                    <div class="ai-thinking-indicator">
                      <KSpinner size="xs" tone="muted" label="Working" />
                      <span class="ai-thinking-text">Working…</span>
                    </div>
                    <div v-if="thinkingSteps.length" class="ai-thinking-steps">
                      <div
                        v-for="(step, idx) in thinkingSteps"
                        :key="idx"
                        class="ai-thinking-step"
                      >
                        <!-- Lucide icons: check-circle / alert-circle / clock -->
                        <svg v-if="step.status === 'completed'" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="ai-step-icon ai-step-icon--ok" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                        <svg v-else-if="step.status === 'error'" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="ai-step-icon ai-step-icon--err" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        <svg v-else xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="ai-step-icon ai-step-icon--pending" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        <span class="ai-step-label">{{ step.tool_name || step.type || 'step' }}</span>
                        <span v-if="step.duration_ms" class="ai-step-duration">{{ (step.duration_ms / 1000).toFixed(1) }}s</span>
                        <span v-if="step.summary" class="ai-step-summary">{{ step.summary }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>

        <div class="ai-chat-input">
          <KInput
            v-model="chatInput"
            type="textarea"
            placeholder="Message Klikk AI Agent…"
            :disabled="!activeSessionId || chatLoading"
            @keydown.enter.exact.prevent="handleSendChat"
          />
          <div class="ai-chat-actions">
            <span class="ai-tenant-hint">Tenant: {{ tenantId || 'none' }}</span>
            <div class="ai-chat-buttons">
              <button class="btn btn-ghost" :disabled="!activeProjectId" @click="openDocsDrawer">View docs</button>
              <button class="btn btn-ghost" :disabled="!activeSessionId" @click="handleImportCursorChat">Import Cursor Chat</button>
              <button class="btn btn-ghost" :disabled="!activeSessionId" @click="handleExportChatToDoc">Share to Project</button>
              <button class="btn btn-primary" :disabled="!activeSessionId || !chatInput.trim() || chatLoading" @click="handleSendChat">Send</button>
            </div>
          </div>
        </div>
      </div>

      <!-- System docs slide-over panel (replaces q-drawer) -->
      <Transition name="ai-drawer">
        <aside v-if="docsDrawerOpen" class="ai-docs-drawer">
          <div class="ai-docs-drawer__inner">
            <div class="ai-docs-drawer__header">
              <span class="ai-section-label">System documentation</span>
              <button class="ai-icon-btn" aria-label="Close docs panel" @click="docsDrawerOpen = false">
                <!-- Lucide x -->
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div class="ai-docs-drawer__body">
              <template v-if="selectedDocDetail">
                <button class="btn btn-ghost ai-back-btn" @click="closeDocDetail">
                  <!-- Lucide arrow-left -->
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                  Back
                </button>
                <div class="ai-doc-title">{{ selectedDocDetail.title || selectedDocDetail.slug }}</div>
                <div class="ai-doc-slug">Slug: {{ selectedDocDetail.slug }}</div>
                <div
                  class="ai-doc-content"
                  v-html="renderMarkdown(selectedDocDetail.content_markdown || '')"
                />
                <button class="btn btn-primary ai-doc-request-btn" @click="requestChangesForDoc(selectedDocDetail)">
                  Request changes in chat
                </button>
              </template>
              <template v-else>
                <div v-if="docDetailLoading" class="ai-doc-loading">Loading…</div>
                <ul v-else-if="systemDocs.length" class="ai-doc-list">
                  <li
                    v-for="d in systemDocs"
                    :key="d.id"
                    class="ai-doc-item"
                    tabindex="0"
                    @click="selectDoc(d)"
                    @keydown.enter.space.prevent="selectDoc(d)"
                  >
                    <div class="ai-doc-item__meta">
                      <span class="ai-doc-item__title">{{ d.title || d.slug }}</span>
                      <span class="ai-doc-item__slug">{{ d.slug }}</span>
                    </div>
                    <!-- Lucide chevron-right -->
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="ai-doc-item__chevron" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
                  </li>
                </ul>
                <p v-else class="ai-empty-hint">
                  No documents. Add docs in Setup or generate a system doc.
                </p>
              </template>
            </div>
          </div>
        </aside>
      </Transition>
    </div>

    <!-- SETUP MODE -->
    <div v-else class="ai-setup">
      <div class="ai-setup-grid">
        <!-- LEFT COLUMN -->
        <div class="ai-setup-col">
          <!-- Agent Status -->
          <div class="ai-card">
            <div class="ai-card__header">
              <div>
                <div class="ai-card__title">Agent Status</div>
                <div class="ai-card__subtitle">Readiness only, no secret values exposed.</div>
              </div>
              <button class="btn btn-ghost" :disabled="statusLoading" @click="loadAgentStatus">
                <KSpinner v-if="statusLoading" size="xs" tone="muted" />
                Refresh
              </button>
            </div>
            <div v-if="agentStatus" class="ai-card__body">
              <div class="ai-badge-row">
                <KBadge
                  :label="agentStatus.providers?.openai_configured ? 'OpenAI: configured' : 'OpenAI: not configured'"
                  :tone="agentStatus.providers?.openai_configured ? 'accent' : 'muted'"
                  size="sm"
                />
                <KBadge
                  :label="agentStatus.tm1?.configured ? 'TM1: configured' : 'TM1: not configured'"
                  :tone="agentStatus.tm1?.configured ? 'accent' : 'muted'"
                  size="sm"
                />
              </div>
              <div class="ai-caption">Active model: {{ agentStatus.providers?.active_model || '-' }}</div>
            </div>
          </div>

          <!-- TM1 Config -->
          <div class="ai-card">
            <div class="ai-card__header">
              <div class="ai-card__title">TM1 Config (shared)</div>
            </div>
            <div class="ai-card__body">
              <div class="ai-form-stack">
                <KInput v-model="tm1Config.base_url" label="Base URL (e.g. http://host:port/api/v1/)" />
                <div class="ai-form-row">
                  <KInput v-model="tm1Config.username" label="Username" />
                  <KInput v-model="tm1Config.password" label="Password" type="password" />
                </div>
              </div>
              <div class="ai-action-row">
                <button class="btn btn-primary" :disabled="savingTm1Config" @click="handleSaveTm1Config">
                  <KSpinner v-if="savingTm1Config" size="xs" tone="muted" />
                  Save TM1 Config
                </button>
                <button class="btn btn-ghost" :disabled="tm1TestLoading" @click="handleTm1Test">
                  <KSpinner v-if="tm1TestLoading" size="xs" tone="muted" />
                  Test Connection
                </button>
                <button class="btn btn-ghost" :disabled="tm1DocsLoading || !activeProjectId" @click="handleImportTm1Docs">
                  <KSpinner v-if="tm1DocsLoading" size="xs" tone="muted" />
                  Import TM1 Docs
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- RIGHT COLUMN -->
        <div class="ai-setup-col">
          <!-- Project memory -->
          <div class="ai-card">
            <div class="ai-card__header">
              <div>
                <div class="ai-card__title">Project memory (shared across chats)</div>
                <div class="ai-card__subtitle">Store cube/dimension meaning, conventions, URLs, etc.</div>
              </div>
            </div>
            <div class="ai-card__body">
              <KInput
                v-model="projectMemoryJson"
                type="textarea"
                placeholder='{"tm1_base_url":"...","cube_notes":{...}}'
              />
              <div class="ai-action-row">
                <button class="btn btn-primary" :disabled="!activeProjectId || projectSaving" @click="handleSaveProjectMemory">
                  <KSpinner v-if="projectSaving" size="xs" tone="muted" />
                  Save Project Memory
                </button>
              </div>
            </div>
          </div>

          <!-- System document -->
          <div class="ai-card">
            <div class="ai-card__header">
              <div>
                <div class="ai-card__title">System document</div>
                <div class="ai-card__subtitle">Auto-generate a structured Markdown doc into the database.</div>
              </div>
            </div>
            <div class="ai-card__body">
              <div class="ai-form-row">
                <KInput v-model="systemDocSlug" label="Doc slug" />
                <KInput v-model="systemDocTitle" label="Doc title" />
              </div>
              <div class="ai-action-row">
                <button class="btn btn-primary" :disabled="systemDocLoading" @click="handleGenerateSystemDoc">
                  <KSpinner v-if="systemDocLoading" size="xs" tone="muted" />
                  Generate
                </button>
              </div>
            </div>
          </div>

          <!-- Project documents -->
          <div class="ai-card">
            <div class="ai-card__header">
              <div>
                <div class="ai-card__title">Project documents (shared context)</div>
                <div class="ai-card__subtitle">Pin documents so every chat in this project can reference them.</div>
              </div>
              <button class="btn btn-ghost" :disabled="docsLoading" @click="loadProjectDocs">
                <KSpinner v-if="docsLoading" size="xs" tone="muted" />
                Refresh
              </button>
            </div>
            <div class="ai-card__body">
              <ul v-if="systemDocs.length" class="ai-doc-mgmt-list">
                <li v-for="d in systemDocs" :key="d.id" class="ai-doc-mgmt-item">
                  <div class="ai-doc-mgmt-item__meta">
                    <span class="ai-doc-mgmt-item__title">{{ d.title || d.slug }}</span>
                    <span class="ai-caption">{{ d.slug }} • order {{ d.context_order }}</span>
                  </div>
                  <div class="ai-doc-mgmt-item__controls">
                    <KInput
                      class="ai-order-input"
                      type="number"
                      label="Order"
                      :model-value="String(d.context_order)"
                      @update:model-value="(v) => handleSetDocOrder(d, v)"
                    />
                    <KToggle :model-value="d.pin_to_context" label="Pin" @update:model-value="() => handleTogglePin(d)" />
                  </div>
                </li>
              </ul>
              <p v-else class="ai-empty-hint">
                No documents yet. Generate a system doc or "Share to Project" from a chat.
              </p>
            </div>
          </div>

          <!-- Vectorized knowledge -->
          <div class="ai-card">
            <div class="ai-card__header">
              <div>
                <div class="ai-card__title">Vectorized knowledge (keep up to date)</div>
                <div class="ai-card__subtitle">
                  Account names/purpose and contacts (Suppliers vs Customers) are synced from Xero. When Xero data changes, refresh and re-vectorize so the agent understands accounts and who is a supplier vs customer.
                </div>
              </div>
            </div>
            <div class="ai-card__body">
              <button class="btn btn-primary" :disabled="glossaryRefreshLoading || !activeProjectId" @click="handleRefreshGlossary">
                <KSpinner v-if="glossaryRefreshLoading" size="xs" tone="muted" />
                Refresh glossary &amp; re-vectorize
              </button>
            </div>
          </div>

          <!-- Last API Result -->
          <div class="ai-card">
            <div class="ai-card__header">
              <div class="ai-card__title">Last API Result</div>
            </div>
            <div class="ai-card__body">
              <pre class="result-block">{{ prettyResult(lastResult) }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Prompt dialog — replaces $q.dialog({ prompt }) -->
    <KDialog v-model="promptDialog.open" :title="promptDialog.title" size="sm">
      <div class="ai-prompt-body">
        <p v-if="promptDialog.message" class="ai-prompt-msg">{{ promptDialog.message }}</p>
        <KInput v-model="promptDialog.value" label="" :placeholder="promptDialog.placeholder || ''" @keydown.enter.prevent="confirmPrompt" />
      </div>
      <template #footer>
        <button class="btn btn-ghost" @click="cancelPrompt">Cancel</button>
        <button class="btn btn-primary" @click="confirmPrompt">OK</button>
      </template>
    </KDialog>
  </div>
</template>

<script>
import { defineComponent, ref, computed, onMounted, nextTick } from 'vue';
import { marked } from 'marked';
import { useDataStore } from '../stores/data';
import KBadge from '../components/klikk/KBadge.vue';
import KSelect from '../components/klikk/KSelect.vue';
import KInput from '../components/klikk/KInput.vue';
import KSpinner from '../components/klikk/KSpinner.vue';
import KToggle from '../components/klikk/KToggle.vue';
import KDialog from '../components/klikk/KDialog.vue';
import {
  getAiAgentStatus,
  getAiAgentTm1Config,
  getSessionMessages,
  getSessionExecutions,
  runSessionWithTools,
  createAiAgentProject,
  createAiAgentSession,
  importCursorChatToSession,
  listAiAgentProjects,
  listAiAgentSessionsByProject,
  generateSystemDocument,
  getAiAgentProject,
  updateAiAgentProject,
  importTm1DocsToProject,
  refreshAiAgentGlossary,
  exportSessionToSystemDoc,
  listSystemDocuments,
  getSystemDocument,
  updateSystemDocument,
  saveAiAgentTm1Config,
  testAiAgentTm1Connection,
} from '../api/aiAgent';

function renderMarkdown(text) {
  if (text == null || text === '') return '';
  try {
    return marked(String(text));
  } catch {
    return String(text);
  }
}

export default defineComponent({
  name: 'AiAgent',
  components: { KBadge, KSelect, KInput, KSpinner, KToggle, KDialog },
  setup() {
    const dataStore = useDataStore();
    const tenantId = computed(() => dataStore.selectedTenant);

    const mode = ref('chat');

    // Projects + chats
    const projects = ref([]);
    const activeProjectId = ref(null);
    const sessions = ref([]);
    const activeSessionId = ref(null);
    const messages = ref([]);
    const lastResult = ref(null);

    const creatingSession = ref(false);
    const projectSaving = ref(false);
    const savingTm1Config = ref(false);
    const statusLoading = ref(false);
    const tm1TestLoading = ref(false);
    const runWithToolsLoading = ref(false);
    const chatLoading = ref(false);

    const tm1Config = ref({ base_url: '', username: '', password: '' });
    const agentStatus = ref(null);

    const projectOptions = computed(() =>
      projects.value.map((p) => ({ label: p.name, value: p.id }))
    );
    const activeProject = computed(() => projects.value.find((p) => p.id === activeProjectId.value) || null);
    const activeSession = computed(() => sessions.value.find((s) => s.id === activeSessionId.value) || null);

    const chatInput = ref('');
    const chatScrollRef = ref(null);
    const thinkingSteps = ref([]);
    let executionPollTimer = null;

    const projectMemoryJson = ref('{}');
    const systemDocSlug = ref('klikk-system');
    const systemDocTitle = ref('Klikk Financials v4 - System Document');
    const systemDocLoading = ref(false);
    const docsLoading = ref(false);
    const systemDocs = ref([]);
    const tm1DocsLoading = ref(false);
    const glossaryRefreshLoading = ref(false);

    const docsDrawerOpen = ref(false);
    const selectedDocDetail = ref(null);
    const docDetailLoading = ref(false);

    // Prompt dialog state (replaces $q.dialog({ prompt }))
    const promptDialog = ref({
      open: false,
      title: '',
      message: '',
      placeholder: '',
      value: '',
    });
    let promptResolve = null;
    let promptReject = null;

    function openPrompt({ title, message, placeholder = '' }) {
      promptDialog.value = { open: true, title, message, placeholder, value: '' };
      return new Promise((resolve, reject) => {
        promptResolve = resolve;
        promptReject = reject;
      });
    }

    function confirmPrompt() {
      const val = promptDialog.value.value;
      promptDialog.value.open = false;
      if (promptResolve) { promptResolve(val); promptResolve = null; }
    }

    function cancelPrompt() {
      promptDialog.value.open = false;
      if (promptReject) { promptReject(new Error('cancelled')); promptReject = null; }
    }

    function prettyResult(value) {
      if (!value) return '';
      return JSON.stringify(value, null, 2);
    }

    function formatUpdatedAt(dt) {
      if (!dt) return '';
      try { return new Date(dt).toLocaleString(); } catch { return String(dt); }
    }

    async function loadTm1Config() {
      tm1Config.value = await getAiAgentTm1Config();
    }

    async function loadAgentStatus() {
      statusLoading.value = true;
      try { agentStatus.value = await getAiAgentStatus(); }
      finally { statusLoading.value = false; }
    }

    async function refreshSessionData() {
      if (!activeSessionId.value) { messages.value = []; return; }
      messages.value = await getSessionMessages(activeSessionId.value);
      await nextTick();
      scrollChatToBottom();
    }

    async function loadProjects() {
      projects.value = await listAiAgentProjects();
      if (!activeProjectId.value && projects.value.length) {
        activeProjectId.value = projects.value[0].id;
      }
    }

    async function loadSessionsForActiveProject() {
      if (!activeProjectId.value) {
        sessions.value = [];
        activeSessionId.value = null;
        messages.value = [];
        return;
      }
      sessions.value = await listAiAgentSessionsByProject(activeProjectId.value);
      if (!activeSessionId.value && sessions.value.length) {
        activeSessionId.value = sessions.value[0].id;
      }
    }

    async function handleProjectChanged() {
      activeSessionId.value = null;
      await loadSessionsForActiveProject();
      await refreshSessionData();
      await loadProjectMemoryEditor();
      await loadProjectDocs();
    }

    function selectSession(id) {
      activeSessionId.value = id;
      refreshSessionData();
    }

    function scrollChatToBottom() {
      const el = chatScrollRef.value;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    }

    async function handleNewProject() {
      let name;
      try {
        name = (await openPrompt({ title: 'New project', message: 'Enter a project name' })).trim();
      } catch { return; }
      if (!name) return;
      try {
        const created = await createAiAgentProject({ name });
        lastResult.value = created;
        await loadProjects();
        activeProjectId.value = created.id;
        await handleProjectChanged();
      } catch (err) {
        lastResult.value = { success: false, message: err.response?.data?.error || err.message, detail: err.response?.data || null };
      }
    }

    async function handleNewChat() {
      if (!activeProjectId.value) return;
      creatingSession.value = true;
      try {
        const created = await createAiAgentSession({
          title: `New chat (${new Date().toLocaleString()})`,
          tenant_id: tenantId.value,
          project_id: activeProjectId.value,
        });
        lastResult.value = created;
        await loadSessionsForActiveProject();
        activeSessionId.value = created.id;
        await refreshSessionData();
      } finally { creatingSession.value = false; }
    }

    async function handleTm1Test() {
      tm1TestLoading.value = true;
      try {
        lastResult.value = await testAiAgentTm1Connection();
      } catch (err) {
        lastResult.value = { success: false, message: err.response?.data?.message || err.message, detail: err.response?.data || null };
      } finally { tm1TestLoading.value = false; }
    }

    async function handleSaveTm1Config() {
      savingTm1Config.value = true;
      try {
        lastResult.value = await saveAiAgentTm1Config({
          base_url: tm1Config.value.base_url,
          username: tm1Config.value.username,
          password: tm1Config.value.password,
        });
        await loadTm1Config();
      } finally { savingTm1Config.value = false; }
    }

    function startExecutionPolling() {
      stopExecutionPolling();
      thinkingSteps.value = [];
      executionPollTimer = setInterval(async () => {
        if (!activeSessionId.value) return;
        try {
          const execs = await getSessionExecutions(activeSessionId.value);
          if (execs && execs.length) {
            const latest = execs[execs.length - 1];
            const steps = latest.steps || latest.tool_calls || latest.executions || [];
            if (Array.isArray(steps) && steps.length) {
              thinkingSteps.value = steps;
            } else if (latest.status || latest.tool_name) {
              thinkingSteps.value = execs;
            }
            scrollChatToBottom();
          }
        } catch { /* silently ignore polling errors */ }
      }, 2000);
    }

    function stopExecutionPolling() {
      if (executionPollTimer) { clearInterval(executionPollTimer); executionPollTimer = null; }
    }

    async function handleSendChat() {
      if (!activeSessionId.value) return;
      const text = chatInput.value.trim();
      if (!text) return;
      chatLoading.value = true;
      startExecutionPolling();
      try {
        lastResult.value = await runSessionWithTools(activeSessionId.value, { message: text });
        chatInput.value = '';
        await refreshSessionData();
      } catch (err) {
        lastResult.value = { success: false, message: err.response?.data?.message || err.message, detail: err.response?.data || null };
      } finally {
        stopExecutionPolling();
        thinkingSteps.value = [];
        chatLoading.value = false;
      }
    }

    async function handleImportCursorChat() {
      if (!activeSessionId.value) return;
      try {
        lastResult.value = await importCursorChatToSession(activeSessionId.value, {});
        await refreshSessionData();
      } catch (err) {
        lastResult.value = { success: false, message: err.response?.data?.message || err.message, detail: err.response?.data || null };
      }
    }

    async function loadProjectDocs() {
      if (!activeProjectId.value) { systemDocs.value = []; return; }
      docsLoading.value = true;
      try {
        systemDocs.value = await listSystemDocuments(activeProjectId.value);
      } catch (err) {
        lastResult.value = { success: false, message: err.response?.data?.error || err.message, detail: err.response?.data || null };
      } finally { docsLoading.value = false; }
    }

    async function handleTogglePin(doc) {
      try {
        lastResult.value = await updateSystemDocument(doc.id, { pin_to_context: !doc.pin_to_context });
        await loadProjectDocs();
      } catch (err) {
        lastResult.value = { success: false, message: err.response?.data?.error || err.message, detail: err.response?.data || null };
      }
    }

    async function handleSetDocOrder(doc, orderValue) {
      try {
        lastResult.value = await updateSystemDocument(doc.id, { context_order: orderValue });
        await loadProjectDocs();
      } catch (err) {
        lastResult.value = { success: false, message: err.response?.data?.error || err.message, detail: err.response?.data || null };
      }
    }

    async function handleExportChatToDoc() {
      if (!activeSessionId.value) return;
      let slug;
      try {
        slug = (await openPrompt({
          title: 'Export chat to project',
          message: 'Enter a document slug (used for sharing/pinning)',
          placeholder: `chat-${activeSessionId.value}`,
        })).trim();
      } catch { return; }
      if (!slug) return;
      try {
        lastResult.value = await exportSessionToSystemDoc(activeSessionId.value, {
          doc_slug: slug, pin_to_context: true, include_tool_executions: true,
        });
        await loadProjectDocs();
      } catch (err) {
        lastResult.value = { success: false, message: err.response?.data?.error || err.message, detail: err.response?.data || null };
      }
    }

    async function loadProjectMemoryEditor() {
      if (!activeProjectId.value) { projectMemoryJson.value = '{}'; return; }
      try {
        const p = await getAiAgentProject(activeProjectId.value);
        projectMemoryJson.value = JSON.stringify(p.memory || {}, null, 2);
      } catch (err) {
        projectMemoryJson.value = '{}';
        lastResult.value = { success: false, message: err.response?.data?.error || err.message, detail: err.response?.data || null };
      }
    }

    async function handleSaveProjectMemory() {
      if (!activeProjectId.value) return;
      projectSaving.value = true;
      try {
        const parsed = JSON.parse(projectMemoryJson.value || '{}');
        lastResult.value = await updateAiAgentProject(activeProjectId.value, { memory: parsed });
        await loadProjects();
        await loadProjectMemoryEditor();
      } catch (err) {
        lastResult.value = { success: false, message: err.response?.data?.error || err.message, detail: err.response?.data || null };
      } finally { projectSaving.value = false; }
    }

    async function handleGenerateSystemDoc() {
      systemDocLoading.value = true;
      try {
        lastResult.value = await generateSystemDocument({
          slug: systemDocSlug.value,
          title: systemDocTitle.value,
          project_id: activeProjectId.value,
          include_django: true,
          include_tm1: true,
        });
      } catch (err) {
        lastResult.value = { success: false, message: err.response?.data?.error || err.message, detail: err.response?.data || null };
      } finally { systemDocLoading.value = false; }
    }

    async function handleImportTm1Docs() {
      if (!activeProjectId.value) return;
      tm1DocsLoading.value = true;
      try {
        lastResult.value = await importTm1DocsToProject(activeProjectId.value, {
          pin_summary: true,
          split_docs: true,
          include_elements: true,
          elements_per_hierarchy: 200,
          include_process_code: true,
          include_cube_rules: true,
        });
        await loadProjectDocs();
      } catch (err) {
        lastResult.value = { success: false, message: err.response?.data?.error || err.message, detail: err.response?.data || null };
      } finally { tm1DocsLoading.value = false; }
    }

    async function handleRefreshGlossary() {
      if (!activeProjectId.value) return;
      glossaryRefreshLoading.value = true;
      try {
        lastResult.value = await refreshAiAgentGlossary({ project_id: activeProjectId.value, vectorize: true });
        await loadProjectDocs();
      } catch (err) {
        lastResult.value = { success: false, message: err.response?.data?.error || err.message, detail: err.response?.data || null };
      } finally { glossaryRefreshLoading.value = false; }
    }

    async function openDocsDrawer() {
      docsDrawerOpen.value = true;
      selectedDocDetail.value = null;
      if (activeProjectId.value) await loadProjectDocs();
    }

    function closeDocDetail() {
      selectedDocDetail.value = null;
    }

    async function selectDoc(d) {
      docDetailLoading.value = true;
      selectedDocDetail.value = null;
      try {
        selectedDocDetail.value = await getSystemDocument(d.id);
      } catch (err) {
        lastResult.value = { success: false, message: err.response?.data?.error || err.message, detail: err.response?.data || null };
      } finally { docDetailLoading.value = false; }
    }

    function requestChangesForDoc(doc) {
      const prefix = `Regarding the system document "${doc.title || doc.slug}" (slug: ${doc.slug}), please suggest the following changes: `;
      chatInput.value = prefix;
      docsDrawerOpen.value = false;
      selectedDocDetail.value = null;
      nextTick(() => {
        const input = document.querySelector('.ai-chat-input textarea');
        if (input) input.focus();
      });
    }

    onMounted(async () => {
      await loadAgentStatus();
      await loadTm1Config();
      await loadProjects();
      await loadSessionsForActiveProject();
      await refreshSessionData();
      await loadProjectMemoryEditor();
      await loadProjectDocs();
    });

    return {
      tenantId, mode,
      projects, activeProjectId, activeProject,
      sessions, activeSessionId, activeSession,
      messages, chatInput, chatLoading, chatScrollRef, thinkingSteps,
      lastResult, creatingSession, projectSaving, savingTm1Config,
      statusLoading, tm1TestLoading, runWithToolsLoading,
      tm1Config, agentStatus, projectOptions,
      projectMemoryJson, systemDocSlug, systemDocTitle, systemDocLoading,
      docsLoading, systemDocs, tm1DocsLoading, glossaryRefreshLoading,
      docsDrawerOpen, selectedDocDetail, docDetailLoading,
      promptDialog,
      renderMarkdown, prettyResult, formatUpdatedAt,
      refreshSessionData, loadAgentStatus,
      handleSaveTm1Config, handleTm1Test,
      handleNewProject, handleNewChat, handleProjectChanged,
      selectSession, handleSendChat, handleImportCursorChat,
      handleSaveProjectMemory, handleGenerateSystemDoc,
      handleImportTm1Docs, handleRefreshGlossary, handleExportChatToDoc,
      handleTogglePin, handleSetDocOrder, loadProjectDocs,
      openDocsDrawer, closeDocDetail, selectDoc, requestChangesForDoc,
      confirmPrompt, cancelPrompt,
    };
  },
});
</script>

<style scoped>
/* ── Page shell ───────────────────────────────────────────────── */
.ai-agent-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--kdl-page-bg, #f6f7f8);
}

/* ── Topbar ───────────────────────────────────────────────────── */
.ai-topbar {
  min-height: 44px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--kdl-border-subtle);
  background: var(--kdl-card-bg);
  flex-shrink: 0;
}

.ai-topbar__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 12px;
}

.ai-topbar__left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ai-topbar__right {
  display: flex;
  align-items: center;
}

.ai-topbar__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--kdl-text-primary);
}

/* ── Mode toggle ──────────────────────────────────────────────── */
.ai-mode-toggle {
  display: inline-flex;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 6px;
  overflow: hidden;
}

.ai-mode-toggle__btn {
  padding: 4px 14px;
  border: none;
  background: transparent;
  font-size: 13px;
  font-family: inherit;
  color: var(--kdl-text-secondary);
  cursor: pointer;
  transition: background 120ms, color 120ms;
}

.ai-mode-toggle__btn:hover {
  background: var(--kdl-hover-bg);
  color: var(--kdl-text-primary);
}

.ai-mode-toggle__btn--active {
  background: var(--kdl-accent);
  color: #fff;
}

.ai-mode-toggle__btn--active:hover {
  background: var(--kdl-accent);
  color: #fff;
}

/* ── Chat layout ──────────────────────────────────────────────── */
.ai-shell {
  display: flex;
  flex: 1;
  overflow: hidden;
  position: relative;
}

/* ── Sidebar ──────────────────────────────────────────────────── */
.ai-sidebar {
  width: 320px;
  background: var(--kdl-card-bg);
  border-right: 1px solid var(--kdl-border-subtle);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.ai-sidebar-header {
  padding: 12px;
}

.ai-sidebar-row {
  display: flex;
  align-items: center;
}

.ai-sidebar-row--between {
  justify-content: space-between;
}

.ai-sidebar-row--mt {
  margin-top: 10px;
}

.ai-sidebar-select {
  margin-top: 6px;
}

.ai-sidebar-scroll {
  flex: 1;
  overflow-y: auto;
}

.ai-section-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--kdl-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.ai-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 5px;
  color: var(--kdl-text-muted);
  cursor: pointer;
  transition: background 100ms;
}

.ai-icon-btn:hover { background: var(--kdl-hover-bg); color: var(--kdl-text-primary); }
.ai-icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* ── Session list ─────────────────────────────────────────────── */
.ai-session-list {
  list-style: none;
  padding: 4px 8px;
  margin: 0;
}

.ai-session-item {
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 100ms;
}

.ai-session-item:hover { background: var(--kdl-hover-bg); }
.ai-session-item--active { background: var(--kdl-selected-bg, rgba(0,0,0,0.07)); }

.ai-session-title {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--kdl-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ai-session-date {
  display: block;
  font-size: 11px;
  color: var(--kdl-text-muted);
  margin-top: 2px;
}

/* ── Chat area ────────────────────────────────────────────────── */
.ai-chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.ai-chat-scroll {
  flex: 1;
  overflow-y: auto;
}

.ai-chat-inner {
  max-width: 900px;
  margin: 0 auto;
  padding: 16px 16px 24px;
}

.ai-empty-hint {
  font-size: 13px;
  color: var(--kdl-text-muted);
  padding: 16px 0;
  margin: 0;
}

/* ── Messages ─────────────────────────────────────────────────── */
.ai-msg-row {
  display: flex;
  margin: 10px 0;
}

.ai-msg-row--user { justify-content: flex-end; }
.ai-msg-row--assistant { justify-content: flex-start; }

.ai-msg-bubble {
  max-width: 760px;
  width: fit-content;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--kdl-card-bg);
  border: 1px solid var(--kdl-border-subtle);
  white-space: pre-wrap;
}

.ai-msg-bubble--user {
  background: #e8f0ff;
  border-color: rgba(0, 0, 0, 0.06);
}

.ai-msg-meta {
  font-size: 11px;
  color: var(--kdl-text-muted);
  margin-bottom: 6px;
}

.ai-msg-content {
  font-size: 14px;
  line-height: 1.5;
  color: var(--kdl-text-primary);
}

.ai-msg-markdown :deep(h1),
.ai-msg-markdown :deep(h2),
.ai-msg-markdown :deep(h3) { margin: 0.5em 0 0.25em; font-weight: 600; }
.ai-msg-markdown :deep(h1) { font-size: 1.25em; }
.ai-msg-markdown :deep(h2) { font-size: 1.1em; }
.ai-msg-markdown :deep(h3) { font-size: 1em; }
.ai-msg-markdown :deep(p) { margin: 0.5em 0; }
.ai-msg-markdown :deep(ul),
.ai-msg-markdown :deep(ol) { margin: 0.5em 0; padding-left: 1.5em; }
.ai-msg-markdown :deep(code) { background: rgba(0,0,0,0.06); padding: 0.15em 0.4em; border-radius: 4px; font-size: 0.9em; }
.ai-msg-markdown :deep(pre) { background: rgba(0,0,0,0.06); padding: 10px; border-radius: 6px; overflow: auto; margin: 0.5em 0; }
.ai-msg-markdown :deep(pre code) { padding: 0; background: none; }
.ai-msg-markdown :deep(a) { color: var(--kdl-accent); }

/* ── Thinking / loading ───────────────────────────────────────── */
.ai-thinking-bubble { min-width: 280px; }

.ai-thinking-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ai-thinking-text {
  font-size: 13px;
  color: var(--kdl-text-muted);
}

.ai-thinking-steps {
  margin-top: 6px;
  border-top: 1px solid var(--kdl-border-subtle);
  padding-top: 6px;
}

.ai-thinking-step {
  display: flex;
  align-items: center;
  font-size: 12px;
  padding: 2px 0;
  color: var(--kdl-text-secondary);
}

.ai-step-icon { flex-shrink: 0; margin-right: 4px; }
.ai-step-icon--ok { color: var(--kdl-success, #22c55e); }
.ai-step-icon--err { color: var(--kdl-error, #ef4444); }
.ai-step-icon--pending { color: var(--kdl-text-muted); }

.ai-step-label { font-weight: 500; }

.ai-step-duration {
  margin-left: 6px;
  color: var(--kdl-text-muted);
  font-size: 11px;
}

.ai-step-summary {
  margin-left: 6px;
  color: var(--kdl-text-muted);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 300px;
}

/* ── Chat input ───────────────────────────────────────────────── */
.ai-chat-input {
  background: var(--kdl-card-bg);
  border-top: 1px solid var(--kdl-border-subtle);
  padding: 12px 16px 16px;
}

.ai-chat-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
}

.ai-tenant-hint {
  font-size: 12px;
  color: var(--kdl-text-muted);
}

.ai-chat-buttons {
  display: flex;
  gap: 8px;
}

/* ── Docs slide-over ──────────────────────────────────────────── */
.ai-docs-drawer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 420px;
  max-width: 95vw;
  background: var(--kdl-card-bg);
  border-left: 1px solid var(--kdl-border-subtle);
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  z-index: 10;
}

.ai-docs-drawer__inner {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.ai-docs-drawer__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--kdl-border-subtle);
  flex-shrink: 0;
}

.ai-docs-drawer__body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.ai-back-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 12px;
}

.ai-doc-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--kdl-text-primary);
  margin-bottom: 4px;
}

.ai-doc-slug {
  font-size: 12px;
  color: var(--kdl-text-muted);
  margin-bottom: 12px;
}

.ai-doc-content {
  background: var(--kdl-page-bg);
  padding: 10px;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.5;
  max-height: 60vh;
  overflow: auto;
  margin-bottom: 12px;
}

.ai-doc-content :deep(h1),
.ai-doc-content :deep(h2),
.ai-doc-content :deep(h3) { margin: 0.75em 0 0.35em; font-weight: 600; }
.ai-doc-content :deep(h1) { font-size: 1.2em; }
.ai-doc-content :deep(h2) { font-size: 1.1em; }
.ai-doc-content :deep(h3) { font-size: 1em; }
.ai-doc-content :deep(p) { margin: 0.5em 0; }
.ai-doc-content :deep(ul),
.ai-doc-content :deep(ol) { margin: 0.5em 0; padding-left: 1.5em; }
.ai-doc-content :deep(code) { background: rgba(0,0,0,0.08); padding: 0.15em 0.4em; border-radius: 4px; font-size: 0.9em; }
.ai-doc-content :deep(pre) { background: rgba(0,0,0,0.08); padding: 10px; border-radius: 6px; overflow: auto; margin: 0.5em 0; }
.ai-doc-content :deep(pre code) { padding: 0; background: none; }
.ai-doc-content :deep(a) { color: var(--kdl-accent); }

.ai-doc-request-btn { width: 100%; justify-content: center; }

.ai-doc-list {
  list-style: none;
  padding: 0;
  margin: 0;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 6px;
  overflow: hidden;
}

.ai-doc-item {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  cursor: pointer;
  border-bottom: 1px solid var(--kdl-border-subtle);
  transition: background 100ms;
}

.ai-doc-item:last-child { border-bottom: none; }
.ai-doc-item:hover { background: var(--kdl-hover-bg); }

.ai-doc-item__meta { flex: 1; min-width: 0; }
.ai-doc-item__title { display: block; font-size: 13px; font-weight: 500; color: var(--kdl-text-primary); }
.ai-doc-item__slug { display: block; font-size: 11px; color: var(--kdl-text-muted); }
.ai-doc-item__chevron { flex-shrink: 0; color: var(--kdl-text-muted); margin-left: 8px; }
.ai-doc-loading { font-size: 13px; color: var(--kdl-text-muted); }

/* Transition for slide-over */
.ai-drawer-enter-active,
.ai-drawer-leave-active { transition: transform 200ms ease, opacity 200ms ease; }
.ai-drawer-enter-from,
.ai-drawer-leave-to { transform: translateX(100%); opacity: 0; }

/* ── Setup mode ───────────────────────────────────────────────── */
.ai-setup {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.ai-setup-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  max-width: 1200px;
}

@media (max-width: 900px) {
  .ai-setup-grid { grid-template-columns: 1fr; }
}

.ai-setup-col {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ── Cards ────────────────────────────────────────────────────── */
.ai-card {
  background: var(--kdl-card-bg);
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 8px;
  overflow: hidden;
}

.ai-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--kdl-border-subtle);
}

.ai-card__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--kdl-text-primary);
}

.ai-card__subtitle {
  font-size: 12px;
  color: var(--kdl-text-muted);
  margin-top: 2px;
}

.ai-card__body {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* ── Form helpers ─────────────────────────────────────────────── */
.ai-form-stack { display: flex; flex-direction: column; gap: 10px; }

.ai-form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.ai-action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ai-badge-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ai-caption {
  font-size: 12px;
  color: var(--kdl-text-muted);
}

/* ── Doc management list ──────────────────────────────────────── */
.ai-doc-mgmt-list {
  list-style: none;
  padding: 0;
  margin: 0;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 6px;
  overflow: hidden;
}

.ai-doc-mgmt-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--kdl-border-subtle);
  gap: 12px;
}

.ai-doc-mgmt-item:last-child { border-bottom: none; }

.ai-doc-mgmt-item__meta { flex: 1; min-width: 0; }
.ai-doc-mgmt-item__title { display: block; font-size: 13px; font-weight: 500; color: var(--kdl-text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.ai-doc-mgmt-item__controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.ai-order-input { width: 90px; }

/* ── Result block ─────────────────────────────────────────────── */
.result-block {
  max-height: 300px;
  overflow: auto;
  background: var(--kdl-page-bg);
  padding: 12px;
  border-radius: 6px;
  font-size: 12px;
  margin: 0;
}

/* ── Prompt dialog ────────────────────────────────────────────── */
.ai-prompt-body { display: flex; flex-direction: column; gap: 10px; padding: 4px 0 8px; }
.ai-prompt-msg { margin: 0; font-size: 13px; color: var(--kdl-text-secondary); }
</style>
