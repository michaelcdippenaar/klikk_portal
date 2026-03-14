<template>
  <q-page class="q-pa-md">
    <div class="text-h5 q-mb-md">Planning Analytics</div>

    <div v-if="!tenantId" class="q-pa-lg text-center">
      <q-icon name="info" size="3em" color="grey-5" />
      <div class="text-h6 q-mt-md text-grey-7">Please select a tenant first</div>
    </div>

    <div v-else>
      <q-tabs v-model="tab" dense class="text-grey" active-color="primary" indicator-color="primary" align="left">
        <q-tab name="setup" label="Setup" icon="settings" />
        <q-tab name="pipeline" label="Pipeline" icon="play_circle" />
      </q-tabs>
      <q-separator />

      <q-tab-panels v-model="tab" animated>
        <!-- ===================== SETUP TAB ===================== -->
        <q-tab-panel name="setup">
          <!-- My TM1 Credentials -->
          <q-card class="q-mb-md">
            <q-card-section>
              <div class="text-subtitle1 q-mb-xs">My TM1 Credentials</div>
              <div class="text-caption text-grey-7 q-mb-sm">Your personal TM1 login. All TM1 operations will use these credentials.</div>
              <div class="row q-col-gutter-sm">
                <div class="col-12 col-sm-6 col-md-4">
                  <q-input v-model="myCreds.tm1_username" label="TM1 Username" dense outlined />
                </div>
                <div class="col-12 col-sm-6 col-md-4">
                  <q-input v-model="myCreds.tm1_password" label="TM1 Password" type="password" dense outlined />
                </div>
              </div>
              <div class="q-mt-sm q-gutter-sm">
                <q-btn label="Save credentials" color="primary" :loading="savingCreds" @click="handleSaveCreds" no-caps />
                <q-btn label="Remove" flat color="negative" :loading="removingCreds" @click="handleRemoveCreds" no-caps />
              </div>
              <div v-if="credsResult" class="q-mt-sm">
                <q-banner :class="credsResult.success ? 'bg-positive text-white' : 'bg-negative text-white'" dense rounded>
                  {{ credsResult.message }}
                </q-banner>
              </div>
            </q-card-section>
          </q-card>

          <!-- TM1 Server -->
          <q-card class="q-mb-md">
            <q-card-section>
              <div class="text-subtitle1 q-mb-sm">TM1 Server</div>
              <div class="row q-col-gutter-sm">
                <div class="col-12 col-md-6">
                  <q-input v-model="tm1.baseUrl" label="Base URL" dense outlined placeholder="http://host:port/api/v1/" />
                </div>
                <div class="col-12 col-sm-6 col-md-3">
                  <q-input v-model="tm1.user" label="Username" dense outlined />
                </div>
                <div class="col-12 col-sm-6 col-md-3">
                  <q-input v-model="tm1.password" label="Password" type="password" dense outlined />
                </div>
              </div>
              <div class="q-mt-sm q-gutter-sm">
                <q-btn label="Test connection" color="secondary" :loading="testingConnection" @click="handleTestConnection" no-caps />
                <q-btn label="Save" color="primary" :loading="savingServer" @click="handleSaveServer" no-caps />
              </div>
              <div v-if="connectionResult" class="q-mt-sm">
                <q-banner :class="connectionResult.success ? 'bg-positive text-white' : 'bg-negative text-white'" dense rounded>
                  {{ connectionResult.message }}
                </q-banner>
              </div>
            </q-card-section>
          </q-card>

          <!-- TM1 Processes -->
          <q-card>
            <q-card-section>
              <div class="text-subtitle1 q-mb-sm">TM1 Processes</div>
              <div v-for="(proc, idx) in tm1Processes" :key="idx" class="row q-col-gutter-sm q-mb-sm items-center">
                <div class="col-auto">
                  <q-checkbox v-model="proc.enabled" dense />
                </div>
                <div class="col">
                  <q-input v-model="proc.process_name" label="Process name" dense outlined />
                </div>
                <div class="col">
                  <q-input v-model="proc.paramString" label="Parameters (key=val, ...)" dense outlined hint="e.g. pSource=ODBC,pYear=2025" />
                </div>
                <div class="col-auto">
                  <q-btn flat round dense icon="delete" color="negative" @click="tm1Processes.splice(idx, 1)" />
                </div>
              </div>
              <div class="q-gutter-sm q-mt-sm">
                <q-btn label="Add process" icon="add" flat color="primary" @click="addProcess" no-caps />
                <q-btn label="Save processes" color="primary" :loading="savingProcesses" @click="handleSaveProcesses" no-caps />
              </div>
            </q-card-section>
          </q-card>
        </q-tab-panel>

        <!-- ===================== PIPELINE TAB ===================== -->
        <q-tab-panel name="pipeline">
          <!-- Steps to run -->
          <q-card class="q-mb-md">
            <q-card-section>
              <div class="text-subtitle1 q-mb-sm">Steps to run</div>
              <div v-for="(s, idx) in steps" :key="idx" class="row items-center q-mb-xs">
                <q-checkbox v-model="s.selected" :label="s.label" dense class="col" />
                <q-btn flat dense size="sm" label="Run" icon="play_arrow" color="primary" :loading="s.status === 'running'" :disable="pipelineRunning" @click="runSingleStep(idx)" no-caps />
              </div>
            </q-card-section>
          </q-card>

          <!-- Options -->
          <q-card class="q-mb-md">
            <q-card-section>
              <div class="text-subtitle1 q-mb-sm">Options</div>
              <q-checkbox v-model="pipelineOpts.loadAll" label="Load all data (ignore last update)" dense class="q-mr-md" />
              <q-checkbox v-model="pipelineOpts.rebuildTrailBalance" label="Rebuild trail balance" dense class="q-mr-md" />
              <q-checkbox v-model="pipelineOpts.excludeManualJournals" label="Exclude manual journals" dense class="q-mr-md" />
              <q-checkbox v-model="pipelineOpts.calculatePnlYtd" label="Calculate Balance Sheet YTD (balance to date)" dense />
            </q-card-section>
          </q-card>

          <q-btn label="Run selected steps" icon="play_circle" color="primary" :loading="pipelineRunning" @click="runSelectedSteps" no-caps class="q-mb-md" />

          <div class="text-caption text-grey-7 q-mb-md">
            TM1 "success" means the process was started. Check TM1 Process Monitor for actual outcome. TM1 steps may take several minutes.
          </div>

          <!-- Progress -->
          <q-card v-if="steps.some(s => s.status !== 'idle')">
            <q-card-section>
              <div class="text-subtitle1 q-mb-sm">Progress</div>
              <q-list separator>
                <q-item v-for="(s, idx) in steps" :key="'p' + idx" :class="stepRowClass(s)">
                  <q-item-section avatar>
                    <q-spinner v-if="s.status === 'running'" color="primary" size="1.5em" />
                    <q-icon v-else-if="s.status === 'done'" name="check_circle" color="positive" />
                    <q-icon v-else-if="s.status === 'error'" name="error" color="negative" />
                    <q-icon v-else-if="s.status === 'skipped'" name="remove_circle_outline" color="grey" />
                    <q-icon v-else name="radio_button_unchecked" color="grey-4" />
                  </q-item-section>
                  <q-item-section>
                    <q-item-label>{{ s.label }}</q-item-label>
                    <q-item-label caption v-if="s.message">{{ s.message }}</q-item-label>
                  </q-item-section>
                  <q-item-section side v-if="s.elapsed != null">
                    {{ s.elapsed }}s
                  </q-item-section>
                </q-item>
              </q-list>
            </q-card-section>
          </q-card>
        </q-tab-panel>
      </q-tab-panels>
    </div>
  </q-page>
</template>

<script>
import { defineComponent, ref, reactive, onMounted, computed } from 'vue';

export default defineComponent({
  name: 'PlanningAnalytics',
  setup() {
    const tab = ref('pipeline');
    const tenantId = ref(null);

    const tm1 = reactive({ baseUrl: '', user: '', password: '' });
    const tm1Processes = ref([]);
    const testingConnection = ref(false);
    const savingServer = ref(false);
    const savingProcesses = ref(false);
    const connectionResult = ref(null);

    const myCreds = reactive({ tm1_username: '', tm1_password: '' });
    const savingCreds = ref(false);
    const removingCreds = ref(false);
    const credsResult = ref(null);
    const pipelineRunning = ref(false);

    const pipelineOpts = reactive({
      loadAll: false,
      rebuildTrailBalance: false,
      excludeManualJournals: false,
      calculatePnlYtd: true,
    });

    const steps = ref([]);
    let api = null;
    let dataStoreRef = null;

    function buildSteps() {
      const base = [
        { key: 'update_metadata', label: 'Update Metadata (accounts, contacts, tracking)', selected: true, status: 'idle', message: '', elapsed: null },
        { key: 'update_postgres', label: 'Update Postgres (Xero sync)', selected: true, status: 'idle', message: '', elapsed: null },
        { key: 'process_data', label: 'Process Journals & Build Trail Balance', selected: true, status: 'idle', message: '', elapsed: null },
      ];
      const tm1Steps = tm1Processes.value
        .filter(p => p.enabled)
        .map(p => ({
          key: `tm1:${p.process_name}`,
          label: `TM1: ${p.process_name}`,
          selected: true,
          status: 'idle',
          message: '',
          elapsed: null,
          processName: p.process_name,
          parameters: parseParams(p.paramString || ''),
        }));
      steps.value = [...base, ...tm1Steps];
    }

    function parseParams(str) {
      if (!str) return {};
      const obj = {};
      str.split(',').forEach(pair => {
        const [k, ...rest] = pair.split('=');
        if (k && rest.length) obj[k.trim()] = rest.join('=').trim();
      });
      return obj;
    }

    function paramObjToString(obj) {
      if (!obj || typeof obj !== 'object') return '';
      return Object.entries(obj).map(([k, v]) => `${k}=${v}`).join(', ');
    }

    function addProcess() {
      tm1Processes.value.push({ process_name: '', enabled: true, sort_order: tm1Processes.value.length, paramString: '', parameters: {} });
    }

    async function handleSaveCreds() {
      savingCreds.value = true;
      credsResult.value = null;
      try {
        const res = await api.saveTm1Credentials({ tm1_username: myCreds.tm1_username, tm1_password: myCreds.tm1_password });
        credsResult.value = { success: true, message: res.message || 'TM1 credentials saved.' };
      } catch (e) {
        credsResult.value = { success: false, message: e.response?.data?.error || e.message };
      }
      savingCreds.value = false;
    }

    async function handleRemoveCreds() {
      removingCreds.value = true;
      credsResult.value = null;
      try {
        const res = await api.deleteTm1Credentials();
        myCreds.tm1_username = '';
        myCreds.tm1_password = '';
        credsResult.value = { success: true, message: res.message || 'Credentials removed.' };
      } catch (e) {
        credsResult.value = { success: false, message: e.response?.data?.error || e.message };
      }
      removingCreds.value = false;
    }

    async function loadFromApi() {
      if (!api) return;
      try {
        const creds = await api.getTm1Credentials();
        myCreds.tm1_username = creds.tm1_username || '';
        myCreds.tm1_password = creds.tm1_password || '';
      } catch (e) { console.warn('Failed to load TM1 credentials', e); }
      try {
        const cfg = await api.getTm1Config();
        tm1.baseUrl = cfg.base_url || '';
        tm1.user = cfg.username || '';
        tm1.password = cfg.password || '';
      } catch (e) { console.warn('Failed to load TM1 config', e); }
      try {
        const procs = await api.getTm1Processes();
        tm1Processes.value = (procs || []).map((p, i) => ({
          ...p,
          paramString: paramObjToString(p.parameters),
          sort_order: p.sort_order ?? i,
        }));
      } catch (e) { console.warn('Failed to load TM1 processes', e); }
      buildSteps();
    }

    async function handleTestConnection() {
      testingConnection.value = true;
      connectionResult.value = null;
      try {
        const res = await api.testTm1Connection({
          base_url: tm1.baseUrl, user: tm1.user, password: tm1.password,
        });
        connectionResult.value = res;
      } catch (e) {
        connectionResult.value = { success: false, message: e.response?.data?.message || e.message };
      } finally {
        testingConnection.value = false;
      }
    }

    async function handleSaveServer() {
      savingServer.value = true;
      try {
        await api.saveTm1Config({ base_url: tm1.baseUrl, username: tm1.user, password: tm1.password });
      } catch (e) { console.error(e); }
      savingServer.value = false;
    }

    async function handleSaveProcesses() {
      savingProcesses.value = true;
      try {
        const payload = tm1Processes.value.map((p, i) => ({
          process_name: p.process_name,
          enabled: p.enabled,
          sort_order: i,
          parameters: parseParams(p.paramString || ''),
        }));
        await api.saveTm1Processes(payload);
        buildSteps();
      } catch (e) { console.error(e); }
      savingProcesses.value = false;
    }

    async function runStep(idx) {
      const s = steps.value[idx];
      steps.value[idx] = { ...s, status: 'running', message: '', elapsed: null };
      const t0 = Date.now();
      try {
        let res;
        if (s.key === 'update_metadata') {
          const { updateMetadata } = await import('../api/endpoints');
          res = await updateMetadata(tenantId.value);
        } else if (s.key === 'update_postgres') {
          const { updateData } = await import('../api/endpoints');
          res = await updateData(tenantId.value, pipelineOpts.loadAll);
        } else if (s.key === 'process_data') {
          res = await api.buildTrailBalance(
            tenantId.value,
            pipelineOpts.rebuildTrailBalance,
            pipelineOpts.excludeManualJournals,
            pipelineOpts.calculatePnlYtd,
          );
        } else if (s.key.startsWith('tm1:')) {
          res = await api.executeTm1Process(s.processName, s.parameters);
        }
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        const success = res?.success !== false;
        steps.value[idx] = {
          ...steps.value[idx],
          status: success ? 'done' : 'error',
          message: res?.message || (success ? 'OK' : 'Failed'),
          elapsed,
        };
      } catch (e) {
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        steps.value[idx] = {
          ...steps.value[idx],
          status: 'error',
          message: e.response?.data?.message || e.response?.data?.error || e.message,
          elapsed,
        };
      }
    }

    async function runSingleStep(idx) {
      if (pipelineRunning.value) return;
      pipelineRunning.value = true;
      // Reset all step statuses before running
      steps.value.forEach((s, i) => {
        if (i !== idx) steps.value[i] = { ...s, status: 'idle', message: '', elapsed: null };
      });
      await runStep(idx);
      pipelineRunning.value = false;
    }

    async function runSelectedSteps() {
      if (pipelineRunning.value) return;
      pipelineRunning.value = true;
      // Reset all step statuses
      steps.value.forEach((s, i) => {
        steps.value[i] = { ...s, status: 'idle', message: '', elapsed: null };
      });
      for (let i = 0; i < steps.value.length; i++) {
        if (!steps.value[i].selected) {
          steps.value[i] = { ...steps.value[i], status: 'skipped', message: 'Skipped', elapsed: null };
          continue;
        }
        await runStep(i);
        if (steps.value[i].status === 'error') break;
      }
      pipelineRunning.value = false;
    }

    function stepRowClass(s) {
      if (s.status === 'done') return 'bg-green-1';
      if (s.status === 'error') return 'bg-red-1';
      return '';
    }

    onMounted(async () => {
      try {
        const { useDataStore } = await import('../stores/data');
        dataStoreRef = useDataStore();
        tenantId.value = dataStoreRef.selectedTenant;
      } catch (e) { console.warn(e); }
      try {
        api = await import('../api/planningAnalytics');
      } catch (e) { console.warn(e); }
      await loadFromApi();
    });

    return {
      tab, tenantId, tm1, tm1Processes,
      testingConnection, savingServer, savingProcesses, connectionResult,
      myCreds, savingCreds, removingCreds, credsResult,
      handleSaveCreds, handleRemoveCreds,
      pipelineOpts, steps, pipelineRunning,
      addProcess, handleTestConnection, handleSaveServer, handleSaveProcesses,
      runSingleStep, runSelectedSteps, stepRowClass, buildSteps,
    };
  },
});
</script>
