/**
 * CostCutReport.spec.js — MOUNT-BASED test for the Recurring-Cash Cost-Cut Finder.
 *
 * Authored under the test-authorship-split doctrine: written by an independent
 * tester (not the feature author). The bar is mount-based + realistic data +
 * observable DOM. We actually mount(CostCutReport), let the real children
 * (CostCutRow, CostBehaviourBar, BehaviourTag), real primitives
 * (KInput/KSelect/StatusPill/KTabs), and the real Pinia store run; only the
 * network boundary (src/api/planningAnalytics) and the useToast composable are
 * mocked.
 *
 * Prior incident this guards against: the KTable tests were TanStack-direct
 * (library internals), so they passed while the consumer component shipped a
 * runtime bug. These tests assert against the rendered DOM of the consumer.
 *
 * COST-BEHAVIOUR layer coverage (added by the independent tester):
 *   1. Headline split (CostBehaviourBar): 4 segments, legend ZAR+%, ratio read,
 *      addressable read; bar hidden when behaviour_totals all 0/absent.
 *   2. Per-row behaviour chip (BehaviourTag via CostCutRow): each value +
 *      unknown/missing → "Unclassified", correct short label + categorical
 *      class, driver as subtext + title.
 *   3. Behaviour filter: narrows visible row count per behaviour; "All"
 *      restores; distinct "no matching accounts" empty state; verified on BOTH
 *      tabs.
 *   4. Inline re-tag → POST + re-fetch: saveCostBehaviour once with
 *      {account_key, behaviour}; getCostCutReport re-called after; per-row
 *      spinner in-flight; current value = no-op; missing account_key = error
 *      toast + no POST.
 *   5. Re-tag concurrency last-wins (loadSeq guard): stale re-fetch dropped.
 *   6. (supplementary, library-direct) saveCostBehaviour POSTs to
 *      PA_COST_BEHAVIOUR with the payload.
 *
 * Driving the inline re-tag: KSelect wraps Reka UI's SelectRoot, whose dropdown
 * is portal-teleported and does not open reliably under happy-dom. So for the
 * re-tag we locate the REAL row KSelect *component* (by its aria-label prop) and
 * emit its `update:modelValue` — the exact event Reka emits on selection. This
 * still exercises the real consumer chain (CostCutRow.onRetag →
 * CostCutReport.commitBehaviour); only the portal click itself is bypassed.
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
// (KTabs guards these in a try/catch, but providing stubs silences the inject
//  warnings and keeps url-sync code paths deterministic).
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ replace: vi.fn() }),
}));

import CostCutReport from '../CostCutReport.vue';
import CostCutRow from '../CostCutRow.vue';
import BehaviourTag from '../BehaviourTag.vue';
import KSelect from '../../klikk/KSelect.vue';
import {
  getCostCutReport,
  getKpiTargets,
  saveKpiTarget,
  deleteKpiTarget,
  saveCostBehaviour,
} from '../../../api/planningAnalytics';
import { useDataStore } from '../../../stores/data';
import { API_ENDPOINTS } from '../../../utils/constants';

// ── Realistic fixture — the shape the live TM1 endpoint actually returns ─────
// Now ALSO carries the cost-behaviour layer: per-row behaviour/driver/account_key
// and the top-level behaviour_totals / addressable_base / fixed_variable_ratio.
function makeReport(overrides = {}) {
  return {
    entity: '41ebfa0e-012e-4ff1-82ba-a9a7585c536c',
    year: 2025,
    prior_year: 2024,
    basis: 'Recurring cash expense (excludes non-cash & one-offs)',
    total_recurring_cost: 3062363,
    total_target: 2800000,
    total_rag: 'red',
    rag_counts: { green: 1, amber: 0, red: 1, none: 0 },
    // ── Cost-behaviour headline split (operating leverage) ──────────────────
    behaviour_totals: {
      fixed: 1617280,
      variable: 783602,
      semi_variable: 444639,
      non_controllable: 216842,
      unclassified: 0,
    },
    addressable_base: 2845521,
    fixed_variable_ratio: 2.06,
    accounts: [
      {
        account_id: 'a1',
        account_key: 'kl_HH--EM01/1',
        name: 'Employee Expenses Tanja',
        group: 'OVERHEADS',
        behaviour: 'fixed',
        driver: 'headcount (salaried)',
        recurring_actual: 420000,
        recurring_prior: 471000,
        yoy_delta: -51000,
        yoy_pct: -10.9,
        pct_of_cost: 13.7,
        target: 380000,
        rag: 'red',
      },
      {
        account_id: 'a2',
        account_key: 'kl_HH--AU04',
        name: 'Management Service',
        group: 'OVERHEADS',
        behaviour: 'variable',
        driver: null,
        recurring_actual: 165208,
        recurring_prior: 82800,
        yoy_delta: 82408,
        yoy_pct: 99.5,
        pct_of_cost: 5.4,
        target: 999999,
        rag: 'green',
      },
    ],
    top_opportunities: [
      {
        account_id: 'a2',
        account_key: 'kl_HH--AU04',
        name: 'Management Service',
        group: 'OVERHEADS',
        behaviour: 'variable',
        driver: null,
        recurring_actual: 165208,
        recurring_prior: 82800,
        yoy_delta: 82408,
        yoy_pct: 99.5,
        pct_of_cost: 5.4,
        target: 999999,
        rag: 'green',
      },
    ],
    source: 'TM1 gl_src_trial_balance (live)',
    ...overrides,
  };
}

/**
 * A four-behaviour account set — one account per behaviour, plus one with a
 * missing behaviour (→ should be treated as unclassified). Used by the
 * behaviour-filter and per-row-chip tests where we need a known mix.
 */
function makeMixedAccounts() {
  return [
    {
      account_id: 'f1', account_key: 'kl_F1', name: 'Rent Head Office',
      group: 'OVERHEADS', behaviour: 'fixed', driver: 'lease',
      recurring_actual: 600000, recurring_prior: 600000, yoy_delta: 0,
      yoy_pct: 0, pct_of_cost: 20, target: null, rag: 'none',
    },
    {
      account_id: 'v1', account_key: 'kl_V1', name: 'Casual Wages',
      group: 'DIRECTCOSTS', behaviour: 'variable', driver: 'hours worked',
      recurring_actual: 300000, recurring_prior: 250000, yoy_delta: 50000,
      yoy_pct: 20, pct_of_cost: 10, target: null, rag: 'none',
    },
    {
      account_id: 's1', account_key: 'kl_S1', name: 'Electricity',
      group: 'OVERHEADS', behaviour: 'semi_variable', driver: 'usage + standing',
      recurring_actual: 180000, recurring_prior: 170000, yoy_delta: 10000,
      yoy_pct: 5.9, pct_of_cost: 6, target: null, rag: 'none',
    },
    {
      account_id: 'n1', account_key: 'kl_N1', name: 'Statutory Levies',
      group: 'EXPENSE', behaviour: 'non_controllable', driver: 'regulation',
      recurring_actual: 90000, recurring_prior: 88000, yoy_delta: 2000,
      yoy_pct: 2.3, pct_of_cost: 3, target: null, rag: 'none',
    },
    {
      account_id: 'u1', account_key: 'kl_U1', name: 'Sundry Uncategorised',
      group: 'EXPENSE', behaviour: undefined, driver: null,
      recurring_actual: 12000, recurring_prior: 10000, yoy_delta: 2000,
      yoy_pct: 20, pct_of_cost: 0.4, target: null, rag: 'none',
    },
  ];
}

/**
 * Mount with a real Pinia store, pre-seeded with tenants so the component's
 * onMounted skips the loadTenants() network call and goes straight to
 * loadReport().
 */
function mountReport() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useDataStore();
  store.tenants = [
    { tenant_id: '41ebfa0e-012e-4ff1-82ba-a9a7585c536c', tenant_name: 'Klikk Rentals' },
  ];
  store.selectedTenant = '41ebfa0e-012e-4ff1-82ba-a9a7585c536c';

  return mount(CostCutReport, {
    global: {
      plugins: [pinia],
      // KTabs guards useRoute/useRouter in a try/catch, so no router stub is
      // needed; the component is mounted with :url-sync="false" regardless.
    },
  });
}

// Find the inline re-tag KSelect *component* for a given account name. The row
// passes :aria-label="`Cost behaviour for <name>`"; KSelect declares no
// aria-label prop, so it FALLS THROUGH to the rendered root element — hence we
// match on attributes('aria-label'), not props. This is a stable, semantic
// handle (the accessible name of the control), not a test-only hook.
function retagSelectFor(wrapper, accountName) {
  return wrapper
    .findAllComponents(KSelect)
    .find((c) => c.attributes('aria-label') === `Cost behaviour for ${accountName}`);
}

// True if the per-row "Saving behaviour" spinner is showing for the named
// account. KSpinner renders its `label` as visually-hidden sr-only text
// (role="status"), so we look for that text — distinct from the target-save
// spinner ("Saving target") in the same row. We re-find the row's CostCutRow
// from the TOP wrapper on every call: a post-save re-fetch re-renders the
// table, so a captured child wrapper would go stale and report the old subtree.
function behaviourSpinnerShowing(wrapper, accountName) {
  const row = wrapper
    .findAllComponents(CostCutRow)
    .find((r) => r.props('row').name === accountName);
  if (!row) return false;
  const cell = row.find('.cost-cut-row__behaviour');
  if (!cell.exists()) return false;
  return cell
    .findAll('.kspinner')
    .some((s) => s.text().includes('Saving behaviour'));
}

// Click a behaviour filter chip by its visible label ("All", "Fixed", …).
async function clickBehaviourFilter(wrapper, label) {
  const chip = wrapper
    .findAll('.cost-cut__beh-filter .cost-cut__beh-chip')
    .find((b) => b.text() === label);
  expect(chip, `behaviour filter chip "${label}" should exist`).toBeTruthy();
  await chip.trigger('click');
  await flushPromises();
  return chip;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Sensible defaults — individual tests override getCostCutReport as needed.
  getCostCutReport.mockResolvedValue(makeReport());
  getKpiTargets.mockResolvedValue({ targets: [] });
  saveKpiTarget.mockResolvedValue({ ok: true });
  deleteKpiTarget.mockResolvedValue({ ok: true });
  saveCostBehaviour.mockResolvedValue({ ok: true });
});

describe('CostCutReport — mount-based', () => {
  it('renders both account rows and the formatted total after the fetch resolves', async () => {
    const wrapper = mountReport();
    await flushPromises();

    expect(getCostCutReport).toHaveBeenCalled();

    const text = wrapper.text();
    // Account NAMES appear in the rendered DOM (real CostCutRow rendered them).
    expect(text).toContain('Employee Expenses Tanja');
    expect(text).toContain('Management Service');

    // Two real CostCutRow children were rendered in the "accounts" table.
    const rows = wrapper.findAll('tbody tr');
    expect(rows.length).toBe(2);

    // Total recurring cost is formatted as ZAR currency (3 062 363).
    // Intl en-ZA uses a non-breaking-space thousands separator. Rather than
    // embed that irregular-whitespace literal in this source file (which trips
    // no-irregular-whitespace), strip ALL whitespace — regular space, NBSP and
    // narrow-NBSP are all matched by \s — and assert on the contiguous,
    // separator-free digit run. This keeps the assertion strict on the digits.
    const digitsOnly = text.replace(/\s/g, '');
    expect(digitsOnly).toContain('R3062363');
  });

  it('renders RAG StatusPills: over-target row is error/red, under-target row is success/green', async () => {
    const wrapper = mountReport();
    await flushPromises();

    const rows = wrapper.findAll('tbody tr');
    expect(rows.length).toBe(2);

    // Row 1 = Employee Expenses Tanja (rag: 'red' → tone error → "Over").
    const row1 = rows[0];
    const row1Pill = row1.find('.status-pill');
    expect(row1Pill.exists()).toBe(true);
    expect(row1Pill.classes()).toContain('status-pill--error');
    expect(row1Pill.text()).toContain('Over');

    // Row 2 = Management Service (rag: 'green' → tone success → "On target").
    const row2 = rows[1];
    const row2Pill = row2.find('.status-pill');
    expect(row2Pill.exists()).toBe(true);
    expect(row2Pill.classes()).toContain('status-pill--success');
    expect(row2Pill.text()).toContain('On target');
  });

  it('commits an edited per-account target: saveKpiTarget called with the right metric_key and value', async () => {
    const wrapper = mountReport();
    await flushPromises();

    const rows = wrapper.findAll('tbody tr');
    // The per-account target input is the one aria-labelled for that account.
    const input = rows[0].find('input[aria-label="Target for Employee Expenses Tanja"]');
    expect(input.exists()).toBe(true);

    // Change the value (380000 → 350000) and blur to commit.
    await input.setValue('350000');
    await input.trigger('blur');
    await flushPromises();

    expect(saveKpiTarget).toHaveBeenCalledTimes(1);
    const payload = saveKpiTarget.mock.calls[0][0];
    expect(payload.metric_key).toBe('cost_cut.account.a1');
    expect(payload.target_value).toBe(350000);
    expect(payload.entity_id).toBe('41ebfa0e-012e-4ff1-82ba-a9a7585c536c');
    expect(payload.period_year).toBe(2025);
  });

  // ── BEHAVIOUR CHANGE (review fix, 2026-06): clear-to-delete now works ──────
  // Previously KInput type="number" coerced ''→0, so clearing a target SAVED
  // target_value 0 and the delete path was dead. The fix: parseTargetDraft()
  // now treats empty OR 0 as "no target" (null). On commit, parsed === null
  // → deleteKpiTarget IS called (only when a target currently exists), and
  // saveKpiTarget is NOT called. This test locks in the new, correct behaviour.
  //
  // The delete payload shape matches what commitTarget() actually sends:
  //   { metric_key, year, entity }  — note `year` is the string '2025'
  //   (year.value) and `entity` is the entity UUID string (entity.value).
  it('clearing a per-account target that HAS a target DELETES it and does not save', async () => {
    const wrapper = mountReport();
    await flushPromises();

    const rows = wrapper.findAll('tbody tr');
    // Row 1 = account a1, which has an existing target of 380000.
    const input = rows[0].find('input[aria-label="Target for Employee Expenses Tanja"]');
    expect(input.exists()).toBe(true);

    // Clear the field (380000 → '') and blur to commit.
    await input.setValue('');
    await input.trigger('blur');
    await flushPromises();

    // New behaviour: an existing target cleared → DELETE, never SAVE.
    expect(saveKpiTarget).not.toHaveBeenCalled();
    expect(deleteKpiTarget).toHaveBeenCalledTimes(1);

    const payload = deleteKpiTarget.mock.calls[0][0];
    expect(payload.metric_key).toBe('cost_cut.account.a1');
    // entity/year params the component sends (entity.value / year.value).
    expect(payload.entity).toBe('41ebfa0e-012e-4ff1-82ba-a9a7585c536c');
    expect(payload.year).toBe('2025');
  });

  // Edge: a row with NO existing target, cleared → no-op (neither save nor
  // delete fires). Row a2 has a target (999999), so we override the fixture to
  // give the first row a null target, then clear it.
  it('clearing a per-account target that has NO existing target is a no-op (no save, no delete)', async () => {
    getCostCutReport.mockResolvedValue(
      makeReport({
        accounts: [
          {
            account_id: 'a1',
            account_key: 'kl_HH--EM01/1',
            name: 'Employee Expenses Tanja',
            group: 'OVERHEADS',
            behaviour: 'fixed',
            driver: 'headcount (salaried)',
            recurring_actual: 420000,
            recurring_prior: 471000,
            yoy_delta: -51000,
            yoy_pct: -10.9,
            pct_of_cost: 13.7,
            target: null,
            rag: 'none',
          },
        ],
      }),
    );

    const wrapper = mountReport();
    await flushPromises();

    const rows = wrapper.findAll('tbody tr');
    const input = rows[0].find('input[aria-label="Target for Employee Expenses Tanja"]');
    expect(input.exists()).toBe(true);

    // The field is already empty (target null); set to '' and blur.
    await input.setValue('');
    await input.trigger('blur');
    await flushPromises();

    // parsed === null and currentValue === null → no-op.
    expect(saveKpiTarget).not.toHaveBeenCalled();
    expect(deleteKpiTarget).not.toHaveBeenCalled();
  });

  it('renders both KTabs: "Where the money goes" and "Top cut opportunities"', async () => {
    const wrapper = mountReport();
    await flushPromises();

    const tabs = wrapper.findAll('[role="tab"]');
    const tabLabels = tabs.map((t) => t.text());
    expect(tabLabels).toContain('Where the money goes');
    expect(tabLabels).toContain('Top cut opportunities');

    // Switching to the opportunities tab renders the opportunities panel.
    const oppTab = tabs.find((t) => t.text() === 'Top cut opportunities');
    await oppTab.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Fastest-growing recurring costs');
    // The single opportunity row (Management Service) renders.
    expect(wrapper.findAll('tbody tr').length).toBe(1);
    expect(wrapper.text()).toContain('Management Service');
  });

  it('shows the loading state before the fetch resolves', async () => {
    // Hold the promise open so we can observe the loading state.
    let resolveFetch;
    getCostCutReport.mockImplementation(
      () => new Promise((resolve) => { resolveFetch = resolve; }),
    );

    const wrapper = mountReport();
    // Let onMounted run up to the awaited (unresolved) fetch.
    await Promise.resolve();
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Reading live from TM1');
    // No data rows while loading.
    expect(wrapper.findAll('tbody tr').length).toBe(0);

    // Resolve and confirm loading clears, rows appear.
    resolveFetch(makeReport());
    await flushPromises();
    expect(wrapper.text()).not.toContain('Reading live from TM1');
    expect(wrapper.findAll('tbody tr').length).toBe(2);
  });

  it('shows an error state when getCostCutReport rejects', async () => {
    getCostCutReport.mockRejectedValue(new Error('TM1 connection refused'));

    const wrapper = mountReport();
    await flushPromises();

    expect(wrapper.find('.cost-cut__status--error').exists()).toBe(true);
    expect(wrapper.text()).toContain('TM1 connection refused');
    // No report content rendered on error.
    expect(wrapper.findAll('tbody tr').length).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// COST-BEHAVIOUR LAYER — added by the independent tester
// ════════════════════════════════════════════════════════════════════════════

// ── Area 1: Headline cost-behaviour split (CostBehaviourBar) ─────────────────
describe('CostCutReport — headline cost-behaviour split', () => {
  it('renders the 4 stacked-bar segments with proportional widths from behaviour_totals', async () => {
    const wrapper = mountReport();
    await flushPromises();

    const bar = wrapper.find('.beh-split__bar');
    expect(bar.exists()).toBe(true);

    // Four categorical segments, in BEHAVIOUR_ORDER (unclassified excluded).
    const segs = wrapper.findAll('.beh-split__seg');
    expect(segs.length).toBe(4);
    expect(wrapper.find('.beh-split__seg--fixed').exists()).toBe(true);
    expect(wrapper.find('.beh-split__seg--variable').exists()).toBe(true);
    expect(wrapper.find('.beh-split__seg--semi_variable').exists()).toBe(true);
    expect(wrapper.find('.beh-split__seg--non_controllable').exists()).toBe(true);

    // Proportional widths (runtime-value :style exception). The segment width
    // is the RAW unrounded percentage (the legend carries the rounded label).
    // fixed 1617280 / total 3062363 = 52.81%; variable 783602 / … = 25.59%.
    const fixedSeg = wrapper.find('.beh-split__seg--fixed');
    expect(fixedSeg.attributes('style')).toContain('width: 52.8');
    const varSeg = wrapper.find('.beh-split__seg--variable');
    expect(varSeg.attributes('style')).toContain('width: 25.5');

    // The widths are proportional: fixed > variable > semi > non-controllable.
    const widthOf = (sel) =>
      parseFloat(wrapper.find(sel).attributes('style').replace(/[^0-9.]/g, ''));
    const wFixed = widthOf('.beh-split__seg--fixed');
    const wVar = widthOf('.beh-split__seg--variable');
    const wSemi = widthOf('.beh-split__seg--semi_variable');
    const wNon = widthOf('.beh-split__seg--non_controllable');
    expect(wFixed).toBeGreaterThan(wVar);
    expect(wVar).toBeGreaterThan(wSemi);
    expect(wSemi).toBeGreaterThan(wNon);
  });

  it('renders a legend with ZAR + % per behaviour, the fixed:variable ratio and the addressable read', async () => {
    const wrapper = mountReport();
    await flushPromises();

    // Legend has one item per behaviour (4), each rendering a BehaviourTag.
    const legendItems = wrapper.findAll('.beh-split__legend-item');
    expect(legendItems.length).toBe(4);

    const splitText = wrapper.find('.beh-split').text();
    const splitDigits = splitText.replace(/\s/g, '');

    // ZAR amounts per behaviour appear in the legend.
    expect(splitDigits).toContain('R1617280'); // fixed
    expect(splitDigits).toContain('R783602'); // variable
    expect(splitDigits).toContain('R444639'); // semi-variable
    expect(splitDigits).toContain('R216842'); // non-controllable

    // Percentages per behaviour (52.8% fixed, 25.6% variable).
    expect(splitText).toContain('52.8%');
    expect(splitText).toContain('25.6%');

    // Operating-leverage reads: "Fixed : Variable = 2.06 : 1" and % addressable.
    expect(splitText).toContain('Fixed : Variable = 2.06 : 1');
    // addressable_base 2845521 / total 3062363 = 92.9% → rounded to 93%.
    expect(splitText).toContain('93% addressable');
  });

  it('hides the headline split when behaviour_totals are all zero', async () => {
    getCostCutReport.mockResolvedValue(
      makeReport({
        behaviour_totals: {
          fixed: 0, variable: 0, semi_variable: 0, non_controllable: 0, unclassified: 0,
        },
        addressable_base: 0,
        fixed_variable_ratio: null,
      }),
    );

    const wrapper = mountReport();
    await flushPromises();

    // The report still loaded (rows render) but the bar must NOT.
    expect(wrapper.findAll('tbody tr').length).toBe(2);
    expect(wrapper.find('.beh-split').exists()).toBe(false);
    expect(wrapper.find('.beh-split__bar').exists()).toBe(false);
  });

  it('hides the headline split when behaviour_totals is absent from the response', async () => {
    // A legacy/older response with no behaviour layer at all must not crash.
    const legacy = makeReport();
    delete legacy.behaviour_totals;
    delete legacy.addressable_base;
    delete legacy.fixed_variable_ratio;
    getCostCutReport.mockResolvedValue(legacy);

    const wrapper = mountReport();
    await flushPromises();

    expect(wrapper.findAll('tbody tr').length).toBe(2);
    expect(wrapper.find('.beh-split').exists()).toBe(false);
  });
});

// ── Area 2: Per-row behaviour chip (BehaviourTag through CostCutRow) ─────────
describe('CostCutRow — per-row behaviour chip', () => {
  // Mount the REAL CostCutRow directly inside a table so the <tr>/<td> are
  // valid; assert on the rendered BehaviourTag chip. formatCurrency is the same
  // ZAR formatter the parent passes.
  const fmt = (v) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(Number(v) || 0);

  function mountRow(rowOverrides = {}) {
    const row = {
      account_id: 'x1', account_key: 'kl_X1', name: 'Test Account',
      group: 'OVERHEADS', behaviour: 'fixed', driver: 'headcount (salaried)',
      recurring_actual: 100000, recurring_prior: 90000, yoy_delta: 10000,
      yoy_pct: 11.1, pct_of_cost: 5, target: null, rag: 'none',
      ...rowOverrides,
    };
    // CostCutRow's root is a <tr>. happy-dom tolerates mounting it standalone
    // for these chip assertions; we don't need a wrapping <table>.
    return mount(CostCutRow, {
      props: { row, formatCurrency: fmt },
    });
  }

  it('renders the correct short label + categorical class for each behaviour', async () => {
    const cases = [
      { behaviour: 'fixed', short: 'Fixed', cls: 'behaviour-tag--fixed' },
      { behaviour: 'variable', short: 'Variable', cls: 'behaviour-tag--variable' },
      { behaviour: 'semi_variable', short: 'Semi', cls: 'behaviour-tag--semi_variable' },
      { behaviour: 'non_controllable', short: 'Non-ctrl', cls: 'behaviour-tag--non_controllable' },
    ];
    for (const c of cases) {
      const wrapper = mountRow({ behaviour: c.behaviour, driver: null });
      const tag = wrapper.findComponent(BehaviourTag);
      expect(tag.exists()).toBe(true);
      const chip = wrapper.find('.behaviour-tag');
      expect(chip.classes()).toContain(c.cls);
      expect(chip.find('.behaviour-tag__label').text()).toBe(c.short);
      wrapper.unmount();
    }
  });

  it('shows "Unclassified" (not a crash) for an unknown behaviour value', async () => {
    const wrapper = mountRow({ behaviour: 'made_up_value', driver: null });
    const chip = wrapper.find('.behaviour-tag');
    expect(chip.exists()).toBe(true);
    expect(chip.classes()).toContain('behaviour-tag--unclassified');
    expect(chip.find('.behaviour-tag__label').text()).toBe('Unclassified');
  });

  it('shows "Unclassified" (not a crash) for a missing/undefined behaviour value', async () => {
    const wrapper = mountRow({ behaviour: undefined, driver: null });
    const chip = wrapper.find('.behaviour-tag');
    expect(chip.exists()).toBe(true);
    expect(chip.classes()).toContain('behaviour-tag--unclassified');
    expect(chip.find('.behaviour-tag__label').text()).toBe('Unclassified');
  });

  it('renders the driver as subtext AND as the chip title (tooltip) when present', async () => {
    const wrapper = mountRow({ behaviour: 'fixed', driver: 'headcount (salaried)' });

    // Subtext under the chip.
    const driverSub = wrapper.find('.cost-cut-row__driver');
    expect(driverSub.exists()).toBe(true);
    expect(driverSub.text()).toBe('headcount (salaried)');

    // Native title on the chip (advisory tooltip) carries label + driver.
    const chip = wrapper.find('.behaviour-tag');
    expect(chip.attributes('title')).toBe('Fixed — driver: headcount (salaried)');
  });

  it('omits the driver subtext when no driver is provided', async () => {
    const wrapper = mountRow({ behaviour: 'variable', driver: null });
    expect(wrapper.find('.cost-cut-row__driver').exists()).toBe(false);
  });
});

// ── Area 3: Behaviour filter narrows the visible rows ───────────────────────
describe('CostCutReport — behaviour filter', () => {
  it('narrows the visible row count to the matching behaviour and restores on "All"', async () => {
    getCostCutReport.mockResolvedValue(makeReport({ accounts: makeMixedAccounts() }));
    const wrapper = mountReport();
    await flushPromises();

    // All five accounts render initially (filter = 'all').
    expect(wrapper.findAll('tbody tr').length).toBe(5);

    // Fixed → only the one fixed account.
    await clickBehaviourFilter(wrapper, 'Fixed');
    expect(wrapper.findAll('tbody tr').length).toBe(1);
    expect(wrapper.text()).toContain('Rent Head Office');
    expect(wrapper.text()).not.toContain('Casual Wages');

    // Variable → only the variable account.
    await clickBehaviourFilter(wrapper, 'Variable');
    expect(wrapper.findAll('tbody tr').length).toBe(1);
    expect(wrapper.text()).toContain('Casual Wages');

    // Semi-variable → only the semi account.
    await clickBehaviourFilter(wrapper, 'Semi-variable');
    expect(wrapper.findAll('tbody tr').length).toBe(1);
    expect(wrapper.text()).toContain('Electricity');

    // Non-controllable → only the non-controllable account.
    await clickBehaviourFilter(wrapper, 'Non-controllable');
    expect(wrapper.findAll('tbody tr').length).toBe(1);
    expect(wrapper.text()).toContain('Statutory Levies');

    // All → restores every row (5).
    await clickBehaviourFilter(wrapper, 'All');
    expect(wrapper.findAll('tbody tr').length).toBe(5);
  });

  it('sets aria-pressed on the active filter chip only', async () => {
    getCostCutReport.mockResolvedValue(makeReport({ accounts: makeMixedAccounts() }));
    const wrapper = mountReport();
    await flushPromises();

    await clickBehaviourFilter(wrapper, 'Fixed');
    const chips = wrapper.findAll('.cost-cut__beh-filter .cost-cut__beh-chip');
    const pressed = chips.filter((c) => c.attributes('aria-pressed') === 'true');
    expect(pressed.length).toBe(1);
    expect(pressed[0].text()).toBe('Fixed');
  });

  it('shows the "No matching accounts" empty state (distinct from no-cost) when a filter matches zero rows', async () => {
    // A report WITH cost, but no fixed accounts — only variable.
    getCostCutReport.mockResolvedValue(
      makeReport({
        accounts: [makeMixedAccounts()[1]], // variable only (Casual Wages)
      }),
    );
    const wrapper = mountReport();
    await flushPromises();

    expect(wrapper.findAll('tbody tr').length).toBe(1);

    // Filter to Fixed → zero rows → the "no matching" empty state, NOT the
    // genuine no-cost empty state.
    await clickBehaviourFilter(wrapper, 'Fixed');
    expect(wrapper.findAll('tbody tr').length).toBe(0);
    expect(wrapper.text()).toContain('No matching accounts');
    expect(wrapper.text()).not.toContain('No recurring cost');
    // Body references the active behaviour and the "clear the filter" hint.
    expect(wrapper.text().toLowerCase()).toContain('fixed');
    expect(wrapper.text().toLowerCase()).toContain('clear the behaviour filter');
  });

  it('shows the genuine "No recurring cost" empty state (not the filter one) when there are zero accounts', async () => {
    getCostCutReport.mockResolvedValue(
      makeReport({ accounts: [], top_opportunities: [] }),
    );
    const wrapper = mountReport();
    await flushPromises();

    // Filter is 'all', accounts empty → the no-cost empty state.
    expect(wrapper.text()).toContain('No recurring cost');
    expect(wrapper.text()).not.toContain('No matching accounts');
  });

  it('applies the behaviour filter on the OPPORTUNITIES tab too, with its own empty state', async () => {
    // Opportunities are all variable; filtering to Fixed must empty THAT tab.
    getCostCutReport.mockResolvedValue(
      makeReport({
        top_opportunities: [
          {
            account_id: 'v1', account_key: 'kl_V1', name: 'Casual Wages',
            group: 'DIRECTCOSTS', behaviour: 'variable', driver: 'hours worked',
            recurring_actual: 300000, recurring_prior: 250000, yoy_delta: 50000,
            yoy_pct: 20, pct_of_cost: 10, target: null, rag: 'none',
          },
          {
            account_id: 'v2', account_key: 'kl_V2', name: 'Overtime',
            group: 'DIRECTCOSTS', behaviour: 'variable', driver: 'hours worked',
            recurring_actual: 120000, recurring_prior: 60000, yoy_delta: 60000,
            yoy_pct: 100, pct_of_cost: 4, target: null, rag: 'none',
          },
        ],
      }),
    );
    const wrapper = mountReport();
    await flushPromises();

    // Switch to the opportunities tab.
    const tabs = wrapper.findAll('[role="tab"]');
    const oppTab = tabs.find((t) => t.text() === 'Top cut opportunities');
    await oppTab.trigger('click');
    await flushPromises();
    expect(wrapper.findAll('tbody tr').length).toBe(2);

    // Variable filter keeps both.
    await clickBehaviourFilter(wrapper, 'Variable');
    expect(wrapper.findAll('tbody tr').length).toBe(2);

    // Fixed filter empties the opportunities tab → its own empty state.
    await clickBehaviourFilter(wrapper, 'Fixed');
    expect(wrapper.findAll('tbody tr').length).toBe(0);
    expect(wrapper.text()).toContain('No matching opportunities');
    expect(wrapper.text()).not.toContain('No opportunities');
  });
});

// ── Area 4: Inline re-tag → POST + re-fetch ─────────────────────────────────
describe('CostCutReport — inline behaviour re-tag', () => {
  it('re-tagging a row POSTs saveCostBehaviour once with {account_key, behaviour} and re-fetches', async () => {
    const wrapper = mountReport();
    await flushPromises();

    // First fetch already happened on mount.
    expect(getCostCutReport).toHaveBeenCalledTimes(1);

    // Row a1 (Employee Expenses Tanja, behaviour 'fixed', key 'kl_HH--EM01/1').
    const select = retagSelectFor(wrapper, 'Employee Expenses Tanja');
    expect(select, 'row re-tag KSelect should exist').toBeTruthy();

    // Re-tag fixed → variable (the real onRetag → commitBehaviour chain runs).
    select.vm.$emit('update:modelValue', 'variable');
    await flushPromises();

    expect(saveCostBehaviour).toHaveBeenCalledTimes(1);
    expect(saveCostBehaviour.mock.calls[0][0]).toEqual({
      account_key: 'kl_HH--EM01/1',
      behaviour: 'variable',
    });

    // The report is re-fetched after a successful save (1 mount + 1 re-fetch).
    expect(getCostCutReport).toHaveBeenCalledTimes(2);

    // Success toast surfaced with the new behaviour label.
    expect(toastCalls.success).toHaveBeenCalled();
    const successArg = toastCalls.success.mock.calls.at(-1)[0];
    expect(successArg).toContain('Variable');
  });

  it('shows the per-row behaviour saving spinner while the re-tag is in flight, then clears it', async () => {
    // Hold the saveCostBehaviour promise open to observe the in-flight spinner.
    let resolveSave;
    saveCostBehaviour.mockImplementation(
      () => new Promise((resolve) => { resolveSave = resolve; }),
    );

    const wrapper = mountReport();
    await flushPromises();

    // No behaviour spinner before the re-tag. (KSpinner renders its `label` as
    // visually-hidden sr-only text, not an aria-label attr — see the helper.)
    expect(behaviourSpinnerShowing(wrapper, 'Employee Expenses Tanja')).toBe(false);

    const select = retagSelectFor(wrapper, 'Employee Expenses Tanja');
    select.vm.$emit('update:modelValue', 'variable');
    await flushPromises();

    // In-flight: the per-row behaviour spinner shows while the save is pending.
    expect(behaviourSpinnerShowing(wrapper, 'Employee Expenses Tanja')).toBe(true);

    // Resolve the save → spinner clears after the re-fetch completes.
    resolveSave({ ok: true });
    await flushPromises();
    expect(behaviourSpinnerShowing(wrapper, 'Employee Expenses Tanja')).toBe(false);
  });

  it('re-tagging a row to its CURRENT behaviour is a no-op (no POST, no re-fetch)', async () => {
    const wrapper = mountReport();
    await flushPromises();
    expect(getCostCutReport).toHaveBeenCalledTimes(1);

    // Row a1 is already 'fixed'; re-emitting 'fixed' must do nothing.
    const select = retagSelectFor(wrapper, 'Employee Expenses Tanja');
    select.vm.$emit('update:modelValue', 'fixed');
    await flushPromises();

    expect(saveCostBehaviour).not.toHaveBeenCalled();
    expect(getCostCutReport).toHaveBeenCalledTimes(1); // no re-fetch
  });

  it('re-tagging a row that is MISSING an account_key surfaces an error toast and does NOT POST', async () => {
    getCostCutReport.mockResolvedValue(
      makeReport({
        accounts: [
          {
            account_id: 'nokey', account_key: null, name: 'No Key Account',
            group: 'OVERHEADS', behaviour: 'fixed', driver: null,
            recurring_actual: 50000, recurring_prior: 50000, yoy_delta: 0,
            yoy_pct: 0, pct_of_cost: 2, target: null, rag: 'none',
          },
        ],
      }),
    );
    const wrapper = mountReport();
    await flushPromises();
    expect(getCostCutReport).toHaveBeenCalledTimes(1);

    const select = retagSelectFor(wrapper, 'No Key Account');
    expect(select).toBeTruthy();
    select.vm.$emit('update:modelValue', 'variable');
    await flushPromises();

    // No POST and no re-fetch; an error toast was raised instead.
    expect(saveCostBehaviour).not.toHaveBeenCalled();
    expect(getCostCutReport).toHaveBeenCalledTimes(1);
    expect(toastCalls.error).toHaveBeenCalled();
    expect(toastCalls.error.mock.calls.at(-1)[0].toLowerCase()).toContain('account key');
  });

  it('surfaces an error toast (and clears the spinner) when saveCostBehaviour rejects', async () => {
    saveCostBehaviour.mockRejectedValue(new Error('behaviour save failed'));

    const wrapper = mountReport();
    await flushPromises();

    const select = retagSelectFor(wrapper, 'Employee Expenses Tanja');
    select.vm.$emit('update:modelValue', 'variable');
    await flushPromises();

    expect(saveCostBehaviour).toHaveBeenCalledTimes(1);
    // Save rejected → error toast, no success, spinner cleared in finally.
    expect(toastCalls.error).toHaveBeenCalled();
    expect(toastCalls.success).not.toHaveBeenCalled();
    expect(behaviourSpinnerShowing(wrapper, 'Employee Expenses Tanja')).toBe(false);
  });
});

// ── Area 5: Re-tag concurrency — last-wins (loadSeq guard) ──────────────────
describe('CostCutReport — re-tag concurrency (last-wins)', () => {
  it('drops the stale re-fetch when a newer load (year change) starts before the re-tag re-fetch resolves', async () => {
    // Distinct reports so we can tell which one "won". The re-tag's re-fetch
    // returns the STALE report (held open); the year-change load returns the
    // FRESH report and resolves first.
    const staleReport = makeReport({
      total_recurring_cost: 3062363,
      accounts: [
        {
          account_id: 'a1', account_key: 'kl_HH--EM01/1', name: 'STALE Account',
          group: 'OVERHEADS', behaviour: 'fixed', driver: null,
          recurring_actual: 420000, recurring_prior: 471000, yoy_delta: -51000,
          yoy_pct: -10.9, pct_of_cost: 13.7, target: 380000, rag: 'red',
        },
      ],
    });
    const freshReport = makeReport({
      year: 2024,
      total_recurring_cost: 2750000,
      accounts: [
        {
          account_id: 'b9', account_key: 'kl_B9', name: 'FRESH Account',
          group: 'OVERHEADS', behaviour: 'variable', driver: null,
          recurring_actual: 200000, recurring_prior: 180000, yoy_delta: 20000,
          yoy_pct: 11.1, pct_of_cost: 7, target: null, rag: 'none',
        },
      ],
    });

    // Call sequencing:
    //   call #1 (mount)            → resolves immediately with the initial report
    //   call #2 (re-tag re-fetch)  → HELD OPEN (the stale, in-flight load)
    //   call #3 (year-change load) → resolves immediately with freshReport
    let resolveStaleRefetch;
    getCostCutReport
      .mockResolvedValueOnce(makeReport())
      .mockImplementationOnce(
        () => new Promise((resolve) => { resolveStaleRefetch = resolve; }),
      )
      .mockResolvedValueOnce(freshReport);

    const wrapper = mountReport();
    await flushPromises();
    expect(getCostCutReport).toHaveBeenCalledTimes(1);

    // Fire a re-tag → triggers saveCostBehaviour then loadReport (call #2, held).
    const select = retagSelectFor(wrapper, 'Employee Expenses Tanja');
    select.vm.$emit('update:modelValue', 'variable');
    await flushPromises(); // save resolves; re-fetch (#2) is now pending/open
    expect(saveCostBehaviour).toHaveBeenCalledTimes(1);
    expect(getCostCutReport).toHaveBeenCalledTimes(2);

    // Before #2 resolves, start a NEWER load by changing the year via the real
    // year KSelect (the consumer path through watch([entity, year]) → call #3).
    const yearSelect = wrapper
      .findAllComponents(KSelect)
      .find((c) => c.props('label') === 'Year');
    expect(yearSelect, 'year KSelect should exist').toBeTruthy();
    yearSelect.vm.$emit('update:modelValue', '2024');
    await flushPromises(); // call #3 fires and resolves with freshReport
    expect(getCostCutReport).toHaveBeenCalledTimes(3);

    // The fresh (newest) load has landed.
    expect(wrapper.text()).toContain('FRESH Account');

    // NOW resolve the stale re-fetch (#2). Its loadSeq is older than the
    // year-change load, so the guard must DROP it — the DOM must still show the
    // fresh report, never revert to the stale one.
    resolveStaleRefetch(staleReport);
    await flushPromises();

    expect(wrapper.text()).toContain('FRESH Account');
    expect(wrapper.text()).not.toContain('STALE Account');
  });
});

// ── Area 6 (supplementary, library-direct OK): saveCostBehaviour wire path ──
// This is the ONE allowed library-direct case — it asserts the api wrapper POSTs
// to the right endpoint with the payload. It mounts nothing; the mount-based
// guarantees live in Area 4 above.
describe('saveCostBehaviour API wrapper (supplementary, library-direct)', () => {
  it('POSTs to PA_COST_BEHAVIOUR with the given payload and returns response data', async () => {
    // Reset the module mocks so we test the REAL wrapper against a fake client.
    vi.resetModules();

    const post = vi.fn().mockResolvedValue({ data: { ok: true, source: 'user_override' } });
    vi.doMock('../../../api/client', () => ({ default: { post } }));

    const { saveCostBehaviour: realSave } = await vi.importActual(
      '../../../api/planningAnalytics',
    );

    const payload = { account_key: 'kl_HH--EM01/1', behaviour: 'variable' };
    const result = await realSave(payload);

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(API_ENDPOINTS.PA_COST_BEHAVIOUR, payload);
    expect(result).toEqual({ ok: true, source: 'user_override' });

    vi.doUnmock('../../../api/client');
  });
});
