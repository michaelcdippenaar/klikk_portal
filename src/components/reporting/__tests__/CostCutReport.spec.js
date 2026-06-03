/**
 * CostCutReport.spec.js — MOUNT-BASED test for the Recurring-Cash Cost-Cut Finder.
 *
 * Authored under the test-authorship-split doctrine: written by an independent
 * tester (not the feature author). The bar is mount-based + realistic data +
 * observable DOM. We actually mount(CostCutReport), let the real child
 * (CostCutRow), real primitives (KInput/StatusPill/KTabs), and the real Pinia
 * store run; only the network boundary (src/api/planningAnalytics) and the
 * useToast composable are mocked.
 *
 * Prior incident this guards against: the KTable tests were TanStack-direct
 * (library internals), so they passed while the consumer component shipped a
 * runtime bug. These tests assert against the rendered DOM of the consumer.
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
import {
  getCostCutReport,
  getKpiTargets,
  saveKpiTarget,
  deleteKpiTarget,
} from '../../../api/planningAnalytics';
import { useDataStore } from '../../../stores/data';

// ── Realistic fixture — the shape the live TM1 endpoint actually returns ─────
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
    accounts: [
      {
        account_id: 'a1',
        name: 'Employee Expenses Tanja',
        group: 'OVERHEADS',
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
        name: 'Management Service',
        group: 'OVERHEADS',
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
        name: 'Management Service',
        group: 'OVERHEADS',
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

beforeEach(() => {
  vi.clearAllMocks();
  // Sensible defaults — individual tests override getCostCutReport as needed.
  getCostCutReport.mockResolvedValue(makeReport());
  getKpiTargets.mockResolvedValue({ targets: [] });
  saveKpiTarget.mockResolvedValue({ ok: true });
  deleteKpiTarget.mockResolvedValue({ ok: true });
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
            name: 'Employee Expenses Tanja',
            group: 'OVERHEADS',
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
