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

    <!-- ⓪ Brand Lockup — KLockup component, all three sizes -->
    <div class="klikk-preview-section">
      <span class="label-upper" style="display: block; margin-bottom: 12px;">⓪ Brand Lockup — KLockup (sm / md / lg)</span>
      <div style="display: flex; align-items: flex-end; gap: 32px; flex-wrap: wrap;">
        <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 6px;">
          <span class="label-upper" style="font-size: 10px;">sm (20px)</span>
          <div style="color: var(--kdl-text-primary);">
            <KLockup size="sm" />
          </div>
        </div>
        <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 6px;">
          <span class="label-upper" style="font-size: 10px;">md (24px) — header default</span>
          <div style="color: var(--kdl-text-primary);">
            <KLockup size="md" />
          </div>
        </div>
        <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 6px;">
          <span class="label-upper" style="font-size: 10px;">lg (36px) — login</span>
          <div style="color: var(--kdl-text-primary);">
            <KLockup size="lg" />
          </div>
        </div>
      </div>
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

    <!-- KDL button variant showcase — replaces the old Quasar q-btn colour check -->
    <div class="klikk-preview-section">
      <span class="label-upper" style="display: block; margin-bottom: 12px;">KDL button variants</span>
      <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
        <button class="btn-primary">Primary</button>
        <button class="btn-ghost">Ghost</button>
        <button class="btn-accent">Accent</button>
        <button class="btn-success">Success</button>
        <button class="btn-danger">Danger</button>
        <button class="btn-primary btn-sm">Primary sm</button>
        <button class="btn-ghost btn-sm">Ghost sm</button>
        <button class="btn-primary" disabled>Disabled</button>
      </div>
    </div>

    <!-- ⑥ KInput — finance-admin input primitive -->
    <div class="klikk-preview-section">
      <span class="label-upper" style="display: block; margin-bottom: 12px;">⑥ KInput — finance-admin primitive</span>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; max-width: 680px;">
        <KInput v-model="demoEmail" label="Email address" type="email" placeholder="you@example.com" />
        <KInput v-model="demoAmount" label="Amount" prefix="R" placeholder="0.00" type="number" />
        <KInput
          v-model="demoRef"
          label="Reference"
          :error="demoRef.length > 0 && demoRef.length < 3"
          error-message="Reference must be at least 3 characters"
          help-text="Used for bank reconciliation matching"
        />
        <KInput v-model="demoSearch" label="Search transactions" icon="search" placeholder="Search…" />
        <KInput v-model="demoDisabled" label="Disabled field" disabled placeholder="Cannot edit" />
        <KInput v-model="demoSuffix" label="Currency" prefix="R" suffix="ZAR" placeholder="0.00" />
      </div>
    </div>

    <!-- ⑦ KAlert — finance-admin alert primitive -->
    <div class="klikk-preview-section">
      <span class="label-upper" style="display: block; margin-bottom: 12px;">⑦ KAlert — finance-admin primitive</span>
      <div style="display: flex; flex-direction: column; gap: 10px; max-width: 680px;">
        <KAlert variant="info" title="Sync scheduled" body="Next Xero sync runs at 02:00 SAST. No action required." />
        <KAlert variant="success" title="Journals posted" body="All 142 journals were posted successfully to Xero." dismissible />
        <KAlert variant="warning" title="API rate limit" body="Xero returned 429 (Too Many Requests). Retrying in 30 seconds." />
        <KAlert variant="error" title="Connection failed" :dismissible="true">
          Authentication error — check your <strong>Xero credentials</strong> in Setup.
        </KAlert>
      </div>
    </div>

    <!-- ⑩ FreshnessChip — when-did-this-last-happen primitive -->
    <div class="klikk-preview-section">
      <span class="label-upper" style="display: block; margin-bottom: 12px;">⑩ FreshnessChip — relative timestamp primitive</span>
      <div class="preview-chip-grid">
        <div class="preview-chip-row">
          <span class="preview-chip-label">Just now</span>
          <FreshnessChip :value="freshnessNow" prefix="Updated" />
        </div>
        <div class="preview-chip-row">
          <span class="preview-chip-label">4m ago</span>
          <FreshnessChip :value="freshness4m" prefix="Last sync" />
        </div>
        <div class="preview-chip-row">
          <span class="preview-chip-label">Yesterday 14:03</span>
          <FreshnessChip :value="freshnessYesterday" format="both" />
        </div>
        <div class="preview-chip-row">
          <span class="preview-chip-label">Never (null)</span>
          <FreshnessChip :value="null" prefix="Last run" />
        </div>
        <div class="preview-chip-row">
          <span class="preview-chip-label">Stale (older than 2m)</span>
          <FreshnessChip :value="freshness4m" :stale-after="2" prefix="Loaded" />
        </div>
      </div>
    </div>

    <!-- ⑪ StatusPill — six semantic tones -->
    <div class="klikk-preview-section">
      <span class="label-upper" style="display: block; margin-bottom: 12px;">⑪ StatusPill — six tones × two sizes</span>
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <div>
          <p class="preview-variant-label">Size: md (default)</p>
          <div class="preview-pill-row">
            <StatusPill tone="success" label="Success" :icon="true" />
            <StatusPill tone="warning" label="Warning" :icon="true" />
            <StatusPill tone="error"   label="Failed"  :icon="true" />
            <StatusPill tone="info"    label="Info"    :icon="true" />
            <StatusPill tone="neutral" label="Idle"    :icon="true" />
            <StatusPill tone="running" label="Running" :icon="true" />
          </div>
        </div>
        <div>
          <p class="preview-variant-label">Size: sm (tight — table cells, drawers)</p>
          <div class="preview-pill-row">
            <StatusPill tone="success" label="Success" :icon="true" size="sm" />
            <StatusPill tone="warning" label="Warning" :icon="true" size="sm" />
            <StatusPill tone="error"   label="Failed"  :icon="true" size="sm" />
            <StatusPill tone="info"    label="Info"    :icon="true" size="sm" />
            <StatusPill tone="neutral" label="Idle"    :icon="true" size="sm" />
            <StatusPill tone="running" label="Running" :icon="true" size="sm" />
          </div>
        </div>
        <div>
          <p class="preview-variant-label">No icon variant</p>
          <div class="preview-pill-row">
            <StatusPill tone="success" label="Completed" />
            <StatusPill tone="error"   label="Error" />
            <StatusPill tone="neutral" label="Pending" />
          </div>
        </div>
      </div>
    </div>

    <!-- ⑫ PersistentResultStrip — last-run state inline -->
    <div class="klikk-preview-section">
      <span class="label-upper" style="display: block; margin-bottom: 12px;">⑫ PersistentResultStrip — last-run state persistence</span>
      <div style="display: flex; flex-direction: column; gap: 12px; max-width: 720px;">
        <PersistentResultStrip
          title="Last reconciliation"
          :result="{
            status: 'success',
            completedAt: freshness4m,
            summary: '**142 rows** reconciled. 3 skipped (duplicate reference).',
            actions: [{ label: 'View details', handler: () => {} }],
          }"
        />
        <PersistentResultStrip
          title="Last sync run"
          :result="{
            status: 'running',
            completedAt: null,
            summary: 'Fetching transactions from Investec API…',
          }"
        />
        <PersistentResultStrip
          title="Last posting run"
          :result="{
            status: 'error',
            completedAt: freshnessYesterday,
            summary: 'Journal posting failed.',
            error: 'Xero API returned 503 — connection timeout after 30s. Check credentials in Setup.',
            actions: [{ label: 'Retry', handler: () => {} }],
          }"
        />
        <div>
          <p class="preview-variant-label">compact=true (above-table variant)</p>
          <PersistentResultStrip
            title="Last sync"
            :compact="true"
            :result="{
              status: 'success',
              completedAt: freshness4m,
              summary: '412 rows loaded',
              actions: [{ label: 'Run again', handler: () => {} }],
            }"
          />
        </div>
      </div>
    </div>

    <!-- ⑬ MetricTile — formalised klikk-stat pattern -->
    <div class="klikk-preview-section">
      <span class="label-upper" style="display: block; margin-bottom: 12px;">⑬ MetricTile — formalised klikk-stat pattern</span>
      <div class="preview-metric-grid">
        <MetricTile label="Total Rows" :value="142" />
        <MetricTile label="Processing Time" :value="28" unit="s" />
        <MetricTile
          label="Coverage"
          value="97.2"
          unit="%"
          :trend="{ direction: 'up', delta: '+1.4%' }"
        />
        <MetricTile
          label="Errors"
          :value="3"
          tone="error"
          :trend="{ direction: 'down', delta: '−2 today' }"
        />
        <MetricTile label="Not Wired" :value="null" unit="rows" />
        <MetricTile
          label="Match Rate"
          value="98.5"
          unit="%"
          tone="success"
        />
      </div>
    </div>

    <!-- ⑨ KOperationCard — operator-card primitive -->
    <div class="klikk-preview-section">
      <span class="label-upper" style="display: block; margin-bottom: 12px;">⑨ KOperationCard — operator-card primitive</span>
      <div style="display: flex; flex-direction: column; gap: 16px; max-width: 680px;">

        <!-- Demo 1: running state with metric -->
        <KOperationCard
          title="Xero Journal Sync"
          description="Posts approved journals to the Xero ledger"
          state="running"
          :last-run-at="demoRunningDate"
          metric="142 rows · 28s"
          :primary-action="{ label: 'View logs', handler: () => {} }"
        />

        <!-- Demo 2: failed state with lastError -->
        <KOperationCard
          title="Bank Reconciliation"
          description="Matches Investec transactions to Xero payments"
          state="failed"
          :last-run-at="demoFailedDate"
          :primary-action="{ label: 'Retry', handler: () => {} }"
          last-error="Xero API returned 503 — connection timeout after 30s. Check credentials in Setup."
        />

      </div>
    </div>

    <!-- ⑧ KTabs — finance-admin tabs primitive -->
    <div class="klikk-preview-section">
      <span class="label-upper" style="display: block; margin-bottom: 12px;">⑧ KTabs — finance-admin primitive (pills + underline)</span>
      <div style="display: flex; flex-direction: column; gap: 24px; max-width: 680px;">
        <!-- Pills (default) -->
        <div>
          <p class="preview-variant-label">Variant: pills (default)</p>
          <KTabs
            :tabs="demoTabs"
            v-model="activePillTab"
            :url-sync="false"
            aria-label="Finance sections demo"
          />
          <div class="preview-tab-content">
            Active tab: <strong>{{ activePillTab }}</strong>
          </div>
        </div>

        <!-- Pills with icons and counts -->
        <div>
          <p class="preview-variant-label">Variant: pills with icons + counts</p>
          <KTabs
            :tabs="demoTabsWithIcons"
            v-model="activeIconTab"
            :url-sync="false"
            aria-label="Finance sections with icons demo"
          />
        </div>

        <!-- Underline -->
        <div>
          <p class="preview-variant-label">Variant: underline</p>
          <KTabs
            variant="underline"
            :tabs="demoTabs"
            v-model="activeUnderlineTab"
            :url-sync="false"
            aria-label="Finance sections underline demo"
          />
        </div>
      </div>
    </div>

    <!-- Form primitives (Phase 1.C) -->
    <!-- KInput v2 — clearable / debounce / number coercion -->
    <div class="klikk-preview-section">
      <span class="label-upper" style="display: block; margin-bottom: 12px;">KInput v2 — clearable · debounce · number coercion</span>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; max-width: 680px;">
        <KInput v-model="demoClearable" label="Clearable input" placeholder="Type something…" clearable />
        <KInput v-model="demoDebounced" label="Debounced (300ms)" placeholder="Search…" :debounce="300" icon="search" clearable />
        <KInput v-model="demoNumber" label="Number input (type=number)" type="number" placeholder="0.00" prefix="R" />
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <span style="font-size: 12px; color: var(--kdl-text-muted);">Emitted value:</span>
          <code style="font-size: 13px; color: var(--kdl-text-primary);">{{ JSON.stringify({ clearable: demoClearable, debounced: demoDebounced, number: demoNumber, numberType: typeof demoNumber }) }}</code>
        </div>
      </div>
    </div>

    <!-- KSelect -->
    <div class="klikk-preview-section">
      <span class="label-upper" style="display: block; margin-bottom: 12px;">KSelect — Reka-backed single select</span>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; max-width: 680px;">
        <KSelect v-model="demoSelect" label="GL Account" :options="selectOptions" placeholder="Choose account…" clearable />
        <KSelect v-model="demoSelectError" label="Entity (error state)" :options="['Bosch en Dal', 'Tremly Holdings', 'Investo CC']" :error="true" error-message="Entity is required" />
        <KSelect v-model="demoSelectDisabled" label="Disabled select" :options="['Option A', 'Option B']" :disabled="true" />
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <span style="font-size: 12px; color: var(--kdl-text-muted);">Selected value:</span>
          <code style="font-size: 13px; color: var(--kdl-text-primary);">{{ JSON.stringify(demoSelect) }}</code>
        </div>
      </div>
    </div>

    <!-- KMultiSelect -->
    <div class="klikk-preview-section">
      <span class="label-upper" style="display: block; margin-bottom: 12px;">KMultiSelect — Reka Combobox multi-select</span>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; max-width: 680px;">
        <KMultiSelect v-model="demoMultiSelect" label="Categories" :options="multiSelectOptions" placeholder="Select categories…" />
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <span style="font-size: 12px; color: var(--kdl-text-muted);">Selected values:</span>
          <code style="font-size: 13px; color: var(--kdl-text-primary);">{{ JSON.stringify(demoMultiSelect) }}</code>
        </div>
      </div>
    </div>

    <!-- KCheckbox + KToggle -->
    <div class="klikk-preview-section">
      <span class="label-upper" style="display: block; margin-bottom: 12px;">KCheckbox + KToggle — Reka-backed booleans</span>
      <div style="display: flex; flex-direction: column; gap: 16px; max-width: 480px;">
        <div>
          <p class="preview-variant-label">KCheckbox</p>
          <div style="display: flex; flex-direction: column; gap: 10px;">
            <KCheckbox v-model="demoCheck1" label="Enable Xero journal posting" />
            <KCheckbox v-model="demoCheck2" label="Send email notifications on failure" />
            <KCheckbox v-model="demoCheckDisabled" label="Disabled option" :disabled="true" />
          </div>
        </div>
        <div>
          <p class="preview-variant-label">KToggle</p>
          <div style="display: flex; flex-direction: column; gap: 10px;">
            <KToggle v-model="demoToggle1" label="Automatic reconciliation" />
            <KToggle v-model="demoToggle2" label="Dark mode (live!)" @update:model-value="onToggleDark" />
            <KToggle v-model="demoToggleDisabled" label="Disabled toggle" :disabled="true" />
          </div>
        </div>
        <div style="font-size: 12px; color: var(--kdl-text-muted);">
          Check: {{ demoCheck1 }}, {{ demoCheck2 }} | Toggle: {{ demoToggle1 }}, {{ demoToggle2 }}
        </div>
      </div>
    </div>

    <!-- KRadioGroup -->
    <div class="klikk-preview-section">
      <span class="label-upper" style="display: block; margin-bottom: 12px;">KRadioGroup — Reka RadioGroup</span>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; max-width: 680px;">
        <div>
          <p class="preview-variant-label">Vertical (default)</p>
          <KRadioGroup v-model="demoRadio" name="period-demo" :options="radioOptions" />
        </div>
        <div>
          <p class="preview-variant-label">Horizontal</p>
          <KRadioGroup v-model="demoRadio" name="period-demo-h" :options="radioOptions" orientation="horizontal" />
        </div>
        <div style="font-size: 12px; color: var(--kdl-text-muted);">
          Selected: <strong>{{ demoRadio }}</strong>
        </div>
      </div>
    </div>

    <!-- KFile -->
    <div class="klikk-preview-section">
      <span class="label-upper" style="display: block; margin-bottom: 12px;">KFile — native file picker wrapper</span>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; max-width: 680px;">
        <KFile v-model="demoFile" label="Attachment" accept=".pdf,.csv" placeholder="Choose PDF or CSV…" help-text="Max 10MB" />
        <KFile v-model="demoFiles" label="Documents (multiple)" :multiple="true" accept=".pdf" />
        <div style="font-size: 12px; color: var(--kdl-text-muted); grid-column: span 2;">
          Single: {{ demoFile?.name ?? 'none' }} | Multiple: {{ Array.isArray(demoFiles) ? demoFiles.map(f => f.name).join(', ') : 'none' }}
        </div>
      </div>
    </div>

    <!-- KForm -->
    <div class="klikk-preview-section">
      <span class="label-upper" style="display: block; margin-bottom: 12px;">KForm — minimal form wrapper</span>
      <div style="max-width: 480px;">
        <KForm @submit="onFormSubmit">
          <KInput v-model="demoFormEmail" label="Email" type="email" placeholder="you@example.com" />
          <KSelect v-model="demoFormEntity" label="Entity" :options="['Bosch en Dal', 'Tremly Holdings']" />
          <KCheckbox v-model="demoFormAgree" label="I confirm the data is correct" />
          <div style="display: flex; gap: 8px;">
            <button type="submit" class="btn-primary btn-sm">Submit</button>
            <button type="button" class="btn-ghost btn-sm" @click="resetForm">Reset</button>
          </div>
          <p v-if="demoFormSubmitted" style="font-size: 13px; color: var(--kdl-accent); margin: 0;">
            Form submitted! Email: {{ demoFormEmail }}, Entity: {{ demoFormEntity }}, Agreed: {{ demoFormAgree }}
          </p>
        </KForm>
      </div>
    </div>

    <!-- ⑭ KSpinner — loading indicator primitive -->
    <div class="klikk-preview-section">
      <span class="label-upper" style="display: block; margin-bottom: 12px;">⑭ KSpinner — loading indicator (size × tone)</span>
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <div>
          <p class="preview-variant-label">Sizes: xs / sm / md (default) / lg — tone: default</p>
          <div style="display: flex; align-items: center; gap: 20px; flex-wrap: wrap;">
            <div style="display: flex; flex-direction: column; align-items: center; gap: 6px;">
              <span class="preview-variant-label">xs (12px)</span>
              <KSpinner size="xs" />
            </div>
            <div style="display: flex; flex-direction: column; align-items: center; gap: 6px;">
              <span class="preview-variant-label">sm (16px)</span>
              <KSpinner size="sm" />
            </div>
            <div style="display: flex; flex-direction: column; align-items: center; gap: 6px;">
              <span class="preview-variant-label">md (20px)</span>
              <KSpinner size="md" />
            </div>
            <div style="display: flex; flex-direction: column; align-items: center; gap: 6px;">
              <span class="preview-variant-label">lg (32px)</span>
              <KSpinner size="lg" />
            </div>
          </div>
        </div>
        <div>
          <p class="preview-variant-label">Tones: default / accent / muted — size: md</p>
          <div style="display: flex; align-items: center; gap: 20px; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <KSpinner tone="default" />
              <span style="font-size: 12px; color: var(--kdl-text-muted);">default</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <KSpinner tone="accent" />
              <span style="font-size: 12px; color: var(--kdl-text-muted);">accent</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <KSpinner tone="muted" />
              <span style="font-size: 12px; color: var(--kdl-text-muted);">muted</span>
            </div>
          </div>
        </div>
        <div>
          <p class="preview-variant-label">Inline with text — "Syncing journals"</p>
          <span style="font-size: 13px; color: var(--kdl-text-secondary); display: inline-flex; align-items: center; gap: 6px;">
            <KSpinner size="sm" tone="accent" />
            Syncing journals…
          </span>
        </div>
      </div>
    </div>

    <!-- ⑮ KBadge — count / label / metadata primitive -->
    <div class="klikk-preview-section">
      <span class="label-upper" style="display: block; margin-bottom: 12px;">⑮ KBadge — count / label / metadata (size × tone)</span>
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <div>
          <p class="preview-variant-label">Tones: default / accent / muted — size: md</p>
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <KBadge label="12 new" tone="default" />
            <KBadge label="v2.4.1" tone="default" />
            <KBadge label="BETA" tone="accent" />
            <KBadge label="STAGING" tone="accent" />
            <KBadge label="archived" tone="muted" />
            <KBadge label="deprecated" tone="muted" />
          </div>
        </div>
        <div>
          <p class="preview-variant-label">Size: sm (tight — table cells, inline metadata)</p>
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <KBadge label="3" tone="accent" size="sm" />
            <KBadge label="v1.0" tone="default" size="sm" />
            <KBadge label="read-only" tone="muted" size="sm" />
          </div>
        </div>
        <div>
          <p class="preview-variant-label">In context — badge next to a heading</p>
          <div style="display: inline-flex; align-items: center; gap: 8px;">
            <span style="font-size: 14px; font-weight: 600; color: var(--kdl-text-primary);">Journal Automation</span>
            <KBadge label="BETA" tone="accent" size="sm" />
          </div>
        </div>
      </div>
    </div>

    <!-- ⑰ KDialog — Reka-based modal dialog primitive -->
    <div class="klikk-preview-section">
      <span class="label-upper" style="display: block; margin-bottom: 12px;">⑰ KDialog — modal dialog (sm / md / lg)</span>
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <KDialog v-model="dialogSm" title="Confirm action" description="This cannot be undone. Are you sure?" size="sm">
          <template #trigger>
            <button class="btn-ghost btn-sm">Open sm dialog</button>
          </template>
          <p style="font-size: 14px; color: var(--kdl-text-secondary); margin: 0;">
            This is the body content of the small dialog. Ideal for confirmations and short prompts.
          </p>
          <template #footer>
            <button class="btn-ghost btn-sm" @click="dialogSm = false">Cancel</button>
            <button class="btn-primary btn-sm" @click="dialogSm = false">Confirm</button>
          </template>
        </KDialog>

        <KDialog v-model="dialogMd" title="Post journals" description="142 journals will be posted to Xero.">
          <template #trigger>
            <button class="btn-ghost btn-sm">Open md dialog</button>
          </template>
          <div style="display: flex; flex-direction: column; gap: 12px;">
            <p style="font-size: 14px; color: var(--kdl-text-secondary); margin: 0;">Review before posting. This action will create journal entries in Xero and cannot be reversed.</p>
            <div class="card" style="padding: 12px;">
              <p class="text-micro" style="margin: 0;">Journals ready: <strong>142</strong></p>
            </div>
          </div>
          <template #footer>
            <button class="btn-ghost btn-sm" @click="dialogMd = false">Cancel</button>
            <button class="btn-accent btn-sm" @click="dialogMd = false">Post to Xero</button>
          </template>
        </KDialog>

        <KDialog v-model="dialogLg" title="Transaction detail" size="lg">
          <template #trigger>
            <button class="btn-ghost btn-sm">Open lg dialog</button>
          </template>
          <p style="font-size: 14px; color: var(--kdl-text-secondary); margin: 0;">
            Wider dialog for data tables and multi-column forms. Renders at 720px max-width.
          </p>
          <template #footer>
            <button class="btn-ghost btn-sm" @click="dialogLg = false">Close</button>
          </template>
        </KDialog>
      </div>
    </div>

    <!-- ⑱ KMenu + KMenuItem + KMenuSeparator — Reka-based dropdown menu -->
    <div class="klikk-preview-section">
      <span class="label-upper" style="display: block; margin-bottom: 12px;">⑱ KMenu + KMenuItem + KMenuSeparator — dropdown menu</span>
      <div style="display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-start;">
        <!-- Basic menu -->
        <KMenu v-model="menuOpen" align="start">
          <template #trigger>
            <button class="btn-ghost btn-sm" :aria-expanded="menuOpen">Actions</button>
          </template>
          <KMenuItem icon="edit" @select="menuOpen = false">Edit record</KMenuItem>
          <KMenuItem icon="copy" @select="menuOpen = false">Duplicate</KMenuItem>
          <KMenuItem icon="download" @select="menuOpen = false" shortcut="⌘D">Export CSV</KMenuItem>
          <KMenuSeparator />
          <KMenuItem icon="trash" @select="menuOpen = false">Delete</KMenuItem>
        </KMenu>

        <!-- Menu with disabled item -->
        <KMenu v-model="menuOpen2" align="start">
          <template #trigger>
            <button class="btn-ghost btn-sm" :aria-expanded="menuOpen2">
              <!-- Lucide more-horizontal -->
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
            </button>
          </template>
          <KMenuItem icon="eye" @select="menuOpen2 = false">View</KMenuItem>
          <KMenuItem icon="edit" @select="menuOpen2 = false">Edit</KMenuItem>
          <KMenuItem icon="external-link" @select="menuOpen2 = false" shortcut="↗">Open in Xero</KMenuItem>
          <KMenuSeparator />
          <KMenuItem icon="trash" :disabled="true">Delete (disabled)</KMenuItem>
        </KMenu>
      </div>
    </div>

    <!-- ⑲ KTooltip — Reka-based tooltip primitive -->
    <div class="klikk-preview-section">
      <span class="label-upper" style="display: block; margin-bottom: 12px;">⑲ KTooltip — hover / focus tooltip</span>
      <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
        <KTooltip text="Post journals to Xero">
          <button class="btn-primary btn-sm">Post</button>
        </KTooltip>

        <KTooltip text="Export filtered rows to CSV" side="right">
          <button class="btn-ghost btn-sm">Export</button>
        </KTooltip>

        <KTooltip text="Last synced 4 minutes ago" side="bottom" :delay="200">
          <span style="cursor: help; font-size: 13px; color: var(--kdl-text-muted); border-bottom: 1px dashed var(--kdl-border);">Sync status</span>
        </KTooltip>

        <KTooltip text="Navigate to the settings page" side="left">
          <button class="btn-ghost btn-sm">Settings</button>
        </KTooltip>
      </div>
    </div>

    <!-- ⑳ KPopover — Reka-based arbitrary-content popover -->
    <div class="klikk-preview-section">
      <span class="label-upper" style="display: block; margin-bottom: 12px;">⑳ KPopover — arbitrary content popover</span>
      <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-start;">
        <KPopover v-model="popoverFilter">
          <template #trigger>
            <button class="btn-ghost btn-sm" :aria-expanded="popoverFilter">
              <!-- Lucide filter -->
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
              Filters
            </button>
          </template>
          <div style="display: flex; flex-direction: column; gap: 10px; min-width: 240px;">
            <p class="label-upper" style="margin: 0; font-size: 10px;">Filter by status</p>
            <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--kdl-text-secondary); cursor: pointer;">
              <input type="checkbox" checked /> Posted
            </label>
            <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--kdl-text-secondary); cursor: pointer;">
              <input type="checkbox" /> Draft
            </label>
            <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--kdl-text-secondary); cursor: pointer;">
              <input type="checkbox" /> Failed
            </label>
            <div style="display: flex; justify-content: flex-end; gap: 6px; padding-top: 6px; border-top: 1px solid var(--kdl-border-subtle);">
              <button class="btn-ghost btn-xs" @click="popoverFilter = false">Reset</button>
              <button class="btn-primary btn-xs" @click="popoverFilter = false">Apply</button>
            </div>
          </div>
        </KPopover>
      </div>
    </div>

    <!-- ㉑ KToast — toast notifications via useToast() -->
    <div class="klikk-preview-section">
      <span class="label-upper" style="display: block; margin-bottom: 12px;">㉑ KToast — toast notification system</span>
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <button class="btn-success btn-sm" @click="toast.success('142 journals posted successfully.')">Success toast</button>
        <button class="btn-danger btn-sm" @click="toast.error('Xero API returned 503 — connection timeout.', { title: 'Connection failed' })">Error toast</button>
        <button class="btn-ghost btn-sm" @click="toast.info('Next sync scheduled for 02:00 SAST.')">Info toast</button>
        <button class="btn-ghost btn-sm" @click="toast.warn('Approaching Xero API rate limit. Slowing requests.', { title: 'Rate limit warning' })">Warning toast</button>
        <button class="btn-ghost btn-sm" @click="toast.success('Copied to clipboard.', { duration: 2000 })">Short (2s)</button>
        <button class="btn-ghost btn-sm" @click="toast.info('This toast stays until dismissed.', { duration: 0 })">Sticky</button>
      </div>
    </div>

    <!-- ㉒ KTable — TanStack Table v8 primitive -->
    <div class="klikk-preview-section">
      <span class="label-upper" style="display: block; margin-bottom: 12px;">㉒ KTable — TanStack Table v8 (sort / filter / pagination / virtual / selectable)</span>

      <!-- A: Client-paginated with sort + filter slots + dense mode -->
      <h3 class="preview-section-h3">A — Client paginated, sort, filter slots, dense mode</h3>
      <p class="preview-variant-label">Small dataset (20 rows). Click headers to sort; shift-click for multi-sort. Filter inputs appear below headers.</p>
      <KTable
        :columns="ktableCols"
        :data="ktableSmallData"
        dense
        pagination="client"
        :pageSize="10"
        :showVisibilityMenu="true"
        @row-click="ktableLastClick = $event"
      >
        <template #filter-account_code="{ column }">
          <input
            class="ktable-demo-filter-input"
            placeholder="Filter code…"
            :value="column.getFilterValue() ?? ''"
            @input="column.setFilterValue($event.target.value || undefined)"
          />
        </template>
        <template #filter-type="{ column }">
          <select
            class="ktable-demo-filter-select"
            :value="column.getFilterValue() ?? ''"
            @change="column.setFilterValue($event.target.value || undefined)"
          >
            <option value="">All</option>
            <option v-for="t in ['Asset', 'Liability', 'Equity', 'Expense', 'Revenue']" :key="t" :value="t">{{ t }}</option>
          </select>
        </template>
        <template #cell-debit="{ value }">
          <span style="font-variant-numeric: tabular-nums;">R {{ Number(value).toLocaleString('en-ZA', { minimumFractionDigits: 2 }) }}</span>
        </template>
      </KTable>
      <p v-if="ktableLastClick" class="preview-variant-label" style="margin-top: 8px;">
        Last row-click: <strong>{{ ktableLastClick.account_code }} — {{ ktableLastClick.account_name }}</strong>
      </p>

      <!-- B: Virtual scroll (1000 rows) -->
      <h3 class="preview-section-h3" style="margin-top: 32px;">B — Virtual scroll (1 000 rows)</h3>
      <p class="preview-variant-label">All 1 000 rows rendered via @tanstack/vue-virtual. Scroll smoothly at any speed.</p>
      <KTable
        :columns="ktableCols"
        :data="ktableBigData"
        pagination="none"
        virtual
        :virtualHeight="400"
      />

      <!-- C: Selectable rows -->
      <h3 class="preview-section-h3" style="margin-top: 32px;">C — Selectable rows</h3>
      <p class="preview-variant-label">Checkbox column + v-model:selectedRowIds. {{ ktableSelected.size }} row(s) selected.</p>
      <KTable
        :columns="ktableCols"
        :data="ktableSmallData"
        selectable
        v-model:selectedRowIds="ktableSelected"
        pagination="client"
        :pageSize="10"
      />
      <p v-if="ktableSelected.size" class="preview-variant-label" style="margin-top: 8px;">
        Selected IDs: {{ [...ktableSelected].join(', ') }}
      </p>

      <!-- D: Loading state -->
      <h3 class="preview-section-h3" style="margin-top: 32px;">D — Loading state</h3>
      <p class="preview-variant-label">Toggle button below to show the loading spinner (no data).</p>
      <div style="display: flex; gap: 8px; margin-bottom: 12px;">
        <button class="btn-ghost btn-sm" @click="ktableLoading = !ktableLoading">
          {{ ktableLoading ? 'Stop loading' : 'Start loading' }}
        </button>
      </div>
      <KTable
        :columns="ktableCols"
        :data="[]"
        :loading="ktableLoading"
        pagination="none"
      />

      <!-- E: Empty state -->
      <h3 class="preview-section-h3" style="margin-top: 32px;">E — Empty state</h3>
      <p class="preview-variant-label">Built-in empty state (no data, no loading).</p>
      <KTable :columns="ktableCols" :data="[]" pagination="none" />

      <!-- F: Error state -->
      <h3 class="preview-section-h3" style="margin-top: 32px;">F — Error state</h3>
      <p class="preview-variant-label">Pass the error prop to render KAlert inside the table.</p>
      <KTable
        :columns="ktableCols"
        :data="[]"
        error="Xero API returned 503 — connection timeout. Check your credentials in Setup."
        pagination="none"
      />
    </div>

    <!-- ⑯ KChip — removable filter pill primitive -->
    <div class="klikk-preview-section">
      <span class="label-upper" style="display: block; margin-bottom: 12px;">⑯ KChip — removable filter pill</span>
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <div>
          <p class="preview-variant-label">Static chips (no icon, no remove)</p>
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <KChip label="Bosch en Dal" />
            <KChip label="Journals" />
            <KChip label="2024-Q1" />
          </div>
        </div>
        <div>
          <p class="preview-variant-label">With leading icon</p>
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <KChip label="Bosch en Dal" icon="building" />
            <KChip label="Active filter" icon="filter" />
            <KChip label="admin@klikk.co.za" icon="user" />
            <KChip label="Jan 2024" icon="calendar" />
          </div>
        </div>
        <div>
          <p class="preview-variant-label">Removable (click × to remove in demo)</p>
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <KChip
              v-for="chip in demoChips"
              :key="chip"
              :label="chip"
              icon="tag"
              removable
              @remove="removeChip(chip)"
            />
            <span v-if="demoChips.length === 0" style="font-size: 12px; color: var(--kdl-text-hint);">All chips removed — reload to reset</span>
          </div>
        </div>
        <div>
          <p class="preview-variant-label">Disabled state</p>
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <KChip label="Cannot remove" removable disabled icon="filter" />
            <KChip label="Read-only tag" disabled />
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useTheme } from '../composables/useTheme';
import KLockup from '../components/klikk/KLockup.vue';
import PageHeader from '../components/klikk/PageHeader.vue';
import SectionCard from '../components/klikk/SectionCard.vue';
import EmptyState from '../components/klikk/EmptyState.vue';
import FilterBar from '../components/klikk/FilterBar.vue';
import ResultPanel from '../components/klikk/ResultPanel.vue';
import KInput from '../components/klikk/KInput.vue';
import KAlert from '../components/klikk/KAlert.vue';
import KTabs from '../components/klikk/KTabs.vue';
import KOperationCard from '../components/klikk/KOperationCard.vue';
import FreshnessChip from '../components/klikk/FreshnessChip.vue';
import StatusPill from '../components/klikk/StatusPill.vue';
import PersistentResultStrip from '../components/klikk/PersistentResultStrip.vue';
import MetricTile from '../components/klikk/MetricTile.vue';
import KSpinner from '../components/klikk/KSpinner.vue';
import KBadge from '../components/klikk/KBadge.vue';
import KChip from '../components/klikk/KChip.vue';
import KDialog from '../components/klikk/KDialog.vue';
import KMenu from '../components/klikk/KMenu.vue';
import KMenuItem from '../components/klikk/KMenuItem.vue';
import KMenuSeparator from '../components/klikk/KMenuSeparator.vue';
import KTooltip from '../components/klikk/KTooltip.vue';
import KPopover from '../components/klikk/KPopover.vue';
import { useToast } from '../composables/useToast.js';
import KTable from '../components/klikk/KTable.vue';
import KSelect from '../components/klikk/KSelect.vue';
import KMultiSelect from '../components/klikk/KMultiSelect.vue';
import KCheckbox from '../components/klikk/KCheckbox.vue';
import KToggle from '../components/klikk/KToggle.vue';
import KRadioGroup from '../components/klikk/KRadioGroup.vue';
import KFile from '../components/klikk/KFile.vue';
import KForm from '../components/klikk/KForm.vue';

const { isDark, toggleTheme } = useTheme();

// ─── FreshnessChip demo state ─────────────────────────────────────────────
const freshnessNow = new Date(Date.now() - 5 * 1000);        // 5 seconds ago → "just now"
const freshness4m  = new Date(Date.now() - 4 * 60 * 1000);   // 4 minutes ago
const freshnessYesterday = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(14, 3, 0, 0);
  return d;
})();

// ─── KOperationCard demo state ────────────────────────────────────────────
// running demo: 4 minutes ago
const demoRunningDate = new Date(Date.now() - 4 * 60 * 1000);
// failed demo: yesterday at 09:12
const demoFailedDate = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(9, 12, 0, 0);
  return d;
})();

// ─── KInput demo state ─────────────────────────────────────────────────────
const demoEmail = ref('');
const demoAmount = ref('');
const demoRef = ref('');
const demoSearch = ref('');
const demoDisabled = ref('');
const demoSuffix = ref('');

// ─── KTabs demo state ──────────────────────────────────────────────────────
const demoTabs = [
  { name: 'overview', label: 'Overview' },
  { name: 'journals', label: 'Journals' },
  { name: 'payments', label: 'Payments' },
  { name: 'reports',  label: 'Reports' },
];

const demoTabsWithIcons = [
  { name: 'summary',   label: 'Summary',   icon: 'layout-dashboard', count: 3 },
  { name: 'detail',    label: 'Detail',    icon: 'list' },
  { name: 'analytics', label: 'Analytics', icon: 'bar-chart' },
  { name: 'settings',  label: 'Settings',  icon: 'settings' },
];

const activePillTab = ref('overview');
const activeIconTab = ref('summary');
const activeUnderlineTab = ref('overview');

// ─── Form primitives demo state (Phase 1.C) ──────────────────────────────
// KInput v2
const demoClearable = ref('');
const demoDebounced = ref('');
const demoNumber = ref(0);

// KSelect
const selectOptions = [
  { value: '1000', label: '1000 — Cash & Cash Equivalents' },
  { value: '1200', label: '1200 — Accounts Receivable' },
  { value: '2000', label: '2000 — Accounts Payable' },
  { value: '4000', label: '4000 — Revenue' },
  { value: '5000', label: '5000 — Operating Expenses' },
];
const demoSelect = ref(null);
const demoSelectError = ref(null);
const demoSelectDisabled = ref('Option A');

// KMultiSelect
const multiSelectOptions = ['Invoices', 'Payments', 'Journals', 'Reconciliations', 'Reports', 'Settings'];
const demoMultiSelect = ref([]);

// KCheckbox + KToggle
const demoCheck1 = ref(true);
const demoCheck2 = ref(false);
const demoCheckDisabled = ref(false);
const demoToggle1 = ref(false);
const demoToggle2 = ref(isDark.value);
const demoToggleDisabled = ref(true);

function onToggleDark(val) {
  demoToggle2.value = val;
  if (val !== isDark.value) toggleTheme();
}

// KRadioGroup
const radioOptions = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual', label: 'Annual' },
];
const demoRadio = ref('monthly');

// KFile
const demoFile = ref(null);
const demoFiles = ref(null);

// KForm
const demoFormEmail = ref('');
const demoFormEntity = ref(null);
const demoFormAgree = ref(false);
const demoFormSubmitted = ref(false);

function onFormSubmit() {
  demoFormSubmitted.value = true;
  setTimeout(() => { demoFormSubmitted.value = false; }, 4000);
}

function resetForm() {
  demoFormEmail.value = '';
  demoFormEntity.value = null;
  demoFormAgree.value = false;
  demoFormSubmitted.value = false;
}

// ─── KChip demo state ─────────────────────────────────────────────────────
const demoChips = ref(['Invoices', 'ZAR only', 'Q1 2024', 'Bosch en Dal']);
function removeChip(chip) {
  demoChips.value = demoChips.value.filter((c) => c !== chip);
}

// ─── KTable demo state ────────────────────────────────────────────────────
const ACCOUNT_TYPES = ['Asset', 'Liability', 'Equity', 'Expense', 'Revenue'];
const PERIODS = ['2024-01', '2024-02', '2024-03', '2024-04', '2024-05', '2024-06'];
const STATUSES = ['active', 'inactive', 'pending'];

function makeRow(i) {
  const type = ACCOUNT_TYPES[i % ACCOUNT_TYPES.length];
  return {
    id: String(i + 1),
    account_code: `${type[0]}${String(i + 1).padStart(3, '0')}`,
    account_name: `${type} Account ${i + 1}`,
    type,
    debit: parseFloat((Math.random() * 50000).toFixed(2)),
    credit: parseFloat((Math.random() * 50000).toFixed(2)),
    period: PERIODS[i % PERIODS.length],
    status: STATUSES[i % STATUSES.length],
  };
}

const ktableSmallData = Array.from({ length: 20 }, (_, i) => makeRow(i));
const ktableBigData = Array.from({ length: 1000 }, (_, i) => makeRow(i));

const ktableCols = [
  { accessorKey: 'account_code', header: 'Code', enableSorting: true, enableColumnFilter: true },
  { accessorKey: 'account_name', header: 'Account Name', enableSorting: true, enableColumnFilter: true },
  { accessorKey: 'type', header: 'Type', enableSorting: true, enableColumnFilter: true },
  { accessorKey: 'debit', header: 'Debit', enableSorting: true },
  { accessorKey: 'credit', header: 'Credit', enableSorting: true },
  { accessorKey: 'period', header: 'Period', enableSorting: true },
  { accessorKey: 'status', header: 'Status', enableSorting: true },
];

const ktableLastClick = ref(null);
const ktableSelected = ref(new Set());
const ktableLoading = ref(false);

// ─── Overlay demo state (Phase 1.B) ──────────────────────────────────────
const dialogSm = ref(false);
const dialogMd = ref(false);
const dialogLg = ref(false);
const menuOpen = ref(false);
const menuOpen2 = ref(false);
const popoverFilter = ref(false);
const toast = useToast();
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
.preview-variant-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--kdl-text-hint);
  margin: 0 0 8px;
}
.preview-tab-content {
  margin-top: 12px;
  padding: 12px;
  border-radius: 8px;
  background: var(--kdl-border-subtle);
  font-size: 13px;
  color: var(--kdl-text-muted);
}

/* FreshnessChip demo */
.preview-chip-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 480px;
}
.preview-chip-row {
  display: flex;
  align-items: center;
  gap: 16px;
}
.preview-chip-label {
  font-size: 12px;
  color: var(--kdl-text-hint);
  width: 160px;
  flex-shrink: 0;
}

/* StatusPill demo */
.preview-pill-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

/* MetricTile demo */
.preview-metric-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
  max-width: 720px;
}

/* KTable demo */
.preview-section-h3 {
  font-size: 13px;
  font-weight: 600;
  color: var(--kdl-text-primary);
  margin: 0 0 6px;
}

.ktable-demo-filter-input,
.ktable-demo-filter-select {
  width: 100%;
  height: 26px;
  padding: 0 6px;
  font-size: 11px;
  font-family: inherit;
  color: var(--kdl-text-primary);
  background: var(--kdl-card-bg);
  border: 1px solid var(--kdl-border);
  border-radius: 5px;
  outline: none;
}

.ktable-demo-filter-input:focus,
.ktable-demo-filter-select:focus {
  border-color: var(--kdl-accent);
  box-shadow: 0 0 0 2px rgba(255, 61, 127, 0.15);
}
</style>
