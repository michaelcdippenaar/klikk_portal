<template>
  <div
    v-if="hasCoverage"
    class="month-coverage-strip"
    :class="{ 'month-coverage-strip--warning': missingCount > 0 }"
    :aria-label="`${label} data coverage`"
  >
    <div class="month-coverage-strip__main">
      <span class="month-coverage-strip__eyebrow">{{ label }}</span>
      <strong>{{ rangeText }}</strong>
      <small>{{ presentText }}</small>
    </div>

    <div class="month-coverage-strip__status">
      {{ statusText }}
    </div>

    <div v-if="missingPreview.length" class="month-coverage-strip__missing">
      <span class="month-coverage-strip__missing-label">Missing</span>
      <span
        v-for="month in missingPreview"
        :key="month.month"
        class="month-coverage-strip__chip"
      >
        {{ month.label || month.month }}
      </span>
      <span v-if="hiddenMissingCount > 0" class="month-coverage-strip__chip">
        +{{ hiddenMissingCount }} more
      </span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  coverage: { type: Object, default: null },
  label: { type: String, default: 'Month coverage' },
  maxMonths: { type: Number, default: 12 },
});

const hasCoverage = computed(() => (props.coverage?.present_month_count || 0) > 0);
const missingMonths = computed(() => (
  Array.isArray(props.coverage?.missing_months) ? props.coverage.missing_months : []
));
const missingCount = computed(() => props.coverage?.missing_month_count || 0);
const missingPreview = computed(() => missingMonths.value.slice(0, props.maxMonths));
const hiddenMissingCount = computed(() => Math.max(0, missingMonths.value.length - missingPreview.value.length));

const rangeText = computed(() => {
  const first = props.coverage?.first_month_label || props.coverage?.first_month;
  const last = props.coverage?.last_month_label || props.coverage?.last_month;
  return first && last ? `${first} to ${last}` : 'No imported months yet';
});

function monthWord(count) {
  return count === 1 ? 'month' : 'months';
}

const presentText = computed(() => {
  const present = props.coverage?.present_month_count || 0;
  const expected = props.coverage?.expected_month_count || 0;
  return `${present} of ${expected} ${monthWord(expected)} imported`;
});

const statusText = computed(() => {
  const count = missingCount.value;
  return count > 0 ? `${count} ${monthWord(count)} missing` : 'No missing months';
});
</script>

<style scoped>
.month-coverage-strip {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) auto;
  gap: 10px 14px;
  align-items: center;
  padding: 10px 12px;
  margin-bottom: 14px;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 6px;
  background: color-mix(in srgb, var(--kdl-card-bg) 88%, var(--kdl-hover-bg));
}

.month-coverage-strip--warning {
  border-color: color-mix(in srgb, var(--kdl-status-warning) 42%, var(--kdl-border-subtle));
  background: color-mix(in srgb, var(--kdl-status-warning) 8%, var(--kdl-card-bg));
}

.month-coverage-strip__main {
  min-width: 0;
}

.month-coverage-strip__eyebrow,
.month-coverage-strip__main small,
.month-coverage-strip__missing-label {
  display: block;
  color: var(--kdl-text-muted);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.35;
}

.month-coverage-strip__main strong {
  display: block;
  margin: 2px 0;
  color: var(--kdl-text-primary);
  font-size: 14px;
  font-weight: 700;
  line-height: 1.25;
}

.month-coverage-strip__status {
  justify-self: end;
  padding: 5px 9px;
  border-radius: 999px;
  color: var(--kdl-status-success);
  font-size: 12px;
  font-weight: 700;
  background: color-mix(in srgb, var(--kdl-status-success) 10%, transparent);
}

.month-coverage-strip--warning .month-coverage-strip__status {
  color: var(--kdl-status-warning);
  background: color-mix(in srgb, var(--kdl-status-warning) 14%, transparent);
}

.month-coverage-strip__missing {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.month-coverage-strip__missing-label {
  display: inline;
  margin-right: 2px;
}

.month-coverage-strip__chip {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 3px 7px;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 999px;
  color: var(--kdl-text-secondary);
  font-size: 12px;
  font-weight: 600;
  background: var(--kdl-card-bg);
}

@media (max-width: 680px) {
  .month-coverage-strip {
    grid-template-columns: 1fr;
  }

  .month-coverage-strip__status {
    justify-self: start;
  }
}
</style>
