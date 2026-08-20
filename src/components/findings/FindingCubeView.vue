<!--
  FindingCubeView — the Cube view tab of the finding modal.

  Renders the finding's saved cross-tab (GET /audit/findings/<id>/cube-view/data/
  — the pivot payload verbatim under `cube`), lets MC change rows/cols/measure/
  filters against the journal-pivot dimension vocabulary and re-save (PUT), and
  offers "Create cube view from this finding" (GET .../cube-view/suggest/),
  which shows what the seed was derived from — a starting point, not an answer.

  A finding with NO saved cube view is a clean empty state: the data endpoint
  404s by design in that case and this component treats that as "none saved
  yet", never as an error.
-->
<template>
  <div class="fc-root">
    <!-- Loading -->
    <div v-if="state === 'loading'" class="fc-state">
      <KSpinner size="sm" tone="accent" /> Loading cube view…
    </div>

    <!-- Hard error (auth / 500 / pivot 400 passed through) -->
    <KAlert v-else-if="state === 'error'" variant="error" :title="loadError">
      <button type="button" class="btn btn-ghost btn-sm" @click="load">Retry</button>
    </KAlert>

    <!-- No cube view saved — clean empty state -->
    <div v-else-if="state === 'none' && !editorOpen" class="fc-empty">
      <p class="fc-empty__title">No cube view saved on this finding.</p>
      <p class="fc-empty__body">
        A cube view pins a journal cross-tab (suppliers × periods, accounts × years…)
        to the finding so the number in question stays one click away.
      </p>
      <div class="fc-empty__actions">
        <button type="button" class="btn btn-primary btn-sm" :disabled="suggesting" @click="createFromFinding">
          {{ suggesting ? 'Deriving…' : 'Create cube view from this finding' }}
        </button>
        <button type="button" class="btn btn-ghost btn-sm" @click="openEditor()">
          Build one from scratch
        </button>
      </div>
      <p v-if="suggestError" class="fc-danger-text" role="alert">{{ suggestError }}</p>
    </div>

    <!-- Saved cube -->
    <template v-if="state === 'ready' && cubeData">
      <div class="fc-toolbar">
        <div class="fc-toolbar__meta">
          <strong class="fc-toolbar__name">{{ cubeData.name || 'Cube view' }}</strong>
          <span class="fc-toolbar__sub">
            {{ specSummary(cubeData.spec) }}
            <template v-if="cubeData.cube?.measure_label"> · {{ cubeData.cube.measure_label }}</template>
          </span>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" :disabled="editorOpen" @click="openEditor(cubeData)">
          Edit view
        </button>
        <button type="button" class="btn btn-ghost btn-sm" @click="load">Re-run</button>
        <template v-if="confirmingClear">
          <span class="fc-danger-text">Remove the saved view?</span>
          <button type="button" class="btn-danger btn-sm" :disabled="clearing" @click="clearCubeView">
            {{ clearing ? 'Removing…' : 'Yes, remove' }}
          </button>
          <button type="button" class="btn btn-ghost btn-sm" :disabled="clearing" @click="confirmingClear = false">
            Cancel
          </button>
        </template>
        <button v-else type="button" class="btn btn-ghost btn-sm" @click="confirmingClear = true">
          Remove
        </button>
      </div>

      <KAlert v-if="cubeData.cube?.mirror_hint" variant="warning" :title="cubeData.cube.mirror_hint" class="fc-alert" />
      <KAlert v-if="cubeData.cube?.balancing_hint" variant="info" :title="cubeData.cube.balancing_hint" class="fc-alert" />
      <p v-if="cubeData.cube?.truncated_rows || cubeData.cube?.truncated_cols" class="fc-note">
        The cross-tab was truncated ({{ cubeData.cube.truncated_rows ? 'rows' : '' }}{{ cubeData.cube.truncated_rows && cubeData.cube.truncated_cols ? ' and ' : '' }}{{ cubeData.cube.truncated_cols ? 'columns' : '' }}) — narrow the filters to see everything.
      </p>

      <!-- Cross-tab -->
      <div class="fc-table-wrap">
        <table class="fc-table">
          <thead>
            <tr>
              <th class="fc-th fc-th--rowdim">
                {{ (cubeData.cube?.row_dims || []).map((d) => d.label).join(' / ') || 'Rows' }}
              </th>
              <th v-for="(col, idx) in cubeData.cube?.cols || []" :key="`c-${idx}`" class="fc-th fc-th--num">
                {{ col || '—' }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, ridx) in cubeData.cube?.rows || []"
              :key="`r-${ridx}`"
              :class="{ 'fc-row--total': row.is_total }"
            >
              <td class="fc-td fc-td--label" :class="`fc-td--depth-${Math.min(row.depth || 0, 4)}`">
                {{ rowLabel(row) }}
              </td>
              <td v-for="(cell, cidx) in row.cells" :key="`r-${ridx}-c-${cidx}`" class="fc-td fc-td--num">
                {{ formatCell(cell) }}
              </td>
            </tr>
          </tbody>
          <tfoot v-if="(cubeData.cube?.col_totals || []).length">
            <tr class="fc-row--grand">
              <td class="fc-td fc-td--label">Total</td>
              <td v-for="(t, tidx) in cubeData.cube.col_totals" :key="`t-${tidx}`" class="fc-td fc-td--num">
                {{ formatCell(t) }}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p class="fc-note">
        Grand total {{ formatCell(cubeData.cube?.grand_total) }}
        · {{ cubeData.cube?.leaf_count ?? 0 }} leaf row{{ (cubeData.cube?.leaf_count ?? 0) === 1 ? '' : 's' }}
      </p>
      <p v-if="cubeNote" class="fc-cube-note">{{ cubeNote }}</p>
    </template>

    <!-- Editor -->
    <section v-if="editorOpen" class="fc-editor">
      <h4 class="fc-editor__heading">{{ state === 'ready' ? 'Edit cube view' : 'New cube view' }}</h4>

      <p v-if="derivedFrom.length" class="fc-derived">
        Derived from:
        <KBadge v-for="(d, idx) in derivedFrom" :key="`df-${idx}`" :label="String(d)" tone="muted" size="sm" />
        <span class="fc-derived__note">— a starting point derived from the finding's structured data, not an answer.</span>
      </p>

      <div v-if="dimsError" class="fc-danger-text" role="alert">{{ dimsError }}</div>
      <div v-else-if="!dimensions.length" class="fc-state">
        <KSpinner size="sm" tone="accent" /> Loading dimensions…
      </div>

      <template v-else>
        <div class="fc-editor__grid">
          <KInput v-model="draft.name" label="Name" placeholder="e.g. Payments before bill — by supplier" class="fc-editor__wide" />
          <KMultiSelect v-model="draft.rows" label="Rows (outermost first)" placeholder="Pick at least one" :options="dimensionOptions" />
          <KMultiSelect v-model="draft.cols" label="Columns" placeholder="Optional" :options="dimensionOptions" />
          <KSelect v-model="draft.measure" label="Measure" :options="measureOptions" />
          <KSelect v-model="draft.journal_type" label="Journal type" :options="JOURNAL_TYPE_OPTIONS" />
          <KInput v-model="draft.date_from" label="From" type="date" />
          <KInput v-model="draft.date_to" label="To" type="date" />
          <KInput v-model="draft.q" label="Journal search (q)" placeholder="Narration / journal number…" clearable class="fc-editor__wide" />
        </div>

        <!-- Dimension filters -->
        <div class="fc-filters">
          <span class="fc-filters__label">Dimension filters</span>
          <ul v-if="draft.filters.length" class="fc-filters__list">
            <li v-for="(f, idx) in draft.filters" :key="`f-${idx}`" class="fc-filter">
              <KBadge :label="dimensionLabel(f.dim)" tone="muted" size="sm" />
              <span class="fc-filter__values">{{ f.values.join(', ') }}</span>
              <button type="button" class="btn btn-ghost btn-sm" aria-label="Remove filter" @click="removeFilter(idx)">
                Remove
              </button>
            </li>
          </ul>
          <div class="fc-filters__add">
            <KSelect v-model="newFilterDim" label="Dimension" :options="dimensionOptions" class="fc-filters__dim" />
            <KInput v-model="newFilterValues" label="Values (comma-separated)" placeholder="e.g. Expense, Cost of Sales" class="fc-filters__values" />
            <button
              type="button"
              class="btn btn-ghost btn-sm fc-filters__btn"
              :disabled="!newFilterDim || !newFilterValues.trim()"
              @click="addFilter"
            >
              Add filter
            </button>
          </div>
        </div>

        <KCheckbox v-model="draft.suppress" label="Suppress all-zero rows" />

        <p v-if="draftError" class="fc-danger-text" role="alert">{{ draftError }}</p>
        <p v-if="saveError" class="fc-danger-text" role="alert">{{ saveError }}</p>

        <div class="fc-editor__actions">
          <button type="button" class="btn btn-ghost btn-sm" :disabled="saving" @click="closeEditor">Cancel</button>
          <button
            v-if="state !== 'ready'"
            type="button"
            class="btn btn-ghost btn-sm"
            :disabled="suggesting || saving"
            @click="createFromFinding"
          >
            {{ suggesting ? 'Deriving…' : 'Derive from finding' }}
          </button>
          <button type="button" class="btn btn-primary btn-sm" :disabled="!!draftError || saving" @click="saveAndRun">
            {{ saving ? 'Saving…' : 'Save & run' }}
          </button>
        </div>
      </template>
    </section>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import {
  getFindingCubeData,
  saveFindingCubeView,
  deleteFindingCubeView,
  suggestFindingCubeView,
  getPivotDimensions,
} from '../../api/findings';
import { formatMoney } from '../../utils/receipts';
import KAlert from '../klikk/KAlert.vue';
import KBadge from '../klikk/KBadge.vue';
import KCheckbox from '../klikk/KCheckbox.vue';
import KInput from '../klikk/KInput.vue';
import KMultiSelect from '../klikk/KMultiSelect.vue';
import KSelect from '../klikk/KSelect.vue';
import KSpinner from '../klikk/KSpinner.vue';

const props = defineProps({
  findingId: { type: Number, required: true },
});

/**
 * The journal mirror stores every entry under several journal_type values, so
 * an unfiltered sum double-counts (the pivot's own mirror_hint says so). The
 * options mirror the mirror's vocabulary; '' = every mirror, on purpose.
 */
const JOURNAL_TYPE_OPTIONS = [
  { value: '', label: 'All mirrors (double-counts!)' },
  { value: 'journal', label: 'journal (full ledger)' },
  { value: 'transaction', label: 'transaction' },
  { value: 'manual_journal', label: 'manual_journal' },
  { value: 'system_journal', label: 'system_journal' },
];

// ── Saved-cube state ─────────────────────────────────────────────────────────

const state = ref('loading'); // 'loading' | 'ready' | 'none' | 'error'
const cubeData = ref(null);
const loadError = ref('');

const cubeNote = computed(() => cubeData.value?.cube_note || '');

let loadSeq = 0;

async function load() {
  const seq = ++loadSeq;
  state.value = 'loading';
  loadError.value = '';
  try {
    const data = await getFindingCubeData(props.findingId);
    if (seq !== loadSeq) return;
    cubeData.value = data;
    state.value = 'ready';
  } catch (err) {
    if (seq !== loadSeq) return;
    if (err?.response?.status === 404) {
      // By design: no cube view saved on this finding (or the route is not
      // wired yet) — an empty state, not an error.
      cubeData.value = null;
      state.value = 'none';
    } else {
      loadError.value = err?.response?.data?.detail
        || 'Could not load the cube view.';
      state.value = 'error';
    }
    if (err?.response?.status !== 404) console.error(err);
  }
}

onMounted(load);
watch(() => props.findingId, () => {
  editorOpen.value = false;
  derivedFrom.value = [];
  confirmingClear.value = false;
  load();
});

// ── Cross-tab rendering ──────────────────────────────────────────────────────

function rowLabel(row) {
  const keys = Array.isArray(row?.keys) ? row.keys : [];
  const last = keys.length ? keys[keys.length - 1] : '';
  return `${row?.is_total ? '∑ ' : ''}${last || '—'}`;
}

function formatCell(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (cubeData.value?.cube?.measure === 'count') return String(value);
  return formatMoney(value);
}

function specSummary(spec) {
  if (!spec) return '';
  const rows = (spec.rows || []).join(', ');
  const cols = (spec.cols || []).join(', ');
  return cols ? `${rows} × ${cols}` : rows;
}

// ── Remove saved view ────────────────────────────────────────────────────────

const confirmingClear = ref(false);
const clearing = ref(false);

async function clearCubeView() {
  clearing.value = true;
  try {
    await deleteFindingCubeView(props.findingId);
    cubeData.value = null;
    state.value = 'none';
  } catch (err) {
    loadError.value = err?.response?.data?.detail || 'Removing the cube view failed.';
    state.value = 'error';
    console.error(err);
  } finally {
    clearing.value = false;
    confirmingClear.value = false;
  }
}

// ── Editor ───────────────────────────────────────────────────────────────────

const editorOpen = ref(false);
const dimensions = ref([]);
const measures = ref([]);
const dimsError = ref('');

const draft = reactive({
  name: '',
  rows: [],
  cols: [],
  measure: 'amount',
  filters: [], // [{ dim, values: [...] }]
  totals: {},  // pass-through — no editor UI, preserved on re-save
  suppress: true,
  outline: true,
  journal_type: 'journal',
  date_from: '',
  date_to: '',
  q: '',
  extraQuery: {}, // query keys this editor doesn't surface, preserved on re-save
});

const derivedFrom = ref([]);
const newFilterDim = ref('');
const newFilterValues = ref('');
const saving = ref(false);
const saveError = ref('');
const suggesting = ref(false);
const suggestError = ref('');

const dimensionOptions = computed(() =>
  dimensions.value.map((d) => ({ value: d.key, label: d.label })));

const measureOptions = computed(() =>
  measures.value.length
    ? measures.value.map((m) => ({ value: m.key, label: m.label }))
    : [{ value: 'amount', label: 'Amount' }]);

function dimensionLabel(key) {
  return dimensions.value.find((d) => d.key === key)?.label || key;
}

async function ensureDimensions() {
  if (dimensions.value.length) return;
  dimsError.value = '';
  try {
    const data = await getPivotDimensions();
    dimensions.value = Array.isArray(data?.dimensions) ? data.dimensions : [];
    measures.value = Array.isArray(data?.measures) ? data.measures : [];
  } catch (err) {
    dimsError.value = err?.response?.data?.detail || 'Could not load the pivot dimensions.';
    console.error(err);
  }
}

/** Editor-known query keys; anything else is preserved verbatim on re-save. */
const QUERY_KEYS = ['journal_type', 'date_from', 'date_to', 'q'];

function hydrateDraft(saved) {
  const spec = saved?.spec || {};
  const query = saved?.query || {};
  draft.name = saved?.name || '';
  draft.rows = Array.isArray(spec.rows) ? [...spec.rows] : [];
  draft.cols = Array.isArray(spec.cols) ? [...spec.cols] : [];
  draft.measure = spec.measure || 'amount';
  draft.filters = Object.entries(spec.filters || {})
    .filter(([, v]) => Array.isArray(v) && v.length)
    .map(([dim, values]) => ({ dim, values: values.map(String) }));
  draft.totals = spec.totals && typeof spec.totals === 'object' ? { ...spec.totals } : {};
  draft.suppress = spec.suppress !== false;
  draft.outline = spec.outline !== false;
  draft.journal_type = query.journal_type != null ? String(query.journal_type) : 'journal';
  draft.date_from = query.date_from || '';
  draft.date_to = query.date_to || '';
  draft.q = query.q || '';
  draft.extraQuery = Object.fromEntries(
    Object.entries(query).filter(([k]) => !QUERY_KEYS.includes(k)));
}

function openEditor(saved = null) {
  hydrateDraft(saved);
  if (!saved) derivedFrom.value = [];
  saveError.value = '';
  editorOpen.value = true;
  ensureDimensions();
}

function closeEditor() {
  editorOpen.value = false;
  derivedFrom.value = [];
  saveError.value = '';
}

const draftError = computed(() => {
  if (!draft.rows.length) return 'Pick at least one row dimension.';
  const dup = draft.rows.filter((r) => draft.cols.includes(r));
  if (dup.length) return `A dimension cannot be on both axes: ${dup.join(', ')}.`;
  return '';
});

function addFilter() {
  const dim = newFilterDim.value;
  const values = newFilterValues.value.split(',').map((s) => s.trim()).filter(Boolean);
  if (!dim || !values.length) return;
  const existing = draft.filters.find((f) => f.dim === dim);
  if (existing) existing.values = [...new Set([...existing.values, ...values])];
  else draft.filters.push({ dim, values });
  newFilterDim.value = '';
  newFilterValues.value = '';
}

function removeFilter(idx) {
  draft.filters.splice(idx, 1);
}

/** The canonical {spec, query} shape — same rules as the add-in's cubeSpecFrom. */
function buildBody() {
  const filters = {};
  for (const f of draft.filters) if (f.values.length) filters[f.dim] = f.values.map(String);
  const spec = {
    rows: [...draft.rows],
    cols: [...draft.cols],
    measure: draft.measure || 'amount',
    filt: Object.keys(filters).filter((k) => !draft.rows.includes(k) && !draft.cols.includes(k)),
    filters,
    totals: { ...draft.totals },
    suppress: !!draft.suppress,
    outline: !!draft.outline,
  };
  const query = { ...draft.extraQuery };
  if (draft.journal_type) query.journal_type = draft.journal_type;
  if (draft.date_from) query.date_from = draft.date_from;
  if (draft.date_to) query.date_to = draft.date_to;
  if (draft.q.trim()) query.q = draft.q.trim();
  return { name: draft.name.trim() || null, spec, query };
}

async function saveAndRun() {
  if (draftError.value) return;
  saving.value = true;
  saveError.value = '';
  try {
    await saveFindingCubeView(props.findingId, buildBody());
    closeEditor();
    await load();
  } catch (err) {
    // The backend passes the pivot's own 400 wording through — show it as-is.
    saveError.value = err?.response?.data?.detail || 'Saving the cube view failed.';
    console.error(err);
  } finally {
    saving.value = false;
  }
}

async function createFromFinding() {
  suggesting.value = true;
  suggestError.value = '';
  try {
    const data = await suggestFindingCubeView(props.findingId);
    hydrateDraft(data);
    derivedFrom.value = Array.isArray(data?.derived_from) ? data.derived_from : [];
    saveError.value = '';
    editorOpen.value = true;
    ensureDimensions();
  } catch (err) {
    suggestError.value = err?.response?.data?.detail || 'Deriving a cube view failed.';
    console.error(err);
  } finally {
    suggesting.value = false;
  }
}
</script>

<style scoped>
.fc-root {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.fc-state {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--kdl-text-muted);
}

/* Danger text: danger-600 light / danger-400 dark — klikk.css's own pairing. */
.fc-danger-text {
  font-size: 12px;
  margin: 0;
  @apply text-danger-600;
}

:root[data-theme="dark"] .fc-danger-text {
  @apply text-danger-400;
}

/* ── Empty state ────────────────────────────────────────────────────────── */
.fc-empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 16px;
  border: 1px dashed var(--kdl-border);
  border-radius: 10px;
}

.fc-empty__title {
  font-size: 13px;
  font-weight: 600;
  margin: 0;
}

.fc-empty__body {
  font-size: 12px;
  color: var(--kdl-text-muted);
  margin: 0;
  max-width: 52ch;
}

.fc-empty__actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
  flex-wrap: wrap;
}

/* ── Toolbar ────────────────────────────────────────────────────────────── */
.fc-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.fc-toolbar__meta {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.fc-toolbar__name {
  font-size: 13px;
}

.fc-toolbar__sub {
  font-size: 11px;
  color: var(--kdl-text-muted);
}

.fc-alert {
  margin: 0;
}

.fc-note {
  font-size: 11px;
  color: var(--kdl-text-muted);
  margin: 0;
}

.fc-cube-note {
  font-size: 12px;
  color: var(--kdl-text-secondary);
  white-space: pre-wrap;
  margin: 0;
}

/* ── Cross-tab table ────────────────────────────────────────────────────── */
.fc-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--kdl-border-subtle, var(--kdl-border));
  border-radius: 8px;
  max-height: 420px;
  overflow-y: auto;
}

.fc-table {
  border-collapse: collapse;
  width: 100%;
  font-size: 12px;
}

.fc-th {
  position: sticky;
  top: 0;
  background: var(--kdl-raised-bg, var(--kdl-card-bg));
  text-align: left;
  font-weight: 600;
  padding: 6px 10px;
  border-bottom: 1px solid var(--kdl-border);
  white-space: nowrap;
}

.fc-th--num {
  text-align: right;
}

.fc-td {
  padding: 4px 10px;
  border-bottom: 1px solid var(--kdl-border-subtle, var(--kdl-border));
  white-space: nowrap;
}

.fc-td--label {
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fc-td--num {
  text-align: right;
  font-family: var(--kdl-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-variant-numeric: tabular-nums;
}

/* Outline indent per consolidation depth. */
.fc-td--depth-1 { padding-left: 24px; }
.fc-td--depth-2 { padding-left: 36px; }
.fc-td--depth-3 { padding-left: 48px; }
.fc-td--depth-4 { padding-left: 60px; }

.fc-row--total .fc-td {
  font-weight: 600;
  background: var(--kdl-surface-sunken, var(--kdl-hover-bg));
}

.fc-row--grand .fc-td {
  font-weight: 700;
  border-top: 2px solid var(--kdl-border);
  background: var(--kdl-raised-bg, var(--kdl-card-bg));
}

/* ── Editor ─────────────────────────────────────────────────────────────── */
.fc-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--kdl-border-subtle, var(--kdl-border));
  border-radius: 10px;
  background: var(--kdl-surface-sunken, var(--kdl-hover-bg));
}

.fc-editor__heading {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--kdl-text-secondary);
  margin: 0;
}

.fc-derived {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 12px;
  color: var(--kdl-text-secondary);
  margin: 0;
}

.fc-derived__note {
  font-size: 11px;
  color: var(--kdl-text-muted);
}

.fc-editor__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px;
}

.fc-editor__wide {
  grid-column: 1 / -1;
}

.fc-editor__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* ── Filters ────────────────────────────────────────────────────────────── */
.fc-filters {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.fc-filters__label {
  font-size: 12px;
  font-weight: 500;
  color: var(--kdl-text-secondary);
}

.fc-filters__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.fc-filter {
  display: flex;
  align-items: center;
  gap: 8px;
}

.fc-filter__values {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.fc-filters__add {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.fc-filters__dim    { flex: 0 1 200px; min-width: 160px; }
.fc-filters__values { flex: 1 1 220px; min-width: 180px; }
.fc-filters__btn    { align-self: flex-end; }
</style>
