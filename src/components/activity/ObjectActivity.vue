<!--
  ObjectActivity — the trail for ONE object, newest first.

  Used by the finding detail dialog's Activity tab and the receipt detail
  dialog's Activity section. Standard users only: auditors are the accounts the
  trail records, and the backend 403s /api/activity/ for them entirely — this
  component is never rendered for them, but a 403 still degrades to a message
  rather than an empty box, because a silent blank would read as "nothing
  happened".

  Props:
    targetKind (String, required) — 'finding' | 'receipt'
    targetId   (String|Number, required)
-->
<template>
  <div class="oa">
    <p v-if="loading" class="oa__muted">Loading activity…</p>
    <p v-else-if="error" class="oa__muted" role="alert" data-test="object-activity-error">
      {{ error }}
    </p>
    <p v-else-if="!events.length" class="oa__muted" data-test="object-activity-empty">
      No recorded activity for this item yet.
    </p>
    <ul v-else class="oa__list" data-test="object-activity">
      <li v-for="event in events" :key="event.id" class="oa__item" data-test="object-activity-row">
        <div class="oa__meta">
          <span class="oa__actor">{{ event.actor || 'system' }}</span>
          <span class="oa__action">{{ event.action }}</span>
          <time class="oa__time" :datetime="event.occurred_at || undefined">
            {{ formatDateTime(event.occurred_at) }}
          </time>
        </div>
        <ActivityChanges :changes="event.changes" />
      </li>
    </ul>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import ActivityChanges from './ActivityChanges.vue';
import { listObjectActivity } from '../../api/activity';
import { formatDateTime } from '../../utils/receipts';

const props = defineProps({
  targetKind: { type: String, required: true },
  targetId: { type: [String, Number], required: true },
  pageSize: { type: Number, default: 50 },
});

const events = ref([]);
const loading = ref(false);
const error = ref('');

async function load() {
  if (props.targetId === null || props.targetId === undefined || props.targetId === '') return;
  loading.value = true;
  error.value = '';
  try {
    const data = await listObjectActivity(props.targetKind, props.targetId, {
      page_size: props.pageSize,
    });
    events.value = Array.isArray(data?.results) ? data.results : [];
  } catch (err) {
    // A blank panel would read as "nothing happened", which is the one thing an
    // audit trail must never say by accident.
    error.value = err?.response?.status === 403
      ? 'You do not have access to the activity trail.'
      : 'Could not load the activity for this item.';
    events.value = [];
  } finally {
    loading.value = false;
  }
}

watch(() => [props.targetKind, props.targetId], load, { immediate: true });

defineExpose({ reload: load });
</script>

<style scoped>
.oa {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.oa__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 320px;
  overflow-y: auto;
}

.oa__item {
  padding: 6px 8px;
  border: 1px solid var(--kdl-border-subtle, var(--kdl-border));
  border-radius: 6px;
  background: var(--kdl-hover-bg);
}

.oa__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  font-size: 11px;
  color: var(--kdl-text-muted);
}

.oa__actor {
  font-weight: 600;
  color: var(--kdl-text-secondary);
  overflow-wrap: anywhere;
}

.oa__action {
  font-family: var(--kdl-font-mono, ui-monospace, monospace);
  color: var(--kdl-text-primary);
}

.oa__time {
  margin-left: auto;
  white-space: nowrap;
}

.oa__muted {
  margin: 0;
  font-size: 12px;
  color: var(--kdl-text-muted);
}
</style>
