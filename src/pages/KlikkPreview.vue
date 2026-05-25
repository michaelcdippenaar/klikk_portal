<template>
  <!-- DEV ONLY — not exposed in the app nav. Access via /_klikk-preview -->
  <div style="padding: 24px; max-width: 900px; margin: 0 auto;">

    <!-- Theme toggle -->
    <div style="display: flex; justify-content: flex-end; margin-bottom: 16px;">
      <button
        class="btn-ghost btn-sm"
        :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
        @click="toggleTheme"
      >
        <svg
          v-if="isDark"
          xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="1.75"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
        >
          <circle cx="12" cy="12" r="5"/>
          <line x1="12" y1="1" x2="12" y2="3"/>
          <line x1="12" y1="21" x2="12" y2="23"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="1" y1="12" x2="3" y2="12"/>
          <line x1="21" y1="12" x2="23" y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
        <svg
          v-else
          xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="1.75"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
        {{ isDark ? 'Light mode' : 'Dark mode' }}
      </button>
    </div>

    <!-- ① PageHeader -->
    <div class="klikk-preview-section">
      <span class="label-upper" style="display: block; margin-bottom: 12px;">① PageHeader</span>
      <PageHeader
        title="Financial Overview"
        subtitle="Consolidated view across all entities"
      >
        <template #breadcrumbs>
          <span class="breadcrumb-muted">Portal</span>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
          <span class="breadcrumb-active">Financial Overview</span>
        </template>
        <template #tenantContext>
          <span class="klikk-badge tone-info">Bosch en Dal</span>
        </template>
        <template #actions>
          <button class="btn-ghost btn-sm">Export</button>
          <button class="btn-primary btn-sm">Sync now</button>
        </template>
      </PageHeader>
    </div>

    <!-- ② SectionCard -->
    <div class="klikk-preview-section">
      <span class="label-upper" style="display: block; margin-bottom: 12px;">② SectionCard</span>
      <SectionCard title="Recent Journals" description="Last 50 posted entries">
        <template #actions>
          <button class="btn-ghost btn-sm">View all</button>
        </template>
        <div class="section-body-text">
          Table content would appear here. SectionCard replaces the
          <code>q-card &gt; q-card-section &gt; q-card-section</code> nesting pattern.
        </div>
      </SectionCard>
    </div>

    <!-- ③ EmptyState (both split variants) -->
    <div class="klikk-preview-section">
      <span class="label-upper" style="display: block; margin-bottom: 12px;">③ EmptyState — split variants</span>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div class="card">
          <EmptyState title="No matches" body="Try removing one or more filters.">
            <template #icon>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
            </template>
            <template #cta>
              <button class="btn-ghost btn-sm">Clear filters</button>
            </template>
          </EmptyState>
        </div>
        <div class="card">
          <EmptyState title="No journals yet" body="Sync from Xero to start processing journals.">
            <template #icon>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            </template>
            <template #cta>
              <button class="btn-primary btn-sm">Sync now</button>
            </template>
          </EmptyState>
        </div>
      </div>
    </div>

    <!-- ④ FilterBar -->
    <div class="klikk-preview-section">
      <span class="label-upper" style="display: block; margin-bottom: 12px;">④ FilterBar (resize window to see collapse)</span>
      <FilterBar>
        <button class="pill pill-active">All</button>
        <button class="pill">Invoices</button>
        <button class="pill">Payments</button>
        <button class="pill">Journals</button>
        <input class="input" style="max-width: 200px;" placeholder="Search…" />
      </FilterBar>
    </div>

    <!-- ⑤ ResultPanel — all four states -->
    <div class="klikk-preview-section">
      <span class="label-upper" style="display: block; margin-bottom: 12px;">⑤ ResultPanel — all states</span>
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <ResultPanel status="loading" />
        <ResultPanel
          status="success"
          :summary="{
            processedRows: 142,
            skipped: 3,
            errors: 0,
            timestamp: new Date().toISOString(),
            warnings: ['Row 45: duplicate reference ignored', 'Row 88: currency mismatch, defaulted to ZAR'],
          }"
          :raw-payload="{ status: 'ok', rows: 142, tenant: 'bosch-en-dal' }"
        />
        <ResultPanel
          status="error"
          :summary="{ message: 'Connection refused — Xero API returned 503. Retry or check credentials.' }"
        />
      </div>
    </div>

    <!-- Quasar component check (confirm q-btn picks up KDL primary colour) -->
    <div class="klikk-preview-section">
      <span class="label-upper" style="display: block; margin-bottom: 12px;">Quasar q-btn colour check</span>
      <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
        <q-btn color="primary" label="Primary" />
        <q-btn color="secondary" label="Secondary" />
        <q-btn color="positive" label="Positive" />
        <q-btn color="negative" label="Negative" />
        <q-btn color="accent" label="Accent" />
        <q-btn color="primary" outline label="Outlined" />
        <q-btn color="primary" flat label="Flat" />
      </div>
    </div>

  </div>
</template>

<script setup>
import { useTheme } from '../composables/useTheme';
import PageHeader from '../components/klikk/PageHeader.vue';
import SectionCard from '../components/klikk/SectionCard.vue';
import EmptyState from '../components/klikk/EmptyState.vue';
import FilterBar from '../components/klikk/FilterBar.vue';
import ResultPanel from '../components/klikk/ResultPanel.vue';

const { isDark, toggleTheme } = useTheme();
</script>

<style scoped>
.klikk-preview-section {
  margin-bottom: 40px;
  padding-bottom: 40px;
  border-bottom: 1px dashed var(--kdl-border-subtle);
}
.klikk-preview-section:last-child {
  border-bottom: none;
}
.breadcrumb-muted {
  font-size: 13px;
  color: var(--kdl-text-muted);
}
.breadcrumb-active {
  font-size: 13px;
  color: var(--kdl-text-primary);
}
.section-body-text {
  color: var(--kdl-text-muted);
  font-size: 15px;
}
</style>
