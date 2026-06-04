<template>
  <SectionCard
    title="Slice &amp; Dice (TM1)"
    description="Pivot any TM1 cube as a live exploration grid. A PAW-lite explorer; nothing here writes back to TM1."
  >
    <div class="pivot">
      <!-- ════════════════════════════════════════════════════════════════════
           1 ── TOOLBAR — cube picker + actions, one compact row.
           ═════════════════════════════════════════════════════════════════ -->
      <div class="pivot-toolbar">
        <div class="pivot-toolbar__cube">
          <KSelect
            v-model="cube"
            class="pivot-toolbar__cube-select"
            placeholder="Select a TM1 cube…"
            :options="cubeOptions"
            :disabled="cubesLoading || !!cubesError"
            aria-label="TM1 cube"
          />
        </div>

        <div class="pivot-toolbar__actions">
          <KToggle v-model="suppressEmpty" label="Suppress zeros" />

          <button
            type="button"
            class="pivot-toolbar__btn"
            :disabled="!canSwap || running"
            title="Swap rows and columns"
            aria-label="Swap rows and columns"
            @click="swapAxes"
          >
            <svg
              class="pivot-toolbar__btn-icon"
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <polyline points="16 3 20 7 16 11" />
              <line x1="20" y1="7" x2="4" y2="7" />
              <polyline points="8 21 4 17 8 13" />
              <line x1="4" y1="17" x2="20" y2="17" />
            </svg>
            <span>Swap</span>
          </button>

          <button
            type="button"
            class="pivot-toolbar__btn"
            :disabled="!canRun || running"
            @click="runQuery"
          >
            <svg
              class="pivot-toolbar__btn-icon"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            <span>Refresh</span>
          </button>

          <span v-if="running" class="pivot-toolbar__busy" role="status">
            <KSpinner size="xs" tone="accent" label="Querying TM1" />
            <span>Running…</span>
          </span>
        </div>
      </div>

      <!-- Cube-load / dimension-load status (thin, inline). -->
      <p v-if="cubesError" class="pivot-banner pivot-banner--error">{{ cubesError }}</p>
      <p v-else-if="cubesLoading" class="pivot-banner">
        <KSpinner size="xs" tone="muted" label="Loading cubes" />
        <span>Loading cubes…</span>
      </p>
      <p v-else-if="cube && dimsLoading" class="pivot-banner">
        <KSpinner size="xs" tone="accent" label="Loading dimensions" />
        <span>Loading dimensions for {{ cube }}…</span>
      </p>
      <p v-else-if="cube && dimsError" class="pivot-banner pivot-banner--error">{{ dimsError }}</p>

      <!-- ════════════════════════════════════════════════════════════════════
           2 ── CONTEXT BAR — filter dimensions as dropdown pills.
                Each reads "Dimension: Member"; clicking opens its member picker.
           ═════════════════════════════════════════════════════════════════ -->
      <div
        v-if="cube && !dimsLoading && !dimsError && filterDims.length"
        class="pivot-context pivot-dropzone"
        :class="{ 'pivot-dropzone--active': dropZone === 'filter' && draggingDim }"
        role="group"
        aria-label="Filter context — drop a dimension here to filter by it"
        @dragover.prevent="onZoneDragOver('filter')"
        @dragenter.prevent="onZoneDragOver('filter')"
        @dragleave="(e) => onZoneDragLeave(e, 'filter')"
        @drop.prevent="onZoneDrop('filter')"
      >
        <span class="pivot-context__label">Context</span>
        <div class="pivot-context__pills">
          <!-- Each filter dimension is a draggable token. The token holds two
               affordances: the member-picker (KPopover, the existing tap-to-
               change-member) and a move menu (KMenu, the keyboard/non-drag
               path to Rows / Columns). The group wrapper is the drag handle. -->
          <div
            v-for="dim in filterDims"
            :key="`ctx-${dim}`"
            class="pivot-pill-group pivot-token"
            :class="{ 'pivot-token--dragging': draggingDim === dim }"
            draggable="true"
            :title="`${dim} — drag to Rows or Columns, or use the move menu`"
            @dragstart="(e) => onDimDragStart(e, dim)"
            @dragend="onDimDragEnd"
          >
            <KPopover
              :model-value="openPicker === `filter:${dim}`"
              @update:model-value="(o) => togglePicker(`filter:${dim}`, o, dim)"
            >
              <template #trigger>
                <button
                  type="button"
                  class="pivot-pill"
                  :aria-label="`${dim}: ${filterSelections[dim] || 'none'} — change member`"
                >
                  <span class="pivot-pill__dim">{{ dim }}</span>
                  <span class="pivot-pill__sep" aria-hidden="true">:</span>
                  <span class="pivot-pill__member">{{ filterSelections[dim] || '—' }}</span>
                  <svg
                    class="pivot-pill__chevron"
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
              </template>

              <div class="pivot-picker">
                <p class="pivot-picker__title">{{ dim }}</p>
                <KSelect
                  v-if="elementCache[dim] && !elementCache[dim].error"
                  :model-value="filterSelections[dim]"
                  class="pivot-picker__control"
                  :options="elementOptions(dim)"
                  :placeholder="memberPlaceholder(dim)"
                  :aria-label="`Filter member for ${dim}`"
                  @update:model-value="(v) => setFilterMember(dim, v)"
                />
                <button
                  v-else
                  type="button"
                  class="pivot-picker__load"
                  :disabled="isElementsLoading(dim)"
                  @click="ensureElements(dim)"
                >
                  <KSpinner v-if="isElementsLoading(dim)" size="xs" tone="muted" />
                  <span>{{ loadBtnLabel(dim) }}</span>
                </button>
                <p v-if="elementError(dim)" class="pivot-picker__error">{{ elementError(dim) }}</p>
              </div>
            </KPopover>

            <!-- Move menu — keyboard-operable equivalent of dragging this pill
                 onto an axis well. Current role is filter, so only the two axis
                 targets are offered. -->
            <KMenu
              align="end"
              :model-value="openCtxMenu === dim"
              @update:model-value="(o) => toggleCtxMenu(dim, o)"
            >
              <template #trigger>
                <button
                  type="button"
                  class="pivot-pill__move"
                  :aria-label="`Move ${dim} to Rows or Columns`"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="5" r="1" />
                    <circle cx="12" cy="12" r="1" />
                    <circle cx="12" cy="19" r="1" />
                  </svg>
                </button>
              </template>

              <KMenuItem @select="moveCtxDimension(dim, 'rows')">Move to Rows</KMenuItem>
              <KMenuItem @select="moveCtxDimension(dim, 'cols')">Move to Columns</KMenuItem>
            </KMenu>
          </div>
        </div>
      </div>

      <!-- ════════════════════════════════════════════════════════════════════
           3 ── AXIS WELLS — Rows / Columns zones, each showing its dimension
                chips. A chip menu moves the dimension between axes / filter.
           ═════════════════════════════════════════════════════════════════ -->
      <div
        v-if="cube && !dimsLoading && !dimsError && dimensions.length"
        class="pivot-wells"
      >
        <div
          class="pivot-well pivot-dropzone"
          :class="{ 'pivot-dropzone--active': dropZone === 'rows' && draggingDim }"
          role="group"
          aria-label="Rows axis — drop a dimension here to put it on rows"
          @dragover.prevent="onZoneDragOver('rows')"
          @dragenter.prevent="onZoneDragOver('rows')"
          @dragleave="(e) => onZoneDragLeave(e, 'rows')"
          @drop.prevent="onZoneDrop('rows')"
        >
          <span class="pivot-well__label">Rows</span>
          <div class="pivot-well__chips">
            <PivotAxisChip
              v-for="dim in rowDims"
              :key="`row-${dim}`"
              :dim="dim"
              axis="rows"
              :open="openChipMenu === `rows:${dim}`"
              :dragging="draggingDim === dim"
              @toggle="(o) => toggleChipMenu(`rows:${dim}`, o)"
              @move="(target) => moveDimension(dim, target)"
              @dragstart="(e) => onDimDragStart(e, dim)"
              @dragend="onDimDragEnd"
            />
            <span v-if="!rowDims.length" class="pivot-well__empty">none</span>
          </div>
        </div>

        <div
          class="pivot-well pivot-dropzone"
          :class="{ 'pivot-dropzone--active': dropZone === 'cols' && draggingDim }"
          role="group"
          aria-label="Columns axis — drop a dimension here to put it on columns"
          @dragover.prevent="onZoneDragOver('cols')"
          @dragenter.prevent="onZoneDragOver('cols')"
          @dragleave="(e) => onZoneDragLeave(e, 'cols')"
          @drop.prevent="onZoneDrop('cols')"
        >
          <span class="pivot-well__label">Columns</span>
          <div class="pivot-well__chips">
            <PivotAxisChip
              v-for="dim in colDims"
              :key="`col-${dim}`"
              :dim="dim"
              axis="cols"
              :open="openChipMenu === `cols:${dim}`"
              :dragging="draggingDim === dim"
              @toggle="(o) => toggleChipMenu(`cols:${dim}`, o)"
              @move="(target) => moveDimension(dim, target)"
              @dragstart="(e) => onDimDragStart(e, dim)"
              @dragend="onDimDragEnd"
            />
            <span v-if="!colDims.length" class="pivot-well__empty">none</span>
          </div>
        </div>
      </div>

      <!-- ════════════════════════════════════════════════════════════════════
           4 ── THE PIVOT GRID — the hero. Frozen row-header column + frozen
                column-header band; drillable indented row hierarchy; totals.
           ═════════════════════════════════════════════════════════════════ -->
      <p v-if="cube && runError" class="pivot-banner pivot-banner--error">{{ runError }}</p>

      <EmptyState
        v-else-if="!cube && !cubesLoading && !cubesError"
        icon="▦"
        title="Choose a cube to begin"
        body="Pick a TM1 cube above. Its dimensions load automatically and the grid opens populated."
      />

      <EmptyState
        v-else-if="cube && !dimsLoading && !dimsError && !dimensions.length"
        icon="∅"
        title="No dimensions"
        :body="`The cube ${cube} returned no dimensions.`"
      />

      <p v-else-if="cube && !canRun && !running && !result" class="pivot-banner">
        Put at least one dimension on Rows and one on Columns to run a query.
      </p>

      <template v-else-if="result">
        <EmptyState
          v-if="!gridRows.length"
          icon="∅"
          title="No data"
          body="The query returned no rows. Try a different member, or turn off Suppress zeros."
        />
        <div
          v-else
          class="pivot-grid-wrap"
          :class="{ 'pivot-grid-wrap--busy': running }"
        >
          <table
            class="pivot-grid"
            :aria-label="`${cube} pivot — ${gridRows.length} rows by ${colHeaders.length} columns`"
          >
            <caption v-if="rowDims.length > 1" class="pivot-grid__caption">
              Drill is available with a single Rows dimension.
            </caption>
            <thead>
              <tr>
                <th class="pivot-grid__corner" scope="col">{{ rowAxisLabel }}</th>
                <th
                  v-for="(col, ci) in colHeaders"
                  :key="`col-${ci}`"
                  class="pivot-grid__col-head pivot-num"
                  scope="col"
                >
                  {{ col }}
                </th>
                <th class="pivot-grid__col-head pivot-grid__total-head pivot-num" scope="col">
                  Total
                </th>
              </tr>
            </thead>

            <tbody>
              <tr
                v-for="row in gridRows"
                :key="row.key"
                class="pivot-grid__row"
                :class="{ 'pivot-grid__row--consol': row.drillable }"
                :aria-level="row.level + 1"
              >
                <th
                  class="pivot-grid__row-head"
                  :class="{ 'pivot-grid__row-head--consol': row.drillable }"
                  scope="row"
                >
                  <span
                    class="pivot-grid__row-head-inner"
                    :style="{ '--row-indent': `${row.level * INDENT_PX}px` }"
                  >
                    <button
                      v-if="row.drillable"
                      type="button"
                      class="pivot-grid__twisty"
                      :class="{ 'pivot-grid__twisty--busy': drilling === row.drillKey }"
                      :disabled="drilling === row.drillKey"
                      :aria-expanded="row.expanded"
                      :aria-label="`${row.expanded ? 'Collapse' : 'Expand'} ${row.label}`"
                      @click="toggleRow(row)"
                    >
                      <KSpinner v-if="drilling === row.drillKey" size="xs" tone="muted" />
                      <svg
                        v-else
                        class="pivot-grid__twisty-icon"
                        :class="{ 'pivot-grid__twisty-icon--open': row.expanded }"
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
                    <span v-else class="pivot-grid__twisty-spacer" aria-hidden="true" />
                    <span class="pivot-grid__row-label" :title="row.label">{{ row.label }}</span>
                  </span>
                </th>

                <td
                  v-for="(cell, ci) in row.cells"
                  :key="`c-${row.key}-${ci}`"
                  class="pivot-grid__cell pivot-num"
                  :class="cellClass(cell)"
                >
                  {{ formatCell(cell) }}
                </td>

                <td
                  class="pivot-grid__cell pivot-grid__total-cell pivot-num"
                  :class="totalClass(row.rowTotal)"
                >
                  {{ formatTotal(row.rowTotal) }}
                </td>
              </tr>
            </tbody>

            <tfoot>
              <tr class="pivot-grid__total-row">
                <th class="pivot-grid__row-head pivot-grid__total-corner" scope="row">Total</th>
                <td
                  v-for="(total, ci) in colTotals"
                  :key="`ctot-${ci}`"
                  class="pivot-grid__cell pivot-grid__total-cell pivot-num"
                  :class="totalClass(total)"
                >
                  {{ formatTotal(total) }}
                </td>
                <td
                  class="pivot-grid__cell pivot-grid__grand-total pivot-num"
                  :class="totalClass(grandTotal)"
                >
                  {{ formatTotal(grandTotal) }}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </template>

      <!-- ════════════════════════════════════════════════════════════════════
           Footer — grid size + Show MDX disclosure (kept).
           ═════════════════════════════════════════════════════════════════ -->
      <div v-if="cube && result && gridRows.length" class="pivot-footer">
        <span v-if="gridSizeLabel" class="pivot-footer__size">{{ gridSizeLabel }}</span>

        <button
          v-if="hasExpansions"
          type="button"
          class="pivot-footer__reset"
          @click="resetToDefault"
        >
          Collapse all
        </button>

        <div class="pivot-footer__spacer" />

        <div v-if="mdxText" class="pivot-mdx">
          <button
            type="button"
            class="pivot-mdx__toggle"
            :aria-expanded="showMdx"
            aria-controls="pivot-mdx-body"
            @click="showMdx = !showMdx"
          >
            <svg
              class="pivot-mdx__chevron"
              :class="{ 'pivot-mdx__chevron--open': showMdx }"
              width="11"
              height="11"
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
        </div>
      </div>

      <pre
        v-if="mdxText"
        v-show="showMdx"
        id="pivot-mdx-body"
        class="pivot-mdx__code"
      >{{ mdxText }}</pre>
    </div>
  </SectionCard>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import SectionCard from '../klikk/SectionCard.vue';
import KSelect from '../klikk/KSelect.vue';
import KToggle from '../klikk/KToggle.vue';
import KSpinner from '../klikk/KSpinner.vue';
import KPopover from '../klikk/KPopover.vue';
import KMenu from '../klikk/KMenu.vue';
import KMenuItem from '../klikk/KMenuItem.vue';
import EmptyState from '../klikk/EmptyState.vue';
import PivotAxisChip from './PivotAxisChip.vue';
import {
  getTm1Cubes,
  getTm1CubeDimensions,
  getTm1DimensionElements,
  getTm1DimensionChildren,
  runTm1Query,
} from '../../api/planningAnalytics';

const DEFAULT_CUBE = 'gl_src_trial_balance';
const MAX_MEMBER_OPTIONS = 500; // cap the picker for very large dimensions.
const INDENT_PX = 16; // per-level row-header indent (PAW exploration hallmark).

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
// of the top consolidation). "Collapse all" restores Rows to these.
const defaultMembers = reactive({});

// ── Row-axis EXPANSION TREE (PAW drill-in-place) ────────────────────────────
// The backend returns a FLAT member list on the row axis. To render a real
// PAW-style indented hierarchy with expand/collapse IN PLACE, we maintain a
// client-side tree keyed by ANCESTRY PATH (not bare member name), because the
// account hierarchy has OVERLAPPING ROLLUPS — the same member can appear under
// two different consolidations. A bare-name key would collapse those into one
// node (2nd parent renders missing the child; collapsing the 1st parent strips
// the shared child from under the 2nd). The path key disambiguates them:
//   path = parentPath ? `${parentPath}::${member}` : member
//   rowNodes[path] = { member, path, level, parentPath, expanded, children:[childPath,…] }
// `rowOrder` is the flattened, ordered list of visible PATHS that drives both
// the query's row member list (mapped path→member) AND the rendered rows.
// Expanding a node fetches its children (once), inserts their paths after the
// parent at level+1, and flips expanded=true. Collapsing removes the whole
// descendant subtree (by path prefix) from the query without a re-fetch
// (children stay cached on the node for re-expand).
const rowNodes = reactive({}); // path -> node
const rowOrder = ref([]); // ordered visible PATHS (the row axis)

// Build a node's ancestry path from its parent's path + its bare member name.
function makePath(parentPath, member) {
  return parentPath ? `${parentPath}::${member}` : member;
}

const suppressEmpty = ref(true);
// Collapsible "show MDX" — a TM1 person wants to see the literal query.
const showMdx = ref(false);

// Which context-pill popover / axis-chip menu is open (single-open model).
const openPicker = ref('');
const openChipMenu = ref('');
// Which context-pill MOVE menu is open (separate from the member-picker popover,
// single-open model). Keyed by dim so only one move menu shows at a time.
const openCtxMenu = ref('');

// ── Drag-and-drop dimension pivoting (PAW hallmark) ──────────────────────────
// HTML5 drag-drop lets the user drag any dimension TOKEN (a Context filter pill
// or a Rows/Columns axis chip) into any of the three ZONES (Context bar, Rows
// well, Columns well). A drop calls moveDimension(dim, target) — the SAME
// reassign path the chip menu / context-pill menu / swap button all funnel
// through (re-seed members + re-query, populated-default preserved). Drag is
// mouse-only; the move menus are the keyboard-operable equivalent.
const draggingDim = ref(''); // dim currently being dragged ('' = none)
const dropZone = ref(''); // 'filter' | 'rows' | 'cols' — zone under the cursor

function onDimDragStart(event, dim) {
  // Belt-and-braces: clear any prior drag state first, in case a previous
  // drag's `dragend` never fired (some browsers drop the event when the drag
  // ends over a non-document target), which would leave dropzones armed.
  draggingDim.value = '';
  dropZone.value = '';
  draggingDim.value = dim;
  // Close any open menu/popover so it doesn't float over the drag.
  openPicker.value = '';
  openChipMenu.value = '';
  openCtxMenu.value = '';
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    // A payload is required for Firefox to start a drag; the dim is the source
    // of truth in draggingDim, but we set text/plain too as a courtesy.
    event.dataTransfer.setData('text/plain', dim);
  }
}

function onDimDragEnd() {
  draggingDim.value = '';
  dropZone.value = '';
}

// Window-level safety net: if a drag ends over a non-document target (a known
// flaky case on some browsers), the per-token `dragend` may never fire, leaving
// `draggingDim`/`dropZone` set and every dropzone armed. A window `dragend`/
// `drop` listener guarantees the drag state is cleared regardless. Registered
// onMounted, removed onBeforeUnmount (no leak). The per-token dragend clear is
// kept too; both paths clear the same state, so this is idempotent.
function clearDragState() {
  draggingDim.value = '';
  dropZone.value = '';
}
onMounted(() => {
  window.addEventListener('dragend', clearDragState);
  window.addEventListener('drop', clearDragState);
});
onBeforeUnmount(() => {
  window.removeEventListener('dragend', clearDragState);
  window.removeEventListener('drop', clearDragState);
});

// dragenter/over on a zone — mark it the active drop target (drives the
// highlight class). preventDefault on dragover is what permits a drop.
function onZoneDragOver(target) {
  if (!draggingDim.value) return;
  dropZone.value = target;
}

// dragleave — only clear if we're actually leaving the zone (dragleave fires
// when crossing onto child elements too; guard with relatedTarget containment).
function onZoneDragLeave(event, target) {
  if (dropZone.value !== target) return;
  const related = event.relatedTarget;
  if (related && event.currentTarget.contains(related)) return;
  dropZone.value = '';
}

// drop — reassign the dragged dim to this zone through the shared path.
// The same-zone no-op (dropped back where it started) is owned by
// moveDimension itself, so we funnel through it unconditionally — that keeps
// the menu-cleanup + reassign logic in one place and avoids duplicating the
// guard here.
function onZoneDrop(target) {
  const dim = draggingDim.value;
  draggingDim.value = '';
  dropZone.value = '';
  if (!dim) return;
  moveDimension(dim, target);
}

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
// Swap is meaningful only with exactly one dim on each axis (v1 single-dim axes).
const canSwap = computed(() => rowDims.value.length === 1 && colDims.value.length === 1);

// The single dimension whose members head the rows — drives the drill tree.
// Drill is a single-row-dimension affordance.
const primaryRowDim = computed(() =>
  rowDims.value.length === 1 ? rowDims.value[0] : null,
);

// The corner-cell label (row-axis dimension name(s)).
const rowAxisLabel = computed(() => rowDims.value.join(' / ') || 'Rows');

// The literal MDX the backend executed for the current result, if returned.
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

const colHeaders = computed(() => pivot.value.colHeaders);

// Cell lookup, duplicate-safe. The query is sent per member tuple in rowOrder
// order, and the backend returns one row per requested tuple. A member can
// legitimately appear MORE THAN ONCE in rowOrder (the same leaf under two
// expanded consolidations — overlapping rollups), so a plain name→row map would
// collide and hand the wrong cells to the 2nd occurrence. Instead we key by the
// full member TUPLE and bucket every matching backend row into a QUEUE; each
// rendered node dequeues the next row for its tuple (first occurrence gets the
// first returned row, second gets the second, …). `suppress` dropping an empty
// row simply leaves that tuple's queue short → the node renders blank cells,
// which is correct. Lookup is reset each render pass (see takeBackendRow).
const TUPLE_SEP = '\u0000'; // NUL — cannot occur inside a TM1 member name.

function tupleKey(members) {
  return (members || []).join(TUPLE_SEP);
}

const rowQueuesByTuple = computed(() => {
  const map = new Map();
  for (const r of pivot.value.rows) {
    const key = tupleKey(r.members);
    const q = map.get(key);
    if (q) q.push(r);
    else map.set(key, [r]);
  }
  return map;
});

// THE RENDERED GRID ROWS. When we have a single row dimension we render the
// expansion tree (indented, drillable). For multi-dim rows we render the flat
// backend tuples (no drill — drill is single-dim). Each row carries: key,
// label, level, drillable, expanded, drillKey, path, cells, rowTotal.
const gridRows = computed(() => {
  const dim = primaryRowDim.value;

  // Multi-dim (or no-tree) fallback: render the backend rows flat.
  if (!dim || !rowOrder.value.length) {
    return pivot.value.rows.map((r, i) => {
      const { sum, has } = sumCells(r.cells);
      return {
        key: `flat-${i}`,
        label: r.members.join(' / ') || `Row ${i + 1}`,
        level: 0,
        drillable: false,
        expanded: false,
        drillKey: null,
        path: null,
        cells: r.cells,
        rowTotal: has ? sum : null,
      };
    });
  }

  // Single-dim: walk the ordered expansion tree by PATH, resolving each node's
  // cells from the tuple-queue so duplicate members (same leaf under two
  // expanded rollups) each pull their OWN backend row. Cursors track how many
  // of each tuple we've consumed within this render pass.
  const queues = rowQueuesByTuple.value;
  const cursors = new Map();
  const takeBackendRow = (members) => {
    const key = tupleKey(members);
    const q = queues.get(key);
    if (!q || !q.length) return null;
    const at = cursors.get(key) || 0;
    cursors.set(key, at + 1);
    return q[at] || null; // out of rows for this tuple → blank (e.g. suppressed)
  };

  return rowOrder.value.map((path) => {
    const node = rowNodes[path] || {
      member: path,
      path,
      level: 0,
      expanded: false,
    };
    const member = node.member ?? path;
    // Single row dimension → the cell tuple is just this node's member.
    const backendRow = takeBackendRow([member]);
    const cells = backendRow ? backendRow.cells : [];
    const { sum, has } = sumCells(cells);
    const drillable = isConsolidation(memberType(dim, member));
    return {
      key: path,
      label: member,
      level: node.level || 0,
      drillable,
      expanded: !!node.expanded,
      drillKey: drillable ? path : null,
      path,
      cells,
      rowTotal: has ? sum : null,
    };
  });
});

function sumCells(cells) {
  let sum = 0;
  let has = false;
  for (const cell of cells || []) {
    const n = cellNumber(cell);
    if (n != null) {
      sum += n;
      has = true;
    }
  }
  return { sum, has };
}

// Rows that contribute to a column / grand total: ONE level only. TM1 returns a
// consolidation's rolled-up value on the consolidation's own row, so summing an
// EXPANDED parent AND its children double-counts (EXPENSE 100 + Rent 60 +
// Salaries 40 = 200). An expanded parent is represented by its children in the
// grid, so we EXCLUDE it; a collapsed consolidation correctly contributes its
// own rolled value; leaves always contribute. Net: sum rows that are NOT
// currently expanded.
//   After expanding EXPENSE: column total = Rent + Salaries + (every OTHER top
//   row) — and crucially NOT EXPENSE itself. The per-row rowTotal is unaffected.
const totalRows = computed(() => gridRows.value.filter((r) => !r.expanded));

// Column totals (one per column header) + grand total, over the one-level set.
const colTotals = computed(() => {
  const count = colHeaders.value.length;
  const totals = Array.from({ length: count }, () => ({ sum: 0, has: false }));
  for (const row of totalRows.value) {
    for (let ci = 0; ci < count; ci += 1) {
      const n = cellNumber(row.cells[ci]);
      if (n != null) {
        totals[ci].sum += n;
        totals[ci].has = true;
      }
    }
  }
  return totals.map((t) => (t.has ? t.sum : null));
});

const grandTotal = computed(() => {
  let sum = 0;
  let has = false;
  for (const row of totalRows.value) {
    for (const cell of row.cells) {
      const n = cellNumber(cell);
      if (n != null) {
        sum += n;
        has = true;
      }
    }
  }
  return has ? sum : null;
});

// True when at least one row is expanded — gates the "Collapse all" control.
const hasExpansions = computed(() =>
  Object.values(rowNodes).some((n) => n.expanded),
);

// "6 rows × 12 cols" badge.
const gridSizeLabel = computed(() => {
  if (!result.value) return '';
  const r = gridRows.value.length;
  const c = colHeaders.value.length;
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
  return 'Select member…';
}

function loadBtnLabel(dim) {
  if (isElementsLoading(dim)) return 'Loading members…';
  if (elementError(dim)) return 'Retry — load members';
  return 'Load members';
}

// Lazy-load a dimension's elements the first time its picker is opened. Large
// dimensions are capped to MAX_MEMBER_OPTIONS for the picker; the dropdowns are
// internally scrollable.
async function ensureElements(dim) {
  if (elementCache[dim] && !elementCache[dim].error) return;
  elementCache[dim] = { loading: true, error: '', options: [] };
  try {
    const data = await getTm1DimensionElements(dim);
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug(`[PivotExplorer] elements(${dim}) raw:`, data);
    }
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
// else the first element.
function topElement(options) {
  if (!options.length) return null;
  const byPrefix = options.find((o) => /^(all[_ ]|total)/i.test(o.value));
  return (byPrefix || options[0]).value;
}

// Learn member -> type for a dimension from any element/children option list.
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
// meaningful measure is the balance — "amount" — so we prefer it when present.
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
// then fetch its CHILDREN and use those as the default members — so the cube
// opens as a real matrix (account-rollups × months) rather than a 1×1 grand
// total. Falls back to [top] when the top element is a leaf.
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
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug(`[PivotExplorer] children(${dim}, ${top}) raw:`, data);
    }
    const children = normaliseChildren(data);
    recordTypes(dim, children);
    if (children.length) {
      const members = children.map((c) => c.value);
      memberSelections[dim] = members;
      defaultMembers[dim] = members.slice();
      mergePickerOptions(dim, children);
      // Seed the row expansion tree for the primary row dim so the rendered
      // hierarchy starts at these top-level rollups (level 0, collapsed).
      if (assignments[dim] === 'rows' && rowDims.value.length === 1) {
        initRowTree(dim, members);
      }
      return;
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug(`[PivotExplorer] children(${dim}, ${top}) failed:`, error);
    }
  }
  // Fallback: top element is a leaf (or children unavailable) → single-top.
  memberSelections[dim] = [top];
  defaultMembers[dim] = [top];
  if (assignments[dim] === 'rows' && rowDims.value.length === 1) {
    initRowTree(dim, [top]);
  }
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

// ── Row expansion tree (path-keyed) ─────────────────────────────────────────
// (Re)seed the tree with a set of top-level members (level 0, collapsed). At
// the top level path === member (no ancestry), so duplicate top-level members
// would still collide — but the seed comes from a single consolidation's
// children, which TM1 guarantees unique, so top-level paths are unique.
function initRowTree(dim, members) {
  for (const k of Object.keys(rowNodes)) delete rowNodes[k];
  const paths = [];
  for (const m of members) {
    const path = makePath(null, m);
    rowNodes[path] = {
      member: m,
      path,
      level: 0,
      parentPath: null,
      expanded: false,
      children: [],
    };
    paths.push(path);
  }
  rowOrder.value = paths;
  syncRowMembersToSelection(dim);
}

// Mirror the visible row tree into memberSelections[dim] so the query asks for
// exactly the members currently shown. rowOrder holds PATHS; the backend wants
// bare member NAMES, in the same order (duplicates preserved — two occurrences
// of a member under different parents send the member twice, and the backend
// returns two rows we then de-queue positionally in gridRows).
function syncRowMembersToSelection(dim) {
  memberSelections[dim] = rowOrder.value.map((p) => rowNodes[p]?.member ?? p);
}

// Expand a consolidation row in place: fetch (once) + insert children after the
// parent at level+1, then re-query. Children stay cached on the node. Keyed by
// PATH so the same member under two different parents expands independently.
// Re-entry guarded: if already expanded (or its children are already inserted),
// no-op — a fast double-click cannot duplicate children.
async function expandRow(dim, path) {
  const node = rowNodes[path];
  if (!node || node.expanded) return; // already open → no-op (re-entry guard).
  if (node.children && node.children.length) {
    // Already fetched — re-show the cached subtree (collapse had removed it).
    // Set the spinner on this branch too, then re-query.
    drilling.value = path;
    try {
      reinsertChildren(node);
      node.expanded = true;
      syncRowMembersToSelection(dim);
      await runQuery();
    } finally {
      drilling.value = '';
    }
    return;
  }
  drilling.value = path;
  try {
    const data = await getTm1DimensionChildren(dim, node.member);
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug(`[PivotExplorer] drill children(${dim}, ${node.member}) raw:`, data);
    }
    const children = normaliseChildren(data);
    recordTypes(dim, children);
    if (!children.length) {
      node.expanded = false;
      return; // leaf — nothing to expand.
    }
    // Each child is a DISTINCT node under THIS path — so a member appearing
    // under two parents has two independent nodes (overlapping rollups).
    const childPaths = [];
    for (const child of children) {
      const childPath = makePath(node.path, child.value);
      if (!rowNodes[childPath]) {
        rowNodes[childPath] = {
          member: child.value,
          path: childPath,
          level: node.level + 1,
          parentPath: node.path,
          expanded: false,
          children: [],
        };
      }
      childPaths.push(childPath);
    }
    node.children = childPaths;
    node.expanded = true;
    insertAfter(node.path, childPaths);
    mergePickerOptions(dim, children);
    syncRowMembersToSelection(dim);
    await runQuery();
  } catch (error) {
    node.expanded = false;
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug(`[PivotExplorer] expand(${dim}, ${node.member}) failed:`, error);
    }
  } finally {
    drilling.value = '';
  }
}

// Collapse a row: remove ITS descendant subtree from the visible order (matched
// by path prefix, so only the descendants of THIS occurrence are removed — a
// shared member under another parent is untouched). Nodes remain registered +
// cached for fast re-expand. Then re-query.
function collapseRow(dim, path) {
  const node = rowNodes[path];
  if (!node) return;
  const toRemove = new Set();
  const stack = [...(node.children || [])];
  while (stack.length) {
    const childPath = stack.pop();
    toRemove.add(childPath);
    const child = rowNodes[childPath];
    if (child?.children?.length) stack.push(...child.children);
    if (child) child.expanded = false;
  }
  rowOrder.value = rowOrder.value.filter((p) => !toRemove.has(p));
  node.expanded = false;
  syncRowMembersToSelection(dim);
  runQuery();
}

// Re-insert a previously-collapsed node's direct children after it (their own
// sub-expansions stay collapsed — re-expanding is a fresh, shallow reveal).
// Guarded against double-insertion: skip any child path already in rowOrder.
function reinsertChildren(node) {
  if (!node?.children?.length) return;
  const present = new Set(rowOrder.value);
  const missing = node.children.filter((p) => !present.has(p));
  if (missing.length) insertAfter(node.path, missing);
}

// Insert `paths` into rowOrder immediately after `anchor` (a path). Idempotent:
// any path already present is skipped so re-entry cannot duplicate rows.
function insertAfter(anchor, paths) {
  const present = new Set(rowOrder.value);
  const toAdd = paths.filter((p) => !present.has(p));
  if (!toAdd.length) return;
  const idx = rowOrder.value.indexOf(anchor);
  const next = rowOrder.value.slice();
  const at = idx < 0 ? next.length : idx + 1;
  next.splice(at, 0, ...toAdd);
  rowOrder.value = next;
}

// ── Loaders ────────────────────────────────────────────────────────────────
async function loadCubes() {
  cubesLoading.value = true;
  cubesError.value = '';
  try {
    const data = await getTm1Cubes();
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug('[PivotExplorer] cubes raw:', data);
    }
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
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug(`[PivotExplorer] dimensions(${cubeName}) raw:`, data);
    }
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

// On cube load, resolve a populated default for every assigned dimension:
// Rows/Cols → children of the top consolidation (a real grid); Filter → its
// single top member. Then auto-run so the explorer opens populated.
async function seedAllDefaults() {
  await Promise.all([
    ...rowDims.value.map((d) => seedPopulatedDefault(d)),
    ...colDims.value.map((d) => seedPopulatedDefault(d)),
    ...filterDims.value.map((d) => ensureSeeded(d)),
  ]);
  if (canRun.value) runQuery();
}

// Sensible default layout: 'account'-ish on Rows, 'month'/'period' on Columns,
// everything else on Filter. Matching is fuzzy because dimension names vary.
function applyDefaultAssignments(dims) {
  for (const k of Object.keys(assignments)) delete assignments[k];
  for (const k of Object.keys(memberSelections)) delete memberSelections[k];
  for (const k of Object.keys(filterSelections)) delete filterSelections[k];
  for (const k of Object.keys(elementCache)) delete elementCache[k];
  for (const k of Object.keys(memberTypes)) delete memberTypes[k];
  for (const k of Object.keys(defaultMembers)) delete defaultMembers[k];
  for (const k of Object.keys(rowNodes)) delete rowNodes[k];
  rowOrder.value = [];

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

  // Make sure every axis/filter dimension still has a member — load + seed any
  // empties before querying (covers "never opened a picker" and role changes).
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
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug('[PivotExplorer] query raw:', data);
    }
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
// CURRENT role — used right before a query.
async function ensureSeeded(dim) {
  await ensureElements(dim);
  seedDefaultMember(dim, elementOptions(dim));
}

// ── Drill (expand / collapse a row in place) ────────────────────────────────
const drilling = ref(''); // member currently being fetched (shows a spinner).

function toggleRow(row) {
  const dim = primaryRowDim.value;
  if (!dim || !row.drillable || !row.path || drilling.value) return;
  if (row.expanded) collapseRow(dim, row.path);
  else expandRow(dim, row.path);
}

// Collapse every expansion back to the populated default rollups and re-run.
async function resetToDefault() {
  const dim = primaryRowDim.value;
  if (dim && defaultMembers[dim]?.length) {
    initRowTree(dim, defaultMembers[dim].slice());
  }
  // Restore any non-primary row/col dims to their defaults too.
  for (const d of [...rowDims.value, ...colDims.value]) {
    if (d === dim) continue;
    if (defaultMembers[d]?.length) memberSelections[d] = defaultMembers[d].slice();
  }
  if (canRun.value) runQuery();
}

// ── Context-pill / axis-chip interactions ───────────────────────────────────
function togglePicker(key, open, dim) {
  openPicker.value = open ? key : '';
  if (open && dim) ensureElements(dim);
}

function setFilterMember(dim, value) {
  filterSelections[dim] = value;
  openPicker.value = '';
  runQuery();
}

function toggleChipMenu(key, open) {
  openChipMenu.value = open ? key : '';
}

// Open/close a context-pill MOVE menu (the keyboard-operable equivalent of
// dragging a filter pill onto an axis well). Single-open across all pills.
function toggleCtxMenu(dim, open) {
  openCtxMenu.value = open ? dim : '';
}

// Move a filter dimension to an axis from its context-pill move menu. Closes
// the menu, then funnels through the same moveDimension reassign path.
function moveCtxDimension(dim, target) {
  openCtxMenu.value = '';
  moveDimension(dim, target);
}

// Shared reassign TAIL — the single funnel every dimension-reassign path
// (chip menu, context-pill menu, swap button, drag-drop) runs through after it
// has set the new assignment(s). It (1) resets the row drill tree, (2) re-seeds
// members for the CURRENT role of EVERY axis/filter dimension (so multi-dim
// axes are correct, not just the one(s) that moved), and (3) either re-queries
// (canRun) or, when an axis was emptied (!canRun), clears the previous result +
// drill state so the grid drops to its "needs config" empty state instead of
// leaving a stale grid that no longer matches the (now invalid) layout.
async function reseedAndRun() {
  // Reset the row tree (the primary row dimension may have changed).
  for (const k of Object.keys(rowNodes)) delete rowNodes[k];
  rowOrder.value = [];

  // Re-seed members appropriately for the (possibly new) axis roles.
  await Promise.all([
    ...rowDims.value.map((d) => seedPopulatedDefault(d)),
    ...colDims.value.map((d) => seedPopulatedDefault(d)),
    ...filterDims.value.map((d) => ensureSeeded(d)),
  ]);

  if (canRun.value) {
    runQuery();
  } else {
    // An axis emptied (only-Rows or only-Cols dim moved away). runQuery would
    // early-return and leave the PREVIOUS grid rendered while the well shows
    // "none" — a populated grid that no longer matches the config. Drop the
    // stale result + drill state so the "Put at least one dimension on Rows and
    // one on Columns" empty state shows instead.
    result.value = null;
    runError.value = '';
    for (const k of Object.keys(rowNodes)) delete rowNodes[k];
    rowOrder.value = [];
  }
}

// Move a dimension between Rows / Columns / Filter from a chip menu. Sets the
// new assignment, then funnels through the shared reseed/re-query tail.
async function moveDimension(dim, target) {
  if (assignments[dim] === target) {
    openChipMenu.value = '';
    return;
  }
  assignments[dim] = target;
  openChipMenu.value = '';
  await reseedAndRun();
}

// Swap the single row dim and single column dim (toolbar button). Sets both
// assignments, then funnels through the SAME shared tail (one re-query, not
// two). Behaviour is identical to moveDimension for the single-dim case.
async function swapAxes() {
  if (!canSwap.value) return;
  const r = rowDims.value[0];
  const c = colDims.value[0];
  assignments[r] = 'cols';
  assignments[c] = 'rows';
  await reseedAndRun();
}

// ── Number formatting (finance: thousands-separated, negatives in red) ───────
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

// Negative figures read red (finance cost-direction convention). A cell is
// negative if its raw numeric is < 0 (falls back to parsing the formatted
// string — leading "-" or wrapping "(…)" — when only a formatted string exists).
function cellClass(cell) {
  return { 'pivot-grid__cell--neg': isNegativeCell(cell) };
}

function totalClass(value) {
  const n = Number(value);
  return { 'pivot-grid__cell--neg': Number.isFinite(n) && n < 0 };
}

function isNegativeCell(cell) {
  if (!cell) return false;
  const n = Number(cell.value);
  if (Number.isFinite(n)) return n < 0;
  const f = cell.formatted;
  if (typeof f === 'string') return /^\s*[-(]/.test(f.trim());
  return false;
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
  gap: 12px;
}

/* ════════════════════════════════════════════════════════════════════════════
   1 ── TOOLBAR
   ═══════════════════════════════════════════════════════════════════════════ */
.pivot-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 8px;
  background: var(--kdl-page-bg);
}

.pivot-toolbar__cube {
  flex: 0 1 280px;
  min-width: 200px;
}

.pivot-toolbar__cube-select {
  width: 100%;
}

.pivot-toolbar__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-left: auto;
}

.pivot-toolbar__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--kdl-border);
  border-radius: 6px;
  background: var(--kdl-card-bg);
  color: var(--kdl-text-secondary);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: border-color var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1)),
              color var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1));
}

.pivot-toolbar__btn:hover:not(:disabled) {
  border-color: var(--kdl-text-muted);
  color: var(--kdl-text-primary);
}

.pivot-toolbar__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pivot-toolbar__btn-icon {
  flex: 0 0 auto;
  color: var(--kdl-text-hint);
}

.pivot-toolbar__busy {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--kdl-text-secondary);
}

/* ── Thin status banners ──────────────────────────────────────────────────── */
.pivot-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 8px 12px;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 6px;
  background: var(--kdl-page-bg);
  color: var(--kdl-text-secondary);
  font-size: 13px;
}

.pivot-banner--error {
  color: #dc2626; /* danger-600 — documented cost-direction / error red (KDL gap) */
  border-color: #dc2626;
}

:root[data-theme="dark"] .pivot-banner--error {
  color: #f87171;
  border-color: #f87171;
}

/* ════════════════════════════════════════════════════════════════════════════
   DRAG-AND-DROP — shared dimension-pivoting affordances
   Every dimension token (context pill, axis chip) is draggable; the three zones
   (Context bar, Rows well, Columns well) are drop targets. The active drop zone
   gets a tinted dashed outline; the source token dims while in flight. All
   colour comes from KDL tokens (accent / hover) via color-mix — no raw hex.
   ═══════════════════════════════════════════════════════════════════════════ */
/* A token (pill / chip) the user can pick up. Grab cue advertises it. */
.pivot-token {
  cursor: grab;
}

.pivot-token:active {
  cursor: grabbing;
}

/* The source token while it's being dragged — quietly recede. */
.pivot-token--dragging {
  opacity: 0.45;
}

/* A zone that accepts drops. On dragover it gains a tinted, dashed accent
   outline so the target is unmistakable. The transition is colour-only and
   respects reduced-motion (below). */
.pivot-dropzone {
  transition: border-color var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1)),
              background var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1));
}

.pivot-dropzone--active {
  border-style: dashed;
  border-color: var(--kdl-accent);
  background: color-mix(in srgb, var(--kdl-accent) 7%, transparent);
}

@media (prefers-reduced-motion: reduce) {
  .pivot-dropzone {
    transition: none;
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   2 ── CONTEXT BAR (filter pills)
   ═══════════════════════════════════════════════════════════════════════════ */
.pivot-context {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

/* The Context bar is also a drop zone — give it the framed look the wells have
   so its dashed-on-dragover state reads as "a zone", and pad it for the outline
   to sit off the pills. */
.pivot-context.pivot-dropzone {
  padding: 6px 10px;
  border: 1px dashed transparent;
  border-radius: 6px;
}

/* A filter token: the member-picker pill + its move button, as one draggable
   unit. They share a hairline so they read as a single control. */
.pivot-pill-group {
  display: inline-flex;
  align-items: stretch;
}

.pivot-context__label {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--kdl-text-hint);
}

.pivot-context__pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pivot-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 8px 0 10px;
  border: 1px solid var(--kdl-border);
  /* Left side of the grouped token — round only the leading edge so the pill
     and its move button read as one pill with a divider. */
  border-radius: 999px 0 0 999px;
  border-right-width: 0;
  background: var(--kdl-card-bg);
  color: var(--kdl-text-secondary);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1)),
              background var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1));
}

.pivot-pill:hover {
  border-color: var(--kdl-text-muted);
  background: var(--kdl-hover-bg);
}

/* The trailing move-menu button — the right half of the grouped token. */
.pivot-pill__move {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--kdl-border);
  border-radius: 0 999px 999px 0;
  background: var(--kdl-card-bg);
  color: var(--kdl-text-hint);
  cursor: pointer;
  transition: border-color var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1)),
              background var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1)),
              color var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1));
}

.pivot-pill__move:hover {
  border-color: var(--kdl-text-muted);
  background: var(--kdl-hover-bg);
  color: var(--kdl-text-secondary);
}

@media (prefers-reduced-motion: reduce) {
  .pivot-pill,
  .pivot-pill__move {
    transition: none;
  }
}

.pivot-pill__dim {
  color: var(--kdl-text-muted);
  font-weight: 500;
}

.pivot-pill__sep {
  color: var(--kdl-text-hint);
}

.pivot-pill__member {
  color: var(--kdl-text-primary);
  font-weight: 600;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pivot-pill__chevron {
  flex: 0 0 auto;
  margin-left: 1px;
  color: var(--kdl-text-hint);
}

/* Popover body (the member picker) — rendered inside teleported .kp-content. */
.pivot-picker {
  display: grid;
  gap: 8px;
  min-width: 220px;
}

.pivot-picker__title {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--kdl-text-hint);
}

.pivot-picker__control {
  width: 100%;
}

.pivot-picker__load {
  display: inline-flex;
  align-items: center;
  justify-self: start;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid var(--kdl-border);
  border-radius: 6px;
  background: var(--kdl-card-bg);
  color: var(--kdl-text-secondary);
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.pivot-picker__load:hover:not(:disabled) {
  border-color: var(--kdl-text-muted);
  color: var(--kdl-text-primary);
}

.pivot-picker__load:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.pivot-picker__error {
  margin: 0;
  font-size: 12px;
  color: #dc2626; /* danger-600 — documented error red (KDL gap) */
}

:root[data-theme="dark"] .pivot-picker__error {
  color: #f87171;
}

/* ════════════════════════════════════════════════════════════════════════════
   3 ── AXIS WELLS
   ═══════════════════════════════════════════════════════════════════════════ */
.pivot-wells {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.pivot-well {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1 1 240px;
  min-width: 0;
  padding: 6px 10px;
  border: 1px dashed var(--kdl-border);
  border-radius: 6px;
  background: var(--kdl-page-bg);
}

.pivot-well__label {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--kdl-text-hint);
}

.pivot-well__chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.pivot-well__empty {
  font-size: 12px;
  color: var(--kdl-text-hint);
  font-style: italic;
}

/* ════════════════════════════════════════════════════════════════════════════
   4 ── THE PIVOT GRID (hero)
   The grid is the dominant element: a tall self-scrolling viewport so the
   sticky column-header band + sticky first column engage against THIS container
   (not the page), and a wide month grid scrolls on both axes within a framed
   region. The chrome above is deliberately compact so the grid owns the space.
   ═══════════════════════════════════════════════════════════════════════════ */
.pivot-grid-wrap {
  max-height: 70vh;
  overflow: auto;
  border: 1px solid var(--kdl-border);
  border-radius: 8px;
  background: var(--kdl-card-bg);
  transition: opacity var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1));
}

/* While re-querying, dim the stale grid slightly (kept legible). */
.pivot-grid-wrap--busy {
  opacity: 0.6;
}

@media (prefers-reduced-motion: reduce) {
  .pivot-grid-wrap {
    transition: none;
  }
}

.pivot-grid {
  /* Local layout tokens — widths constrain the grid so drilling (longer labels)
     and few-column slices don't reflow the whole table. Spacing scale only. */
  --pivot-rowhead-min: 220px;
  --pivot-rowhead-max: 360px;
  --pivot-num-min: 96px;
  /* Total band tints — derived from the brand-navy token via color-mix (the
     house pattern, see KTable / EmptyState). The band is a real navy FILL, not
     a near-white grey, so it reads as a band distinct from the zebra. */
  --pivot-total-tint: color-mix(in srgb, var(--kdl-brand-navy) 8%, transparent);
  --pivot-total-fill: var(--kdl-brand-navy);

  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
}

/* Multi-dim explanation — sits with the now-flat (no-drill) grid. */
.pivot-grid__caption {
  caption-side: top;
  padding: 0 0 8px;
  text-align: left;
  font-size: 12px;
  font-weight: 500;
  color: var(--kdl-text-secondary);
}

.pivot-grid th,
.pivot-grid td {
  height: 32px;
  padding: 0 14px;
  border-bottom: 1px solid var(--kdl-border-subtle);
  text-align: left;
  white-space: nowrap;
}

/* Numeric columns get a sensible min-width so a few-column slice doesn't let a
   single column stretch across the viewport. */
.pivot-grid__col-head,
.pivot-grid__cell {
  min-width: var(--pivot-num-min);
}

/* ── Column-header band (frozen on vertical scroll) ───────────────────────── */
.pivot-grid thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  height: 34px;
  background: var(--kdl-page-bg);
  /* 11px uppercase header → small text, so it must clear AA 4.5:1. The muted
     token (#6B7280 on #F5F5F8 ≈ 4.3:1) fell short; secondary (#4B5563 ≈ 7:1)
     clears it. */
  color: var(--kdl-text-secondary);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  border-bottom: 1px solid var(--kdl-border);
}

.pivot-grid__col-head {
  text-align: right;
}

/* Corner cell — row/col intersection: highest stack, frozen on both axes. */
.pivot-grid__corner {
  position: sticky;
  left: 0;
  top: 0;
  z-index: 3;
  min-width: var(--pivot-rowhead-min);
  max-width: var(--pivot-rowhead-max);
  color: var(--kdl-text-secondary);
  background: var(--kdl-page-bg);
  border-right: 1px solid var(--kdl-border);
}

/* ── Row-header column (frozen on horizontal scroll) ──────────────────────── */
.pivot-grid__row-head {
  position: sticky;
  left: 0;
  z-index: 1;
  /* Constrain the row-header column so drilling (deeper, longer labels) and
     "Collapse all" don't reflow the data columns. Overflow ellipsises (title
     carries the full label). */
  min-width: var(--pivot-rowhead-min);
  max-width: var(--pivot-rowhead-max);
  padding: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--kdl-text-primary);
  background: var(--kdl-card-bg);
  border-right: 1px solid var(--kdl-border);
}

.pivot-grid__row-head--consol {
  font-weight: 600;
}

.pivot-grid__row-head-inner {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 100%;
  /* The per-level indent is a data-driven runtime value, but routed through a
     custom property (--row-indent, set inline) rather than an inline padding —
     the house no-inline-style-for-design-values pattern. */
  padding: 0 14px 0 calc(14px + var(--row-indent, 0px));
}

.pivot-grid__row-label {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Expand / collapse twisty ─────────────────────────────────────────────── */
.pivot-grid__twisty {
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
  transition: color var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1)),
              background var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1));
}

.pivot-grid__twisty:hover:not(:disabled) {
  color: var(--kdl-accent);
  background: var(--kdl-hover-bg);
}

.pivot-grid__twisty:disabled {
  cursor: progress;
}

.pivot-grid__twisty-icon {
  display: block;
  transition: transform var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1));
}

.pivot-grid__twisty-icon--open {
  transform: rotate(90deg);
}

.pivot-grid__twisty-spacer {
  display: inline-block;
  flex-shrink: 0;
  width: 18px;
  height: 18px;
}

@media (prefers-reduced-motion: reduce) {
  .pivot-grid__twisty,
  .pivot-grid__twisty-icon {
    transition: none;
  }
}

/* ── Cells ────────────────────────────────────────────────────────────────── */
.pivot-grid__cell {
  font-size: 13px;
  text-align: right;
  color: var(--kdl-text-primary);
}

.pivot-num {
  font-variant-numeric: tabular-nums;
}

/* Negative figures read red — finance cost-direction convention. #dc2626 is the
   documented danger-600 / cost-direction hex (KDL exposes no semantic
   --kdl-danger var yet — same gap noted in CostCutRow / MetricTile). */
.pivot-grid__cell--neg {
  color: #dc2626;
}

:root[data-theme="dark"] .pivot-grid__cell--neg {
  color: #f87171;
}

/* ── Three distinguishable surfaces: zebra · hover · total ────────────────────
   Resting data cells sit on the card; even rows get a QUIET neutral zebra; row
   hover steps to a PERCEPTIBLY darker neutral. The total band (below) is a navy
   tint — a different hue entirely — so the three never read as the same grey. */
.pivot-grid tbody tr:nth-child(even) .pivot-grid__cell,
.pivot-grid tbody tr:nth-child(even) .pivot-grid__row-head {
  background: var(--kdl-hover-bg); /* quiet neutral zebra */
}

.pivot-grid tbody tr:hover .pivot-grid__cell,
.pivot-grid tbody tr:hover .pivot-grid__row-head {
  background: var(--kdl-border-subtle); /* a step darker than zebra */
}

/* Consolidation rows carry a faint navy tint so rollups read as structure. */
.pivot-grid__row--consol .pivot-grid__row-head {
  color: var(--kdl-brand-navy);
}

:root[data-theme="dark"] .pivot-grid__row--consol .pivot-grid__row-head {
  color: var(--kdl-text-primary);
}

/* ── Totals — a genuine NAVY BAND, not grey-on-grey ───────────────────────────
   The row-total column (per-row) gets a navy TINT; the column-total footer +
   grand-total cell get a solid navy FILL with white text. Column-total and
   row-total share the navy hue so the band reads as one continuous frame around
   the data, unmistakably distinct from the neutral zebra/hover surfaces. */
.pivot-grid__total-head {
  border-left: 2px solid var(--kdl-brand-navy);
}

.pivot-grid tbody .pivot-grid__total-cell {
  border-left: 2px solid var(--kdl-brand-navy);
  font-weight: 600;
  background: var(--pivot-total-tint);
}

/* Hovering a data row must NOT lighten its total cell (the old inversion). The
   row-hover rule above would repaint the total cell neutral; re-assert a navy
   tint — a touch deeper — so hover steps the SAME direction, never lighter. */
.pivot-grid tbody tr:hover .pivot-grid__total-cell {
  background: color-mix(in srgb, var(--kdl-brand-navy) 14%, transparent);
}

/* Column-total footer row — pinned to the bottom of the scroll viewport, solid
   navy fill so it anchors the band. */
.pivot-grid__total-row th,
.pivot-grid__total-row td {
  position: sticky;
  bottom: 0;
  z-index: 2;
  border-top: 2px solid var(--kdl-brand-navy);
  border-bottom: none;
  background: var(--pivot-total-fill);
  font-weight: 700;
  color: #ffffff;
}

/* The footer's leading "Total" cell is bottom- AND left-pinned (sits in the
   frozen first column), so it needs the combined stacking of both. It keeps the
   solid navy fill, so its label reverses to white too. */
.pivot-grid__total-row .pivot-grid__total-corner {
  left: 0;
  z-index: 3;
  padding: 0 14px;
  text-align: left;
  font-size: 11px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #ffffff;
  background: var(--pivot-total-fill);
  border-right: 1px solid var(--kdl-brand-navy);
}

/* Grand total — the band's corner; solid navy, divider continues the frame. */
.pivot-grid__grand-total {
  border-left: 2px solid var(--kdl-brand-navy);
  background: var(--pivot-total-fill);
}

/* Negative figures inside the solid-navy footer/grand-total need a light red
   that reads on navy (the #dc2626 data-cell red is too dark on the fill). */
.pivot-grid__total-row .pivot-grid__cell--neg,
.pivot-grid__grand-total.pivot-grid__cell--neg {
  color: #fca5a5;
}

/* ════════════════════════════════════════════════════════════════════════════
   Footer — size badge, collapse-all, Show MDX
   ═══════════════════════════════════════════════════════════════════════════ */
.pivot-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.pivot-footer__size {
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

.pivot-footer__reset {
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

.pivot-footer__reset:hover {
  border-color: var(--kdl-text-muted);
  color: var(--kdl-text-primary);
}

@media (prefers-reduced-motion: reduce) {
  .pivot-footer__reset {
    transition: none;
  }
}

.pivot-footer__spacer {
  flex: 1 1 0;
}

/* ── Show-MDX disclosure ──────────────────────────────────────────────────── */
.pivot-mdx__toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 6px;
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

.pivot-mdx__toggle:hover {
  color: var(--kdl-text-primary);
}

.pivot-mdx__toggle:focus-visible {
  outline: 2px solid var(--kdl-accent);
  outline-offset: 1px;
}

.pivot-mdx__chevron {
  flex: 0 0 auto;
  color: var(--kdl-text-hint);
  transition: transform var(--duration-short, 150ms) var(--ease-standard, cubic-bezier(0.2, 0, 0, 1));
}

.pivot-mdx__chevron--open {
  transform: rotate(90deg);
}

@media (prefers-reduced-motion: reduce) {
  .pivot-mdx__chevron {
    transition: none;
  }
}

.pivot-mdx__code {
  margin: 0;
  padding: 10px 12px;
  max-height: 200px;
  overflow: auto;
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 6px;
  background: var(--kdl-page-bg);
  color: var(--kdl-text-secondary);
  font-family: var(--kdl-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

/* ── Responsive ───────────────────────────────────────────────────────────── */
@media (max-width: 860px) {
  .pivot-toolbar__actions {
    margin-left: 0;
  }

  .pivot-grid-wrap {
    max-height: 60vh;
  }
}
</style>
