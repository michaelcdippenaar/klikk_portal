<!--
  TierTag — categorical cuttability-tier pill (T1 → T5, plus the T0 below-the-line
  sentinel).

  CATEGORICAL + ORDINAL, not RAG. Like BehaviourTag, this is deliberately NOT
  StatusPill: a tier is not a pass/warn/fail state and must not collide with the
  RAG pills rendered in the same row. The five tier hues (a warm→cool sequential
  ramp) live in ONE place — src/css/cost-behaviour.css (--cc-tier-* custom
  properties; gap named there). The T0 sentinel reuses the muted neutral.

  Reused in:
    - per-leaf chip in the grouped cost-cut table (small)
    - swatch on tier-group header rows

  API:
    tier   (string, optional) — 'T1'..'T5' or 'T0'. Anything off-list → 'T0'.
    showHint? (boolean) — append the "what to do" hint after the label
                          ("T1 Quick win · Stop the leak"). Default false (label
                          only, for the dense per-row chip).
-->
<template>
  <span
    class="tier-tag"
    :class="`tier-tag--${normalised.toLowerCase()}`"
    :title="title"
  >
    <span class="tier-tag__label">{{ label }}</span>
    <span v-if="showHint" class="tier-tag__hint">· {{ hint }}</span>
  </span>
</template>

<script setup>
import { computed } from 'vue';
import { normaliseTier, tierLabel, tierHint } from '../../utils/costBehaviour';

const props = defineProps({
  // Tolerates a missing/unknown value — normaliseTier() maps anything off-list
  // (including undefined) to the 'T0' below-the-line sentinel.
  tier: {
    type: String,
    required: false,
    default: 'T0',
  },
  showHint: {
    type: Boolean,
    default: false,
  },
});

const normalised = computed(() => normaliseTier(props.tier));
const label = computed(() => tierLabel(props.tier));
const hint = computed(() => tierHint(props.tier));
const title = computed(() => `${label.value} — ${hint.value}`);
</script>

<style scoped>
/*
  6px radius matches the StatusPill / BehaviourTag family so the tier tag reads
  as a static categorical label, not an interactive filter chip. Ordinal warm→
  cool hue + low-alpha tint come from --cc-tier-* (see cost-behaviour.css).
*/
.tier-tag {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  white-space: nowrap;
  vertical-align: middle;
}

.tier-tag__hint {
  font-weight: 500;
  opacity: 0.85;
}

.tier-tag--t1 {
  color: var(--cc-tier-1);
  background: var(--cc-tier-1-tint);
}

.tier-tag--t2 {
  color: var(--cc-tier-2);
  background: var(--cc-tier-2-tint);
}

.tier-tag--t3 {
  color: var(--cc-tier-3);
  background: var(--cc-tier-3-tint);
}

.tier-tag--t4 {
  color: var(--cc-tier-4);
  background: var(--cc-tier-4-tint);
}

.tier-tag--t5 {
  color: var(--cc-tier-5);
  background: var(--cc-tier-5-tint);
}

/* T0 below-the-line sentinel — muted neutral, never a categorical tier hue. */
.tier-tag--t0 {
  color: var(--cc-beh-unclassified);
  background: var(--cc-beh-unclassified-tint);
}
</style>
