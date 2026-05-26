<!--
  KTable — Klikk Design Language table primitive (finance-admin variant).

  Engine: TanStack Table v8 (@tanstack/vue-table) + optional virtual scroll
  (@tanstack/vue-virtual).

  Replaces: q-table
  Migration mapping: see docs/primitives/k-table.md

  USAGE (read-only, client paginated):
    <KTable :columns="cols" :data="rows" />

  USAGE (virtual scroll — large datasets):
    <KTable :columns="cols" :data="rows" virtual :virtualHeight="600" pagination="none" />

  USAGE (selectable):
    <KTable :columns="cols" :data="rows" selectable v-model:selectedRowIds="sel" />

  USAGE (server-side pagination):
    <KTable
      :columns="cols" :data="rows"
      pagination="server"
      :serverTotal="total"
      v-model:serverPage="page"
      v-model:sortBy="sort"
      @row-click="onRow"
    />

  API: frozen as of Phase 1.E — any change is a breaking change (open a ticket).
-->
<template>
  <div
    class="ktable-root"
    :class="{
      'ktable-root--dense': dense,
      'ktable-root--virtual': virtual,
    }"
  >
    <!-- ── Toolbar ──────────────────────────────────────────────────────── -->
    <div v-if="$slots.toolbar || freshness" class="ktable-toolbar">
      <slot name="toolbar" />
      <FreshnessChip v-if="freshness" :value="freshness" />
    </div>

    <!-- ── Column visibility menu ──────────────────────────────────────── -->
    <div v-if="showVisibilityMenu" class="ktable-vis-menu" ref="visMenuRef">
      <button class="ktable-vis-toggle btn-ghost btn-sm" @click="visMenuOpen = !visMenuOpen">
        <!-- columns icon -->
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="1.75"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="7" height="18" rx="1"/>
          <rect x="14" y="3" width="7" height="18" rx="1"/>
        </svg>
        Columns
      </button>
      <div v-if="visMenuOpen" class="ktable-vis-dropdown">
        <label
          v-for="header in table.getAllLeafColumns()"
          :key="header.id"
          class="ktable-vis-item"
        >
          <input
            type="checkbox"
            :checked="header.getIsVisible()"
            @change="header.toggleVisibility()"
          />
          <span>{{ header.columnDef.header || header.id }}</span>
        </label>
      </div>
    </div>

    <!-- ── Error state ─────────────────────────────────────────────────── -->
    <div v-if="error" class="ktable-state-wrapper">
      <slot name="error">
        <KAlert variant="error" :body="error" />
      </slot>
    </div>

    <!-- ── Loading state ────────────────────────────────────────────────── -->
    <div v-else-if="loading && !data.length" class="ktable-state-wrapper ktable-state-wrapper--loading">
      <slot name="loading">
        <KSpinner size="lg" tone="accent" />
      </slot>
    </div>

    <!-- ── Empty state ──────────────────────────────────────────────────── -->
    <div v-else-if="!loading && !error && !data.length" class="ktable-state-wrapper">
      <slot name="empty">
        <EmptyState title="No data" body="There are no rows to display.">
          <template #icon>
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="1.75"
              stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 3h18v4H3zM3 11h18v4H3zM3 19h18v4H3z"/>
            </svg>
          </template>
        </EmptyState>
      </slot>
    </div>

    <!-- ── Table ────────────────────────────────────────────────────────── -->
    <div
      v-else
      class="ktable-scroll-container"
      ref="scrollContainerRef"
      :style="virtual ? { height: `${virtualHeight}px`, overflowY: 'auto' } : {}"
    >
      <!-- Loading overlay (data already present) -->
      <div v-if="loading" class="ktable-loading-overlay" aria-hidden="true">
        <KSpinner size="md" tone="accent" />
      </div>

      <table class="ktable" :class="{ 'ktable--loading': loading }">
        <!-- ── <colgroup> — drives column widths for both thead and virtual tbody ── -->
        <colgroup>
          <col
            v-for="header in table.getHeaderGroups()[0]?.headers ?? []"
            :key="header.id"
            :style="colWidth(header.column)"
          />
        </colgroup>

        <!-- ── <thead> ──────────────────────────────────────────────── -->
        <thead class="ktable-thead">
          <tr
            v-for="headerGroup in table.getHeaderGroups()"
            :key="headerGroup.id"
            class="ktable-thead__row"
          >
            <th
              v-for="header in headerGroup.headers"
              :key="header.id"
              class="ktable-th"
              :class="{
                'ktable-th--sortable': header.column.getCanSort(),
                'ktable-th--sorted': header.column.getIsSorted(),
                'ktable-th--align-right': header.column.columnDef.meta?.align === 'right',
                'ktable-th--align-center': header.column.columnDef.meta?.align === 'center',
              }"
              :aria-sort="ariaSort(header.column.getIsSorted())"
              @click="header.column.getCanSort() ? header.column.toggleSorting(false, $event.shiftKey) : undefined"
            >
              <div class="ktable-th__inner">
                <!-- Checkbox column header -->
                <template v-if="header.id === '__select__'">
                  <input
                    type="checkbox"
                    class="ktable-checkbox"
                    :checked="table.getIsAllPageRowsSelected()"
                    :indeterminate="table.getIsSomePageRowsSelected()"
                    aria-label="Select all rows"
                    @change="table.toggleAllPageRowsSelected($event.target.checked)"
                  />
                </template>

                <template v-else>
                  <!-- Header label (rendered via TanStack FlexRender) -->
                  <span class="ktable-th__label">
                    <FlexRender
                      v-if="!header.isPlaceholder"
                      :render="header.column.columnDef.header"
                      :props="header.getContext()"
                    />
                  </span>

                  <!-- Sort indicator -->
                  <span v-if="header.column.getCanSort()" class="ktable-th__sort-icon" aria-hidden="true">
                    <!-- arrow-up-down (unsorted) -->
                    <svg v-if="!header.column.getIsSorted()"
                      xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
                      fill="none" stroke="currentColor" stroke-width="1.75"
                      stroke-linecap="round" stroke-linejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19"/>
                      <polyline points="19 12 12 19 5 12"/>
                      <polyline points="5 12 12 5 19 12"/>
                    </svg>
                    <!-- arrow-up (asc) -->
                    <svg v-else-if="header.column.getIsSorted() === 'asc'"
                      xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
                      fill="none" stroke="currentColor" stroke-width="1.75"
                      stroke-linecap="round" stroke-linejoin="round">
                      <line x1="12" y1="19" x2="12" y2="5"/>
                      <polyline points="5 12 12 5 19 12"/>
                    </svg>
                    <!-- arrow-down (desc) -->
                    <svg v-else
                      xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
                      fill="none" stroke="currentColor" stroke-width="1.75"
                      stroke-linecap="round" stroke-linejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19"/>
                      <polyline points="19 12 12 19 5 12"/>
                    </svg>
                  </span>
                </template>
              </div>

              <!-- Per-column filter slot -->
              <div
                v-if="header.id !== '__select__' && $slots[`filter-${header.column.id}`]"
                class="ktable-th__filter"
                @click.stop
              >
                <slot :name="`filter-${header.column.id}`" :column="header.column" />
              </div>
            </th>
          </tr>
        </thead>

        <!-- ── <tbody> — Virtual scroll ──────────────────────────────── -->
        <tbody
          v-if="virtual && virtualizer"
          class="ktable-tbody"
          :style="{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }"
        >
          <tr
            v-for="virtualRow in virtualizer.getVirtualItems()"
            :key="rows[virtualRow.index]?.id ?? virtualRow.index"
            class="ktable-row"
            :class="{
              'ktable-row--selected': rows[virtualRow.index]?.getIsSelected(),
              'ktable-row--clickable': !!onRowClick || !!$attrs['onRow-click'],
            }"
            :style="{
              position: 'absolute',
              top: `${virtualRow.start}px`,
              left: 0,
              width: '100%',
            }"
            :aria-selected="rows[virtualRow.index]?.getIsSelected() ? 'true' : undefined"
            @click="handleRowClick(rows[virtualRow.index])"
          >
            <td
              v-for="cell in rows[virtualRow.index]?.getVisibleCells() ?? []"
              :key="cell.id"
              class="ktable-td"
              :class="{
                'ktable-td--align-right': cell.column.columnDef.meta?.align === 'right',
                'ktable-td--align-center': cell.column.columnDef.meta?.align === 'center',
              }"
            >
              <template v-if="cell.column.id === '__select__'">
                <input
                  type="checkbox"
                  class="ktable-checkbox"
                  :checked="rows[virtualRow.index]?.getIsSelected()"
                  :aria-label="`Select row`"
                  @change="rows[virtualRow.index]?.toggleSelected($event.target.checked)"
                  @click.stop
                />
              </template>
              <template v-else>
                <slot
                  v-if="$slots[`cell-${cell.column.id}`]"
                  :name="`cell-${cell.column.id}`"
                  :value="cell.getValue()"
                  :row="rows[virtualRow.index]?.original"
                  :cell="cell"
                />
                <FlexRender
                  v-else
                  :render="cell.column.columnDef.cell"
                  :props="cell.getContext()"
                />
              </template>
            </td>
          </tr>
        </tbody>

        <!-- ── <tbody> — Standard (non-virtual) ──────────────────────── -->
        <tbody v-else class="ktable-tbody">
          <tr
            v-for="row in rows"
            :key="row.id"
            class="ktable-row"
            :class="{
              'ktable-row--selected': row.getIsSelected(),
              'ktable-row--clickable': !!onRowClick || !!$attrs['onRow-click'],
            }"
            :aria-selected="row.getIsSelected() ? 'true' : undefined"
            @click="handleRowClick(row)"
          >
            <td
              v-for="cell in row.getVisibleCells()"
              :key="cell.id"
              class="ktable-td"
              :class="{
                'ktable-td--align-right': cell.column.columnDef.meta?.align === 'right',
                'ktable-td--align-center': cell.column.columnDef.meta?.align === 'center',
              }"
            >
              <template v-if="cell.column.id === '__select__'">
                <input
                  type="checkbox"
                  class="ktable-checkbox"
                  :checked="row.getIsSelected()"
                  :aria-label="`Select row`"
                  @change="row.toggleSelected($event.target.checked)"
                  @click.stop
                />
              </template>
              <template v-else>
                <slot
                  v-if="$slots[`cell-${cell.column.id}`]"
                  :name="`cell-${cell.column.id}`"
                  :value="cell.getValue()"
                  :row="row.original"
                  :cell="cell"
                />
                <FlexRender
                  v-else
                  :render="cell.column.columnDef.cell"
                  :props="cell.getContext()"
                />
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ── Pagination footer ─────────────────────────────────────────── -->
    <KTablePagination
      v-if="showPagination && data.length"
      :pageIndex="pagination === 'server' ? (serverPage ?? 0) : (table.getState().pagination.pageIndex ?? 0)"
      :pageCount="pagination === 'server' ? serverPageCount : table.getPageCount()"
      :pageSize="table.getState().pagination.pageSize"
      :pageSizeOptions="pageSizeOptions"
      :totalRows="pagination === 'server' ? (serverTotal ?? data.length) : table.getFilteredRowModel().rows.length"
      :canPrevPage="pagination === 'server' ? (serverPage ?? 0) > 0 : table.getCanPreviousPage()"
      :canNextPage="pagination === 'server' ? (serverPage ?? 0) < serverPageCount - 1 : table.getCanNextPage()"
      @go-to-page="handleGoToPage"
      @set-page-size="table.setPageSize($event)"
    />
  </div>
</template>

<script setup>
import { ref, computed, shallowRef, watch, nextTick, onMounted, onScopeDispose, effectScope } from 'vue';
import {
  useVueTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  FlexRender,
} from '@tanstack/vue-table';
import { useVirtualizer } from '@tanstack/vue-virtual';
import KTablePagination from './KTablePagination.vue';
import FreshnessChip from './FreshnessChip.vue';
import EmptyState from './EmptyState.vue';
import KSpinner from './KSpinner.vue';
import KAlert from './KAlert.vue';

// ── Props ────────────────────────────────────────────────────────────────────

const props = defineProps({
  /** TanStack ColumnDef array. */
  columns: { type: Array, required: true },
  /** The row data. */
  data: { type: Array, default: () => [] },
  /** Show loading overlay / spinner. */
  loading: { type: Boolean, default: false },
  /** Error string — renders KAlert; overrides loading. */
  error: { type: [String, null], default: null },
  /** Tighten row/cell padding. */
  dense: { type: Boolean, default: false },
  /** Add checkbox selection column. */
  selectable: { type: Boolean, default: false },
  /** v-model:selectedRowIds — Set<string> or string[]. Synced bidirectionally. */
  selectedRowIds: { type: [Set, Array], default: null },
  /** Enable virtual scroll (opt-in, for >500 rows). */
  virtual: { type: Boolean, default: false },
  /** Height in px of the virtual scroll container. */
  virtualHeight: { type: Number, default: 500 },
  /**
   * Pagination mode.
   * 'client' — TanStack client-side pagination (default).
   * 'server' — props-driven; consumer controls page externally.
   * 'none'   — no pagination footer; all rows shown.
   */
  pagination: {
    type: String,
    default: 'client',
    validator: (v) => ['client', 'server', 'none'].includes(v),
  },
  /** Rows per page (client pagination). Default 50. */
  pageSize: { type: Number, default: 50 },
  /** Page size options for the selector. */
  pageSizeOptions: { type: Array, default: () => [10, 25, 50, 100] },
  /** Total rows (server-side pagination). */
  serverTotal: { type: Number, default: null },
  /** Current page (server-side pagination, v-model:serverPage, zero-based). */
  serverPage: { type: Number, default: 0 },
  /** v-model:sortBy — TanStack SortingState [{ id, desc }]. */
  sortBy: { type: Array, default: null },
  /** v-model:visibleColumns — TanStack VisibilityState { [colId]: boolean }. */
  visibleColumns: { type: Object, default: null },
  /** v-model:filters — TanStack ColumnFiltersState [{ id, value }]. */
  filters: { type: Array, default: null },
  /** Renders a FreshnessChip in the toolbar. */
  freshness: { type: [Date, String, null], default: null },
  /** Row-click handler. Also available as @row-click emit. */
  onRowClick: { type: Function, default: null },
  /** Show the column visibility toggle button. */
  showVisibilityMenu: { type: Boolean, default: false },
});

// ── Emits ────────────────────────────────────────────────────────────────────

const emit = defineEmits([
  'update:selectedRowIds',
  'update:serverPage',
  'update:sortBy',
  'update:visibleColumns',
  'update:filters',
  'row-click',
]);

// ── Internal state ───────────────────────────────────────────────────────────

const sorting = ref(props.sortBy ?? []);
const columnFilters = ref(props.filters ?? []);
const columnVisibility = ref(props.visibleColumns ?? {});
const rowSelection = ref(buildSelectionState(props.selectedRowIds));
const visMenuOpen = ref(false);
const scrollContainerRef = ref(null);

// ── Selection helpers ────────────────────────────────────────────────────────

function buildSelectionState(ids) {
  if (!ids) return {};
  const arr = ids instanceof Set ? [...ids] : ids;
  return Object.fromEntries(arr.map((id) => [String(id), true]));
}

function selectionToSet(state) {
  return new Set(Object.keys(state).filter((k) => state[k]));
}

// ── Column definitions (inject selection column) ──────────────────────────────

const resolvedColumns = computed(() => {
  if (!props.selectable) return props.columns;
  const selectCol = {
    id: '__select__',
    header: '',
    cell: '',
    enableSorting: false,
    enableColumnFilter: false,
    meta: { width: '40px' },
  };
  return [selectCol, ...props.columns];
});

// ── Server page count ─────────────────────────────────────────────────────────

const serverPageCount = computed(() => {
  if (!props.serverTotal) return 1;
  return Math.max(1, Math.ceil(props.serverTotal / (props.pageSize || 50)));
});

// ── TanStack table instance ───────────────────────────────────────────────────

const table = useVueTable({
  get data() { return props.data; },
  get columns() { return resolvedColumns.value; },
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
  getPaginationRowModel: getPaginationRowModel(),
  // Row id — use data.id if present, else index
  getRowId: (row, index) => (row.id != null ? String(row.id) : String(index)),
  state: {
    get sorting() { return sorting.value; },
    get columnFilters() { return columnFilters.value; },
    get columnVisibility() { return columnVisibility.value; },
    get rowSelection() { return rowSelection.value; },
    get pagination() {
      return {
        pageIndex: props.pagination === 'server' ? (props.serverPage ?? 0) : undefined,
        pageSize: props.pageSize,
      };
    },
  },
  // Manual server-side pagination
  manualPagination: props.pagination === 'server',
  pageCount: props.pagination === 'server' ? serverPageCount.value : undefined,
  manualSorting: props.pagination === 'server',
  onSortingChange: (updater) => {
    const next = typeof updater === 'function' ? updater(sorting.value) : updater;
    sorting.value = next;
    emit('update:sortBy', next);
  },
  onColumnFiltersChange: (updater) => {
    const next = typeof updater === 'function' ? updater(columnFilters.value) : updater;
    columnFilters.value = next;
    emit('update:filters', next);
  },
  onColumnVisibilityChange: (updater) => {
    const next = typeof updater === 'function' ? updater(columnVisibility.value) : updater;
    columnVisibility.value = next;
    emit('update:visibleColumns', next);
  },
  onRowSelectionChange: (updater) => {
    const next = typeof updater === 'function' ? updater(rowSelection.value) : updater;
    rowSelection.value = next;
    emit('update:selectedRowIds', selectionToSet(next));
  },
  enableRowSelection: props.selectable,
});

// ── Sync external v-model → internal state ────────────────────────────────────

watch(() => props.sortBy, (v) => { if (v) sorting.value = v; });
watch(() => props.filters, (v) => { if (v) columnFilters.value = v; });
watch(() => props.visibleColumns, (v) => { if (v) columnVisibility.value = v; });
watch(() => props.selectedRowIds, (v) => { rowSelection.value = buildSelectionState(v); });

// ── Active rows (for virtual scroll index mapping) ────────────────────────────

const rows = computed(() => {
  if (props.pagination === 'none' || props.virtual) {
    return table.getFilteredRowModel().rows;
  }
  return table.getPaginationRowModel().rows;
});

// ── Virtual scroll ────────────────────────────────────────────────────────────
// useVirtualizer() is a composable that internally calls onScopeDispose() for
// cleanup. It MUST be called from setup() (or an effectScope) so that the
// cleanup hook has an owning scope to attach to.
//
// Strategy: use effectScope so we can tear down and re-create the virtualizer
// if virtual toggles (rare in practice — consumers do not toggle this prop
// mid-session, but the contract must be correct regardless). The scope gives
// the internal onScopeDispose call a valid owner.
//
// useVirtualizer accepts MaybeRef<options>; we pass a computed so `count` and
// `estimateSize` stay reactive without re-creating the virtualizer instance.

const _scope = effectScope();
const _virtualizerRef = shallowRef(null); // holds Ref<Virtualizer> | null

if (props.virtual) {
  _scope.run(() => {
    _virtualizerRef.value = useVirtualizer(
      computed(() => ({
        count: rows.value.length,
        getScrollElement: () => scrollContainerRef.value,
        estimateSize: () => (props.dense ? 32 : 44),
        overscan: 10,
      }))
    );
  });
}

// Watch for late virtual toggle (guard: only ever goes false→true in practice).
watch(
  () => props.virtual,
  (v) => {
    if (!v) {
      _scope.stop();
      _virtualizerRef.value = null;
    }
    // true→false path not expected but handled above; false→true after mount
    // is not supported by this primitive (virtual is a one-time init prop).
  }
);

// Dispose the scope when the component unmounts.
onScopeDispose(() => _scope.stop());

// Unwrap the inner Ref<Virtualizer> so the template receives a Virtualizer instance.
const virtualizer = computed(() => _virtualizerRef.value?.value ?? null);

// ── Pagination ────────────────────────────────────────────────────────────────

const showPagination = computed(() => props.pagination !== 'none');

function handleGoToPage(pageIndex) {
  if (props.pagination === 'server') {
    emit('update:serverPage', pageIndex);
  } else {
    table.setPageIndex(pageIndex);
  }
}

// ── Row click ─────────────────────────────────────────────────────────────────

function handleRowClick(row) {
  if (!row) return;
  const original = row.original;
  if (props.onRowClick) props.onRowClick(original);
  emit('row-click', original);
}

// ── Column width helper (for <colgroup>) ──────────────────────────────────────
// Priority: meta.width (string, e.g. '180px') > column.getSize() (number, px) > 150px default.
// With table-layout: fixed the browser respects these widths regardless of whether
// body rows are in normal flow (non-virtual) or absolutely positioned (virtual).

function colWidth(column) {
  const meta = column.columnDef.meta;
  if (meta?.width) return { width: meta.width };
  const size = column.getSize?.();
  if (size && size !== 150) return { width: `${size}px` };
  return { width: `${size || 150}px` };
}

// ── Aria sort ─────────────────────────────────────────────────────────────────

function ariaSort(sorted) {
  if (!sorted) return 'none';
  return sorted === 'asc' ? 'ascending' : 'descending';
}

// ── Close visibility menu on outside click ────────────────────────────────────

const visMenuRef = ref(null);
function handleOutsideClick(e) {
  if (visMenuRef.value && !visMenuRef.value.contains(e.target)) {
    visMenuOpen.value = false;
  }
}
onMounted(() => {
  document.addEventListener('click', handleOutsideClick);
});
</script>

<style scoped>
/* ─── KTable — finance-admin primitive ───────────────────────────────────────
   Token reference:
     --kdl-page-bg, --kdl-card-bg, --kdl-raised-bg
     --kdl-hover-bg            row hover tint (subtle)
     --kdl-border-subtle       thead bottom border, row dividers
     --kdl-border              outer border
     --kdl-text-primary        cell text
     --kdl-text-muted          muted / secondary
     --kdl-text-hint           sort icon colour
     --kdl-accent              focus ring, accent sort arrow

   No zebra stripes (CDO: "Linear-bar tables: no zebra").
   Selected row: color-mix accent tint.
────────────────────────────────────────────────────────────────────────────── */

.ktable-root {
  position: relative;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--kdl-border);
  border-radius: 10px;
  background: var(--kdl-card-bg);
  overflow: hidden;
  box-shadow: var(--shadow-soft);
}

/* ── Toolbar ────────────────────────────────────────────────────────────── */
.ktable-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--kdl-border-subtle);
  flex-wrap: wrap;
}

/* ── Column visibility ───────────────────────────────────────────────────── */
.ktable-vis-menu {
  position: relative;
  padding: 6px 16px;
  border-bottom: 1px solid var(--kdl-border-subtle);
  display: flex;
  align-items: center;
}

.ktable-vis-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.ktable-vis-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 16px;
  z-index: 100;
  background: var(--kdl-raised-bg);
  border: 1px solid var(--kdl-border);
  border-radius: 8px;
  box-shadow: var(--shadow-lifted);
  padding: 8px;
  min-width: 180px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ktable-vis-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--kdl-text-primary);
}

.ktable-vis-item:hover {
  background: var(--kdl-hover-bg);
}

/* ── State wrappers ──────────────────────────────────────────────────────── */
.ktable-state-wrapper {
  padding: 24px 16px;
}

.ktable-state-wrapper--loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
}

/* ── Scroll container ────────────────────────────────────────────────────── */
.ktable-scroll-container {
  position: relative;
  overflow-x: auto;
}

/* Loading overlay (when data exists but refreshing) */
.ktable-loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  background: rgba(var(--kdl-card-bg-rgb, 255,255,255), 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ── Table element ───────────────────────────────────────────────────────── */
.ktable {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  color: var(--kdl-text-primary);
  table-layout: fixed;
}

.ktable--loading {
  opacity: 0.6;
  pointer-events: none;
  transition: opacity 200ms;
}

/* ── <thead> ─────────────────────────────────────────────────────────────── */
.ktable-thead {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--kdl-card-bg);
  border-bottom: 2px solid var(--kdl-border-subtle);
}

.ktable-thead__row {
  /* no background — thead handles it */
}

.ktable-th {
  padding: 10px 16px;
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--kdl-text-muted);
  white-space: nowrap;
  vertical-align: bottom;
  user-select: none;
}

.ktable-root--dense .ktable-th {
  padding: 6px 12px;
}

.ktable-th--sortable {
  cursor: pointer;
}

.ktable-th--sortable:hover {
  background: var(--kdl-hover-bg);
}

.ktable-th--sorted {
  color: var(--kdl-text-primary);
}

.ktable-th__inner {
  display: flex;
  align-items: center;
  gap: 4px;
}

.ktable-th__label {
  flex: 1 1 0;
  min-width: 0;
}

.ktable-th__sort-icon {
  flex-shrink: 0;
  color: var(--kdl-text-hint);
  display: flex;
  align-items: center;
}

.ktable-th--sorted .ktable-th__sort-icon {
  color: var(--kdl-accent);
}

.ktable-th__filter {
  margin-top: 6px;
}

/* ── <tbody> ─────────────────────────────────────────────────────────────── */
.ktable-tbody {
  /* default flow */
}

/* ── Rows ────────────────────────────────────────────────────────────────── */
.ktable-row {
  border-bottom: 1px solid var(--kdl-border-subtle);
  transition: background 120ms var(--ease-standard);
}

.ktable-row:last-child {
  border-bottom: none;
}

.ktable-row:hover {
  background: var(--kdl-hover-bg);
}

.ktable-row--clickable {
  cursor: pointer;
}

/* Selected row — accent 10% tint */
.ktable-row--selected {
  background: color-mix(in srgb, var(--kdl-accent) 10%, transparent);
}

.ktable-row--selected:hover {
  background: color-mix(in srgb, var(--kdl-accent) 14%, transparent);
}

/* ── Cells ───────────────────────────────────────────────────────────────── */
.ktable-td {
  padding: 12px 16px;
  vertical-align: middle;
  font-size: 13px;
  line-height: 1.4;
  color: var(--kdl-text-primary);
  /* F3: prevent long cell content from wrapping and breaking virtual-row height
     contract (estimateSize is fixed at 44px; wrapped rows would overflow and
     collide with the next absolutely-positioned row). */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ktable-root--dense .ktable-td {
  padding: 6px 12px;
}

/* ── Column alignment (F2) ───────────────────────────────────────────────── */
/* Applied via meta.align on the column def. Both header and body cells must
   carry the class so the column reads consistently top-to-bottom. */
.ktable-th--align-right,
.ktable-td--align-right {
  text-align: right;
}

.ktable-th--align-center,
.ktable-td--align-center {
  text-align: center;
}

/* ── Checkbox ────────────────────────────────────────────────────────────── */
.ktable-checkbox {
  width: 15px;
  height: 15px;
  cursor: pointer;
  accent-color: var(--kdl-accent);
}

/* ─── Dark mode ─────────────────────────────────────────────────────────── */
:root[data-theme="dark"] .ktable-loading-overlay {
  background: rgba(22, 24, 39, 0.6);
}
</style>
