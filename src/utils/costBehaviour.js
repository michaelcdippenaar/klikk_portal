// Cost-behaviour classification — shared labels, ordering and select options.
//
// The CFO classifies every recurring-cash expense account by cost behaviour.
// This module is the single source of truth for the behaviour vocabulary used
// across CostBehaviourBar (headline split + legend), BehaviourTag (per-row
// chip) and the inline re-tag KSelect. It carries DATA only — no colours.
// The categorical colour decision lives in src/css/cost-behaviour.css (the KDL
// token set has no categorical/chart hues; see the gap note there).

// Canonical key → full label (legend, select options, tooltips).
export const BEHAVIOUR_LABELS = {
  fixed: 'Fixed',
  variable: 'Variable',
  semi_variable: 'Semi-variable',
  non_controllable: 'Non-controllable',
  unclassified: 'Unclassified',
};

// Short labels for the dense per-row chip.
export const BEHAVIOUR_SHORT_LABELS = {
  fixed: 'Fixed',
  variable: 'Variable',
  semi_variable: 'Semi',
  non_controllable: 'Non-ctrl',
  unclassified: 'Unclassified',
};

// Display order for the stacked bar, legend and filter chips. "unclassified"
// is intentionally excluded from the bar/filter affordances by default — it is
// a defensive fallback, not a behaviour MC would deliberately filter on.
export const BEHAVIOUR_ORDER = ['fixed', 'variable', 'semi_variable', 'non_controllable'];

// The four behaviours an account can be re-tagged to (KSelect options). Every
// account — including a defensively "unclassified" one — can be set to one of
// these four; there is deliberately no "unclassified" option to re-tag INTO.
export const BEHAVIOUR_SELECT_OPTIONS = BEHAVIOUR_ORDER.map((value) => ({
  value,
  label: BEHAVIOUR_LABELS[value],
}));

// Filter chip options for the table: "All" plus each behaviour in order.
export const BEHAVIOUR_FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  ...BEHAVIOUR_ORDER.map((value) => ({ value, label: BEHAVIOUR_LABELS[value] })),
];

// Normalise an unknown / missing behaviour to a safe key.
export function normaliseBehaviour(value) {
  return Object.prototype.hasOwnProperty.call(BEHAVIOUR_LABELS, value)
    ? value
    : 'unclassified';
}

export function behaviourLabel(value) {
  return BEHAVIOUR_LABELS[normaliseBehaviour(value)];
}

export function behaviourShortLabel(value) {
  return BEHAVIOUR_SHORT_LABELS[normaliseBehaviour(value)];
}

// ── Cuttability tiers ───────────────────────────────────────────────────────
//
// The backend now classifies every ADDRESSABLE account by a "cuttability" tier
// T1..T5 (T1 = act first, T5 = structural / hardest). Below-the-line rows carry
// the sentinel 'T0' (tax / finance / statutory — not a cost-cut target). This
// map is the single source of truth for the tier vocabulary used by the grouped
// table header rows, the per-leaf tier chip and the tier re-tag select.
//
//   label — display name shown on group headers + chips
//   hint  — one-word "what to do" cue (CEO/CIMA framing: "cut here first")
//   order — sort key so groups read T1 (quick win) → T5 (structural), top-down
//
// DATA only — no colours. The categorical tier hues live alongside the
// behaviour hues in src/css/cost-behaviour.css (--cc-tier-* ; gap named there).
export const TIER_META = {
  T1: { label: 'T1 Quick win', hint: 'Stop the leak', order: 1 },
  T2: { label: 'T2 Behavioural', hint: 'Change conduct', order: 2 },
  T3: { label: 'T3 Discretionary', hint: 'Pause / cut', order: 3 },
  T4: { label: 'T4 Renegotiable', hint: 'Re-tender', order: 4 },
  T5: { label: 'T5 Structural', hint: 'Needs scale change', order: 5 },
  // Sentinel for below-the-line rows — never a cut target, never re-taggable.
  T0: { label: 'T0 Below the line', hint: 'Not a cost-cut target', order: 0 },
};

// The five addressable tiers in act-first order (T1 → T5). Below-the-line 'T0'
// is intentionally excluded — it is never a destination you re-tag INTO and is
// not a grouping bucket for addressable cost.
export const TIER_ORDER = ['T1', 'T2', 'T3', 'T4', 'T5'];

// Select options for the inline tier re-tag (the five addressable tiers, each
// labelled "T1 Quick win — Stop the leak" so the dropdown carries the cue).
export const TIER_SELECT_OPTIONS = TIER_ORDER.map((value) => ({
  value,
  label: `${TIER_META[value].label} — ${TIER_META[value].hint}`,
}));

// Normalise an unknown / missing cuttability to a safe key. Anything off-list
// (including undefined) is treated as the below-the-line sentinel 'T0' so a
// mis-tagged row never silently masquerades as an addressable tier.
export function normaliseTier(value) {
  return Object.prototype.hasOwnProperty.call(TIER_META, value) ? value : 'T0';
}

export function tierLabel(value) {
  return TIER_META[normaliseTier(value)].label;
}

export function tierHint(value) {
  return TIER_META[normaliseTier(value)].hint;
}

export function tierOrder(value) {
  return TIER_META[normaliseTier(value)].order;
}

// ── Account-group vocabulary (the existing `group` field) ───────────────────
// Used by the "Account group" grouping option and the per-row group subtext.
export const GROUP_LABELS = {
  OVERHEADS: 'Overheads',
  DIRECTCOSTS: 'Direct costs',
  EXPENSE: 'Expense',
};

export function groupLabel(value) {
  return GROUP_LABELS[value] || value || 'Ungrouped';
}

// ── Client-side RAG (lower-is-better) ───────────────────────────────────────
//
// Recolours the EDITED row on the SAME tick after an optimistic target edit,
// before the background reconcile lands. It mirrors the server's DEFAULT RAG
// rule (5% amber band); the server reconcile is AUTHORITATIVE and overrides this
// if the band ever differs. Lower-is-better:
//   no target          → 'none'
//   actual <= target           → 'green'  (on / under target)
//   actual <= target * 1.05     → 'amber'  (within 5% over)
//   else                       → 'red'    (materially over)
//
// NOTE: this is the ONLY optimistic recompute that remains. Cross-row aggregates
// (rag_counts, total_rag, behaviour_totals, tier_totals, addressable_*) are NOT
// recomputed on the client — the reconcile is their sole source of truth, which
// removes the client/server divergence surface (see CostCutReport commit*).
export function computeRag(actual, target) {
  if (target == null || !Number.isFinite(Number(target)) || Number(target) === 0) {
    return 'none';
  }
  const a = Number(actual) || 0;
  const t = Number(target);
  if (a <= t) return 'green';
  if (a <= t * 1.05) return 'amber';
  return 'red';
}
