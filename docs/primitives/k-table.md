# KTable — Primitive Guide

**Engine:** TanStack Table v8 (`@tanstack/vue-table`) + optional virtual scroll (`@tanstack/vue-virtual`).

**Replaces:** `q-table`

**API frozen as of Phase 1.E.** Any consumer needing a new prop/event must open a ticket — downstream migrations (DataViewer, Comparison, PlanningAnalytics) depend on this spec.

---

## q-table Migration Mapping

| q-table prop / feature | KTable equivalent |
|---|---|
| `:columns` | `:columns` (TanStack `ColumnDef[]` — see below) |
| `:rows` | `:data` |
| `loading` | `loading` |
| `dense` | `dense` |
| `virtual-scroll` | `virtual` + `virtualHeight` |
| `row-key` | `getRowId` auto-derived from `row.id`; or TanStack `getRowId` option |
| `selection="multiple"` | `selectable` + `v-model:selectedRowIds` |
| `@row-click` | `@row-click` |
| `:pagination` | `pagination="server"` + `serverTotal` + `v-model:serverPage` |
| `:rows-per-page-options` | `pageSizeOptions` |
| `hide-pagination` | `pagination="none"` |
| `#body-cell-<name>` slot | `#cell-<columnId>` slot |
| `#top-right` slot | `#toolbar` slot |

---

## Props

```ts
interface KTableProps {
  // Required
  columns: ColumnDef<Row>[]   // TanStack column definitions
  data: Row[]                 // Row data array

  // States
  loading?: boolean           // Show loading spinner (default false)
  error?: string | null       // Error string → renders KAlert; hides table (default null)

  // Layout
  dense?: boolean             // Tighter row/cell padding (default false)

  // Selection
  selectable?: boolean        // Add checkbox column (default false)
  selectedRowIds?: Set<string> | string[]  // v-model:selectedRowIds

  // Virtual scroll
  virtual?: boolean           // Enable @tanstack/vue-virtual (default false)
  virtualHeight?: number      // Container height in px (default 500)

  // Pagination
  pagination?: 'client' | 'server' | 'none'  // (default 'client')
  pageSize?: number           // Rows per page (default 50)
  pageSizeOptions?: number[]  // Selector options (default [10, 25, 50, 100])
  serverTotal?: number        // Total row count for server pagination
  serverPage?: number         // v-model:serverPage (zero-based, default 0)

  // Sorting / filtering (v-models)
  sortBy?: SortingState       // v-model:sortBy ([{ id, desc }])
  visibleColumns?: VisibilityState  // v-model:visibleColumns ({ [colId]: boolean })
  filters?: ColumnFiltersState      // v-model:filters ([{ id, value }])

  // Extras
  freshness?: Date | string | null  // Renders FreshnessChip in toolbar
  onRowClick?: (row: Row) => void   // Alternative to @row-click emit
  showVisibilityMenu?: boolean      // Column visibility toggle button (default false)
}
```

---

## Events

| Event | Payload | Description |
|---|---|---|
| `row-click` | `Row` (the original data row) | Emitted on row click |
| `update:selectedRowIds` | `Set<string>` | Two-way selection sync |
| `update:serverPage` | `number` | Two-way server page sync |
| `update:sortBy` | `SortingState` | Two-way sort sync |
| `update:visibleColumns` | `VisibilityState` | Two-way visibility sync |
| `update:filters` | `ColumnFiltersState` | Two-way filter sync |

---

## Slots

| Slot | Props | Description |
|---|---|---|
| `toolbar` | — | Left of pagination footer (filter bar, refresh button, etc.) |
| `empty` | — | Replaces built-in EmptyState when `data.length === 0 && !loading` |
| `loading` | — | Replaces built-in KSpinner |
| `error` | — | Replaces built-in KAlert |
| `cell-<columnId>` | `{ value, row, cell }` | Custom cell renderer per column |
| `filter-<columnId>` | `{ column }` | Per-column filter input (rendered below header) |

---

## Column Definitions

KTable accepts standard TanStack `ColumnDef` objects. Use `accessorKey` for simple columns or `columnHelper` for typed columns:

```ts
import { createColumnHelper } from '@tanstack/vue-table';

const ch = createColumnHelper<TrialBalanceRow>();

const columns = [
  ch.accessor('account_code', {
    header: 'Code',
    enableSorting: true,
    enableColumnFilter: true,
  }),
  ch.accessor('account_name', { header: 'Account Name' }),
  ch.accessor('debit', {
    header: 'Debit',
    cell: (info) => `R ${info.getValue().toFixed(2)}`,
  }),
];
```

**OR** use plain objects (no import required):

```js
const columns = [
  { accessorKey: 'account_code', header: 'Code', enableSorting: true },
  { accessorKey: 'account_name', header: 'Account Name' },
  { accessorKey: 'debit', header: 'Debit', enableSorting: true },
];
```

### Column width

Set `meta.width` on the column def to constrain the `<th>` width:

```js
{ accessorKey: 'status', header: 'Status', meta: { width: '90px' } }
```

---

## Use Case Examples

### 1. Read-only paginated table

```vue
<KTable
  :columns="columns"
  :data="rows"
  pagination="client"
  :pageSize="25"
  @row-click="onRowClick"
/>
```

### 2. Virtual-scroll large dataset (>500 rows)

```vue
<KTable
  :columns="columns"
  :data="rows"
  pagination="none"
  virtual
  :virtualHeight="600"
/>
```

No pagination footer is shown — all rows are virtualised. Set `virtualHeight` to the available viewport height for the table.

### 3. Selectable rows

```vue
<script setup>
const selected = ref(new Set());
</script>

<template>
  <KTable
    :columns="columns"
    :data="rows"
    selectable
    v-model:selectedRowIds="selected"
  />
  <p>{{ selected.size }} row(s) selected</p>
</template>
```

`selectedRowIds` is a `Set<string>` of row IDs (derived from `row.id` or the row's index as a string).

### 4. Server-side pagination

```vue
<script setup>
const rows = ref([]);
const total = ref(0);
const page = ref(0);
const sort = ref([]);

watch([page, sort], fetchData, { immediate: true });

async function fetchData() {
  const res = await api.getRows({ page: page.value, sort: sort.value, pageSize: 50 });
  rows.value = res.data;
  total.value = res.total;
}
</script>

<template>
  <KTable
    :columns="columns"
    :data="rows"
    pagination="server"
    :serverTotal="total"
    v-model:serverPage="page"
    v-model:sortBy="sort"
  />
</template>
```

### 5. Per-column filter slots

```vue
<KTable :columns="columns" :data="rows">
  <template #filter-account_code="{ column }">
    <input
      placeholder="Filter code…"
      :value="column.getFilterValue() ?? ''"
      @input="column.setFilterValue($event.target.value || undefined)"
    />
  </template>
</KTable>
```

### 6. Custom cell renderer

```vue
<KTable :columns="columns" :data="rows">
  <template #cell-status="{ value, row }">
    <StatusPill :tone="value === 'active' ? 'success' : 'error'" :label="value" />
  </template>
</KTable>
```

### 7. Column visibility menu

```vue
<KTable
  :columns="columns"
  :data="rows"
  :showVisibilityMenu="true"
  v-model:visibleColumns="visibility"
/>
```

Renders a "Columns" button above the table. Clicking it opens a dropdown where the operator can toggle column visibility.

---

## Performance Notes

- **Virtual scroll** (`virtual` prop) is opt-in. Use it when `data.length > 500`. It uses `@tanstack/vue-virtual`'s `useVirtualizer` internally with `estimateSize` of 44px (32px in dense mode) and `overscan: 10`.
- **Client pagination** (`pagination="client"`, default) limits DOM rows to `pageSize`. No virtual scroll needed for typical datasets (<500 rows).
- **Server pagination** (`pagination="server"`) means TanStack never sees the full dataset — only the current page. Sorting is also delegated to the server.

---

## Theming

KTable uses KDL tokens exclusively:

| Token | Purpose |
|---|---|
| `--kdl-card-bg` | Table and header background |
| `--kdl-hover-bg` | Row hover tint |
| `--kdl-border-subtle` | Row dividers, header border |
| `--kdl-border` | Outer table border |
| `--kdl-text-primary` | Cell text |
| `--kdl-text-muted` | Header label text |
| `--kdl-text-hint` | Sort icon (unsorted state) |
| `--kdl-accent` | Sort icon (sorted), focus rings, checkbox accent |

Selected rows use: `color-mix(in srgb, var(--kdl-accent) 10%, transparent)` — no zebra stripes (CDO spec).

Both light and dark themes work automatically via `[data-theme="dark"]` variable swaps.

---

## Accessibility

- `<thead>` has `position: sticky; top: 0` — visible on scroll.
- Sortable `<th>` elements have `aria-sort="ascending|descending|none"`.
- Checkboxes have `aria-label` for screen readers.
- Pagination buttons have `aria-label` and `disabled` attributes.
- Loading state uses `KSpinner` with `role="status"` and a visually-hidden label.
- Error state uses `KAlert` with `role="alert"`.
