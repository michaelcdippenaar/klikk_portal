<template>
  <q-page class="q-pa-md">
    <div class="text-h5 q-mb-md">Credentials</div>
    <div class="text-subtitle2 text-grey-7 q-mb-lg">Manage API keys and service credentials. Saved to database — no restart needed.</div>

    <q-tabs v-model="tab" align="left" class="text-grey-8" active-color="primary" indicator-color="primary">
      <q-tab name="ai-agent" label="AI Agent" />
      <q-tab name="tm1" label="TM1" />
    </q-tabs>

    <q-separator />

    <q-tab-panels v-model="tab" animated>
      <q-tab-panel name="ai-agent">
        <div class="q-gutter-md" style="max-width: 600px;">
          <q-banner v-if="loadError" class="bg-negative text-white q-mb-md">{{ loadError }}</q-banner>

          <q-card bordered>
            <q-card-section>
              <div class="row items-center justify-between q-mb-sm">
                <div class="text-h6">Claude (Anthropic)</div>
                <q-badge v-if="credStatus.anthropic_api_key" color="positive" outline>set</q-badge>
                <q-badge v-else color="grey-6" outline>not set</q-badge>
              </div>
              <q-input
                v-model="claudeApiKey"
                label="API Key"
                outlined
                dense
                :type="showClaude ? 'text' : 'password'"
                placeholder="sk-ant-..."
              >
                <template v-slot:append>
                  <q-icon
                    :name="showClaude ? 'visibility_off' : 'visibility'"
                    class="cursor-pointer"
                    @click="showClaude = !showClaude"
                  />
                </template>
              </q-input>
              <q-select
                v-model="claudeModel"
                :options="claudeModels"
                label="Default Model"
                outlined
                dense
                class="q-mt-sm"
                emit-value
                map-options
              />
            </q-card-section>
          </q-card>

          <q-card bordered>
            <q-card-section>
              <div class="row items-center justify-between q-mb-sm">
                <div class="text-h6">OpenAI</div>
                <q-badge v-if="credStatus.openai_api_key" color="positive" outline>set</q-badge>
                <q-badge v-else color="grey-6" outline>not set</q-badge>
              </div>
              <q-input
                v-model="openaiApiKey"
                label="API Key"
                outlined
                dense
                :type="showOpenai ? 'text' : 'password'"
                placeholder="sk-..."
              >
                <template v-slot:append>
                  <q-icon
                    :name="showOpenai ? 'visibility_off' : 'visibility'"
                    class="cursor-pointer"
                    @click="showOpenai = !showOpenai"
                  />
                </template>
              </q-input>
              <q-select
                v-model="openaiModel"
                :options="openaiModels"
                label="Default Model"
                outlined
                dense
                class="q-mt-sm"
                emit-value
                map-options
              />
            </q-card-section>
          </q-card>

          <div>
            <q-btn label="Save" color="primary" @click="saveAiCredentials" :loading="saving" />
            <q-btn flat label="Test Anthropic" class="q-ml-sm" :loading="testing" @click="testKey('anthropic_api_key')" />
            <q-btn flat label="Test OpenAI" class="q-ml-sm" :loading="testing" @click="testKey('openai_api_key')" />
            <span v-if="saved" class="text-positive q-ml-md">Saved</span>
            <span v-if="testResult" class="q-ml-md" :class="testResult.ok ? 'text-positive' : 'text-negative'">{{ testResult.message }}</span>
          </div>
        </div>
      </q-tab-panel>

      <q-tab-panel name="tm1">
        <div class="q-gutter-md" style="max-width: 600px;">
          <q-card bordered>
            <q-card-section>
              <div class="text-h6 q-mb-sm">TM1 Server</div>
              <q-input
                v-model="tm1ServerUrl"
                label="Server URL"
                outlined
                dense
                placeholder="https://hostname:port"
              />
              <q-input
                v-model="tm1Username"
                label="Username"
                outlined
                dense
                class="q-mt-sm"
              />
              <q-input
                v-model="tm1Password"
                label="Password"
                outlined
                dense
                class="q-mt-sm"
                :type="showTm1 ? 'text' : 'password'"
              >
                <template v-slot:append>
                  <q-icon
                    :name="showTm1 ? 'visibility_off' : 'visibility'"
                    class="cursor-pointer"
                    @click="showTm1 = !showTm1"
                  />
                </template>
              </q-input>
              <q-input
                v-model="tm1Namespace"
                label="Namespace (CAM)"
                outlined
                dense
                class="q-mt-sm"
                placeholder="Optional"
              />
            </q-card-section>
          </q-card>

          <div>
            <q-btn label="Save" color="primary" @click="saveTm1Credentials" :loading="saving" />
            <span v-if="saved" class="text-positive q-ml-md">Saved</span>
          </div>
        </div>
      </q-tab-panel>
    </q-tab-panels>
  </q-page>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import { listCredentials, setCredential } from '../api/skills';

const $q = useQuasar();
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
    // Build a status map { key: true/false } based on whether each key has a value
    const status = {};
    if (Array.isArray(data)) {
      for (const c of data) {
        status[c.key] = !!c.has_value;
        // Pre-fill model selections if hint shows value (non-sensitive keys)
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
    $q.notify({ type: 'negative', message: `Save failed: ${err.message}` });
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
    $q.notify({ type: 'negative', message: `Save failed: ${err.message}` });
  } finally {
    saving.value = false;
  }
}

async function testKey(key) {
  testing.value = true;
  testResult.value = null;
  try {
    // Use the MCP chat endpoint to test the key with a simple ping
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
