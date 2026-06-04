<!--
  CostCutGroupTable — the grouped, collapsible cost-cut table (change #3).

  Replaces the flat row list. Rows are bucketed by the active `groupBy` axis
  (tier | behaviour | group), each bucket rendered as:
    - a group HEADER row: collapse toggle (aria-expanded), label + "what to do"
      hint, row count, subtotal ZAR, and % of addressable.
    - the leaf CostCutRow rows beneath, hidden when the group is collapsed.

  Subtotals reconcile to addressable_operating_cost: every leaf here is an
  addressable account (below-the-line rows are rendered in a separate section),
  and the denominator passed in is addressable_operating_cost, so the group
  subtotal %s sum to ~100%.

  Accessibility: group header is a real <tr> with role-appropriate cells; the
  collapse control is a <button aria-expanded> that controls the group's body
  via aria-controls. Leaf rows live in their own <tbody> per group so the
  header/body relationship is structural, not just visual.

  The subtotal proportion bar width is a data-driven runtime value → the
  computed :style="{ width }" is the documented runtime-value exception (same as
  CostBehaviourBar / CostCutRow's % bars). All other styling is token-based.
-->
<template>
  <div class="cc-group-table-wrap">
    <table class="cc-group-table">
      <thead>
        <tr>
          <th scope="col" class="cc-group-table__manage-col">
            <span class="cc-group-table__manage-head" title="Manageable — your top cut-opportunity shortlist">Manage</span>
          </th>
          <th scope="col">Account</th>
          <th scope="col">Tier</th>
          <th scope="col">Behaviour</th>
          <th scope="col" class="text-right">Recurring cost</th>
          <th scope="col" class="text-right" title="Share of addressable operating cost">% of addr.</th>
          <th scope="col" class="text-right">YoY</th>
          <th scope="col" class="text-right">Target</th>
          <th scope="col">RAG</th>
        </tr>
      </thead>

      <tbody
        v-for="group in groups"
        :id="bodyId(group.key)"
        :key="group.key"
        class="cc-group"
      >
        <!-- Group header row -->
        <tr class="cc-group__header">
          <th scope="colgroup" colspan="4" class="cc-group__header-main">
            <button
              type="button"
              class="cc-group__toggle"
              :aria-expanded="!isCollapsed(group.key)"
              :aria-controls="bodyId(group.key)"
              @click="toggle(group.key)"
            >
              <svg
                class="cc-group__chevron"
                :class="{ 'cc-group__chevron--open': !isCollapsed(group.key) }"
                xmlns="http://www.w3.org/2000/svg"
                width="14" height="14" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
              <span class="cc-group__label">{{ group.label }}</span>
              <span v-if="group.hint" class="cc-group__hint">{{ group.hint }}</span>
              <span class="cc-group__count">{{ group.rows.length }} {{ group.rows.length === 1 ? 'account' : 'accounts' }}</span>
            </button>
          </th>
          <td class="text-right cc-group__subtotal">
            {{ formatCurrency(group.subtotal) }}
          </td>
          <td class="text-right cc-group__pct" colspan="4">
            <div class="cc-group__pct-inner">
              <span class="cc-group__pct-num">{{ group.pctLabel }} of addressable</span>
              <span class="cc-group__pct-bar" aria-hidden="true">
                <span class="cc-group__pct-fill" :style="{ width: group.barWidth }" />
              </span>
            </div>
          </td>
        </tr>

        <!-- Leaf rows — collapse with the group (each <tr> hidden via v-show). -->
        <CostCutRow
          v-for="row in group.rows"
          v-show="!isCollapsed(group.key)"
          :key="row.account_id"
          :row="row"
          :emphasise-yoy="emphasiseYoy"
          :saving="isSaving(accountMetricKey(row.account_id))"
          :saving-behaviour="isSaving(behaviourKey(row.account_id))"
          :saving-tier="isSaving(tierKey(row.account_id))"
          :saving-manageable="isSaving(manageableSaveKey(row.account_id))"
          :format-currency="formatCurrency"
          @commit="$emit('commit', $event)"
          @retag="$emit('retag', $event)"
          @retag-tier="$emit('retag-tier', $event)"
          @toggle-manageable="$emit('toggle-manageable', $event)"
        />
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import CostCutRow from './CostCutRow.vue';
import {
  TIER_ORDER,
  BEHAVIOUR_ORDER,
  GROUP_LABELS,
  MANAGEABLE_KEYS,
  normaliseTier,
  normaliseBehaviour,
  tierLabel,
  tierHint,
  behaviourLabel,
  groupLabel,
  manageableKey,
  manageableLabel,
} from '../../utils/costBehaviour';

const props = defineProps({
  // Addressable leaf rows to group + render.
  rows: {
    type: Array,
    default: () => [],
  },
  // 'tier' | 'behaviour' | 'group' | 'manageable'
  groupBy: {
    type: String,
    default: 'tier',
  },
  // Denominator for the "% of addressable" subtotal read — pass
  // addressable_operating_cost so group %s reconcile to ~100%.
  addressable: {
    type: Number,
    default: 0,
  },
  emphasiseYoy: {
    type: Boolean,
    default: false,
  },
  // Set of in-flight save keys (shared with the parent so spinners show on the
  // right leaf). The metric-key helpers below MUST match the parent's.
  savingKeys: {
    type: Object, // Set
    default: () => new Set(),
  },
  formatCurrency: {
    type: Function,
    required: true,
  },
});

defineEmits(['commit', 'retag', 'retag-tier', 'toggle-manageable']);

// ── Metric-key helpers — MUST mirror CostCutReport's so the shared savingKeys
//    Set lights the correct row spinner. ───────────────────────────────────
function accountMetricKey(accountId) {
  return `cost_cut.account.${accountId}`;
}
function behaviourKey(accountId) {
  return `cost_cut.behaviour.${accountId}`;
}
function tierKey(accountId) {
  return `cost_cut.tier.${accountId}`;
}
function manageableSaveKey(accountId) {
  return `cost_cut.manageable.${accountId}`;
}
function isSaving(key) {
  return props.savingKeys.has(key);
}

// ── Collapse state — per group key. Default expanded; a user can collapse any
//    group. Reset is NOT needed across groupBy changes because the keyspace is
//    distinct per axis and stale keys are simply ignored. ───────────────────
const collapsed = ref(new Set());
function isCollapsed(key) {
  return collapsed.value.has(key);
}
function toggle(key) {
  const next = new Set(collapsed.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  collapsed.value = next;
}
function bodyId(key) {
  // Stable, DOM-safe id for aria-controls.
  return `cc-group-body-${String(key).replace(/[^a-z0-9]/gi, '-')}`;
}

// ── Grouping engine ─────────────────────────────────────────────────────────
// For the active axis, derive: the bucket key per row, the ordered list of
// bucket keys, and the human label + hint per bucket. Then bucket the rows,
// sum subtotals, and compute the % of addressable.

// Returns { keyOf(row), order:[keys], labelOf(key), hintOf(key) } for the axis.
const axis = computed(() => {
  if (props.groupBy === 'behaviour') {
    return {
      keyOf: (row) => normaliseBehaviour(row.behaviour),
      // BEHAVIOUR_ORDER excludes 'unclassified'; append it last so a stray
      // unclassified addressable row still gets a bucket rather than vanishing.
      order: [...BEHAVIOUR_ORDER, 'unclassified'],
      labelOf: (key) => behaviourLabel(key),
      hintOf: () => '',
    };
  }
  if (props.groupBy === 'group') {
    return {
      keyOf: (row) => row.group || 'UNGROUPED',
      order: [...Object.keys(GROUP_LABELS), 'UNGROUPED'],
      labelOf: (key) => groupLabel(key === 'UNGROUPED' ? null : key),
      hintOf: () => '',
    };
  }
  if (props.groupBy === 'manageable') {
    // The user's hit-list axis — 'yes' (top opportunities) first, then 'no'.
    return {
      keyOf: (row) => manageableKey(row.is_manageable),
      order: MANAGEABLE_KEYS, // ['yes', 'no']
      labelOf: (key) => manageableLabel(key),
      hintOf: (key) => (key === 'yes' ? 'Your shortlist to act on' : ''),
    };
  }
  // Default: cuttability tier — act-first order T1 → T5.
  return {
    keyOf: (row) => normaliseTier(row.cuttability),
    order: TIER_ORDER, // T1..T5 (T0 below-the-line never appears among addressable rows)
    labelOf: (key) => tierLabel(key),
    hintOf: (key) => tierHint(key),
  };
});

const groups = computed(() => {
  const a = axis.value;
  const denom = Number(props.addressable) || 0;

  // Bucket rows by key.
  const buckets = new Map();
  for (const row of props.rows) {
    const key = a.keyOf(row);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  }

  // Emit groups in the axis's defined order, then any unexpected keys (sorted)
  // so nothing is silently dropped if the backend introduces a new value.
  const orderedKeys = [
    ...a.order.filter((k) => buckets.has(k)),
    ...[...buckets.keys()].filter((k) => !a.order.includes(k)).sort(),
  ];

  return orderedKeys.map((key) => {
    const rows = buckets.get(key);
    const subtotal = rows.reduce((s, r) => s + (Number(r.recurring_actual) || 0), 0);
    const pct = denom > 0 ? (subtotal / denom) * 100 : 0;
    return {
      key,
      label: a.labelOf(key),
      hint: a.hintOf(key),
      rows,
      subtotal,
      pctLabel: denom > 0 ? `${pct.toFixed(1)}%` : 'n/a',
      barWidth: `${Math.max(0, Math.min(100, pct))}%`,
    };
  });
});
</script>

<style scoped>
.cc-group-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 8px;
}

.cc-group-table {
  width: 100%;
  /* 9 columns now (a leading Manage star column ahead of Account). */
  min-width: 1100px;
  border-collapse: collapse;
}

/* Leading "Manage" (manageable star) column — narrow, centred. */
.cc-group-table__manage-col {
  width: 64px;
}

.cc-group-table__manage-head {
  /* The header cell stays uppercase via the thead rule; this just lets the
     title tooltip hang off a span without changing layout. */
  white-space: nowrap;
}

.cc-group-table th,
.cc-group-table :deep(td) {
  padding: 10px 12px;
  border-bottom: 1px solid var(--kdl-border-subtle);
  text-align: left;
  vertical-align: middle;
}

.cc-group-table > thead th {
  background: var(--kdl-page-bg);
  color: var(--kdl-text-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

/* ── Group header row ────────────────────────────────────────────────────── */
.cc-group__header > th,
.cc-group__header > td {
  background: var(--kdl-hover-bg);
  border-bottom: 1px solid var(--kdl-border-subtle);
  border-top: 1px solid var(--kdl-border-subtle);
}

.cc-group__header-main {
  font-weight: 600;
}

.cc-group__toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  appearance: none;
  border: none;
  background: transparent;
  padding: 2px 4px;
  margin: -2px -4px;
  border-radius: 6px;
  cursor: pointer;
  color: var(--kdl-text-primary);
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  text-align: left;
}

.cc-group__toggle:hover {
  background: var(--kdl-card-bg);
}

.cc-group__toggle:focus-visible {
  outline: 2px solid var(--kdl-accent);
  outline-offset: 1px;
}

.cc-group__chevron {
  flex: 0 0 auto;
  color: var(--kdl-text-muted);
  transition: transform var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1));
}

.cc-group__chevron--open {
  transform: rotate(90deg);
}

@media (prefers-reduced-motion: reduce) {
  .cc-group__chevron {
    transition: none;
  }
}

.cc-group__label {
  color: var(--kdl-text-primary);
}

.cc-group__hint {
  font-size: 11px;
  font-weight: 500;
  color: var(--kdl-text-muted);
}

.cc-group__count {
  font-size: 11px;
  font-weight: 500;
  color: var(--kdl-text-hint);
  font-variant-numeric: tabular-nums;
}

.cc-group__subtotal {
  font-variant-numeric: tabular-nums;
  font-size: 13px;
  font-weight: 700;
  color: var(--kdl-text-primary);
}

.cc-group__pct-inner {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  min-width: 120px;
}

.cc-group__pct-num {
  font-size: 11px;
  font-weight: 600;
  color: var(--kdl-text-muted);
  font-variant-numeric: tabular-nums;
}

.cc-group__pct-bar {
  display: block;
  width: 100%;
  max-width: 160px;
  height: 4px;
  border-radius: 999px;
  background: var(--kdl-border-subtle);
  overflow: hidden;
}

.cc-group__pct-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  /* Neutral brand navy — a SUBTOTAL proportion read, not a categorical or RAG
     signal, so it must not collide with the behaviour/tier/RAG hues. */
  background: var(--kdl-brand-navy);
}

.text-right {
  text-align: right;
}
</style>
