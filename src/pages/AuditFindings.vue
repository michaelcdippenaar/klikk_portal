<template>
  <AppPage>
    <PageHeader
      title="Findings"
      :subtitle="`Audit findings register — ${fyInView}`"
    >
      <template #actions>
        <button
          class="btn btn-ghost btn-sm"
          :disabled="exporting !== null"
          @click="exportAs('csv')"
        >
          <!-- Lucide download -->
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="mr-1"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          {{ exporting === 'csv' ? 'Exporting…' : 'Export CSV' }}
        </button>
        <button
          class="btn btn-ghost btn-sm"
          :disabled="exporting !== null"
          @click="exportAs('xlsx')"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="mr-1"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          {{ exporting === 'xlsx' ? 'Exporting…' : 'Export XLSX' }}
        </button>
        <button class="btn btn-ghost btn-sm" :disabled="loading" @click="refreshAll">
          <!-- Lucide refresh-cw -->
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="mr-1"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          Refresh
        </button>
      </template>
    </PageHeader>

    <KAlert
      v-if="error"
      variant="error"
      :title="error"
      class="mb-4"
      dismissible
    />
    <KAlert
      v-if="actionError"
      :key="actionErrorSeq"
      variant="error"
      :title="actionError"
      class="mb-4"
      dismissible
    />

    <!-- Summary strip — same filters as the table, so the two always agree -->
    <div v-if="summary" class="af-summary mb-3">
      <div class="af-summary__tiles">
        <MetricTile label="Findings" :value="summary.count ?? 0" />
        <MetricTile label="Total amount" :value="formatAmount(summary.amount) || '—'" />
        <MetricTile
          label="Open"
          :value="summary.open_count ?? 0"
          :tone="Number(summary.open_count) > 0 ? 'warning' : 'default'"
        />
      </div>
      <div class="af-summary__groups">
        <div v-if="(summary.by_severity || []).length" class="af-summary__group">
          <span class="af-summary__group-label">By severity</span>
          <span
            v-for="b in summary.by_severity"
            :key="`sev-${b.key}`"
            :title="`${b.count} finding${b.count === 1 ? '' : 's'} · ${formatAmount(b.amount) || 'no amount'}`"
          >
            <StatusPill :tone="severityTone(b.key)" :label="`${vocabLabel(b.key)} ${b.count}`" size="sm" />
          </span>
        </div>
        <div v-if="(summary.by_status || []).length" class="af-summary__group">
          <span class="af-summary__group-label">By status</span>
          <span
            v-for="b in summary.by_status"
            :key="`st-${b.key}`"
            :title="`${b.count} finding${b.count === 1 ? '' : 's'} · ${formatAmount(b.amount) || 'no amount'}`"
          >
            <StatusPill :tone="statusTone(b.key)" :label="`${vocabLabel(b.key)} ${b.count}`" size="sm" />
          </span>
        </div>
      </div>
    </div>

    <FilterBar class="mb-3">
      <KSelect
        v-model="filters.fy"
        label="Financial year"
        :options="fySelectOptions"
        class="af-filter--fy"
      />
      <KMultiSelect
        v-model="filters.status"
        label="Status"
        placeholder="All statuses"
        :options="STATUS_OPTIONS"
        class="af-filter--multi"
      />
      <KMultiSelect
        v-model="filters.severity"
        label="Severity"
        placeholder="All severities"
        :options="SEVERITY_OPTIONS"
        class="af-filter--multi"
      />
      <KMultiSelect
        v-model="filters.category"
        label="Category"
        placeholder="All categories"
        :options="categoryOptions"
        class="af-filter--multi"
      />
      <KInput
        v-model="filters.owner"
        label="Owner"
        placeholder="e.g. bookkeeper"
        clearable
        :debounce="300"
        class="af-filter--owner"
      />
      <KInput
        v-model="filters.q"
        label="Search"
        placeholder="Ref, title, description, source…"
        clearable
        :debounce="300"
        class="flex-1 min-w-56"
      />
      <button
        class="btn btn-ghost btn-sm af-filter__clear"
        :disabled="!filtersActive"
        @click="clearFilters"
      >
        Clear
      </button>
    </FilterBar>

    <div class="af-count-row mb-2">
      <span class="text-sm text-muted">{{ countLabel }}</span>
      <KBadge
        :label="`Total ${formatAmount(totals.amount) || '—'}`"
        tone="accent"
        size="sm"
      />
      <KBadge
        v-if="filtersActive"
        label="Filtered"
        tone="muted"
        size="sm"
      />
    </div>

    <!-- Bulk action bar — only while a selection exists -->
    <div v-if="!isAuditor && selection.hasSelection.value" class="af-bulk-bar mb-3">
      <strong class="af-bulk-bar__count">{{ selection.count.value }} selected</strong>
      <span v-if="overBulkCap" class="af-bulk-bar__cap">
        Bulk actions are limited to {{ BULK_MAX }} findings per action — narrow the selection.
      </span>

      <span class="af-bulk-bar__spacer" />

      <KMenu v-model="statusMenuOpen">
        <template #trigger>
          <button class="btn btn-ghost btn-sm" :disabled="bulkRunning || overBulkCap">Set status ▾</button>
        </template>
        <KMenuItem
          v-for="opt in STATUS_OPTIONS"
          :key="opt.value"
          :disabled="bulkRunning"
          @select="runBulk({ status: opt.value })"
        >
          {{ opt.label }}
        </KMenuItem>
      </KMenu>

      <button class="btn btn-ghost btn-sm" :disabled="bulkRunning || overBulkCap" @click="bulkOwnerOpen = true">
        Set owner…
      </button>
      <button class="btn btn-ghost btn-sm" :disabled="bulkRunning || overBulkCap" @click="bulkCommentOpen = true">
        Add comment…
      </button>
      <button class="btn btn-ghost btn-sm" :disabled="bulkRunning" @click="selection.clear()">
        Clear selection
      </button>
    </div>

    <SectionCard>
      <EmptyState
        v-if="!loading && !error && rows.length === 0 && filtersActive"
        title="No findings match"
        body="Clear one or more filters to widen the search."
      >
        <template #cta>
          <button class="btn btn-ghost btn-sm" @click="clearFilters">Clear filters</button>
        </template>
      </EmptyState>
      <EmptyState
        v-else-if="!loading && !error && rows.length === 0"
        :title="`No findings recorded for ${fyShort}`"
        body="Findings land here from the internal-audit runs and the MCP audit tools. Pick another financial year above to see earlier registers."
      />
      <KTable
        v-else
        :columns="columns"
        :data="rows"
        :loading="loading"
        dense
        :selectable="!isAuditor"
        resizable
        :columnSizing="colWidths"
        :selectedRowIds="selection.selected.value"
        :sortBy="sortBy"
        pagination="server"
        :pageSize="filters.page_size"
        :pageSizeOptions="PAGE_SIZE_OPTIONS"
        :serverTotal="totals.count"
        :serverPage="filters.page - 1"
        @update:columnSizing="onColWidths"
        @update:selectedRowIds="selection.set"
        @update:sortBy="onSortBy"
        @update:serverPage="onServerPage"
        @update:pageSize="onPageSize"
        @row-click="openDetail"
      >
        <template #cell-ref="{ value }">
          <code class="af-ref">{{ value }}</code>
        </template>

        <template #cell-title="{ value, row }">
          <span class="af-title" :title="row.description || ''">{{ value }}</span>
        </template>

        <template #cell-severity="{ value }">
          <StatusPill :tone="severityTone(value)" :label="vocabLabel(value)" size="sm" />
        </template>

        <template #cell-status="{ value }">
          <StatusPill :tone="statusTone(value)" :label="vocabLabel(value)" size="sm" />
        </template>

        <template #cell-category="{ value }">
          <span :class="value ? '' : 'text-muted'">{{ value || '—' }}</span>
        </template>

        <template #cell-amount="{ value }">
          <span class="af-mono">{{ formatAmount(value) }}</span>
        </template>

        <template #cell-owner="{ value }">
          <span :class="value ? '' : 'text-muted'">{{ value || '—' }}</span>
        </template>

        <template #cell-due_date="{ value }">
          <span :class="value ? '' : 'text-muted'">{{ value || '—' }}</span>
        </template>

        <template #cell-source="{ value }">
          <span class="af-source" :title="value || ''">{{ value || '—' }}</span>
        </template>

        <!-- Same affordance as the receipts register: the icon IS the way to
             read or leave a comment, without opening the detail dialog. -->
        <template #cell-comment_count="{ value, row }">
          <FindingCommentCell
            :ref="(el) => registerCommentCell(row.id, el)"
            :findingId="row.id"
            :count="Number(value) || 0"
            :currentUser="currentUser"
            @added="onInlineComment"
          />
        </template>

        <template #cell-actions="{ row }">
          <!-- @click.stop: none of these may trigger the row's open-detail click -->
          <div class="af-actions" @click.stop>
            <button
              v-if="!isAuditor && row.status !== 'RESOLVED'"
              class="af-action-btn af-action-btn--resolve"
              :disabled="rowBusyId !== null"
              title="Mark resolved"
              @click="setRowStatus(row, 'RESOLVED')"
            >
              <!-- Lucide check -->
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
            </button>
            <button
              v-else-if="!isAuditor"
              class="af-action-btn"
              :disabled="rowBusyId !== null"
              title="Reopen"
              @click="setRowStatus(row, 'OPEN')"
            >
              <!-- Lucide rotate-ccw -->
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
            </button>
            <button
              class="af-action-btn"
              title="Discuss — add a comment"
              @click="discussRow(row)"
            >
              <!-- Lucide message-circle -->
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
            </button>
            <KMenu
              v-if="!isAuditor"
              align="end"
              :modelValue="actionMenuRowId === row.id"
              @update:modelValue="(v) => (actionMenuRowId = v ? row.id : null)"
            >
              <template #trigger>
                <button class="af-action-btn" :disabled="rowBusyId !== null" title="More actions">
                  <!-- Lucide more-horizontal -->
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
                </button>
              </template>
              <KMenuItem
                v-for="opt in STATUS_OPTIONS"
                :key="opt.value"
                :disabled="rowBusyId !== null || row.status === opt.value"
                @select="setRowStatus(row, opt.value)"
              >
                Set {{ opt.label.toLowerCase() }}
              </KMenuItem>
              <KMenuSeparator />
              <KMenuItem @select="discussRow(row)">Discuss…</KMenuItem>
              <KMenuItem @select="openDetail(row)">Open detail</KMenuItem>
            </KMenu>
          </div>
        </template>
      </KTable>
    </SectionCard>

    <!-- Finding detail -->
    <KDialog
      v-model="detailOpen"
      :title="detailTitle"
      :description="detailDescriptionLine"
      size="xl"
    >
      <template v-if="detail">
        <!-- Tabbed so Detail / Cube view / Linked evidence / Attachments don't
             become one unreadable wall. url-sync OFF: the page's filter state
             owns the query string. -->
        <KTabs
          v-model="detailTab"
          :tabs="detailTabs"
          :url-sync="false"
          aria-label="Finding sections"
          class="af-detail-tabs"
        />

        <div v-if="detailTab === 'detail'" class="af-detail">
        <!-- Left: the finding itself -->
        <div class="af-detail__main">
          <div v-if="detailLoading" class="af-detail__loading">
            <KSpinner size="sm" tone="accent" /> Loading detail…
          </div>

          <section class="af-section">
            <h3 class="af-section__heading">Description</h3>
            <p class="af-section__body">{{ detail.description || 'No description recorded.' }}</p>
          </section>

          <section class="af-section">
            <h3 class="af-section__heading">Details</h3>
            <dl class="af-dl">
              <dt>Severity</dt>
              <dd><StatusPill :tone="severityTone(detail.severity)" :label="vocabLabel(detail.severity)" size="sm" /></dd>
              <dt>Category</dt><dd>{{ detail.category || '—' }}</dd>
              <dt>FY</dt><dd>{{ detail.fy || '—' }}</dd>
              <dt>Source</dt><dd>{{ detail.source || '—' }}</dd>
              <dt>Check</dt><dd>{{ detail.check_code || '—' }}</dd>
              <dt>Asana</dt>
              <dd>
                <a
                  v-if="detail.asana_gid"
                  :href="`https://app.asana.com/0/0/${detail.asana_gid}/f`"
                  target="_blank"
                  rel="noopener"
                  class="af-link"
                >Open task</a>
                <span v-else class="text-muted">—</span>
              </dd>
              <dt>Created</dt>
              <dd>{{ formatDateTime(detail.created_at) }}<template v-if="detail.created_by"> by {{ detail.created_by }}</template></dd>
              <dt>Updated</dt>
              <dd>{{ formatDateTime(detail.updated_at) }}<template v-if="detail.updated_by"> by {{ detail.updated_by }}</template></dd>
            </dl>
          </section>

          <section class="af-section">
            <h3 class="af-section__heading">
              Evidence
              <span class="af-section__note">{{ (detail.evidence || []).length }}</span>
            </h3>
            <ul v-if="detail.evidence && detail.evidence.length" class="af-evidence">
              <li v-for="(ev, idx) in detail.evidence" :key="`${idx}-${ev.type}-${ev.ref}`" class="af-evidence__row">
                <KBadge :label="ev.type || 'note'" tone="muted" size="sm" />
                <a
                  v-if="ev.type === 'url' && ev.ref"
                  :href="safeHref(ev.ref)"
                  target="_blank"
                  rel="noopener"
                  class="af-link af-evidence__ref"
                >{{ ev.ref }}</a>
                <code v-else-if="ev.ref" class="af-evidence__ref">{{ ev.ref }}</code>
                <span v-if="ev.note" class="af-evidence__note">{{ ev.note }}</span>
              </li>
            </ul>
            <p v-else-if="!detailLoading" class="af-sub">No evidence recorded.</p>
          </section>

        </div>

        <!-- Right: edit + comments -->
        <div class="af-detail__side">
          <section v-if="!isAuditor" class="af-section">
            <h3 class="af-section__heading">Update</h3>
            <div class="af-edit">
              <KSelect
                v-model="statusDraft"
                label="Status"
                :options="STATUS_OPTIONS"
                :disabled="editSaving"
              />
              <KInput
                v-model="ownerDraft"
                label="Owner"
                placeholder="Who owns the remediation"
                :disabled="editSaving"
              />
              <KInput
                v-model="dueDraft"
                label="Due date"
                type="date"
                :disabled="editSaving"
              />
              <KInput
                v-model="amountDraft"
                label="Amount (ZAR)"
                placeholder="Blank = no amount"
                :disabled="editSaving"
                :error="!amountDraftValid"
                :errorMessage="amountDraftValid ? null : 'Amount must be a number (or blank).'"
              />
              <div class="af-edit__actions">
                <span class="af-sub">
                  <template v-if="detail.updated_at">Last updated {{ formatDateTime(detail.updated_at) }}</template>
                </span>
                <button
                  class="btn btn-primary btn-sm"
                  :disabled="!editDirty || !amountDraftValid || editSaving"
                  @click="saveEdits"
                >
                  {{ editSaving ? 'Saving…' : 'Save changes' }}
                </button>
              </div>
            </div>
          </section>

          <section class="af-section">
            <h3 class="af-section__heading">
              Comments
              <span class="af-section__note">{{ detailComments.length }}</span>
            </h3>
            <!-- The SAME thread component the receipts side and the row
                 popover use, so a reply reads identically everywhere.
                 Auditors may comment (their one permitted write); the Update
                 section above stays hidden for them. -->
            <div class="af-comment-form">
              <CommentThread
                ref="commentBoxRef"
                :comments="detailComments"
                :saving="commentSaving"
                :loading="detailLoading"
                :currentUser="currentUser"
                @post="addComment"
              />
            </div>
          </section>
        </div>
        </div>

        <!-- Cube view — mounted on demand so opening the modal costs nothing extra. -->
        <FindingCubeView
          v-else-if="detailTab === 'cube'"
          :finding-id="detail.id"
        />

        <FindingLinks
          v-else-if="detailTab === 'links'"
          :finding-id="detail.id"
          :links="detailLinks"
          @update:links="onLinksUpdate"
        />

        <FindingAttachments
          v-else-if="detailTab === 'attachments'"
          :finding-id="detail.id"
          :attachments="detailAttachments"
          @update:attachments="onAttachmentsUpdate"
        />
      </template>
    </KDialog>

    <!-- Bulk: set owner -->
    <KDialog
      v-model="bulkOwnerOpen"
      title="Set owner on selection"
      :description="`The owner will be set on ${selection.count.value} selected finding${selection.count.value === 1 ? '' : 's'}. Leave empty to clear the owner.`"
    >
      <KInput
        v-model="bulkOwnerDraft"
        label="Owner"
        placeholder="e.g. bookkeeper, accountant, MC"
        :disabled="bulkRunning"
      />
      <template #footer>
        <button class="btn btn-ghost btn-sm" :disabled="bulkRunning" @click="bulkOwnerOpen = false">
          Cancel
        </button>
        <button class="btn btn-primary btn-sm" :disabled="bulkRunning" @click="submitBulkOwner">
          {{ bulkRunning ? 'Setting…' : 'Set owner' }}
        </button>
      </template>
    </KDialog>

    <!-- Bulk: add comment -->
    <KDialog
      v-model="bulkCommentOpen"
      title="Add comment to selection"
      :description="`The comment will be added to ${selection.count.value} selected finding${selection.count.value === 1 ? '' : 's'}.`"
    >
      <label class="af-field">
        <span class="af-field__label">Comment</span>
        <textarea
          v-model="bulkCommentDraft"
          class="af-textarea"
          rows="3"
          placeholder="Add a comment…"
          :disabled="bulkRunning"
        />
      </label>
      <template #footer>
        <button class="btn btn-ghost btn-sm" :disabled="bulkRunning" @click="bulkCommentOpen = false">
          Cancel
        </button>
        <button
          class="btn btn-primary btn-sm"
          :disabled="!bulkCommentDraft.trim() || bulkRunning"
          @click="submitBulkComment"
        >
          {{ bulkRunning ? 'Adding…' : 'Add' }}
        </button>
      </template>
    </KDialog>
  </AppPage>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  listFindings,
  getFinding,
  updateFinding,
  addFindingComment,
  bulkUpdateFindings,
  findingsSummary,
  exportFindingsUrl,
  BULK_MAX,
} from '../api/findings';
import { currentFy, fyLabel } from '../utils/fy';
import { formatMoney, formatDateTime } from '../utils/receipts';
import AppPage from '../components/shell/AppPage.vue';
import PageHeader from '../components/klikk/PageHeader.vue';
import SectionCard from '../components/klikk/SectionCard.vue';
import EmptyState from '../components/klikk/EmptyState.vue';
import FilterBar from '../components/klikk/FilterBar.vue';
import KAlert from '../components/klikk/KAlert.vue';
import KBadge from '../components/klikk/KBadge.vue';
import KDialog from '../components/klikk/KDialog.vue';
import KInput from '../components/klikk/KInput.vue';
import KMenu from '../components/klikk/KMenu.vue';
import KMenuItem from '../components/klikk/KMenuItem.vue';
import KMenuSeparator from '../components/klikk/KMenuSeparator.vue';
import KMultiSelect from '../components/klikk/KMultiSelect.vue';
import KSelect from '../components/klikk/KSelect.vue';
import KSpinner from '../components/klikk/KSpinner.vue';
import KTable from '../components/klikk/KTable.vue';
import KTabs from '../components/klikk/KTabs.vue';
import MetricTile from '../components/klikk/MetricTile.vue';
import StatusPill from '../components/klikk/StatusPill.vue';
import FindingAttachments from '../components/findings/FindingAttachments.vue';
import FindingCubeView from '../components/findings/FindingCubeView.vue';
import FindingLinks from '../components/findings/FindingLinks.vue';
import FindingCommentCell from '../components/findings/FindingCommentCell.vue';
import CommentThread from '../components/comments/CommentThread.vue';
import { useReceiptSelection } from '../composables/useReceiptSelection';
import { useToast } from '../composables/useToast';
import { useCommentFeed } from '../composables/useCommentFeed';
import { useAuthStore } from '../stores/auth';

const route = useRoute();
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
/** UI-shaping only — the backend middleware enforces read-only for auditors. */
const isAuditor = computed(() => authStore.isAuditor);
// Used to mark your own comments "(you)" and to suppress a toast for a comment
// you just left yourself.
const currentUser = computed(() => authStore.user?.username || '');

// ── Vocabulary (frozen contract) ─────────────────────────────────────────────

const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'ACCEPTED', 'WITHDRAWN'];
/** Categories seen in practice — the field is free text, so the options list
 *  is widened with whatever the summary actually reports (see categoryOptions). */
const KNOWN_CATEGORIES = ['SUP', 'BNK', 'DOC', 'ALC', 'BAL', 'PRC', 'VAT', 'PAYROLL', 'OTHER'];
/** Column ids the API's ?ordering= accepts AND that are visible columns here. */
const SORTABLE_IDS = ['ref', 'title', 'severity', 'status', 'amount', 'due_date'];

const DEFAULT_PAGE_SIZE = 50;
/** 200 is the backend hard ceiling (clamped, not rejected) — never offer more. */
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];
const FY_ALL = 'all';

/** 'IN_PROGRESS' → 'In progress'. */
function vocabLabel(value) {
  const t = String(value || '').replace(/_/g, ' ').toLowerCase();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '—';
}

const STATUS_OPTIONS = STATUSES.map((s) => ({ value: s, label: vocabLabel(s) }));
const SEVERITY_OPTIONS = SEVERITIES.map((s) => ({ value: s, label: vocabLabel(s) }));

function severityTone(severity) {
  switch (String(severity || '').toUpperCase()) {
    case 'CRITICAL':
    case 'HIGH': return 'error';
    case 'MEDIUM': return 'warning';
    case 'LOW': return 'info';
    default: return 'neutral';
  }
}

function statusTone(status) {
  switch (String(status || '').toUpperCase()) {
    case 'OPEN': return 'warning';
    case 'IN_PROGRESS': return 'info';
    case 'RESOLVED': return 'success';
    default: return 'neutral'; // ACCEPTED / WITHDRAWN
  }
}

/** Contract: `amount` is a 2dp string or null. Blank cell when null. */
function formatAmount(value) {
  if (value === null || value === undefined || value === '') return '';
  return formatMoney(value);
}

// ── Filters ⇄ URL ────────────────────────────────────────────────────────────

/**
 * An href that is safe to put in the DOM, or null.
 *
 * Evidence refs are supplied by AGENTS via the MCP tools and by anyone with a
 * service token — they are untrusted input rendered into an auditor-facing page.
 * A ref of `javascript:...` bound straight to :href is a stored XSS vector, so
 * only http(s) and mailto survive; anything else renders as plain text.
 */
function safeHref(ref) {
  const raw = String(ref ?? '').trim();
  if (!raw) return null;
  // Strip control characters first: `java\tscript:` is parsed as javascript: by browsers.
  // Matching control chars IS the point here - they are the bypass, not an accident.
  // eslint-disable-next-line no-control-regex
  const probe = raw.replace(/[\u0000-\u001F\u007F]/g, '').toLowerCase();
  if (probe.startsWith('http://') || probe.startsWith('https://') || probe.startsWith('mailto:')) {
    return raw;
  }
  return null;
}

const DEFAULT_FY = String(currentFy());

function defaultFilters() {
  return {
    fy: DEFAULT_FY,
    status: [],
    severity: [],
    category: [],
    owner: '',
    q: '',
    page: 1,
    page_size: DEFAULT_PAGE_SIZE,
  };
}

function pickString(q, key) {
  const v = q[key];
  if (Array.isArray(v)) return v.length ? String(v[0]) : '';
  return v == null ? '' : String(v);
}

function pickList(q, key, allowed) {
  const raw = pickString(q, key);
  if (!raw) return [];
  const items = raw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  const seen = new Set();
  return items.filter((s) => {
    if (seen.has(s) || (allowed && !allowed.includes(s))) return false;
    seen.add(s);
    return true;
  });
}

/** Read route.query into fresh filter state + sorting. Pure. */
function hydrateFromQuery(q = {}) {
  const f = defaultFilters();
  const fy = pickString(q, 'fy');
  if (fy.toLowerCase() === FY_ALL) f.fy = FY_ALL;
  else if (/^\d{4}$/.test(fy) && Number(fy) >= 2015 && Number(fy) <= 2100) f.fy = fy;
  f.status = pickList(q, 'status', STATUSES);
  f.severity = pickList(q, 'severity', SEVERITIES);
  f.category = pickList(q, 'category', null);
  if (pickString(q, 'owner')) f.owner = pickString(q, 'owner');
  if (pickString(q, 'q')) f.q = pickString(q, 'q');
  const page = Number(pickString(q, 'page'));
  if (Number.isFinite(page) && page > 1) f.page = Math.floor(page);
  const size = Number(pickString(q, 'page_size'));
  if (PAGE_SIZE_OPTIONS.includes(size)) f.page_size = size;

  let sort = [];
  const ordering = pickString(q, 'ordering');
  const match = ordering.match(/^(-?)([a-z_]+)$/);
  if (match && SORTABLE_IDS.includes(match[2])) {
    sort = [{ id: match[2], desc: match[1] === '-' }];
  }
  return { filters: f, sort };
}

const hydrated = hydrateFromQuery(route.query);
const filters = reactive(hydrated.filters);
/** TanStack SortingState [{ id, desc }] — single-column, server-side. */
const sortBy = ref(hydrated.sort);
/** True when the shared link pinned an FY — the first-load FY preselect must not override it. */
const fyPinnedByQuery = Boolean(pickString(route.query, 'fy'));

function orderingParam() {
  const s = sortBy.value?.[0];
  return s ? `${s.desc ? '-' : ''}${s.id}` : '';
}

/**
 * Filter state → API params. `fy` is ALWAYS sent explicitly (never left to
 * the server default) so what the console shows is deterministic and the
 * summary strip is guaranteed to describe the same population as the table.
 */
function buildApiParams({ includePaging = true, includeOrdering = true } = {}) {
  const params = { fy: filters.fy };
  if (filters.status.length) params.status = filters.status.join(',');
  if (filters.severity.length) params.severity = filters.severity.join(',');
  if (filters.category.length) params.category = filters.category.join(',');
  if (filters.owner.trim()) params.owner = filters.owner.trim();
  if (filters.q.trim()) params.q = filters.q.trim();
  if (includeOrdering && orderingParam()) params.ordering = orderingParam();
  if (includePaging) {
    params.page = Number(filters.page) > 0 ? Number(filters.page) : 1;
    params.page_size = Number(filters.page_size) || DEFAULT_PAGE_SIZE;
  }
  return params;
}

/** Serialise state into router.replace() query. fy always present (see above). */
function buildRouteQuery() {
  const query = { fy: filters.fy };
  if (filters.status.length) query.status = filters.status.join(',');
  if (filters.severity.length) query.severity = filters.severity.join(',');
  if (filters.category.length) query.category = filters.category.join(',');
  if (filters.owner.trim()) query.owner = filters.owner.trim();
  if (filters.q.trim()) query.q = filters.q.trim();
  if (orderingParam()) query.ordering = orderingParam();
  if (Number(filters.page) > 1) query.page = String(filters.page);
  if (Number(filters.page_size) && Number(filters.page_size) !== DEFAULT_PAGE_SIZE) {
    query.page_size = String(filters.page_size);
  }
  return query;
}

function syncRoute() {
  router.replace({ query: buildRouteQuery() });
}

const filtersActive = computed(() =>
  filters.status.length > 0
  || filters.severity.length > 0
  || filters.category.length > 0
  || filters.owner.trim() !== ''
  || filters.q.trim() !== '',
);

function clearFilters() {
  const d = defaultFilters();
  filters.status = d.status;
  filters.severity = d.severity;
  filters.category = d.category;
  filters.owner = d.owner;
  filters.q = d.q;
}

// ── List state ───────────────────────────────────────────────────────────────

const rows = ref([]);
const totals = reactive({ count: 0, amount: null });
const loading = ref(false);
const error = ref(null);
const actionError = ref(null);
const actionErrorSeq = ref(0);
const exporting = ref(null);

const ALL_COLUMNS = [
  { accessorKey: 'ref', header: 'Ref', enableSorting: true, meta: { width: '96px' } },
  { accessorKey: 'title', header: 'Title', enableSorting: true },
  { accessorKey: 'severity', header: 'Severity', enableSorting: true, meta: { width: '110px' } },
  { accessorKey: 'status', header: 'Status', enableSorting: true, meta: { width: '128px' } },
  { accessorKey: 'category', header: 'Category', enableSorting: false, meta: { width: '100px' } },
  { accessorKey: 'amount', header: 'Amount', enableSorting: true, meta: { align: 'right', width: '130px' } },
  { accessorKey: 'owner', header: 'Owner', enableSorting: false, meta: { width: '120px' } },
  { accessorKey: 'due_date', header: 'Due', enableSorting: true, meta: { width: '104px' } },
  { accessorKey: 'source', header: 'Source', enableSorting: false, meta: { width: '170px' } },
  { accessorKey: 'comment_count', header: 'Comments', enableSorting: false, meta: { align: 'center', width: '90px' } },
  // Display-only quick-action column — no accessorKey, rendered via #cell-actions.
  { id: 'actions', header: '', enableSorting: false, enableResizing: false, meta: { align: 'right', width: '108px' } },
];

// Auditors keep the quick-action column, but it holds ONLY "Discuss" — the
// status buttons and the ⋯ menu are gated in the #cell-actions template. Their
// one permitted write is a comment (server-side: AuditorGateMiddleware).
const columns = computed(() => ALL_COLUMNS);

// ── Column widths (drag-to-resize, persisted per browser) ────────────────────

const COL_WIDTHS_KEY = 'klikk.audit-findings.col-widths';

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

const countLabel = computed(() => {
  if (loading.value && !rows.value.length) return 'Loading findings…';
  const total = Number(totals.count) || 0;
  if (!total) return 'No findings';
  const start = (filters.page - 1) * filters.page_size + 1;
  const end = Math.min(filters.page * filters.page_size, total);
  return `Showing ${start}–${end} of ${total} finding${total === 1 ? '' : 's'}`;
});

const fyShort = computed(() => (filters.fy === FY_ALL ? 'any financial year' : `FY${filters.fy}`));
const fyInView = computed(() => (filters.fy === FY_ALL ? 'all financial years' : fyLabel(filters.fy)));

// KAlert hides itself on dismiss; bump the key so a new error re-mounts it.
function raiseActionError(message) {
  actionError.value = message;
  actionErrorSeq.value += 1;
}

/** 401 must read as an auth problem, not a mysteriously empty table. */
function describeError(err, fallback) {
  if (err?.response?.status === 401) {
    return 'Not authenticated — your session has expired. Sign in again to load findings.';
  }
  const detail = err?.response?.data?.detail;
  return detail ? `${fallback} — ${detail}` : fallback;
}

// ── Fetch ────────────────────────────────────────────────────────────────────

let requestSeq = 0;

async function load() {
  const seq = ++requestSeq;
  loading.value = true;
  error.value = null;
  try {
    const data = await listFindings(buildApiParams());
    if (seq !== requestSeq) return; // stale response
    rows.value = Array.isArray(data?.results) ? data.results : [];
    totals.count = Number(data?.totals?.count ?? data?.count ?? rows.value.length) || 0;
    totals.amount = data?.totals?.amount ?? null;
    // Clamp page if the server says we're past the end (a filter shrank the set).
    const numPages = Number(data?.num_pages) || 1;
    if (filters.page > numPages && numPages >= 1) filters.page = numPages;
  } catch (err) {
    if (seq !== requestSeq) return;
    error.value = describeError(err, 'Could not load the findings register.');
    console.error(err);
  } finally {
    if (seq === requestSeq) loading.value = false;
  }
}

// ── Summary strip ────────────────────────────────────────────────────────────

const summary = ref(null);
/** Kept across summary reloads so the FY select never collapses mid-flight. */
const fyOptions = ref([Number(DEFAULT_FY)]);

let summarySeq = 0;

async function loadSummary() {
  const seq = ++summarySeq;
  try {
    const data = await findingsSummary(buildApiParams({ includePaging: false, includeOrdering: false }));
    if (seq !== summarySeq) return;
    summary.value = data || null;
    if (Array.isArray(data?.fy_options) && data.fy_options.length) {
      fyOptions.value = data.fy_options.map(Number).filter(Number.isFinite);
    }
  } catch (err) {
    if (seq !== summarySeq) return;
    // The table's own error banner covers the failure mode; don't double-report.
    summary.value = null;
    console.error(err);
  }
}

const fySelectOptions = computed(() => {
  const seen = new Set();
  const years = [...fyOptions.value];
  if (filters.fy !== FY_ALL && /^\d{4}$/.test(filters.fy)) years.push(Number(filters.fy));
  const opts = years
    .filter((y) => Number.isFinite(y) && !seen.has(y) && seen.add(y))
    .sort((a, b) => b - a)
    .map((y) => ({ value: String(y), label: fyLabel(y) }));
  return [...opts, { value: FY_ALL, label: 'All years' }];
});

const categoryOptions = computed(() => {
  const set = new Set(KNOWN_CATEGORIES);
  for (const b of summary.value?.by_category || []) if (b.key) set.add(String(b.key).toUpperCase());
  for (const c of filters.category) set.add(c);
  return [...set].sort();
});

// ── Load orchestration ───────────────────────────────────────────────────────

const ready = ref(false);

function refreshAll() {
  return Promise.all([load(), loadSummary()]);
}

// Non-paging filter change → back to page 1, refetch table + summary, sync URL.
const filterSignature = computed(() =>
  JSON.stringify(buildApiParams({ includePaging: false, includeOrdering: false })));

watch(filterSignature, () => {
  if (!ready.value) return;
  filters.page = 1;
  refreshAll();
  syncRoute();
});

// Page change → refetch table only (summary is page-independent).
watch(() => [filters.page, filters.page_size], () => {
  if (!ready.value) return;
  load();
  syncRoute();
});

function onSortBy(next) {
  // Single-column server sorting; the API silently ignores unknown orderings
  // but we never send one — only sortable columns can emit here.
  sortBy.value = Array.isArray(next) ? next.slice(0, 1) : [];
  if (!ready.value) return;
  filters.page = 1;
  load();
  syncRoute();
}

function onServerPage(zeroBased) {
  filters.page = Number(zeroBased) + 1;
}

function onPageSize(size) {
  const next = Number(size);
  if (!PAGE_SIZE_OPTIONS.includes(next) || next === filters.page_size) return;
  filters.page_size = next;
  filters.page = 1;
}

onMounted(async () => {
  // First-load UX rule (console-side only — the API default is never changed):
  // when the URL didn't pin an FY and the current FY has zero findings but an
  // earlier FY has some, pre-select the most recent FY that HAS findings.
  if (!fyPinnedByQuery && filters.fy === DEFAULT_FY && !filtersActive.value) {
    try {
      const probe = await findingsSummary({ fy: filters.fy });
      if (Number(probe?.count) === 0 && Array.isArray(probe?.fy_options)) {
        // fy_options = FYs that have findings, unioned with the (possibly
        // empty) current FY — so every OTHER year in it has ≥1 finding.
        const withFindings = probe.fy_options
          .map(Number)
          .filter((y) => Number.isFinite(y) && String(y) !== filters.fy);
        if (withFindings.length) filters.fy = String(Math.max(...withFindings));
      }
    } catch (err) {
      // Non-fatal — refreshAll() below surfaces any real API problem.
      console.error(err);
    }
  }
  ready.value = true;
  refreshAll();
  syncRoute();
});

// ── Bulk selection + actions ─────────────────────────────────────────────────

// Selection survives page changes, resets on any real filter change.
const selection = useReceiptSelection(filterSignature);
const overBulkCap = computed(() => selection.count.value > BULK_MAX);

const bulkRunning = ref(false);
const statusMenuOpen = ref(false);
const bulkOwnerOpen = ref(false);
const bulkOwnerDraft = ref('');
const bulkCommentOpen = ref(false);
const bulkCommentDraft = ref('');

async function runBulk(actions) {
  if (bulkRunning.value || !selection.hasSelection.value || overBulkCap.value) return false;
  bulkRunning.value = true;
  actionError.value = null;
  try {
    const ids = [...selection.selected.value].map(Number);
    const res = await bulkUpdateFindings({ ids, ...actions });
    const parts = [];
    if (res.updated) parts.push(`Updated ${res.updated} finding${res.updated === 1 ? '' : 's'}`);
    if (res.commented) parts.push(`Added ${res.commented} comment${res.commented === 1 ? '' : 's'}`);
    toast.success(parts.length ? parts.join(' · ') : 'No findings were changed.');
    if (Array.isArray(res.unknown) && res.unknown.length) {
      toast.warn(`${res.unknown.length} selected finding${res.unknown.length === 1 ? ' was' : 's were'} not recognised by the server.`);
    }
    // Resync server truth (status changes move summary buckets). Selection is
    // KEPT so actions can be chained; there is an explicit clear button.
    await refreshAll();
    return true;
  } catch (err) {
    raiseActionError(describeError(err, 'Bulk update failed'));
    console.error(err);
    return false;
  } finally {
    bulkRunning.value = false;
  }
}

async function submitBulkOwner() {
  const ok = await runBulk({ owner: bulkOwnerDraft.value.trim() });
  if (ok) {
    bulkOwnerDraft.value = '';
    bulkOwnerOpen.value = false;
  }
}

async function submitBulkComment() {
  const text = bulkCommentDraft.value.trim();
  if (!text) return;
  const ok = await runBulk({ comment: text });
  if (ok) {
    bulkCommentDraft.value = '';
    bulkCommentOpen.value = false;
  }
}

// ── Per-row quick actions ────────────────────────────────────────────────────

/** Finding id with a PATCH in flight — all quick-action buttons disable while set. */
const rowBusyId = ref(null);
/** Finding id whose ⋯ menu is open (one menu at a time). */
const actionMenuRowId = ref(null);

async function setRowStatus(row, status) {
  if (!row || row.id == null || row.status === status || rowBusyId.value !== null) return;
  rowBusyId.value = row.id;
  actionError.value = null;
  try {
    const updated = await updateFinding(row.id, { status });
    applyFindingLocally(updated);
    toast.success(`${row.ref || 'Finding'} → ${vocabLabel(status)}`);
    // Status changes move the summary buckets, and with a status filter active
    // the row may rightly drop out of the table — resync server truth.
    await refreshAll();
  } catch (err) {
    raiseActionError(describeError(err, 'Updating the finding status failed'));
    console.error(err);
  } finally {
    rowBusyId.value = null;
  }
}

/** Open the detail dialog straight into the comment box. */
function discussRow(row) {
  openDetail(row);
  nextTick(() => {
    requestAnimationFrame(() => commentBoxRef.value?.focus());
  });
}

// ── Detail dialog ────────────────────────────────────────────────────────────

const detailOpen = ref(false);
const detail = ref(null);
const detailComments = ref([]);
const detailAttachments = ref([]);
const detailLinks = ref([]);
const detailLoading = ref(false);
const detailTab = ref('detail');

const detailTabs = computed(() => [
  { name: 'detail', label: 'Detail', count: detailComments.value.length || null },
  { name: 'cube', label: 'Cube view' },
  { name: 'links', label: 'Linked evidence', count: detailLinks.value.length || null },
  { name: 'attachments', label: 'Attachments', count: detailAttachments.value.length || null },
]);

const statusDraft = ref('OPEN');
const ownerDraft = ref('');
const dueDraft = ref('');
const amountDraft = ref('');
const editSaving = ref(false);
const commentSaving = ref(false);
// The thread component owns the draft; this ref exists so "Discuss" can focus
// its composer and so a successful post can clear it.
const commentBoxRef = ref(null);

const detailTitle = computed(() => (detail.value ? `${detail.value.ref} — ${detail.value.title}` : ''));
const detailDescriptionLine = computed(() => {
  if (!detail.value) return '';
  const d = detail.value;
  return [vocabLabel(d.severity), vocabLabel(d.status), d.category, d.fy ? `FY${d.fy}` : '']
    .filter(Boolean)
    .join(' · ');
});

const amountDraftValid = computed(() => {
  const s = String(amountDraft.value ?? '').trim();
  return s === '' || Number.isFinite(Number(s));
});

/** Normalise for dirty-compare — the API's "429110.39" equals a typed "429110.390". */
function normAmount(v) {
  const s = v == null ? '' : String(v).trim();
  if (s === '') return '';
  const n = Number(s);
  return Number.isFinite(n) ? n.toFixed(2) : s;
}

const editDirty = computed(() => {
  const d = detail.value;
  if (!d) return false;
  return statusDraft.value !== (d.status || '')
    || ownerDraft.value !== (d.owner || '')
    || dueDraft.value !== (d.due_date || '')
    || normAmount(amountDraft.value) !== normAmount(d.amount);
});

function syncDraftsFromDetail() {
  const d = detail.value || {};
  statusDraft.value = d.status || 'OPEN';
  ownerDraft.value = d.owner || '';
  dueDraft.value = d.due_date || '';
  amountDraft.value = d.amount == null ? '' : String(d.amount);
}

async function openDetail(row) {
  if (!row || row.id == null) return;
  detail.value = { ...row };
  detailComments.value = [];
  detailAttachments.value = [];
  detailLinks.value = [];
  detailTab.value = 'detail';
  syncDraftsFromDetail();
  detailOpen.value = true;
  detailLoading.value = true;
  try {
    const payload = await getFinding(row.id);
    if (detail.value && detail.value.id === row.id) {
      // Contract shape: { finding, comments, attachments, links } — `links`
      // arrives with the linked-evidence endpoints; tolerate its absence.
      const finding = payload?.finding && typeof payload.finding === 'object' ? payload.finding : payload;
      detail.value = { ...detail.value, ...finding };
      detailComments.value = Array.isArray(payload?.comments) ? payload.comments : [];
      detailAttachments.value = Array.isArray(payload?.attachments) ? payload.attachments : [];
      detailLinks.value = Array.isArray(payload?.links) ? payload.links : [];
      syncDraftsFromDetail();
    }
  } catch (err) {
    raiseActionError(describeError(err, 'Could not load the full finding detail — showing the list row only'));
    console.error(err);
  } finally {
    detailLoading.value = false;
  }
}

function applyFindingLocally(finding) {
  if (!finding || finding.id == null) return;
  rows.value = rows.value.map((r) => (r.id === finding.id ? { ...r, ...finding } : r));
  if (detail.value && detail.value.id === finding.id) {
    detail.value = { ...detail.value, ...finding };
  }
}

async function saveEdits() {
  const d = detail.value;
  if (!d || !editDirty.value || !amountDraftValid.value) return;
  const body = {};
  if (statusDraft.value !== (d.status || '')) body.status = statusDraft.value;
  if (ownerDraft.value !== (d.owner || '')) body.owner = ownerDraft.value;
  if (dueDraft.value !== (d.due_date || '')) body.due_date = dueDraft.value || null;
  if (normAmount(amountDraft.value) !== normAmount(d.amount)) {
    const s = String(amountDraft.value ?? '').trim();
    body.amount = s === '' ? null : s;
  }
  if (!Object.keys(body).length) return;
  editSaving.value = true;
  actionError.value = null;
  try {
    const updated = await updateFinding(d.id, body);
    applyFindingLocally(updated);
    syncDraftsFromDetail();
    // Status / amount changes move the summary buckets and the filter totals.
    await refreshAll();
  } catch (err) {
    raiseActionError(describeError(err, 'Saving the finding failed'));
    console.error(err);
  } finally {
    editSaving.value = false;
  }
}

async function addComment({ text, parentId = null } = {}) {
  const d = detail.value;
  if (!d) return;
  const body = String(text || '').trim();
  if (!body) return;
  commentSaving.value = true;
  actionError.value = null;
  try {
    // A top-level post keeps the original two-argument call, so the request is
    // byte-identical to what shipped before threading.
    const created = parentId == null
      ? await addFindingComment(d.id, body)
      : await addFindingComment(d.id, body, { parentId });
    if (detail.value && detail.value.id === d.id) {
      detailComments.value = [...detailComments.value, created];
      detail.value = { ...detail.value, comment_count: detailComments.value.length };
    }
    rows.value = rows.value.map((r) =>
      r.id === d.id ? { ...r, comment_count: (Number(r.comment_count) || 0) + 1 } : r,
    );
    // Only on success — a failed post keeps the draft so it can be retried.
    commentBoxRef.value?.clearDraft?.();
  } catch (err) {
    raiseActionError(describeError(err, 'Posting the comment failed'));
    console.error(err);
  } finally {
    commentSaving.value = false;
  }
}

// ── Live comment feed ────────────────────────────────────────────────────────
// Comments other people leave surface within one poll interval (5s) instead of
// being missed until someone happens to reload. Row badges bump, an open
// thread appends in place, and anything that is not yours raises a toast.

const commentCells = new Map();

function registerCommentCell(id, el) {
  if (el) commentCells.set(String(id), el);
  else commentCells.delete(String(id));
}

function onInlineComment({ findingId }) {
  rows.value = rows.value.map((r) =>
    String(r.id) === String(findingId)
      ? { ...r, comment_count: (Number(r.comment_count) || 0) + 1 }
      : r,
  );
}

function applyFeedEvents(events) {
  const bumped = new Map();
  for (const event of events) {
    const id = String(event.object_id);
    bumped.set(id, (bumped.get(id) || 0) + 1);
    // De-dupe by id: your own POST already appended it locally.
    commentCells.get(id)?.mergeComment?.(event.comment);
    if (detail.value && String(detail.value.id) === id) {
      const known = detailComments.value.some(
        (c) => String(c.id) === String(event.comment?.id),
      );
      if (!known && event.comment) {
        detailComments.value = [...detailComments.value, event.comment];
      }
    }
  }
  // The register itself is NOT refetched: server totals are unaffected by a
  // comment, and a reload mid-triage would move rows under the user.
  rows.value = rows.value.map((r) => {
    const extra = bumped.get(String(r.id));
    return extra ? { ...r, comment_count: (Number(r.comment_count) || 0) + extra } : r;
  });
  if (detail.value) {
    const extra = bumped.get(String(detail.value.id));
    if (extra) {
      detail.value = { ...detail.value, comment_count: detailComments.value.length };
    }
  }
}

useCommentFeed({
  kind: 'finding',
  onEvents: applyFeedEvents,
  currentUser: () => currentUser.value,
});

watch(detailOpen, (open) => {
  if (!open) {
    detail.value = null;
    detailComments.value = [];
    detailAttachments.value = [];
    detailLinks.value = [];
    detailTab.value = 'detail';
    detailLoading.value = false;
  }
});

/** The Attachments tab owns uploads/deletes; mirror the count everywhere. */
function onAttachmentsUpdate(list) {
  detailAttachments.value = Array.isArray(list) ? list : [];
  const id = detail.value?.id;
  if (id == null) return;
  const count = detailAttachments.value.length;
  detail.value = { ...detail.value, attachment_count: count };
  rows.value = rows.value.map((r) => (r.id === id ? { ...r, attachment_count: count } : r));
}

/** The Linked-evidence tab owns attach/unlink; mirror link_count where present. */
function onLinksUpdate(list) {
  detailLinks.value = Array.isArray(list) ? list : [];
  const id = detail.value?.id;
  if (id == null) return;
  const count = detailLinks.value.length;
  detail.value = { ...detail.value, link_count: count };
  rows.value = rows.value.map((r) => (r.id === id ? { ...r, link_count: count } : r));
}

// ── Export ───────────────────────────────────────────────────────────────────

async function exportAs(format) {
  exporting.value = format;
  actionError.value = null;
  try {
    await exportFindingsUrl(buildApiParams({ includePaging: false }), format);
  } catch (err) {
    raiseActionError(`Export (${format.toUpperCase()}) failed.`);
    console.error(err);
  } finally {
    exporting.value = null;
  }
}
</script>

<style scoped>
.af-count-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ── Summary strip ──────────────────────────────────────────────────────── */
.af-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: 12px;
}

.af-summary__tiles {
  display: grid;
  grid-template-columns: repeat(3, minmax(120px, max-content));
  gap: 12px;
}

.af-summary__groups {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--kdl-border-subtle, var(--kdl-border));
  border-radius: 10px;
  min-width: 0;
}

.af-summary__group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.af-summary__group-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--kdl-text-muted);
  margin-right: 4px;
}

/* ── Filters ────────────────────────────────────────────────────────────── */
.af-filter--fy    { flex: 0 1 230px; min-width: 200px; }
.af-filter--multi { flex: 0 1 190px; min-width: 160px; }
.af-filter--owner { flex: 0 1 160px; min-width: 140px; }
.af-filter__clear { align-self: flex-end; }

/* ── Bulk action bar ────────────────────────────────────────────────────── */
.af-bulk-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--kdl-border);
  border-radius: 10px;
  background: var(--kdl-raised-bg);
}

.af-bulk-bar__count {
  font-size: 13px;
  color: var(--kdl-text-primary);
}

.af-bulk-bar__cap {
  font-size: 12px;
  color: var(--kdl-text-muted);
}

.af-bulk-bar__spacer {
  flex: 1 1 auto;
}

/* ── Table cells ────────────────────────────────────────────────────────── */
.af-ref {
  font-family: var(--kdl-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.af-mono {
  font-family: var(--kdl-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-variant-numeric: tabular-nums;
}

.af-title,
.af-source {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Row quick actions ──────────────────────────────────────────────────── */
.af-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
}

.af-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--kdl-text-muted);
  cursor: pointer;
}

.af-action-btn:hover:not(:disabled) {
  background: var(--kdl-hover-bg);
  color: var(--kdl-text-primary);
}

.af-action-btn:focus-visible {
  outline: 2px solid var(--kdl-accent);
  outline-offset: -1px;
}

.af-action-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.af-action-btn--resolve:hover:not(:disabled) {
  color: var(--kdl-success);
}

.af-sub {
  display: block;
  font-size: 11px;
  line-height: 1.3;
  color: var(--kdl-text-muted);
}

.af-link {
  color: var(--kdl-accent);
  text-decoration: underline;
  text-underline-offset: 2px;
  overflow-wrap: anywhere;
}

/* ── Detail dialog ──────────────────────────────────────────────────────── */
.af-detail-tabs {
  margin-bottom: 14px;
}

.af-detail {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 20px;
  min-height: 360px;
}

@media (max-width: 840px) {
  .af-detail {
    grid-template-columns: 1fr;
  }
}

.af-detail__main,
.af-detail__side {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.af-detail__loading {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--kdl-text-muted);
}

.af-section__heading {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--kdl-text-secondary);
  margin-bottom: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--kdl-border-subtle, var(--kdl-border));
}

.af-section__note {
  margin-left: 6px;
  font-weight: 400;
  opacity: 0.7;
}

.af-section__body {
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-wrap;
  margin: 0;
}

.af-dl {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  gap: 4px 10px;
  font-size: 13px;
  margin: 0;
}

.af-dl dt {
  color: var(--kdl-text-muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  line-height: 1.6;
}

.af-dl dd {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}

.af-evidence {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}

.af-evidence__row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
}

.af-evidence__ref {
  font-family: var(--kdl-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.af-evidence__note {
  color: var(--kdl-text-secondary);
  min-width: 0;
}

/* ── Edit + comments ────────────────────────────────────────────────────── */
.af-edit {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.af-edit__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.af-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.af-field__label {
  font-size: 12px;
  font-weight: 500;
  color: var(--kdl-text-secondary);
}

.af-textarea {
  width: 100%;
  font: inherit;
  font-size: 13px;
  line-height: 1.45;
  padding: 8px 10px;
  border: 1px solid var(--kdl-border);
  border-radius: 6px;
  background: var(--kdl-card-bg);
  color: var(--kdl-text-primary);
  resize: vertical;
}

.af-textarea:focus-visible {
  outline: 2px solid var(--kdl-accent);
  outline-offset: -1px;
}

.af-textarea:disabled {
  opacity: 0.6;
}

.af-comments {
  list-style: none;
  margin: 0 0 10px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 260px;
  overflow-y: auto;
}

.af-comment {
  padding: 8px 10px;
  border: 1px solid var(--kdl-border-subtle, var(--kdl-border));
  border-radius: 6px;
  background: var(--kdl-surface-sunken, var(--kdl-hover-bg));
}

.af-comment__meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 2px;
}

.af-comment__author {
  font-size: 12px;
  font-weight: 600;
}

.af-comment__text {
  font-size: 13px;
  line-height: 1.45;
  white-space: pre-wrap;
  margin: 0;
}

.af-comment-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
</style>
