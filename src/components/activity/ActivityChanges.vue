<!--
  ActivityChanges — the `changes` JSON of one activity event, rendered compactly.

  Three shapes come out of the backend and each reads differently:

    {field: {from, to}}                → "status: OPEN → RESOLVED"
    {count, ids, ...applied}           → "12 findings · status: RESOLVED"  (bulk)
    anything else (flat facts)         → "kind: finding · is_reply: true"

  The from → to form is the whole point of the trail — someone scanning it is
  looking for what changed, not for a JSON blob they have to parse in their head.
  An empty value renders as "—" rather than as nothing, so "owner: MC → —"
  reads as a clearing rather than a truncated line.
-->
<template>
  <span v-if="!parts.length" class="ac__empty">—</span>
  <span v-else class="ac">
    <span v-for="(part, i) in parts" :key="i" class="ac__part">
      <span class="ac__label">{{ part.label }}</span>
      <template v-if="part.from !== undefined">
        <span class="ac__from">{{ part.from }}</span>
        <span class="ac__arrow" aria-label="changed to">→</span>
      </template>
      <span class="ac__to">{{ part.to }}</span>
    </span>
  </span>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  changes: { type: [Object, Array, String, Number, Boolean], default: null },
});

const EMPTY = '—';

function show(value) {
  if (value === null || value === undefined || value === '') return EMPTY;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function isDelta(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && ('from' in value || 'to' in value);
}

const parts = computed(() => {
  const changes = props.changes;
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return [];

  const out = [];
  // Bulk events lead with the count; the raw id list is in the row's detail,
  // not in a table cell that has to stay one line.
  if (typeof changes.count === 'number') {
    out.push({ label: '', to: `${changes.count} item${changes.count === 1 ? '' : 's'}` });
  }
  for (const [key, value] of Object.entries(changes)) {
    if (key === 'count' || key === 'ids' || key === 'ids_truncated') continue;
    if (isDelta(value)) {
      out.push({ label: `${key}:`, from: show(value.from), to: show(value.to) });
    } else {
      out.push({ label: `${key}:`, to: show(value) });
    }
  }
  return out;
});
</script>

<style scoped>
.ac {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  font-size: 12px;
  line-height: 1.45;
}

.ac__part {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  overflow-wrap: anywhere;
}

.ac__label {
  color: var(--kdl-text-muted);
}

.ac__from {
  color: var(--kdl-text-muted);
  text-decoration: line-through;
}

.ac__arrow {
  color: var(--kdl-text-muted);
}

.ac__to {
  color: var(--kdl-text-primary);
  font-weight: 500;
}

.ac__empty {
  color: var(--kdl-text-muted);
}
</style>
