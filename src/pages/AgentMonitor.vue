<template>
  <AppPage>
    <PageHeader title="Agent Monitor" subtitle="Performance, health, and diagnostics">
      <template #actions>
        <button class="btn btn-ghost btn-sm" :disabled="loading" @click="refreshAll">
          <!-- Lucide refresh-cw -->
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" :class="loading ? 'am-spin' : ''" aria-hidden="true">
            <polyline points="23 4 23 10 17 10"/>
            <polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          {{ loading ? 'Refreshing…' : 'Refresh' }}
        </button>
      </template>
    </PageHeader>

    <!-- ── Health overview tiles ─────────────────────────────────────────── -->
    <div class="am-tiles">
      <!-- Overall health -->
      <div class="am-tile">
        <div class="am-tile__label">Overall Health</div>
        <div class="am-tile__value-row">
          <StatusPill
            :tone="healthTone(health.overall)"
            :label="(health.overall || 'unknown').toUpperCase()"
            :icon="true"
            size="sm"
          />
        </div>
      </div>
      <!-- Tool executions -->
      <div class="am-tile">
        <div class="am-tile__label">Tool Executions ({{ perfHours }}h)</div>
        <div class="am-tile__big">{{ perf.total_executions ?? '—' }}</div>
      </div>
      <!-- Error count -->
      <div class="am-tile">
        <div class="am-tile__label">Errors ({{ perfHours }}h)</div>
        <div class="am-tile__big" :class="perf.total_errors > 0 ? 'am-tile__big--error' : 'am-tile__big--ok'">
          {{ perf.total_errors ?? '—' }}
        </div>
      </div>
      <!-- Sessions -->
      <div class="am-tile">
        <div class="am-tile__label">Sessions ({{ sessionDays }}d)</div>
        <div class="am-tile__big">{{ sessions.total_sessions ?? '—' }}</div>
      </div>
    </div>

    <!-- ── System health checks ──────────────────────────────────────────── -->
    <div class="am-section">
      <div class="am-section__title">System Health Checks</div>
      <div v-if="!health.checks" class="am-muted">Loading...</div>
      <div v-else class="am-checks-grid">
        <div v-for="(check, name) in health.checks" :key="name" class="am-check-card">
          <div class="am-check-card__header">
            <StatusPill :tone="checkTone(check)" :label="formatCheckName(name)" size="sm" :icon="true" />
          </div>
          <div class="am-check-card__rows">
            <div v-for="(val, key) in flattenCheck(check)" :key="key" class="am-check-card__row">
              <span class="am-check-card__key">{{ key }}</span>
              <span class="am-check-card__val" :class="key === 'status' ? `am-status--${checkTone(check)}` : ''">{{ val }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Tool performance table ─────────────────────────────────────────── -->
    <div class="am-section">
      <div class="am-section__row">
        <div class="am-section__title">Tool Performance ({{ perfHours }}h)</div>
        <KSelect
          v-model="perfHours"
          label=""
          :options="[1, 6, 12, 24, 48, 72, 168]"
          class="am-select--100"
          @update:model-value="loadPerformance"
        />
      </div>
      <KTable
        :columns="perfColumns"
        :data="perf.tools || []"
        :loading="loadingPerf"
        dense
        pagination="client"
        :pageSize="15"
      >
        <template #cell-success_rate_pct="{ value }">
          <StatusPill
            :tone="value >= 95 ? 'success' : value >= 80 ? 'warning' : 'error'"
            :label="`${value}%`"
            size="sm"
          />
        </template>
        <template #cell-avg_latency_ms="{ value }">
          <span :class="value > 2000 ? 'am-cell--error am-cell--bold' : ''">
            {{ value != null ? `${value}ms` : '—' }}
          </span>
        </template>
        <template #cell-errors="{ value }">
          <span :class="value > 0 ? 'am-cell--error am-cell--bold' : 'am-cell--muted'">{{ value }}</span>
        </template>
      </KTable>
    </div>

    <!-- ── Session analytics + peak hours ────────────────────────────────── -->
    <div class="am-two-col">
      <!-- Session analytics -->
      <div class="am-section am-section--card">
        <div class="am-section__row am-section__row--bottom-gap">
          <div class="am-section__title">Session Analytics ({{ sessionDays }}d)</div>
          <KSelect
            v-model="sessionDays"
            label=""
            :options="[1, 3, 7, 14, 30]"
            class="am-select--80"
            @update:model-value="loadSessions"
          />
        </div>

        <div v-if="sessions.avg_messages_per_session != null" class="am-session-stats">
          <div class="am-session-stat">
            <span class="am-session-stat__label">Avg messages/session</span>
            <span class="am-session-stat__value">{{ sessions.avg_messages_per_session }}</span>
          </div>
          <div class="am-session-stat">
            <span class="am-session-stat__label">Avg tool calls/session</span>
            <span class="am-session-stat__value">{{ sessions.avg_tool_calls_per_session }}</span>
          </div>
        </div>

        <!-- Sessions per day -->
        <div v-if="sessions.sessions_per_day && sessions.sessions_per_day.length" class="am-spd">
          <div class="am-spd__label">Sessions per day</div>
          <div class="am-spd__row">
            <div v-for="day in sessions.sessions_per_day" :key="day.date" class="am-spd__cell">
              <div class="am-spd__date">{{ day.date.slice(5) }}</div>
              <div class="am-spd__count">{{ day.sessions }}</div>
            </div>
          </div>
        </div>

        <!-- Top tools -->
        <div v-if="sessions.top_tools && sessions.top_tools.length" class="am-top-tools">
          <div class="am-top-tools__label">Top tools</div>
          <div class="am-top-tools__list">
            <div v-for="t in sessions.top_tools.slice(0, 8)" :key="t.tool" class="am-top-tools__row">
              <span class="am-top-tools__name font-mono">{{ t.tool }}</span>
              <KBadge :label="String(t.calls)" tone="accent" />
            </div>
          </div>
        </div>
      </div>

      <!-- Peak hours -->
      <div class="am-section am-section--card">
        <div class="am-section__title am-section__row--bottom-gap">Peak Usage Hours</div>
        <div v-if="sessions.peak_hours && sessions.peak_hours.length">
          <div v-for="h in sessions.peak_hours" :key="h.hour" class="am-peak-row">
            <span class="am-peak-row__label">{{ formatHour(h.hour) }}</span>
            <div class="am-peak-row__bar-wrap">
              <div
                class="am-peak-row__bar"
                :style="{ width: Math.round((h.calls / maxPeakCalls) * 100) + '%' }"
              />
            </div>
            <span class="am-peak-row__count">{{ h.calls }}</span>
          </div>
        </div>
        <div v-else class="am-muted">No data yet</div>
      </div>
    </div>

    <!-- ── Recent errors ──────────────────────────────────────────────────── -->
    <div class="am-section">
      <div class="am-section__row am-section__row--bottom-gap">
        <div class="am-section__title">
          Recent Errors
          <KBadge v-if="errors.total_errors" :label="String(errors.total_errors)" tone="default" />
        </div>
        <button class="btn btn-ghost btn-sm" :disabled="loadingErrors" @click="loadErrors">
          <!-- Lucide bug -->
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="6" width="8" height="14" rx="4"/><path d="M19 7l-3 2M5 7l3 2M19 12h-5M5 12h5M19 17l-3-2M5 17l3-2"/></svg>
          {{ loadingErrors ? 'Loading…' : 'Load' }}
        </button>
      </div>

      <!-- Error frequency chips -->
      <div v-if="errors.errors_by_tool && errors.errors_by_tool.length" class="am-error-chips">
        <KChip v-for="et in errors.errors_by_tool" :key="et.tool" :label="`${et.tool}: ${et.count}`" />
      </div>

      <!-- Error accordion list -->
      <div v-if="errors.recent_errors && errors.recent_errors.length" class="am-error-list">
        <details
          v-for="(err, idx) in errors.recent_errors"
          :key="idx"
          class="am-error-item"
        >
          <summary class="am-error-item__summary">
            <div class="am-error-item__meta">
              <span class="am-error-item__tool font-mono">{{ err.tool_name }}</span>
              <span class="am-error-item__snippet">{{ err.error?.slice(0, 120) }}</span>
            </div>
            <div class="am-error-item__side">
              <span class="am-error-item__time">{{ formatTimestamp(err.timestamp) }}</span>
              <span v-if="err.duration_ms" class="am-error-item__dur">{{ err.duration_ms }}ms</span>
            </div>
          </summary>
          <div class="am-error-item__body">
            <div class="am-error-item__section-label">Error:</div>
            <pre class="am-code-block">{{ err.error }}</pre>
            <template v-if="err.input">
              <div class="am-error-item__section-label am-error-item__section-label--gap">Input:</div>
              <pre class="am-code-block am-code-block--scroll">{{ JSON.stringify(err.input, null, 2) }}</pre>
            </template>
          </div>
        </details>
      </div>
      <div v-else class="am-muted">Click Load to fetch recent errors</div>
    </div>

    <!-- ── Slow tools ─────────────────────────────────────────────────────── -->
    <div class="am-section">
      <div class="am-section__row am-section__row--bottom-gap">
        <div class="am-section__title">
          Slow Tools
          <KBadge v-if="slow.count" :label="String(slow.count)" tone="default" />
        </div>
        <div class="am-section__row am-section__row--tight">
          <KInput
            v-model="slowThreshold"
            label=""
            type="number"
            class="am-input--100"
          />
          <span class="am-muted am-muted--unit">ms</span>
          <button class="btn btn-ghost btn-sm" :disabled="loadingSlow" @click="loadSlowTools">
            <!-- Lucide zap -->
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            {{ loadingSlow ? 'Loading…' : 'Load' }}
          </button>
        </div>
      </div>

      <KTable
        v-if="slow.slow_executions && slow.slow_executions.length"
        :columns="slowColumns"
        :data="slow.slow_executions"
        dense
        pagination="client"
        :pageSize="10"
      >
        <template #cell-duration_ms="{ value }">
          <span class="am-cell--error am-cell--bold">{{ value }}ms</span>
        </template>
      </KTable>
      <div v-else class="am-muted">Click Load to find slow tool executions</div>
    </div>
  </AppPage>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import AppPage from '../components/shell/AppPage.vue';
import { useToast } from '../composables/useToast';
import { fetchPerformance, fetchSessions, fetchHealth, fetchErrors, fetchSlowTools } from '../api/monitor';
import PageHeader from '../components/klikk/PageHeader.vue';
import StatusPill from '../components/klikk/StatusPill.vue';
import KTable from '../components/klikk/KTable.vue';
import KSelect from '../components/klikk/KSelect.vue';
import KInput from '../components/klikk/KInput.vue';
import KBadge from '../components/klikk/KBadge.vue';
import KChip from '../components/klikk/KChip.vue';

const toast = useToast();

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

// KTable column definitions
const perfColumns = [
  { accessorKey: 'tool_name', header: 'Tool', meta: { style: 'font-family: monospace; font-size: 12px' }, enableSorting: true },
  { accessorKey: 'total_calls', header: 'Calls', meta: { align: 'center' }, enableSorting: true },
  { accessorKey: 'success_rate_pct', header: 'Success %', meta: { align: 'center' }, enableSorting: true },
  { accessorKey: 'errors', header: 'Errors', meta: { align: 'center' }, enableSorting: true },
  { accessorKey: 'blocked', header: 'Blocked', meta: { align: 'center' }, enableSorting: true },
  { accessorKey: 'avg_latency_ms', header: 'Avg Latency', meta: { align: 'center' }, enableSorting: true },
  {
    accessorKey: 'p95_latency_ms',
    header: 'P95 Latency',
    meta: { align: 'center' },
    enableSorting: true,
    cell: (info) => info.getValue() != null ? `${info.getValue()}ms` : '—',
  },
];

const slowColumns = [
  { accessorKey: 'tool_name', header: 'Tool', meta: { style: 'font-family: monospace; font-size: 12px' }, enableSorting: true },
  { accessorKey: 'duration_ms', header: 'Duration', meta: { align: 'center' }, enableSorting: true },
  { accessorKey: 'input_summary', header: 'Input', meta: { style: 'max-width:300px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px' } },
  {
    accessorKey: 'timestamp',
    header: 'When',
    meta: { align: 'right' },
    enableSorting: true,
    cell: (info) => formatTimestamp(info.getValue()),
  },
];

// Computed
const maxPeakCalls = computed(() => {
  if (!sessions.value.peak_hours || !sessions.value.peak_hours.length) return 1;
  return Math.max(...sessions.value.peak_hours.map(h => h.calls), 1);
});

// Health tone helpers — map Quasar colour names → KDL tones
function healthTone(status) {
  if (status === 'healthy') return 'success';
  if (status === 'degraded') return 'warning';
  if (status === 'critical') return 'error';
  return 'neutral';
}

function checkTone(check) {
  const s = check?.status || '';
  if (s === 'ok' || s === 'configured') return 'success';
  if (s === 'warning') return 'warning';
  if (s === 'error' || s === 'critical') return 'error';
  return 'neutral';
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
    toast.error(`Health check failed: ${err.message}`);
  }
}

async function loadPerformance() {
  loadingPerf.value = true;
  try {
    perf.value = await fetchPerformance(perfHours.value);
  } catch (err) {
    toast.error(`Performance load failed: ${err.message}`);
  } finally {
    loadingPerf.value = false;
  }
}

async function loadSessions() {
  try {
    sessions.value = await fetchSessions(sessionDays.value);
  } catch (err) {
    toast.error(`Session data failed: ${err.message}`);
  }
}

async function loadErrors() {
  loadingErrors.value = true;
  try {
    errors.value = await fetchErrors(perfHours.value);
  } catch (err) {
    toast.error(`Error data failed: ${err.message}`);
  } finally {
    loadingErrors.value = false;
  }
}

async function loadSlowTools() {
  loadingSlow.value = true;
  try {
    slow.value = await fetchSlowTools(perfHours.value, slowThreshold.value);
  } catch (err) {
    toast.error(`Slow tools failed: ${err.message}`);
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
.page-content {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ── Spin animation ─────────────────────────────────────────────────────── */
.am-spin {
  animation: am-spin 0.8s linear infinite;
}
@keyframes am-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
  .am-spin { animation: none; }
}

/* ── Health tiles ────────────────────────────────────────────────────────── */
.am-tiles {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

@media (max-width: 900px) {
  .am-tiles { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 480px) {
  .am-tiles { grid-template-columns: 1fr; }
}

.am-tile {
  background: var(--kdl-card-bg);
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 8px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.am-tile__label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--kdl-text-hint);
}

.am-tile__value-row {
  display: flex;
  align-items: center;
  min-height: 22px;
}

.am-tile__big {
  font-size: 28px;
  font-weight: 700;
  color: var(--kdl-text-primary);
  line-height: 1;
}

.am-tile__big--error { color: var(--kdl-status-error); }
.am-tile__big--ok    { color: var(--kdl-status-success); }

/* ── Sections ────────────────────────────────────────────────────────────── */
.am-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.am-section--card {
  background: var(--kdl-card-bg);
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 8px;
  padding: 16px;
}

.am-section__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--kdl-text-primary);
  display: flex;
  align-items: center;
  gap: 6px;
}

.am-section__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.am-section__row--bottom-gap {
  margin-bottom: 4px;
}

/* ── Health checks grid ──────────────────────────────────────────────────── */
.am-checks-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}

.am-check-card {
  background: var(--kdl-card-bg);
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 6px;
  padding: 10px 12px;
}

.am-check-card__header {
  margin-bottom: 6px;
}

.am-check-card__rows {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.am-check-card__row {
  display: flex;
  gap: 6px;
  font-size: 12px;
}

.am-check-card__key {
  color: var(--kdl-text-hint);
  min-width: 110px;
  flex-shrink: 0;
}

.am-check-card__val {
  color: var(--kdl-text-secondary);
}

.am-status--success { color: var(--kdl-status-success); }
.am-status--warning { color: var(--kdl-status-warning); }
.am-status--error   { color: var(--kdl-status-error); }

/* ── Two-column layout ──────────────────────────────────────────────────── */
.am-two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

@media (max-width: 700px) {
  .am-two-col { grid-template-columns: 1fr; }
}

/* ── Session stats ──────────────────────────────────────────────────────── */
.am-session-stats {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}

.am-session-stat {
  display: flex;
  gap: 8px;
  font-size: 13px;
}

.am-session-stat__label {
  color: var(--kdl-text-muted);
  min-width: 200px;
}

.am-session-stat__value {
  font-weight: 600;
  color: var(--kdl-text-primary);
}

/* ── Sessions per day ────────────────────────────────────────────────────── */
.am-spd__label {
  font-size: 11px;
  color: var(--kdl-text-hint);
  margin-bottom: 4px;
}

.am-spd__row {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.am-spd__cell {
  text-align: center;
  min-width: 60px;
}

.am-spd__date {
  font-size: 11px;
  color: var(--kdl-text-hint);
}

.am-spd__count {
  font-size: 14px;
  font-weight: 700;
  color: var(--kdl-text-primary);
}

/* ── Top tools ──────────────────────────────────────────────────────────── */
.am-top-tools {
  margin-top: 12px;
}

.am-top-tools__label {
  font-size: 11px;
  color: var(--kdl-text-hint);
  margin-bottom: 6px;
}

.am-top-tools__list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.am-top-tools__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 6px;
  border-bottom: 1px solid var(--kdl-border-subtle);
  font-size: 12px;
}

.am-top-tools__name {
  color: var(--kdl-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Peak hours ─────────────────────────────────────────────────────────── */
.am-peak-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.am-peak-row__label {
  font-size: 13px;
  color: var(--kdl-text-muted);
  width: 60px;
  flex-shrink: 0;
}

.am-peak-row__bar-wrap {
  flex: 1;
  height: 20px;
  background: var(--kdl-border-subtle);
  border-radius: 4px;
  overflow: hidden;
}

.am-peak-row__bar {
  height: 100%;
  background: var(--kdl-accent);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.am-peak-row__count {
  font-size: 13px;
  font-weight: 600;
  color: var(--kdl-text-primary);
  width: 36px;
  text-align: right;
  flex-shrink: 0;
}

/* ── Error chips ─────────────────────────────────────────────────────────── */
.am-error-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

/* ── Error accordion ─────────────────────────────────────────────────────── */
.am-error-list {
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 6px;
  overflow: hidden;
}

.am-error-item {
  border-bottom: 1px solid var(--kdl-border-subtle);
}

.am-error-item:last-child {
  border-bottom: none;
}

.am-error-item__summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 12px;
  cursor: pointer;
  list-style: none;
  background: var(--kdl-card-bg);
  transition: background 0.1s;
}

.am-error-item__summary::-webkit-details-marker { display: none; }
.am-error-item__summary::marker { display: none; }

.am-error-item__summary:hover {
  background: var(--kdl-hover-bg);
}

.am-error-item__meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.am-error-item__tool {
  font-size: 12px;
  font-weight: 600;
  color: var(--kdl-text-primary);
}

.am-error-item__snippet {
  font-size: 11px;
  color: var(--kdl-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.am-error-item__side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  flex-shrink: 0;
  gap: 1px;
}

.am-error-item__time {
  font-size: 11px;
  color: var(--kdl-text-hint);
}

.am-error-item__dur {
  font-size: 11px;
  color: var(--kdl-text-hint);
}

.am-error-item__body {
  padding: 10px 12px;
  background: var(--kdl-hover-bg);
  border-top: 1px solid var(--kdl-border-subtle);
}

.am-error-item__section-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--kdl-text-muted);
  margin-bottom: 4px;
}

.am-code-block {
  font-family: ui-monospace, 'Cascadia Code', Menlo, monospace;
  font-size: 11px;
  padding: 6px 10px;
  border-radius: 4px;
  background: var(--kdl-card-bg);
  border: 1px solid var(--kdl-border-subtle);
  color: var(--kdl-text-secondary);
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
}

.am-code-block--scroll {
  max-height: 200px;
  overflow: auto;
}

/* ── Utilities ───────────────────────────────────────────────────────────── */
.am-muted {
  font-size: 13px;
  color: var(--kdl-text-muted);
}

/* Unit label next to threshold input */
.am-muted--unit {
  font-size: 13px;
  margin-right: 4px;
}

.am-cell--error { color: var(--kdl-status-error); }
.am-cell--bold  { font-weight: 700; }
.am-cell--muted { color: var(--kdl-text-hint); }

.font-mono {
  font-family: 'Fira Code', 'Consolas', monospace;
}

/* Sized selects / inputs */
.am-select--100 { width: 100px; }
.am-select--80  { width: 80px; }
.am-input--100  { width: 100px; }

/* Section row with tight gap override */
.am-section__row--tight {
  gap: 8px;
}

/* Error detail label gap */
.am-error-item__section-label--gap {
  margin-top: 8px;
}
</style>
