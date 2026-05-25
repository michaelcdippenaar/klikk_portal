<!--
  KTablePagination — Klikk Design Language table pagination footer.

  Replaces: q-table's built-in pagination footer.
  Used internally by KTable; can also be composed standalone.

  Props:
    pageIndex     (number)          — zero-based current page index
    pageCount     (number)          — total number of pages
    pageSize      (number)          — rows per page
    pageSizeOptions (number[])      — choices in the page-size selector
    totalRows     (number)          — total row count (shown in caption)
    canPrevPage   (boolean)
    canNextPage   (boolean)

  Events:
    go-to-page    (pageIndex: number)
    set-page-size (size: number)
-->
<template>
  <div class="ktpag" role="navigation" aria-label="Table pagination">
    <!-- Row count caption -->
    <span class="ktpag__caption">
      {{ rowRangeLabel }}
    </span>

    <!-- Page size selector -->
    <div class="ktpag__size-selector">
      <label :for="pageSizeId" class="ktpag__size-label">Rows</label>
      <select
        :id="pageSizeId"
        class="ktpag__size-select"
        :value="pageSize"
        @change="$emit('set-page-size', Number($event.target.value))"
      >
        <option
          v-for="opt in pageSizeOptions"
          :key="opt"
          :value="opt"
        >{{ opt }}</option>
      </select>
    </div>

    <!-- Page navigation -->
    <div class="ktpag__nav" role="group" aria-label="Page navigation">
      <!-- First page -->
      <button
        class="ktpag__btn"
        :disabled="!canPrevPage"
        aria-label="First page"
        @click="$emit('go-to-page', 0)"
      >
        <!-- chevrons-left / ChevronsLeft -->
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="1.75"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/>
        </svg>
      </button>

      <!-- Prev page -->
      <button
        class="ktpag__btn"
        :disabled="!canPrevPage"
        aria-label="Previous page"
        @click="$emit('go-to-page', pageIndex - 1)"
      >
        <!-- chevron-left -->
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="1.75"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>

      <!-- Page indicator -->
      <span class="ktpag__page-indicator" aria-current="page" aria-label="Page {{ pageIndex + 1 }} of {{ pageCount }}">
        {{ pageIndex + 1 }} / {{ pageCount || 1 }}
      </span>

      <!-- Next page -->
      <button
        class="ktpag__btn"
        :disabled="!canNextPage"
        aria-label="Next page"
        @click="$emit('go-to-page', pageIndex + 1)"
      >
        <!-- chevron-right -->
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="1.75"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>

      <!-- Last page -->
      <button
        class="ktpag__btn"
        :disabled="!canNextPage"
        aria-label="Last page"
        @click="$emit('go-to-page', pageCount - 1)"
      >
        <!-- chevrons-right / ChevronsRight -->
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="1.75"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  pageIndex: { type: Number, required: true },
  pageCount: { type: Number, required: true },
  pageSize: { type: Number, required: true },
  pageSizeOptions: { type: Array, default: () => [10, 25, 50, 100] },
  totalRows: { type: Number, required: true },
  canPrevPage: { type: Boolean, required: true },
  canNextPage: { type: Boolean, required: true },
});

defineEmits(['go-to-page', 'set-page-size']);

const pageSizeId = `ktpag-size-${Math.random().toString(36).slice(2, 7)}`;

const rowRangeLabel = computed(() => {
  const start = props.pageIndex * props.pageSize + 1;
  const end = Math.min((props.pageIndex + 1) * props.pageSize, props.totalRows);
  if (props.totalRows === 0) return 'No rows';
  return `${start}–${end} of ${props.totalRows}`;
});
</script>

<style scoped>
.ktpag {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 16px;
  border-top: 1px solid var(--kdl-border-subtle);
  background: var(--kdl-card-bg);
  flex-wrap: wrap;
}

.ktpag__caption {
  flex: 1 1 0;
  font-size: 12px;
  color: var(--kdl-text-muted);
  white-space: nowrap;
}

.ktpag__size-selector {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ktpag__size-label {
  font-size: 12px;
  color: var(--kdl-text-muted);
  white-space: nowrap;
}

.ktpag__size-select {
  height: 28px;
  padding: 0 6px;
  font-size: 12px;
  font-family: inherit;
  font-weight: 500;
  color: var(--kdl-text-primary);
  background: var(--kdl-card-bg);
  border: 1px solid var(--kdl-border);
  border-radius: 6px;
  cursor: pointer;
  outline: none;
  transition: border-color 150ms;
}

.ktpag__size-select:hover {
  border-color: var(--kdl-text-muted);
}

.ktpag__size-select:focus-visible {
  border-color: var(--kdl-accent);
  box-shadow: 0 0 0 2px rgba(255, 61, 127, 0.18);
}

.ktpag__nav {
  display: flex;
  align-items: center;
  gap: 2px;
}

.ktpag__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  color: var(--kdl-text-muted);
  transition: background 150ms, color 150ms, border-color 150ms;
}

.ktpag__btn:hover:not(:disabled) {
  background: var(--kdl-hover-bg);
  border-color: var(--kdl-border);
  color: var(--kdl-text-primary);
}

.ktpag__btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.ktpag__btn:focus-visible {
  outline: 2px solid var(--kdl-accent);
  outline-offset: 2px;
}

.ktpag__page-indicator {
  font-size: 12px;
  font-weight: 500;
  color: var(--kdl-text-primary);
  padding: 0 8px;
  white-space: nowrap;
}
</style>
