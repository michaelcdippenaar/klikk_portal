<!--
  SetEditor — a PAW-style Set (Subset) Editor for one dimension of the Slice &
  Dice pivot. Opened as a KDialog (modal) from a Rows/Columns axis chip's
  "Edit set…" affordance.

  PAW layout, two panes:
    LEFT  — SOURCE: a hierarchy picker (alt-hierarchies), a search box, a lazy
            expandable member TREE (top consolidations → children via
            getTm1DimensionChildren), and a "Subsets" picker that loads a saved
            subset's resolved members into the source selection.
    RIGHT — THE SET: the ordered member list that will go on the axis. Members
            are added / removed / reordered / sorted here.

  The editor is a PURE member picker — no value grid. Everything it produces is
  a list of PRINCIPAL member NAMES (what the pivot query uses) plus the chosen
  hierarchy; aliases are DISPLAY ONLY and never leave the editor.

  Apply emits { hierarchy, members } back to the parent, which writes them onto
  the axis spec and re-queries. Cancel discards.

  DEFERRED (needs a backend write endpoint that does not exist yet):
    - Save-as-subset (persisting the built set back to TM1 as a named subset).
    - Custom-MDX authoring (a dynamic subset expression).
  Both are noted as future affordances in the footer, not built.

  Props:
    modelValue (Boolean)  — v-model open state (KDialog).
    dimension  (String)   — the dimension being edited.
    hierarchy  (String?)  — the axis's current hierarchy (null = default).
    members    (String[]) — the axis's current member principal names.

  Emits:
    update:modelValue (Boolean)                     — open/close.
    apply ({ dimension, hierarchy, members, types, alias }) — commit the built
        set. `alias` is the chosen display label (null = principal names); it is
        DISPLAY-ONLY and never affects `members` (always principal names).
-->
<template>
  <KDialog
    :model-value="modelValue"
    size="xl"
    :title="`Edit set — ${dimension}`"
    description="Browse the dimension on the left, build the ordered member set on the right. Members are what the pivot queries; the alias picker changes the label only."
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="se">
      <!-- ═══ LEFT PANE — SOURCE (browse / pick) ═════════════════════════════ -->
      <section class="se-pane se-pane--source" aria-label="Source members">
        <header class="se-pane__head">
          <h3 class="se-pane__title">Source</h3>
          <span class="se-pane__hint">{{ sourceHierarchyLabel }}</span>
        </header>

        <div class="se-controls">
          <!-- Hierarchy picker — only when the dimension HAS alternates.
               model-value is bound to the RESOLVED current hierarchy NAME
               (default = the dimension's default hierarchy, never null), so the
               picker (a) DISPLAYS the active hierarchy rather than a blank
               placeholder and (b) drives Reka's SelectRoot in CONTROLLED mode —
               a null/undefined model-value would latch SelectRoot into passive
               (uncontrolled) state at setup, so a later selection would never
               reflect back. See selectedHierarchy. -->
          <KSelect
            v-if="hasAlternates"
            :model-value="selectedHierarchy"
            class="se-controls__field"
            label="Hierarchy"
            :options="hierarchyOptions"
            :disabled="hierarchiesLoading || treeLoading"
            aria-label="Source hierarchy"
            @update:model-value="onHierarchyChange"
          />

          <!-- Subsets picker — load a saved subset's members into the source selection. -->
          <KSelect
            :model-value="null"
            class="se-controls__field"
            label="Load subset"
            :options="subsetOptions"
            :placeholder="subsetPlaceholder"
            :disabled="subsetsLoading || !subsetOptions.length || subsetMembersLoading"
            aria-label="Load a saved subset into the source selection"
            @update:model-value="onSubsetChosen"
          />
        </div>

        <KInput
          v-model="search"
          class="se-search"
          label="Filter loaded members"
          placeholder="Type to filter…"
          icon="search"
          clearable
          aria-label="Filter the loaded source members"
        />

        <p v-if="subsetMembersLoading" class="se-note" role="status">
          <KSpinner size="xs" tone="accent" label="Loading subset members" />
          <span>Loading subset members…</span>
        </p>
        <p v-else-if="subsetLoadedNote" class="se-note se-note--ok">{{ subsetLoadedNote }}</p>

        <p v-if="treeNote" class="se-note se-note--info" role="status">{{ treeNote }}</p>

        <!-- The member TREE -->
        <div class="se-tree-wrap">
          <p v-if="treeError" class="se-tree__state se-tree__state--error">{{ treeError }}</p>

          <div v-else-if="treeLoading" class="se-tree__state">
            <KSpinner size="sm" tone="accent" label="Loading members" />
            <span>Loading members…</span>
          </div>

          <EmptyState
            v-else-if="!visibleRows.length && search"
            icon="∅"
            title="No matches"
            :body="`No loaded members match “${search}”. Clear the filter, or expand more of the tree to load deeper members.`"
          />

          <EmptyState
            v-else-if="!visibleRows.length"
            icon="∅"
            title="No members"
            :body="`The hierarchy returned no members for ${dimension}.`"
          />

          <ul
            v-else
            class="se-tree"
            role="tree"
            :aria-label="`${dimension} members`"
          >
            <li
              v-for="row in visibleRows"
              :key="row.path"
              class="se-tree__row"
              role="treeitem"
              :aria-level="row.level + 1"
              :aria-expanded="row.drillable ? row.expanded : undefined"
              :style="{ '--se-indent': `${row.level * INDENT_PX}px` }"
            >
              <span class="se-tree__line">
                <button
                  v-if="row.drillable"
                  type="button"
                  class="se-twisty"
                  :class="{ 'se-twisty--busy': drilling === row.path }"
                  :disabled="drilling === row.path"
                  :aria-label="`${row.expanded ? 'Collapse' : 'Expand'} ${row.label}`"
                  @click="toggleNode(row)"
                >
                  <KSpinner v-if="drilling === row.path" size="xs" tone="muted" />
                  <svg
                    v-else
                    class="se-twisty__icon"
                    :class="{ 'se-twisty__icon--open': row.expanded }"
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="3"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="9 6 15 12 9 18" />
                  </svg>
                </button>
                <span v-else class="se-twisty-spacer" aria-hidden="true" />

                <KCheckbox
                  :model-value="checked.has(row.member)"
                  :label="row.label"
                  @update:model-value="(v) => onCheck(row.member, v)"
                />

                <span
                  v-if="row.drillable"
                  class="se-tree__badge"
                  title="Consolidation (rollup)"
                >C</span>

                <span
                  v-if="row.label !== row.member"
                  class="se-tree__principal"
                  :title="`Principal name: ${row.member}`"
                >{{ row.member }}</span>
              </span>
            </li>
          </ul>
        </div>

        <footer class="se-pane__foot">
          <span class="se-count">{{ checked.size }} selected</span>
          <button
            type="button"
            class="se-linkbtn"
            :disabled="!checked.size"
            @click="clearChecked"
          >
            Clear selection
          </button>
        </footer>
      </section>

      <!-- ═══ MIDDLE — transfer controls ═════════════════════════════════════ -->
      <div class="se-transfer" role="group" aria-label="Move members between source and set">
        <button
          type="button"
          class="btn btn-primary btn-sm se-transfer__btn"
          :disabled="!checked.size"
          aria-label="Add selected source members to the set"
          @click="addSelected"
        >
          Add selected
          <svg
            class="se-transfer__icon"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </button>

        <button
          type="button"
          class="btn btn-ghost btn-sm se-transfer__btn"
          :disabled="!checked.size || !setMembers.length"
          aria-label="Remove selected members from the set"
          @click="removeSelectedFromSet"
        >
          Remove
        </button>

        <button
          type="button"
          class="btn btn-ghost btn-sm se-transfer__btn"
          :disabled="!checked.size"
          title="Replace the set with only the selected source members"
          aria-label="Keep only the selected members in the set"
          @click="keepOnly"
        >
          Keep only
        </button>

        <button
          type="button"
          class="btn btn-ghost btn-sm se-transfer__btn"
          :disabled="!setMembers.length"
          aria-label="Clear the set"
          @click="clearSet"
        >
          Clear
        </button>
      </div>

      <!-- ═══ RIGHT PANE — THE SET (ordered list for the axis) ═══════════════ -->
      <section class="se-pane se-pane--set" aria-label="The set">
        <header class="se-pane__head">
          <h3 class="se-pane__title">The set</h3>
          <span class="se-count se-count--strong">{{ setMembers.length }} {{ setMembers.length === 1 ? 'member' : 'members' }}</span>
        </header>

        <div class="se-setbar">
          <button
            type="button"
            class="se-linkbtn"
            :disabled="setMembers.length < 2"
            aria-label="Sort the set A to Z"
            @click="sortAlpha"
          >
            Sort A→Z
          </button>
          <button
            type="button"
            class="se-linkbtn"
            :disabled="setMembers.length < 2"
            title="Order the set to match the source hierarchy order"
            aria-label="Sort the set by hierarchy order"
            @click="sortByHierarchy"
          >
            By hierarchy order
          </button>
        </div>

        <div class="se-set-wrap">
          <EmptyState
            v-if="!setMembers.length"
            icon="○"
            title="Empty set"
            body="Check members on the left and press “Add selected”. The set is the ordered member list that goes on the axis."
          />

          <ol v-else class="se-set" aria-label="Members in the set, in order">
            <li
              v-for="(member, i) in setMembers"
              :key="member"
              class="se-set__row"
            >
              <span class="se-set__pos" aria-hidden="true">{{ i + 1 }}</span>
              <span class="se-set__label" :title="member !== labelFor(member) ? `Principal name: ${member}` : undefined">
                {{ labelFor(member) }}
              </span>

              <span class="se-set__actions">
                <button
                  type="button"
                  class="se-iconbtn"
                  :disabled="i === 0"
                  :aria-label="`Move ${labelFor(member)} up`"
                  @click="moveUp(i)"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <polyline points="18 15 12 9 6 15" />
                  </svg>
                </button>
                <button
                  type="button"
                  class="se-iconbtn"
                  :disabled="i === setMembers.length - 1"
                  :aria-label="`Move ${labelFor(member)} down`"
                  @click="moveDown(i)"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                <button
                  type="button"
                  class="se-iconbtn se-iconbtn--danger"
                  :aria-label="`Remove ${labelFor(member)} from the set`"
                  @click="removeAt(i)"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </span>
            </li>
          </ol>
        </div>
      </section>
    </div>

    <!-- ═══ FOOTER — alias picker + deferred note + actions ══════════════════ -->
    <template #footer>
      <div class="se-foot">
        <div class="se-foot__alias">
          <KSelect
            :model-value="aliasModel"
            class="se-foot__alias-select"
            label="Display label"
            :options="aliasOptions"
            :disabled="aliasesLoading"
            aria-label="Display label (alias) for member names — display only"
            @update:model-value="onAliasChange"
          />
        </div>

        <span class="se-foot__deferred" title="Saving the set back to TM1 as a named subset, and custom-MDX authoring, need a backend write endpoint that does not exist yet.">
          Save-as-subset &amp; custom MDX — coming soon
        </span>

        <div class="se-foot__actions">
          <button type="button" class="btn btn-ghost btn-sm" @click="$emit('update:modelValue', false)">
            Cancel
          </button>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="!setMembers.length"
            @click="apply"
          >
            Apply
          </button>
        </div>
      </div>
    </template>
  </KDialog>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import KDialog from '../klikk/KDialog.vue';
import KSelect from '../klikk/KSelect.vue';
import KInput from '../klikk/KInput.vue';
import KCheckbox from '../klikk/KCheckbox.vue';
import KSpinner from '../klikk/KSpinner.vue';
import EmptyState from '../klikk/EmptyState.vue';
import {
  getTm1DimensionHierarchies,
  getTm1DimensionElements,
  getTm1DimensionChildren,
  getTm1Subsets,
  getTm1SubsetMembers,
  getTm1DimensionAliases,
  getTm1ElementLabels,
} from '../../api/planningAnalytics';

const props = defineProps({
  /** v-model open state. */
  modelValue: { type: Boolean, default: false },
  /** Dimension being edited. */
  dimension: { type: String, default: '' },
  /** The axis's current hierarchy (null = the dimension's default). */
  hierarchy: { type: String, default: null },
  /** The axis's current member principal names. */
  members: { type: Array, default: () => [] },
});

const emit = defineEmits(['update:modelValue', 'apply']);

const INDENT_PX = 16; // per-level tree indent (matches the pivot grid hallmark).
const TOP_ELEMENT_CAP = 1000; // cap the flat element scan used to find roots.
const SUBSET_MEMBER_CAP = 500; // cap how many subset members we pull at once.
// Non-empty sentinel for the "(principal name)" alias option. Reka/Radix's
// SelectItem REJECTS an empty-string value (it's reserved to clear the field),
// which made the alias picker unselectable and rendered the trigger blank. We
// bind the picker to this sentinel and map it back to '' (= principal name)
// internally, so activeAlias keeps its '' "no alias" semantics everywhere else.
const PRINCIPAL_SENTINEL = '__principal__';

// Module-level metadata memo. TM1 dimension metadata (hierarchies, aliases,
// subsets, and the source element list + chosen roots) is stable within a portal
// session, so we cache it across dialog opens and hierarchy toggle-backs — that's
// what kills the repeated TM1 round-trips that made re-opening feel slow. A full
// page reload clears it. Keyed by dimension (hierarchies) or dimension+hierarchy.
// NOTE: cached arrays are shared by reference across editor instances and MUST be
// treated as read-only by consumers (read via .map/.find/.length — never sort/push
// in place, or the mutation bleeds into every other instance + future opens).
const _metaCache = {
  hierarchies: new Map(), // dim -> { hierarchies, hasAlternates, defaultHierarchy }
  aliases: new Map(), // 'dim::hier' -> string[]
  subsets: new Map(), // 'dim::hier' -> [{ name, dynamic }]
  tree: new Map(), // 'dim::hier' -> { elements:[{name,type}], roots:[{name,type}], truncated }
};

// ── Defensive normalisers (backend lives in a separate repo) ────────────────
function pickName(item) {
  if (item == null) return null;
  if (typeof item === 'string') return item;
  if (typeof item === 'number') return String(item);
  return item.name ?? item.Name ?? item.value ?? item.id ?? null;
}

function isConsolidation(type) {
  if (type == null) return false;
  if (typeof type === 'number') return type === 3;
  const t = String(type).trim().toUpperCase();
  return t === 'C' || t === '3' || t === 'CONSOLIDATED' || t === 'CONSOLIDATION';
}

function normaliseMemberList(data, keys) {
  let raw = Array.isArray(data) ? data : null;
  if (!raw) {
    for (const k of keys) {
      if (Array.isArray(data?.[k])) {
        raw = data[k];
        break;
      }
    }
  }
  raw = raw || data?.results || data?.data || [];
  return raw
    .map((el) => {
      const name = pickName(el);
      if (!name) return null;
      const type = typeof el === 'object' && el ? el.type ?? el.Type ?? null : null;
      return { name, type };
    })
    .filter(Boolean);
}

// ── State ───────────────────────────────────────────────────────────────────
// Hierarchies
const hierarchies = ref([]); // [{ name, is_default }]
const hasAlternates = ref(false);
const hierarchiesLoading = ref(false);
const defaultHierarchy = ref(null);
// The hierarchy currently driving the SOURCE tree (principal hierarchy name or
// null = default). Seeded from the prop on open.
const activeHierarchy = ref(null);

// Source tree — path-keyed nodes (a member can appear under two rollups; the
// ancestry path disambiguates, mirroring the pivot grid's approach).
const nodes = reactive({}); // path -> { member, path, level, parentPath, expanded, drillable, children:[] }
const order = ref([]); // ordered visible PATHS
const childCache = reactive({}); // member -> [{ name, type }] (drill cache, keyed by bare member; safe — TM1 children of a member are the same wherever it appears)
const treeLoading = ref(false);
const treeError = ref('');
const treeNote = ref(''); // truncation / hierarchy-prune notice for the source tree.
const drilling = ref(''); // path currently fetching children
// Principal names KNOWN to belong to the ACTIVE hierarchy — every element the
// last loadTree saw (capped), plus any member drilled/surfaced since. Used to
// prune set members that don't belong to a newly-chosen hierarchy (so Apply
// never ships members invalid for the active hierarchy).
const knownMembers = reactive(new Set());

// Checked SOURCE members (by principal name — selection is name-based, so the
// same member under two rollups checks together, which is the intent: you pick
// a MEMBER to push to the set, not a tree position).
const checked = reactive(new Set());

// The SET — ordered principal member names destined for the axis.
const setMembers = ref([]);

// principal name -> raw TM1 type (letter or int), learned from every member we
// surface (roots, drilled children, subset members). Passed back on Apply so the
// pivot grid knows which applied members are consolidations (drillable). A member
// with an unknown type is omitted (the grid treats unknown as a leaf).
const memberTypeMap = reactive({});

function recordTypes(members) {
  for (const m of members || []) {
    if (m && m.name != null) {
      // Every member we surface (root, drilled child, subset member) is known to
      // belong to the active hierarchy — track it for the hierarchy-prune (P2-E).
      knownMembers.add(m.name);
      if (m.type != null) memberTypeMap[m.name] = m.type;
    }
  }
}

// Search filter over the loaded tree.
const search = ref('');

// Subsets
const subsets = ref([]); // [{ name, dynamic }]
const subsetsLoading = ref(false);
const subsetMembersLoading = ref(false);
const subsetLoadedNote = ref('');

// Aliases — display only. activeAlias = '' means "(principal name)".
const aliases = ref([]); // string[]
const aliasesLoading = ref(false);
const activeAlias = ref('');
// member principal name -> alias label, for the active alias + hierarchy.
const aliasLabels = reactive({});

// ── Derived ──────────────────────────────────────────────────────────────────
const hierarchyOptions = computed(() =>
  hierarchies.value.map((h) => ({
    value: h.name,
    label: h.is_default ? `${h.name} (default)` : h.name,
  })),
);

const sourceHierarchyLabel = computed(() => {
  const name = activeHierarchy.value || defaultHierarchy.value || props.dimension;
  return name ? `Hierarchy: ${name}` : '';
});

// The hierarchy NAME the picker should show as selected. activeHierarchy is null
// while we're on the default (so hierarchyArg() can omit the param); for DISPLAY
// we resolve that null to the default hierarchy's principal name, which matches a
// real option value in hierarchyOptions. This must never be null/'' — binding a
// nullish model-value to KSelect makes Reka's SelectRoot uncontrolled (passive),
// after which a user selection never reflects back into the trigger or the tree.
const selectedHierarchy = computed(
  () => activeHierarchy.value || defaultHierarchy.value || null,
);

const subsetOptions = computed(() =>
  subsets.value.map((s) => ({
    value: s.name,
    label: s.dynamic ? `${s.name} · dynamic` : s.name,
  })),
);

const subsetPlaceholder = computed(() => {
  if (subsetsLoading.value) return 'Loading subsets…';
  if (!subsets.value.length) return 'No saved subsets';
  return 'Choose a subset…';
});

const aliasOptions = computed(() => [
  { value: PRINCIPAL_SENTINEL, label: '(principal name)' },
  ...aliases.value.map((a) => ({ value: a, label: a })),
]);

// The value the alias picker should show as selected: the active alias, or the
// non-empty sentinel when on principal names (never '' — see PRINCIPAL_SENTINEL).
const aliasModel = computed(() => activeAlias.value || PRINCIPAL_SENTINEL);

// The visible tree rows: walk `order`, attach display label, filter by search.
// A search term keeps any loaded row whose label OR principal name matches
// (case-insensitive) — we filter what's loaded; deeper members appear as the
// user expands. Indentation/level is preserved from the node.
const visibleRows = computed(() => {
  const term = search.value.trim().toLowerCase();
  const rows = [];
  for (const path of order.value) {
    const node = nodes[path];
    if (!node) continue;
    const label = labelFor(node.member);
    if (term) {
      const hay = `${label} ${node.member}`.toLowerCase();
      if (!hay.includes(term)) continue;
    }
    rows.push({
      path,
      member: node.member,
      label,
      level: node.level || 0,
      drillable: node.drillable,
      expanded: node.expanded,
    });
  }
  return rows;
});

// ── Label resolution (alias = display only) ─────────────────────────────────
function labelFor(member) {
  if (!activeAlias.value) return member;
  return aliasLabels[member] || member;
}

// ── Loaders ──────────────────────────────────────────────────────────────────
async function loadHierarchies() {
  hierarchiesLoading.value = true;
  try {
    const memo = _metaCache.hierarchies.get(props.dimension);
    if (memo) {
      hierarchies.value = memo.hierarchies;
      hasAlternates.value = memo.hasAlternates;
      defaultHierarchy.value = memo.defaultHierarchy;
      return;
    }
    const data = await getTm1DimensionHierarchies(props.dimension);
    const list = Array.isArray(data?.hierarchies) ? data.hierarchies : [];
    hierarchies.value = list
      .map((h) => ({
        name: pickName(h),
        is_default: !!(h && (h.is_default ?? h.isDefault)),
      }))
      .filter((h) => h.name);
    hasAlternates.value = !!data?.has_alternates && hierarchies.value.length > 1;
    const def = hierarchies.value.find((h) => h.is_default) || hierarchies.value[0];
    defaultHierarchy.value = data?.default ?? def?.name ?? null;
    _metaCache.hierarchies.set(props.dimension, {
      hierarchies: hierarchies.value,
      hasAlternates: hasAlternates.value,
      defaultHierarchy: defaultHierarchy.value,
    });
  } catch {
    hierarchies.value = [];
    hasAlternates.value = false;
    defaultHierarchy.value = null;
  } finally {
    hierarchiesLoading.value = false;
  }
}

// The hierarchy arg the API client wants: null when we're on the default
// (the client omits the param), else the explicit alternate name.
function hierarchyArg() {
  const h = activeHierarchy.value;
  if (!h) return null;
  if (defaultHierarchy.value && h === defaultHierarchy.value) return null;
  return h;
}

// Cache key for per-(dimension, hierarchy) metadata in _metaCache. '' = default.
function _hkey() {
  return `${props.dimension}::${hierarchyArg() || ''}`;
}

// Load the SOURCE tree for the active hierarchy. The backend gives a flat
// element list; we pick sensible ROOTS (see pickRoots) and seed them at level 0,
// then let the user drill (lazy children). To stay lazy we DON'T fetch every
// member's children up front. Also re-surfaces the current set's members as
// flat rows so they're visible/checkable even before being drilled to.
// pruneSetToHierarchy: when the load follows a HIERARCHY SWITCH, drop set members
// that don't exist in the newly-loaded hierarchy BEFORE re-surfacing the set as
// rows (so Apply never ships members invalid for the active hierarchy — P2-E). On
// a plain open the set is already scoped to its hierarchy, so we don't prune.
async function loadTree({ pruneSetToHierarchy = false } = {}) {
  treeLoading.value = true;
  treeError.value = '';
  treeNote.value = '';
  clearTree();
  // The known-member set is hierarchy-scoped — reset it for the hierarchy we're
  // about to load (its elements/children repopulate it below).
  knownMembers.clear();
  try {
    // Source elements + chosen roots are stable per (dim, hierarchy) — memoise the
    // heavy element scan + root resolution so reopening / toggling back is instant.
    const key = _hkey();
    let memo = _metaCache.tree.get(key);
    if (!memo) {
      const data = await getTm1DimensionElements(props.dimension, hierarchyArg());
      let elements = normaliseMemberList(data, ['elements']);
      const truncated = elements.length > TOP_ELEMENT_CAP;
      if (truncated) elements = elements.slice(0, TOP_ELEMENT_CAP);
      const roots = elements.length ? await pickRoots(elements) : [];
      memo = { elements, roots, truncated };
      _metaCache.tree.set(key, memo);
    }
    // Record every element of the active hierarchy so the hierarchy-prune (P2-E)
    // keeps set members that exist here and drops the rest.
    recordTypes(memo.elements);
    if (!memo.elements.length) {
      order.value = [];
      if (pruneSetToHierarchy) pruneSetMembersToHierarchy(memo.truncated);
      return;
    }
    seedRoots(memo.roots);
    if (memo.truncated) {
      treeNote.value = `Showing the first ${TOP_ELEMENT_CAP} members — refine with the filter or a saved subset to reach the rest.`;
    }
    // Prune the set to the new hierarchy's members BEFORE surfacing it as rows —
    // surfaceMembersAsRows records members into knownMembers, which would
    // otherwise re-admit the very members we mean to drop.
    if (pruneSetToHierarchy) pruneSetMembersToHierarchy(memo.truncated);
    if (setMembers.value.length) {
      surfaceMembersAsRows(setMembers.value.map((m) => ({ name: m, type: null })));
    }
  } catch (error) {
    treeError.value =
      error?.response?.data?.error ||
      error?.message ||
      `Could not load members for ${props.dimension}.`;
  } finally {
    treeLoading.value = false;
  }
}

// Drop set members that don't belong to the active hierarchy (computed from the
// hierarchy's real elements, in knownMembers). When the element list was CAPPED
// (truncated) we cannot prove a member is absent — it may live past the cap — so
// we skip the prune entirely rather than wrongly drop a valid member. Surfaces a
// note when members are dropped (replacing the truncation note, which can't apply
// here since we only prune on a complete list).
function pruneSetMembersToHierarchy(truncated) {
  if (truncated) return; // element list capped → cannot prove absence; don't prune.
  if (!knownMembers.size) return; // load failed/empty → nothing to compare against.
  const before = setMembers.value;
  const kept = before.filter((m) => knownMembers.has(m));
  const droppedCount = before.length - kept.length;
  if (!droppedCount) return;
  setMembers.value = kept;
  treeNote.value = `Dropped ${droppedCount} member${droppedCount === 1 ? '' : 's'} not in this hierarchy.`;
}

// Choose the tree roots from a flat element list. Roots are derived from the
// hierarchy's TOP-LEVEL CONSOLIDATIONS, not a name regex — alt hierarchies
// (EBITDA, is_non_cashflow) often have NO All_/Total root, so a regex misses the
// real rollups and falls back to a flat dump. Order of preference:
//   1) the children of an All_/Total rollup root, when one exists (the classic
//      default-hierarchy shape) — a real, single-rooted tree;
//   2) otherwise the consolidations themselves (type 'C' = a parent/rollup) as
//      top-level roots — correct for shallow alt hierarchies with several roots;
//   3) otherwise the flat element list (a small leaf-only dimension), with a
//      "showing first N" note surfaced by the caller when it was capped.
async function pickRoots(elements) {
  const top = elements.find((e) => /^(all[_ ]|total)/i.test(e.name) && isConsolidation(e.type));
  if (top) {
    try {
      const data = await getTm1DimensionChildren(props.dimension, top.name, hierarchyArg());
      const children = normaliseMemberList(data, ['children', 'elements']);
      if (children.length) {
        childCache[top.name] = children;
        return children;
      }
    } catch {
      // fall through to the consolidation/flat heuristic.
    }
  }
  // No All_/Total rollup (or it resolved to nothing): surface the hierarchy's
  // consolidations as the top-level roots. These are the rollups of the chosen
  // hierarchy (EBIT/GROSS_PROFIT/OPERATING_EXPENSES for EBITDA), each drillable.
  const consols = elements.filter((e) => isConsolidation(e.type));
  if (consols.length && consols.length < elements.length) return consols;
  return elements;
}

// Seed the tree with a resolved roots array ([{ name, type }]) at level 0.
function seedRoots(roots) {
  clearTree();
  recordTypes(roots);
  const paths = [];
  for (const r of roots) {
    const path = r.name;
    nodes[path] = {
      member: r.name,
      path,
      level: 0,
      parentPath: null,
      expanded: false,
      drillable: isConsolidation(r.type),
      children: [],
    };
    paths.push(path);
  }
  order.value = paths;
}

function clearTree() {
  for (const k of Object.keys(nodes)) delete nodes[k];
  order.value = [];
}

async function expandNode(path) {
  const node = nodes[path];
  if (!node || node.expanded || !node.drillable) return;
  const cached = childCache[node.member];
  if (cached) {
    insertChildren(node, cached);
    node.expanded = true;
    return;
  }
  drilling.value = path;
  try {
    const data = await getTm1DimensionChildren(props.dimension, node.member, hierarchyArg());
    const children = normaliseMemberList(data, ['children', 'elements']);
    childCache[node.member] = children;
    if (children.length) {
      insertChildren(node, children);
      node.expanded = true;
    } else {
      // A consolidation with no resolved children — mark non-drillable so the
      // twisty disappears rather than looping.
      node.drillable = false;
    }
  } catch {
    node.expanded = false;
  } finally {
    drilling.value = '';
  }
}

function insertChildren(node, children) {
  recordTypes(children);
  const childPaths = [];
  for (const child of children) {
    const childPath = `${node.path}::${child.name}`;
    if (!nodes[childPath]) {
      nodes[childPath] = {
        member: child.name,
        path: childPath,
        level: node.level + 1,
        parentPath: node.path,
        expanded: false,
        drillable: isConsolidation(child.type),
        children: [],
      };
    }
    childPaths.push(childPath);
  }
  node.children = childPaths;
  const present = new Set(order.value);
  const toAdd = childPaths.filter((p) => !present.has(p));
  if (!toAdd.length) return;
  const idx = order.value.indexOf(node.path);
  const next = order.value.slice();
  next.splice(idx < 0 ? next.length : idx + 1, 0, ...toAdd);
  order.value = next;
  // Pull alias labels for the newly visible members if an alias is active.
  if (activeAlias.value) ensureAliasLabels(children.map((c) => c.name));
}

function collapseNode(path) {
  const node = nodes[path];
  if (!node) return;
  const toRemove = new Set();
  const stack = [...(node.children || [])];
  while (stack.length) {
    const cp = stack.pop();
    toRemove.add(cp);
    const child = nodes[cp];
    if (child?.children?.length) stack.push(...child.children);
    if (child) child.expanded = false;
  }
  order.value = order.value.filter((p) => !toRemove.has(p));
  node.expanded = false;
}

function toggleNode(row) {
  if (drilling.value) return;
  if (row.expanded) collapseNode(row.path);
  else expandNode(row.path);
}

// ── Subsets ──────────────────────────────────────────────────────────────────
async function loadSubsets() {
  subsetsLoading.value = true;
  try {
    const key = _hkey();
    const memo = _metaCache.subsets.get(key);
    if (memo) {
      subsets.value = memo;
      return;
    }
    const data = await getTm1Subsets(props.dimension, hierarchyArg());
    const list = Array.isArray(data?.subsets) ? data.subsets : [];
    subsets.value = list
      .map((s) => ({ name: pickName(s), dynamic: !!(s && s.dynamic) }))
      .filter((s) => s.name);
    _metaCache.subsets.set(key, subsets.value);
  } catch {
    subsets.value = [];
  } finally {
    subsetsLoading.value = false;
  }
}

// Choosing a subset loads its resolved members into the SOURCE selection (the
// checked set), so the user can push them to the set. We also ensure those
// members are present as flat tree rows even if not yet drilled-to, so the
// checkbox is visible and the count reads.
async function onSubsetChosen(name) {
  if (!name) return;
  subsetMembersLoading.value = true;
  subsetLoadedNote.value = '';
  try {
    const data = await getTm1SubsetMembers(props.dimension, name, hierarchyArg(), SUBSET_MEMBER_CAP);
    const members = normaliseMemberList(data, ['members']);
    const names = members.map((m) => m.name);
    for (const n of names) checked.add(n);
    surfaceMembersAsRows(members);
    if (activeAlias.value) ensureAliasLabels(names);
    const dyn = data?.dynamic ? ' (dynamic)' : '';
    const trunc = data?.truncated ? ` — first ${names.length}, truncated` : '';
    subsetLoadedNote.value = names.length
      ? `Selected ${names.length} member${names.length === 1 ? '' : 's'} from “${name}”${dyn}${trunc}. Press “Add selected →”.`
      : `Subset “${name}” resolved to no members.`;
  } catch (error) {
    subsetLoadedNote.value =
      error?.response?.data?.error || error?.message || `Could not load subset “${name}”.`;
  } finally {
    subsetMembersLoading.value = false;
  }
}

// Make sure each given member is visible as a tree row (append flat rows at
// level 0 for any not already present), so a subset's members are checkable
// even before the user drills to them in the hierarchy.
function surfaceMembersAsRows(members) {
  recordTypes(members);
  const present = new Set(order.value.map((p) => nodes[p]?.member).filter(Boolean));
  const appended = [];
  for (const m of members) {
    if (present.has(m.name)) continue;
    const path = `subset::${m.name}`;
    if (!nodes[path]) {
      nodes[path] = {
        member: m.name,
        path,
        level: 0,
        parentPath: null,
        expanded: false,
        drillable: isConsolidation(m.type),
        children: [],
      };
    }
    appended.push(path);
    present.add(m.name);
  }
  if (appended.length) order.value = [...order.value, ...appended];
}

// ── Aliases ──────────────────────────────────────────────────────────────────
async function loadAliases() {
  aliasesLoading.value = true;
  try {
    const key = _hkey();
    const memo = _metaCache.aliases.get(key);
    if (memo) {
      aliases.value = memo;
      return;
    }
    const data = await getTm1DimensionAliases(props.dimension, hierarchyArg());
    const list = Array.isArray(data?.aliases) ? data.aliases : [];
    // Drop any alias literally named like the sentinel so it can never shadow the
    // "(principal name)" option (astronomically unlikely in TM1, but cheap to rule out).
    aliases.value = list.map(pickName).filter(Boolean).filter((a) => a !== PRINCIPAL_SENTINEL);
    _metaCache.aliases.set(key, aliases.value);
  } catch {
    aliases.value = [];
  } finally {
    aliasesLoading.value = false;
  }
}

// Resolve display labels for the active alias by reading the alias attribute
// value per member (e.g. entity UUID -> "Klikk (Pty) Ltd") from the backend
// element-labels endpoint, and fill the reactive aliasLabels map. Only fetches
// members we don't already have, batches inside the API client, and drops the
// result if the user switched alias mid-flight. On error we leave principal names
// and DON'T cache, so a later call can retry. Fire-and-forget at call sites —
// aliasLabels is reactive, so labelFor()/visibleRows re-render when labels land.
async function ensureAliasLabels(memberNames) {
  const alias = activeAlias.value;
  if (!alias) return;
  const hier = hierarchyArg();
  const want = [...new Set(memberNames)].filter((m) => m && !(m in aliasLabels));
  if (!want.length) return;
  try {
    const data = await getTm1ElementLabels(props.dimension, alias, want, hier);
    // Discard if the alias OR the hierarchy changed while in-flight — aliasLabels
    // is hierarchy-scoped and gets cleared on a hierarchy switch, so a late reply
    // from the previous hierarchy must not re-pollute it.
    if (activeAlias.value !== alias || hierarchyArg() !== hier) return;
    const labels = data?.labels || {};
    // Cache every requested member, falling back to its own key when the alias
    // value is blank, so we never refetch the same members in a tight loop.
    for (const m of want) aliasLabels[m] = labels[m] || m;
  } catch {
    // Network / TM1 error — keep principal names; do not poison the cache.
  }
}

function onAliasChange(value) {
  // Map the non-empty sentinel back to '' (= principal names) — see PRINCIPAL_SENTINEL.
  activeAlias.value = value === PRINCIPAL_SENTINEL ? '' : value || '';
  if (activeAlias.value) {
    // Refresh labels for everything currently visible + in the set.
    const visible = order.value.map((p) => nodes[p]?.member).filter(Boolean);
    ensureAliasLabels([...new Set([...visible, ...setMembers.value])]);
  } else {
    for (const k of Object.keys(aliasLabels)) delete aliasLabels[k];
  }
}

// ── Hierarchy change — reload everything scoped to the new hierarchy ─────────
// `value` is a hierarchy NAME from the picker (the picker is bound to the
// resolved current name, so the default arrives as its principal name, e.g.
// "account", not null). We compare against the resolved current selection so a
// re-pick of the same hierarchy is a true no-op (no redundant reload), then store
// activeHierarchy as null for the default (keeps hierarchyArg() omitting the
// param) or the alternate name otherwise.
async function onHierarchyChange(value) {
  const next = value || null;
  // No-op if the resolved selection is unchanged (re-picking the current one).
  if ((next || defaultHierarchy.value || null) === (selectedHierarchy.value || null)) return;
  // Store null when the chosen hierarchy IS the default, else the alternate name.
  activeHierarchy.value =
    next && defaultHierarchy.value && next === defaultHierarchy.value ? null : next;
  checked.clear();
  subsetLoadedNote.value = '';
  search.value = '';
  for (const k of Object.keys(childCache)) delete childCache[k];
  // Hierarchy-scoped alias labels no longer apply — clear them; aliases reload.
  for (const k of Object.keys(aliasLabels)) delete aliasLabels[k];
  // loadTree prunes the set to the new hierarchy's members (P2-E).
  await Promise.all([loadTree({ pruneSetToHierarchy: true }), loadSubsets(), loadAliases()]);
}

// ── Source selection ─────────────────────────────────────────────────────────
function onCheck(member, value) {
  if (value) checked.add(member);
  else checked.delete(member);
}

function clearChecked() {
  checked.clear();
}

// ── Transfer actions ─────────────────────────────────────────────────────────
function addSelected() {
  if (!checked.size) return;
  const present = new Set(setMembers.value);
  const additions = [];
  // Preserve the visible tree order for the additions (stable, predictable).
  for (const path of order.value) {
    const m = nodes[path]?.member;
    if (m && checked.has(m) && !present.has(m)) {
      additions.push(m);
      present.add(m);
    }
  }
  // Any checked member not currently in the visible tree (defensive) still adds.
  for (const m of checked) {
    if (!present.has(m)) {
      additions.push(m);
      present.add(m);
    }
  }
  if (additions.length) setMembers.value = [...setMembers.value, ...additions];
}

function removeSelectedFromSet() {
  if (!checked.size) return;
  setMembers.value = setMembers.value.filter((m) => !checked.has(m));
}

function keepOnly() {
  if (!checked.size) return;
  // Replace the set with the checked members, in visible-tree order.
  const next = [];
  const seen = new Set();
  for (const path of order.value) {
    const m = nodes[path]?.member;
    if (m && checked.has(m) && !seen.has(m)) {
      next.push(m);
      seen.add(m);
    }
  }
  for (const m of checked) {
    if (!seen.has(m)) {
      next.push(m);
      seen.add(m);
    }
  }
  setMembers.value = next;
}

function clearSet() {
  setMembers.value = [];
}

// ── Set ordering ──────────────────────────────────────────────────────────────
function sortAlpha() {
  setMembers.value = [...setMembers.value].sort((a, b) =>
    labelFor(a).localeCompare(labelFor(b), undefined, { numeric: true, sensitivity: 'base' }),
  );
}

// Order the set to match the order members appear in the currently-loaded
// source tree (hierarchy order). Members not currently in the tree keep their
// relative order and trail the rest.
function sortByHierarchy() {
  const rank = new Map();
  let i = 0;
  for (const path of order.value) {
    const m = nodes[path]?.member;
    if (m != null && !rank.has(m)) rank.set(m, i++);
  }
  const BIG = Number.MAX_SAFE_INTEGER;
  setMembers.value = [...setMembers.value]
    .map((m, idx) => ({ m, idx }))
    .sort((a, b) => {
      const ra = rank.has(a.m) ? rank.get(a.m) : BIG + a.idx;
      const rb = rank.has(b.m) ? rank.get(b.m) : BIG + b.idx;
      return ra - rb;
    })
    .map((x) => x.m);
}

function moveUp(i) {
  if (i <= 0) return;
  const next = setMembers.value.slice();
  [next[i - 1], next[i]] = [next[i], next[i - 1]];
  setMembers.value = next;
}

function moveDown(i) {
  if (i >= setMembers.value.length - 1) return;
  const next = setMembers.value.slice();
  [next[i + 1], next[i]] = [next[i], next[i + 1]];
  setMembers.value = next;
}

function removeAt(i) {
  const next = setMembers.value.slice();
  next.splice(i, 1);
  setMembers.value = next;
}

// ── Apply ──────────────────────────────────────────────────────────────────
function apply() {
  if (!setMembers.value.length) return;
  // Pass the learned types for the set members (principal name -> TM1 type) so
  // the pivot grid can mark consolidations drillable. Unknown-type members are
  // simply absent from the map (grid treats absent as a leaf).
  const types = {};
  for (const m of setMembers.value) {
    if (memberTypeMap[m] != null) types[m] = memberTypeMap[m];
  }
  emit('apply', {
    dimension: props.dimension,
    hierarchy: hierarchyArg(),
    members: setMembers.value.slice(),
    types,
    // Carry the chosen display alias through so the pivot grid shows the SAME
    // label the user was looking at while building the set. Display-only — the
    // members above stay principal names. '' (principal) maps to null.
    alias: activeAlias.value || null,
  });
  emit('update:modelValue', false);
}

// ── Open / reset lifecycle ───────────────────────────────────────────────────
// On open, seed from the props and load the dimension's hierarchies, source
// tree, subsets and aliases (all scoped to the seeded hierarchy). On close we
// keep state until the next open re-seeds, so a reopen of the SAME dim is cheap
// but a different dim fully resets.
let lastSeededDim = null;
async function openFor() {
  activeHierarchy.value = props.hierarchy || null;
  setMembers.value = Array.isArray(props.members) ? props.members.slice() : [];
  checked.clear();
  search.value = '';
  subsetLoadedNote.value = '';
  activeAlias.value = '';
  for (const k of Object.keys(aliasLabels)) delete aliasLabels[k];
  for (const k of Object.keys(childCache)) delete childCache[k];
  clearTree();
  lastSeededDim = props.dimension;
  await loadHierarchies();
  // The seeded hierarchy (prop) drives the picker + scopes every load below; a
  // null activeHierarchy tracks "default".
  await Promise.all([loadTree(), loadSubsets(), loadAliases()]);
}

watch(
  () => props.modelValue,
  (open) => {
    if (open && props.dimension) openFor();
  },
);

// Guard: if the dialog is mounted already-open with a dimension (edge case),
// seed once.
if (props.modelValue && props.dimension && lastSeededDim !== props.dimension) {
  openFor();
}
</script>

<style scoped>
/* ════════════════════════════════════════════════════════════════════════════
   Layout — two panes with a thin transfer column between.
   ═══════════════════════════════════════════════════════════════════════════ */
.se {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 14px;
  min-height: 420px;
}

.se-pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 8px;
  background: var(--kdl-page-bg);
  overflow: hidden;
}

.se-pane__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--kdl-border-subtle);
}

.se-pane__title {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--kdl-text-secondary);
}

.se-pane__hint {
  font-size: 11px;
  color: var(--kdl-text-hint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Source controls (hierarchy + subset pickers) ─────────────────────────── */
.se-controls {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  padding: 10px 12px 0;
}

.se-controls__field {
  min-width: 0;
}

.se-search {
  padding: 10px 12px 0;
}

.se-note {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 8px 12px 0;
  font-size: 12px;
  color: var(--kdl-text-secondary);
}

.se-note--ok {
  color: var(--kdl-text-secondary);
}

/* Informational "showing first N" / hierarchy-prune notice — quieter than the
   ok note (hint tone), reusing the existing note tokens (no new colour token). */
.se-note--info {
  color: var(--kdl-text-hint);
}

/* ── The source tree ──────────────────────────────────────────────────────── */
.se-tree-wrap {
  flex: 1 1 auto;
  min-height: 0;
  margin-top: 10px;
  overflow: auto;
  border-top: 1px solid var(--kdl-border-subtle);
  background: var(--kdl-card-bg);
}

.se-tree__state {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 14px;
  font-size: 13px;
  color: var(--kdl-text-secondary);
}

.se-tree__state--error {
  color: #dc2626; /* danger-600 — documented error red (KDL exposes no semantic danger var) */
}

:root[data-theme="dark"] .se-tree__state--error {
  color: #f87171;
}

.se-tree {
  list-style: none;
  margin: 0;
  padding: 6px 0;
}

.se-tree__row {
  padding: 0 12px;
}

.se-tree__line {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  /* per-level indent — a data-driven runtime value routed through a custom
     property (the house no-inline-style-for-design-values pattern). */
  padding-left: var(--se-indent, 0px);
}

.se-tree__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  border-radius: 4px;
  background: color-mix(in srgb, var(--kdl-brand-navy) 12%, transparent);
  color: var(--kdl-brand-navy);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

:root[data-theme="dark"] .se-tree__badge {
  color: var(--kdl-text-primary);
}

.se-tree__principal {
  font-size: 11px;
  color: var(--kdl-text-hint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Twisty (expand / collapse) ───────────────────────────────────────────── */
.se-twisty {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--kdl-text-muted);
  cursor: pointer;
  transition: color var(--duration-short) var(--ease-standard),
              background var(--duration-short) var(--ease-standard);
}

.se-twisty:hover:not(:disabled) {
  color: var(--kdl-accent);
  background: var(--kdl-hover-bg);
}

.se-twisty:disabled {
  cursor: progress;
}

.se-twisty__icon {
  display: block;
  transition: transform var(--duration-short) var(--ease-standard);
}

.se-twisty__icon--open {
  transform: rotate(90deg);
}

.se-twisty-spacer {
  display: inline-block;
  flex-shrink: 0;
  width: 18px;
  height: 18px;
}

/* ── Pane foot ────────────────────────────────────────────────────────────── */
.se-pane__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--kdl-border-subtle);
}

.se-count {
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--kdl-text-secondary);
}

.se-count--strong {
  color: var(--kdl-text-primary);
}

/* ── Transfer column ──────────────────────────────────────────────────────── */
.se-transfer {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  width: 130px;
}

.se-transfer__btn {
  width: 100%;
  white-space: nowrap;
}

.se-transfer__icon {
  flex: 0 0 auto;
}

/* ── The set ──────────────────────────────────────────────────────────────── */
.se-setbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--kdl-border-subtle);
}

.se-set-wrap {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  background: var(--kdl-card-bg);
}

.se-set {
  list-style: none;
  margin: 0;
  padding: 6px 0;
  counter-reset: none;
}

.se-set__row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 0 12px;
}

.se-set__row:nth-child(even) {
  background: var(--kdl-hover-bg);
}

.se-set__pos {
  flex-shrink: 0;
  min-width: 20px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--kdl-text-hint);
  text-align: right;
}

.se-set__label {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 13px;
  color: var(--kdl-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.se-set__actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

/* ── Small icon buttons (reorder / remove) ────────────────────────────────── */
.se-iconbtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--kdl-text-muted);
  cursor: pointer;
  transition: color var(--duration-short) var(--ease-standard),
              background var(--duration-short) var(--ease-standard);
}

.se-iconbtn:hover:not(:disabled) {
  color: var(--kdl-text-primary);
  background: var(--kdl-hover-bg);
}

.se-iconbtn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.se-iconbtn--danger:hover:not(:disabled) {
  color: #dc2626; /* danger-600 — documented error red (KDL exposes no semantic danger var) */
}

:root[data-theme="dark"] .se-iconbtn--danger:hover:not(:disabled) {
  color: #f87171;
}

/* ── Link-style buttons (selection / sort actions) ────────────────────────── */
.se-linkbtn {
  padding: 2px 4px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--kdl-text-muted);
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: color var(--duration-short) var(--ease-standard);
}

.se-linkbtn:hover:not(:disabled) {
  color: var(--kdl-accent);
}

.se-linkbtn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ── Footer (alias picker + deferred note + actions) ──────────────────────── */
.se-foot {
  display: flex;
  align-items: flex-end;
  gap: 14px;
  width: 100%;
}

.se-foot__alias {
  flex: 0 0 220px;
}

.se-foot__alias-select {
  width: 100%;
}

.se-foot__deferred {
  flex: 1 1 auto;
  font-size: 11px;
  font-style: italic;
  color: var(--kdl-text-hint);
  text-align: center;
}

.se-foot__actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

@media (prefers-reduced-motion: reduce) {
  .se-twisty,
  .se-twisty__icon,
  .se-iconbtn,
  .se-linkbtn {
    transition: none;
  }
}

/* ── Responsive — stack the panes on narrow widths ────────────────────────── */
@media (max-width: 760px) {
  .se {
    grid-template-columns: 1fr;
  }

  .se-transfer {
    flex-direction: row;
    flex-wrap: wrap;
    width: 100%;
  }

  .se-transfer__btn {
    width: auto;
    flex: 1 1 auto;
  }

  .se-foot {
    flex-wrap: wrap;
  }

  .se-foot__alias {
    flex: 1 1 100%;
  }

  .se-foot__deferred {
    flex: 1 1 100%;
    text-align: left;
  }
}
</style>
