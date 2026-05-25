<!--
  PeriodFilter — Data Viewer local component.

  Encapsulates the year/month filter pair that was duplicated 5 times across
  DataViewer tabs. Also exposes a "Saved views" dropdown that persists named
  filter combinations to localStorage keyed by tenant + tab.

  API:
    v-model:year   (number | null)  — the selected year
    v-model:month  (number | null)  — the selected month (1-12)
    tab            (string, required) — tab slug, used as part of the storage key
    tenant         (string, required) — tenant ID, used as part of the storage key
    loading?       (boolean)        — disables Load button while fetching
    extraFilters?  (object)         — additional filter state to include in saved views
                                     (keyed by field name, value is the current value)

  Emits:
    load                            — user clicked Load
    clear                           — user clicked Clear (year/month reset to null)
    restore (filters: object)       — user selected a saved view; parent should apply
                                     { year, month, ...extraFilters }

  Saved views:
    Stored in localStorage under key: `dv-saved-views-${tenant}-${tab}`
    Format: Array<{ name: string, filters: { year, month, ...extraFilters } }>
    Max 10 views. Oldest evicted when full.

  Keyboard:
    Enter in Year or Month input triggers load.
-->
<template>
  <FilterBar class="mb-2">
    <KInput
      :modelValue="year"
      @update:modelValue="$emit('update:year', $event === '' ? null : Number($event))"
      label="Year"
      type="number"
      placeholder="e.g. 2025"
      class="filter-input-sm"
      @keydown.enter="$emit('load')"
    />
    <KInput
      :modelValue="month"
      @update:modelValue="$emit('update:month', $event === '' ? null : Number($event))"
      label="Month (1-12)"
      type="number"
      placeholder="1-12"
      class="filter-input-sm"
      @keydown.enter="$emit('load')"
    />

    <!-- Extra filter slots: consumer drops additional KInputs here -->
    <slot />

    <!-- Load / Clear buttons -->
    <button
      class="btn btn-primary btn-sm"
      :disabled="loading"
      @click="$emit('load')"
    >
      Load
    </button>
    <button
      class="btn btn-ghost btn-sm"
      @click="handleClear"
    >
      Clear
    </button>

    <!-- Saved views dropdown — native implementation, no Quasar -->
    <div class="period-filter__saved" ref="dropdownRef">
      <button
        type="button"
        class="btn btn-ghost btn-sm period-filter__saved-btn"
        :aria-expanded="dropdownOpen"
        aria-haspopup="true"
        @click="dropdownOpen = !dropdownOpen"
      >
        <!-- bookmark icon -->
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
        <span>{{ savedViews.length ? `Views (${savedViews.length})` : 'Views' }}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          class="period-filter__chevron"
          :class="{ 'period-filter__chevron--open': dropdownOpen }"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <div
        v-if="dropdownOpen"
        class="period-filter__dropdown"
        role="menu"
      >
        <!-- Save current view -->
        <div class="period-filter__save-row">
          <input
            v-model="newViewName"
            class="period-filter__name-input"
            placeholder="Name this view…"
            maxlength="40"
            @keydown.enter.stop="saveCurrentView"
          />
          <button
            class="period-filter__save-action"
            :disabled="!newViewName.trim()"
            @click.stop="saveCurrentView"
            title="Save current filter set"
          >
            Save
          </button>
        </div>

        <hr class="period-filter__sep" v-if="savedViews.length" />

        <!-- Saved view list -->
        <template v-if="savedViews.length">
          <div
            v-for="(view, idx) in savedViews"
            :key="view.name"
            class="period-filter__view-item"
            role="menuitem"
            tabindex="0"
            @click="restoreView(view)"
            @keydown.enter="restoreView(view)"
          >
            <div class="period-filter__view-body">
              <span class="period-filter__view-name">{{ view.name }}</span>
              <span class="period-filter__view-caption">{{ describeFilters(view.filters) }}</span>
            </div>
            <button
              class="period-filter__delete-btn"
              title="Delete saved view"
              @click.stop="deleteView(idx)"
              tabindex="-1"
            >
              <!-- x icon -->
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </template>

        <p v-else class="period-filter__empty-views">
          No saved views yet. Set filters and save.
        </p>
      </div>
    </div>
  </FilterBar>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue';
import FilterBar from '../klikk/FilterBar.vue';
import KInput from '../klikk/KInput.vue';

const props = defineProps({
  /** Currently selected year (v-model:year). */
  year: {
    type: Number,
    default: null,
  },
  /** Currently selected month 1-12 (v-model:month). */
  month: {
    type: Number,
    default: null,
  },
  /** Tab slug — part of the localStorage key. */
  tab: {
    type: String,
    required: true,
  },
  /** Tenant ID — part of the localStorage key. */
  tenant: {
    type: String,
    required: true,
  },
  /** Disables Load button while a fetch is in progress. */
  loading: {
    type: Boolean,
    default: false,
  },
  /**
   * Extra filter state to include in saved views.
   * e.g. { contact_name: 'ACME', account_id: '', limit: 5000 }
   * The parent passes the current extra-filter reactive object here.
   */
  extraFilters: {
    type: Object,
    default: () => ({}),
  },
});

const emit = defineEmits(['update:year', 'update:month', 'load', 'clear', 'restore']);

// ── Dropdown state ───────────────────────────────────────────────────────────

const dropdownOpen = ref(false);
const dropdownRef = ref(null);

function handleOutsideClick(e) {
  if (dropdownRef.value && !dropdownRef.value.contains(e.target)) {
    dropdownOpen.value = false;
  }
}

onMounted(() => document.addEventListener('mousedown', handleOutsideClick));
onUnmounted(() => document.removeEventListener('mousedown', handleOutsideClick));

// ── Saved views ─────────────────────────────────────────────────────────────

const MAX_VIEWS = 10;

function storageKey() {
  return `dv-saved-views-${props.tenant}-${props.tab}`;
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveToStorage(views) {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(views));
  } catch {
    // localStorage quota exceeded — silently skip
  }
}

const savedViews = ref(loadFromStorage());

// Re-load saved views whenever tenant or tab changes.
watch([() => props.tenant, () => props.tab], () => {
  savedViews.value = loadFromStorage();
});

const newViewName = ref('');

function saveCurrentView() {
  const name = newViewName.value.trim();
  if (!name) return;

  const filters = {
    year: props.year,
    month: props.month,
    ...props.extraFilters,
  };

  // Remove existing view with the same name (overwrite).
  const existing = savedViews.value.filter(v => v.name !== name);
  const updated = [{ name, filters }, ...existing].slice(0, MAX_VIEWS);

  savedViews.value = updated;
  saveToStorage(updated);
  newViewName.value = '';
}

function restoreView(view) {
  dropdownOpen.value = false;
  emit('restore', view.filters);
}

function deleteView(idx) {
  const updated = savedViews.value.filter((_, i) => i !== idx);
  savedViews.value = updated;
  saveToStorage(updated);
}

function handleClear() {
  emit('update:year', null);
  emit('update:month', null);
  emit('clear');
}

/** Human-readable summary of a saved view's filter values. */
function describeFilters(filters) {
  const parts = [];
  if (filters.year) parts.push(`FY${filters.year}`);
  if (filters.month) parts.push(`M${filters.month}`);
  const extras = Object.entries(filters)
    .filter(([k, v]) => k !== 'year' && k !== 'month' && v != null && v !== '' && v !== 0)
    .map(([k, v]) => `${k}: ${v}`);
  parts.push(...extras);
  return parts.length ? parts.join(', ') : 'All periods';
}
</script>

<style scoped>
.filter-input-sm {
  min-width: 110px;
  max-width: 130px;
}

/* Trigger button label */
.period-filter__saved-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
}

.period-filter__chevron {
  transition: transform 200ms;
}

.period-filter__chevron--open {
  transform: rotate(180deg);
}

/* Dropdown panel */
.period-filter__saved {
  position: relative;
  margin-left: 4px;
}

.period-filter__dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 200;
  background: var(--kdl-raised-bg);
  border: 1px solid var(--kdl-border);
  border-radius: 10px;
  box-shadow: var(--shadow-lifted);
  padding: 8px;
  min-width: 240px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* Save row */
.period-filter__save-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0 6px;
}

.period-filter__name-input {
  flex: 1 1 0;
  min-width: 0;
  border: 1px solid var(--kdl-border);
  border-radius: 6px;
  background: var(--kdl-card-bg);
  color: var(--kdl-text-primary);
  font-size: 13px;
  padding: 4px 8px;
  outline: none;
}

.period-filter__name-input:focus {
  border-color: var(--kdl-accent);
  box-shadow: 0 0 0 2px rgba(255, 61, 127, 0.18);
}

.period-filter__save-action {
  flex-shrink: 0;
  border: none;
  border-radius: 6px;
  background: var(--kdl-accent);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  cursor: pointer;
  transition: opacity 150ms;
}

.period-filter__save-action:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.period-filter__save-action:not(:disabled):hover {
  opacity: 0.85;
}

/* Separator */
.period-filter__sep {
  border: none;
  border-top: 1px solid var(--kdl-border-subtle);
  margin: 4px 0;
}

/* View items */
.period-filter__view-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 120ms;
}

.period-filter__view-item:hover,
.period-filter__view-item:focus-visible {
  background: var(--kdl-hover-bg);
  outline: none;
}

.period-filter__view-body {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.period-filter__view-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--kdl-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.period-filter__view-caption {
  font-size: 12px;
  color: var(--kdl-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.period-filter__empty-views {
  font-size: 12px;
  font-style: italic;
  color: var(--kdl-text-hint);
  margin: 4px 8px;
}

/* Delete button (icon) */
.period-filter__delete-btn {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--kdl-text-hint);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  border-radius: 4px;
  transition: color 150ms, background 150ms;
}

.period-filter__delete-btn:hover {
  color: #DC2626;
  background: rgba(220, 38, 38, 0.08);
}

:root[data-theme="dark"] .period-filter__delete-btn:hover {
  color: #F87171;
  background: rgba(248, 113, 113, 0.1);
}
</style>
