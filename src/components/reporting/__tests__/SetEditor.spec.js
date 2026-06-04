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

// ── Mock the network boundary — the TM1 HTTP functions SetEditor imports ──────
// getTm1ElementLabels is the alias-relabel endpoint added with the fix: when an
// alias is active, ensureAliasLabels() reads member principal name → alias value
// from it and fills the reactive aliasLabels map. It MUST be in the mock (the
// real fn batches HTTP GETs); without it the import is undefined and the editor
// throws the moment an alias is chosen.
vi.mock('../../../api/planningAnalytics', () => ({
  getTm1DimensionHierarchies: vi.fn(),
  getTm1DimensionElements: vi.fn(),
  getTm1DimensionChildren: vi.fn(),
  getTm1Subsets: vi.fn(),
  getTm1SubsetMembers: vi.fn(),
  getTm1DimensionAliases: vi.fn(),
  getTm1ElementLabels: vi.fn(),
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
  getTm1ElementLabels,
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
  // Default alias-relabel: resolve to NO labels, so the editor falls back to
  // principal names (labelFor(m) === m). Tests that exercise relabelling override
  // this with mockResolvedValueOnce / a member→label map (see ALIAS_LABELS).
  getTm1ElementLabels.mockResolvedValue({ labels: {} });
}

// A realistic alias-label map for the 'name' alias: a couple of principal names
// resolve to human display labels (the rest fall back to their own key, exactly
// as a real TM1 }ElementAttributes lookup with sparse alias values behaves).
const ALIAS_LABELS = {
  EXPENSE: 'Operating Expenses',
  REVENUE: 'Total Revenue',
  Rent: 'Premises Rent',
};

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

// The set of PRINCIPAL names still surfaced on tree rows (the .se-tree__principal
// span renders ONLY when the display label differs from the principal name, i.e.
// when an alias has relabelled the row — so this proves the principal name is
// still reachable after a relabel, per the design).
function treePrincipals() {
  return treeRows()
    .map((li) => li.querySelector('.se-tree__principal')?.textContent.trim())
    .filter(Boolean);
}

// Rows of the SET (right pane), real <li class="se-set__row">, in order.
function setRows() {
  return [...D().querySelectorAll('.se-set__row')];
}

// The visible label text of each set row, in order.
function setLabels() {
  return setRows().map((li) => li.querySelector('.se-set__label')?.textContent.trim());
}

// The `title` attr of each set row label, in order. When a row is relabelled the
// editor sets title="Principal name: <member>" so the principal name stays
// discoverable on hover — we assert it carries the principal after a relabel.
function setLabelTitles() {
  return setRows().map((li) => li.querySelector('.se-set__label')?.getAttribute('title') || '');
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

// ── Reka empty-string SelectItem guard (now a SAFETY NET, not a known bug) ────
// History: the alias picker used to feed KSelect an option { value: '', label:
// '(principal name)' }; KSelect renders <SelectItem :value="String(opt.value)">
// → '' → Reka's SelectItem THROWS "A <SelectItem /> must have a value prop that
// is not an empty string", which surfaced as an async unhandled rejection on
// every mount. The fix replaced the empty value with the PRINCIPAL_SENTINEL
// ('__principal__'), so this rejection should NO LONGER fire — the alias picker
// describe block now asserts the FIX (non-empty sentinel, selectable). We keep
// the matcher as a defensive net: if the empty-string regression ever returns it
// is swallowed here only to keep the run readable, but the sentinel assertions
// below would already be RED. Every OTHER unhandled rejection is re-thrown so we
// never silently swallow a real one.
const REKA_EMPTY_VALUE = 'must have a value prop that is not an empty string';
function onUnhandled(err) {
  const msg = (err && (err.message || String(err))) || '';
  if (msg.includes(REKA_EMPTY_VALUE)) return; // regression net (see note above)
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
    // 'EXPENSE' exists only in the default account hierarchy → DROPPED. 'Rent'
    // exists in EBITDA too → KEPT. So the set is neither polluted nor blanket-
    // cleared: exactly the cross-hierarchy member survives.
    expect(setLabels()).toEqual(['Rent']);
    // And the drop is surfaced to the user (the "Dropped N member…" tree note).
    expect(D().textContent).toMatch(/Dropped 1 member/i);
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
// 9 — Alias picker: relabels BOTH panes (display only) while the EMITTED members
//      stay principal names. Covers the fix: non-empty sentinel + ensureAliasLabels.
// ════════════════════════════════════════════════════════════════════════════
describe('SetEditor — alias picker (display only)', () => {
  // REALIGNED from the obsolete "v1 seam" test. The v1 premise (choosing an alias
  // is a no-op because there's no label endpoint) is dead: ensureAliasLabels now
  // calls getTm1ElementLabels and relabels the rows reactively. We assert the
  // relabel happens AND keep the load-bearing guarantee — Apply ships PRINCIPAL
  // names regardless of the active alias (the alias is display-only).
  it('choosing an alias relabels the rows but the EMITTED members stay principal names', async () => {
    getTm1ElementLabels.mockResolvedValue({ alias: 'name', labels: ALIAS_LABELS });
    const wrapper = await mountEditor({ members: ['EXPENSE', 'REVENUE'] });

    const aliasPicker = selectByLabel(wrapper, 'Display label');
    expect(aliasPicker, 'alias picker renders').toBeTruthy();
    // The alias options now lead with the NON-EMPTY principal sentinel (Reka
    // rejects '' — see the sentinel test below), then the loaded alias ('name').
    const aliasValues = aliasPicker.props('options').map((o) => o.value);
    expect(aliasValues).toEqual(['__principal__', 'name']);

    // Switch the display label to the 'name' alias → onAliasChange fires the
    // relabel for everything visible + in the set.
    aliasPicker.vm.$emit('update:modelValue', 'name');
    await settle();

    // The SET pane now shows the alias VALUES (not the principal names).
    expect(setLabels()).toEqual(['Operating Expenses', 'Total Revenue']);

    // The load-bearing guarantee: Apply still ships PRINCIPAL names — the alias is
    // display only and must never leak into the emitted member list.
    await click(btnByText('Apply'));
    const payload = wrapper.emitted('apply')[0][0];
    expect(payload.members).toEqual(['EXPENSE', 'REVENUE']); // principal, not aliased
  });

  // REALIGNED from the obsolete "BUG-1 pins the empty-string option" test. The
  // bug is fixed: the principal option uses a NON-EMPTY sentinel Reka accepts, and
  // selecting it puts the editor back into principal-name mode.
  it("alias picker's principal option uses a non-empty sentinel Reka accepts (and selecting it restores principal names)", async () => {
    getTm1ElementLabels.mockResolvedValue({ alias: 'name', labels: ALIAS_LABELS });
    const wrapper = await mountEditor({ members: ['EXPENSE', 'REVENUE'] });
    const aliasPicker = selectByLabel(wrapper, 'Display label');

    // The lead option is the "(principal name)" entry — its value is the non-empty
    // sentinel, which is exactly what KSelect hands to Reka's <SelectItem> as
    // String(value). A non-empty string is renderable (the old '' threw).
    const first = aliasPicker.props('options')[0];
    expect(first.label).toBe('(principal name)');
    expect(first.value).toBe('__principal__');
    expect(String(first.value)).not.toBe(''); // what KSelect passes to <SelectItem>

    // Relabel via 'name', then pick the sentinel → the editor returns to
    // principal-name mode and the rows revert to principal names.
    aliasPicker.vm.$emit('update:modelValue', 'name');
    await settle();
    expect(setLabels()).toEqual(['Operating Expenses', 'Total Revenue']);

    aliasPicker.vm.$emit('update:modelValue', '__principal__');
    await settle();
    expect(setLabels()).toEqual(['EXPENSE', 'REVENUE']); // back to principal names
  });

  it('relabels BOTH panes; the principal name stays discoverable; the sentinel reverts (clears aliasLabels)', async () => {
    // Map a tree root + a leaf to alias values; REVENUE deliberately has NO alias
    // value, proving sparse maps fall back to the principal key.
    getTm1ElementLabels.mockResolvedValue({
      alias: 'name',
      labels: { EXPENSE: 'Operating Expenses', Rent: 'Premises Rent' },
    });
    const wrapper = await mountEditor({ members: ['EXPENSE', 'REVENUE'] });
    await expand('EXPENSE'); // bring Rent (a leaf) into the tree so it can relabel

    const aliasPicker = selectByLabel(wrapper, 'Display label');
    aliasPicker.vm.$emit('update:modelValue', 'name');
    await settle();

    // TREE pane relabels: the EXPENSE row's checkbox label is now the alias value,
    // and Rent's too; REVENUE (no alias value) keeps its principal name.
    expect(treeLabels()).toEqual(
      expect.arrayContaining(['Operating Expenses', 'Premises Rent', 'REVENUE']),
    );
    // …and the PRINCIPAL names of the relabelled rows are still reachable via the
    // .se-tree__principal span (it renders only when label !== member).
    expect(treePrincipals()).toEqual(expect.arrayContaining(['EXPENSE', 'Rent']));

    // SET pane relabels too: EXPENSE → its alias value; REVENUE has no alias value
    // in this map so it falls back to its principal name.
    expect(setLabels()).toEqual(['Operating Expenses', 'REVENUE']);
    // The relabelled set row keeps the principal name on its title for hover.
    expect(setLabelTitles()).toContain('Principal name: EXPENSE');

    // Pick the principal sentinel → aliasLabels is cleared, so EVERY label reverts
    // to its principal key in BOTH panes (observable proof the map was emptied).
    aliasPicker.vm.$emit('update:modelValue', '__principal__');
    await settle();
    expect(setLabels()).toEqual(['EXPENSE', 'REVENUE']);
    expect(treeLabels()).toEqual(
      expect.arrayContaining(['EXPENSE', 'Rent', 'REVENUE']),
    );
    // With no alias active, no row differs from its principal → no principal spans.
    expect(treePrincipals()).toEqual([]);
  });

  it('onAliasChange maps the sentinel to principal-name mode (no relabel call); a real alias calls getTm1ElementLabels with the right args', async () => {
    getTm1ElementLabels.mockResolvedValue({ alias: 'name', labels: ALIAS_LABELS });
    const wrapper = await mountEditor({ members: ['EXPENSE', 'REVENUE'] });
    const aliasPicker = selectByLabel(wrapper, 'Display label');

    // Emitting the sentinel → principal-name mode. The else-branch of onAliasChange
    // clears labels and never calls the label endpoint.
    getTm1ElementLabels.mockClear();
    aliasPicker.vm.$emit('update:modelValue', '__principal__');
    await settle();
    expect(setLabels()).toEqual(['EXPENSE', 'REVENUE']); // unchanged — principal mode
    expect(getTm1ElementLabels).not.toHaveBeenCalled();

    // Emitting a REAL alias → ensureAliasLabels calls the endpoint with the active
    // dimension, the alias, the members to label, and the (default) hierarchy arg.
    getTm1ElementLabels.mockClear();
    aliasPicker.vm.$emit('update:modelValue', 'name');
    await settle();
    expect(getTm1ElementLabels).toHaveBeenCalledWith(
      'account',
      'name',
      expect.arrayContaining(['EXPENSE', 'REVENUE']),
      null, // default hierarchy → null arg
    );
  });

  it('mid-flight guard: switching back to principal before the labels resolve does NOT apply the late labels', async () => {
    // A DEFERRED label promise we resolve by hand, so we can interleave a second
    // alias change before it lands.
    let resolveLabels;
    const deferred = new Promise((res) => {
      resolveLabels = res;
    });
    getTm1ElementLabels.mockReturnValueOnce(deferred);

    const wrapper = await mountEditor({ members: ['EXPENSE', 'REVENUE'] });
    const aliasPicker = selectByLabel(wrapper, 'Display label');

    // Choose 'name' → ensureAliasLabels is awaiting the deferred promise.
    aliasPicker.vm.$emit('update:modelValue', 'name');
    await settle();
    expect(setLabels()).toEqual(['EXPENSE', 'REVENUE']); // not landed yet

    // Switch back to principal BEFORE the labels resolve (activeAlias → '').
    aliasPicker.vm.$emit('update:modelValue', '__principal__');
    await settle();

    // Now the late labels arrive — the in-flight guard (activeAlias !== alias)
    // must DISCARD them: the rows stay principal, not relabelled to the alias.
    resolveLabels({ alias: 'name', labels: ALIAS_LABELS });
    await settle();
    expect(setLabels()).toEqual(['EXPENSE', 'REVENUE']); // late labels discarded
  });

  it('error path: a rejected label fetch keeps principal names (no throw) and does not poison the cache', async () => {
    // First alias activation rejects → rows must stay principal, no unhandled throw.
    getTm1ElementLabels.mockRejectedValueOnce(new Error('TM1 element-labels 503'));
    const wrapper = await mountEditor({ members: ['EXPENSE', 'REVENUE'] });
    const aliasPicker = selectByLabel(wrapper, 'Display label');

    aliasPicker.vm.$emit('update:modelValue', 'name');
    await settle();
    expect(setLabels()).toEqual(['EXPENSE', 'REVENUE']); // error swallowed → principal

    // The cache wasn't poisoned: switch back to principal, then re-pick 'name' with
    // a now-succeeding endpoint → the relabel resolves (the failed members weren't
    // cached to their principal key, so the retry actually fetches + relabels).
    aliasPicker.vm.$emit('update:modelValue', '__principal__');
    await settle();
    getTm1ElementLabels.mockResolvedValueOnce({ alias: 'name', labels: ALIAS_LABELS });
    aliasPicker.vm.$emit('update:modelValue', 'name');
    await settle();
    expect(setLabels()).toEqual(['Operating Expenses', 'Total Revenue']);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 9b — Metadata memo (_metaCache): loaders hit the API once per (dim,hier) per
//      session, across dialog reopens and hierarchy toggle-backs.
// ════════════════════════════════════════════════════════════════════════════
// _metaCache is MODULE-LEVEL in SetEditor.vue → it persists across mounts within
// this file run and is NOT resettable from the test (no exported reset). The
// `account` dim used by every other test warms its cache early, so a call-count
// assertion there would be meaningless. We therefore measure against a FRESH
// dimension ('project') that NO other test touches, keeping its cache cold until
// this block runs. We also drive reopen via a real modelValue toggle on the SAME
// wrapper (the open watcher fires on false→true) — remounting a new instance would
// NOT re-run openFor, because the module-level lastSeededDim guard suppresses the
// mount-time seed once the dim has been seen.
describe('SetEditor — metadata memo (_metaCache)', () => {
  // Project-scoped mocks: a default hierarchy + one alternate, distinct topology.
  function installProjectMocks() {
    getTm1DimensionHierarchies.mockResolvedValue({
      dimension: 'project',
      default: 'project',
      hierarchies: [
        { name: 'project', is_default: true },
        { name: 'PHASE', is_default: false },
      ],
      has_alternates: true,
    });
    getTm1DimensionElements.mockImplementation(async (dimension, hierarchy = null) => {
      if (hierarchy === 'PHASE') {
        return { dimension, elements: [{ name: 'Phase1', type: 'C' }, { name: 'Task_P', type: 'N' }] };
      }
      return { dimension, elements: [{ name: 'Alpha', type: 'C' }, { name: 'Beta', type: 'N' }] };
    });
    getTm1DimensionChildren.mockImplementation(async (dimension, parent) => {
      if (parent === 'Alpha') return { dimension, parent, children: [{ name: 'Beta', type: 'N' }] };
      if (parent === 'Phase1') return { dimension, parent, children: [{ name: 'Task_P', type: 'N' }] };
      return { dimension, parent, children: [] };
    });
    getTm1Subsets.mockImplementation(async (dimension, hierarchy = null) => (
      hierarchy === 'PHASE'
        ? { subsets: [{ name: 'phase_set', dynamic: false }] }
        : { subsets: [{ name: 'proj_set', dynamic: false }] }
    ));
    getTm1DimensionAliases.mockResolvedValue({ dimension: 'project', aliases: ['name'] });
  }

  it('reopening the SAME dimension+hierarchy serves metadata from the cache (each loader called once across both opens)', async () => {
    installProjectMocks();
    const wrapper = await mountEditor({ dimension: 'project', members: ['Alpha'] });

    // First open hit each loader exactly once for project::default.
    expect(getTm1DimensionHierarchies).toHaveBeenCalledTimes(1);
    expect(getTm1DimensionElements).toHaveBeenCalledTimes(1);
    expect(getTm1Subsets).toHaveBeenCalledTimes(1);
    expect(getTm1DimensionAliases).toHaveBeenCalledTimes(1);

    // Close (the open watcher will re-fire on the next open), then reopen the SAME
    // dim+hierarchy. The reopen must serve everything from _metaCache → NO new calls.
    wrapper.setProps({ modelValue: false });
    await settle();
    wrapper.setProps({ modelValue: true });
    await settle();

    // Still exactly once each — the reopen was fully cache-served.
    expect(getTm1DimensionHierarchies).toHaveBeenCalledTimes(1);
    expect(getTm1DimensionElements).toHaveBeenCalledTimes(1);
    expect(getTm1Subsets).toHaveBeenCalledTimes(1);
    expect(getTm1DimensionAliases).toHaveBeenCalledTimes(1);

    // The dialog still rendered its tree from the cached metadata.
    expect(treeLabels()).toEqual(expect.arrayContaining(['Alpha']));
  });

  it('toggling to an alternate hierarchy and back does NOT refetch the default (cache hit on return)', async () => {
    installProjectMocks();
    // Use a SECOND fresh dim so the warm project::default cache from the previous
    // test does not mask this assertion (this dim starts cold).
    getTm1DimensionHierarchies.mockResolvedValue({
      dimension: 'product',
      default: 'product',
      hierarchies: [
        { name: 'product', is_default: true },
        { name: 'LINE', is_default: false },
      ],
      has_alternates: true,
    });
    getTm1DimensionElements.mockImplementation(async (dimension, hierarchy = null) => (
      hierarchy === 'LINE'
        ? { dimension, elements: [{ name: 'Line1', type: 'C' }] }
        : { dimension, elements: [{ name: 'Prod1', type: 'C' }] }
    ));
    getTm1DimensionChildren.mockResolvedValue({ children: [] });
    getTm1Subsets.mockImplementation(async (dimension, hierarchy = null) => (
      hierarchy === 'LINE'
        ? { subsets: [{ name: 'line_set', dynamic: false }] }
        : { subsets: [{ name: 'prod_set', dynamic: false }] }
    ));
    getTm1DimensionAliases.mockResolvedValue({ dimension: 'product', aliases: ['name'] });

    const wrapper = await mountEditor({ dimension: 'product' });
    const hierPicker = selectByLabel(wrapper, 'Hierarchy');
    expect(hierPicker).toBeTruthy();

    // Switch to the alternate (cold → fetches LINE-scoped metadata).
    hierPicker.vm.$emit('update:modelValue', 'LINE');
    await settle();
    expect(getTm1DimensionElements).toHaveBeenCalledWith('product', 'LINE');

    // Clear the spies right before the round-trip BACK to default, so we measure
    // ONLY the return. product::default is already warm from the initial open.
    getTm1DimensionElements.mockClear();
    getTm1Subsets.mockClear();
    getTm1DimensionAliases.mockClear();

    hierPicker.vm.$emit('update:modelValue', 'product'); // back to the default
    await settle();

    // The return to default served from cache → none of the loaders fired again.
    expect(getTm1DimensionElements).not.toHaveBeenCalled();
    expect(getTm1Subsets).not.toHaveBeenCalled();
    expect(getTm1DimensionAliases).not.toHaveBeenCalled();

    // And the default topology is back on screen (proving the cache served it).
    expect(treeLabels()).toEqual(expect.arrayContaining(['Prod1']));
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
// MUTATION VERIFICATION (performed out-of-band — documented, not left in source)
// ════════════════════════════════════════════════════════════════════════════
// Per the author≠tester doctrine the tester may not SHIP a source change, but the
// load-bearing mechanisms here were proven non-vacuous by temporarily breaking
// SetEditor.vue in a throwaway working copy, confirming a RED test, then reverting
// (git diff --stat must show SetEditor.vue unchanged). Mechanisms → catcher:
//
//   (a) onAliasChange sentinel mapping — change the sentinel branch so the sentinel
//       is NOT mapped back to '' (treat it as a real alias). Caught by:
//       "alias picker's principal option uses a non-empty sentinel … restores
//       principal names" and "onAliasChange maps the sentinel to principal-name
//       mode" (rows fail to revert to principal names).
//
//   (b) ensureAliasLabels filling aliasLabels — early-return / no-op the function so
//       it never writes aliasLabels. Caught by:
//       "choosing an alias relabels the rows …" and "relabels BOTH panes …"
//       (setLabels() stays principal, expected the alias values).
//
//   (c) the _metaCache.tree memo — bypass the tree-cache read (always re-fetch).
//       Caught by: "reopening the SAME dimension+hierarchy serves metadata from the
//       cache" and "toggling to an alternate hierarchy and back …" (the once-only /
//       no-refetch call-count assertions go RED).
//
// See the returned report for the exact RED output captured for each.
