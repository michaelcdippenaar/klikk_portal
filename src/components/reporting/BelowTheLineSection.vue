<!--
  BelowTheLineSection — change #4.

  A collapsed-by-default section listing the `below_the_line` rows: income tax,
  finance costs, statutory payroll derivatives and contra. These are VISIBLE but
  NOT cost-cut targets — they're reduced by changing profit / debt / structure,
  not by cutting spend. Rendered READ-ONLY (the rows carry cuttability 'T0' and
  cannot be re-tagged into a normal tier or given a target from here).

  Accessibility: a real <button aria-expanded> controls the body via
  aria-controls. The header always shows the total even while collapsed so the
  number is visible without expanding.
-->
<template>
  <section class="btl" aria-label="Below the line — not cost-cut targets">
    <button
      type="button"
      class="btl__toggle"
      :aria-expanded="open"
      :aria-controls="bodyId"
      @click="open = !open"
    >
      <svg
        class="btl__chevron"
        :class="{ 'btl__chevron--open': open }"
        xmlns="http://www.w3.org/2000/svg"
        width="14" height="14" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
      <span class="btl__title">
        Below the line — not cost-cut targets
        <span class="btl__total">({{ formatCurrency(total) }})</span>
      </span>
    </button>

    <div v-show="open" :id="bodyId" class="btl__body">
      <p class="btl__caption">
        Tax, finance costs and statutory levies — reduced by changing
        profit/debt/structure, not by cutting spend.
      </p>

      <div class="btl__table-wrap">
        <table class="btl__table">
          <thead>
            <tr>
              <th scope="col">Account</th>
              <th scope="col">Reason</th>
              <th scope="col" class="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.account_id">
              <td>
                <strong class="btl__name">{{ row.name }}</strong>
                <small v-if="row.driver" class="btl__driver">{{ row.driver }}</small>
              </td>
              <td>
                <span class="btl__reason">{{ reasonFor(row) }}</span>
              </td>
              <td class="text-right btl__num">{{ formatCurrency(row.recurring_actual) }}</td>
            </tr>
            <!-- Reconciling total row -->
            <tr class="btl__total-row">
              <th scope="row" colspan="2" class="btl__total-label">
                Total below the line
              </th>
              <td class="text-right btl__num btl__num--total">{{ formatCurrency(total) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref } from 'vue';
import { behaviourLabel } from '../../utils/costBehaviour';

// Module-level monotonic counter → a deterministic, unique aria-controls body id
// per BelowTheLineSection instance (shared across all instances in the module).
let btlInstanceId = 0;

defineProps({
  // below_the_line[] — {account_id, account_key, name, recurring_actual,
  // cuttability:'T0', behaviour, driver?, ...}
  rows: {
    type: Array,
    default: () => [],
  },
  // below_the_line_total
  total: {
    type: Number,
    default: 0,
  },
  formatCurrency: {
    type: Function,
    required: true,
  },
});

// Collapsed by default.
const open = ref(false);
// Deterministic, collision-free body id for aria-controls. A module counter
// (assigned once per instance at setup) keeps ids stable across renders and
// snapshots — matching CostCutGroupTable's deterministic bodyId, unlike a
// Math.random() id which is non-deterministic and breaks snapshot stability.
const bodyId = `btl-body-${btlInstanceId += 1}`;

// Muted "why this isn't a target" reason. T0 carries no cuttability action, so
// we surface the behaviour label (e.g. "Non-controllable", "Fixed") which is
// what distinguishes these statutory/finance lines.
function reasonFor(row) {
  return behaviourLabel(row.behaviour);
}
</script>

<style scoped>
.btl {
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 8px;
  background: var(--kdl-page-bg);
  overflow: hidden;
}

.btl__toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  appearance: none;
  border: none;
  background: transparent;
  padding: 12px 16px;
  cursor: pointer;
  color: var(--kdl-text-primary);
  font-family: inherit;
  text-align: left;
}

.btl__toggle:hover {
  background: var(--kdl-hover-bg);
}

.btl__toggle:focus-visible {
  outline: 2px solid var(--kdl-accent);
  outline-offset: -2px;
}

.btl__chevron {
  flex: 0 0 auto;
  color: var(--kdl-text-muted);
  transition: transform var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1));
}

.btl__chevron--open {
  transform: rotate(90deg);
}

@media (prefers-reduced-motion: reduce) {
  .btl__chevron {
    transition: none;
  }
}

.btl__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--kdl-text-secondary);
}

.btl__total {
  font-weight: 700;
  color: var(--kdl-text-primary);
  font-variant-numeric: tabular-nums;
}

.btl__body {
  padding: 0 16px 16px;
  display: grid;
  gap: 12px;
}

.btl__caption {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--kdl-text-muted);
}

.btl__table-wrap {
  overflow-x: auto;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 8px;
  background: var(--kdl-card-bg);
}

.btl__table {
  width: 100%;
  min-width: 420px;
  border-collapse: collapse;
}

.btl__table th,
.btl__table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--kdl-border-subtle);
  text-align: left;
  vertical-align: middle;
}

.btl__table thead th {
  background: var(--kdl-page-bg);
  color: var(--kdl-text-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.btl__name {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--kdl-text-primary);
}

.btl__driver {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: var(--kdl-text-muted);
}

.btl__reason {
  font-size: 12px;
  font-weight: 500;
  color: var(--kdl-text-muted);
}

.btl__num {
  font-variant-numeric: tabular-nums;
  font-size: 13px;
  color: var(--kdl-text-primary);
}

.btl__total-row > th,
.btl__total-row > td {
  border-bottom: none;
  background: var(--kdl-page-bg);
}

.btl__total-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--kdl-text-secondary);
}

.btl__num--total {
  font-weight: 700;
}

.text-right {
  text-align: right;
}
</style>
