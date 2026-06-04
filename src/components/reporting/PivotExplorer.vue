<template>
  <SectionCard
    title="Slice &amp; Dice (TM1)"
    description="Pivot any TM1 cube — drag dimensions onto rows, columns and filters, then run a live query. A PAW-lite explorer; nothing here writes back to TM1."
  >
    <div class="pivot">
      <!-- ── Cube picker ──────────────────────────────────────────────── -->
      <div class="pivot__cube-row">
        <KSelect
          v-model="cube"
          class="pivot__cube-select"
          label="Cube"
          placeholder="Select a TM1 cube…"
          :options="cubeOptions"
          :disabled="cubesLoading || !!cubesError"
          aria-label="TM1 cube"
        />
        <div v-if="cubesLoading" class="pivot__inline-status" role="status">
          <KSpinner size="sm" tone="muted" label="Loading cubes" />
          <span>Loading cubes…</span>
        </div>
        <p v-else-if="cubesError" class="pivot__inline-status pivot__inline-status--error">
          {{ cubesError }}
        </p>
      </div>

      <!-- ── Dimension assignment grid ────────────────────────────────── -->
      <div v-if="cube && dimsLoading" class="pivot__status">
        <KSpinner size="sm" tone="accent" label="Loading dimensions" />
        <span>Loading dimensions for {{ cube }}…</span>
      </div>

      <p v-else-if="cube && dimsError" class="pivot__status pivot__status--error">
        {{ dimsError }}
      </p>

      <div v-else-if="cube && dimensions.length" class="pivot__assign">
        <div class="pivot__assign-head">
          <h3 class="pivot__assign-title">Dimensions</h3>
          <p class="pivot__assign-hint">
            Assign each dimension to Rows, Columns or Filter. Rows / Columns take one
            or more members; a Filter pins a single member.
          </p>
        </div>

        <ul class="pivot__dim-list">
          <li
            v-for="dim in dimensions"
            :key="dim"
            class="pivot__dim"
            :class="`pivot__dim--${assignments[dim]}`"
          >
            <div class="pivot__dim-name" :title="dim">{{ dim }}</div>

            <KSelect
              v-model="assignments[dim]"
              class="pivot__dim-role"
              :options="ROLE_OPTIONS"
              :aria-label="`Role for dimension ${dim}`"
            />

            <!-- Rows / Columns → multi-member picker (lazy-loaded) -->
            <div
              v-if="assignments[dim] === 'rows' || assignments[dim] === 'cols'"
              class="pivot__dim-members"
            >
              <KMultiSelect
                v-if="elementCache[dim] && !elementCache[dim].error"
                v-model="memberSelections[dim]"
                class="pivot__member-select"
                :options="elementOptions(dim)"
                :placeholder="memberPlaceholder(dim)"
                :aria-label="`Members for ${dim}`"
              />
              <button
                v-else
                type="button"
                class="pivot__load-btn"
                :disabled="isElementsLoading(dim)"
                @click="ensureElements(dim)"
              >
                <KSpinner v-if="isElementsLoading(dim)" size="xs" tone="muted" />
                <span>{{ loadBtnLabel(dim) }}</span>
              </button>
              <p v-if="elementError(dim)" class="pivot__dim-error">{{ elementError(dim) }}</p>
            </div>

            <!-- Filter → single-member picker (lazy-loaded) -->
            <div v-else-if="assignments[dim] === 'filter'" class="pivot__dim-members">
              <KSelect
                v-if="elementCache[dim] && !elementCache[dim].error"
                v-model="filterSelections[dim]"
                class="pivot__member-select"
                :options="elementOptions(dim)"
                :placeholder="memberPlaceholder(dim)"
                :aria-label="`Filter member for ${dim}`"
              />
              <button
                v-else
                type="button"
                class="pivot__load-btn"
                :disabled="isElementsLoading(dim)"
                @click="ensureElements(dim)"
              >
                <KSpinner v-if="isElementsLoading(dim)" size="xs" tone="muted" />
                <span>{{ loadBtnLabel(dim) }}</span>
              </button>
              <p v-if="elementError(dim)" class="pivot__dim-error">{{ elementError(dim) }}</p>
            </div>

            <div v-else class="pivot__dim-members pivot__dim-members--muted">
              Not used in this view
            </div>
          </li>
        </ul>

        <!-- ── Run controls ───────────────────────────────────────────── -->
        <div class="pivot__controls">
          <KToggle v-model="suppressEmpty" label="Suppress empty rows / columns" />
          <div class="pivot__controls-spacer" />
          <button
            type="button"
            class="btn btn-primary btn-sm pivot__run"
            :disabled="!canRun || running"
            @click="runQuery"
          >
            <KSpinner v-if="running" size="xs" tone="muted" label="Querying" />
            <span>{{ running ? 'Querying TM1…' : 'Run query' }}</span>
          </button>
        </div>

        <p v-if="!canRun" class="pivot__hint">
          Put at least one dimension on Rows and one on Columns to run a query.
        </p>
      </div>

      <!-- Empty: no cube chosen yet -->
      <EmptyState
        v-else-if="!cube && !cubesLoading && !cubesError"
        icon="▦"
        title="Choose a cube to begin"
        body="Pick a TM1 cube above. Its dimensions load automatically — then assign them to rows, columns and filters."
      />

      <!-- Empty: cube has no dimensions -->
      <EmptyState
        v-else-if="cube && !dimsLoading && !dimsError && !dimensions.length"
        icon="∅"
        title="No dimensions"
        :body="`The cube ${cube} returned no dimensions.`"
      />

      <!-- ── Resolved slice summary ─────────────────────────────────────── -->
      <div v-if="cube && (result || running || runError)" class="pivot__summary">
        <div class="pivot__summary-row">
          <span class="pivot__summary-label">Slice</span>
          <code class="pivot__summary-code">{{ sliceSummary }}</code>
          <span v-if="gridSizeLabel" class="pivot__grid-size">{{ gridSizeLabel }}</span>
        </div>

        <!-- Collapsible: the literal MDX the backend ran for this slice. -->
        <div v-if="mdxText" class="pivot__mdx">
          <button
            type="button"
            class="pivot__mdx-toggle"
            :aria-expanded="showMdx"
            aria-controls="pivot-mdx-body"
            @click="showMdx = !showMdx"
          >
            <svg
              class="pivot__mdx-chevron"
              :class="{ 'pivot__mdx-chevron--open': showMdx }"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <polyline points="9 6 15 12 9 18" />
            </svg>
            <span>{{ showMdx ? 'Hide MDX' : 'Show MDX' }}</span>
          </button>
          <pre v-show="showMdx" id="pivot-mdx-body" class="pivot__mdx-code">{{ mdxText }}</pre>
        </div>
      </div>

      <!-- ── Drill breadcrumb / reset ───────────────────────────────────── -->
      <div v-if="cube && result && (drillPath.length || hasDrillableRows)" class="pivot__drill-bar">
        <span class="pivot__drill-label">Drill path</span>
        <ol v-if="drillPath.length" class="pivot__drill-trail">
          <li class="pivot__drill-crumb pivot__drill-crumb--root">All</li>
          <li
            v-for="(step, i) in drillPath"
            :key="`drill-${i}`"
            class="pivot__drill-crumb"
          >
            <span class="pivot__drill-sep" aria-hidden="true">›</span>
            {{ step.parent }}
          </li>
        </ol>
        <span v-else class="pivot__drill-hint">Click a ▶ row to drill into its children.</span>
        <button
          v-if="drillPath.length"
          type="button"
          class="pivot__drill-reset"
          @click="resetToDefault"
        >
          Reset to default
        </button>
      </div>

      <!-- ── Run state: loading / error / result ───────────────────────── -->
      <div v-if="running" class="pivot__status">
        <KSpinner size="sm" tone="accent" label="Querying TM1" />
        <span>Querying TM1…</span>
      </div>

      <p v-else-if="runError" class="pivot__status pivot__status--error">{{ runError }}</p>

      <template v-else-if="result">
        <EmptyState
          v-if="!pivotView.rows.length"
          icon="∅"
          title="No data"
          body="The query returned no rows. Try widening the members, or turn off Suppress empty rows / columns."
        />
        <div v-else class="pivot__table-wrap">
          <table class="pivot-table">
            <thead>
              <tr>
                <th
                  v-for="(rh, i) in pivotView.rowHeaders"
                  :key="`rh-${i}`"
                  class="pivot-table__corner"
                  scope="col"
                >
                  {{ rh }}
                </th>
                <th
                  v-for="(col, ci) in pivotView.colHeaders"
                  :key="`col-${ci}`"
                  class="pivot-table__col-head"
                  scope="col"
                >
                  {{ col }}
                </th>
                <th class="pivot-table__col-head pivot-table__total-head" scope="col">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, ri) in pivotView.rows" :key="`row-${ri}`">
                <th
                  v-for="(member, mi) in row.members"
                  :key="`rm-${ri}-${mi}`"
                  class="pivot-table__row-head"
                  :class="{ 'pivot-table__row-head--drillable': mi === 0 && row.drillable }"
                  scope="row"
                >
                  <span v-if="mi === 0 && row.drillable" class="pivot-table__row-head-inner">
                    <button
                      type="button"
                      class="pivot-table__drill"
                      :class="{ 'pivot-table__drill--busy': drilling === row.drillMember }"
                      :disabled="drilling === row.drillMember"
                      :aria-expanded="false"
                      :aria-label="`Drill into ${member}`"
                      @click="drillRow(row.drillMember)"
                    >
                      <KSpinner v-if="drilling === row.drillMember" size="xs" tone="muted" />
                      <svg
                        v-else
                        class="pivot-table__drill-icon"
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
                    <span>{{ member }}</span>
                  </span>
                  <span v-else>{{ member }}</span>
                </th>
                <td
                  v-for="(cell, ci) in row.cells"
                  :key="`cell-${ri}-${ci}`"
                  class="pivot-table__cell pivot-num"
                >
                  {{ formatCell(cell) }}
                </td>
                <td class="pivot-table__cell pivot-table__total-cell pivot-num">
                  {{ formatTotal(row.rowTotal) }}
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="pivot-table__total-row">
                <th
                  class="pivot-table__row-head pivot-table__total-corner"
                  :colspan="pivotView.rowHeaders.length"
                  scope="row"
                >
                  Total
                </th>
                <td
                  v-for="(total, ci) in pivotView.colTotals"
                  :key="`ctot-${ci}`"
                  class="pivot-table__cell pivot-table__total-cell pivot-num"
                >
                  {{ formatTotal(total) }}
                </td>
                <td class="pivot-table__cell pivot-table__grand-total pivot-num">
                  {{ formatTotal(pivotView.grandTotal) }}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </template>
    </div>
  </SectionCard>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import SectionCard from '../klikk/SectionCard.vue';
import KSelect from '../klikk/KSelect.vue';
import KMultiSelect from '../klikk/KMultiSelect.vue';
import KToggle from '../klikk/KToggle.vue';
import KSpinner from '../klikk/KSpinner.vue';
import EmptyState from '../klikk/EmptyState.vue';
import {
  getTm1Cubes,
  getTm1CubeDimensions,
  getTm1DimensionElements,
  getTm1DimensionChildren,
  runTm1Query,
} from '../../api/planningAnalytics';

const DEFAULT_CUBE = 'gl_src_trial_balance';
const MAX_MEMBER_OPTIONS = 500; // cap the picker for very large dimensions.

const ROLE_OPTIONS = [
  { value: 'rows', label: 'Rows' },
  { value: 'cols', label: 'Columns' },
  { value: 'filter', label: 'Filter' },
  { value: 'unused', label: '(unused)' },
];

// ── Defensive normalisers — backend lives in a separate repo, so every shape
// is coerced and the raw payload is logged once for easy adjustment. ─────────

function pickName(item) {
  if (item == null) return null;
  if (typeof item === 'string') return item;
  if (typeof item === 'number') return String(item);
  // Column headers come back as member tuples, e.g. [["Jul"],["Aug"]] -> "Jul".
  if (Array.isArray(item)) {
    return item.map(pickName).filter(Boolean).join(' / ') || null;
  }
  return item.name ?? item.Name ?? item.value ?? item.id ?? null;
}

// { cubes: [...] } | { results: [...] } | [...] | [{name}] -> string[]
function normaliseCubes(data) {
  const raw =
    (Array.isArray(data) && data) ||
    data?.cubes ||
    data?.results ||
    data?.data ||
    [];
  return raw.map(pickName).filter(Boolean);
}

// { dimensions: [...] } | [...] | [{name}] -> string[]
function normaliseDimensions(data) {
  const raw =
    (Array.isArray(data) && data) ||
    data?.dimensions ||
    data?.results ||
    data?.data ||
    [];
  return raw.map(pickName).filter(Boolean);
}

// { elements: [{name,type}] } | [...] | ['a','b'] -> [{ value, label, type }]
function normaliseElements(data) {
  const raw =
    (Array.isArray(data) && data) ||
    data?.elements ||
    data?.results ||
    data?.data ||
    [];
  return raw
    .map((el) => {
      const name = pickName(el);
      if (!name) return null;
      const type = typeof el === 'object' && el ? el.type ?? el.Type ?? null : null;
      return { value: name, label: name, type };
    })
    .filter(Boolean);
}

// Children of a consolidation. Same backend shape as elements
// ({ children:[{name,type}] } | [...]) -> [{ value, label, type }].
function normaliseChildren(data) {
  const raw =
    (Array.isArray(data) && data) ||
    data?.children ||
    data?.elements ||
    data?.results ||
    data?.data ||
    [];
  return raw
    .map((el) => {
      const name = pickName(el);
      if (!name) return null;
      const type = typeof el === 'object' && el ? el.type ?? el.Type ?? null : null;
      return { value: name, label: name, type };
    })
    .filter(Boolean);
}

// TM1 element types: 'N'/1 = numeric leaf, 'S'/2 = string leaf, 'C'/3 =
// consolidation (drillable). Backend may return the letter or the int — accept
// both. A null/unknown type is treated as a leaf (not drillable).
function isConsolidation(type) {
  if (type == null) return false;
  if (typeof type === 'number') return type === 3;
  const t = String(type).trim().toUpperCase();
  return t === 'C' || t === '3' || t === 'CONSOLIDATED' || t === 'CONSOLIDATION';
}

// A pivot cellset is { rows: [{ members:[...], cells:[{value}] }] }. Members may
// be strings or {name}; cells may be {value}/{Value}/{number} or bare numbers.
// Column headers may live on `data.columns` / `data.cols` / `data.col_headers`,
// or be reconstructable from the requested column members. We accept all.
function normalisePivot(data, requestedColMembers, rowDimLabels) {
  const rawRows = data?.rows || data?.cellset?.rows || data?.data || [];
  const rows = (Array.isArray(rawRows) ? rawRows : []).map((r) => {
    const rawMembers = r?.members ?? r?.row_members ?? r?.tuple ?? [];
    const members = (Array.isArray(rawMembers) ? rawMembers : [rawMembers])
      .map(pickName)
      .filter((m) => m != null);
    const rawCells = r?.cells ?? r?.values ?? [];
    const cells = (Array.isArray(rawCells) ? rawCells : []).map(readCell);
    return { members, cells };
  });

  // Column headers, in priority order: explicit header arrays from the payload,
  // else the members we asked for on the column axis.
  const headerSource =
    data?.col_headers ||
    data?.columns ||
    data?.cols ||
    data?.column_members ||
    requestedColMembers ||
    [];
  let colHeaders = (Array.isArray(headerSource) ? headerSource : [])
    .map(pickName)
    .filter(Boolean);

  // If the cellset is wider than the headers we resolved, pad so every cell has
  // a column label (defensive — keeps the table rectangular).
  const widest = rows.reduce((max, r) => Math.max(max, r.cells.length), 0);
  if (colHeaders.length < widest) {
    for (let i = colHeaders.length; i < widest; i += 1) {
      colHeaders.push(`Col ${i + 1}`);
    }
  } else if (colHeaders.length > widest && widest > 0) {
    colHeaders = colHeaders.slice(0, widest);
  }

  // Row headers: one per row-axis dimension. Fall back to the deepest row tuple.
  const depth = rows.reduce((max, r) => Math.max(max, r.members.length), 0);
  const rowHeaders =
    rowDimLabels && rowDimLabels.length
      ? rowDimLabels.slice(0, Math.max(depth, 1))
      : Array.from({ length: Math.max(depth, 1) }, (_, i) => `Row ${i + 1}`);

  return { rows, colHeaders, rowHeaders };
}

// Cells normalise to { value, formatted } so the table can prefer the backend's
// pre-formatted string while totals still sum the raw numeric value.
function readCell(cell) {
  if (cell == null) return { value: null, formatted: null };
  if (typeof cell === 'number') return { value: cell, formatted: null };
  if (typeof cell === 'string') return { value: cell, formatted: null };
  // object: { value, formatted } | { Value } | { v } | { Numeric }
  const v = cell.value ?? cell.Value ?? cell.v ?? cell.Numeric ?? cell.numeric ?? null;
  const formatted =
    cell.formatted ?? cell.Formatted ?? cell.formatted_value ?? cell.display ?? null;
  return { value: v, formatted: formatted != null ? String(formatted) : null };
}

// The raw numeric of a normalised cell, for summing totals. Non-numeric → null.
function cellNumber(cell) {
  if (!cell) return null;
  const n = Number(cell.value);
  return Number.isFinite(n) ? n : null;
}

// ── State ────────────────────────────────────────────────────────────────
const cube = ref(null);
const cubes = ref([]);
const cubesLoading = ref(false);
const cubesError = ref('');

const dimensions = ref([]);
const dimsLoading = ref(false);
const dimsError = ref('');

// dim -> 'rows' | 'cols' | 'filter' | 'unused'
const assignments = reactive({});
// dim -> string[] (rows/cols members)
const memberSelections = reactive({});
// dim -> string (filter member)
const filterSelections = reactive({});
// dim -> { loading, error, options:[{value,label,type}] }
const elementCache = reactive({});
// dim -> { [memberName]: type } — element types learned from element/children
// payloads, so the rendered pivot knows which members are drillable (type 'C').
const memberTypes = reactive({});
// dim -> string[] — the populated default members resolved on cube load (children
// of the top consolidation). "Reset to default" restores Rows/Cols to these.
const defaultMembers = reactive({});
// Drill breadcrumb: ordered list of { dim, parent } drill-downs the user applied
// to Rows. Lets us show a trail and pop back / reset.
const drillPath = ref([]);

const suppressEmpty = ref(true);
// Collapsible "show MDX" toggle under the slice summary — a TM1 person wants to
// see the literal query the backend ran.
const showMdx = ref(false);

const result = ref(null);
const running = ref(false);
const runError = ref('');
// Monotonic token so a stale query response (user changed the slice mid-flight)
// is dropped — last query wins.
let querySeq = 0;

// ── Options / derived ──────────────────────────────────────────────────────
const cubeOptions = computed(() => cubes.value.map((c) => ({ value: c, label: c })));

const rowDims = computed(() => dimensions.value.filter((d) => assignments[d] === 'rows'));
const colDims = computed(() => dimensions.value.filter((d) => assignments[d] === 'cols'));
const filterDims = computed(() => dimensions.value.filter((d) => assignments[d] === 'filter'));

const canRun = computed(() => rowDims.value.length > 0 && colDims.value.length > 0);

const sliceSummary = computed(() => {
  if (!cube.value) return '';
  const fmt = (dims, picker) =>
    dims
      .map((d) => {
        const m = picker(d);
        const list = Array.isArray(m) ? m : m ? [m] : [];
        return list.length ? `${d}[${list.join(', ')}]` : `${d}[—]`;
      })
      .join(' × ') || '—';
  const rows = fmt(rowDims.value, (d) => memberSelections[d]);
  const cols = fmt(colDims.value, (d) => memberSelections[d]);
  const filters =
    filterDims.value
      .map((d) => `${d}=${filterSelections[d] || '—'}`)
      .join(', ') || 'none';
  return `${cube.value}  ·  ROWS ${rows}  ·  COLS ${cols}  ·  FILTERS ${filters}  ·  suppress=${suppressEmpty.value ? 'on' : 'off'}`;
});

// The literal MDX the backend executed for the current result, if returned.
// Surfaced under the slice summary (collapsible) — catnip for a TM1 user and a
// trust signal that this is a real query, not a mock.
const mdxText = computed(() => {
  const m = result.value?.mdx ?? result.value?.MDX ?? result.value?.query ?? null;
  return typeof m === 'string' && m.trim() ? m.trim() : '';
});

const pivot = computed(() =>
  result.value
    ? normalisePivot(
        result.value,
        colDims.value.flatMap((d) => memberSelections[d] || []),
        rowDims.value,
      )
    : { rows: [], colHeaders: [], rowHeaders: [] },
);

// The single dimension whose members head the rows — used for row-header drill.
// Drill is a single-row-dimension affordance; with multiple row dims we still
// render, but the ▶ only appears when there's exactly one row dimension.
const primaryRowDim = computed(() =>
  rowDims.value.length === 1 ? rowDims.value[0] : null,
);

// Augment the normalised pivot with a column-total row and a row-total column so
// the grid reads like a real PAW pivot. Totals sum the raw numeric cell value;
// non-numeric cells are skipped. A column total is blank when no numeric cells
// contributed (keeps an all-string axis clean).
const pivotView = computed(() => {
  const base = pivot.value;
  const colCount = base.colHeaders.length;

  const rows = base.rows.map((row) => {
    let rowSum = 0;
    let rowHasNum = false;
    for (const cell of row.cells) {
      const n = cellNumber(cell);
      if (n != null) {
        rowSum += n;
        rowHasNum = true;
      }
    }
    // Mark the leading row member as drillable when it's a consolidation and we
    // have a single row dimension (so its children replace it on drill).
    const leadMember = row.members[0] ?? null;
    const drillable =
      !!primaryRowDim.value &&
      leadMember != null &&
      isConsolidation(memberType(primaryRowDim.value, leadMember));
    return {
      ...row,
      rowTotal: rowHasNum ? rowSum : null,
      drillable,
      drillMember: drillable ? leadMember : null,
    };
  });

  // Column totals (one per column header) + a grand total.
  const colTotals = Array.from({ length: colCount }, () => ({ sum: 0, has: false }));
  let grand = 0;
  let grandHas = false;
  for (const row of base.rows) {
    for (let ci = 0; ci < colCount; ci += 1) {
      const n = cellNumber(row.cells[ci]);
      if (n != null) {
        colTotals[ci].sum += n;
        colTotals[ci].has = true;
        grand += n;
        grandHas = true;
      }
    }
  }

  return {
    rows,
    colHeaders: base.colHeaders,
    rowHeaders: base.rowHeaders,
    colTotals: colTotals.map((c) => (c.has ? c.sum : null)),
    grandTotal: grandHas ? grand : null,
    rowCount: rows.length,
    colCount,
  };
});

// True when at least one visible row can be drilled (a single-row-dim
// consolidation) — gates the drill breadcrumb hint.
const hasDrillableRows = computed(() => pivotView.value.rows.some((r) => r.drillable));

// "6 rows × 12 cols" badge for the slice summary — the density signal.
const gridSizeLabel = computed(() => {
  if (!result.value) return '';
  const r = pivotView.value.rowCount;
  const c = pivotView.value.colCount;
  if (!r && !c) return '';
  return `${r} ${r === 1 ? 'row' : 'rows'} × ${c} ${c === 1 ? 'col' : 'cols'}`;
});

// ── Element-cache helpers (lazy per picker) ─────────────────────────────────
function elementOptions(dim) {
  return elementCache[dim]?.options ?? [];
}
function isElementsLoading(dim) {
  return !!elementCache[dim]?.loading;
}
function elementError(dim) {
  return elementCache[dim]?.error || '';
}
function memberPlaceholder(dim) {
  if (!elementCache[dim] || !elementCache[dim].options.length) return 'No members';
  return 'Select members…';
}

function loadBtnLabel(dim) {
  if (isElementsLoading(dim)) return 'Loading members…';
  if (elementError(dim)) return 'Retry — load members';
  return 'Load members';
}

// Lazy-load a dimension's elements the first time its picker is opened. Large
// dimensions (hundreds of elements) are capped to MAX_MEMBER_OPTIONS for the
// picker; the KMultiSelect / KSelect dropdowns are internally scrollable.
async function ensureElements(dim) {
  if (elementCache[dim] && !elementCache[dim].error) return;
  elementCache[dim] = { loading: true, error: '', options: [] };
  try {
    const data = await getTm1DimensionElements(dim);
    // eslint-disable-next-line no-console
    console.debug(`[PivotExplorer] elements(${dim}) raw:`, data);
    let options = normaliseElements(data);
    if (options.length > MAX_MEMBER_OPTIONS) {
      options = options.slice(0, MAX_MEMBER_OPTIONS);
    }
    elementCache[dim] = { loading: false, error: '', options };
    recordTypes(dim, options);
    seedDefaultMember(dim, options);
  } catch (error) {
    elementCache[dim] = {
      loading: false,
      error:
        error?.response?.data?.error ||
        error?.message ||
        `Could not load members for ${dim}.`,
      options: [],
    };
  }
}

// Default a dimension to its top consolidation ("All_*" / "All …" / "Total*"),
// else the first element. Rows/cols seed only if nothing is chosen yet; a Filter
// always needs exactly one member, so seed if empty.
function topElement(options) {
  if (!options.length) return null;
  const byPrefix = options.find((o) => /^(all[_ ]|total)/i.test(o.value));
  return (byPrefix || options[0]).value;
}

// Learn member -> type for a dimension from any element/children option list, so
// the rendered pivot can tell which row/col members are drillable consolidations.
function recordTypes(dim, options) {
  if (!options?.length) return;
  if (!memberTypes[dim]) memberTypes[dim] = {};
  for (const o of options) {
    if (o.value != null && o.type != null) memberTypes[dim][o.value] = o.type;
  }
}

function memberType(dim, name) {
  return memberTypes[dim]?.[name] ?? null;
}

// Measure-aware seed for a Filter dimension. For a trial-balance / GL cube the
// meaningful measure is the balance — "amount" — so we prefer it when present
// (account-children × months × amount is the intended populated default). Returns
// null when there's no obvious measure member, so the caller falls back to the
// normal top-consolidation seed.
function pickMeasureMember(options) {
  if (!options?.length) return null;
  const amount = options.find((o) => /^amount$/i.test(o.value));
  return amount ? amount.value : null;
}

function seedDefaultMember(dim, options) {
  recordTypes(dim, options);
  if (assignments[dim] === 'filter') {
    if (!filterSelections[dim]) {
      filterSelections[dim] = pickMeasureMember(options) || topElement(options);
    }
  } else if (assignments[dim] === 'rows' || assignments[dim] === 'cols') {
    if (!memberSelections[dim] || memberSelections[dim].length === 0) {
      const top = topElement(options);
      if (top) memberSelections[dim] = [top];
    }
  }
}

// POPULATED DEFAULT (the core fix). For a Rows/Cols dim, resolve the top element
// (the All_*/total seed) then fetch its CHILDREN and use those as the default
// members — so the cube opens as a real matrix (account-rollups × months) rather
// than a 1×1 grand-total cell. Falls back to [top] when the top element is
// already a leaf (no children). Filter dims keep the single-top default.
async function seedPopulatedDefault(dim) {
  await ensureElements(dim);
  const options = elementOptions(dim);
  if (!options.length) return;
  if (assignments[dim] !== 'rows' && assignments[dim] !== 'cols') {
    seedDefaultMember(dim, options);
    return;
  }
  const top = topElement(options);
  if (!top) return;
  try {
    const data = await getTm1DimensionChildren(dim, top);
    // eslint-disable-next-line no-console
    console.debug(`[PivotExplorer] children(${dim}, ${top}) raw:`, data);
    const children = normaliseChildren(data);
    recordTypes(dim, children);
    if (children.length) {
      const members = children.map((c) => c.value);
      memberSelections[dim] = members;
      defaultMembers[dim] = members.slice();
      // Surface the children in the picker too, so the member chips show the
      // populated default (EXPENSE/ASSET/…) rather than only "All_X".
      mergePickerOptions(dim, children);
      return;
    }
  } catch (error) {
    // Children fetch failed — fall back to the single-top default below so the
    // view still runs. The picker/load-members path can recover specific members.
    // eslint-disable-next-line no-console
    console.debug(`[PivotExplorer] children(${dim}, ${top}) failed:`, error);
  }
  // Fallback: top element is a leaf (or children unavailable) → single-top.
  memberSelections[dim] = [top];
  defaultMembers[dim] = [top];
}

// Ensure the lazy picker for a dim includes these option rows (children/drill
// results), de-duped, so selected members always resolve to a visible chip.
function mergePickerOptions(dim, extra) {
  const cache = elementCache[dim];
  const next = cache && !cache.error ? cache.options.slice() : [];
  const seen = new Set(next.map((o) => o.value));
  for (const o of extra) {
    if (!seen.has(o.value)) {
      next.push(o);
      seen.add(o.value);
    }
  }
  if (next.length > MAX_MEMBER_OPTIONS) next.length = MAX_MEMBER_OPTIONS;
  elementCache[dim] = { loading: false, error: '', options: next };
}

// ── Loaders ────────────────────────────────────────────────────────────────
async function loadCubes() {
  cubesLoading.value = true;
  cubesError.value = '';
  try {
    const data = await getTm1Cubes();
    // eslint-disable-next-line no-console
    console.debug('[PivotExplorer] cubes raw:', data);
    cubes.value = normaliseCubes(data);
    if (!cube.value) {
      cube.value = cubes.value.includes(DEFAULT_CUBE)
        ? DEFAULT_CUBE
        : cubes.value[0] ?? null;
    }
  } catch (error) {
    cubesError.value =
      error?.response?.data?.error || error?.message || 'Could not load cubes.';
  } finally {
    cubesLoading.value = false;
  }
}

async function loadDimensions(cubeName) {
  if (!cubeName) return;
  dimsLoading.value = true;
  dimsError.value = '';
  dimensions.value = [];
  try {
    const data = await getTm1CubeDimensions(cubeName);
    // eslint-disable-next-line no-console
    console.debug(`[PivotExplorer] dimensions(${cubeName}) raw:`, data);
    dimensions.value = normaliseDimensions(data);
    applyDefaultAssignments(dimensions.value);
    await seedAllDefaults();
  } catch (error) {
    dimsError.value =
      error?.response?.data?.error ||
      error?.message ||
      `Could not load dimensions for ${cubeName}.`;
  } finally {
    dimsLoading.value = false;
  }
}

// On cube load, resolve a sensible populated default for every assigned
// dimension: Rows/Cols → children of the top consolidation (a real grid);
// Filter → its single top member (measure-aware). Then auto-run so the explorer
// opens populated without the user touching anything.
async function seedAllDefaults() {
  await Promise.all([
    ...rowDims.value.map((d) => seedPopulatedDefault(d)),
    ...colDims.value.map((d) => seedPopulatedDefault(d)),
    ...filterDims.value.map((d) => ensureSeeded(d)),
  ]);
  if (canRun.value) runQuery();
}

// Sensible default layout: 'account'-ish on Rows, 'month'/'period' on Columns,
// everything else on Filter. Matching is fuzzy because cube dimension names vary.
function applyDefaultAssignments(dims) {
  for (const k of Object.keys(assignments)) delete assignments[k];
  for (const k of Object.keys(memberSelections)) delete memberSelections[k];
  for (const k of Object.keys(filterSelections)) delete filterSelections[k];
  for (const k of Object.keys(elementCache)) delete elementCache[k];
  for (const k of Object.keys(memberTypes)) delete memberTypes[k];
  for (const k of Object.keys(defaultMembers)) delete defaultMembers[k];
  drillPath.value = [];

  let rowsAssigned = false;
  let colsAssigned = false;
  for (const dim of dims) {
    const lower = dim.toLowerCase();
    if (!rowsAssigned && /account/.test(lower)) {
      assignments[dim] = 'rows';
      rowsAssigned = true;
    } else if (!colsAssigned && /(month|period|date|time)/.test(lower)) {
      assignments[dim] = 'cols';
      colsAssigned = true;
    } else {
      assignments[dim] = 'filter';
    }
  }
  // Guarantee at least one row + one col so the view is runnable out of the box.
  if (!rowsAssigned && dims.length) {
    const first = dims.find((d) => assignments[d] === 'filter') || dims[0];
    assignments[first] = 'rows';
    rowsAssigned = true;
  }
  if (!colsAssigned && dims.length) {
    const next = dims.find((d) => assignments[d] === 'filter');
    if (next) {
      assignments[next] = 'cols';
      colsAssigned = true;
    }
  }
}

// ── Run query ────────────────────────────────────────────────────────────
async function runQuery() {
  if (!canRun.value) return;

  // Make sure every axis/filter dimension still has a member — load (if not yet
  // loaded) + seed a default for any that are empty before querying. This covers
  // both "never opened a picker" and "switched a dimension's role after loading".
  await Promise.all(
    [...rowDims.value, ...colDims.value, ...filterDims.value]
      .filter((d) => needsSeed(d))
      .map((d) => ensureSeeded(d)),
  );

  const payload = {
    cube: cube.value,
    rows: rowDims.value.map((d) => ({
      dimension: d,
      members: memberSelections[d] || [],
    })),
    cols: colDims.value.map((d) => ({
      dimension: d,
      members: memberSelections[d] || [],
    })),
    filters: Object.fromEntries(
      filterDims.value
        .filter((d) => filterSelections[d])
        .map((d) => [d, filterSelections[d]]),
    ),
    suppress: suppressEmpty.value,
  };

  running.value = true;
  runError.value = '';
  const seq = ++querySeq;
  try {
    const data = await runTm1Query(payload);
    if (seq !== querySeq) return;
    // eslint-disable-next-line no-console
    console.debug('[PivotExplorer] query raw:', data);
    result.value = data;
  } catch (error) {
    if (seq !== querySeq) return;
    result.value = null;
    runError.value =
      error?.response?.data?.error || error?.message || 'TM1 query failed.';
  } finally {
    if (seq === querySeq) running.value = false;
  }
}

function needsSeed(dim) {
  if (assignments[dim] === 'filter') return !filterSelections[dim];
  return !memberSelections[dim] || memberSelections[dim].length === 0;
}

// Ensure a dimension has elements loaded AND a default member seeded for its
// CURRENT role — used right before a query. Unlike ensureElements (which
// early-returns once cached), this always re-seeds the empty selection, so a
// dimension whose role changed after loading still gets a sensible default.
async function ensureSeeded(dim) {
  await ensureElements(dim);
  seedDefaultMember(dim, elementOptions(dim));
}

// ── Drill-down ──────────────────────────────────────────────────────────────
// Click a consolidation row-header member → replace the current row members with
// that member's children, push a breadcrumb, and re-run. Drilling operates on the
// single primary row dimension. The clicked member is swapped for its children so
// the drilled level sits in place of its parent.
const drilling = ref(''); // member currently being drilled (shows a spinner).

async function drillRow(member) {
  const dim = primaryRowDim.value;
  if (!dim || !member || drilling.value) return;
  drilling.value = member;
  try {
    const data = await getTm1DimensionChildren(dim, member);
    // eslint-disable-next-line no-console
    console.debug(`[PivotExplorer] drill children(${dim}, ${member}) raw:`, data);
    const children = normaliseChildren(data);
    recordTypes(dim, children);
    if (!children.length) return; // leaf — nothing to expand.
    const current = memberSelections[dim] || [];
    const idx = current.indexOf(member);
    const childNames = children.map((c) => c.value);
    // Replace the parent in place with its children (de-dupe against existing).
    const without = current.filter((m) => m !== member);
    const merged = [];
    const seen = new Set();
    const insertAt = idx < 0 ? without.length : idx;
    for (let i = 0; i < without.length; i += 1) {
      if (i === insertAt) {
        for (const c of childNames) if (!seen.has(c)) { merged.push(c); seen.add(c); }
      }
      if (!seen.has(without[i])) { merged.push(without[i]); seen.add(without[i]); }
    }
    if (insertAt >= without.length) {
      for (const c of childNames) if (!seen.has(c)) { merged.push(c); seen.add(c); }
    }
    memberSelections[dim] = merged;
    mergePickerOptions(dim, children);
    drillPath.value = [...drillPath.value, { dim, parent: member }];
    runQuery();
  } catch (error) {
    // Non-fatal: leave the current grid; the run-error surface stays for query
    // failures. A failed drill just doesn't expand.
    // eslint-disable-next-line no-console
    console.debug(`[PivotExplorer] drill(${dim}, ${member}) failed:`, error);
  } finally {
    drilling.value = '';
  }
}

// Restore Rows (and Cols) to the populated defaults resolved on cube load and
// re-run. Clears the drill breadcrumb.
async function resetToDefault() {
  for (const d of [...rowDims.value, ...colDims.value]) {
    if (defaultMembers[d]?.length) {
      memberSelections[d] = defaultMembers[d].slice();
    }
  }
  drillPath.value = [];
  if (canRun.value) runQuery();
}

// ── Number formatting (generic — thousands-separated, no forced currency) ────
// Locale-grouped figures; we don't force ZAR. When the backend supplies a
// `formatted` string we prefer it verbatim.
const numberFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
});

// Render a normalised cell { value, formatted }. Prefer the backend's formatted
// string; else thousands-format the numeric; blank for null / empty / 0.
function formatCell(cell) {
  if (cell == null) return '';
  if (cell.formatted != null && cell.formatted !== '') return cell.formatted;
  const v = cell.value;
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  if (Number.isFinite(n)) return n === 0 ? '' : numberFormatter.format(n);
  return String(v); // non-numeric cell (string member) — show as-is.
}

// Format a raw numeric total (column/row/grand). Blank for null / 0.
function formatTotal(value) {
  if (value === null || value === undefined) return '';
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return '';
  return numberFormatter.format(n);
}

// ── Reactions ──────────────────────────────────────────────────────────────
watch(cube, (next, prev) => {
  if (next === prev) return;
  result.value = null;
  runError.value = '';
  loadDimensions(next);
});

// First load.
loadCubes();
</script>

<style scoped>
.pivot {
  display: grid;
  gap: 16px;
}

/* ── Cube row ─────────────────────────────────────────────────────────────── */
.pivot__cube-row {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 12px;
}

.pivot__cube-select {
  min-width: 280px;
}

.pivot__inline-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 8px;
  font-size: 13px;
  color: var(--kdl-text-secondary);
}

.pivot__inline-status--error {
  color: var(--kdl-danger, #b42318);
}

/* ── Status (loading / error) ─────────────────────────────────────────────── */
.pivot__status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 8px;
  background: var(--kdl-page-bg);
  color: var(--kdl-text-secondary);
  font-size: 13px;
}

.pivot__status--error {
  color: var(--kdl-danger, #b42318);
}

/* ── Assignment grid ──────────────────────────────────────────────────────── */
.pivot__assign {
  display: grid;
  gap: 12px;
}

.pivot__assign-head {
  display: grid;
  gap: 4px;
}

.pivot__assign-title {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  color: var(--kdl-text-primary);
}

.pivot__assign-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--kdl-text-muted);
}

.pivot__dim-list {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.pivot__dim {
  display: grid;
  grid-template-columns: minmax(120px, 1fr) 132px minmax(220px, 2.4fr);
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border: 1px solid var(--kdl-border-subtle);
  border-left: 3px solid var(--kdl-border);
  border-radius: 6px;
  background: var(--kdl-card-bg);
}

/* Left accent encodes the role at a glance (neutral hues — not RAG tones). */
.pivot__dim--rows {
  border-left-color: var(--kdl-accent);
}
.pivot__dim--cols {
  border-left-color: var(--kdl-brand-navy);
}
.pivot__dim--filter {
  border-left-color: var(--kdl-text-hint);
}
.pivot__dim--unused {
  border-left-color: var(--kdl-border);
  opacity: 0.75;
}

.pivot__dim-name {
  align-self: center;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
  color: var(--kdl-text-primary);
}

.pivot__dim-members {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.pivot__dim-members--muted {
  align-self: center;
  font-size: 12px;
  color: var(--kdl-text-hint);
}

.pivot__member-select {
  min-width: 0;
}

.pivot__load-btn {
  display: inline-flex;
  align-items: center;
  justify-self: start;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid var(--kdl-border);
  border-radius: 6px;
  background: var(--kdl-card-bg);
  color: var(--kdl-text-secondary);
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: border-color var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1)),
              color var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1));
}

@media (prefers-reduced-motion: reduce) {
  .pivot__load-btn {
    transition: none;
  }
}

.pivot__load-btn:hover:not(:disabled) {
  border-color: var(--kdl-text-muted);
  color: var(--kdl-text-primary);
}

.pivot__load-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.pivot__dim-error {
  margin: 0;
  font-size: 12px;
  color: var(--kdl-danger, #b42318);
}

/* ── Controls ─────────────────────────────────────────────────────────────── */
.pivot__controls {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-top: 4px;
}

.pivot__controls-spacer {
  flex: 1 1 0;
}

.pivot__run {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.pivot__hint {
  margin: 0;
  font-size: 12px;
  color: var(--kdl-text-muted);
}

/* ── Slice summary ────────────────────────────────────────────────────────── */
.pivot__summary {
  display: grid;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 8px;
  background: var(--kdl-page-bg);
}

.pivot__summary-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
}

.pivot__summary-label {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--kdl-text-hint);
}

.pivot__summary-code {
  min-width: 0;
  flex: 1 1 240px;
  font-family: var(--kdl-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12px;
  line-height: 1.5;
  color: var(--kdl-text-secondary);
  word-break: break-word;
}

.pivot__grid-size {
  flex-shrink: 0;
  padding: 2px 8px;
  border: 1px solid var(--kdl-border);
  border-radius: 999px;
  background: var(--kdl-card-bg);
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  color: var(--kdl-text-secondary);
  white-space: nowrap;
}

/* ── Show-MDX disclosure ──────────────────────────────────────────────────── */
.pivot__mdx {
  display: grid;
  gap: 6px;
}

.pivot__mdx-toggle {
  display: inline-flex;
  align-items: center;
  justify-self: start;
  gap: 6px;
  padding: 2px 6px;
  margin-left: -6px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--kdl-text-muted);
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
}

.pivot__mdx-toggle:hover {
  color: var(--kdl-text-primary);
}

.pivot__mdx-toggle:focus-visible {
  outline: 2px solid var(--kdl-accent);
  outline-offset: 1px;
}

.pivot__mdx-chevron {
  flex: 0 0 auto;
  color: var(--kdl-text-hint);
  transition: transform var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1));
}

.pivot__mdx-chevron--open {
  transform: rotate(90deg);
}

@media (prefers-reduced-motion: reduce) {
  .pivot__mdx-chevron {
    transition: none;
  }
}

.pivot__mdx-code {
  margin: 0;
  padding: 10px 12px;
  max-height: 220px;
  overflow: auto;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 6px;
  background: var(--kdl-card-bg);
  color: var(--kdl-text-secondary);
  font-family: var(--kdl-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

/* ── Drill breadcrumb ─────────────────────────────────────────────────────── */
.pivot__drill-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 8px;
  background: var(--kdl-page-bg);
}

.pivot__drill-label {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--kdl-text-hint);
}

.pivot__drill-trail {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.pivot__drill-crumb {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  color: var(--kdl-text-secondary);
}

.pivot__drill-crumb--root {
  color: var(--kdl-text-muted);
}

.pivot__drill-sep {
  color: var(--kdl-text-hint);
}

.pivot__drill-hint {
  font-size: 12px;
  color: var(--kdl-text-muted);
}

.pivot__drill-reset {
  margin-left: auto;
  padding: 4px 10px;
  border: 1px solid var(--kdl-border);
  border-radius: 6px;
  background: var(--kdl-card-bg);
  color: var(--kdl-text-secondary);
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: border-color var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1)),
              color var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1));
}

@media (prefers-reduced-motion: reduce) {
  .pivot__drill-reset {
    transition: none;
  }
}

.pivot__drill-reset:hover {
  border-color: var(--kdl-text-muted);
  color: var(--kdl-text-primary);
}

/* ── Pivot table ──────────────────────────────────────────────────────────── */
/* The result is the hero: a tall, self-scrolling viewport so the sticky header
   row + sticky first column engage against this container (not the page), and a
   wide month grid scrolls on both axes within a contained, framed region. */
.pivot__table-wrap {
  max-height: 62vh;
  overflow: auto;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 8px;
}

.pivot-table {
  width: 100%;
  border-collapse: collapse;
}

.pivot-table th,
.pivot-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--kdl-border-subtle);
  text-align: left;
  white-space: nowrap;
}

.pivot-table thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--kdl-page-bg);
  color: var(--kdl-text-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.pivot-table__col-head,
.pivot-table__cell {
  text-align: right;
}

.pivot-table__corner {
  color: var(--kdl-text-hint);
}

/* Sticky first column — the leading row-header stays pinned while a wide month
   grid scrolls horizontally. The corner header is the row/col intersection, so
   it gets the highest stacking + sticks on both axes. */
.pivot-table__corner:first-child {
  left: 0;
  z-index: 3;
}

.pivot-table__row-head {
  font-size: 13px;
  font-weight: 600;
  color: var(--kdl-text-primary);
  background: var(--kdl-card-bg);
}

.pivot-table__row-head:first-child {
  position: sticky;
  left: 0;
  z-index: 1;
  border-right: 1px solid var(--kdl-border-subtle);
}

.pivot-table__corner:first-child {
  border-right: 1px solid var(--kdl-border-subtle);
}

.pivot-table__cell {
  font-size: 13px;
  color: var(--kdl-text-primary);
}

.pivot-num {
  font-variant-numeric: tabular-nums;
}

.pivot-table tbody tr:hover .pivot-table__cell,
.pivot-table tbody tr:hover .pivot-table__row-head {
  background: var(--kdl-hover-bg);
}

/* ── Drill affordance on consolidation row headers ───────────────────────── */
.pivot-table__row-head-inner {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.pivot-table__drill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 1px solid var(--kdl-border);
  border-radius: 4px;
  background: var(--kdl-card-bg);
  color: var(--kdl-text-muted);
  cursor: pointer;
  transition: border-color var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1)),
              color var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1)),
              background var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1));
}

@media (prefers-reduced-motion: reduce) {
  .pivot-table__drill {
    transition: none;
  }
}

.pivot-table__drill:hover:not(:disabled) {
  border-color: var(--kdl-accent);
  color: var(--kdl-accent);
  background: var(--kdl-hover-bg);
}

.pivot-table__drill:disabled {
  cursor: progress;
  opacity: 0.7;
}

.pivot-table__drill-icon {
  display: block;
}

/* ── Totals row / column ─────────────────────────────────────────────────── */
.pivot-table__total-head {
  border-left: 2px solid var(--kdl-border);
}

.pivot-table__total-cell {
  font-weight: 600;
  color: var(--kdl-text-primary);
  background: var(--kdl-hover-bg);
}

/* Row-total column — the last cell in each body row. */
.pivot-table tbody .pivot-table__total-cell,
.pivot-table thead .pivot-table__total-head {
  border-left: 2px solid var(--kdl-border);
}

/* Column-total footer row — pinned to the bottom of the scroll viewport so the
   margins stay in view while the body scrolls. */
.pivot-table__total-row th,
.pivot-table__total-row td {
  position: sticky;
  bottom: 0;
  z-index: 2;
  border-top: 2px solid var(--kdl-border);
  border-bottom: none;
  background: var(--kdl-page-bg);
  font-weight: 700;
  color: var(--kdl-text-primary);
}

/* The footer's leading "Total" cell is both bottom- and left-pinned (it sits in
   the sticky first column), so it needs the combined stacking of both. */
.pivot-table__total-row .pivot-table__total-corner {
  left: 0;
  z-index: 3;
  border-right: 1px solid var(--kdl-border-subtle);
}

.pivot-table__total-corner {
  text-align: right;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--kdl-text-secondary);
}

.pivot-table__grand-total {
  border-left: 2px solid var(--kdl-border);
}

.pivot-table tfoot tr:hover th,
.pivot-table tfoot tr:hover td {
  background: var(--kdl-page-bg);
}

@media (max-width: 860px) {
  .pivot__dim {
    grid-template-columns: 1fr;
  }

  .pivot__dim-name {
    white-space: normal;
  }
}
</style>
