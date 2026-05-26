<template>
  <AppPage>
    <PageHeader title="Credentials" subtitle="Manage API keys and service credentials — saved to database, no restart needed" />

    <KTabs
      :tabs="[
        { name: 'ai-agent', label: 'AI Agent' },
        { name: 'tm1', label: 'TM1' },
      ]"
      v-model="tab"
      :url-sync="false"
    />

    <div v-if="tab === 'ai-agent'" class="cred-panel">
      <div v-if="loadError" class="klikk-alert-strip tone-error">{{ loadError }}</div>

      <div class="cred-card">
        <div class="cred-card__header">
          <div class="cred-card__title">Claude (Anthropic)</div>
          <KBadge :label="credStatus.anthropic_api_key ? 'set' : 'not set'" :tone="credStatus.anthropic_api_key ? 'accent' : 'muted'" />
        </div>
        <KInput
          v-model="claudeApiKey"
          label="API Key"
          :type="showClaude ? 'text' : 'password'"
          placeholder="sk-ant-..."
        >
          <template #suffix>
            <button class="cred-eye-btn" type="button" @click="showClaude = !showClaude" :aria-label="showClaude ? 'Hide key' : 'Show key'">
              <!-- Lucide eye / eye-off -->
              <svg v-if="showClaude" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </template>
        </KInput>
        <KSelect
          v-model="claudeModel"
          label="Default Model"
          :options="claudeModels"
          class="cred-mt"
        />
      </div>

      <div class="cred-card">
        <div class="cred-card__header">
          <div class="cred-card__title">OpenAI</div>
          <KBadge :label="credStatus.openai_api_key ? 'set' : 'not set'" :tone="credStatus.openai_api_key ? 'accent' : 'muted'" />
        </div>
        <KInput
          v-model="openaiApiKey"
          label="API Key"
          :type="showOpenai ? 'text' : 'password'"
          placeholder="sk-..."
        >
          <template #suffix>
            <button class="cred-eye-btn" type="button" @click="showOpenai = !showOpenai" :aria-label="showOpenai ? 'Hide key' : 'Show key'">
              <svg v-if="showOpenai" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </template>
        </KInput>
        <KSelect
          v-model="openaiModel"
          label="Default Model"
          :options="openaiModels"
          class="cred-mt"
        />
      </div>

      <div class="cred-actions">
        <button class="btn btn-primary" :disabled="saving" @click="saveAiCredentials">
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
        <button class="btn btn-ghost" :disabled="testing" @click="testKey('anthropic_api_key')">
          {{ testing ? 'Testing…' : 'Test Anthropic' }}
        </button>
        <button class="btn btn-ghost" :disabled="testing" @click="testKey('openai_api_key')">
          Test OpenAI
        </button>
        <span v-if="saved" class="cred-saved-msg">Saved</span>
        <span v-if="testResult" class="cred-test-msg" :class="testResult.ok ? 'cred-test-msg--ok' : 'cred-test-msg--err'">{{ testResult.message }}</span>
      </div>
    </div>

    <div v-else-if="tab === 'tm1'" class="cred-panel">
      <div class="cred-card">
        <div class="cred-card__title" style="margin-bottom: 12px;">TM1 Server</div>
        <KInput v-model="tm1ServerUrl" label="Server URL" placeholder="https://hostname:port" />
        <KInput v-model="tm1Username" label="Username" class="cred-mt" />
        <KInput
          v-model="tm1Password"
          label="Password"
          :type="showTm1 ? 'text' : 'password'"
          class="cred-mt"
        >
          <template #suffix>
            <button class="cred-eye-btn" type="button" @click="showTm1 = !showTm1" :aria-label="showTm1 ? 'Hide password' : 'Show password'">
              <svg v-if="showTm1" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </template>
        </KInput>
        <KInput v-model="tm1Namespace" label="Namespace (CAM)" placeholder="Optional" class="cred-mt" />
      </div>

      <div class="cred-actions">
        <button class="btn btn-primary" :disabled="saving" @click="saveTm1Credentials">
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
        <span v-if="saved" class="cred-saved-msg">Saved</span>
      </div>
    </div>

  </AppPage>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import AppPage from '../components/shell/AppPage.vue';
import { useToast } from '../composables/useToast';
import { listCredentials, setCredential } from '../api/skills';
import PageHeader from '../components/klikk/PageHeader.vue';
import KTabs from '../components/klikk/KTabs.vue';
import KInput from '../components/klikk/KInput.vue';
import KSelect from '../components/klikk/KSelect.vue';
import KBadge from '../components/klikk/KBadge.vue';

const toast = useToast();
const tab = ref('ai-agent');

const claudeModels = [
  { label: 'Claude Opus 4.6', value: 'claude-opus-4-6' },
  { label: 'Claude Sonnet 4.6', value: 'claude-sonnet-4-6' },
  { label: 'Claude Haiku 4.5', value: 'claude-haiku-4-5-20251001' },
  { label: 'Claude Sonnet 3.5 v2', value: 'claude-3-5-sonnet-20241022' },
];

const openaiModels = [
  { label: 'GPT-4o', value: 'gpt-4o' },
  { label: 'GPT-4o Mini', value: 'gpt-4o-mini' },
  { label: 'GPT-4 Turbo', value: 'gpt-4-turbo' },
  { label: 'o1', value: 'o1' },
  { label: 'o1 Mini', value: 'o1-mini' },
  { label: 'o3 Mini', value: 'o3-mini' },
];

const claudeApiKey = ref('');
const claudeModel = ref('');
const openaiApiKey = ref('');
const openaiModel = ref('');

const tm1ServerUrl = ref('');
const tm1Username = ref('');
const tm1Password = ref('');
const tm1Namespace = ref('');

const showClaude = ref(false);
const showOpenai = ref(false);
const showTm1 = ref(false);
const saving = ref(false);
const saved = ref(false);
const testing = ref(false);
const testResult = ref(null);
const loadError = ref('');
const credStatus = ref({});

async function loadCredentials() {
  try {
    const data = await listCredentials();
    const status = {};
    if (Array.isArray(data)) {
      for (const c of data) {
        status[c.key] = !!c.has_value;
        if (c.key === 'claude_model' && c.has_value && c.hint) {
          claudeModel.value = c.hint;
        }
        if (c.key === 'openai_model' && c.has_value && c.hint) {
          openaiModel.value = c.hint;
        }
      }
    }
    credStatus.value = status;
    loadError.value = '';
  } catch (err) {
    loadError.value = `Could not load credentials from backend: ${err.message}`;
  }
}

async function saveAiCredentials() {
  saving.value = true;
  try {
    const promises = [];
    if (claudeApiKey.value.trim()) {
      promises.push(setCredential('anthropic_api_key', claudeApiKey.value.trim(), 'Anthropic API Key'));
    }
    if (claudeModel.value) {
      promises.push(setCredential('claude_model', claudeModel.value, 'Claude Default Model'));
    }
    if (openaiApiKey.value.trim()) {
      promises.push(setCredential('openai_api_key', openaiApiKey.value.trim(), 'OpenAI API Key'));
    }
    if (openaiModel.value) {
      promises.push(setCredential('openai_model', openaiModel.value, 'OpenAI Default Model'));
    }
    await Promise.all(promises);
    saved.value = true;
    claudeApiKey.value = '';
    openaiApiKey.value = '';
    await loadCredentials();
    setTimeout(() => { saved.value = false; }, 3000);
  } catch (err) {
    toast.error(`Save failed: ${err.message}`);
  } finally {
    saving.value = false;
  }
}

async function saveTm1Credentials() {
  saving.value = true;
  try {
    const promises = [];
    if (tm1ServerUrl.value.trim()) {
      promises.push(setCredential('tm1_server_url', tm1ServerUrl.value.trim(), 'TM1 Server URL'));
    }
    if (tm1Username.value.trim()) {
      promises.push(setCredential('tm1_username', tm1Username.value.trim(), 'TM1 Username'));
    }
    if (tm1Password.value.trim()) {
      promises.push(setCredential('tm1_password', tm1Password.value.trim(), 'TM1 Password'));
    }
    if (tm1Namespace.value.trim()) {
      promises.push(setCredential('tm1_namespace', tm1Namespace.value.trim(), 'TM1 Namespace'));
    }
    await Promise.all(promises);
    saved.value = true;
    tm1Password.value = '';
    await loadCredentials();
    setTimeout(() => { saved.value = false; }, 3000);
  } catch (err) {
    toast.error(`Save failed: ${err.message}`);
  } finally {
    saving.value = false;
  }
}

async function testKey(key) {
  testing.value = true;
  testResult.value = null;
  try {
    const mod = await import('../api/skills');
    const data = await mod.mcpChat({ message: `test ${key === 'anthropic_api_key' ? 'Claude' : 'OpenAI'} connection — respond with OK` });
    testResult.value = { ok: !!data.response, message: data.response ? 'Key is working' : 'No response' };
  } catch (err) {
    testResult.value = { ok: false, message: err.response?.data?.error || err.message };
  } finally {
    testing.value = false;
    setTimeout(() => { testResult.value = null; }, 5000);
  }
}

onMounted(() => {
  loadCredentials();
});
</script>

<style scoped>
.page-content {
  padding: 16px;
}

.cred-panel {
  max-width: 600px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 16px;
}

.cred-card {
  background: var(--kdl-card-bg);
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 8px;
  padding: 16px;
}

.cred-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.cred-card__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--kdl-text-primary);
}

.cred-mt {
  margin-top: 10px;
}

.cred-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.cred-saved-msg {
  font-size: 13px;
  color: var(--kdl-status-success);
  font-weight: 500;
}

.cred-test-msg {
  font-size: 13px;
}
.cred-test-msg--ok  { color: var(--kdl-status-success); }
.cred-test-msg--err { color: var(--kdl-status-error); }

.cred-eye-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  color: var(--kdl-text-muted);
  display: flex;
  align-items: center;
}
.cred-eye-btn:hover {
  color: var(--kdl-text-primary);
}
</style>
