/**
 * CostCutReport.spec.js — MOUNT-BASED tests for the Recurring-Cash Cost-Cut
 * Finder, v2 ("Cost-Cut Finder v2" rebuild).
 *
 * Authored under the test-authorship-split doctrine: written by an independent
 * tester (NOT the feature author). The bar is mount-based + realistic data +
 * observable DOM. We mount the real consumer (CostCutReport) with the real
 * children (CostCutGroupTable, CostCutRow, BelowTheLineSection, CostBehaviourBar,
 * TierTag, BehaviourTag), real KDL primitives (KInput/KSelect/StatusPill/KTabs/
 * KSpinner) and the real Pinia store. Only the network boundary
 * (src/api/planningAnalytics) and the useToast composable are mocked.
 *
 * Prior incident this guards against (2026-05-26): the KTable tests were
 * TanStack-direct (library internals), so they passed while the consumer shipped
 * a runtime bug. These tests assert against the rendered DOM of the consumer.
 *
 * ── Why this file was rewritten ─────────────────────────────────────────────
 * The previous revision of this spec was written against the v1 component (flat
 * row list; behaviour_totals-only headline; `.cost-cut__beh-chip` filter; rows
 * keyed only by account_key with no `cuttability`). The v2 rebuild changed the
 * response contract (addressable_operating_cost as the headline; per-row
 * `cuttability` T1..T5; below_the_line[]; grouped collapsible table; filter
 * chips on the shared `.cost-cut__chip` class) and the rows render through
 * CostCutGroupTable now. Against v2, 20 of the old 29 cases failed for contract
 * reasons (the old fixture carried no `addressable_operating_cost` → headline
 * read R0; old rows carried no `cuttability` → normaliseTier()→'T0' → every row
 * was treated as below-the-line and excluded from the addressable table → zero
 * rows rendered). This file rebuilds the suite to the v2 contract and adds the
 * eight v2 behaviour areas.
 *
 * ── Driving the inline re-tag / filter / group selects ──────────────────────
 * KSelect wraps Reka UI's SelectRoot, whose dropdown is portal-teleported and
 * does not open reliably under happy-dom. So for the inline re-tag we locate the
 * REAL row KSelect *component* (by its accessible name — the aria-label that
 * falls through to the trigger) and emit its `update:modelValue` — the exact
 * event Reka emits on selection. This still exercises the real consumer chain
 * (CostCutRow.onRetag/onTierRetag → CostCutReport.commitBehaviour/commitTier);
 * only the portal click itself is bypassed. The group-by + behaviour filter are
 * plain <button> chips, so those are driven with real clicks.
 */

// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

// ── Mock the network boundary ────────────────────────────────────────────────
vi.mock('../../../api/planningAnalytics', () => ({
  getCostCutReport: vi.fn(),
  getKpiTargets: vi.fn(),
  saveKpiTarget: vi.fn(),
  deleteKpiTarget: vi.fn(),
  saveCostBehaviour: vi.fn(),
}));

// ── Mock the toast composable (no toast region mounted in tests) ─────────────
const toastCalls = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() };
vi.mock('../../../composables/useToast', () => ({
  useToast: () => toastCalls,
}));

// ── Stub vue-router so KTabs' useRoute/useRouter resolve cleanly ─────────────
// (KTabs guards these in a try/catch, and is mounted with :url-sync="false"
//  regardless, but stubs silence the inject warnings.)
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ replace: vi.fn() }),
}));

import CostCutReport from '../CostCutReport.vue';
import CostCutRow from '../CostCutRow.vue';
import CostCutGroupTable from '../CostCutGroupTable.vue';
import BelowTheLineSection from '../BelowTheLineSection.vue';
import BehaviourTag from '../BehaviourTag.vue';
import TierTag from '../TierTag.vue';
import KSelect from '../../klikk/KSelect.vue';
import {
  getCostCutReport,
  saveKpiTarget,
  deleteKpiTarget,
  saveCostBehaviour,
} from '../../../api/planningAnalytics';
import { useDataStore } from '../../../stores/data';
import { API_ENDPOINTS } from '../../../utils/constants';

const ENTITY = '41ebfa0e-012e-4ff1-82ba-a9a7585c536c';

// ════════════════════════════════════════════════════════════════════════════
// FIXTURES — the FULL-LEDGER shape the v2 endpoint returns
// ════════════════════════════════════════════════════════════════════════════
//
// Addressable accounts (is_addressable: true, one per tier T1..T5). The sum of
// is_addressable recurring_actual == addressable_operating_cost, by construction:
//   a1 T1 fixed             420000  (prior 471000, target 380000 → red)
//   a2 T2 variable          300000  (prior 250000, no target     → none)
//   a3 T3 semi_variable     180000  (prior 170000, target 200000 → green)
//   a4 T4 non_controllable   90000  (prior  88000, no target     → none)
//   a5 T5 fixed             250000  (prior 230000, target 240000 → amber)
//   ────────────────────────────────────────────────────────────────────────
//   Σ recurring_actual   = 1,240,000  → addressable_operating_cost
//   Σ recurring_prior    = 1,209,000  → priorAddressable (like-for-like base)
//   YoY = (1,240,000-1,209,000)/1,209,000 = +2.56% → rise → bad/red, "+2.6%"
//
// below_the_line[] (T0 — tax / finance, never cut targets):
//   b1 Income tax            95000   (non_controllable)
//   b2 Finance costs         60000   (non_controllable)
//   below_the_line_total = 155,000
//
// total_recurring_cost = 1,240,000 + 155,000 = 1,395,000 ("Total incl. below…")
//
// tier_totals : T1 420000, T2 300000, T3 180000, T4 90000, T5 250000
// behaviour_totals (addressable): fixed 670000, variable 300000, semi 180000,
//   non_controllable 90000, unclassified 0
// addressable_base (fixed+variable+semi) = 1,150,000
// fixed_variable_ratio = 670000/300000 = 2.23
// rag_counts over accounts[] = { red:1, amber:1, green:1, none:2 }

// Per-row `is_manageable` seed (the user's editable top-cut-opportunity hit-list)
// mirrors the backend default: the actionable near-term tiers T1/T2/T3 start ON,
// the renegotiable/structural T4/T5 start OFF.
//   a1 T1 (420000) manageable, a2 T2 (300000) manageable, a3 T3 (180000) manageable,
//   a4 T4  (90000) NOT,        a5 T5 (250000) NOT.
//   manageable_total = 420000 + 300000 + 180000 = 900,000 (a SERVER aggregate).
function addressableRows() {
  return [
    {
      account_id: 'a1', account_key: 'kl_T1', name: 'Employee Expenses Tanja',
      group: 'OVERHEADS', cuttability: 'T1', is_addressable: true, is_manageable: true,
      behaviour: 'fixed', driver: 'headcount (salaried)',
      recurring_actual: 420000, recurring_prior: 471000,
      yoy_pct: -10.8, pct_of_cost: 33.9, target: 380000, rag: 'red',
    },
    {
      account_id: 'a2', account_key: 'kl_T2', name: 'Casual Wages',
      group: 'DIRECTCOSTS', cuttability: 'T2', is_addressable: true, is_manageable: true,
      behaviour: 'variable', driver: 'hours worked',
      recurring_actual: 300000, recurring_prior: 250000,
      yoy_pct: 20, pct_of_cost: 24.2, target: null, rag: 'none',
    },
    {
      account_id: 'a3', account_key: 'kl_T3', name: 'Electricity',
      group: 'OVERHEADS', cuttability: 'T3', is_addressable: true, is_manageable: true,
      behaviour: 'semi_variable', driver: 'usage + standing',
      recurring_actual: 180000, recurring_prior: 170000,
      yoy_pct: 5.9, pct_of_cost: 14.5, target: 200000, rag: 'green',
    },
    {
      account_id: 'a4', account_key: 'kl_T4', name: 'Statutory Levies',
      group: 'EXPENSE', cuttability: 'T4', is_addressable: true, is_manageable: false,
      behaviour: 'non_controllable', driver: 'regulation',
      recurring_actual: 90000, recurring_prior: 88000,
      yoy_pct: 2.3, pct_of_cost: 7.3, target: null, rag: 'none',
    },
    {
      account_id: 'a5', account_key: 'kl_T5', name: 'Premises Lease',
      group: 'OVERHEADS', cuttability: 'T5', is_addressable: true, is_manageable: false,
      behaviour: 'fixed', driver: 'lease',
      recurring_actual: 250000, recurring_prior: 230000,
      yoy_pct: 8.7, pct_of_cost: 20.2, target: 240000, rag: 'amber',
    },
  ];
}

function belowTheLineRows() {
  return [
    {
      account_id: 'b1', account_key: 'kl_TAX', name: 'Income Tax',
      group: 'EXPENSE', cuttability: 'T0', is_addressable: false,
      behaviour: 'non_controllable', driver: null,
      recurring_actual: 95000, recurring_prior: 90000,
      yoy_pct: 5.6, pct_of_cost: 6.8, target: null, rag: 'none',
    },
    {
      account_id: 'b2', account_key: 'kl_FIN', name: 'Finance Costs',
      group: 'EXPENSE', cuttability: 'T0', is_addressable: false,
      behaviour: 'non_controllable', driver: 'interest on debt',
      recurring_actual: 60000, recurring_prior: 55000,
      yoy_pct: 9.1, pct_of_cost: 4.3, target: null, rag: 'none',
    },
  ];
}

// FULL-LEDGER, year-in-progress (partial year) variant.
function makeReport(overrides = {}) {
  return {
    entity: ENTITY,
    year: 2025,
    prior_year: 2024,
    basis: 'Recurring cash expense (excludes non-cash & one-offs)',
    source: 'TM1 gl_src_trial_balance (live)',

    accounts: addressableRows(),
    top_opportunities: [
      // Fastest-growing addressable costs — a subset, distinct ordering.
      { ...addressableRows()[1] }, // Casual Wages  (variable, T2, +20%)
      { ...addressableRows()[4] }, // Premises Lease (fixed,   T5, +8.7%)
    ],

    // ── v2 headline (change #1) ──────────────────────────────────────────────
    addressable_operating_cost: 1240000,

    // ── Manageable hit-list total (A3/A4) — a SERVER aggregate. Σ of the
    //    is_manageable rows: a1 420k + a2 300k + a3 180k = 900,000. The client
    //    NEVER recomputes this; the reconcile owns it (same contract as
    //    behaviour_totals). ────────────────────────────────────────────────────
    manageable_total: 900000,

    // ── Below the line (change #4) ───────────────────────────────────────────
    below_the_line: belowTheLineRows(),
    below_the_line_total: 155000,

    // ── Tier + behaviour aggregates ──────────────────────────────────────────
    tier_totals: { T1: 420000, T2: 300000, T3: 180000, T4: 90000, T5: 250000 },
    behaviour_totals: {
      fixed: 670000, variable: 300000, semi_variable: 180000,
      non_controllable: 90000, unclassified: 0,
    },
    addressable_base: 1150000,
    fixed_variable_ratio: 2.23,

    // ── Partial-year honesty (change #2) ─────────────────────────────────────
    year_in_progress: true,
    months_elapsed: 5,
    period_label: 'YTD to May (5 mo)',
    comparison_basis: 'Compared like-for-like to the same 5 months last year.',
    annualised_estimate: 3100000,

    // ── Back-compat fields (legacy consumers / total tile / RAG summary) ──────
    total_recurring_cost: 1395000,
    total_target: 1300000,
    total_rag: 'red',
    rag_counts: { green: 1, amber: 1, red: 1, none: 2 },

    ...overrides,
  };
}

// SECOND variant — complete year: no period chip "in progress" tone, and the
// annualised estimate is absent (null) because there is nothing to project.
function makeCompleteYearReport(overrides = {}) {
  return makeReport({
    year_in_progress: false,
    months_elapsed: 12,
    period_label: 'Full year',
    comparison_basis: 'Compared to the full prior year.',
    annualised_estimate: null,
    ...overrides,
  });
}

// ── Mount helpers ────────────────────────────────────────────────────────────
function mountReport() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useDataStore();
  store.tenants = [{ tenant_id: ENTITY, tenant_name: 'Klikk Rentals' }];
  store.selectedTenant = ENTITY;

  return mount(CostCutReport, {
    global: { plugins: [pinia] },
  });
}

// ── Chip-as-trigger (B2) reveal helpers ──────────────────────────────────────
//
// Post-B2, the per-row tier/behaviour KSelect no longer renders at rest — the
// row shows a READABLE chip wrapped in a button (.cost-cut-row__chip-trigger,
// aria-expanded="false") and the KSelect only appears AFTER that trigger is
// clicked. So the select-finders are now async: they locate the CostCutRow by
// name, click the axis's chip-trigger to REVEAL the select, then return the
// now-rendered KSelect component (matched on the same accessible-name aria-label
// the select forwards onto its trigger). Emitting update:modelValue on the
// returned select then drives the real consumer chain exactly as before — the
// optimistic-mutation + POST contract is unchanged; only the affordance is.
//
// The chip-trigger aria-labels are stable accessible-name handles, not test-only
// hooks: "Cost behaviour: <label>. Activate to change." / "Cuttability tier:
// <label>. Activate to change.".
function rowByName(wrapper, accountName) {
  return leafRows(wrapper).find((r) => r.props('row').name === accountName);
}

// Click the chip-trigger for `axisPrefix` ('Cost behaviour:' | 'Cuttability tier:')
// inside the named row to reveal that axis's KSelect. Returns the row wrapper.
async function revealAxisFor(wrapper, accountName, axisPrefix) {
  const row = rowByName(wrapper, accountName);
  expect(row, `row "${accountName}" should exist`).toBeTruthy();
  const trigger = row
    .findAll('.cost-cut-row__chip-trigger')
    .find((b) => (b.attributes('aria-label') || '').startsWith(axisPrefix));
  expect(
    trigger,
    `chip-trigger "${axisPrefix}" in row "${accountName}" should exist`,
  ).toBeTruthy();
  // NOTE: the chip-trigger is an "activate to edit" button, NOT a disclosure —
  // post the P1 fix it carries NO aria-expanded (clicking it UNMOUNTS the button
  // and swaps in a KSelect, so an aria-expanded here would control nothing). The
  // accessible-name handle (`aria-label` startsWith above) is what reveals the
  // select; we no longer assert aria-expanded on it.
  await trigger.trigger('click');
  await flushPromises();
  return row;
}

// Reveal + return the behaviour re-tag KSelect for the named account. Clicks the
// behaviour chip-trigger FIRST (B2), then returns the revealed KSelect.
async function behaviourSelectFor(wrapper, accountName) {
  await revealAxisFor(wrapper, accountName, 'Cost behaviour:');
  return wrapper
    .findAllComponents(KSelect)
    .find((c) => c.attributes('aria-label') === `Cost behaviour for ${accountName}`);
}

// Reveal + return the tier re-tag KSelect for the named account.
async function tierSelectFor(wrapper, accountName) {
  await revealAxisFor(wrapper, accountName, 'Cuttability tier:');
  return wrapper
    .findAllComponents(KSelect)
    .find((c) => c.attributes('aria-label') === `Cuttability tier for ${accountName}`);
}

// Per-row manageable star (role="switch"). A stable semantic handle.
function manageableStarFor(wrapper, accountName) {
  const row = rowByName(wrapper, accountName);
  if (!row) return undefined;
  return row.find('button[role="switch"]');
}

// The data <tr> rows actually rendered for the active table (CostCutRow roots).
function leafRows(wrapper) {
  return wrapper.findAllComponents(CostCutRow);
}

// Names of the CostCutRow leaves currently in the DOM (regardless of v-show).
function leafNames(wrapper) {
  return leafRows(wrapper).map((r) => r.props('row').name);
}

// Click a chip (group-by OR behaviour filter) within a labelled group by text.
async function clickChip(wrapper, groupAriaLabel, label) {
  const chip = wrapper
    .findAll(`[aria-label="${groupAriaLabel}"] .cost-cut__chip`)
    .find((b) => b.text() === label);
  expect(chip, `chip "${label}" in "${groupAriaLabel}" should exist`).toBeTruthy();
  await chip.trigger('click');
  await flushPromises();
  return chip;
}
const clickBehaviourFilter = (w, label) => clickChip(w, 'Filter by cost behaviour', label);
const clickGroupBy = (w, label) => clickChip(w, 'Group accounts by', label);
const clickManageableFilter = (w, label) => clickChip(w, 'Filter by manageable', label);

// The headline "Manageable — top opportunities" secondary stat, located by its
// label so it's never confused with the "Total incl. below-the-line" stat that
// shares the .cost-cut__secondary-value class.
function manageableStat(wrapper) {
  return wrapper
    .findAll('.cost-cut__secondary-stat')
    .find((s) => s.find('.cost-cut__secondary-label').text().includes('Manageable'));
}

// Strip all whitespace (regular / NBSP / narrow-NBSP) so en-ZA currency
// assertions don't depend on the irregular separator char.
const digits = (s) => s.replace(/\s/g, '');

// en-ZA currency renders with a ",00" decimal (comma is the decimal separator).
// rand(value) builds the exact whitespace-stripped string the component prints,
// so an exact toBe() assertion stays strict on the integer rand amount without
// hard-coding the locale's separator chars in the source.
const rand = (n) => `R${n}` + ',00';

beforeEach(() => {
  // mockReset (not just clearAllMocks) so a `mockResolvedValueOnce` / held-open
  // `mockImplementationOnce` queued by a prior test cannot leak into the next
  // mount. clearAllMocks keeps implementation queues; reset drops them, and we
  // re-establish the defaults below.
  getCostCutReport.mockReset();
  saveKpiTarget.mockReset();
  deleteKpiTarget.mockReset();
  saveCostBehaviour.mockReset();
  toastCalls.success.mockReset();
  toastCalls.error.mockReset();
  toastCalls.info.mockReset();
  toastCalls.warn.mockReset();

  // IMPORTANT: return a FRESH report object per call. A single shared object
  // would be mutated in-place by the optimistic edits, so a "reconcile" that
  // resolved with that same reference would silently appear to preserve the
  // edit even if last-wins were broken — a false pass. Fresh objects make the
  // reconcile genuinely server-authoritative (un-mutated) on every call.
  getCostCutReport.mockImplementation(async () => makeReport());
  saveKpiTarget.mockResolvedValue({ ok: true });
  deleteKpiTarget.mockResolvedValue({ ok: true });
  saveCostBehaviour.mockResolvedValue({ ok: true });
});

// ════════════════════════════════════════════════════════════════════════════
// Baseline — the report mounts, fetches and renders the v2 surface
// ════════════════════════════════════════════════════════════════════════════
describe('CostCutReport — mount baseline', () => {
  it('fetches on mount and renders all five addressable leaf rows', async () => {
    const wrapper = mountReport();
    await flushPromises();

    expect(getCostCutReport).toHaveBeenCalledTimes(1);
    expect(getCostCutReport).toHaveBeenCalledWith(ENTITY, '2025');

    // All five addressable accounts render (below-the-line is a separate section).
    expect(leafRows(wrapper).length).toBe(5);
    const names = leafNames(wrapper);
    expect(names).toContain('Employee Expenses Tanja');
    expect(names).toContain('Premises Lease');
  });

  it('shows the loading state before the fetch resolves, then clears it', async () => {
    let resolveFetch;
    getCostCutReport.mockImplementation(
      () => new Promise((resolve) => { resolveFetch = resolve; }),
    );

    const wrapper = mountReport();
    await Promise.resolve();
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Reading live from TM1');
    expect(leafRows(wrapper).length).toBe(0);

    resolveFetch(makeReport());
    await flushPromises();
    expect(wrapper.text()).not.toContain('Reading live from TM1');
    expect(leafRows(wrapper).length).toBe(5);
  });

  it('shows an error state when getCostCutReport rejects', async () => {
    getCostCutReport.mockRejectedValue(new Error('TM1 connection refused'));

    const wrapper = mountReport();
    await flushPromises();

    expect(wrapper.find('.cost-cut__status--error').exists()).toBe(true);
    expect(wrapper.text()).toContain('TM1 connection refused');
    expect(leafRows(wrapper).length).toBe(0);
  });

  it('renders both KTabs and switches to the opportunities panel on click', async () => {
    const wrapper = mountReport();
    await flushPromises();

    const tabs = wrapper.findAll('[role="tab"]');
    const labels = tabs.map((t) => t.text());
    expect(labels).toContain('Where the money goes');
    expect(labels).toContain('Top cut opportunities');

    const oppTab = tabs.find((t) => t.text() === 'Top cut opportunities');
    await oppTab.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Fastest-growing recurring costs');
    // Two opportunities in the fixture.
    expect(leafRows(wrapper).length).toBe(2);
    expect(leafNames(wrapper)).toContain('Casual Wages');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// AREA 1 — Headline: addressable operating cost + like-for-like YoY + total
// ════════════════════════════════════════════════════════════════════════════
describe('Area 1 — addressable headline', () => {
  it('headline value is addressable_operating_cost with the "(excludes tax…)" sub-caption', async () => {
    const wrapper = mountReport();
    await flushPromises();

    const tile = wrapper.find('.cost-cut__addressable-tile');
    expect(tile.exists()).toBe(true);

    // Primary value = R1 240 000 (addressable_operating_cost), NOT 1 395 000.
    expect(digits(tile.find('.metric-tile__value').text())).toBe(rand(1240000));
    expect(tile.find('.metric-tile__label').text()).toBe('Addressable operating cost');

    // Sub-caption naming the exclusion.
    const sub = tile.find('.cost-cut__addressable-sub');
    expect(sub.exists()).toBe(true);
    expect(sub.text()).toContain('excludes tax');
    expect(sub.text().toLowerCase()).toContain('statutory');
  });

  it('like-for-like YoY = (addressable − Σ prior)/Σ prior, rendered as a cost-direction (rise=red) delta', async () => {
    const wrapper = mountReport();
    await flushPromises();

    const delta = wrapper.find('.cost-cut__delta');
    expect(delta.exists()).toBe(true);
    // +2.56% → "+2.6% YoY", with the like-for-like note.
    expect(delta.text()).toContain('+2.6%');
    expect(delta.text().toLowerCase()).toContain('like-for-like');
    // A RISE in cost is bad → red class (not MetricTile's up=green).
    expect(delta.classes()).toContain('cost-cut__delta--bad');
    expect(delta.classes()).not.toContain('cost-cut__delta--good');
  });

  it('a FALL in like-for-like addressable cost reads green (cost-direction good)', async () => {
    // Make this year's addressable lower than the prior sum → fall → good/green.
    // Drop a1's actual to 300000 so Σ actual = 1,120,000 < Σ prior 1,209,000.
    const rows = addressableRows();
    rows[0].recurring_actual = 300000;
    getCostCutReport.mockResolvedValue(
      makeReport({ accounts: rows, addressable_operating_cost: 1120000 }),
    );
    const wrapper = mountReport();
    await flushPromises();

    const delta = wrapper.find('.cost-cut__delta');
    expect(delta.exists()).toBe(true);
    expect(delta.text()).toContain('-7.4%'); // (1,120,000-1,209,000)/1,209,000
    expect(delta.classes()).toContain('cost-cut__delta--good');
    expect(delta.classes()).not.toContain('cost-cut__delta--bad');
  });

  it('shows total_recurring_cost as the smaller "Total incl. below-the-line" secondary stat', async () => {
    const wrapper = mountReport();
    await flushPromises();

    const secondary = wrapper.find('.cost-cut__secondary');
    expect(secondary.exists()).toBe(true);
    expect(secondary.text().toLowerCase()).toContain('total incl. below-the-line');
    // The total (1 395 000) lives in the secondary stat, distinct from the
    // primary addressable value (1 240 000).
    expect(digits(secondary.find('.cost-cut__secondary-value').text())).toBe(rand(1395000));
  });

  it('like-for-like YoY is absent when there is no prior addressable base', async () => {
    const rows = addressableRows().map((r) => ({ ...r, recurring_prior: 0 }));
    getCostCutReport.mockResolvedValue(makeReport({ accounts: rows }));
    const wrapper = mountReport();
    await flushPromises();

    expect(wrapper.find('.cost-cut__delta').exists()).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// AREA 2 — Partial-year honesty: period chip, comparison basis, annualised
// ════════════════════════════════════════════════════════════════════════════
describe('Area 2 — partial-year vs complete-year', () => {
  it('renders the period_label chip beside the year with an INFO tone while year_in_progress', async () => {
    const wrapper = mountReport();
    await flushPromises();

    const period = wrapper.find('.cost-cut__period');
    expect(period.exists()).toBe(true);
    expect(period.find('.cost-cut__period-year').text()).toContain('FY 2025');

    // The period chip is a StatusPill with the period_label, info tone in-progress.
    const pill = period.find('.status-pill');
    expect(pill.exists()).toBe(true);
    expect(pill.text()).toContain('YTD to May (5 mo)');
    expect(pill.classes()).toContain('status-pill--info');
  });

  it('folds comparison_basis + annualised projection into ONE .cost-cut__methodology line (B1)', async () => {
    // B1 reorder: the two stacked caption lines (.cost-cut__basis-caption +
    // .cost-cut__annualised) are GONE — both are folded into a single muted
    // .cost-cut__methodology line so the YoY delta is no longer buried beneath
    // them. The one line must carry BOTH the comparison basis and the projection.
    const wrapper = mountReport();
    await flushPromises();

    // The old two lines no longer exist.
    expect(wrapper.find('.cost-cut__basis-caption').exists()).toBe(false);
    expect(wrapper.find('.cost-cut__annualised').exists()).toBe(false);

    // ONE methodology line carries BOTH reads.
    const methodology = wrapper.find('.cost-cut__methodology');
    expect(methodology.exists()).toBe(true);
    expect(methodology.text()).toContain('like-for-like to the same 5 months');
    expect(methodology.text()).toContain('Projected full year');
    expect(digits(methodology.text())).toContain('R3100000');
  });

  it('B1 source-order: YoY delta is co-headline weight, and .beh-split renders AFTER the headline hero', async () => {
    // B1: the CMA reads the addressable hero first, then "which way is it moving"
    // (the YoY delta as a CO-HEADLINE, right under the hero value and BEFORE the
    // muted methodology line), then operating leverage (the behaviour bar) THIRD —
    // so .beh-split now sits AFTER .cost-cut__headline in DOM order (it was before).
    const wrapper = mountReport();
    await flushPromises();

    const headline = wrapper.find('.cost-cut__headline');
    const delta = wrapper.find('.cost-cut__delta');
    const methodology = wrapper.find('.cost-cut__methodology');
    const behSplit = wrapper.find('.beh-split');
    expect(headline.exists()).toBe(true);
    expect(delta.exists()).toBe(true);
    expect(methodology.exists()).toBe(true);
    expect(behSplit.exists()).toBe(true);

    // The YoY delta lives INSIDE the headline hero, ahead of the methodology line.
    expect(headline.element.contains(delta.element)).toBe(true);
    expect(
      delta.element.compareDocumentPosition(methodology.element)
        & Node.DOCUMENT_POSITION_FOLLOWING,
      'methodology line should follow the YoY delta',
    ).toBeTruthy();

    // The behaviour split follows the WHOLE headline block (insight #3, below the
    // hero + YoY co-headline) — the load-bearing reorder.
    expect(headline.element.contains(behSplit.element)).toBe(false);
    expect(
      headline.element.compareDocumentPosition(behSplit.element)
        & Node.DOCUMENT_POSITION_FOLLOWING,
      '.beh-split should render AFTER .cost-cut__headline in DOM order',
    ).toBeTruthy();
  });

  it('complete-year fixture: chip is NOT info-toned and the annualised projection is ABSENT', async () => {
    getCostCutReport.mockResolvedValue(makeCompleteYearReport());
    const wrapper = mountReport();
    await flushPromises();

    // Period chip still renders (period_label = "Full year") but neutral, not info.
    const pill = wrapper.find('.cost-cut__period .status-pill');
    expect(pill.exists()).toBe(true);
    expect(pill.text()).toContain('Full year');
    expect(pill.classes()).toContain('status-pill--neutral');
    expect(pill.classes()).not.toContain('status-pill--info');

    // annualised_estimate is null → no projection text anywhere. The methodology
    // line still renders (it carries the comparison basis) but must NOT mention
    // a projection.
    expect(wrapper.text()).not.toContain('Projected full year');
    const methodology = wrapper.find('.cost-cut__methodology');
    expect(methodology.exists()).toBe(true);
    expect(methodology.text()).toContain('full prior year');
    expect(methodology.text()).not.toContain('Projected full year');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// AREA 3 — Grouped, collapsible table
// ════════════════════════════════════════════════════════════════════════════
describe('Area 3 — grouped table', () => {
  it('defaults to grouping by tier in T1→T5 order, with label + hint + count + subtotal + % per header', async () => {
    const wrapper = mountReport();
    await flushPromises();

    const headers = wrapper.findAll('.cc-group__header');
    expect(headers.length).toBe(5);

    const labels = headers.map((h) => h.find('.cc-group__label').text());
    // Act-first order, top-down.
    expect(labels).toEqual([
      'T1 Quick win', 'T2 Behavioural', 'T3 Discretionary', 'T4 Renegotiable', 'T5 Structural',
    ]);

    // First header (T1): hint, count, subtotal, % read all present.
    const t1 = headers[0];
    expect(t1.find('.cc-group__hint').text()).toBe('Stop the leak');
    expect(t1.find('.cc-group__count').text()).toContain('1 account');
    expect(digits(t1.find('.cc-group__subtotal').text())).toBe(rand(420000));
    // 420000 / 1,240,000 = 33.9% of addressable.
    expect(t1.find('.cc-group__pct-num').text()).toContain('33.9%');
    expect(t1.find('.cc-group__pct-num').text().toLowerCase()).toContain('of addressable');
  });

  it('group subtotals sum to addressable_operating_cost on the accounts tab', async () => {
    const wrapper = mountReport();
    await flushPromises();

    // Parse the integer rand amount from each subtotal cell (drop "R", drop the
    // ",00" decimal that en-ZA appends).
    const subtotals = wrapper
      .findAll('.cc-group__subtotal')
      .map((td) => Number(digits(td.text()).replace('R', '').replace(/,\d+$/, '')));
    const sum = subtotals.reduce((s, n) => s + n, 0);
    expect(sum).toBe(1240000); // == addressable_operating_cost
  });

  it('collapse toggle flips aria-expanded and hides (v-show) the leaf rows of that group', async () => {
    const wrapper = mountReport();
    await flushPromises();

    const firstToggle = wrapper.findAll('.cc-group__toggle')[0];
    expect(firstToggle.attributes('aria-expanded')).toBe('true');

    // The T1 leaf (Employee Expenses Tanja) is visible (not display:none).
    const t1Leaf = leafRows(wrapper).find((r) => r.props('row').name === 'Employee Expenses Tanja');
    expect(t1Leaf.attributes('style') || '').not.toContain('display: none');

    await firstToggle.trigger('click');
    await flushPromises();

    // aria-expanded flips; the leaf is still in the DOM but hidden via v-show.
    expect(firstToggle.attributes('aria-expanded')).toBe('false');
    const t1LeafAfter = leafRows(wrapper).find((r) => r.props('row').name === 'Employee Expenses Tanja');
    expect(t1LeafAfter.attributes('style') || '').toContain('display: none');
    // The control points at the body it collapses.
    expect(firstToggle.attributes('aria-controls')).toBeTruthy();
  });

  it('switching Group-by to Behaviour re-buckets into behaviour groups (fixed has 2 leaves)', async () => {
    const wrapper = mountReport();
    await flushPromises();

    await clickGroupBy(wrapper, 'Behaviour');

    const labels = wrapper.findAll('.cc-group__header .cc-group__label').map((l) => l.text());
    // BEHAVIOUR_ORDER: Fixed, Variable, Semi-variable, Non-controllable.
    expect(labels).toEqual(['Fixed', 'Variable', 'Semi-variable', 'Non-controllable']);

    // Fixed bucket = a1 (420000) + a5 (250000) = 670000 over two leaves.
    const fixedHeader = wrapper
      .findAll('.cc-group__header')
      .find((h) => h.find('.cc-group__label').text() === 'Fixed');
    expect(fixedHeader.find('.cc-group__count').text()).toContain('2 accounts');
    expect(digits(fixedHeader.find('.cc-group__subtotal').text())).toBe(rand(670000));
  });

  it('switching Group-by to Account group re-buckets by the account group', async () => {
    const wrapper = mountReport();
    await flushPromises();

    await clickGroupBy(wrapper, 'Account group');

    const labels = wrapper.findAll('.cc-group__header .cc-group__label').map((l) => l.text());
    // Overheads (a1,a3,a5), Direct costs (a2), Expense (a4).
    expect(labels).toContain('Overheads');
    expect(labels).toContain('Direct costs');
    expect(labels).toContain('Expense');

    const overheads = wrapper
      .findAll('.cc-group__header')
      .find((h) => h.find('.cc-group__label').text() === 'Overheads');
    // 420000 + 180000 + 250000 = 850000 over three leaves.
    expect(overheads.find('.cc-group__count').text()).toContain('3 accounts');
    expect(digits(overheads.find('.cc-group__subtotal').text())).toBe(rand(850000));
  });

  it('every leaf carries a tier chip under ANY grouping (TierTag present on each row)', async () => {
    const wrapper = mountReport();
    await flushPromises();

    // Default (tier) grouping.
    expect(leafRows(wrapper).every((r) => r.findComponent(TierTag).exists())).toBe(true);

    // Behaviour grouping — the per-leaf tier chip must still be present.
    await clickGroupBy(wrapper, 'Behaviour');
    const leaves = leafRows(wrapper);
    expect(leaves.length).toBe(5);
    expect(leaves.every((r) => r.findComponent(TierTag).exists())).toBe(true);
  });

  it('behaviour filter narrows WITHIN groups on the accounts tab', async () => {
    const wrapper = mountReport();
    await flushPromises();
    expect(leafRows(wrapper).length).toBe(5);

    await clickBehaviourFilter(wrapper, 'Fixed');
    // Two fixed accounts survive (a1, a5).
    const names = leafNames(wrapper);
    expect(names.sort()).toEqual(['Employee Expenses Tanja', 'Premises Lease']);

    await clickBehaviourFilter(wrapper, 'Variable');
    expect(leafNames(wrapper)).toEqual(['Casual Wages']);

    await clickBehaviourFilter(wrapper, 'All');
    expect(leafRows(wrapper).length).toBe(5);
  });

  it('behaviour filter narrows WITHIN groups on the opportunities tab too', async () => {
    const wrapper = mountReport();
    await flushPromises();

    const oppTab = wrapper.findAll('[role="tab"]').find((t) => t.text() === 'Top cut opportunities');
    await oppTab.trigger('click');
    await flushPromises();
    expect(leafRows(wrapper).length).toBe(2); // Casual Wages (variable), Premises Lease (fixed)

    await clickBehaviourFilter(wrapper, 'Fixed');
    expect(leafNames(wrapper)).toEqual(['Premises Lease']);

    await clickBehaviourFilter(wrapper, 'Variable');
    expect(leafNames(wrapper)).toEqual(['Casual Wages']);
  });

  it('sets aria-pressed on the active group-by chip only', async () => {
    const wrapper = mountReport();
    await flushPromises();

    await clickGroupBy(wrapper, 'Behaviour');
    const chips = wrapper.findAll('[aria-label="Group accounts by"] .cost-cut__chip');
    const pressed = chips.filter((c) => c.attributes('aria-pressed') === 'true');
    expect(pressed.length).toBe(1);
    expect(pressed[0].text()).toBe('Behaviour');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// AREA 4 — Below-the-line section
// ════════════════════════════════════════════════════════════════════════════
describe('Area 4 — below-the-line section', () => {
  it('is collapsed by default and shows the total in the header while collapsed', async () => {
    const wrapper = mountReport();
    await flushPromises();

    const btl = wrapper.findComponent(BelowTheLineSection);
    expect(btl.exists()).toBe(true);

    const toggle = btl.find('.btl__toggle');
    expect(toggle.attributes('aria-expanded')).toBe('false');

    // Total visible in the header even while collapsed.
    expect(digits(btl.find('.btl__total').text())).toContain('R155000');

    // Body hidden (v-show) while collapsed: its rows are not visible.
    const body = btl.find('.btl__body');
    expect(body.attributes('style') || '').toContain('display: none');
  });

  it('expands to list the T0 below-the-line rows, rendered READ-ONLY (no target input, no re-tag select)', async () => {
    const wrapper = mountReport();
    await flushPromises();

    const btl = wrapper.findComponent(BelowTheLineSection);
    await btl.find('.btl__toggle').trigger('click');
    await flushPromises();

    expect(btl.find('.btl__toggle').attributes('aria-expanded')).toBe('true');

    // Both T0 rows listed.
    const text = btl.text();
    expect(text).toContain('Income Tax');
    expect(text).toContain('Finance Costs');

    // READ-ONLY: no target input and no inline re-tag KSelect inside the section.
    expect(btl.findAll('input').length).toBe(0);
    expect(btl.findAllComponents(KSelect).length).toBe(0);
  });

  it('is ABSENT entirely when below_the_line is empty', async () => {
    getCostCutReport.mockResolvedValue(
      makeReport({ below_the_line: [], below_the_line_total: 0 }),
    );
    const wrapper = mountReport();
    await flushPromises();

    expect(wrapper.findComponent(BelowTheLineSection).exists()).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// AREA 5 — Optimistic target edit (same-tick) + background reconcile
// ════════════════════════════════════════════════════════════════════════════
describe('Area 5 — optimistic target edit', () => {
  it('edits the row target + its OWN RAG pill same-tick; rag_counts settle only AFTER the reconcile', async () => {
    // Contract (post-P0 no-client-recompute fix): the optimistic mutation touches
    // ONLY the edited row's own cells (its target + its own `rag` via computeRag).
    // The rag_counts SUMMARY is a cross-row aggregate owned EXCLUSIVELY by the
    // background reconcile — the client does NOT recompute it. So we assert:
    //   • same-tick: the edited row's RAG pill flips (its own cell), AND the
    //     summary pills are UNCHANGED (still the server's pre-edit counts);
    //   • post-reconcile: the summary pills move to the authoritative counts.
    // Hold the reconcile OPEN with an AUTHORITATIVE report whose counts differ, so
    // a regression that re-introduced client recompute (summary changing early)
    // would be caught here.
    let resolveReconcile;
    const authoritative = makeReport({
      rag_counts: { green: 9, amber: 9, red: 9, none: 9 }, // obviously-different
    });
    getCostCutReport
      .mockResolvedValueOnce(makeReport()) // mount load
      .mockImplementationOnce(() => new Promise((r) => { resolveReconcile = r; }));

    const wrapper = mountReport();
    await flushPromises();

    // Before: a3 (Electricity) is green (180000 ≤ 200000). rag_counts.red = 1.
    expect(wrapper.find('.cost-cut__rag-pills').text()).toContain('1 red');

    // Edit a3's target down to 150000 → 180000 > 150000*1.05=157500 → red.
    const a3Input = wrapper.find('input[aria-label="Target for Electricity"]');
    expect(a3Input.exists()).toBe(true);
    await a3Input.setValue('150000');
    await a3Input.trigger('blur');
    // Let the synchronous optimistic mutation + the saveKpiTarget microtask flush,
    // but the reconcile getCostCutReport is held open (unresolved).
    await flushPromises();

    // saveKpiTarget fired; reconcile was kicked off but is still pending.
    expect(saveKpiTarget).toHaveBeenCalledTimes(1);
    expect(getCostCutReport).toHaveBeenCalledTimes(2);
    expect(resolveReconcile).toBeTypeOf('function');

    // OPTIMISTIC, same-tick (reconcile not yet resolved):
    //  - the edited ROW's own RAG pill flipped green → red ("Over").
    const a3Row = leafRows(wrapper).find((r) => r.props('row').name === 'Electricity');
    const a3Pill = a3Row.find('.status-pill');
    expect(a3Pill.classes()).toContain('status-pill--error');
    expect(a3Pill.text()).toContain('Over');
    //  - the cross-row rag_counts SUMMARY is NOT recomputed on the client: it is
    //    still the server's pre-edit counts (1 red / 1 green), NOT a locally
    //    recomputed 2 red / 0 green. This locks the no-client-recompute contract.
    const summaryOptimistic = wrapper.find('.cost-cut__rag-pills').text();
    expect(summaryOptimistic).toContain('1 red');
    expect(summaryOptimistic).toContain('1 green');
    expect(summaryOptimistic).not.toContain('2 red');
    expect(summaryOptimistic).not.toContain('0 green');
    // The table is NOT blanked during reconcile — five leaves still present.
    expect(leafRows(wrapper).length).toBe(5);

    // Now let the reconcile land with the authoritative payload — the summary
    // pills move to the server-authoritative counts ONLY now.
    resolveReconcile(authoritative);
    await flushPromises();
    expect(wrapper.find('.cost-cut__rag-pills').text()).toContain('9 red');
  });

  it('commits the edited target with the right metric_key / value / entity / year', async () => {
    const wrapper = mountReport();
    await flushPromises();

    const input = wrapper.find('input[aria-label="Target for Employee Expenses Tanja"]');
    await input.setValue('350000');
    await input.trigger('blur');
    await flushPromises();

    expect(saveKpiTarget).toHaveBeenCalledTimes(1);
    const payload = saveKpiTarget.mock.calls[0][0];
    expect(payload.metric_key).toBe('cost_cut.account.a1');
    expect(payload.target_value).toBe(350000);
    expect(payload.entity_id).toBe(ENTITY);
    expect(payload.period_year).toBe(2025);
  });

  it('clearing a target that HAS one DELETEs it (no save); a target with NONE is a no-op', async () => {
    const wrapper = mountReport();
    await flushPromises();

    // a1 HAS a target (380000) → clear → DELETE.
    const a1 = wrapper.find('input[aria-label="Target for Employee Expenses Tanja"]');
    await a1.setValue('');
    await a1.trigger('blur');
    await flushPromises();

    expect(saveKpiTarget).not.toHaveBeenCalled();
    expect(deleteKpiTarget).toHaveBeenCalledTimes(1);
    const del = deleteKpiTarget.mock.calls[0][0];
    expect(del.metric_key).toBe('cost_cut.account.a1');
    expect(del.entity).toBe(ENTITY);
    expect(del.year).toBe('2025');

    vi.clearAllMocks();
    getCostCutReport.mockResolvedValue(makeReport());

    // a2 has NO target → clearing it is a no-op (neither save nor delete).
    const a2 = wrapper.find('input[aria-label="Target for Casual Wages"]');
    await a2.setValue('');
    await a2.trigger('blur');
    await flushPromises();
    expect(saveKpiTarget).not.toHaveBeenCalled();
    expect(deleteKpiTarget).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// AREA 6 — Optimistic behaviour & tier re-tag
// ════════════════════════════════════════════════════════════════════════════
describe('Area 6 — optimistic behaviour & tier re-tag', () => {
  it('behaviour re-tag flips the chip + POSTs same-tick; headline split settles only AFTER the reconcile', async () => {
    // Contract (post-P0 no-client-recompute fix): the optimistic mutation flips
    // ONLY the edited row's behaviour chip (a per-row cell). behaviour_totals —
    // and therefore the headline split legend — is a CROSS-ROW aggregate owned
    // EXCLUSIVELY by the background reconcile; the client does NOT recompute it.
    // So the load-bearing same-tick effects are: the chip flip + the
    // saveCostBehaviour POST. The split moves only once the reconcile resolves to
    // the server's behaviour_totals.
    //
    // Hold the reconcile OPEN and resolve it with a server payload whose
    // behaviour_totals REFLECT the re-tag (fixed 250k / variable 720k), so the
    // post-reconcile assertion proves the split followed the SERVER, and the
    // same-tick assertion proves it did NOT move early (no client recompute).
    let resolveReconcile;
    const reconciled = makeReport({
      behaviour_totals: {
        fixed: 250000, variable: 720000, semi_variable: 180000,
        non_controllable: 90000, unclassified: 0,
      },
    });
    getCostCutReport
      .mockResolvedValueOnce(makeReport())
      .mockImplementationOnce(() => new Promise((r) => { resolveReconcile = r; }));

    const wrapper = mountReport();
    await flushPromises();

    // Before: fixed legend amount = R670 000 (a1 420k + a5 250k).
    const fixedLegendBefore = wrapper
      .findAll('.beh-split__legend-item')
      .find((li) => li.text().includes('Fixed'));
    expect(digits(fixedLegendBefore.text())).toContain('R670000');

    // Re-tag a1 (Employee Expenses Tanja) fixed → variable. The behaviour
    // chip-trigger must be CLICKED first (B2) to reveal the select.
    const select = await behaviourSelectFor(wrapper, 'Employee Expenses Tanja');
    expect(select, 'behaviour re-tag KSelect should exist after revealing it').toBeTruthy();
    select.vm.$emit('update:modelValue', 'variable');
    await flushPromises();

    // SAME-TICK, load-bearing: POST fired with {account_key, behaviour};
    // reconcile kicked off (still open).
    expect(saveCostBehaviour).toHaveBeenCalledTimes(1);
    expect(saveCostBehaviour.mock.calls[0][0]).toEqual({
      account_key: 'kl_T1', behaviour: 'variable',
    });
    expect(getCostCutReport).toHaveBeenCalledTimes(2);
    expect(resolveReconcile).toBeTypeOf('function');

    // SAME-TICK, optimistic: a1's chip now reads Variable (its own cell flipped).
    const a1Row = leafRows(wrapper).find((r) => r.props('row').name === 'Employee Expenses Tanja');
    expect(a1Row.findComponent(BehaviourTag).find('.behaviour-tag__label').text()).toBe('Variable');

    // SAME-TICK, no-client-recompute lock: the headline split is a cross-row
    // aggregate — it must NOT move on the optimistic tick. Fixed still reads
    // R670 000 (the server value), NOT a locally recomputed R250 000.
    const fixedLegendOptimistic = wrapper
      .findAll('.beh-split__legend-item')
      .find((li) => li.text().includes('Fixed') && !li.text().includes('Variable'));
    expect(digits(fixedLegendOptimistic.text())).toContain('R670000');
    expect(digits(fixedLegendOptimistic.text())).not.toContain('R250000');

    // Let the reconcile land — the split now follows the SERVER behaviour_totals:
    // fixed R250 000, variable R720 000.
    resolveReconcile(reconciled);
    await flushPromises();

    const fixedLegendAfter = wrapper
      .findAll('.beh-split__legend-item')
      .find((li) => li.text().includes('Fixed') && !li.text().includes('Variable'));
    expect(digits(fixedLegendAfter.text())).toContain('R250000');
    const varLegendAfter = wrapper
      .findAll('.beh-split__legend-item')
      .find((li) => li.text().includes('Variable'));
    expect(digits(varLegendAfter.text())).toContain('R720000');

    expect(toastCalls.success).toHaveBeenCalled();
    expect(toastCalls.success.mock.calls.at(-1)[0]).toContain('Variable');
  });

  it('tier re-tag instantly (before reconcile) updates the tier chip and re-buckets, POSTs {account_key, cuttability}', async () => {
    // Hold the reconcile OPEN so we observe the OPTIMISTIC re-bucket, not the
    // post-reconcile state. (Once the background reconcile resolves it replaces
    // report.value with server-authoritative data — that path is covered by the
    // last-wins test; here we lock the same-tick optimistic re-bucket.)
    let resolveReconcile;
    getCostCutReport
      .mockImplementationOnce(async () => makeReport()) // mount
      .mockImplementationOnce(() => new Promise((r) => { resolveReconcile = r; }));

    const wrapper = mountReport();
    await flushPromises();

    // Re-tag a2 (Casual Wages) from T2 → T1. Click the tier chip-trigger first
    // (B2) to reveal the select.
    const tierSelect = await tierSelectFor(wrapper, 'Casual Wages');
    expect(tierSelect, 'tier re-tag KSelect should exist after revealing it').toBeTruthy();
    tierSelect.vm.$emit('update:modelValue', 'T1');
    await flushPromises();

    expect(saveCostBehaviour).toHaveBeenCalledTimes(1);
    expect(saveCostBehaviour.mock.calls[0][0]).toEqual({
      account_key: 'kl_T2', cuttability: 'T1',
    });
    expect(resolveReconcile).toBeTypeOf('function'); // reconcile kicked off, still pending

    // OPTIMISTIC re-bucket (reconcile not yet resolved): T1 now has 2 accounts
    // (a1 + a2), T2 has 0 → T2 group gone.
    const t1Header = wrapper
      .findAll('.cc-group__header')
      .find((h) => h.find('.cc-group__label').text() === 'T1 Quick win');
    expect(t1Header.find('.cc-group__count').text()).toContain('2 accounts');
    const t2Header = wrapper
      .findAll('.cc-group__header')
      .find((h) => h.find('.cc-group__label').text() === 'T2 Behavioural');
    expect(t2Header).toBeFalsy(); // empty bucket not rendered

    // a2's per-row tier chip now reads T1.
    const a2Row = leafRows(wrapper).find((r) => r.props('row').name === 'Casual Wages');
    expect(a2Row.findComponent(TierTag).find('.tier-tag__label').text()).toBe('T1 Quick win');

    // Let the reconcile land (server-authoritative) so no unhandled promise.
    resolveReconcile(makeReport());
    await flushPromises();
  });

  it('a behaviour re-tag to the SAME value is a no-op (no POST, no reconcile)', async () => {
    const wrapper = mountReport();
    await flushPromises();
    expect(getCostCutReport).toHaveBeenCalledTimes(1);

    const select = await behaviourSelectFor(wrapper, 'Employee Expenses Tanja');
    select.vm.$emit('update:modelValue', 'fixed'); // already fixed
    await flushPromises();

    expect(saveCostBehaviour).not.toHaveBeenCalled();
    expect(getCostCutReport).toHaveBeenCalledTimes(1);
  });

  it('a re-tag on a row MISSING account_key surfaces an error toast and does NOT POST', async () => {
    const rows = addressableRows();
    rows[0].account_key = null; // a1 loses its key
    getCostCutReport.mockResolvedValue(makeReport({ accounts: rows }));
    const wrapper = mountReport();
    await flushPromises();
    expect(getCostCutReport).toHaveBeenCalledTimes(1);

    const select = await behaviourSelectFor(wrapper, 'Employee Expenses Tanja');
    select.vm.$emit('update:modelValue', 'variable');
    await flushPromises();

    expect(saveCostBehaviour).not.toHaveBeenCalled();
    expect(getCostCutReport).toHaveBeenCalledTimes(1);
    expect(toastCalls.error).toHaveBeenCalled();
    expect(toastCalls.error.mock.calls.at(-1)[0].toLowerCase()).toContain('account key');
  });

  it('surfaces an error toast when saveCostBehaviour rejects (and still reconciles to recover)', async () => {
    saveCostBehaviour.mockRejectedValue(new Error('behaviour save failed'));
    const wrapper = mountReport();
    await flushPromises();

    const select = await behaviourSelectFor(wrapper, 'Employee Expenses Tanja');
    select.vm.$emit('update:modelValue', 'variable');
    await flushPromises();

    expect(saveCostBehaviour).toHaveBeenCalledTimes(1);
    expect(toastCalls.error).toHaveBeenCalled();
    expect(toastCalls.success).not.toHaveBeenCalled();
    // The catch path fires a reconcile to pull authoritative state back.
    expect(getCostCutReport).toHaveBeenCalledTimes(2);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// AREA 7 — Reconcile last-wins + same-tick blur+re-tag race (adversarial)
// ════════════════════════════════════════════════════════════════════════════
describe('Area 7 — reconcile race / last-wins', () => {
  it('drops a STALE background reconcile when a newer load (year change) lands first', async () => {
    const freshReport = makeReport({
      year: 2024,
      accounts: [
        {
          account_id: 'fresh1', account_key: 'kl_FRESH', name: 'FRESH Account',
          group: 'OVERHEADS', cuttability: 'T1', is_addressable: true,
          behaviour: 'variable', driver: null,
          recurring_actual: 200000, recurring_prior: 180000,
          yoy_pct: 11.1, pct_of_cost: 100, target: null, rag: 'none',
        },
      ],
      addressable_operating_cost: 200000,
      below_the_line: [], below_the_line_total: 0,
    });
    const staleReport = makeReport({
      accounts: [
        {
          account_id: 'stale1', account_key: 'kl_STALE', name: 'STALE Account',
          group: 'OVERHEADS', cuttability: 'T1', is_addressable: true,
          behaviour: 'fixed', driver: null,
          recurring_actual: 420000, recurring_prior: 471000,
          yoy_pct: -10.8, pct_of_cost: 100, target: null, rag: 'none',
        },
      ],
      addressable_operating_cost: 420000,
    });

    let resolveStaleReconcile;
    getCostCutReport
      .mockResolvedValueOnce(makeReport()) // #1 mount
      .mockImplementationOnce(() => new Promise((r) => { resolveStaleReconcile = r; })) // #2 re-tag reconcile (HELD)
      .mockResolvedValueOnce(freshReport); // #3 year-change load

    const wrapper = mountReport();
    await flushPromises();
    expect(getCostCutReport).toHaveBeenCalledTimes(1);

    // Re-tag → save resolves → reconcile (#2) kicks off and is held open.
    const select = await behaviourSelectFor(wrapper, 'Employee Expenses Tanja');
    select.vm.$emit('update:modelValue', 'variable');
    await flushPromises();
    expect(getCostCutReport).toHaveBeenCalledTimes(2);

    // Newer load via the year KSelect (#3) resolves first → FRESH wins.
    const yearSelect = wrapper.findAllComponents(KSelect).find((c) => c.props('label') === 'Year');
    expect(yearSelect, 'year KSelect should exist').toBeTruthy();
    yearSelect.vm.$emit('update:modelValue', '2024');
    await flushPromises();
    expect(getCostCutReport).toHaveBeenCalledTimes(3);
    expect(leafNames(wrapper)).toContain('FRESH Account');

    // Now resolve the STALE reconcile (#2) — its loadSeq is older → DROPPED.
    resolveStaleReconcile(staleReport);
    await flushPromises();
    expect(leafNames(wrapper)).toContain('FRESH Account');
    expect(leafNames(wrapper)).not.toContain('STALE Account');
  });

  it('a focused target input is NOT clobbered by a background reconcile that lands mid-edit', async () => {
    // Real mechanism: the user is mid-edit in a1's target (focused, typed 355000
    // but NOT blurred). A reconcile fires from committing a DIFFERENT row (a3),
    // and lands a fresh report where a1.target is still 380000 server-side. The
    // reconcile must NOT clobber a1's in-progress draft — CostCutRow's props
    // watch skips re-syncing while the field is focused.
    const wrapper = mountReport();
    await flushPromises();
    expect(getCostCutReport).toHaveBeenCalledTimes(1);

    const a1 = wrapper.find('input[aria-label="Target for Employee Expenses Tanja"]');
    await a1.trigger('focus');
    await a1.setValue('355000'); // typed, not committed (no blur)

    // Commit a3's target → fires saveKpiTarget → background reconcile (#2),
    // which returns the original makeReport() (a1.target still 380000).
    const a3 = wrapper.find('input[aria-label="Target for Electricity"]');
    await a3.setValue('190000');
    await a3.trigger('blur');
    await flushPromises();

    expect(getCostCutReport).toHaveBeenCalledTimes(2); // reconcile ran

    // a1 is still focused → its draft survives, not reset to 380000.
    const a1After = wrapper.find('input[aria-label="Target for Employee Expenses Tanja"]');
    expect(a1After.element.value).toBe('355000');
  });

  it('ADVERSARIAL: a target-blur immediately followed by a behaviour re-tag — BOTH optimistic mutations coexist (pre-reconcile)', async () => {
    // Author is ~80% sure this is clean. The exact same-tick race: commit a
    // target on a1, then immediately re-tag a1's behaviour, BEFORE either
    // background reconcile resolves. The invariant under test: the two handlers
    // (commitTarget / commitBehaviour) mutate DIFFERENT fields of the SAME row
    // object and must not clobber each other, so both optimistic mutations are
    // on screen at once. Both reconciles are held open so we observe the
    // optimistic state deterministically (post-reconcile = server truth, covered
    // by last-wins + the dedicated reconcile tests).
    let resolveReconcileA;
    let resolveReconcileB;
    getCostCutReport
      .mockImplementationOnce(async () => makeReport()) // mount
      .mockImplementationOnce(() => new Promise((r) => { resolveReconcileA = r; })) // target reconcile
      .mockImplementationOnce(() => new Promise((r) => { resolveReconcileB = r; })); // behaviour reconcile

    const wrapper = mountReport();
    await flushPromises();

    // Reveal a1's behaviour select FIRST (the chip-trigger click is a UI-only
    // reveal — no POST, no target-cell change). The target input is a separate
    // cell, unaffected by the behaviour edit-mode toggle.
    const select = await behaviourSelectFor(wrapper, 'Employee Expenses Tanja');
    const input = wrapper.find('input[aria-label="Target for Employee Expenses Tanja"]');

    // 1) Target blur: 420000 actual, set target 500000 → actual ≤ target → green.
    await input.setValue('500000');
    await input.trigger('blur');
    // 2) Without flushing, re-tag behaviour fixed → semi_variable.
    select.vm.$emit('update:modelValue', 'semi_variable');
    await flushPromises();

    // Both writes fired with the right payloads.
    expect(saveKpiTarget).toHaveBeenCalledTimes(1);
    expect(saveKpiTarget.mock.calls[0][0].target_value).toBe(500000);
    expect(saveCostBehaviour).toHaveBeenCalledTimes(1);
    expect(saveCostBehaviour.mock.calls[0][0]).toEqual({
      account_key: 'kl_T1', behaviour: 'semi_variable',
    });
    // Both reconciles were kicked off but are held open.
    expect(resolveReconcileA).toBeTypeOf('function');
    expect(resolveReconcileB).toBeTypeOf('function');

    // OPTIMISTIC DOM reflects BOTH mutations on a1 simultaneously:
    const a1Row = leafRows(wrapper).find((r) => r.props('row').name === 'Employee Expenses Tanja');
    //  - behaviour chip now "Semi"
    expect(a1Row.findComponent(BehaviourTag).find('.behaviour-tag__label').text()).toBe('Semi');
    //  - target RAG now green (On target): 420000 ≤ 500000.
    const pill = a1Row.find('.status-pill');
    expect(pill.classes()).toContain('status-pill--success');
    expect(pill.text()).toContain('On target');
    //  - the optimistic target value is in the row's input.
    expect(a1Row.find('input[aria-label="Target for Employee Expenses Tanja"]').element.value).toBe('500000');

    // Drain the held reconciles so there's no unhandled promise.
    resolveReconcileA(makeReport());
    resolveReconcileB(makeReport());
    await flushPromises();
  });

  it('after a behaviour re-tag, a server-authoritative reconcile REPLACES the optimistic value (last-write = server)', async () => {
    // The flip side of the optimistic path, locking current behaviour: once the
    // background reconcile resolves, report.value is replaced wholesale with the
    // server payload. Here the server reconcile reports a1 as 'variable' (a
    // value distinct from both the original 'fixed' and the optimistic
    // 'semi_variable'), proving the displayed state follows the reconcile, not
    // the optimistic guess, once it lands.
    const serverAfter = makeReport();
    serverAfter.accounts[0].behaviour = 'variable'; // server's truth for a1
    getCostCutReport
      .mockImplementationOnce(async () => makeReport()) // mount
      .mockImplementationOnce(async () => serverAfter); // reconcile

    const wrapper = mountReport();
    await flushPromises();

    const select = await behaviourSelectFor(wrapper, 'Employee Expenses Tanja');
    select.vm.$emit('update:modelValue', 'semi_variable'); // optimistic guess
    await flushPromises(); // let the reconcile fully land

    const a1Row = leafRows(wrapper).find((r) => r.props('row').name === 'Employee Expenses Tanja');
    // Displayed value follows the server reconcile ('Variable'), not the
    // optimistic 'Semi'.
    expect(a1Row.findComponent(BehaviourTag).find('.behaviour-tag__label').text()).toBe('Variable');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// AREA 8 — T0 / unclassified handling
// ════════════════════════════════════════════════════════════════════════════
describe('Area 8 — T0 / unclassified exclusion + unexpected-tier bucketing', () => {
  it('a T0 row in accounts[] is excluded from the addressable groups + headline', async () => {
    // Inject an extra T0 row INTO accounts[] (not just below_the_line). It must
    // not appear among the addressable leaves nor inflate the headline.
    const rows = [
      ...addressableRows(),
      {
        account_id: 'sneaky', account_key: 'kl_SNEAK', name: 'Sneaky Tax Row',
        group: 'EXPENSE', cuttability: 'T0', is_addressable: true, // T0 wins regardless of flag
        behaviour: 'non_controllable', driver: null,
        recurring_actual: 999999, recurring_prior: 0,
        yoy_pct: 0, pct_of_cost: 0, target: null, rag: 'none',
      },
    ];
    getCostCutReport.mockResolvedValue(makeReport({ accounts: rows }));
    const wrapper = mountReport();
    await flushPromises();

    // Still only the five real addressable leaves; the T0 row is excluded.
    expect(leafRows(wrapper).length).toBe(5);
    expect(leafNames(wrapper)).not.toContain('Sneaky Tax Row');
    // Headline value remains the addressable_operating_cost (1 240 000), not inflated.
    expect(digits(wrapper.find('.cost-cut__addressable-tile .metric-tile__value').text())).toBe(rand(1240000));
  });

  it('a row MISSING cuttability (→ normalises to T0) is excluded from the addressable table', async () => {
    const rows = [
      ...addressableRows(),
      {
        account_id: 'nocut', account_key: 'kl_NOCUT', name: 'No Tier Row',
        group: 'EXPENSE', is_addressable: true, // cuttability omitted → T0
        behaviour: 'variable', driver: null,
        recurring_actual: 50000, recurring_prior: 50000,
        yoy_pct: 0, pct_of_cost: 4, target: null, rag: 'none',
      },
    ];
    getCostCutReport.mockResolvedValue(makeReport({ accounts: rows }));
    const wrapper = mountReport();
    await flushPromises();

    expect(leafRows(wrapper).length).toBe(5);
    expect(leafNames(wrapper)).not.toContain('No Tier Row');
  });

  it('an is_addressable:false row is excluded even if it carries a real tier', async () => {
    const rows = [
      ...addressableRows(),
      {
        account_id: 'flagged', account_key: 'kl_FLAG', name: 'Flagged Out Row',
        group: 'OVERHEADS', cuttability: 'T2', is_addressable: false, // explicit exclusion
        behaviour: 'variable', driver: null,
        recurring_actual: 70000, recurring_prior: 70000,
        yoy_pct: 0, pct_of_cost: 5, target: null, rag: 'none',
      },
    ];
    getCostCutReport.mockResolvedValue(makeReport({ accounts: rows }));
    const wrapper = mountReport();
    await flushPromises();

    expect(leafRows(wrapper).length).toBe(5);
    expect(leafNames(wrapper)).not.toContain('Flagged Out Row');
  });

  it('CostCutGroupTable (in isolation): an UNEXPECTED tier value still gets a bucket, not dropped', async () => {
    // The grouping engine must never silently drop a row whose tier is off-list.
    // normaliseTier('T9') → 'T0' (a defensive bucket appended after T1..T5).
    // NOTE: this exercises the TABLE directly — at the full-report level such a
    // row is filtered out upstream by isAddressableRow (covered above); the
    // table's own contract is "bucket, never drop".
    const rows = [
      { ...addressableRows()[0] }, // T1
      {
        account_id: 'weird', account_key: 'kl_WEIRD', name: 'Weird Tier Row',
        group: 'OVERHEADS', cuttability: 'T9', is_addressable: true,
        behaviour: 'fixed', driver: null,
        recurring_actual: 12345, recurring_prior: 12000,
        yoy_pct: 2.9, pct_of_cost: 1, target: null, rag: 'none',
      },
    ];
    const fmt = (v) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(Number(v) || 0);
    const wrapper = mount(CostCutGroupTable, {
      props: { rows, groupBy: 'tier', addressable: 432345, formatCurrency: fmt },
    });

    // Both rows present — nothing dropped.
    expect(wrapper.findAllComponents(CostCutRow).length).toBe(2);
    const names = wrapper.findAllComponents(CostCutRow).map((r) => r.props('row').name);
    expect(names).toContain('Weird Tier Row');

    // The off-list tier lands in the T0 (below-the-line sentinel) bucket header.
    const labels = wrapper.findAll('.cc-group__header .cc-group__label').map((l) => l.text());
    expect(labels).toContain('T0 Below the line');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// CostCutRow — per-row chip behaviours (mounted directly, still mount-based)
// ════════════════════════════════════════════════════════════════════════════
describe('CostCutRow — per-row behaviour + tier chips', () => {
  const fmt = (v) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(Number(v) || 0);

  function mountRow(rowOverrides = {}, extraProps = {}) {
    const row = {
      account_id: 'x1', account_key: 'kl_X1', name: 'Test Account',
      group: 'OVERHEADS', cuttability: 'T1', behaviour: 'fixed',
      driver: 'headcount (salaried)',
      recurring_actual: 100000, recurring_prior: 90000,
      yoy_pct: 11.1, pct_of_cost: 5, target: null, rag: 'none',
      ...rowOverrides,
    };
    return mount(CostCutRow, { props: { row, formatCurrency: fmt, ...extraProps } });
  }

  it('renders the correct short behaviour label + categorical class for each behaviour', () => {
    const cases = [
      { behaviour: 'fixed', short: 'Fixed', cls: 'behaviour-tag--fixed' },
      { behaviour: 'variable', short: 'Variable', cls: 'behaviour-tag--variable' },
      { behaviour: 'semi_variable', short: 'Semi', cls: 'behaviour-tag--semi_variable' },
      { behaviour: 'non_controllable', short: 'Non-ctrl', cls: 'behaviour-tag--non_controllable' },
    ];
    for (const c of cases) {
      const wrapper = mountRow({ behaviour: c.behaviour, driver: null });
      const chip = wrapper.find('.behaviour-tag');
      expect(chip.classes()).toContain(c.cls);
      expect(chip.find('.behaviour-tag__label').text()).toBe(c.short);
      wrapper.unmount();
    }
  });

  it('shows "Unclassified" (not a crash) for unknown / missing behaviour', () => {
    for (const behaviour of ['made_up_value', undefined]) {
      const wrapper = mountRow({ behaviour, driver: null });
      const chip = wrapper.find('.behaviour-tag');
      expect(chip.classes()).toContain('behaviour-tag--unclassified');
      expect(chip.find('.behaviour-tag__label').text()).toBe('Unclassified');
      wrapper.unmount();
    }
  });

  it('renders the correct tier chip for each T1..T5 and a T0 sentinel for unknown', () => {
    const cases = [
      { cuttability: 'T1', cls: 'tier-tag--t1', label: 'T1 Quick win' },
      { cuttability: 'T5', cls: 'tier-tag--t5', label: 'T5 Structural' },
      { cuttability: 'NONSENSE', cls: 'tier-tag--t0', label: 'T0 Below the line' },
    ];
    for (const c of cases) {
      const wrapper = mountRow({ cuttability: c.cuttability });
      const tier = wrapper.find('.tier-tag');
      expect(tier.classes()).toContain(c.cls);
      expect(tier.find('.tier-tag__label').text()).toBe(c.label);
      wrapper.unmount();
    }
  });

  it('renders the driver as subtext AND chip title when present, omits subtext when absent', () => {
    const withDriver = mountRow({ behaviour: 'fixed', driver: 'headcount (salaried)' });
    expect(withDriver.find('.cost-cut-row__driver').text()).toBe('headcount (salaried)');
    expect(withDriver.find('.behaviour-tag').attributes('title')).toBe('Fixed — driver: headcount (salaried)');

    const noDriver = mountRow({ behaviour: 'variable', driver: null });
    expect(noDriver.find('.cost-cut-row__driver').exists()).toBe(false);
  });

  it('read-only rows render no target input and no re-tag selects', () => {
    const wrapper = mountRow({ cuttability: 'T0', behaviour: 'non_controllable' }, { readOnly: true });
    expect(wrapper.findAll('input').length).toBe(0);
    expect(wrapper.findAllComponents(KSelect).length).toBe(0);
    // A muted reason replaces the RAG pill.
    expect(wrapper.find('.cost-cut-row__reason').exists()).toBe(true);
    expect(wrapper.find('.status-pill').exists()).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// CostBehaviourBar — headline split (mounted through the report)
// ════════════════════════════════════════════════════════════════════════════
describe('CostBehaviourBar — headline split', () => {
  it('renders four proportional segments + a legend with ZAR/% and the operating-leverage reads', async () => {
    const wrapper = mountReport();
    await flushPromises();

    const bar = wrapper.find('.beh-split__bar');
    expect(bar.exists()).toBe(true);

    const segs = wrapper.findAll('.beh-split__seg');
    expect(segs.length).toBe(4);

    // Widths use total_recurring_cost (1 395 000) as the denominator:
    //  fixed 670000/1395000 = 48.0%, variable 300000/1395000 = 21.5%.
    expect(wrapper.find('.beh-split__seg--fixed').attributes('style')).toContain('width: 48.0');
    expect(wrapper.find('.beh-split__seg--variable').attributes('style')).toContain('width: 21.5');

    const splitText = wrapper.find('.beh-split').text();
    expect(digits(splitText)).toContain('R670000'); // fixed legend
    expect(digits(splitText)).toContain('R300000'); // variable legend
    // Fixed:Variable ratio + addressable read.
    expect(splitText).toContain('2.23 : 1');
    // addressable_base 1 150 000 / 1 395 000 = 82.4% → 82% addressable.
    expect(splitText).toContain('82% addressable');
  });

  it('hides the headline split when behaviour_totals are all zero / absent', async () => {
    getCostCutReport.mockResolvedValue(
      makeReport({
        behaviour_totals: { fixed: 0, variable: 0, semi_variable: 0, non_controllable: 0, unclassified: 0 },
        addressable_base: 0, fixed_variable_ratio: null,
      }),
    );
    const wrapper = mountReport();
    await flushPromises();

    expect(leafRows(wrapper).length).toBe(5); // report still loaded
    expect(wrapper.find('.beh-split').exists()).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// B2 — chip-as-trigger affordance (resting → reveal → collapse; contract intact)
// ════════════════════════════════════════════════════════════════════════════
describe('B2 — chip-as-trigger affordance', () => {
  it('resting state: each editable row shows BOTH chip-triggers as activate-to-edit buttons (NO KSelect yet)', async () => {
    const wrapper = mountReport();
    await flushPromises();

    // No re-tag KSelect anywhere at rest (only the Entity + Year header selects,
    // which are NOT inside a CostCutRow). The select is revealed on intent only.
    const a1 = rowByName(wrapper, 'Employee Expenses Tanja');
    expect(a1.findAllComponents(KSelect).length).toBe(0);

    // Post the P1 fix the chip-triggers are activate-to-edit BUTTONS, not
    // disclosures — they carry NO aria-expanded. Assert instead that each resting
    // trigger is a real <button> on the chip-trigger class carrying its
    // descriptive accessible-name (the "Activate to change." handle).
    const triggers = a1.findAll('.cost-cut-row__chip-trigger');
    expect(triggers.length).toBe(2); // one behaviour, one tier
    expect(triggers.every((t) => t.element.tagName === 'BUTTON')).toBe(true);
    expect(triggers.every((t) => t.attributes('aria-expanded') === undefined)).toBe(true);
    const labels = triggers.map((t) => t.attributes('aria-label') || '');
    expect(labels.some((l) => l.startsWith('Cost behaviour:') && l.includes('Activate to change.'))).toBe(true);
    expect(labels.some((l) => l.startsWith('Cuttability tier:') && l.includes('Activate to change.'))).toBe(true);

    // The chips read the row's CURRENT value (the trigger wraps the live tag).
    expect(a1.findComponent(BehaviourTag).find('.behaviour-tag__label').text()).toBe('Fixed');
    expect(a1.findComponent(TierTag).find('.tier-tag__label').text()).toBe('T1 Quick win');
  });

  it('clicking the behaviour chip-trigger reveals its KSelect; committing collapses back to the chip', async () => {
    // Hold the reconcile OPEN so the OPTIMISTIC flip is observable — otherwise a
    // resolved reconcile (default makeReport(), where a1 is still 'fixed')
    // overwrites the optimistic 'variable' wholesale (the documented last-write =
    // server path, covered separately in Area 7).
    let resolveReconcile;
    getCostCutReport
      .mockResolvedValueOnce(makeReport())
      .mockImplementationOnce(() => new Promise((r) => { resolveReconcile = r; }));

    const wrapper = mountReport();
    await flushPromises();

    // Reveal — the helper clicks the chip-trigger and returns the revealed select.
    const select = await behaviourSelectFor(wrapper, 'Employee Expenses Tanja');
    expect(select, 'behaviour KSelect should be revealed after the chip click').toBeTruthy();

    // While editing, the row shows the select (not the resting BehaviourTag chip).
    const a1Editing = rowByName(wrapper, 'Employee Expenses Tanja');
    expect(a1Editing.findComponent(BehaviourTag).exists()).toBe(false);

    // Commit → the parent owns the optimistic flip + POST; the row collapses back
    // to the chip (KSelect gone, BehaviourTag back, reading the optimistic value).
    select.vm.$emit('update:modelValue', 'variable');
    await flushPromises();

    const a1After = rowByName(wrapper, 'Employee Expenses Tanja');
    expect(a1After.findAllComponents(KSelect).length).toBe(0);
    expect(a1After.findComponent(BehaviourTag).find('.behaviour-tag__label').text()).toBe('Variable');
    // The activate-to-edit chip-trigger is back (the select collapsed on commit).
    // It carries no aria-expanded — assert it's the real button with its handle.
    const behTrigger = a1After
      .findAll('.cost-cut-row__chip-trigger')
      .find((t) => (t.attributes('aria-label') || '').startsWith('Cost behaviour:'));
    expect(behTrigger).toBeTruthy();
    expect(behTrigger.element.tagName).toBe('BUTTON');

    // Drain the held reconcile.
    resolveReconcile(makeReport());
    await flushPromises();
  });

  it('the chip-as-trigger contract is unchanged: reveal+commit still fires the optimistic flip AND the saveCostBehaviour POST identically', async () => {
    // B2 changed only the AFFORDANCE (the select hides behind a chip). The
    // optimistic-flip-then-POST contract is byte-for-byte the same: same payload
    // shape {account_key, cuttability}, same optimistic chip flip, same success
    // toast. This guards that the chip wrapper didn't quietly alter the contract.
    // Hold the reconcile OPEN so the optimistic flip is observable (a resolved
    // default reconcile would restore a2 to T2 — last-write = server).
    let resolveReconcile;
    getCostCutReport
      .mockResolvedValueOnce(makeReport())
      .mockImplementationOnce(() => new Promise((r) => { resolveReconcile = r; }));

    const wrapper = mountReport();
    await flushPromises();

    const select = await tierSelectFor(wrapper, 'Casual Wages');
    select.vm.$emit('update:modelValue', 'T1');
    await flushPromises();

    expect(saveCostBehaviour).toHaveBeenCalledTimes(1);
    expect(saveCostBehaviour.mock.calls[0][0]).toEqual({ account_key: 'kl_T2', cuttability: 'T1' });
    // Optimistic tier flip on the row's own chip (reconcile still held).
    const a2 = rowByName(wrapper, 'Casual Wages');
    expect(a2.findComponent(TierTag).find('.tier-tag__label').text()).toBe('T1 Quick win');
    expect(toastCalls.success).toHaveBeenCalled();

    resolveReconcile(makeReport());
    await flushPromises();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// B2 — deferred focusout collapse (REGRESSION: a null relatedTarget must NOT
// collapse an OPEN editor; a genuine focus-move outside MUST collapse it)
// ════════════════════════════════════════════════════════════════════════════
//
// This is the exact bug-class the whole pass exists to avoid. The original chip-
// as-trigger collapse decided SYNCHRONOUSLY on event.relatedTarget — "relatedTarget
// === null → collapse". But Reka focuses the (portal-teleported) dropdown item
// ASYNCHRONOUSLY after popper positioning, and on programmatic / cross-portal focus
// moves the browser frequently reports relatedTarget === null even while focus is
// landing inside the dropdown. So the synchronous null→collapse path snapped the
// editor shut the instant the dropdown opened (can't-select / flicker).
//
// The P1 fix replaced that with a DEFERRED (requestAnimationFrame, setTimeout(0)
// fallback) re-read of document.activeElement: collapse ONLY when, after focus has
// settled, the active element is NEITHER inside the cell wrapper NOR inside an OPEN
// `.kselect-content` panel (and the trigger isn't still data-state="open").
//
// These mount CostCutRow directly (the deferred collapse lives entirely in the row),
// attached to the document so focus + the trigger's data-state behave realistically.
// We drive the deferred path EXPLICITLY with fake timers + advanceTimersToNextFrame()
// so the test exercises the rAF-scheduled re-check rather than incidentally relying
// on happy-dom's microtask scheduling of rAF. (Sanity: under the OLD synchronous
// `if (!next) return true` collapse, the null-relatedTarget case below would collapse
// the editor BEFORE any activeElement re-check — so this test would fail, which is
// exactly the regression it guards.)
describe('B2 — deferred focusout collapse (relatedTarget=null safety)', () => {
  const fmt = (v) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(Number(v) || 0);

  function mountRowAttached(rowOverrides = {}) {
    const row = {
      account_id: 'x1', account_key: 'kl_X1', name: 'Test Account',
      group: 'OVERHEADS', cuttability: 'T1', behaviour: 'fixed',
      driver: 'headcount (salaried)',
      recurring_actual: 100000, recurring_prior: 90000,
      yoy_pct: 11.1, pct_of_cost: 5, target: null, rag: 'none',
      ...rowOverrides,
    };
    // attachTo a real node so .focus() moves document.activeElement and the
    // KSelect trigger gets a live data-state (both load-bearing for the fix).
    return mount(CostCutRow, { props: { row, formatCurrency: fmt }, attachTo: document.body });
  }

  // Reveal the behaviour axis's KSelect by clicking its chip-trigger. Returns the
  // cell wrapper (.cost-cut-row__behaviour-top) that owns the @focusout listener.
  async function revealBehaviour(wrapper) {
    const trigger = wrapper
      .findAll('.cost-cut-row__chip-trigger')
      .find((b) => (b.attributes('aria-label') || '').startsWith('Cost behaviour:'));
    expect(trigger, 'behaviour chip-trigger should exist at rest').toBeTruthy();
    await trigger.trigger('click');
    await flushPromises(); // nextTick → focusSelectTrigger lands focus on the trigger
    return wrapper.find('.cost-cut-row__behaviour-top');
  }

  // Flush the DEFERRED collapse check: advance to the next animation frame (the
  // rAF the fix schedules), then drain microtasks so the resulting reactive
  // unmount/render settles. This is the deterministic flush idiom for the fix.
  async function flushDeferredCollapse() {
    vi.advanceTimersToNextFrame();
    await flushPromises();
  }

  it('a focusout with relatedTarget=null while focus is still in the editing region does NOT collapse the open editor', async () => {
    vi.useFakeTimers();
    try {
      const wrapper = mountRowAttached();
      const cell = await revealBehaviour(wrapper);

      // The select is open; focus is on its trigger (inside the cell) — the exact
      // state the dropdown opens in. Reka's trigger reads data-state="closed" under
      // happy-dom (the portal panel can't truly open), so the fix's collapse decision
      // falls through to the activeElement re-check — precisely the path we want.
      expect(wrapper.findAllComponents(KSelect).length).toBe(1);

      // Fire the cross-portal/programmatic focus move the old code mis-read:
      // relatedTarget === null. The DEFERRED re-check must see activeElement still
      // inside the cell (the trigger) and STAY OPEN.
      await cell.trigger('focusout', { relatedTarget: null });
      await flushDeferredCollapse();

      // Editor STILL open — a null relatedTarget alone did NOT collapse it.
      expect(wrapper.findAllComponents(KSelect).length).toBe(1);
      // And the resting chip-trigger has NOT come back (we're still editing).
      const stillEditing = wrapper
        .findAll('.cost-cut-row__chip-trigger')
        .some((b) => (b.attributes('aria-label') || '').startsWith('Cost behaviour:'));
      expect(stillEditing).toBe(false);

      wrapper.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a focusout where focus genuinely moved OUTSIDE the cell (and outside any .kselect-content) collapses the editor back to the chip', async () => {
    vi.useFakeTimers();
    // A real element outside the row, focused so document.activeElement lands on
    // it — neither inside the cell nor inside a .kselect-content panel.
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    try {
      const wrapper = mountRowAttached();
      const cell = await revealBehaviour(wrapper);
      expect(wrapper.findAllComponents(KSelect).length).toBe(1);

      // Move focus genuinely outside, then fire focusout (relatedTarget = that
      // outside element) and flush the deferred check.
      outside.focus();
      await cell.trigger('focusout', { relatedTarget: outside });
      await flushDeferredCollapse();

      // Editor collapsed: the KSelect is gone and the activate-to-edit chip-trigger
      // is back (reading the row's current value).
      expect(wrapper.findAllComponents(KSelect).length).toBe(0);
      const behTrigger = wrapper
        .findAll('.cost-cut-row__chip-trigger')
        .find((b) => (b.attributes('aria-label') || '').startsWith('Cost behaviour:'));
      expect(behTrigger, 'chip-trigger should be restored after collapse').toBeTruthy();
      expect(behTrigger.element.tagName).toBe('BUTTON');
      expect(wrapper.findComponent(BehaviourTag).find('.behaviour-tag__label').text()).toBe('Fixed');

      wrapper.unmount();
    } finally {
      outside.remove();
      vi.useRealTimers();
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// AREA 9 — Manageable cost (group-by, filter, star toggle, no-client-recompute)
// ════════════════════════════════════════════════════════════════════════════
describe('Area 9 — manageable group-by', () => {
  it('Group-by "Manageable cost" buckets into "Manageable — top opportunities" (FIRST) then "Not manageable", with right counts + subtotals', async () => {
    const wrapper = mountReport();
    await flushPromises();

    await clickGroupBy(wrapper, 'Manageable cost');

    const headers = wrapper.findAll('.cc-group__header');
    expect(headers.length).toBe(2);

    const labels = headers.map((h) => h.find('.cc-group__label').text());
    // is_manageable === true bucket FIRST (the user's shortlist to act on).
    expect(labels).toEqual(['Manageable — top opportunities', 'Not manageable']);

    // Manageable bucket = a1 (420000) + a2 (300000) + a3 (180000) = 900000 / 3.
    const yes = headers[0];
    expect(yes.find('.cc-group__hint').text()).toBe('Your shortlist to act on');
    expect(yes.find('.cc-group__count').text()).toContain('3 accounts');
    expect(digits(yes.find('.cc-group__subtotal').text())).toBe(rand(900000));

    // Not-manageable bucket = a4 (90000) + a5 (250000) = 340000 / 2.
    const no = headers[1];
    expect(no.find('.cc-group__count').text()).toContain('2 accounts');
    expect(digits(no.find('.cc-group__subtotal').text())).toBe(rand(340000));

    // All five leaves still present (just re-bucketed), nothing dropped.
    expect(leafRows(wrapper).length).toBe(5);
  });
});

describe('Area 9 — manageable filter', () => {
  it('the "Manageable" filter chip narrows to is_manageable===true rows; "All" restores', async () => {
    const wrapper = mountReport();
    await flushPromises();
    expect(leafRows(wrapper).length).toBe(5);

    await clickManageableFilter(wrapper, 'Manageable');
    // Only the three manageable accounts survive (a1, a2, a3).
    expect(leafNames(wrapper).sort()).toEqual(['Casual Wages', 'Electricity', 'Employee Expenses Tanja']);

    await clickManageableFilter(wrapper, 'All');
    expect(leafRows(wrapper).length).toBe(5);
  });

  it('the Manageable filter composes (AND) with the behaviour filter', async () => {
    const wrapper = mountReport();
    await flushPromises();

    // Manageable ∩ Fixed: a1 (fixed, manageable) survives; a5 (fixed) is NOT
    // manageable so it's filtered out; a2/a3 (manageable) are not fixed.
    await clickManageableFilter(wrapper, 'Manageable');
    await clickBehaviourFilter(wrapper, 'Fixed');
    expect(leafNames(wrapper)).toEqual(['Employee Expenses Tanja']);

    // Manageable ∩ Variable: only a2 (variable + manageable).
    await clickBehaviourFilter(wrapper, 'Variable');
    expect(leafNames(wrapper)).toEqual(['Casual Wages']);

    // Manageable ∩ Non-controllable: a4 is non-controllable but NOT manageable →
    // empty intersection → the "no matching accounts" empty state, zero leaves.
    await clickBehaviourFilter(wrapper, 'Non-controllable');
    expect(leafRows(wrapper).length).toBe(0);

    // Drop the behaviour filter back to All → the three manageable rows return.
    await clickBehaviourFilter(wrapper, 'All');
    expect(leafNames(wrapper).sort()).toEqual(['Casual Wages', 'Electricity', 'Employee Expenses Tanja']);
  });

  it('sets aria-pressed on the active manageable chip only', async () => {
    const wrapper = mountReport();
    await flushPromises();

    await clickManageableFilter(wrapper, 'Manageable');
    const chips = wrapper.findAll('[aria-label="Filter by manageable"] .cost-cut__chip');
    const pressed = chips.filter((c) => c.attributes('aria-pressed') === 'true');
    expect(pressed.length).toBe(1);
    expect(pressed[0].text()).toBe('Manageable');
  });
});

describe('Area 9 — manageable star toggle (optimistic flip + no-client-recompute)', () => {
  it('flips row.is_manageable same-tick, re-buckets under manageable grouping, and POSTs {account_key, is_manageable: !current}; the manageable_total headline stat does NOT recompute client-side (settles only after reconcile)', async () => {
    // Mirror of the Area-6 behaviour-totals no-client-recompute pattern. The
    // optimistic mutation flips ONLY this row's is_manageable cell (its star +
    // its bucket). manageable_total is a CROSS-ROW server aggregate the reconcile
    // owns EXCLUSIVELY — the client never recomputes it. Hold the reconcile OPEN
    // with a payload whose manageable_total differs, so an early move (a regressed
    // client recompute) is caught.
    let resolveReconcile;
    const reconciled = makeReport({ manageable_total: 990000 }); // server's post-toggle truth (900k + a4 90k)
    getCostCutReport
      .mockResolvedValueOnce(makeReport())
      .mockImplementationOnce(() => new Promise((r) => { resolveReconcile = r; }));

    const wrapper = mountReport();
    await flushPromises();

    // Default tier grouping. Before: the headline manageable stat reads R900 000.
    expect(digits(manageableStat(wrapper).find('.cost-cut__secondary-value').text())).toContain('R900000');

    // a4 (Statutory Levies, T4) starts NOT manageable.
    const a4Star = manageableStarFor(wrapper, 'Statutory Levies');
    expect(a4Star, 'a4 manageable star should exist').toBeTruthy();
    expect(a4Star.attributes('aria-checked')).toBe('false');

    await a4Star.trigger('click');
    await flushPromises();

    // SAME-TICK, load-bearing: POST fired with the FLIPPED value, reconcile open.
    expect(saveCostBehaviour).toHaveBeenCalledTimes(1);
    expect(saveCostBehaviour.mock.calls[0][0]).toEqual({ account_key: 'kl_T4', is_manageable: true });
    expect(getCostCutReport).toHaveBeenCalledTimes(2);
    expect(resolveReconcile).toBeTypeOf('function');

    // SAME-TICK, optimistic: a4's own star flipped on.
    expect(manageableStarFor(wrapper, 'Statutory Levies').attributes('aria-checked')).toBe('true');

    // SAME-TICK re-bucket under MANAGEABLE grouping: a4 now joins the "Manageable"
    // bucket (4 accounts), "Not manageable" drops to 1 (a5 only).
    await clickGroupBy(wrapper, 'Manageable cost');
    const headers = wrapper.findAll('.cc-group__header');
    const yes = headers.find((h) => h.find('.cc-group__label').text() === 'Manageable — top opportunities');
    const no = headers.find((h) => h.find('.cc-group__label').text() === 'Not manageable');
    expect(yes.find('.cc-group__count').text()).toContain('4 accounts');
    expect(no.find('.cc-group__count').text()).toContain('1 account');

    // SAME-TICK no-client-recompute LOCK: the manageable_total headline stat is a
    // cross-row aggregate — it must STILL read the server's R900 000, NOT a
    // locally recomputed R990 000, while the reconcile is held open.
    expect(digits(manageableStat(wrapper).find('.cost-cut__secondary-value').text())).toContain('R900000');
    expect(digits(manageableStat(wrapper).find('.cost-cut__secondary-value').text())).not.toContain('R990000');

    // Let the reconcile land — the headline stat NOW settles to the server value.
    resolveReconcile(reconciled);
    await flushPromises();
    expect(digits(manageableStat(wrapper).find('.cost-cut__secondary-value').text())).toContain('R990000');

    expect(toastCalls.success).toHaveBeenCalled();
    expect(toastCalls.success.mock.calls.at(-1)[0].toLowerCase()).toContain('manageable');
  });

  it('un-starring a manageable row POSTs is_manageable:false (the !current flip)', async () => {
    // Hold the reconcile OPEN so the optimistic OFF flip is observable (a resolved
    // default reconcile restores a1 to manageable — last-write = server).
    let resolveReconcile;
    getCostCutReport
      .mockResolvedValueOnce(makeReport())
      .mockImplementationOnce(() => new Promise((r) => { resolveReconcile = r; }));

    const wrapper = mountReport();
    await flushPromises();

    // a1 (Employee Expenses Tanja, T1) starts manageable.
    const a1Star = manageableStarFor(wrapper, 'Employee Expenses Tanja');
    expect(a1Star.attributes('aria-checked')).toBe('true');

    await a1Star.trigger('click');
    await flushPromises();

    expect(saveCostBehaviour).toHaveBeenCalledTimes(1);
    expect(saveCostBehaviour.mock.calls[0][0]).toEqual({ account_key: 'kl_T1', is_manageable: false });
    // Optimistic flip off (reconcile still held).
    expect(manageableStarFor(wrapper, 'Employee Expenses Tanja').attributes('aria-checked')).toBe('false');

    resolveReconcile(makeReport());
    await flushPromises();
  });

  it('a manageable toggle on a row MISSING account_key surfaces an error toast and does NOT POST', async () => {
    const rows = addressableRows();
    rows[3].account_key = null; // a4 (currently not-manageable) loses its key
    getCostCutReport.mockResolvedValue(makeReport({ accounts: rows }));
    const wrapper = mountReport();
    await flushPromises();
    expect(getCostCutReport).toHaveBeenCalledTimes(1);

    const a4Star = manageableStarFor(wrapper, 'Statutory Levies');
    await a4Star.trigger('click');
    await flushPromises();

    expect(saveCostBehaviour).not.toHaveBeenCalled();
    expect(getCostCutReport).toHaveBeenCalledTimes(1); // no reconcile either
    expect(toastCalls.error).toHaveBeenCalled();
    expect(toastCalls.error.mock.calls.at(-1)[0].toLowerCase()).toContain('manageable');
  });

  it('a below-the-line (T0) row renders NO star — only the five addressable rows get one', async () => {
    const wrapper = mountReport();
    await flushPromises();

    // Expand the below-the-line section so its rows are in the DOM (and visible).
    const btl = wrapper.findComponent(BelowTheLineSection);
    await btl.find('.btl__toggle').trigger('click');
    await flushPromises();

    // Income Tax / Finance Costs are listed but carry no role="switch" star.
    expect(btl.text()).toContain('Income Tax');
    expect(btl.findAll('button[role="switch"]').length).toBe(0);

    // Exactly five stars across the whole report — one per addressable leaf.
    expect(wrapper.findAll('button[role="switch"]').length).toBe(5);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// B-polish — "% of addr." leaf header + collapsible "Reading this table" legend
// ════════════════════════════════════════════════════════════════════════════
describe('B-polish — % of addressable header + legend collapse', () => {
  it('the leaf column header reads "% of addr." (share of addressable), not "% of cost"', async () => {
    const wrapper = mountReport();
    await flushPromises();

    const headerTexts = wrapper.findAll('.cc-group-table thead th').map((th) => th.text());
    expect(headerTexts).toContain('% of addr.');
    expect(headerTexts).not.toContain('% of cost');
  });

  it('the "Reading this table" legend is collapsed by default (aria-expanded=false, body hidden) and expands on click', async () => {
    const wrapper = mountReport();
    await flushPromises();

    const toggle = wrapper.find('.cost-cut__legend-toggle');
    expect(toggle.exists()).toBe(true);
    expect(toggle.text()).toContain('Reading this table');
    expect(toggle.attributes('aria-expanded')).toBe('false');

    // Body present in the DOM but hidden via v-show while collapsed.
    const body = wrapper.find('.cost-cut__legend-body');
    expect(body.exists()).toBe(true);
    expect(body.attributes('style') || '').toContain('display: none');
    // The toggle controls the body it collapses.
    expect(toggle.attributes('aria-controls')).toBe(body.attributes('id'));

    await toggle.trigger('click');
    await flushPromises();

    expect(wrapper.find('.cost-cut__legend-toggle').attributes('aria-expanded')).toBe('true');
    expect(wrapper.find('.cost-cut__legend-body').attributes('style') || '').not.toContain('display: none');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// saveCostBehaviour API wrapper (supplementary, library-direct — the ONE allowed)
// ════════════════════════════════════════════════════════════════════════════
describe('saveCostBehaviour API wrapper (supplementary, library-direct)', () => {
  it('POSTs to PA_COST_BEHAVIOUR with the given payload and returns response data', async () => {
    vi.resetModules();
    const post = vi.fn().mockResolvedValue({ data: { ok: true, source: 'user_override' } });
    vi.doMock('../../../api/client', () => ({ default: { post } }));

    const { saveCostBehaviour: realSave } = await vi.importActual('../../../api/planningAnalytics');

    const payload = { account_key: 'kl_T1', cuttability: 'T2' };
    const result = await realSave(payload);

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(API_ENDPOINTS.PA_COST_BEHAVIOUR, payload);
    expect(result).toEqual({ ok: true, source: 'user_override' });

    vi.doUnmock('../../../api/client');
  });
});
