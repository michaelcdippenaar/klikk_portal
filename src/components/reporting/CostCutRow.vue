<template>
  <tr :class="{ 'cost-cut-row--readonly': readOnly }">
    <!-- Manageable star toggle — marks this account onto the user's top
         cut-opportunity shortlist. Always-on (it's small enough), but only on
         editable leaves; below-the-line (T0) rows are never manageable, so they
         render an empty cell. A real role="switch" button with aria-checked. -->
    <td class="cost-cut-row__manage-cell">
      <!-- Star + its saving spinner share an inline-flex wrapper (mirrors how the
           tier/behaviour chip+spinner are wrapped) so the spinner appearing
           mid-save doesn't shift or wrap the layout in the 64px manage col. -->
      <div v-if="!readOnly" class="cost-cut-row__manage">
        <button
          type="button"
          role="switch"
          class="cost-cut-row__star"
          :class="{ 'cost-cut-row__star--on': isManageable }"
          :aria-checked="isManageable ? 'true' : 'false'"
          :aria-label="`Mark ${row.name} as a manageable top cut opportunity`"
          :disabled="savingManageable"
          @click="onToggleManageable"
        >
          <!-- Lucide star — filled when on (currentColor fill), outline when off -->
          <svg
            class="cost-cut-row__star-icon"
            xmlns="http://www.w3.org/2000/svg"
            width="16" height="16" viewBox="0 0 24 24"
            :fill="isManageable ? 'currentColor' : 'none'"
            stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </button>
        <KSpinner
          v-if="savingManageable"
          size="xs"
          tone="muted"
          label="Saving manageable"
        />
      </div>
    </td>

    <!-- Account name + group tag -->
    <td>
      <strong class="cost-cut-row__name">{{ row.name }}</strong>
      <small class="cost-cut-row__group">{{ groupLabelText }}</small>
    </td>

    <!-- Cuttability tier: chip-as-trigger. Resting = the TierTag chip inside an
         "activate to edit" button. Clicking reveals the inline re-tag KSelect,
         which commits on change/blur then collapses back to the chip. -->
    <td>
      <!-- focusout (which bubbles, unlike blur) collapses the select back to the
           chip when focus genuinely leaves the editing region — see the deferred,
           activeElement-based collapse logic in <script>. -->
      <div class="cost-cut-row__tier" @focusout="onTierFocusout">
        <!-- "Activate to edit" button, NOT a disclosure: clicking UNMOUNTS this
             button and swaps in the KSelect (which carries its own
             expanded/collapsed state), so an aria-expanded here would never be
             true and control nothing. We omit it and lean on the descriptive
             aria-label for the accessible name. -->
        <button
          v-if="!readOnly && !tierEditing"
          type="button"
          class="cost-cut-row__chip-trigger"
          :aria-label="`Cuttability tier: ${tierChipLabel}. Activate to change.`"
          @click="openTierEdit"
        >
          <TierTag :tier="row.cuttability" />
          <KSpinner
            v-if="savingTier"
            size="xs"
            tone="muted"
            label="Saving tier"
          />
        </button>
        <KSelect
          v-else-if="!readOnly"
          ref="tierSelectRef"
          class="cost-cut-row__tier-select"
          :model-value="normalisedTier"
          :options="tierOptions"
          :aria-label="`Cuttability tier for ${row.name}`"
          @update:model-value="onTierRetag"
        />
        <!-- Read-only rows keep the static chip (no trigger, no select). -->
        <TierTag v-else :tier="row.cuttability" />
      </div>
    </td>

    <!-- Behaviour: chip-as-trigger (same pattern as tier) + driver subtext. -->
    <td>
      <div class="cost-cut-row__behaviour">
        <div class="cost-cut-row__behaviour-top" @focusout="onBehaviourFocusout">
          <!-- "Activate to edit" button, NOT a disclosure (see tier trigger
               above): clicking unmounts it and reveals the KSelect, so no
               aria-expanded — just the descriptive aria-label. -->
          <button
            v-if="!readOnly && !behaviourEditing"
            type="button"
            class="cost-cut-row__chip-trigger"
            :aria-label="`Cost behaviour: ${behaviourChipLabel}. Activate to change.`"
            @click="openBehaviourEdit"
          >
            <BehaviourTag :behaviour="row.behaviour" :driver="row.driver" short />
            <KSpinner
              v-if="savingBehaviour"
              size="xs"
              tone="muted"
              label="Saving behaviour"
            />
          </button>
          <KSelect
            v-else-if="!readOnly"
            ref="behaviourSelectRef"
            class="cost-cut-row__behaviour-select"
            :model-value="normalisedBehaviour"
            :options="behaviourOptions"
            :aria-label="`Cost behaviour for ${row.name}`"
            @update:model-value="onRetag"
          />
          <!-- Read-only rows keep the static chip. -->
          <BehaviourTag v-else :behaviour="row.behaviour" :driver="row.driver" short />
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
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue';
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
  tierLabel,
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
  // Manageable-toggle spinner — independent of the other per-row spinners.
  savingManageable: {
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

const emit = defineEmits(['commit', 'retag', 'retag-tier', 'toggle-manageable']);

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

// ── Chip-as-trigger (B2) ─────────────────────────────────────────────────────
//
// Each re-tag axis defaults to a READABLE chip wrapped in a button; clicking it
// reveals the KSelect for that axis. The select commits on change (its
// update:model-value handler) OR collapses on focusout (focus leaving the
// editing region). This halves the row's resting control footprint — the chip
// is the value-read, the select appears only on intent. The optimistic-commit
// contract is UNCHANGED: onRetag / onTierRetag still emit the same payloads to
// the parent, which owns the optimistic mutation + POST + background reconcile.
const tierEditing = ref(false);
const behaviourEditing = ref(false);
const tierSelectRef = ref(null);
const behaviourSelectRef = ref(null);

// Labels read out in the trigger's aria-label so the collapsed chip announces
// both its value and that activating it edits.
const tierChipLabel = computed(() => tierLabel(props.row.cuttability));
const behaviourChipLabel = computed(() => behaviourLabel(props.row.behaviour));

// Focus the revealed select's trigger so a keyboard user lands on the control
// they just opened (and a pointer user gets the open affordance highlighted).
function focusSelectTrigger(selectRef) {
  nextTick(() => {
    const root = selectRef.value?.$el;
    // CROSS-COMPONENT DOM COUPLING: we reach into KSelect's internal
    // `.kselect-trigger` class (Reka's SelectTrigger) to focus it after reveal.
    // If KSelect is ever refactored, KEEP this class on the focusable trigger
    // OR expose a public focus() method on KSelect and call that instead.
    const trigger = root?.querySelector?.('.kselect-trigger');
    if (trigger) trigger.focus();
  });
}

function openTierEdit() {
  tierEditing.value = true;
  focusSelectTrigger(tierSelectRef);
}
function closeTierEdit() {
  // Cancel any pending deferred focusout check so it can't re-fire on a
  // subsequently re-opened editor. Defined below; hoisted, safe to reference.
  cancelCollapseTimer(tierCollapseTimer);
  tierEditing.value = false;
}
function openBehaviourEdit() {
  behaviourEditing.value = true;
  focusSelectTrigger(behaviourSelectRef);
}
function closeBehaviourEdit() {
  cancelCollapseTimer(behaviourCollapseTimer);
  behaviourEditing.value = false;
}

// focusout collapse — DEFERRED + activeElement-based, never relatedTarget-based.
//
// Why not decide synchronously on event.relatedTarget: Reka focuses the dropdown
// item ASYNCHRONOUSLY after popper positioning, and on programmatic/cross-portal
// focus moves the browser frequently reports relatedTarget === null even though
// focus is about to land inside the (teleported-to-<body>) dropdown. Deciding
// "null → collapse" synchronously therefore collapses the editor the instant the
// dropdown opens (can't-select / flicker). So a null relatedTarget must NEVER
// force a collapse.
//
// Instead we defer one frame and re-read document.activeElement. We collapse ONLY
// when, after focus has settled, the active element is NEITHER inside this cell
// wrapper NOR inside an OPEN .kselect-content panel (Reka teleports the panel to
// <body>, so it's outside the cell subtree). If focus is still in either, we stay
// open. We additionally bail if the select's trigger still reports
// data-state="open" — an open dropdown can't be collapsed by a transient
// focusout. The commit path (onRetag / onTierRetag) remains the primary collapse.
const tierCollapseTimer = ref(null);
const behaviourCollapseTimer = ref(null);

// Schedule a deferred re-check after focus settles. `cellEl` is the focusout's
// currentTarget (the cell wrapper). rAF lets popper position + Reka move focus
// first; setTimeout(0) is the fallback where rAF is unavailable (e.g. happy-dom).
function scheduleCollapseCheck(timerRef, cellEl, isOpen, close) {
  if (timerRef.value != null) return; // a check is already pending
  const run = () => {
    timerRef.value = null;
    // Trigger still open → never collapse; the dropdown owns focus right now.
    if (isOpen()) return;
    const active = document.activeElement;
    // Focus stayed inside the cell (e.g. moved to the trigger) → stay open.
    if (active && cellEl.contains(active)) return;
    // Focus landed inside the portalled, OPEN dropdown for this select → stay
    // open (the panel lives at <body>, outside the cell subtree).
    if (active && active.closest && active.closest('.kselect-content')) return;
    // Focus genuinely left both the cell and the panel → collapse.
    close();
  };
  const raf =
    typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (cb) => setTimeout(cb, 0);
  timerRef.value = raf(run);
}

function cancelCollapseTimer(timerRef) {
  if (timerRef.value == null) return;
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(timerRef.value);
  clearTimeout(timerRef.value); // harmless if it was an rAF handle
  timerRef.value = null;
}

// Read the open state off the select's own trigger (Reka stamps data-state).
function selectIsOpen(selectRef) {
  const root = selectRef.value?.$el;
  const trigger = root?.querySelector?.('.kselect-trigger');
  return trigger?.getAttribute('data-state') === 'open';
}

function onTierFocusout(event) {
  scheduleCollapseCheck(
    tierCollapseTimer,
    event.currentTarget,
    () => selectIsOpen(tierSelectRef),
    closeTierEdit,
  );
}
function onBehaviourFocusout(event) {
  scheduleCollapseCheck(
    behaviourCollapseTimer,
    event.currentTarget,
    () => selectIsOpen(behaviourSelectRef),
    closeBehaviourEdit,
  );
}

// Don't act on a torn-down tree (and don't leak a pending frame).
onBeforeUnmount(() => {
  cancelCollapseTimer(tierCollapseTimer);
  cancelCollapseTimer(behaviourCollapseTimer);
});

// Re-tag this account's behaviour. No-op if the chosen value matches what the
// row already shows (KSelect can re-emit the current value), or if it's the
// non-selectable 'unclassified' sentinel. The parent owns the optimistic
// mutation + POST + background reconcile. Either way we collapse back to the
// chip — a commit ends the edit, and a re-pick of the same value ends it too.
function onRetag(value) {
  closeBehaviourEdit();
  if (!value || value === 'unclassified' || value === normalisedBehaviour.value) return;
  emit('retag', {
    accountKey: props.row.account_key,
    accountId: props.row.account_id,
    behaviour: value,
    label: props.row.name,
  });
}

// Re-tag this account's cuttability tier. No-op if unchanged. Collapses the
// editor either way (same rationale as onRetag).
function onTierRetag(value) {
  closeTierEdit();
  if (!value || value === normalisedTier.value) return;
  emit('retag-tier', {
    accountKey: props.row.account_key,
    accountId: props.row.account_id,
    cuttability: value,
    label: props.row.name,
  });
}

// ── Manageable star toggle (A3) ──────────────────────────────────────────────
// Marks/unmarks this account on the user's top cut-opportunity shortlist. The
// parent optimistically mutates ONLY this row's is_manageable and POSTs
// { account_key, is_manageable } — it deliberately does NOT recompute
// manageable_total client-side (the background reconcile owns that aggregate).
const isManageable = computed(() => props.row.is_manageable === true);

function onToggleManageable() {
  if (props.savingManageable) return;
  emit('toggle-manageable', {
    accountKey: props.row.account_key,
    accountId: props.row.account_id,
    isManageable: !isManageable.value,
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

/* ── Manageable star cell ────────────────────────────────────────────────── */
.cost-cut-row__manage-cell {
  white-space: nowrap;
}

/* Inline-flex wrapper around the star + its saving spinner (mirrors the
   tier/behaviour chip+spinner wrappers) so the spinner appearing mid-save
   doesn't reflow / wrap the fixed-width manage column. */
.cost-cut-row__manage {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* Compact icon-button toggle. Off = muted outline star; on = accent-filled —
   the accent is the same "marked / selected" affordance KToggle-on and the
   active filter chips already use (not a RAG tone, not a behaviour/tier hue). */
.cost-cut-row__star {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  appearance: none;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--kdl-text-hint);
  cursor: pointer;
  transition: color var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1)),
              background var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1));
}

@media (prefers-reduced-motion: reduce) {
  .cost-cut-row__star {
    transition: none;
  }
}

.cost-cut-row__star:hover {
  color: var(--kdl-accent);
  background: var(--kdl-hover-bg);
}

.cost-cut-row__star:focus-visible {
  outline: 2px solid var(--kdl-accent);
  outline-offset: 1px;
}

.cost-cut-row__star:disabled {
  cursor: default;
  opacity: 0.6;
}

.cost-cut-row__star--on {
  color: var(--kdl-accent);
}

.cost-cut-row__star-icon {
  display: block;
}

/* ── Chip-as-trigger (B2): the readable chip wrapped in a bare button ──────── */
.cost-cut-row__chip-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px;
  margin: -2px;
  appearance: none;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 8px;
  font: inherit;
  color: inherit;
  text-align: left;
}

.cost-cut-row__chip-trigger:hover {
  background: var(--kdl-hover-bg);
}

.cost-cut-row__chip-trigger:focus-visible {
  outline: 2px solid var(--kdl-accent);
  outline-offset: 1px;
}

/* ── Tier cell ───────────────────────────────────────────────────────────── */
.cost-cut-row__tier {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* The revealed re-tag select — compact to keep the dense table tidy. */
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
}

.cost-cut-row__behaviour-top {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* The revealed re-tag select — compact, the chip carried the colour. */
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
