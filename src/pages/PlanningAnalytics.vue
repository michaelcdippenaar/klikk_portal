<template>
  <AppPage>
    <PageHeader title="Planning Analytics" subtitle="TM1 pipeline and scenario analysis">
      <template #tenantContext>
        <TenantSelector />
      </template>
    </PageHeader>

    <EmptyState
      v-if="!tenantId"
      title="Please select a tenant first"
      body="Use the tenant selector above to pick an organisation."
    />

    <div v-else>
      <KTabs
        :tabs="[
          { name: 'setup', label: 'Setup' },
          { name: 'pipeline', label: 'Pipeline' },
          { name: 'tracking-mapping', label: 'Tracking Mapping' },
        ]"
        v-model="tab"
        :url-sync="false"
        class="mb-3"
      />

      <!-- ===================== SETUP TAB ===================== -->
      <div v-show="tab === 'setup'">
        <!-- My TM1 Credentials -->
        <SectionCard title="My TM1 Credentials" description="Your personal TM1 login. All TM1 operations will use these credentials." class="mb-4">
          <div class="flex flex-wrap gap-3">
            <div class="flex-1 min-w-48">
              <KInput v-model="myCreds.tm1_username" label="TM1 Username" />
            </div>
            <div class="flex-1 min-w-48">
              <KInput v-model="myCreds.tm1_password" label="TM1 Password" type="password" />
            </div>
          </div>
          <div class="flex gap-2 mt-3">
            <button class="btn btn-primary" :disabled="savingCreds" @click="handleSaveCreds">
              <span v-if="savingCreds" class="inline-flex items-center gap-1">
                <KSpinner size="14" /> Saving…
              </span>
              <span v-else>Save credentials</span>
            </button>
            <button class="btn btn-ghost text-error" :disabled="removingCreds" @click="handleRemoveCreds">
              <span v-if="removingCreds" class="inline-flex items-center gap-1">
                <KSpinner size="14" /> Removing…
              </span>
              <span v-else>Remove</span>
            </button>
          </div>
          <div v-if="credsResult" class="mt-3">
            <KAlert :variant="credsResult.success ? 'success' : 'error'" :body="credsResult.message" />
          </div>
        </SectionCard>

        <!-- TM1 Server -->
        <SectionCard title="TM1 Server" class="mb-4">
          <div class="flex flex-wrap gap-3">
            <div class="flex-1 min-w-64">
              <KInput v-model="tm1.baseUrl" label="Base URL" placeholder="http://host:port/api/v1/" />
            </div>
            <div class="flex-1 min-w-40">
              <KInput v-model="tm1.user" label="Username" />
            </div>
            <div class="flex-1 min-w-40">
              <KInput v-model="tm1.password" label="Password" type="password" />
            </div>
          </div>
          <div class="flex gap-2 mt-3">
            <button class="btn btn-secondary" :disabled="testingConnection" @click="handleTestConnection">
              <span v-if="testingConnection" class="inline-flex items-center gap-1">
                <KSpinner size="14" /> Testing…
              </span>
              <span v-else>Test connection</span>
            </button>
            <button class="btn btn-primary" :disabled="savingServer" @click="handleSaveServer">
              <span v-if="savingServer" class="inline-flex items-center gap-1">
                <KSpinner size="14" /> Saving…
              </span>
              <span v-else>Save</span>
            </button>
          </div>
          <div v-if="connectionResult" class="mt-3">
            <KAlert :variant="connectionResult.success ? 'success' : 'error'" :body="connectionResult.message" />
          </div>
        </SectionCard>

        <!-- TM1 Processes -->
        <SectionCard title="TM1 Processes">
          <div v-for="(proc, idx) in tm1Processes" :key="idx" class="flex gap-3 mb-3 items-center">
            <KCheckbox v-model="proc.enabled" />
            <div class="flex-1 min-w-0">
              <KInput v-model="proc.process_name" label="Process name" />
            </div>
            <div class="flex-1 min-w-0">
              <KInput v-model="proc.paramString" label="Parameters (key=val, ...)" help-text="e.g. pSource=ODBC,pYear=2025" />
            </div>
            <button class="btn btn-ghost text-error p-1" @click="tm1Processes.splice(idx, 1)" title="Remove process">
              <!-- Lucide trash-2 -->
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
          </div>
          <div class="flex gap-2 mt-3">
            <button class="btn btn-ghost" @click="addProcess">
              <!-- Lucide plus -->
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="mr-1"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add process
            </button>
            <button class="btn btn-primary" :disabled="savingProcesses" @click="handleSaveProcesses">
              <span v-if="savingProcesses" class="inline-flex items-center gap-1">
                <KSpinner size="14" /> Saving…
              </span>
              <span v-else>Save processes</span>
            </button>
          </div>
        </SectionCard>
      </div>

      <!-- ===================== PIPELINE TAB ===================== -->
      <div v-show="tab === 'pipeline'">
        <!-- Steps to run -->
        <SectionCard title="Steps to run" class="mb-4">
          <div v-for="(s, idx) in steps" :key="idx" class="flex items-center gap-3 mb-2">
            <KCheckbox v-model="s.selected" :label="s.label" />
            <button
              class="btn btn-ghost btn-sm ml-auto"
              :disabled="pipelineRunning || s.status === 'running'"
              @click="runSingleStep(idx)"
            >
              <!-- Lucide play -->
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="mr-1"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              Run
            </button>
          </div>
        </SectionCard>

        <!-- Options -->
        <SectionCard title="Options" class="mb-4">
          <div class="flex flex-wrap gap-4">
            <KCheckbox v-model="pipelineOpts.loadAll" label="Load all data (ignore last update)" />
            <KCheckbox v-model="pipelineOpts.rebuildTrailBalance" label="Rebuild trail balance" />
            <KCheckbox v-model="pipelineOpts.excludeManualJournals" label="Exclude manual journals" />
            <KCheckbox v-model="pipelineOpts.calculatePnlYtd" label="Calculate Balance Sheet YTD (balance to date)" />
          </div>
        </SectionCard>

        <button class="btn btn-primary mb-4" :disabled="pipelineRunning" @click="runSelectedSteps">
          <span v-if="pipelineRunning" class="inline-flex items-center gap-1">
            <KSpinner size="14" /> Running…
          </span>
          <span v-else class="inline-flex items-center gap-1">
            <!-- Lucide play-circle -->
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
            Run selected steps
          </span>
        </button>

        <p class="text-muted text-sm mb-4">
          TM1 "success" means the process was started. Check TM1 Process Monitor for actual outcome. TM1 steps may take several minutes.
        </p>

        <!-- Progress -->
        <SectionCard v-if="steps.some(s => s.status !== 'idle')" title="Progress">
          <div class="divide-y divide-kdl-border-subtle">
            <div
              v-for="(s, idx) in steps"
              :key="'p' + idx"
              class="flex items-center gap-3 py-2"
              :class="stepRowClass(s)"
            >
              <span class="flex-shrink-0" aria-hidden="true">
                <KSpinner v-if="s.status === 'running'" size="18" />
                <!-- check-circle -->
                <svg v-else-if="s.status === 'done'" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="text-success"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                <!-- x-circle -->
                <svg v-else-if="s.status === 'error'" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="text-error"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                <!-- minus-circle skipped -->
                <svg v-else-if="s.status === 'skipped'" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="pa-step-icon--skipped"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                <!-- circle idle -->
                <svg v-else xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="pa-step-icon--idle"><circle cx="12" cy="12" r="10"/></svg>
              </span>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium">{{ s.label }}</div>
                <div v-if="s.message" class="text-xs text-muted">{{ s.message }}</div>
              </div>
              <span v-if="s.elapsed != null" class="text-xs text-muted flex-shrink-0">{{ s.elapsed }}s</span>
            </div>
          </div>
        </SectionCard>
      </div>

      <!-- ===================== TRACKING MAPPING TAB ===================== -->
      <div v-show="tab === 'tracking-mapping'">
        <!-- Header row -->
        <div class="flex items-center gap-3 mb-4 flex-wrap">
          <div class="section-header">Xero Tracking Category 1 → TM1 Dimensions</div>
          <div class="ml-auto flex items-center gap-2">
            <span v-if="mappingRows.length">
              <KBadge :tone="mappingUnmappedCount > 0 ? 'warning' : 'success'">
                {{ mappingUnmappedCount }} unmapped in tracking_1
              </KBadge>
            </span>
            <button class="btn btn-ghost btn-sm" :disabled="mappingLoading" @click="loadTrackingMapping">
              <!-- Lucide refresh-cw -->
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="mr-1"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
              Refresh
            </button>
          </div>
        </div>

        <!-- Error -->
        <KAlert v-if="mappingError" variant="error" :body="mappingError" class="mb-4" />

        <!-- Loading skeleton -->
        <div v-if="mappingLoading && !mappingRows.length" class="flex flex-col gap-2">
          <div v-for="n in 5" :key="n" class="h-10 rounded bg-kdl-border-subtle animate-pulse" />
        </div>

        <!-- Table -->
        <KTable
          v-else
          :columns="mappingKColumns"
          :data="mappingRows"
          :loading="mappingLoading"
          dense
          pagination="none"
        >
          <template #cell-in_tracking1="{ value }">
            <span class="flex justify-center">
              <!-- check-circle -->
              <svg v-if="value" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="text-success"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              <!-- x-circle -->
              <svg v-else xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="text-error"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            </span>
          </template>
          <template #cell-in_cost_object="{ value }">
            <span class="flex justify-center">
              <svg v-if="value" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="text-success"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="text-error"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            </span>
          </template>
          <template #cell-actions="{ row }">
            <div class="flex gap-1">
              <button
                class="btn btn-ghost btn-xs"
                :disabled="row.in_tracking1 || !!mappingInFlight[row.xero_name + '_t1']"
                @click="addToTm1(row, true, false)"
              >
                <KSpinner v-if="!!mappingInFlight[row.xero_name + '_t1']" size="12" />
                <span v-else>+ tracking_1</span>
              </button>
              <button
                class="btn btn-ghost btn-xs"
                :disabled="row.in_cost_object || !!mappingInFlight[row.xero_name + '_co']"
                @click="addToTm1(row, false, true)"
              >
                <KSpinner v-if="!!mappingInFlight[row.xero_name + '_co']" size="12" />
                <span v-else>+ cost_object</span>
              </button>
            </div>
          </template>
        </KTable>
      </div>
    </div>
  </AppPage>
</template>

<script>
import { defineComponent, ref, reactive, onMounted } from 'vue';
import AppPage from '../components/shell/AppPage.vue';
import PageHeader from '../components/klikk/PageHeader.vue';
import SectionCard from '../components/klikk/SectionCard.vue';
import EmptyState from '../components/klikk/EmptyState.vue';
import KAlert from '../components/klikk/KAlert.vue';
import KBadge from '../components/klikk/KBadge.vue';
import KCheckbox from '../components/klikk/KCheckbox.vue';
import KInput from '../components/klikk/KInput.vue';
import KSpinner from '../components/klikk/KSpinner.vue';
import KTable from '../components/klikk/KTable.vue';
import KTabs from '../components/klikk/KTabs.vue';
import TenantSelector from '../components/TenantSelector.vue';

export default defineComponent({
  name: 'PlanningAnalytics',
  components: {
    AppPage, PageHeader, SectionCard, EmptyState,
    KAlert, KBadge, KCheckbox, KInput, KSpinner, KTable, KTabs,
    TenantSelector,
  },
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

    // --- Tracking Mapping ---
    const mappingRows = ref([]);
    const mappingLoading = ref(false);
    const mappingError = ref('');
    const mappingInFlight = ref({});
    const mappingUnmappedCount = ref(0);

    // KTable column defs (TanStack-style)
    const mappingKColumns = [
      { accessorKey: 'xero_name', header: 'Xero Name', enableSorting: true },
      { accessorKey: 'in_tracking1', header: 'In tracking_1', enableSorting: true, meta: { width: '130px' } },
      { accessorKey: 'in_cost_object', header: 'In cost_object', enableSorting: true, meta: { width: '130px' } },
      { accessorKey: 'actions', header: 'Actions', enableSorting: false },
    ];

    async function loadTrackingMapping() {
      if (!tenantId.value) return;
      mappingLoading.value = true;
      mappingError.value = '';
      try {
        const paApi = await import('../api/planningAnalytics');
        const data = await paApi.getTrackingMapping(tenantId.value);
        mappingRows.value = data.rows || [];
        mappingUnmappedCount.value = data.unmapped_count || 0;
      } catch (e) {
        mappingError.value = e.response?.data?.error || e.message;
      } finally {
        mappingLoading.value = false;
      }
    }

    async function addToTm1(row, addToTracking1, addToCostObject) {
      const key = addToTracking1 ? row.xero_name + '_t1' : row.xero_name + '_co';
      mappingInFlight.value = { ...mappingInFlight.value, [key]: true };
      try {
        const paApi = await import('../api/planningAnalytics');
        await paApi.addTrackingElement({
          xero_name: row.xero_name,
          add_to_tracking1: addToTracking1,
          add_to_cost_object: addToCostObject,
        });
        await loadTrackingMapping();
      } catch (e) {
        mappingError.value = e.response?.data?.error || e.message;
      } finally {
        const updated = { ...mappingInFlight.value };
        delete updated[key];
        mappingInFlight.value = updated;
      }
    }

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
      steps.value.forEach((s, i) => {
        if (i !== idx) steps.value[i] = { ...s, status: 'idle', message: '', elapsed: null };
      });
      await runStep(idx);
      pipelineRunning.value = false;
    }

    async function runSelectedSteps() {
      if (pipelineRunning.value) return;
      pipelineRunning.value = true;
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
      if (s.status === 'done') return 'pa-step-row--done';
      if (s.status === 'error') return 'pa-step-row--error';
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
      if (tenantId.value) await loadTrackingMapping();
    });

    return {
      tab, tenantId, tm1, tm1Processes,
      testingConnection, savingServer, savingProcesses, connectionResult,
      myCreds, savingCreds, removingCreds, credsResult,
      handleSaveCreds, handleRemoveCreds,
      pipelineOpts, steps, pipelineRunning,
      addProcess, handleTestConnection, handleSaveServer, handleSaveProcesses,
      runSingleStep, runSelectedSteps, stepRowClass, buildSteps,
      mappingRows, mappingLoading, mappingError, mappingInFlight, mappingUnmappedCount,
      mappingKColumns, loadTrackingMapping, addToTm1,
    };
  },
});
</script>

<style scoped>
/* Pipeline step row status colours — KDL tokens */
.pa-step-row--done {
  background: rgba(13, 148, 136, 0.06);
}
.pa-step-row--error {
  background: rgba(220, 38, 38, 0.06);
}

:root[data-theme="dark"] .pa-step-row--done {
  background: rgba(45, 212, 191, 0.08);
}
:root[data-theme="dark"] .pa-step-row--error {
  background: rgba(248, 113, 113, 0.08);
}

/* Step icon states */
.pa-step-icon--skipped {
  color: var(--kdl-text-muted);
}
.pa-step-icon--idle {
  color: var(--kdl-text-hint);
}
</style>
