<template>
  <AppPage>
    <PageHeader title="Activity" subtitle="Who did what on the audit surface">
      <template #actions>
        <button
          class="btn btn-ghost btn-sm"
          :disabled="exporting"
          data-test="activity-export"
          @click="exportCsv"
        >
          <!-- Lucide download -->
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="mr-1"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          {{ exporting ? 'Exporting…' : 'Export CSV' }}
        </button>
        <button class="btn btn-ghost btn-sm" :disabled="loading" @click="load">
          <!-- Lucide refresh-cw -->
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="mr-1"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          Refresh
        </button>
      </template>
    </PageHeader>

    <KAlert v-if="error" variant="error" :title="error" class="mb-4" dismissible />

    <FilterBar>
      <KSelect
        v-model="filters.actor"
        label="Who"
        :options="actorOptions"
        class="aa-filter"
      />
      <KMultiSelect
        v-model="selectedActions"
        label="Action"
        :options="actionOptions"
        class="aa-filter"
      />
      <KSelect
        v-model="filters.target_kind"
        label="Target"
        :options="TARGET_KIND_OPTIONS"
        class="aa-filter"
      />
      <KInput v-model="filters.since" label="From" type="date" class="aa-filter" />
      <KInput v-model="filters.until" label="To" type="date" class="aa-filter" />
      <KInput v-model="filters.q" label="Search" type="search" class="aa-filter aa-filter--wide" />
    </FilterBar>

    <SectionCard :description="countLabel">
      <EmptyState
        v-if="!loading && !rows.length && !error"
        title="No activity"
        description="Nothing matches these filters yet."
      />
      <KTable
        v-else
        resizable
        dense
        :columns="COLUMNS"
        :data="rows"
        :loading="loading"
        :columnSizing="colWidths"
        pagination="server"
        :pageSize="filters.page_size"
        :pageSizeOptions="PAGE_SIZE_OPTIONS"
        :serverTotal="count"
        :serverPage="filters.page - 1"
        @update:columnSizing="onColWidths"
        @update:serverPage="onServerPage"
        @update:pageSize="onPageSize"
      >
        <template #cell-occurred_at="{ value }">
          <span class="aa-when">{{ formatDateTime(value) }}</span>
        </template>

        <template #cell-actor="{ row }">
          <span class="aa-who">
            <span class="aa-who__name">{{ row.actor || 'system' }}</span>
            <StatusPill
              v-if="row.actor_role"
              :tone="row.actor_role === 'auditor' ? 'warning' : 'neutral'"
              :label="row.actor_role"
              size="sm"
            />
          </span>
        </template>

        <template #cell-action="{ value }">
          <code class="aa-action">{{ value }}</code>
        </template>

        <template #cell-target_ref="{ row }">
          <button
            v-if="targetLink(row)"
            type="button"
            class="aa-target aa-target--link"
            :title="`Open ${row.target_kind} ${row.target_id}`"
            data-test="activity-target-link"
            @click="openTarget(row)"
          >
            {{ row.target_ref || row.target_id || '—' }}
          </button>
          <span v-else class="aa-target">{{ row.target_ref || row.target_id || '—' }}</span>
        </template>

        <template #cell-changes="{ value }">
          <ActivityChanges :changes="value" />
        </template>

        <template #cell-source="{ value }">
          <span :class="value ? '' : 'text-muted'">{{ value || '—' }}</span>
        </template>
      </KTable>
    </SectionCard>
  </AppPage>
</template>

<script setup>
/**
 * Audit → Activity: the append-only "who did what" trail.
 *
 * Standard users only. Auditor accounts are what this trail RECORDS, so the
 * page is absent from their nav and from the router's auditor allowlist — and
 * the backend 403s /api/activity/ for them regardless, which is the actual
 * boundary. The UI omission just keeps the console honest.
 *
 * Filters round-trip through the URL like the findings page, so a link to a
 * filtered view is shareable and a reload does not lose the filter.
 */
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppPage from '../components/shell/AppPage.vue';
import PageHeader from '../components/klikk/PageHeader.vue';
import SectionCard from '../components/klikk/SectionCard.vue';
import EmptyState from '../components/klikk/EmptyState.vue';
import FilterBar from '../components/klikk/FilterBar.vue';
import KAlert from '../components/klikk/KAlert.vue';
import KInput from '../components/klikk/KInput.vue';
import KMultiSelect from '../components/klikk/KMultiSelect.vue';
import KSelect from '../components/klikk/KSelect.vue';
import KTable from '../components/klikk/KTable.vue';
import StatusPill from '../components/klikk/StatusPill.vue';
import ActivityChanges from '../components/activity/ActivityChanges.vue';
import {
  exportActivity, listActivity, listActivityActions, listActivityActors,
} from '../api/activity';
import { ALL, formatDateTime } from '../utils/receipts';

const route = useRoute();
const router = useRouter();

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];
const DEFAULT_PAGE_SIZE = 50;

// ALL is the house sentinel for "no filter" — reka-ui rejects '' item values,
// so an empty-string option silently breaks the whole select.
const TARGET_KIND_OPTIONS = [
  { label: 'Any', value: ALL },
  { label: 'Finding', value: 'finding' },
  { label: 'Receipt', value: 'receipt' },
  { label: 'Comment', value: 'comment' },
  { label: 'Attachment', value: 'attachment' },
  { label: 'Link', value: 'link' },
];

/** Sentinel -> nothing sent. */
function real(value) {
  return value && value !== ALL ? value : '';
}

const COLUMNS = [
  { accessorKey: 'occurred_at', header: 'When', enableSorting: false, meta: { width: '150px' } },
  { accessorKey: 'actor', header: 'Who', enableSorting: false, meta: { width: '190px' } },
  { accessorKey: 'action', header: 'Action', enableSorting: false, meta: { width: '190px' } },
  { accessorKey: 'target_ref', header: 'Target', enableSorting: false, meta: { width: '240px' } },
  { accessorKey: 'changes', header: 'Changes', enableSorting: false, meta: { width: '320px' } },
  { accessorKey: 'source', header: 'Source', enableSorting: false, meta: { width: '90px' } },
];

const rows = ref([]);
const count = ref(0);
const loading = ref(false);
const exporting = ref(false);
const error = ref(null);
const actors = ref([]);
const actions = ref([]);
const selectedActions = ref([]);

const filters = reactive({
  actor: ALL,
  target_kind: ALL,
  since: '',
  until: '',
  q: '',
  page: 1,
  page_size: DEFAULT_PAGE_SIZE,
});

const actorOptions = computed(() => [
  { label: 'Anyone', value: ALL },
  ...actors.value.map((a) => ({ label: a, value: a })),
]);

const actionOptions = computed(() =>
  actions.value.map((a) => ({ label: a, value: a })));

const countLabel = computed(() => {
  if (loading.value && !rows.value.length) return 'Loading activity…';
  return `${count.value} event${count.value === 1 ? '' : 's'}`;
});

// ── Column widths (drag-to-resize, persisted per browser) ────────────────────

const COL_WIDTHS_KEY = 'klikk.audit-activity.col-widths';

function loadColWidths() {
  try {
    const parsed = JSON.parse(localStorage.getItem(COL_WIDTHS_KEY) || 'null');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

const colWidths = ref(loadColWidths());

function onColWidths(next) {
  colWidths.value = next && typeof next === 'object' ? next : {};
  try {
    localStorage.setItem(COL_WIDTHS_KEY, JSON.stringify(colWidths.value));
  } catch {
    // Private browsing / quota — widths just won't survive a reload.
  }
}

// ── Query params ─────────────────────────────────────────────────────────────

function queryParams() {
  const params = { page: filters.page, page_size: filters.page_size };
  for (const key of ['actor', 'target_kind', 'since', 'until', 'q']) {
    const value = real(filters[key]);
    if (value) params[key] = value;
  }
  // Repeatable ?action= — the backend reads it with getlist().
  if (selectedActions.value.length) params.action = [...selectedActions.value];
  return params;
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const data = await listActivity(queryParams());
    rows.value = Array.isArray(data?.results) ? data.results : [];
    count.value = Number(data?.count) || 0;
  } catch (err) {
    error.value = err?.response?.status === 403
      ? 'Your account does not have access to the activity trail.'
      : 'Could not load the activity trail.';
    rows.value = [];
    count.value = 0;
    console.error(err);
  } finally {
    loading.value = false;
  }
}

async function exportCsv() {
  exporting.value = true;
  try {
    // Paging is ignored server-side; the filter is what matters.
    const { page, page_size: _pageSize, ...rest } = queryParams();
    void page; void _pageSize;
    await exportActivity(rest);
  } catch (err) {
    error.value = 'Exporting the activity trail failed.';
    console.error(err);
  } finally {
    exporting.value = false;
  }
}

// ── URL sync ─────────────────────────────────────────────────────────────────

function hydrateFromQuery() {
  const q = route.query || {};
  for (const key of ['actor', 'target_kind', 'since', 'until', 'q']) {
    if (typeof q[key] === 'string') filters[key] = q[key];
  }
  if (q.action) selectedActions.value = Array.isArray(q.action) ? [...q.action] : [q.action];
  const page = Number(q.page);
  if (Number.isFinite(page) && page >= 1) filters.page = Math.trunc(page);
  const size = Number(q.page_size);
  if (PAGE_SIZE_OPTIONS.includes(size)) filters.page_size = size;
}

function syncQuery() {
  const query = {};
  for (const key of ['actor', 'target_kind', 'since', 'until', 'q']) {
    const value = real(filters[key]);
    if (value) query[key] = value;
  }
  if (selectedActions.value.length) query.action = [...selectedActions.value];
  if (filters.page > 1) query.page = String(filters.page);
  if (filters.page_size !== DEFAULT_PAGE_SIZE) query.page_size = String(filters.page_size);
  router.replace({ query });
}

// Any filter change resets paging: staying on page 7 of a filter that now has
// two pages shows an empty table and reads as "no results".
watch(
  () => [filters.actor, filters.target_kind, filters.since, filters.until, filters.q,
    selectedActions.value.join('|')],
  () => {
    filters.page = 1;
    syncQuery();
    load();
  },
);

function onServerPage(zeroBased) {
  filters.page = Number(zeroBased) + 1;
  syncQuery();
  load();
}

function onPageSize(size) {
  filters.page_size = Number(size) || DEFAULT_PAGE_SIZE;
  filters.page = 1;
  syncQuery();
  load();
}

// ── Target deep links ────────────────────────────────────────────────────────

/** Which targets can be opened in a register, and where. */
function targetLink(row) {
  if (!row?.target_id) return null;
  if (row.target_kind === 'finding') {
    return { name: 'audit-findings', query: { finding: String(row.target_id) } };
  }
  if (row.target_kind === 'receipt') {
    return { name: 'audit-receipts', query: { q: String(row.target_id) } };
  }
  // Comments / attachments / links point at a child object; the register has
  // no route for those, so they render as plain text rather than a dead link.
  return null;
}

function openTarget(row) {
  const target = targetLink(row);
  if (target) router.push(target);
}

onMounted(async () => {
  hydrateFromQuery();
  await load();
  // Filter vocabularies come from the server so they cannot drift from the
  // verbs the app actually records. A failure here leaves the filters empty
  // rather than breaking the page.
  try {
    const [a, verbs] = await Promise.all([listActivityActors(), listActivityActions()]);
    actors.value = a;
    actions.value = verbs;
  } catch (err) {
    console.error(err);
  }
});
</script>

<style scoped>
.aa-filter {
  min-width: 150px;
}

.aa-filter--wide {
  min-width: 220px;
}

.aa-when {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.aa-who {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  overflow-wrap: anywhere;
}

.aa-who__name {
  font-weight: 500;
}

.aa-action {
  font-size: 12px;
  color: var(--kdl-text-secondary);
}

.aa-target {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}

.aa-target--link {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: var(--kdl-accent);
  cursor: pointer;
  text-align: left;
}

.aa-target--link:hover {
  text-decoration: underline;
}

.aa-target--link:focus-visible {
  outline: 2px solid var(--kdl-accent);
  outline-offset: 2px;
}
</style>
