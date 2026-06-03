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
