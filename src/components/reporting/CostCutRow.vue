<template>
  <tr>
    <!-- Account name + group tag -->
    <td>
      <strong class="cost-cut-row__name">{{ row.name }}</strong>
      <small class="cost-cut-row__group">{{ groupLabel }}</small>
    </td>

    <!-- Behaviour: categorical chip + inline re-tag select + driver subtext -->
    <td>
      <div class="cost-cut-row__behaviour">
        <div class="cost-cut-row__behaviour-top">
          <BehaviourTag :behaviour="row.behaviour" :driver="row.driver" short />
          <KSelect
            class="cost-cut-row__behaviour-select"
            :model-value="normalisedBehaviour"
            :options="behaviourOptions"
            :aria-label="`Cost behaviour for ${row.name}`"
            @update:model-value="onRetag"
          />
          <KSpinner
            v-if="savingBehaviour"
            size="xs"
            tone="muted"
            label="Saving behaviour"
          />
        </div>
        <small v-if="row.driver" class="cost-cut-row__driver">{{ row.driver }}</small>
      </div>
    </td>

    <!-- Recurring cost -->
    <td class="text-right cost-cut-row__num">
      {{ formatCurrency(row.recurring_actual) }}
    </td>

    <!-- % of cost with thin bar -->
    <td class="text-right">
      <div class="cost-cut-row__pct">
        <span class="cost-cut-row__num">{{ pctOfCostLabel }}</span>
        <span class="cost-cut-row__bar" aria-hidden="true">
          <span class="cost-cut-row__bar-fill" :style="{ width: pctBarWidth }" />
        </span>
      </div>
    </td>

    <!-- YoY: cost up = red, down = green -->
    <td class="text-right cost-cut-row__num" :class="yoyClass">
      {{ yoyLabel }}
    </td>

    <!-- Editable target -->
    <td class="text-right">
      <div class="cost-cut-row__target">
        <KInput
          v-model="draft"
          type="number"
          prefix="R"
          placeholder="Set"
          :aria-label="`Target for ${row.name}`"
          @focus="isFocused = true"
          @blur="onBlur"
          @keyup="onKeyup"
        />
        <KSpinner
          v-if="saving"
          size="xs"
          tone="muted"
          label="Saving target"
        />
      </div>
    </td>

    <!-- RAG -->
    <td>
      <StatusPill
        :tone="ragTone"
        :label="ragLabel"
        size="sm"
        :icon="row.rag !== 'none'"
      />
    </td>
  </tr>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import KInput from '../klikk/KInput.vue';
import KSelect from '../klikk/KSelect.vue';
import KSpinner from '../klikk/KSpinner.vue';
import StatusPill from '../klikk/StatusPill.vue';
import BehaviourTag from './BehaviourTag.vue';
import {
  BEHAVIOUR_SELECT_OPTIONS,
  normaliseBehaviour,
  behaviourLabel,
} from '../../utils/costBehaviour';

const props = defineProps({
  row: {
    type: Object,
    required: true,
  },
  saving: {
    type: Boolean,
    default: false,
  },
  // Separate flag from `saving` (target) so the two inline edits on one row can
  // show independent spinners without clobbering each other.
  savingBehaviour: {
    type: Boolean,
    default: false,
  },
  emphasiseYoy: {
    type: Boolean,
    default: false,
  },
  formatCurrency: {
    type: Function,
    required: true,
  },
});

const emit = defineEmits(['commit', 'retag']);

// The row's behaviour normalised to a known key ('unclassified' for any
// missing/unknown value). Bound as the select's model-value so the TRIGGER
// agrees with the BehaviourTag chip (both read off the same normalised key)
// instead of showing the bare placeholder on unclassified/missing rows.
const normalisedBehaviour = computed(() => normaliseBehaviour(props.row.behaviour));

// Re-tag options: the four classified behaviours you can tag INTO. When the row
// is currently unclassified we append a DISABLED 'Unclassified' entry purely so
// the trigger can display "Unclassified" (matching the chip) — it can't be
// re-selected (disabled + the onRetag no-op guard below), preserving the
// contract that there's no "unclassified" behaviour to re-tag into.
const behaviourOptions = computed(() => {
  if (normalisedBehaviour.value === 'unclassified') {
    return [
      ...BEHAVIOUR_SELECT_OPTIONS,
      { value: 'unclassified', label: behaviourLabel('unclassified'), disabled: true },
    ];
  }
  return BEHAVIOUR_SELECT_OPTIONS;
});

// Re-tag this account's behaviour. No-op if the chosen value matches what the
// row already shows (KSelect can re-emit the current value), or if it's the
// non-selectable 'unclassified' sentinel. The parent owns the POST +
// concurrency-safe re-fetch.
function onRetag(value) {
  if (!value || value === 'unclassified' || value === normalisedBehaviour.value) return;
  emit('retag', {
    accountKey: props.row.account_key,
    accountId: props.row.account_id,
    behaviour: value,
    label: props.row.name,
  });
}

const draft = ref(props.row.target != null ? String(props.row.target) : '');
const isFocused = ref(false);

// Re-sync the draft when the underlying row target changes (e.g. after a
// post-save re-fetch). Skip while the input is focused so we never clobber a
// user's in-progress typing mid-edit.
watch(
  () => props.row.target,
  (val) => {
    if (isFocused.value) return;
    draft.value = val != null ? String(val) : '';
  },
);

const GROUP_LABELS = {
  OVERHEADS: 'Overheads',
  DIRECTCOSTS: 'Direct costs',
  EXPENSE: 'Expense',
};

const groupLabel = computed(() => GROUP_LABELS[props.row.group] || props.row.group || '—');

const pctOfCostLabel = computed(() => {
  const pct = Number(props.row.pct_of_cost);
  if (!Number.isFinite(pct)) return 'n/a';
  return `${pct.toFixed(1)}%`;
});

const pctBarWidth = computed(() => {
  const pct = Number(props.row.pct_of_cost);
  if (!Number.isFinite(pct)) return '0%';
  return `${Math.max(0, Math.min(100, pct))}%`;
});

const yoyLabel = computed(() => {
  const pct = props.row.yoy_pct;
  if (pct == null || !Number.isFinite(Number(pct))) return 'n/a';
  const value = Number(pct);
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
});

// Cost up = red (worse), cost down = green (better).
const yoyClass = computed(() => {
  const pct = props.row.yoy_pct;
  if (pct == null || !Number.isFinite(Number(pct))) return '';
  const value = Number(pct);
  if (value > 0) return 'cost-cut-row__yoy--bad';
  if (value < 0) return 'cost-cut-row__yoy--good';
  return '';
});

const ragTone = computed(() => {
  switch (props.row.rag) {
    case 'green': return 'success';
    case 'amber': return 'warning';
    case 'red': return 'error';
    default: return 'neutral';
  }
});

const ragLabel = computed(() => {
  switch (props.row.rag) {
    case 'green': return 'On target';
    case 'amber': return 'Watch';
    case 'red': return 'Over';
    default: return 'No target';
  }
});

function commit() {
  const currentValue = props.row.target ?? null;
  emit('commit', {
    accountId: props.row.account_id,
    value: draft.value,
    currentValue,
    label: props.row.name,
  });
}

function onBlur() {
  // Clear focus first so the props-target watch is allowed to re-sync the
  // draft once the post-save re-fetch lands. The user's typed value stays in
  // `draft` until then (no flicker back to the stale server value).
  isFocused.value = false;
  commit();
}

function onKeyup(event) {
  if (event.key === 'Enter') {
    event.target.blur();
  }
}
</script>

<style scoped>
.cost-cut-row__name {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--kdl-text-primary);
}

.cost-cut-row__group {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: var(--kdl-text-muted);
}

.cost-cut-row__num {
  font-variant-numeric: tabular-nums;
  font-size: 13px;
  color: var(--kdl-text-primary);
}

/* ── Behaviour cell ──────────────────────────────────────────────────────── */
.cost-cut-row__behaviour {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 150px;
}

.cost-cut-row__behaviour-top {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* Compact the re-tag select to keep the dense table tidy; the chip carries the
   colour, the select is the affordance to change it. */
.cost-cut-row__behaviour-select {
  flex: 0 0 auto;
  width: 132px;
}

.cost-cut-row__behaviour-select :deep(.kselect-trigger) {
  height: 30px;
}

.cost-cut-row__driver {
  font-size: 11px;
  color: var(--kdl-text-muted);
  line-height: 1.3;
}

.cost-cut-row__pct {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  min-width: 64px;
}

.cost-cut-row__bar {
  display: block;
  width: 100%;
  height: 4px;
  border-radius: 999px;
  background: var(--kdl-border-subtle);
  overflow: hidden;
}

.cost-cut-row__bar-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--kdl-accent);
}

/*
  Cost-direction YoY colours: a rise in cost is bad (red), a fall is good
  (green). GAP: KDL exposes no semantic --kdl-danger / --kdl-success CSS
  variables (only Tailwind danger/success scales in tailwind.config.js). These
  hex values mirror MetricTile and CostCutReport's total delta; swap all three
  once KDL ships semantic tokens.
*/
.cost-cut-row__yoy--bad {
  color: #dc2626;
}

.cost-cut-row__yoy--good {
  color: #0d9488;
}

:root[data-theme="dark"] .cost-cut-row__yoy--bad {
  color: #f87171;
}

:root[data-theme="dark"] .cost-cut-row__yoy--good {
  color: #2dd4bf;
}

.cost-cut-row__target {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 140px;
}

.cost-cut-row__target > :deep(.kinput-root) {
  flex: 1 1 0;
  min-width: 0;
}

.text-right {
  text-align: right;
}
</style>
