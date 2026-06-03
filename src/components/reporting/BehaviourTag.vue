<!--
  BehaviourTag — categorical cost-behaviour pill.

  CATEGORICAL, not RAG. Deliberately NOT StatusPill / KChip: those carry
  RAG-semantic or neutral-only styling and would collide with the RAG pills
  rendered in the same table. The four categorical hues live in ONE place —
  src/css/cost-behaviour.css (--cc-beh-* custom properties; gap named there).

  Reused in two contexts:
    - per-row chip in the cost-cut table (default)
    - colour swatch in the headline split legend (same hue, same source)

  API:
    behaviour (string, optional) — 'fixed' | 'variable' | 'semi_variable'
                                   | 'non_controllable' | 'unclassified'.
                                   Anything missing/unknown → 'unclassified'.
    driver?   (string)  — shown as a native title (tooltip) on the pill, e.g.
                          "headcount (salaried)". Purely advisory.
    short?    (boolean) — use the dense short label ("Semi", "Non-ctrl").
                          Default false (full label).
-->
<template>
  <span
    class="behaviour-tag"
    :class="`behaviour-tag--${normalised}`"
    :title="title || undefined"
  >
    <span class="behaviour-tag__dot" aria-hidden="true" />
    <span class="behaviour-tag__label">{{ label }}</span>
  </span>
</template>

<script setup>
import { computed } from 'vue';
import {
  normaliseBehaviour,
  behaviourLabel,
  behaviourShortLabel,
} from '../../utils/costBehaviour';

const props = defineProps({
  // Not required: the component is DESIGNED to tolerate a missing/unknown value
  // — normaliseBehaviour() maps anything off-list (including undefined) to
  // 'unclassified'. Declaring it required tripped a dev-mode prop warning on the
  // very fallback path the component supports. Default keeps that path clean.
  behaviour: {
    type: String,
    required: false,
    default: 'unclassified',
  },
  driver: {
    type: String,
    default: null,
  },
  short: {
    type: Boolean,
    default: false,
  },
});

const normalised = computed(() => normaliseBehaviour(props.behaviour));
const label = computed(() =>
  props.short ? behaviourShortLabel(props.behaviour) : behaviourLabel(props.behaviour),
);
const title = computed(() => {
  const full = behaviourLabel(props.behaviour);
  return props.driver ? `${full} — driver: ${props.driver}` : full;
});
</script>

<style scoped>
/*
  6px radius matches the StatusPill family (not the fully-rounded KChip) so the
  behaviour tag reads as a static state label, not an interactive filter chip.
  Categorical hue + low-alpha tint come from --cc-beh-* (see cost-behaviour.css).
*/
.behaviour-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  white-space: nowrap;
  vertical-align: middle;
}

.behaviour-tag__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  background: currentColor;
}

.behaviour-tag__label {
  line-height: 1.3;
}

.behaviour-tag--fixed {
  color: var(--cc-beh-fixed);
  background: var(--cc-beh-fixed-tint);
}

.behaviour-tag--variable {
  color: var(--cc-beh-variable);
  background: var(--cc-beh-variable-tint);
}

.behaviour-tag--semi_variable {
  color: var(--cc-beh-semi);
  background: var(--cc-beh-semi-tint);
}

.behaviour-tag--non_controllable {
  color: var(--cc-beh-nonctrl);
  background: var(--cc-beh-nonctrl-tint);
}

.behaviour-tag--unclassified {
  color: var(--cc-beh-unclassified);
  background: var(--cc-beh-unclassified-tint);
}
</style>
