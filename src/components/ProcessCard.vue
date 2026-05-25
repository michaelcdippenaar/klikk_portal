<template>
  <q-card class="q-mb-md">
    <q-card-section>
      <div class="text-subtitle1 text-weight-medium">{{ title }}</div>
      <div class="text-caption text-grey-7">{{ description }}</div>
    </q-card-section>

    <q-card-section v-if="showForm">
      <slot name="form"></slot>
    </q-card-section>

    <q-card-section v-if="panelStatus !== 'idle'">
      <ResultPanel
        :status="panelStatus"
        :summary="panelSummary"
        :rawPayload="panelRawPayload"
      />
    </q-card-section>

    <q-card-actions align="right">
      <slot name="actions">
        <q-btn
          :label="buttonLabel"
          color="primary"
          :loading="loading"
          :disable="loading || !canRun"
          @click="$emit('run')"
        />
      </slot>
    </q-card-actions>
  </q-card>
</template>

<script setup>
import { computed } from 'vue';
import ResultPanel from './klikk/ResultPanel.vue';

const props = defineProps({
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    default: '',
  },
  loading: {
    type: Boolean,
    default: false,
  },
  result: {
    type: Object,
    default: null,
  },
  showForm: {
    type: Boolean,
    default: false,
  },
  buttonLabel: {
    type: String,
    default: 'Run',
  },
  canRun: {
    type: Boolean,
    default: true,
  },
});

defineEmits(['run']);

/**
 * Derive the ResultPanel status from loading + result props.
 * - loading=true           → 'loading'
 * - result present, success  → 'success'
 * - result present, !success → 'error'
 * - no result, not loading   → 'idle'
 */
const panelStatus = computed(() => {
  if (props.loading) return 'loading';
  if (!props.result) return 'idle';
  return props.result.success ? 'success' : 'error';
});

/**
 * Extract numeric counts from a raw API payload object.
 * Walks the top level and one level deep for numeric values that look like
 * operational counters (integers or small numbers). Tolerates unknown shapes.
 * @param {*} data
 * @returns {Record<string, number>}
 */
function extractCounts(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const counts = {};
  for (const [key, val] of Object.entries(data)) {
    if (typeof val === 'number' && Number.isFinite(val)) {
      counts[key] = val;
    }
  }
  return counts;
}

/**
 * Extract a timestamp from a raw API payload.
 * Looks for common timestamp field names.
 */
function extractTimestamp(data) {
  if (!data || typeof data !== 'object') return null;
  const tsKeys = ['timestamp', 'completed_at', 'updated_at', 'created_at', 'synced_at', 'last_run'];
  for (const key of tsKeys) {
    if (data[key]) return data[key];
  }
  return null;
}

/**
 * Extract warnings from a raw API payload.
 * Looks for common warning/error list fields.
 */
function extractWarnings(data) {
  if (!data || typeof data !== 'object') return [];
  const warnKeys = ['warnings', 'errors', 'messages'];
  for (const key of warnKeys) {
    if (Array.isArray(data[key]) && data[key].length > 0) {
      return data[key].map((w) => (typeof w === 'string' ? w : JSON.stringify(w)));
    }
  }
  return [];
}

/**
 * Build the summary object for ResultPanel.
 * On error: { message: string }
 * On success: { ...counts, timestamp?, warnings? }
 */
const panelSummary = computed(() => {
  if (!props.result) return null;

  if (!props.result.success) {
    return { message: props.result.error || 'An unexpected error occurred.' };
  }

  // The raw API response lives in result.result (set by processStore.runProcess)
  const apiData = props.result.result;
  const counts = extractCounts(apiData);
  const timestamp = extractTimestamp(apiData) || new Date().toISOString();
  const warnings = extractWarnings(apiData);

  const summary = { ...counts, timestamp };
  if (warnings.length) summary.warnings = warnings;
  return summary;
});

/**
 * The raw payload shown in the disclosure toggle.
 * On error: the error string. On success: the full API response.
 */
const panelRawPayload = computed(() => {
  if (!props.result) return null;
  return props.result.success ? props.result.result : { error: props.result.error };
});
</script>
