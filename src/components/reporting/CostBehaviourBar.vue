<!--
  CostBehaviourBar — headline cost-behaviour split (the CFO's operating-leverage
  insight). A horizontal stacked bar of fixed | variable | semi_variable |
  non_controllable as proportions of total recurring cost, with a legend giving
  each behaviour's ZAR + %, plus the fixed:variable ratio and % addressable.

  Segment widths are data-driven runtime values → the computed
  `:style="{ width }"` per segment is the documented runtime-value exception
  (same as the existing % bar in CostCutRow). All other styling is token-based.

  Categorical colours come from --cc-beh-* (src/css/cost-behaviour.css). The
  legend swatches reuse BehaviourTag so the hues live in exactly one place.
-->
<template>
  <section class="beh-split" aria-label="Cost-behaviour split">
    <div class="beh-split__head">
      <span class="beh-split__title">Cost behaviour</span>
      <div class="beh-split__reads">
        <span class="beh-split__read beh-split__read--num">
          Fixed : Variable = {{ ratioLabel }}
        </span>
        <span class="beh-split__read beh-split__read--num">
          {{ addressablePctLabel }} addressable
        </span>
      </div>
    </div>

    <!-- Stacked proportional bar -->
    <div
      class="beh-split__bar"
      role="img"
      :aria-label="barAriaLabel"
    >
      <span
        v-for="seg in segments"
        :key="seg.key"
        class="beh-split__seg"
        :class="`beh-split__seg--${seg.key}`"
        :style="{ width: seg.width }"
      />
    </div>

    <!-- Legend: swatch + ZAR + % per behaviour -->
    <ul class="beh-split__legend">
      <li v-for="seg in segments" :key="seg.key" class="beh-split__legend-item">
        <BehaviourTag :behaviour="seg.key" short />
        <span class="beh-split__legend-amount beh-split__read--num">
          {{ formatCurrency(seg.value) }}
        </span>
        <span class="beh-split__legend-pct beh-split__read--num">{{ seg.pctLabel }}</span>
      </li>
    </ul>

    <p class="beh-split__caption">
      High fixed share = high operating leverage: earnings swing harder than
      revenue. Variable cost is reducible now; fixed needs renegotiation.
    </p>
  </section>
</template>

<script setup>
import { computed } from 'vue';
import BehaviourTag from './BehaviourTag.vue';
import { BEHAVIOUR_ORDER, behaviourLabel } from '../../utils/costBehaviour';

const props = defineProps({
  // { fixed, variable, semi_variable, non_controllable, unclassified } — ZAR sums
  behaviourTotals: {
    type: Object,
    default: () => ({}),
  },
  // fixed + variable + semi (ZAR)
  addressableBase: {
    type: Number,
    default: 0,
  },
  // fixed ÷ variable, or null
  fixedVariableRatio: {
    type: Number,
    default: null,
  },
  // Total recurring cost — the denominator for the bar/legend percentages.
  total: {
    type: Number,
    default: 0,
  },
  formatCurrency: {
    type: Function,
    required: true,
  },
});

// CONTRACT: a bucket can be net-negative (Klikk runs a recovery-credit
// account). We clamp each bucket to max(0, total) for percentage purposes —
// applied consistently to the denominator fallback, the segment width and the %
// labels — so the bar never overflows and no negative % is ever printed. The
// raw ZAR amount is still shown in the legend (the credit stays visible).

// Denominator: prefer the explicit total; fall back to the sum of ALL behaviour
// totals (including unclassified, each clamped to ≥0) so the bar still fills
// sensibly if total is ever 0/missing AND every read shares one base.
const denominator = computed(() => {
  const t = Number(props.total) || 0;
  if (t > 0) return t;
  return Object.keys(props.behaviourTotals || {}).reduce(
    (sum, key) => sum + Math.max(0, Number(props.behaviourTotals?.[key]) || 0),
    0,
  );
});

const segments = computed(() => {
  const denom = denominator.value;
  return BEHAVIOUR_ORDER.map((key) => {
    // Raw value drives the legend ZAR amount; clamped value drives % so a
    // negative bucket reads 0% (and never overflows the bar) per the contract.
    const value = Number(props.behaviourTotals?.[key]) || 0;
    const pctValue = Math.max(0, value);
    const pct = denom > 0 ? (pctValue / denom) * 100 : 0;
    return {
      key,
      value,
      pct,
      width: `${Math.max(0, Math.min(100, pct))}%`,
      pctLabel: denom > 0 ? `${pct.toFixed(1)}%` : 'n/a',
    };
  });
});

const ratioLabel = computed(() => {
  const r = props.fixedVariableRatio;
  if (r == null || !Number.isFinite(Number(r))) return 'n/a';
  return `${Number(r).toFixed(2)} : 1`;
});

const addressablePctLabel = computed(() => {
  const denom = denominator.value;
  if (denom <= 0) return 'n/a';
  // Clamp to [0, 100]: addressable_base is a server-supplied subset of total,
  // but rounding / a net-negative bucket elsewhere must never read > 100%.
  const raw = (Number(props.addressableBase) || 0) / denom * 100;
  const pct = Math.max(0, Math.min(100, raw));
  return `${pct.toFixed(0)}%`;
});

const barAriaLabel = computed(() =>
  segments.value
    .map((s) => `${behaviourLabel(s.key)} ${s.pctLabel}`)
    .join(', '),
);
</script>

<style scoped>
.beh-split {
  display: grid;
  gap: 10px;
  grid-column: 1 / -1;
  padding: 14px 16px;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 8px;
  background: var(--kdl-card-bg);
}

.beh-split__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.beh-split__title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--kdl-text-hint);
}

.beh-split__reads {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.beh-split__read {
  font-size: 12px;
  font-weight: 600;
  color: var(--kdl-text-secondary);
}

.beh-split__read--num {
  font-variant-numeric: tabular-nums;
}

/* ── Stacked bar ─────────────────────────────────────────────────────────── */
.beh-split__bar {
  display: flex;
  width: 100%;
  height: 14px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--kdl-border-subtle);
}

.beh-split__seg {
  display: block;
  height: 100%;
  min-width: 0;
  transition: width var(--duration-medium, 200ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1));
}

@media (prefers-reduced-motion: reduce) {
  .beh-split__seg {
    transition: none;
  }
}

.beh-split__seg--fixed {
  background: var(--cc-beh-fixed);
}

.beh-split__seg--variable {
  background: var(--cc-beh-variable);
}

.beh-split__seg--semi_variable {
  background: var(--cc-beh-semi);
}

.beh-split__seg--non_controllable {
  background: var(--cc-beh-nonctrl);
}

/* ── Legend ──────────────────────────────────────────────────────────────── */
.beh-split__legend {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 6px 16px;
}

.beh-split__legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.beh-split__legend-amount {
  font-size: 12px;
  font-weight: 600;
  color: var(--kdl-text-primary);
  margin-left: auto;
}

.beh-split__legend-pct {
  font-size: 11px;
  font-weight: 500;
  color: var(--kdl-text-muted);
  min-width: 44px;
  text-align: right;
}

.beh-split__caption {
  margin: 0;
  font-size: 11px;
  line-height: 1.45;
  color: var(--kdl-text-muted);
}
</style>
