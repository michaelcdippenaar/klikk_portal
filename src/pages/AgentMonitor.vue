<template>
  <q-page class="q-pa-md">
    <div class="row items-center justify-between q-mb-md">
      <div>
        <div class="text-h5 q-mb-xs">Agent Monitor</div>
        <div class="text-subtitle2 text-grey-7">Performance, health, and diagnostics</div>
      </div>
      <q-btn flat color="primary" label="Refresh" icon="refresh" :loading="loading" @click="refreshAll" />
    </div>

    <!-- ============================================================ -->
    <!-- Health Overview Cards                                        -->
    <!-- ============================================================ -->
    <div class="row q-col-gutter-md q-mb-lg">
      <!-- Overall health -->
      <div class="col-12 col-sm-6 col-md-3">
        <q-card bordered flat>
          <q-card-section>
            <div class="text-caption text-grey-7">Overall Health</div>
            <div class="row items-center q-mt-xs">
              <q-icon
                :name="healthIcon(health.overall)"
                :color="healthColor(health.overall)"
                size="28px"
                class="q-mr-sm"
              />
              <div class="text-h6 text-weight-bold" :class="`text-${healthColor(health.overall)}`">
                {{ (health.overall || 'unknown').toUpperCase() }}
              </div>
            </div>
          </q-card-section>
        </q-card>
      </div>

      <!-- Total executions -->
      <div class="col-12 col-sm-6 col-md-3">
        <q-card bordered flat>
          <q-card-section>
            <div class="text-caption text-grey-7">Tool Executions ({{ perfHours }}h)</div>
            <div class="text-h4 text-weight-bold q-mt-xs">{{ perf.total_executions ?? '-' }}</div>
          </q-card-section>
        </q-card>
      </div>

      <!-- Error count -->
      <div class="col-12 col-sm-6 col-md-3">
        <q-card bordered flat>
          <q-card-section>
            <div class="text-caption text-grey-7">Errors ({{ perfHours }}h)</div>
            <div class="text-h4 text-weight-bold q-mt-xs" :class="perf.total_errors > 0 ? 'text-negative' : 'text-positive'">
              {{ perf.total_errors ?? '-' }}
            </div>
          </q-card-section>
        </q-card>
      </div>

      <!-- Sessions -->
      <div class="col-12 col-sm-6 col-md-3">
        <q-card bordered flat>
          <q-card-section>
            <div class="text-caption text-grey-7">Sessions ({{ sessionDays }}d)</div>
            <div class="text-h4 text-weight-bold q-mt-xs">{{ sessions.total_sessions ?? '-' }}</div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- ============================================================ -->
    <!-- System Health Checks                                         -->
    <!-- ============================================================ -->
    <q-card bordered flat class="q-mb-lg">
      <q-card-section>
        <div class="text-subtitle1 text-weight-medium q-mb-md">System Health Checks</div>
        <div v-if="!health.checks" class="text-grey-6">Loading...</div>
        <div v-else class="row q-col-gutter-sm">
          <div v-for="(check, name) in health.checks" :key="name" class="col-12 col-sm-6 col-md-4">
            <q-card flat bordered class="full-height">
              <q-card-section class="q-pa-sm">
                <div class="row items-center q-mb-xs">
                  <q-icon
                    :name="checkIcon(check)"
                    :color="checkColor(check)"
                    size="18px"
                    class="q-mr-xs"
                  />
                  <div class="text-caption text-weight-medium">{{ formatCheckName(name) }}</div>
                </div>
                <div class="text-caption text-grey-7">
                  <div v-for="(val, key) in flattenCheck(check)" :key="key" class="row">
                    <span class="text-grey-6" style="min-width:110px">{{ key }}:</span>
                    <span :class="key === 'status' ? `text-${checkColor(check)}` : ''">{{ val }}</span>
                  </div>
                </div>
              </q-card-section>
            </q-card>
          </div>
        </div>
      </q-card-section>
    </q-card>

    <!-- ============================================================ -->
    <!-- Tool Performance Table                                       -->
    <!-- ============================================================ -->
    <q-card bordered flat class="q-mb-lg">
      <q-card-section>
        <div class="row items-center justify-between q-mb-md">
          <div class="text-subtitle1 text-weight-medium">Tool Performance ({{ perfHours }}h)</div>
          <q-select
            v-model="perfHours"
            :options="[1, 6, 12, 24, 48, 72, 168]"
            dense
            outlined
            style="width: 100px"
            @update:model-value="loadPerformance"
          />
        </div>
        <q-table
          :rows="perf.tools || []"
          :columns="perfColumns"
          row-key="tool_name"
          flat
          bordered
          dense
          :pagination="{ rowsPerPage: 15 }"
          :loading="loadingPerf"
        >
          <template v-slot:body-cell-success_rate_pct="props">
            <q-td :props="props">
              <q-badge
                :color="props.value >= 95 ? 'positive' : props.value >= 80 ? 'warning' : 'negative'"
                :label="`${props.value}%`"
              />
            </q-td>
          </template>
          <template v-slot:body-cell-avg_latency_ms="props">
            <q-td :props="props">
              <span :class="props.value > 2000 ? 'text-negative text-weight-bold' : ''">
                {{ props.value != null ? `${props.value}ms` : '-' }}
              </span>
            </q-td>
          </template>
          <template v-slot:body-cell-errors="props">
            <q-td :props="props">
              <span :class="props.value > 0 ? 'text-negative text-weight-bold' : 'text-grey-6'">
                {{ props.value }}
              </span>
            </q-td>
          </template>
        </q-table>
      </q-card-section>
    </q-card>

    <!-- ============================================================ -->
    <!-- Session Analytics + Peak Hours                               -->
    <!-- ============================================================ -->
    <div class="row q-col-gutter-md q-mb-lg">
      <div class="col-12 col-md-6">
        <q-card bordered flat class="full-height">
          <q-card-section>
            <div class="row items-center justify-between q-mb-md">
              <div class="text-subtitle1 text-weight-medium">Session Analytics ({{ sessionDays }}d)</div>
              <q-select
                v-model="sessionDays"
                :options="[1, 3, 7, 14, 30]"
                dense
                outlined
                style="width: 80px"
                @update:model-value="loadSessions"
              />
            </div>
            <div v-if="sessions.avg_messages_per_session != null" class="q-gutter-sm">
              <div class="row items-center q-mb-xs">
                <span class="text-grey-7" style="width:200px">Avg messages/session:</span>
                <span class="text-weight-medium">{{ sessions.avg_messages_per_session }}</span>
              </div>
              <div class="row items-center q-mb-xs">
                <span class="text-grey-7" style="width:200px">Avg tool calls/session:</span>
                <span class="text-weight-medium">{{ sessions.avg_tool_calls_per_session }}</span>
              </div>
            </div>

            <!-- Sessions per day mini-table -->
            <div v-if="sessions.sessions_per_day && sessions.sessions_per_day.length" class="q-mt-md">
              <div class="text-caption text-grey-6 q-mb-xs">Sessions per day</div>
              <div class="row q-gutter-xs">
                <div
                  v-for="day in sessions.sessions_per_day"
                  :key="day.date"
                  class="text-center q-pa-xs"
                  style="min-width: 60px"
                >
                  <div class="text-caption text-grey-6">{{ day.date.slice(5) }}</div>
                  <div class="text-weight-bold">{{ day.sessions }}</div>
                </div>
              </div>
            </div>

            <!-- Top tools -->
            <div v-if="sessions.top_tools && sessions.top_tools.length" class="q-mt-md">
              <div class="text-caption text-grey-6 q-mb-xs">Top tools</div>
              <q-list dense separator>
                <q-item v-for="t in sessions.top_tools.slice(0, 8)" :key="t.tool" dense class="q-px-none">
                  <q-item-section>
                    <q-item-label class="font-mono text-caption">{{ t.tool }}</q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <q-badge color="primary" outline :label="t.calls" />
                  </q-item-section>
                </q-item>
              </q-list>
            </div>
          </q-card-section>
        </q-card>
      </div>

      <!-- Peak Hours -->
      <div class="col-12 col-md-6">
        <q-card bordered flat class="full-height">
          <q-card-section>
            <div class="text-subtitle1 text-weight-medium q-mb-md">Peak Usage Hours</div>
            <div v-if="sessions.peak_hours && sessions.peak_hours.length">
              <div v-for="h in sessions.peak_hours" :key="h.hour" class="row items-center q-mb-sm">
                <span class="text-grey-7" style="width:80px">{{ formatHour(h.hour) }}</span>
                <q-linear-progress
                  :value="h.calls / maxPeakCalls"
                  color="primary"
                  style="flex:1; height:20px"
                  class="q-mr-sm rounded-borders"
                />
                <span class="text-weight-medium" style="width:40px; text-align:right">{{ h.calls }}</span>
              </div>
            </div>
            <div v-else class="text-grey-6 text-caption">No data yet</div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- ============================================================ -->
    <!-- Recent Errors                                                -->
    <!-- ============================================================ -->
    <q-card bordered flat class="q-mb-lg">
      <q-card-section>
        <div class="row items-center justify-between q-mb-md">
          <div class="text-subtitle1 text-weight-medium">
            Recent Errors
            <q-badge v-if="errors.total_errors" color="negative" :label="errors.total_errors" class="q-ml-sm" />
          </div>
          <q-btn flat dense color="primary" label="Load" icon="bug_report" :loading="loadingErrors" @click="loadErrors" />
        </div>

        <!-- Error frequency by tool -->
        <div v-if="errors.errors_by_tool && errors.errors_by_tool.length" class="q-mb-md">
          <div class="row q-gutter-sm">
            <q-chip
              v-for="et in errors.errors_by_tool"
              :key="et.tool"
              color="red-1"
              text-color="negative"
              size="sm"
            >{{ et.tool }}: {{ et.count }}</q-chip>
          </div>
        </div>

        <!-- Error list -->
        <q-list v-if="errors.recent_errors && errors.recent_errors.length" dense separator bordered class="rounded-borders">
          <q-expansion-item
            v-for="(err, idx) in errors.recent_errors"
            :key="idx"
            dense
            expand-separator
          >
            <template v-slot:header>
              <q-item-section avatar>
                <q-icon name="error" color="negative" size="sm" />
              </q-item-section>
              <q-item-section>
                <q-item-label class="font-mono text-caption">{{ err.tool_name }}</q-item-label>
                <q-item-label caption>{{ err.error?.slice(0, 120) }}</q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-item-label caption>{{ formatTimestamp(err.timestamp) }}</q-item-label>
                <q-item-label v-if="err.duration_ms" caption>{{ err.duration_ms }}ms</q-item-label>
              </q-item-section>
            </template>
            <q-card flat>
              <q-card-section class="q-pa-sm">
                <div class="text-caption text-grey-8 q-mb-xs"><strong>Error:</strong></div>
                <pre class="text-caption bg-grey-2 q-pa-xs rounded-borders" style="white-space:pre-wrap; word-break:break-all">{{ err.error }}</pre>
                <div v-if="err.input" class="q-mt-sm">
                  <div class="text-caption text-grey-8 q-mb-xs"><strong>Input:</strong></div>
                  <pre class="text-caption bg-grey-2 q-pa-xs rounded-borders" style="white-space:pre-wrap; word-break:break-all; max-height:200px; overflow:auto">{{ JSON.stringify(err.input, null, 2) }}</pre>
                </div>
              </q-card-section>
            </q-card>
          </q-expansion-item>
        </q-list>
        <div v-else class="text-grey-6 text-caption">Click Load to fetch recent errors</div>
      </q-card-section>
    </q-card>

    <!-- ============================================================ -->
    <!-- Slow Tools                                                   -->
    <!-- ============================================================ -->
    <q-card bordered flat class="q-mb-lg">
      <q-card-section>
        <div class="row items-center justify-between q-mb-md">
          <div class="text-subtitle1 text-weight-medium">
            Slow Tools
            <q-badge v-if="slow.count" color="warning" text-color="dark" :label="slow.count" class="q-ml-sm" />
          </div>
          <div class="row items-center q-gutter-sm">
            <q-input
              v-model.number="slowThreshold"
              type="number"
              dense
              outlined
              style="width:100px"
              suffix="ms"
            />
            <q-btn flat dense color="primary" label="Load" icon="speed" :loading="loadingSlow" @click="loadSlowTools" />
          </div>
        </div>

        <q-table
          v-if="slow.slow_executions && slow.slow_executions.length"
          :rows="slow.slow_executions"
          :columns="slowColumns"
          row-key="timestamp"
          flat
          bordered
          dense
          :pagination="{ rowsPerPage: 10 }"
        >
          <template v-slot:body-cell-duration_ms="props">
            <q-td :props="props">
              <span class="text-negative text-weight-bold">{{ props.value }}ms</span>
            </q-td>
          </template>
        </q-table>
        <div v-else class="text-grey-6 text-caption">Click Load to find slow tool executions</div>
      </q-card-section>
    </q-card>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import { fetchPerformance, fetchSessions, fetchHealth, fetchErrors, fetchSlowTools } from '../api/monitor';

const $q = useQuasar();

// State
const loading = ref(false);
const loadingPerf = ref(false);
const loadingErrors = ref(false);
const loadingSlow = ref(false);

const perfHours = ref(24);
const sessionDays = ref(7);
const slowThreshold = ref(2000);

const health = ref({});
const perf = ref({});
const sessions = ref({});
const errors = ref({});
const slow = ref({});

// Columns
const perfColumns = [
  { name: 'tool_name', label: 'Tool', field: 'tool_name', align: 'left', sortable: true, style: 'font-family: monospace; font-size: 12px' },
  { name: 'total_calls', label: 'Calls', field: 'total_calls', align: 'center', sortable: true },
  { name: 'success_rate_pct', label: 'Success %', field: 'success_rate_pct', align: 'center', sortable: true },
  { name: 'errors', label: 'Errors', field: 'errors', align: 'center', sortable: true },
  { name: 'blocked', label: 'Blocked', field: 'blocked', align: 'center', sortable: true },
  { name: 'avg_latency_ms', label: 'Avg Latency', field: 'avg_latency_ms', align: 'center', sortable: true },
  { name: 'p95_latency_ms', label: 'P95 Latency', field: 'p95_latency_ms', align: 'center', sortable: true, format: v => v != null ? `${v}ms` : '-' },
];

const slowColumns = [
  { name: 'tool_name', label: 'Tool', field: 'tool_name', align: 'left', sortable: true, style: 'font-family: monospace; font-size: 12px' },
  { name: 'duration_ms', label: 'Duration', field: 'duration_ms', align: 'center', sortable: true },
  { name: 'input_summary', label: 'Input', field: 'input_summary', align: 'left', style: 'max-width:300px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px' },
  { name: 'timestamp', label: 'When', field: 'timestamp', align: 'right', sortable: true, format: v => formatTimestamp(v) },
];

// Computed
const maxPeakCalls = computed(() => {
  if (!sessions.value.peak_hours || !sessions.value.peak_hours.length) return 1;
  return Math.max(...sessions.value.peak_hours.map(h => h.calls), 1);
});

// Helpers
function healthIcon(status) {
  if (status === 'healthy') return 'check_circle';
  if (status === 'degraded') return 'warning';
  if (status === 'critical') return 'error';
  return 'help';
}

function healthColor(status) {
  if (status === 'healthy') return 'positive';
  if (status === 'degraded') return 'warning';
  if (status === 'critical') return 'negative';
  return 'grey-6';
}

function checkIcon(check) {
  const s = check?.status || '';
  if (s === 'ok') return 'check_circle';
  if (s === 'warning') return 'warning';
  if (s === 'error' || s === 'critical') return 'error';
  if (s === 'unavailable') return 'remove_circle_outline';
  return 'info';
}

function checkColor(check) {
  const s = check?.status || '';
  if (s === 'ok' || s === 'configured') return 'positive';
  if (s === 'warning') return 'warning';
  if (s === 'error' || s === 'critical') return 'negative';
  if (s === 'unavailable' || s === 'missing') return 'grey-6';
  return 'grey-6';
}

function formatCheckName(name) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function flattenCheck(check) {
  if (typeof check !== 'object' || check === null) return { value: check };
  const out = {};
  for (const [k, v] of Object.entries(check)) {
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v)) {
        out[k2] = v2;
      }
    } else {
      out[k] = v;
    }
  }
  return out;
}

function formatHour(h) {
  if (h === 0) return '12 AM';
  if (h < 12) return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}

function formatTimestamp(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleString('en-ZA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return ts;
  }
}

// Data loaders
async function loadHealth() {
  try {
    health.value = await fetchHealth();
  } catch (err) {
    $q.notify({ type: 'negative', message: `Health check failed: ${err.message}` });
  }
}

async function loadPerformance() {
  loadingPerf.value = true;
  try {
    perf.value = await fetchPerformance(perfHours.value);
  } catch (err) {
    $q.notify({ type: 'negative', message: `Performance load failed: ${err.message}` });
  } finally {
    loadingPerf.value = false;
  }
}

async function loadSessions() {
  try {
    sessions.value = await fetchSessions(sessionDays.value);
  } catch (err) {
    $q.notify({ type: 'negative', message: `Session data failed: ${err.message}` });
  }
}

async function loadErrors() {
  loadingErrors.value = true;
  try {
    errors.value = await fetchErrors(perfHours.value);
  } catch (err) {
    $q.notify({ type: 'negative', message: `Error data failed: ${err.message}` });
  } finally {
    loadingErrors.value = false;
  }
}

async function loadSlowTools() {
  loadingSlow.value = true;
  try {
    slow.value = await fetchSlowTools(perfHours.value, slowThreshold.value);
  } catch (err) {
    $q.notify({ type: 'negative', message: `Slow tools failed: ${err.message}` });
  } finally {
    loadingSlow.value = false;
  }
}

async function refreshAll() {
  loading.value = true;
  await Promise.all([loadHealth(), loadPerformance(), loadSessions()]);
  loading.value = false;
}

onMounted(() => {
  refreshAll();
});
</script>

<style scoped>
.font-mono {
  font-family: 'Fira Code', 'Consolas', monospace;
}
</style>
