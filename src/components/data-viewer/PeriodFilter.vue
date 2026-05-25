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
  <FilterBar class="q-mb-sm">
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
    <q-btn
      label="Load"
      color="primary"
      size="sm"
      :loading="loading"
      @click="$emit('load')"
    />
    <q-btn
      label="Clear"
      color="grey"
      flat
      size="sm"
      @click="handleClear"
    />

    <!-- Saved views dropdown -->
    <div class="period-filter__saved">
      <q-btn-dropdown
        flat
        size="sm"
        no-caps
        color="primary"
        class="period-filter__saved-btn"
        :label="savedViews.length ? `Views (${savedViews.length})` : 'Views'"
        dropdown-icon="none"
      >
        <template #label>
          <span class="period-filter__saved-label">
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
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </template>

        <q-list dense style="min-width: 220px">
          <!-- Save current view -->
          <q-item>
            <q-item-section>
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
            </q-item-section>
          </q-item>

          <q-separator v-if="savedViews.length" />

          <!-- Saved view list -->
          <template v-if="savedViews.length">
            <q-item
              v-for="(view, idx) in savedViews"
              :key="view.name"
              clickable
              @click="restoreView(view)"
              class="period-filter__view-item"
            >
              <q-item-section>
                <q-item-label class="period-filter__view-name">{{ view.name }}</q-item-label>
                <q-item-label caption class="period-filter__view-caption">
                  {{ describeFilters(view.filters) }}
                </q-item-label>
              </q-item-section>
              <q-item-section side>
                <button
                  class="period-filter__delete-btn"
                  title="Delete saved view"
                  @click.stop="deleteView(idx)"
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
              </q-item-section>
            </q-item>
          </template>

          <q-item v-else>
            <q-item-section>
              <q-item-label caption class="period-filter__empty-views">
                No saved views yet. Set filters and save.
              </q-item-label>
            </q-item-section>
          </q-item>
        </q-list>
      </q-btn-dropdown>
    </div>
  </FilterBar>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
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

/* Saved views dropdown button */
.period-filter__saved {
  margin-left: 4px;
}

.period-filter__saved-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
}

/* Name input inside the dropdown */
.period-filter__save-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
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

/* Saved view list items */
.period-filter__view-item {
  cursor: pointer;
}

.period-filter__view-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--kdl-text-primary);
}

.period-filter__view-caption {
  font-size: 12px;
  color: var(--kdl-text-muted);
}

.period-filter__empty-views {
  font-size: 12px;
  font-style: italic;
  color: var(--kdl-text-hint);
}

/* Delete button (icon) */
.period-filter__delete-btn {
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
