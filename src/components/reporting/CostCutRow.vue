<template>
  <tr :class="{ 'cost-cut-row--readonly': readOnly }">
    <!-- Account name + group tag -->
    <td>
      <strong class="cost-cut-row__name">{{ row.name }}</strong>
      <small class="cost-cut-row__group">{{ groupLabelText }}</small>
    </td>

    <!-- Cuttability tier: chip + (when editable) inline re-tag select -->
    <td>
      <div class="cost-cut-row__tier">
        <TierTag :tier="row.cuttability" />
        <template v-if="!readOnly">
          <KSelect
            class="cost-cut-row__tier-select"
            :model-value="normalisedTier"
            :options="tierOptions"
            :aria-label="`Cuttability tier for ${row.name}`"
            @update:model-value="onTierRetag"
          />
          <KSpinner
            v-if="savingTier"
            size="xs"
            tone="muted"
            label="Saving tier"
          />
        </template>
      </div>
    </td>

    <!-- Behaviour: categorical chip + inline re-tag select + driver subtext -->
    <td>
      <div class="cost-cut-row__behaviour">
        <div class="cost-cut-row__behaviour-top">
          <BehaviourTag :behaviour="row.behaviour" :driver="row.driver" short />
          <template v-if="!readOnly">
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
          </template>
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

    <!-- Editable target (read-only rows show an em-dash, no input) -->
    <td class="text-right">
      <span v-if="readOnly" class="cost-cut-row__num cost-cut-row__readonly-cell">—</span>
      <div v-else class="cost-cut-row__target">
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

    <!-- RAG (read-only rows show a muted reason instead of a RAG pill) -->
    <td>
      <span v-if="readOnly" class="cost-cut-row__reason">{{ readOnlyReason }}</span>
      <StatusPill
        v-else
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
import TierTag from './TierTag.vue';
import {
  BEHAVIOUR_SELECT_OPTIONS,
  TIER_SELECT_OPTIONS,
  normaliseBehaviour,
  normaliseTier,
  behaviourLabel,
  groupLabel,
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
  // Tier re-tag spinner — independent of the target / behaviour spinners.
  savingTier: {
    type: Boolean,
    default: false,
  },
  emphasiseYoy: {
    type: Boolean,
    default: false,
  },
  // Below-the-line rows render read-only: no target input, no behaviour/tier
  // re-tag, a muted reason instead of a RAG pill. They are T0 and cannot be
  // re-tagged into a normal tier from here.
  readOnly: {
    type: Boolean,
    default: false,
  },
  formatCurrency: {
    type: Function,
    required: true,
  },
});

const emit = defineEmits(['commit', 'retag', 'retag-tier']);

// The row's behaviour normalised to a known key ('unclassified' for any
// missing/unknown value). Bound as the select's model-value so the TRIGGER
// agrees with the BehaviourTag chip (both read off the same normalised key)
// instead of showing the bare placeholder on unclassified/missing rows.
const normalisedBehaviour = computed(() => normaliseBehaviour(props.row.behaviour));

// Same idea for the tier select trigger.
const normalisedTier = computed(() => normaliseTier(props.row.cuttability));

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

// Tier re-tag options: the five addressable tiers (T1..T5). 'T0' is the
// below-the-line sentinel and is never a destination — read-only rows don't
// render the select at all, so no disabled-sentinel handling is needed here.
const tierOptions = TIER_SELECT_OPTIONS;

// Re-tag this account's behaviour. No-op if the chosen value matches what the
// row already shows (KSelect can re-emit the current value), or if it's the
// non-selectable 'unclassified' sentinel. The parent owns the optimistic
// mutation + POST + background reconcile.
function onRetag(value) {
  if (!value || value === 'unclassified' || value === normalisedBehaviour.value) return;
  emit('retag', {
    accountKey: props.row.account_key,
    accountId: props.row.account_id,
    behaviour: value,
    label: props.row.name,
  });
}

// Re-tag this account's cuttability tier. No-op if unchanged.
function onTierRetag(value) {
  if (!value || value === normalisedTier.value) return;
  emit('retag-tier', {
    accountKey: props.row.account_key,
    accountId: props.row.account_id,
    cuttability: value,
    label: props.row.name,
  });
}

const draft = ref(props.row.target != null ? String(props.row.target) : '');
const isFocused = ref(false);

// Re-sync the draft when the underlying row target changes (e.g. after a
// background reconcile). Skip while the input is focused so we never clobber a
// user's in-progress typing mid-edit.
watch(
  () => props.row.target,
  (val) => {
    if (isFocused.value) return;
    draft.value = val != null ? String(val) : '';
  },
);

const groupLabelText = computed(() => groupLabel(props.row.group));

// Below-the-line reason: the muted "why this isn't a target" string. Built from
// the behaviour label so the row still explains itself (e.g. "Non-controllable").
const readOnlyReason = computed(() => behaviourLabel(props.row.behaviour));

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
    accountKey: props.row.account_key,
    value: draft.value,
    currentValue,
    label: props.row.name,
  });
}

function onBlur() {
  // Clear focus first so the props-target watch is allowed to re-sync the
  // draft once the background reconcile lands. The user's typed value stays in
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

/* ── Tier cell ───────────────────────────────────────────────────────────── */
.cost-cut-row__tier {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 120px;
}

/* Compact the tier re-tag select — the chip carries the label, the select is
   the affordance to change it (mirrors the behaviour select). */
.cost-cut-row__tier-select {
  flex: 0 0 auto;
  width: 132px;
}

.cost-cut-row__tier-select :deep(.kselect-trigger) {
  height: 30px;
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

/* ── Read-only (below-the-line) rows ─────────────────────────────────────── */
.cost-cut-row--readonly {
  background: var(--kdl-page-bg);
}

.cost-cut-row__readonly-cell {
  color: var(--kdl-text-hint);
}

.cost-cut-row__reason {
  font-size: 11px;
  font-weight: 500;
  color: var(--kdl-text-muted);
}

.text-right {
  text-align: right;
}
</style>
