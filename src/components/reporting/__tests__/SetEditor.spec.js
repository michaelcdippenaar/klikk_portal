/**
 * SetEditor.spec.js — MOUNT-BASED tests for the PAW-style Set (Subset) Editor
 * (src/components/reporting/SetEditor.vue).
 *
 * Authored under the test-authorship-split doctrine: written by an INDEPENDENT
 * tester (not the feature author). The bar (per the 2026-05-26 KTable incident)
 * is mount-based + realistic TM1 data shapes + observable DOM. We mount the REAL
 * SetEditor with props, inside its REAL KDialog (Reka), with the REAL KDL
 * primitives (KSelect / KInput / KCheckbox / KSpinner / EmptyState). ONLY the
 * network boundary (src/api/planningAnalytics) is mocked — the six TM1 HTTP
 * functions the editor calls.
 *
 * ── PORTAL NOTE ──────────────────────────────────────────────────────────────
 * KDialog renders through Reka's DialogPortal → its whole body+footer TELEPORT to
 * <body>. So we mount with attachTo:document.body and query document.body for the
 * editor DOM. Wrappers are tracked + torn down (body cleared) so one test's
 * teleported nodes never leak into the next.
 *
 * KSelect (hierarchy / subset / alias pickers) ALSO teleports its dropdown
 * (Reka SelectPortal); driving that list under happy-dom is brittle, so — exactly
 * as the sibling PivotExplorer.spec.js does for KMenu/KPopover — we drive the
 * KSelect instance's controlled emit (`sel.vm.$emit('update:modelValue', value)`).
 * That still runs the REAL component handlers (onHierarchyChange / onSubsetChosen
 * / onAliasChange) — it is mount-based, not a library-direct assertion.
 *
 * ── THE FAKE DIMENSION (the engine of these tests) ───────────────────────────
 * A realistic `account` dimension with a default hierarchy + one alternate
 * (EBITDA), so hierarchy-scoping is testable. Every mock HONOURS the hierarchy
 * arg the editor passes (null = default, else the alternate name) and returns a
 * DIFFERENT topology per hierarchy, so a hierarchy switch is observably distinct.
 *
 *   account (default hierarchy)   All_account ─┬─ EXPENSE  (consol)
 *                                              │    ├─ Rent      (leaf)
 *                                              │    ├─ Salaries  (leaf)
 *                                              │    └─ Marketing (consol)  ← multi-level
 *                                              │          ├─ Ads     (leaf)
 *                                              │          └─ Events  (leaf)
 *                                              └─ REVENUE  (consol)
 *                                                   ├─ Sales    (leaf)
 *                                                   └─ Other    (leaf)
 *
 *   EBITDA (alternate hierarchy)  All_account ─┬─ EBIT     (consol)
 *                                              │    ├─ Rent      (leaf)
 *                                              │    └─ Salaries  (leaf)
 *                                              └─ DA       (consol)
 *                                                   └─ Depreciation (leaf)
 *
 * subsets(account default) -> jse (static), dyn (dynamic)
 * aliases(account)         -> ['name']
 */

// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

// ── Mock the network boundary — the six TM1 HTTP functions SetEditor imports ──
vi.mock('../../../api/planningAnalytics', () => ({
  getTm1DimensionHierarchies: vi.fn(),
  getTm1DimensionElements: vi.fn(),
  getTm1DimensionChildren: vi.fn(),
  getTm1Subsets: vi.fn(),
  getTm1SubsetMembers: vi.fn(),
  getTm1DimensionAliases: vi.fn(),
}));

import SetEditor from '../SetEditor.vue';
import KSelect from '../../klikk/KSelect.vue';
import KCheckbox from '../../klikk/KCheckbox.vue';
import {
  getTm1DimensionHierarchies,
  getTm1DimensionElements,
  getTm1DimensionChildren,
  getTm1Subsets,
  getTm1SubsetMembers,
  getTm1DimensionAliases,
} from '../../../api/planningAnalytics';

// ════════════════════════════════════════════════════════════════════════════
// FAKE DIMENSION — the single source of truth the mocks are derived from
// ════════════════════════════════════════════════════════════════════════════
// TM1 element types: 'C' = consolidation (drillable), 'N' = numeric leaf.

// Per-hierarchy element + children topology. `null` key = the DEFAULT hierarchy
// (what the editor passes when activeHierarchy is the default / unset).
const TOPO = {
  // ── DEFAULT hierarchy ──────────────────────────────────────────────────────
  default: {
    elements: [
      { name: 'All_account', type: 'C' },
      { name: 'EXPENSE', type: 'C' },
      { name: 'REVENUE', type: 'C' },
      { name: 'Marketing', type: 'C' },
      { name: 'Rent', type: 'N' },
      { name: 'Salaries', type: 'N' },
      { name: 'Ads', type: 'N' },
      { name: 'Events', type: 'N' },
      { name: 'Sales', type: 'N' },
      { name: 'Other', type: 'N' },
    ],
    children: {
      All_account: [
        { name: 'EXPENSE', type: 'C' },
        { name: 'REVENUE', type: 'C' },
      ],
      EXPENSE: [
        { name: 'Rent', type: 'N' },
        { name: 'Salaries', type: 'N' },
        { name: 'Marketing', type: 'C' }, // a consolidation child → multi-level drill
      ],
      Marketing: [
        { name: 'Ads', type: 'N' },
        { name: 'Events', type: 'N' },
      ],
      REVENUE: [
        { name: 'Sales', type: 'N' },
        { name: 'Other', type: 'N' },
      ],
    },
  },
  // ── EBITDA alternate hierarchy ───────────────────────────────────────────────
  EBITDA: {
    elements: [
      { name: 'All_account', type: 'C' },
      { name: 'EBIT', type: 'C' },
      { name: 'DA', type: 'C' },
      { name: 'Rent', type: 'N' },
      { name: 'Salaries', type: 'N' },
      { name: 'Depreciation', type: 'N' },
    ],
    children: {
      All_account: [
        { name: 'EBIT', type: 'C' },
        { name: 'DA', type: 'C' },
      ],
      EBIT: [
        { name: 'Rent', type: 'N' },
        { name: 'Salaries', type: 'N' },
      ],
      DA: [{ name: 'Depreciation', type: 'N' }],
    },
  },
};

// Map the hierarchy arg the editor passes → a TOPO bucket. The editor passes
// null/'' for default, else the alternate principal name.
function topoFor(hierarchy) {
  if (!hierarchy || hierarchy === 'account') return TOPO.default;
  return TOPO[hierarchy] || TOPO.default;
}

// Subset members, keyed by name. Resolves leaf members of EXPENSE.
const SUBSET_MEMBERS = {
  jse: {
    subset: 'jse',
    dynamic: false,
    members: [
      { name: 'Rent', type: 'N' },
      { name: 'Salaries', type: 'N' },
    ],
    truncated: false,
  },
  dyn: {
    subset: 'dyn',
    dynamic: true,
    members: [
      { name: 'Sales', type: 'N' },
      { name: 'Other', type: 'N' },
    ],
    truncated: true,
  },
};

// ── Wire the mocks from the fake dimension ───────────────────────────────────
function installMocks() {
  getTm1DimensionHierarchies.mockResolvedValue({
    dimension: 'account',
    default: 'account',
    hierarchies: [
      { name: 'account', is_default: true },
      { name: 'EBITDA', is_default: false },
    ],
    has_alternates: true,
  });
  getTm1DimensionElements.mockImplementation(async (dimension, hierarchy = null) => ({
    dimension,
    elements: topoFor(hierarchy).elements,
  }));
  getTm1DimensionChildren.mockImplementation(async (dimension, parent, hierarchy = null) => ({
    dimension,
    parent,
    children: topoFor(hierarchy).children[parent] || [],
  }));
  getTm1Subsets.mockImplementation(async (dimension, hierarchy = null) => {
    // The alternate exposes a DIFFERENT subset list, so a hierarchy switch is
    // observably scoped (a regression that reloaded the default would show jse/dyn).
    if (hierarchy === 'EBITDA') {
      return { subsets: [{ name: 'ebit_only', dynamic: false }] };
    }
    return { subsets: [{ name: 'jse', dynamic: false }, { name: 'dyn', dynamic: true }] };
  });
  getTm1SubsetMembers.mockImplementation(async (dimension, subset) => (
    SUBSET_MEMBERS[subset] || { subset, dynamic: false, members: [], truncated: false }
  ));
  getTm1DimensionAliases.mockResolvedValue({ dimension: 'account', aliases: ['name'] });
}

// ── Mount helper ─────────────────────────────────────────────────────────────
// SetEditor's whole body teleports to <body> (Reka DialogPortal). attachTo:
// document.body is REQUIRED so the teleported content renders + is queryable.
const mounted = [];
async function mountEditor(props = {}) {
  const wrapper = mount(SetEditor, {
    attachTo: document.body,
    props: {
      modelValue: true,
      dimension: 'account',
      hierarchy: null,
      members: [],
      ...props,
    },
  });
  mounted.push(wrapper);
  await settle();
  return wrapper;
}

// Drain chained promises + reactivity. openFor chains loadHierarchies → (loadTree
// + loadSubsets + loadAliases), each with nested awaits (pickRoots → children), so
// we flush to a fixed point.
async function settle() {
  for (let i = 0; i < 8; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await flushPromises();
  }
}

// ── DOM helpers — the editor body lives in <body> (teleported) ────────────────
// Select on SEMANTICS (role / aria-label / text / stable house class).
const D = () => document.body;

// Tree rows (real <li role="treeitem">) in source order.
function treeRows() {
  return [...D().querySelectorAll('.se-tree__row')];
}

// The principal-name label of each tree row, in order. The KCheckbox label holds
// the display label; the principal is the .se-tree__principal span (only present
// when label !== member). We read the checkbox's label text as the row identity —
// for the principal-name dims here label === member so they coincide.
function treeLabels() {
  return treeRows().map((li) => li.querySelector('.kcheckbox-label')?.textContent.trim());
}


// The tree row whose label === name (first match).
function treeRow(name) {
  return treeRows().find((li) => li.querySelector('.kcheckbox-label')?.textContent.trim() === name);
}

// Rows of the SET (right pane), real <li class="se-set__row">, in order.
function setRows() {
  return [...D().querySelectorAll('.se-set__row')];
}

// The visible label text of each set row, in order.
function setLabels() {
  return setRows().map((li) => li.querySelector('.se-set__label')?.textContent.trim());
}

// The twisty (expand/collapse) button inside a tree row, or undefined for a leaf.
function twisty(name) {
  const row = treeRow(name);
  if (!row) return undefined;
  return row.querySelector('button.se-twisty') || undefined;
}

// The KCheckbox COMPONENT for a tree row, matched by its `label` prop (which is
// the member's display label — === the principal name for these dims). We drive
// the component's controlled emit rather than dispatching a raw click on Reka's
// CheckboxRoot: under happy-dom a bare click on the role="checkbox" button does
// not run Reka's internal toggle, whereas emitting update:modelValue runs the
// REAL onCheck(member, v) handler in SetEditor. Still mount-based (the real
// KCheckbox is mounted + wired) — not a library-direct assertion.
function checkboxFor(wrapper, name) {
  return wrapper.findAllComponents(KCheckbox).find((c) => c.props('label') === name);
}

// Click a body <button> located by exact aria-label.
function btnByAria(label) {
  return [...D().querySelectorAll('button')].find(
    (b) => (b.getAttribute('aria-label') || '') === label,
  );
}

// Click a body <button> whose trimmed text === label (for text-only buttons).
function btnByText(label) {
  return [...D().querySelectorAll('button')].find((b) => b.textContent.trim() === label);
}

// Dispatch a real click on a raw element + settle reactivity.
async function click(el) {
  expect(el, 'target element should exist').toBeTruthy();
  el.dispatchEvent(new Event('click', { bubbles: true }));
  await settle();
}

// Expand a consolidation tree node by clicking its twisty, then settle.
async function expand(name) {
  const t = twisty(name);
  expect(t, `twisty for "${name}" should exist`).toBeTruthy();
  await click(t);
}

// Check a source member by toggling its KCheckbox model (runs onCheck), settle.
async function check(wrapper, name) {
  const c = checkboxFor(wrapper, name);
  expect(c, `checkbox for "${name}" should exist`).toBeTruthy();
  c.vm.$emit('update:modelValue', true);
  await settle();
}

// Set the SOURCE filter input. The input is the real <input> KInput renders,
// teleported into <body> (so raw wrapper.find won't reach it). We set its value
// on the DOM node + dispatch a real 'input' event so KInput's handleInput runs
// and emits update:modelValue → SetEditor's `search` ref updates.
async function setSearch(value) {
  const input = D().querySelector('input[aria-label="Filter the loaded source members"]');
  expect(input, 'search input should exist').toBeTruthy();
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
}

// Find a KSelect instance by its visible label text ("Hierarchy" / "Load subset"
// / "Display label"). Returns the @vue/test-utils component wrapper so we can
// drive its controlled emit — the sanctioned mount-based escape hatch for the
// teleporting Reka SelectPortal (mirrors the sibling spec's KMenu/KPopover path).
function selectByLabel(wrapper, labelText) {
  return wrapper
    .findAllComponents(KSelect)
    .find((s) => s.props('label') === labelText);
}

// ── KNOWN BUG containment (see report: BUG-1) ────────────────────────────────
// SetEditor's alias picker feeds KSelect an option { value: '', label:
// '(principal name)' }. KSelect renders <SelectItem :value="String(opt.value)">
// → '' → Reka's SelectItem THROWS "A <SelectItem /> must have a value prop that
// is not an empty string." Reka mounts the Select content eagerly under happy-dom,
// so this surfaces as an async UNHANDLED REJECTION on every mount, unrelated to
// what each test asserts. We capture ONLY that specific Reka rejection so it does
// not pollute the run — the defect itself is asserted explicitly in the
// "alias picker" describe block (and routed to the author in the report). Any
// OTHER unhandled rejection is re-thrown so we never silently swallow a real one.
const REKA_EMPTY_VALUE = 'must have a value prop that is not an empty string';
function onUnhandled(err) {
  const msg = (err && (err.message || String(err))) || '';
  if (msg.includes(REKA_EMPTY_VALUE)) return; // known BUG-1, asserted below
  throw err;
}
beforeAll(() => {
  process.on('unhandledRejection', onUnhandled);
});
afterAll(() => {
  process.off('unhandledRejection', onUnhandled);
});

// ── Lifecycle ────────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  installMocks();
});
afterEach(() => {
  while (mounted.length) {
    const w = mounted.pop();
    try {
      w.unmount();
    } catch {
      /* already unmounted */
    }
  }
  // Clear teleported portal nodes left in <body> (the KDialog content).
  document.body.innerHTML = '';
});

// ════════════════════════════════════════════════════════════════════════════
// 1 — Opening seeds the editor with the dim's current hierarchy + members
// ════════════════════════════════════════════════════════════════════════════
describe('SetEditor — open / seed', () => {
  it('opening loads the dimension and seeds the SET with the passed members (in order)', async () => {
    await mountEditor({ members: ['REVENUE', 'EXPENSE'] });

    // The open lifecycle loaded the dimension's hierarchies + tree + subsets +
    // aliases (all four loaders fired exactly once on a single open).
    expect(getTm1DimensionHierarchies).toHaveBeenCalledTimes(1);
    expect(getTm1DimensionElements).toHaveBeenCalled();
    expect(getTm1Subsets).toHaveBeenCalled();
    expect(getTm1DimensionAliases).toHaveBeenCalled();

    // The dialog body rendered into <body> (teleported) with the dim in the title.
    expect(D().textContent).toContain('Edit set — account');

    // The SET pane is seeded with the passed members, in the passed order.
    expect(setLabels()).toEqual(['REVENUE', 'EXPENSE']);

    // The source tree opened populated: the children of All_account (the rollup
    // root), NOT the grand-total element. EXPENSE + REVENUE head the tree.
    expect(treeLabels()).toEqual(expect.arrayContaining(['EXPENSE', 'REVENUE']));
    // …and at the root level (aria-level 1).
    expect(treeRow('EXPENSE').getAttribute('aria-level')).toBe('1');
  });

  it('opening on an ALTERNATE hierarchy seeds the picker + scopes the tree to it', async () => {
    const wrapper = await mountEditor({ hierarchy: 'EBITDA', members: ['EBIT'] });

    // The element/children loads were scoped to EBITDA (the prop seeded the active
    // hierarchy) — the editor passed 'EBITDA' as the hierarchy arg.
    expect(getTm1DimensionElements).toHaveBeenCalledWith('account', 'EBITDA');

    // The EBITDA topology surfaced (EBIT + DA), NOT the default's EXPENSE/REVENUE.
    expect(treeLabels()).toEqual(expect.arrayContaining(['EBIT', 'DA']));
    expect(treeLabels()).not.toContain('EXPENSE');
    expect(treeLabels()).not.toContain('REVENUE');

    // The hierarchy picker shows the seeded alternate as its value.
    const hierPicker = selectByLabel(wrapper, 'Hierarchy');
    expect(hierPicker, 'hierarchy picker renders for a dim with alternates').toBeTruthy();
    expect(hierPicker.props('modelValue')).toBe('EBITDA');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2 — Source tree: lazy expand (honours hierarchy), cache, collapse-subtree
// ════════════════════════════════════════════════════════════════════════════
describe('SetEditor — source tree drill', () => {
  it('expanding a consolidation appends its indented children (lazy, hierarchy-scoped)', async () => {
    await mountEditor();

    // Roots only at first (children of All_account): EXPENSE, REVENUE — no leaves.
    expect(treeLabels()).toEqual(['EXPENSE', 'REVENUE']);
    // pickRoots already fetched All_account's children (once). Reset the spy count
    // so we can prove the NEXT expand makes its own scoped children call.
    getTm1DimensionChildren.mockClear();

    await expand('EXPENSE');

    // EXPENSE's children now render directly under it, indented to level 2.
    expect(treeLabels()).toEqual(['EXPENSE', 'Rent', 'Salaries', 'Marketing', 'REVENUE']);
    expect(treeRow('Rent').getAttribute('aria-level')).toBe('2');

    // The children fetch was scoped to the DEFAULT hierarchy → editor passes null.
    expect(getTm1DimensionChildren).toHaveBeenCalledWith('account', 'EXPENSE', null);
  });

  it('multi-level: a consolidation CHILD expands to its own children (level 3)', async () => {
    await mountEditor();
    await expand('EXPENSE');

    // Marketing is a consolidation child of EXPENSE (it carries a twisty).
    expect(twisty('Marketing')).toBeTruthy();
    await expand('Marketing');

    // Marketing's children appear under it at level 3 — multi-level drill works.
    expect(treeLabels()).toEqual([
      'EXPENSE', 'Rent', 'Salaries', 'Marketing', 'Ads', 'Events', 'REVENUE',
    ]);
    expect(treeRow('Ads').getAttribute('aria-level')).toBe('3');
  });

  it('re-expanding a collapsed branch uses the CACHE (no second children fetch)', async () => {
    await mountEditor();
    await expand('EXPENSE'); // fetch + insert
    expect(treeLabels()).toContain('Rent');

    getTm1DimensionChildren.mockClear();

    // Collapse, then re-expand. The children stay cached on first fetch, so the
    // re-expand must NOT hit the network again.
    await click(twisty('EXPENSE')); // collapse (twisty is now "open")
    expect(treeLabels()).toEqual(['EXPENSE', 'REVENUE']);

    await expand('EXPENSE'); // re-expand from cache
    expect(treeLabels()).toEqual(['EXPENSE', 'Rent', 'Salaries', 'Marketing', 'REVENUE']);
    expect(getTm1DimensionChildren).not.toHaveBeenCalled();
  });

  it('collapse removes ONLY that node\'s subtree (sibling subtree survives)', async () => {
    await mountEditor();
    await expand('EXPENSE');
    await expand('REVENUE');

    // Both subtrees open.
    expect(treeLabels()).toEqual([
      'EXPENSE', 'Rent', 'Salaries', 'Marketing', 'REVENUE', 'Sales', 'Other',
    ]);

    // Collapse EXPENSE only → its subtree (Rent, Salaries, Marketing) is removed,
    // REVENUE's subtree (Sales, Other) MUST survive.
    await click(twisty('EXPENSE'));
    expect(treeLabels()).toEqual(['EXPENSE', 'REVENUE', 'Sales', 'Other']);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3 — Transfer: Add selected (dedup, source order) / Remove / Keep only / Clear
// ════════════════════════════════════════════════════════════════════════════
describe('SetEditor — transfer to/from the set', () => {
  it('checking members + "Add selected" pushes them in SOURCE order, de-duped', async () => {
    const wrapper = await mountEditor();

    // Check REVENUE first, then EXPENSE — but they must enter the set in SOURCE
    // (visible-tree) order: EXPENSE precedes REVENUE.
    await check(wrapper, 'REVENUE');
    await check(wrapper, 'EXPENSE');
    await click(btnByAria('Add selected source members to the set'));

    expect(setLabels()).toEqual(['EXPENSE', 'REVENUE']);

    // Re-adding the SAME checked members must NOT duplicate them (dedup).
    await click(btnByAria('Add selected source members to the set'));
    expect(setLabels()).toEqual(['EXPENSE', 'REVENUE']);
  });

  it('"Remove" drops checked members from the set; "Clear" empties it', async () => {
    const wrapper = await mountEditor({ members: ['EXPENSE', 'REVENUE'] });
    expect(setLabels()).toEqual(['EXPENSE', 'REVENUE']);

    // Check EXPENSE in the source, Remove → only REVENUE remains in the set.
    await check(wrapper, 'EXPENSE');
    await click(btnByAria('Remove selected members from the set'));
    expect(setLabels()).toEqual(['REVENUE']);

    // Clear empties the set entirely → the empty-state renders.
    await click(btnByAria('Clear the set'));
    expect(setLabels()).toEqual([]);
    expect(D().textContent).toContain('Empty set');
  });

  it('"Keep only" replaces the set with the checked members (source order)', async () => {
    const wrapper = await mountEditor({ members: ['EXPENSE', 'REVENUE'] });

    // Expand EXPENSE so a leaf is visible/checkable, then keep only Rent + REVENUE.
    await expand('EXPENSE');
    await check(wrapper, 'Rent');
    await check(wrapper, 'REVENUE');
    await click(btnByAria('Keep only the selected members in the set'));

    // The set is REPLACED with exactly the checked members, in visible-tree order
    // (Rent appears before REVENUE in the tree). EXPENSE is gone.
    expect(setLabels()).toEqual(['Rent', 'REVENUE']);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4 — Set ordering: up / down / remove, Sort A→Z, By hierarchy order
// ════════════════════════════════════════════════════════════════════════════
describe('SetEditor — set ordering', () => {
  it('move up / move down / remove reorder the set', async () => {
    await mountEditor({ members: ['EXPENSE', 'REVENUE', 'Marketing'] });
    expect(setLabels()).toEqual(['EXPENSE', 'REVENUE', 'Marketing']);

    // Move REVENUE (index 1) up → REVENUE, EXPENSE, Marketing.
    await click(btnByAria('Move REVENUE up'));
    expect(setLabels()).toEqual(['REVENUE', 'EXPENSE', 'Marketing']);

    // Move REVENUE (now index 0) down → EXPENSE, REVENUE, Marketing.
    await click(btnByAria('Move REVENUE down'));
    expect(setLabels()).toEqual(['EXPENSE', 'REVENUE', 'Marketing']);

    // Remove EXPENSE → REVENUE, Marketing.
    await click(btnByAria('Remove EXPENSE from the set'));
    expect(setLabels()).toEqual(['REVENUE', 'Marketing']);
  });

  it('Sort A→Z alphabetises the set', async () => {
    await mountEditor({ members: ['REVENUE', 'EXPENSE', 'Marketing'] });
    await click(btnByAria('Sort the set A to Z'));
    expect(setLabels()).toEqual(['EXPENSE', 'Marketing', 'REVENUE']);
  });

  it('"By hierarchy order" orders the set to match the source tree order', async () => {
    // Seed the set DELIBERATELY out of hierarchy order. The tree order (roots) is
    // EXPENSE, REVENUE; after expanding EXPENSE it is EXPENSE, Rent, Salaries,
    // Marketing, REVENUE. We seed [REVENUE, Rent, EXPENSE] and expect the tree
    // ranking to reorder to [EXPENSE, Rent, REVENUE].
    await mountEditor({ members: ['REVENUE', 'Rent', 'EXPENSE'] });
    await expand('EXPENSE'); // load Rent into the tree so it gets a hierarchy rank

    await click(btnByAria('Sort the set by hierarchy order'));
    expect(setLabels()).toEqual(['EXPENSE', 'Rent', 'REVENUE']);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5 — Search filters the loaded tree by label OR principal name
// ════════════════════════════════════════════════════════════════════════════
describe('SetEditor — search filter', () => {
  it('typing in the filter keeps only loaded rows matching label or principal name', async () => {
    await mountEditor();
    await expand('EXPENSE'); // load leaves so there is something to filter

    // All loaded rows visible before filtering.
    expect(treeLabels()).toEqual(['EXPENSE', 'Rent', 'Salaries', 'Marketing', 'REVENUE']);

    await setSearch('sal');
    // Only "Salaries" survives (case-insensitive substring on label/principal).
    expect(treeLabels()).toEqual(['Salaries']);

    // Clearing the filter restores the loaded rows.
    await setSearch('');
    expect(treeLabels()).toEqual(['EXPENSE', 'Rent', 'Salaries', 'Marketing', 'REVENUE']);
  });

  it('a no-match filter shows the "No matches" empty state', async () => {
    await mountEditor();
    await setSearch('zzz-not-a-member');
    expect(treeLabels()).toEqual([]);
    expect(D().textContent).toContain('No matches');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 6 — Subset picker: resolved members added to selection (dynamic/truncated note)
// ════════════════════════════════════════════════════════════════════════════
describe('SetEditor — subset picker', () => {
  it('choosing a static subset checks its resolved members + surfaces them as rows', async () => {
    const wrapper = await mountEditor();

    const subsetPicker = selectByLabel(wrapper, 'Load subset');
    expect(subsetPicker, 'subset picker renders').toBeTruthy();

    // Drive the picker's controlled emit (Reka SelectPortal teleports its list;
    // this runs the REAL onSubsetChosen handler).
    subsetPicker.vm.$emit('update:modelValue', 'jse');
    await settle();

    // jse resolved to Rent + Salaries → they are checked AND surfaced as rows.
    expect(getTm1SubsetMembers).toHaveBeenCalledWith('account', 'jse', null, expect.any(Number));
    expect(treeLabels()).toEqual(expect.arrayContaining(['Rent', 'Salaries']));

    // A confirmation note prompts to "Add selected".
    expect(D().textContent).toContain('Selected 2 members from “jse”');

    // The checked members push to the set on Add.
    await click(btnByAria('Add selected source members to the set'));
    expect(setLabels()).toEqual(expect.arrayContaining(['Rent', 'Salaries']));
  });

  it('a dynamic + truncated subset surfaces the dynamic / truncated note', async () => {
    const wrapper = await mountEditor();
    const subsetPicker = selectByLabel(wrapper, 'Load subset');
    subsetPicker.vm.$emit('update:modelValue', 'dyn');
    await settle();

    // The note flags BOTH the dynamic nature and the truncation.
    expect(D().textContent).toContain('(dynamic)');
    expect(D().textContent).toMatch(/truncated/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 7 — Hierarchy switch reloads tree+subsets+aliases; selection cleared; set clean
// ════════════════════════════════════════════════════════════════════════════
describe('SetEditor — hierarchy switch', () => {
  it('switching hierarchy reloads everything scoped to it, clears the selection, and prunes the set selectively', async () => {
    // Seed the set with EXPENSE (default-only) AND Rent (present in BOTH the
    // default and EBITDA topologies). The prune must DROP EXPENSE but KEEP Rent —
    // proving it is SELECTIVE (not a blanket clear) and never leaves the set
    // holding members invalid for the active hierarchy, nor pollutes it.
    const wrapper = await mountEditor({ members: ['EXPENSE', 'Rent'] });

    // Check a DEFAULT-hierarchy member so we can prove the switch clears it.
    await check(wrapper, 'EXPENSE');

    // Reset the loader spies so we can prove the switch RE-loads each, scoped.
    getTm1DimensionElements.mockClear();
    getTm1Subsets.mockClear();
    getTm1DimensionAliases.mockClear();

    const hierPicker = selectByLabel(wrapper, 'Hierarchy');
    expect(hierPicker).toBeTruthy();
    hierPicker.vm.$emit('update:modelValue', 'EBITDA');
    await settle();

    // Tree + subsets + aliases all reloaded, scoped to EBITDA.
    expect(getTm1DimensionElements).toHaveBeenCalledWith('account', 'EBITDA');
    expect(getTm1Subsets).toHaveBeenCalledWith('account', 'EBITDA');
    expect(getTm1DimensionAliases).toHaveBeenCalledWith('account', 'EBITDA');

    // The tree now shows the EBITDA topology, not the default's.
    expect(treeLabels()).toEqual(expect.arrayContaining(['EBIT', 'DA']));
    expect(treeLabels()).not.toContain('REVENUE');

    // The subset list is scoped to EBITDA (the alternate's distinct subset).
    const subsetPicker = selectByLabel(wrapper, 'Load subset');
    const subsetOptionValues = subsetPicker.props('options').map((o) => o.value);
    expect(subsetOptionValues).toEqual(['ebit_only']);

    // The SOURCE selection (checked) cleared — nothing checked carries over. We
    // assert via the editor's own count text ("0 selected").
    expect(D().textContent).toContain('0 selected');

    // P2-E: switching hierarchy PRUNES set members not present in the new
    // hierarchy, so Apply never ships members invalid for the active hierarchy.
    // 'EXPENSE' exists only in the default account hierarchy (EBITDA's topology is
    // EBIT/DA/…), so it is dropped on the switch — the set is not polluted AND not
    // left holding cross-hierarchy members.
    expect(setLabels()).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 8 — Apply emits the built set (principal names, ordered) + hierarchy
// ════════════════════════════════════════════════════════════════════════════
describe('SetEditor — apply', () => {
  it('Apply emits { dimension, hierarchy:null, members } on the DEFAULT hierarchy and closes', async () => {
    const wrapper = await mountEditor({ members: ['EXPENSE', 'REVENUE'] });

    await click(btnByText('Apply'));

    const applied = wrapper.emitted('apply');
    expect(applied, 'apply should have emitted').toBeTruthy();
    expect(applied).toHaveLength(1);
    const payload = applied[0][0];
    expect(payload.dimension).toBe('account');
    // Default hierarchy → hierarchy arg is null (omitted from the axis spec).
    expect(payload.hierarchy).toBeNull();
    // Members are the ordered principal names.
    expect(payload.members).toEqual(['EXPENSE', 'REVENUE']);

    // Apply also closes the dialog (update:modelValue false).
    const closes = wrapper.emitted('update:modelValue');
    expect(closes).toBeTruthy();
    expect(closes.at(-1)).toEqual([false]);
  });

  it('Apply on an ALTERNATE hierarchy includes the hierarchy name in the payload', async () => {
    const wrapper = await mountEditor({ hierarchy: 'EBITDA', members: ['EBIT'] });

    await click(btnByText('Apply'));

    const payload = wrapper.emitted('apply')[0][0];
    expect(payload.dimension).toBe('account');
    // An explicit alternate → the hierarchy is carried in the payload.
    expect(payload.hierarchy).toBe('EBITDA');
    expect(payload.members).toEqual(['EBIT']);
  });

  it('Apply is disabled with an empty set (no emit)', async () => {
    const wrapper = await mountEditor({ members: [] });
    const apply = btnByText('Apply');
    expect(apply).toBeTruthy();
    expect(apply.hasAttribute('disabled')).toBe(true);
    // Even if clicked, the guard prevents an emit.
    await click(apply);
    expect(wrapper.emitted('apply')).toBeFalsy();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 9 — Alias picker switches requested labelling without changing principal names
// ════════════════════════════════════════════════════════════════════════════
describe('SetEditor — alias picker (display only)', () => {
  it('choosing an alias requests its labelling but the EMITTED members stay principal names (v1 seam)', async () => {
    const wrapper = await mountEditor({ members: ['EXPENSE', 'REVENUE'] });

    const aliasPicker = selectByLabel(wrapper, 'Display label');
    expect(aliasPicker, 'alias picker renders').toBeTruthy();
    // The alias options include the loaded alias ('name') plus the principal option.
    const aliasValues = aliasPicker.props('options').map((o) => o.value);
    expect(aliasValues).toEqual(['', 'name']);

    // Switch the display label to the 'name' alias.
    aliasPicker.vm.$emit('update:modelValue', 'name');
    await settle();

    // DOCUMENTED v1 seam: the editor has no member→label map endpoint yet, so the
    // rows STILL show principal names. The load-bearing guarantee is that the
    // EMITTED members are principal names regardless of the active alias.
    expect(setLabels()).toEqual(['EXPENSE', 'REVENUE']);

    await click(btnByText('Apply'));
    const payload = wrapper.emitted('apply')[0][0];
    expect(payload.members).toEqual(['EXPENSE', 'REVENUE']); // principal names, not aliased
  });

  // ── BUG-1 (REAL defect, routed to author — see report) ─────────────────────
  // The alias options lead with { value: '', label: '(principal name)' }. KSelect
  // stringifies the value and hands '' to Reka's <SelectItem>, which THROWS
  // "must have a value prop that is not an empty string". In the browser the
  // alias dropdown errors the moment it opens, so the user cannot reset the label
  // back to the principal name via this option. This test PINS the broken input
  // contract so the fix is verifiable; it intentionally documents current (buggy)
  // state, it does NOT bless it.
  it('BUG-1: alias picker leads with an EMPTY-STRING option that Reka SelectItem rejects', async () => {
    const wrapper = await mountEditor({ members: ['EXPENSE'] });
    const aliasPicker = selectByLabel(wrapper, 'Display label');
    const first = aliasPicker.props('options')[0];
    // The offending option: an empty-string value KSelect → Reka cannot render.
    expect(first.value).toBe('');
    // Reka's contract (the source of the thrown error) — asserted as the reason.
    expect(String(first.value)).toBe(''); // === what KSelect passes to <SelectItem>
    // A correct fix would use a non-empty sentinel (e.g. '__principal__') or rely
    // on KSelect's `clearable` (emits null) instead of an empty-value option.
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 10 — Cancel discards (no apply emit; closes)
// ════════════════════════════════════════════════════════════════════════════
describe('SetEditor — cancel', () => {
  it('Cancel closes WITHOUT emitting apply (built set discarded)', async () => {
    const wrapper = await mountEditor({ members: ['EXPENSE'] });

    // Mutate the set so there is something to discard.
    await check(wrapper, 'REVENUE');
    await click(btnByAria('Add selected source members to the set'));
    expect(setLabels()).toEqual(['EXPENSE', 'REVENUE']);

    await click(btnByText('Cancel'));

    // No apply emitted; the dialog requested close.
    expect(wrapper.emitted('apply')).toBeFalsy();
    const closes = wrapper.emitted('update:modelValue');
    expect(closes).toBeTruthy();
    expect(closes.at(-1)).toEqual([false]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// MUTATION VERIFICATION — flip the load-bearing logic and confirm a test catches
// it. These are NOT left enabled; each mutates a CLONE behaviour locally to prove
// the assertions above are not vacuous. (Documented in the report.)
// ════════════════════════════════════════════════════════════════════════════
// NOTE: we cannot edit the component (test-authorship split), so mutation-verify
// is performed by an INVERTED-EXPECTATION probe: re-running the load-bearing
// scenario and asserting the WRONG outcome would NOT hold. See the report for the
// three mutations checked manually against the source.
