<template>
  <AppPage>
    <PageHeader
      title="Audit Procedures"
      subtitle="Year-end audit check registry — every check that runs in run_yearend_audit"
    >
      <template #actions>
        <button class="btn btn-ghost btn-sm" :disabled="loading" @click="load">
          <!-- Lucide refresh-cw -->
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="mr-1"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          Refresh
        </button>
      </template>
    </PageHeader>

    <!-- Registry-not-built banner -->
    <KAlert
      v-if="!loading && !registryReady"
      variant="info"
      title="Registry not built yet"
      :body="fallbackNotice"
      class="mb-4"
    />

    <KAlert
      v-if="error"
      variant="error"
      :title="error"
      class="mb-4"
      dismissible
    />

    <FilterBar class="mb-3">
      <KSelect
        v-model="categoryFilter"
        label="Category"
        :options="categoryOptions"
        class="flex-1 min-w-48"
      />
      <KInput
        v-model="search"
        label="Search"
        placeholder="Code, title, description, SQL…"
        clearable
        :debounce="200"
        class="flex-1 min-w-56"
      />
    </FilterBar>

    <div class="ap-count-row mb-2">
      <span class="text-sm text-muted">
        Showing {{ filteredChecks.length }} of {{ checks.length }} checks
      </span>
      <KBadge
        :label="registryReady ? 'Live registry' : 'Planned (static)'"
        :tone="registryReady ? 'accent' : 'muted'"
        size="sm"
      />
    </div>

    <SectionCard>
      <EmptyState
        v-if="!loading && filteredChecks.length === 0"
        title="No checks match"
        body="Clear the category filter or search box to see the full registry."
      />
      <KTable
        v-else
        :columns="columns"
        :data="filteredChecks"
        :loading="loading"
        dense
        pagination="client"
        :pageSize="50"
        :pageSizeOptions="[25, 50, 100]"
        @row-click="openDetail"
      >
        <template #cell-code="{ value }">
          <code class="ap-code">{{ value }}</code>
        </template>

        <template #cell-severity="{ value }">
          <StatusPill
            v-if="value"
            :tone="severityTone(value)"
            :label="String(value)"
            size="sm"
          />
          <span v-else class="text-muted">—</span>
        </template>

        <template #cell-active="{ value }">
          <StatusPill
            v-if="value === true"
            tone="success"
            label="Active"
            size="sm"
          />
          <StatusPill
            v-else-if="value === false"
            tone="neutral"
            label="Inactive"
            size="sm"
          />
          <span v-else class="text-muted">—</span>
        </template>

        <template #cell-owner_action="{ value }">
          <span :class="value ? '' : 'text-muted'">{{ value || '—' }}</span>
        </template>

        <template #cell-expected="{ value }">
          <span :class="value ? '' : 'text-muted'">{{ value || '—' }}</span>
        </template>

        <template #cell-details="{ row }">
          <button class="btn btn-ghost btn-sm" @click.stop="openDetail(row)">
            Details
          </button>
        </template>
      </KTable>
    </SectionCard>

    <!-- Detail drawer -->
    <KDialog
      v-model="detailOpen"
      :title="detail ? `${detail.code} — ${detail.title}` : ''"
      :description="detail ? detail.category : ''"
      size="xl"
    >
      <div v-if="detail" class="ap-detail">
        <div class="ap-detail__meta">
          <div v-if="detail.severity" class="ap-detail__meta-item">
            <span class="ap-detail__meta-label">Severity</span>
            <StatusPill :tone="severityTone(detail.severity)" :label="String(detail.severity)" size="sm" />
          </div>
          <div class="ap-detail__meta-item">
            <span class="ap-detail__meta-label">Expected</span>
            <span>{{ detail.expected || '—' }}</span>
          </div>
          <div class="ap-detail__meta-item">
            <span class="ap-detail__meta-label">Owner action</span>
            <span>{{ detail.owner_action || '—' }}</span>
          </div>
          <div class="ap-detail__meta-item">
            <span class="ap-detail__meta-label">Active</span>
            <span>{{ detail.active === true ? 'Yes' : detail.active === false ? 'No' : '—' }}</span>
          </div>
          <div v-if="detail.source" class="ap-detail__meta-item">
            <span class="ap-detail__meta-label">Source</span>
            <span>{{ detail.source }}</span>
          </div>
        </div>

        <section class="ap-detail__section">
          <h3 class="ap-detail__heading">Description</h3>
          <p class="ap-detail__body">{{ detail.description || 'No description recorded.' }}</p>
        </section>

        <section class="ap-detail__section">
          <h3 class="ap-detail__heading">Rationale</h3>
          <p class="ap-detail__body">{{ detail.rationale || 'No rationale recorded.' }}</p>
        </section>

        <section class="ap-detail__section">
          <h3 class="ap-detail__heading">
            SQL
            <span class="ap-detail__heading-note">read-only</span>
          </h3>
          <pre class="ap-detail__sql" tabindex="0">{{ detail.sql_text || 'No SQL recorded yet.' }}</pre>
        </section>
      </div>
    </KDialog>
  </AppPage>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { getAuditChecks } from '../api/audit';
import plannedChecks from '../data/auditChecksPlanned.json';
import AppPage from '../components/shell/AppPage.vue';
import PageHeader from '../components/klikk/PageHeader.vue';
import SectionCard from '../components/klikk/SectionCard.vue';
import EmptyState from '../components/klikk/EmptyState.vue';
import FilterBar from '../components/klikk/FilterBar.vue';
import KAlert from '../components/klikk/KAlert.vue';
import KBadge from '../components/klikk/KBadge.vue';
import KDialog from '../components/klikk/KDialog.vue';
import KInput from '../components/klikk/KInput.vue';
import KSelect from '../components/klikk/KSelect.vue';
import KTable from '../components/klikk/KTable.vue';
import StatusPill from '../components/klikk/StatusPill.vue';

const ALL = '__all__';

const checks = ref([]);
const registryReady = ref(false);
const loading = ref(false);
const error = ref(null);
const categoryFilter = ref(ALL);
const search = ref('');
const detailOpen = ref(false);
const detail = ref(null);

const fallbackNotice =
  `audit.checks has not been created in Postgres yet, so this is the planned registry ` +
  `(${plannedChecks.checks.length} checks) read from ${plannedChecks.source}. ` +
  `Severity and the executable SQL land when the table is built — live rows replace this list automatically.`;

const columns = [
  { accessorKey: 'code', header: 'Code', enableSorting: true },
  { accessorKey: 'title', header: 'Title', enableSorting: true },
  { accessorKey: 'category', header: 'Category', enableSorting: true },
  { accessorKey: 'severity', header: 'Severity', enableSorting: true },
  { accessorKey: 'expected', header: 'Expected', enableSorting: false },
  { accessorKey: 'owner_action', header: 'Owner action', enableSorting: false },
  { accessorKey: 'active', header: 'Active', enableSorting: true },
  { id: 'details', header: '', enableSorting: false },
];

const categoryOptions = computed(() => {
  const cats = [...new Set(checks.value.map((c) => c.category).filter(Boolean))].sort();
  return [{ value: ALL, label: 'All categories' }, ...cats.map((c) => ({ value: c, label: c }))];
});

const filteredChecks = computed(() => {
  const q = search.value.trim().toLowerCase();
  return checks.value.filter((c) => {
    if (categoryFilter.value !== ALL && c.category !== categoryFilter.value) return false;
    if (!q) return true;
    return [c.code, c.title, c.category, c.description, c.rationale, c.sql_text,
      c.expected, c.owner_action, c.severity]
      .some((f) => f && String(f).toLowerCase().includes(q));
  });
});

function severityTone(severity) {
  const s = String(severity || '').toLowerCase();
  if (['critical', 'high', 'error', 'fail'].includes(s)) return 'error';
  if (['medium', 'warn', 'warning'].includes(s)) return 'warning';
  if (['low', 'info'].includes(s)) return 'info';
  return 'neutral';
}

function openDetail(row) {
  detail.value = row;
  detailOpen.value = true;
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const data = await getAuditChecks();
    if (data && data.registry_ready && Array.isArray(data.checks) && data.checks.length) {
      checks.value = data.checks;
      registryReady.value = true;
    } else {
      checks.value = plannedChecks.checks;
      registryReady.value = false;
    }
  } catch (err) {
    // Endpoint unreachable — still show MC the planned list rather than nothing.
    checks.value = plannedChecks.checks;
    registryReady.value = false;
    error.value = 'Could not reach the audit registry endpoint — showing the planned checks.';
    console.error(err);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.ap-count-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ap-code {
  font-family: var(--kdl-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12px;
  font-weight: 600;
}

.ap-detail__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  padding-bottom: 12px;
  margin-bottom: 4px;
  border-bottom: 1px solid var(--kdl-border-subtle, var(--kdl-border));
  font-size: 13px;
}

.ap-detail__meta-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ap-detail__meta-label {
  color: var(--kdl-text-secondary);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.ap-detail__section {
  margin-top: 16px;
}

.ap-detail__heading {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--kdl-text-secondary);
  margin-bottom: 6px;
}

.ap-detail__heading-note {
  margin-left: 6px;
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  opacity: 0.7;
}

.ap-detail__body {
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-wrap;
}

.ap-detail__sql {
  font-family: var(--kdl-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12px;
  line-height: 1.5;
  padding: 12px;
  border-radius: 6px;
  border: 1px solid var(--kdl-border);
  background: var(--kdl-surface-sunken, var(--kdl-hover-bg));
  color: var(--kdl-text-primary);
  overflow-x: auto;
  white-space: pre;
  max-height: 340px;
}
</style>
