<!--
  PipelineStatusStrip — Processes page helper.

  Renders a horizontal left-to-right pipeline indicator: one slot per stage,
  each showing a 12px overline label, a StatusPill (auto-tone), and a
  FreshnessChip for last-success time.

  When the backend cannot yet surface per-stage state, pass null for stageStates
  and the component renders `idle` + Never per the em-dash doctrine.

  API:
    stageStates  (object | null) — keyed by stage id:
                   { state: 'idle'|'running'|'queued'|'failed'|'succeeded',
                     lastSuccessAt: Date|string|null }
                 Null → all stages render idle + Never.
-->
<template>
  <div class="pss-strip" role="group" aria-label="Pipeline stages">
    <template v-for="(stage, index) in STAGES" :key="stage.id">
      <!-- Chevron separator between stages -->
      <div v-if="index > 0" class="pss-strip__sep" aria-hidden="true">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12" height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>

      <!-- Stage slot -->
      <div class="pss-strip__stage">
        <span class="pss-strip__stage-label">{{ stage.label }}</span>
        <StatusPill
          :tone="stageTone(stage.id)"
          :label="stageStateLabel(stage.id)"
          :icon="true"
          size="sm"
        />
        <FreshnessChip :value="stageLastSuccess(stage.id)" />
      </div>
    </template>
  </div>
</template>

<script setup>
import StatusPill from '../klikk/StatusPill.vue';
import FreshnessChip from '../klikk/FreshnessChip.vue';

const props = defineProps({
  /**
   * Per-stage state object, keyed by stage id.
   * Shape per key: { state: string, lastSuccessAt: Date|string|null }
   * Pass null when backend does not yet expose per-stage data.
   */
  stageStates: {
    type: Object,
    default: null,
  },
});

// Pipeline stages — fixed order defines left-to-right reading = pipeline order.
const STAGES = [
  { id: 'metadata',      label: 'Update Metadata' },
  { id: 'data',          label: 'Sync Transactions & Journals' },
  { id: 'journals',      label: 'Process Journals' },
  { id: 'trail-balance', label: 'Build Trail Balance' },
  { id: 'documents',     label: 'Document Sync' },
];

const STATE_TONES = {
  idle:      'neutral',
  running:   'running',
  queued:    'warning',
  failed:    'error',
  succeeded: 'success',
};

const STATE_LABELS = {
  idle:      'Idle',
  running:   'Running',
  queued:    'Queued',
  failed:    'Failed',
  succeeded: 'Done',
};

function stageData(id) {
  return props.stageStates?.[id] ?? null;
}

function stageTone(id) {
  const state = stageData(id)?.state ?? 'idle';
  return STATE_TONES[state] ?? 'neutral';
}

function stageStateLabel(id) {
  const state = stageData(id)?.state ?? 'idle';
  return STATE_LABELS[state] ?? state;
}

function stageLastSuccess(id) {
  return stageData(id)?.lastSuccessAt ?? null;
}
</script>

<style scoped>
/* ── PipelineStatusStrip ────────────────────────────────────────────────────
   Full-width horizontal strip. Border/bg from KDL card tokens.
   Stages separated by muted chevrons. 12px overline labels.
──────────────────────────────────────────────────────────────────────────── */
.pss-strip {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0;
  padding: 12px 20px;
  background: var(--kdl-card-bg);
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 8px;
  margin-bottom: 20px;
}

.pss-strip__sep {
  color: var(--kdl-text-hint);
  display: flex;
  align-items: center;
  padding: 0 8px;
  flex-shrink: 0;
}

.pss-strip__stage {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  flex: 1 1 0;
  min-width: 120px;
  padding: 4px 0;
}

.pss-strip__stage-label {
  /* 11px overline — documented exception to the 12px floor */
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--kdl-text-hint);
  white-space: nowrap;
}

/* ── Responsive — on narrow viewports stages wrap into 2–3 per row ── */
@media (max-width: 900px) {
  .pss-strip__stage {
    min-width: 140px;
    flex: 1 1 140px;
  }

  .pss-strip__sep {
    display: none;
  }
}
</style>
