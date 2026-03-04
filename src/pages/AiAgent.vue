<template>
  <q-page class="ai-agent-page">
    <div class="ai-topbar">
      <div class="row items-center justify-between">
        <div class="row items-center q-gutter-sm">
          <div class="text-h6">AI Agent</div>
          <q-badge v-if="activeProject" color="grey-8" outline>
            Project: {{ activeProject.name }}
          </q-badge>
          <q-badge v-if="activeSession" color="grey-8" outline>
            Chat: {{ activeSession.title }}
          </q-badge>
        </div>

        <div class="row items-center q-gutter-sm">
          <q-btn-toggle
            v-model="mode"
            spread
            unelevated
            toggle-color="primary"
            color="grey-3"
            text-color="grey-9"
            :options="[
              { label: 'Chat', value: 'chat' },
              { label: 'Setup', value: 'setup' }
            ]"
          />
        </div>
      </div>
    </div>

    <!-- CHAT MODE -->
    <div v-if="mode === 'chat'" class="ai-shell">
      <div class="ai-sidebar">
        <div class="ai-sidebar-header">
          <div class="row items-center justify-between">
            <div class="text-subtitle2">Projects</div>
            <q-btn dense flat icon="add" @click="handleNewProject" />
          </div>
          <q-select
            v-model="activeProjectId"
            :options="projectOptions"
            dense
            outlined
            emit-value
            map-options
            label="Active project"
            class="q-mt-sm"
            @update:model-value="handleProjectChanged"
          />
          <div class="row items-center justify-between q-mt-sm">
            <div class="text-subtitle2">Chats</div>
            <q-btn dense flat icon="chat" @click="handleNewChat" :disable="!activeProjectId" />
          </div>
        </div>

        <q-scroll-area class="ai-sidebar-scroll">
          <q-list padding>
            <q-item
              v-for="s in sessions"
              :key="s.id"
              clickable
              v-ripple
              :active="s.id === activeSessionId"
              active-class="ai-active-item"
              @click="selectSession(s.id)"
            >
              <q-item-section>
                <q-item-label lines="1">{{ s.title || `Chat ${s.id}` }}</q-item-label>
                <q-item-label caption lines="1">{{ formatUpdatedAt(s.updated_at) }}</q-item-label>
              </q-item-section>
            </q-item>
          </q-list>
        </q-scroll-area>
      </div>

      <div class="ai-chat">
        <q-scroll-area ref="chatScrollRef" class="ai-chat-scroll">
          <div class="ai-chat-inner">
            <div v-if="!activeSessionId" class="text-grey-7 q-pa-md">
              Select a chat, or create a new one.
            </div>

            <div v-else>
              <div
                v-for="m in messages"
                :key="m.id"
                class="ai-msg-row"
                :class="m.role === 'user' ? 'ai-msg-user' : 'ai-msg-assistant'"
              >
                <div class="ai-msg-bubble">
                  <div class="ai-msg-meta">
                    {{ m.role === 'user' ? 'You' : (m.role === 'system' ? 'System' : 'Agent') }}
                  </div>
                  <div v-if="m.role === 'user'" class="ai-msg-content">{{ m.content }}</div>
                  <div v-else class="ai-msg-content ai-msg-markdown" v-html="renderMarkdown(m.content)" />
                </div>
              </div>

              <div v-if="chatLoading" class="ai-msg-row ai-msg-assistant">
                <div class="ai-msg-bubble">
                  <div class="ai-msg-meta">Agent</div>
                  <div class="ai-msg-content text-grey-7">Thinking…</div>
                </div>
              </div>
            </div>
          </div>
        </q-scroll-area>

        <div class="ai-chat-input">
          <q-input
            v-model="chatInput"
            type="textarea"
            autogrow
            outlined
            dense
            placeholder="Message Klikk AI Agent…"
            :disable="!activeSessionId || chatLoading"
            @keydown.enter.exact.prevent="handleSendChat"
          />
          <div class="row items-center justify-between q-mt-sm">
            <div class="text-caption text-grey-7">
              Tenant: {{ tenantId || 'none' }}
            </div>
            <div class="row q-gutter-sm">
              <q-btn flat label="View docs" :disable="!activeProjectId" @click="openDocsDrawer" />
              <q-btn flat label="Import Cursor Chat" :disable="!activeSessionId" @click="handleImportCursorChat" />
              <q-btn flat label="Share to Project" :disable="!activeSessionId" @click="handleExportChatToDoc" />
              <q-btn color="primary" label="Send" :disable="!activeSessionId || !chatInput.trim() || chatLoading" @click="handleSendChat" />
            </div>
          </div>
        </div>
      </div>

      <!-- System docs drawer: view .md and request changes -->
      <q-drawer
        v-model="docsDrawerOpen"
        side="right"
        bordered
        overlay
        behavior="mobile"
        class="ai-docs-drawer"
      >
        <q-scroll-area class="full-height full-width">
          <div class="q-pa-md">
            <div class="row items-center justify-between q-mb-md">
              <div class="text-subtitle1">System documentation</div>
              <q-btn dense flat round icon="close" @click="docsDrawerOpen = false" />
            </div>
            <template v-if="selectedDocDetail">
              <q-btn flat dense icon="arrow_back" label="Back" class="q-mb-sm" @click="closeDocDetail" />
              <div class="text-h6 q-mb-xs">{{ selectedDocDetail.title || selectedDocDetail.slug }}</div>
              <div class="text-caption text-grey-7 q-mb-md">Slug: {{ selectedDocDetail.slug }}</div>
              <div
                class="ai-doc-content q-pa-sm rounded-borders"
                v-html="renderMarkdown(selectedDocDetail.content_markdown || '')"
              />
              <q-btn
                color="primary"
                label="Request changes in chat"
                class="q-mt-md full-width"
                @click="requestChangesForDoc(selectedDocDetail)"
              />
            </template>
            <template v-else>
              <div v-if="docDetailLoading" class="text-grey-7">Loading…</div>
              <q-list v-else-if="systemDocs.length" bordered separator>
                <q-item
                  v-for="d in systemDocs"
                  :key="d.id"
                  clickable
                  v-ripple
                  @click="selectDoc(d)"
                >
                  <q-item-section>
                    <q-item-label>{{ d.title || d.slug }}</q-item-label>
                    <q-item-label caption>{{ d.slug }}</q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <q-icon name="chevron_right" />
                  </q-item-section>
                </q-item>
              </q-list>
              <div v-else class="text-caption text-grey-7">
                No documents. Add docs in Setup or generate a system doc.
              </div>
            </template>
          </div>
        </q-scroll-area>
      </q-drawer>
    </div>

    <!-- SETUP MODE -->
    <div v-else class="q-pa-md">
      <div class="row q-col-gutter-md">
        <div class="col-12 col-lg-6">
          <q-card class="q-mb-md">
            <q-card-section>
              <div class="row items-center justify-between">
                <div>
                  <div class="text-subtitle1">Agent Status</div>
                  <div class="text-caption text-grey-7">Readiness only, no secret values exposed.</div>
                </div>
                <q-btn flat color="primary" label="Refresh" :loading="statusLoading" @click="loadAgentStatus" />
              </div>
              <div v-if="agentStatus" class="q-mt-sm">
                <q-badge :color="agentStatus.providers?.openai_configured ? 'positive' : 'grey-6'" class="q-mr-sm">
                  OpenAI: {{ agentStatus.providers?.openai_configured ? 'configured' : 'not configured' }}
                </q-badge>
                <q-badge :color="agentStatus.tm1?.configured ? 'positive' : 'grey-6'">
                  TM1: {{ agentStatus.tm1?.configured ? 'configured' : 'not configured' }}
                </q-badge>
                <div class="text-caption q-mt-xs">Active model: {{ agentStatus.providers?.active_model || '-' }}</div>
              </div>
            </q-card-section>
          </q-card>

          <q-card class="q-mb-md">
            <q-card-section>
              <div class="text-subtitle1">TM1 Config (shared)</div>
              <div class="row q-col-gutter-sm q-mt-sm">
                <div class="col-12">
                  <q-input v-model="tm1Config.base_url" dense outlined label="Base URL (e.g. http://host:port/api/v1/)" />
                </div>
                <div class="col-12 col-md-6">
                  <q-input v-model="tm1Config.username" dense outlined label="Username" />
                </div>
                <div class="col-12 col-md-6">
                  <q-input v-model="tm1Config.password" dense outlined type="password" label="Password" />
                </div>
              </div>
              <div class="q-mt-sm">
                <q-btn color="primary" label="Save TM1 Config" :loading="savingTm1Config" @click="handleSaveTm1Config" />
                <q-btn flat label="Test Connection" class="q-ml-sm" :loading="tm1TestLoading" @click="handleTm1Test" />
                <q-btn
                  flat
                  label="Import TM1 Docs"
                  class="q-ml-sm"
                  :loading="tm1DocsLoading"
                  :disable="!activeProjectId"
                  @click="handleImportTm1Docs"
                />
              </div>
            </q-card-section>
          </q-card>
        </div>

        <div class="col-12 col-lg-6">
          <q-card class="q-mb-md">
            <q-card-section>
              <div class="text-subtitle1">Project memory (shared across chats)</div>
              <div class="text-caption text-grey-7">Store cube/dimension meaning, conventions, URLs, etc.</div>
              <q-input
                v-model="projectMemoryJson"
                type="textarea"
                autogrow
                outlined
                dense
                class="q-mt-sm"
                placeholder='{"tm1_base_url":"...","cube_notes":{...}}'
              />
              <div class="q-mt-sm">
                <q-btn color="primary" label="Save Project Memory" :disable="!activeProjectId" :loading="projectSaving" @click="handleSaveProjectMemory" />
              </div>
            </q-card-section>
          </q-card>

          <q-card class="q-mb-md">
            <q-card-section>
              <div class="text-subtitle1">System document</div>
              <div class="text-caption text-grey-7">Auto-generate a structured Markdown doc into the database.</div>
              <div class="row q-col-gutter-sm q-mt-sm">
                <div class="col-12 col-md-6">
                  <q-input v-model="systemDocSlug" dense outlined label="Doc slug" />
                </div>
                <div class="col-12 col-md-6">
                  <q-input v-model="systemDocTitle" dense outlined label="Doc title" />
                </div>
              </div>
              <div class="q-mt-sm">
                <q-btn color="primary" label="Generate" :loading="systemDocLoading" @click="handleGenerateSystemDoc" />
              </div>
            </q-card-section>
          </q-card>

          <q-card class="q-mb-md">
            <q-card-section>
              <div class="row items-center justify-between">
                <div>
                  <div class="text-subtitle1">Project documents (shared context)</div>
                  <div class="text-caption text-grey-7">Pin documents so every chat in this project can reference them.</div>
                </div>
                <q-btn flat label="Refresh" :loading="docsLoading" @click="loadProjectDocs" />
              </div>

              <q-list bordered separator class="q-mt-sm" v-if="systemDocs.length">
                <q-item v-for="d in systemDocs" :key="d.id">
                  <q-item-section>
                    <q-item-label lines="1">{{ d.title || d.slug }}</q-item-label>
                    <q-item-label caption lines="1">{{ d.slug }} • order {{ d.context_order }}</q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <div class="row items-center q-gutter-sm">
                      <q-input
                        dense
                        outlined
                        style="width: 90px"
                        type="number"
                        :model-value="d.context_order"
                        @update:model-value="(v) => handleSetDocOrder(d, v)"
                        label="Order"
                      />
                      <q-toggle :model-value="d.pin_to_context" @update:model-value="() => handleTogglePin(d)" label="Pin" />
                    </div>
                  </q-item-section>
                </q-item>
              </q-list>
              <div v-else class="text-caption text-grey-7 q-mt-sm">
                No documents yet. Generate a system doc or “Share to Project” from a chat.
              </div>
            </q-card-section>
          </q-card>

          <q-card class="q-mb-md">
            <q-card-section>
              <div class="text-subtitle1">Vectorized knowledge (keep up to date)</div>
              <div class="text-caption text-grey-7">
                Account names/purpose and contacts (Suppliers vs Customers) are synced from Xero. When Xero data changes, refresh and re-vectorize so the agent understands accounts and who is a supplier vs customer.
              </div>
              <div class="q-mt-sm">
                <q-btn
                  color="primary"
                  label="Refresh glossary & re-vectorize"
                  :loading="glossaryRefreshLoading"
                  :disable="!activeProjectId"
                  @click="handleRefreshGlossary"
                />
              </div>
            </q-card-section>
          </q-card>

          <q-card>
            <q-card-section>
              <div class="text-subtitle1">Last API Result</div>
              <pre class="result-block">{{ prettyResult(lastResult) }}</pre>
            </q-card-section>
          </q-card>
        </div>
      </div>
    </div>
  </q-page>
</template>

<script>
import { defineComponent, ref, computed, onMounted, nextTick } from 'vue';
import { useQuasar } from 'quasar';
import { marked } from 'marked';
import { useDataStore } from '../stores/data';
import {
  getAiAgentStatus,
  getAiAgentTm1Config,
  getSessionMessages,
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
  setup() {
    const $q = useQuasar();
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

    const tm1Config = ref({
      base_url: '',
      username: '',
      password: '',
    });
    const agentStatus = ref(null);

    const projectOptions = computed(() =>
      projects.value.map((p) => ({ label: p.name, value: p.id }))
    );

    const activeProject = computed(() => projects.value.find((p) => p.id === activeProjectId.value) || null);
    const activeSession = computed(() => sessions.value.find((s) => s.id === activeSessionId.value) || null);

    const chatInput = ref('');
    const chatScrollRef = ref(null);

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

    function prettyResult(value) {
      if (!value) return '';
      return JSON.stringify(value, null, 2);
    }

    function formatUpdatedAt(dt) {
      if (!dt) return '';
      try {
        return new Date(dt).toLocaleString();
      } catch {
        return String(dt);
      }
    }

    async function loadTm1Config() {
      tm1Config.value = await getAiAgentTm1Config();
    }

    async function loadAgentStatus() {
      statusLoading.value = true;
      try {
        agentStatus.value = await getAiAgentStatus();
      } finally {
        statusLoading.value = false;
      }
    }

    async function refreshSessionData() {
      if (!activeSessionId.value) {
        messages.value = [];
        return;
      }
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
      const scroll = chatScrollRef.value;
      const el = scroll?.$el;
      if (!el) return;
      // QScrollArea structure: find scrollable container.
      const target = el.querySelector('.q-scrollarea__container');
      if (target) target.scrollTop = target.scrollHeight;
    }

    async function handleNewProject() {
      $q.dialog({
        title: 'New project',
        message: 'Enter a project name',
        prompt: {
          model: '',
          type: 'text',
        },
        cancel: true,
        persistent: true,
      }).onOk(async (val) => {
        const name = (val || '').trim();
        if (!name) return;
        try {
          const created = await createAiAgentProject({ name });
          lastResult.value = created;
          await loadProjects();
          activeProjectId.value = created.id;
          await handleProjectChanged();
        } catch (err) {
          lastResult.value = {
            success: false,
            message: err.response?.data?.error || err.message,
            detail: err.response?.data || null,
          };
        }
      });
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
      } finally {
        creatingSession.value = false;
      }
    }

    async function handleTm1Test() {
      tm1TestLoading.value = true;
      try {
        lastResult.value = await testAiAgentTm1Connection();
      } catch (err) {
        lastResult.value = {
          success: false,
          message: err.response?.data?.message || err.message,
          detail: err.response?.data || null,
        };
      } finally {
        tm1TestLoading.value = false;
      }
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
      } finally {
        savingTm1Config.value = false;
      }
    }

    async function handleSendChat() {
      if (!activeSessionId.value) return;
      const text = chatInput.value.trim();
      if (!text) return;
      chatLoading.value = true;
      try {
        lastResult.value = await runSessionWithTools(activeSessionId.value, {
          message: text,
        });
        chatInput.value = '';
        await refreshSessionData();
      } catch (err) {
        lastResult.value = {
          success: false,
          message: err.response?.data?.message || err.message,
          detail: err.response?.data || null,
        };
      } finally {
        chatLoading.value = false;
      }
    }

    async function handleImportCursorChat() {
      if (!activeSessionId.value) return;
      try {
        lastResult.value = await importCursorChatToSession(activeSessionId.value, {});
        await refreshSessionData();
      } catch (err) {
        lastResult.value = {
          success: false,
          message: err.response?.data?.message || err.message,
          detail: err.response?.data || null,
        };
      }
    }

    async function loadProjectDocs() {
      if (!activeProjectId.value) {
        systemDocs.value = [];
        return;
      }
      docsLoading.value = true;
      try {
        systemDocs.value = await listSystemDocuments(activeProjectId.value);
      } catch (err) {
        lastResult.value = {
          success: false,
          message: err.response?.data?.error || err.message,
          detail: err.response?.data || null,
        };
      } finally {
        docsLoading.value = false;
      }
    }

    async function handleTogglePin(doc) {
      try {
        lastResult.value = await updateSystemDocument(doc.id, {
          pin_to_context: !doc.pin_to_context,
        });
        await loadProjectDocs();
      } catch (err) {
        lastResult.value = {
          success: false,
          message: err.response?.data?.error || err.message,
          detail: err.response?.data || null,
        };
      }
    }

    async function handleSetDocOrder(doc, orderValue) {
      try {
        lastResult.value = await updateSystemDocument(doc.id, {
          context_order: orderValue,
        });
        await loadProjectDocs();
      } catch (err) {
        lastResult.value = {
          success: false,
          message: err.response?.data?.error || err.message,
          detail: err.response?.data || null,
        };
      }
    }

    async function handleExportChatToDoc() {
      if (!activeSessionId.value) return;
      $q.dialog({
        title: 'Export chat to project',
        message: 'Enter a document slug (used for sharing/pinning)',
        prompt: {
          model: `chat-${activeSessionId.value}`,
          type: 'text',
        },
        cancel: true,
        persistent: true,
      }).onOk(async (val) => {
        const slug = (val || '').trim();
        if (!slug) return;
        try {
          lastResult.value = await exportSessionToSystemDoc(activeSessionId.value, {
            doc_slug: slug,
            pin_to_context: true,
            include_tool_executions: true,
          });
          await loadProjectDocs();
        } catch (err) {
          lastResult.value = {
            success: false,
            message: err.response?.data?.error || err.message,
            detail: err.response?.data || null,
          };
        }
      });
    }

    async function loadProjectMemoryEditor() {
      if (!activeProjectId.value) {
        projectMemoryJson.value = '{}';
        return;
      }
      try {
        const p = await getAiAgentProject(activeProjectId.value);
        projectMemoryJson.value = JSON.stringify(p.memory || {}, null, 2);
      } catch (err) {
        projectMemoryJson.value = '{}';
        lastResult.value = {
          success: false,
          message: err.response?.data?.error || err.message,
          detail: err.response?.data || null,
        };
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
        lastResult.value = {
          success: false,
          message: err.response?.data?.error || err.message,
          detail: err.response?.data || null,
        };
      } finally {
        projectSaving.value = false;
      }
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
        lastResult.value = {
          success: false,
          message: err.response?.data?.error || err.message,
          detail: err.response?.data || null,
        };
      } finally {
        systemDocLoading.value = false;
      }
    }

    async function handleImportTm1Docs() {
      if (!activeProjectId.value) return;
      tm1DocsLoading.value = true;
      try {
        lastResult.value = await importTm1DocsToProject(activeProjectId.value, {
          pin_summary: true,
          // Full TM1 model metadata (no cube data): split into many docs for best RAG.
          split_docs: true,
          include_elements: true,
          elements_per_hierarchy: 200,
          include_process_code: true,
          include_cube_rules: true,
        });
        await loadProjectDocs();
      } catch (err) {
        lastResult.value = {
          success: false,
          message: err.response?.data?.error || err.message,
          detail: err.response?.data || null,
        };
      } finally {
        tm1DocsLoading.value = false;
      }
    }

    async function handleRefreshGlossary() {
      if (!activeProjectId.value) return;
      glossaryRefreshLoading.value = true;
      try {
        lastResult.value = await refreshAiAgentGlossary({
          project_id: activeProjectId.value,
          vectorize: true,
        });
        await loadProjectDocs();
      } catch (err) {
        lastResult.value = {
          success: false,
          message: err.response?.data?.error || err.message,
          detail: err.response?.data || null,
        };
      } finally {
        glossaryRefreshLoading.value = false;
      }
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
        lastResult.value = {
          success: false,
          message: err.response?.data?.error || err.message,
          detail: err.response?.data || null,
        };
      } finally {
        docDetailLoading.value = false;
      }
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
      tenantId,
      mode,
      projects,
      activeProjectId,
      activeProject,
      sessions,
      activeSessionId,
      activeSession,
      messages,
      chatInput,
      chatLoading,
      chatScrollRef,
      lastResult,
      creatingSession,
      projectSaving,
      savingTm1Config,
      statusLoading,
      tm1TestLoading,
      runWithToolsLoading,
      tm1Config,
      agentStatus,
      projectOptions,
      projectMemoryJson,
      systemDocSlug,
      systemDocTitle,
      systemDocLoading,
      docsLoading,
      systemDocs,
      tm1DocsLoading,
      glossaryRefreshLoading,
      docsDrawerOpen,
      selectedDocDetail,
      docDetailLoading,
      renderMarkdown,
      prettyResult,
      formatUpdatedAt,
      refreshSessionData,
      loadAgentStatus,
      handleSaveTm1Config,
      handleTm1Test,
      handleNewProject,
      handleNewChat,
      handleProjectChanged,
      selectSession,
      handleSendChat,
      handleImportCursorChat,
      handleSaveProjectMemory,
      handleGenerateSystemDoc,
      handleImportTm1Docs,
      handleRefreshGlossary,
      handleExportChatToDoc,
      handleTogglePin,
      handleSetDocOrder,
      loadProjectDocs,
      openDocsDrawer,
      closeDocDetail,
      selectDoc,
      requestChangesForDoc,
    };
  },
});
</script>

<style scoped>
.ai-agent-page {
  height: 100%;
  background: #f6f7f8;
}

.ai-topbar {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  background: #fff;
}

.ai-shell {
  display: flex;
  height: calc(100vh - 64px);
}

.ai-sidebar {
  width: 320px;
  background: #ffffff;
  border-right: 1px solid rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
}

.ai-sidebar-header {
  padding: 12px;
}

.ai-sidebar-scroll {
  flex: 1;
}

.ai-active-item {
  background: rgba(0, 0, 0, 0.06);
  border-radius: 8px;
}

.ai-chat {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.ai-chat-scroll {
  flex: 1;
}

.ai-chat-inner {
  max-width: 900px;
  margin: 0 auto;
  padding: 16px 16px 24px;
}

.ai-msg-row {
  display: flex;
  margin: 10px 0;
}

.ai-msg-user {
  justify-content: flex-end;
}

.ai-msg-assistant {
  justify-content: flex-start;
}

.ai-msg-bubble {
  max-width: 760px;
  width: fit-content;
  padding: 12px 14px;
  border-radius: 12px;
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.08);
  white-space: pre-wrap;
}

.ai-msg-user .ai-msg-bubble {
  background: #e8f0ff;
  border-color: rgba(0, 0, 0, 0.06);
}

.ai-msg-meta {
  font-size: 11px;
  color: rgba(0, 0, 0, 0.55);
  margin-bottom: 6px;
}

.ai-msg-content {
  font-size: 14px;
  line-height: 1.5;
  color: rgba(0, 0, 0, 0.88);
}

.ai-msg-markdown :deep(h1),
.ai-msg-markdown :deep(h2),
.ai-msg-markdown :deep(h3) {
  margin: 0.5em 0 0.25em;
  font-weight: 600;
}
.ai-msg-markdown :deep(h1) { font-size: 1.25em; }
.ai-msg-markdown :deep(h2) { font-size: 1.1em; }
.ai-msg-markdown :deep(h3) { font-size: 1em; }
.ai-msg-markdown :deep(p) { margin: 0.5em 0; }
.ai-msg-markdown :deep(ul),
.ai-msg-markdown :deep(ol) { margin: 0.5em 0; padding-left: 1.5em; }
.ai-msg-markdown :deep(code) {
  background: rgba(0, 0, 0, 0.06);
  padding: 0.15em 0.4em;
  border-radius: 4px;
  font-size: 0.9em;
}
.ai-msg-markdown :deep(pre) {
  background: rgba(0, 0, 0, 0.06);
  padding: 10px;
  border-radius: 6px;
  overflow: auto;
  margin: 0.5em 0;
}
.ai-msg-markdown :deep(pre code) { padding: 0; background: none; }
.ai-msg-markdown :deep(a) { color: var(--q-primary); }

.ai-docs-drawer {
  width: 420px;
  max-width: 95vw;
}
.ai-doc-content {
  background: #f8f9fa;
  font-size: 13px;
  line-height: 1.5;
  max-height: 60vh;
  overflow: auto;
}
.ai-doc-content :deep(h1),
.ai-doc-content :deep(h2),
.ai-doc-content :deep(h3) {
  margin: 0.75em 0 0.35em;
  font-weight: 600;
}
.ai-doc-content :deep(h1) { font-size: 1.2em; }
.ai-doc-content :deep(h2) { font-size: 1.1em; }
.ai-doc-content :deep(h3) { font-size: 1em; }
.ai-doc-content :deep(p) { margin: 0.5em 0; }
.ai-doc-content :deep(ul),
.ai-doc-content :deep(ol) { margin: 0.5em 0; padding-left: 1.5em; }
.ai-doc-content :deep(code) {
  background: rgba(0, 0, 0, 0.08);
  padding: 0.15em 0.4em;
  border-radius: 4px;
  font-size: 0.9em;
}
.ai-doc-content :deep(pre) {
  background: rgba(0, 0, 0, 0.08);
  padding: 10px;
  border-radius: 6px;
  overflow: auto;
  margin: 0.5em 0;
}
.ai-doc-content :deep(pre code) { padding: 0; background: none; }
.ai-doc-content :deep(a) { color: var(--q-primary); }

.ai-chat-input {
  background: #ffffff;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
  padding: 12px 16px 16px;
}

.result-block {
  max-height: 300px;
  overflow: auto;
  background: #f8f9fa;
  padding: 12px;
  border-radius: 6px;
  font-size: 12px;
}
</style>

