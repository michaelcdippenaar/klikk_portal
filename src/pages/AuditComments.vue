<template>
  <AppPage>
    <PageHeader
      title="Cell comments"
      subtitle="Notes pinned to figures in Excel — by MC and by the agents — and the transactions behind them"
    >
      <template #actions>
        <button class="btn btn-ghost btn-sm" :disabled="loading" @click="load">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="mr-1"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          Refresh
        </button>
      </template>
    </PageHeader>

    <KAlert v-if="error" variant="error" :title="error" class="mb-4" dismissible />
    <KAlert v-if="actionError" variant="error" :title="actionError" class="mb-4" dismissible />

    <!-- Undo. Marking a comment actioned removes it from an "open" list, which
         is correct but leaves no way back from where the user is standing --
         they would have to know to change the status filter first. -->
    <div v-if="!isAuditor && undo" class="cc-undo">
      <span>Marked <strong>{{ undo.status }}</strong>: "{{ undo.excerpt }}"</span>
      <button class="btn btn-ghost btn-sm" :disabled="undoBusy" @click="undoLast">
        {{ undoBusy ? 'Undoing…' : 'Undo' }}
      </button>
      <button class="btn btn-ghost btn-sm" @click="undo = null" aria-label="Dismiss">&times;</button>
    </div>

    <FilterBar class="mb-3">
      <KSelect
        v-model="filters.status"
        label="Status"
        :options="STATUS_OPTIONS"
        class="min-w-40"
      />
      <KSelect
        v-model="filters.subject_type"
        label="Kind"
        :options="KIND_OPTIONS"
        class="min-w-40"
      />
      <KSelect
        v-model="filters.decision"
        label="Verdict"
        :options="DECISION_OPTIONS"
        class="min-w-44"
      />
      <KSelect
        v-model="filters.author"
        label="Author"
        :options="authorOptions"
        class="min-w-48"
      />
      <KSelect
        v-model="filters.assignee"
        label="Assigned to"
        :options="assigneeOptions"
        class="min-w-48"
      />
      <KInput
        v-model="filters.q"
        label="Search"
        placeholder="Comment text, account, supplier…"
        clearable
        :debounce="300"
        class="flex-1 min-w-56"
      />
    </FilterBar>

    <!-- Bulk assign. Reviewing the register means spotting a run of points
         that all belong to the same person, and re-picking a seat forty times
         is not what that moment needs. Hidden for an auditor: the assign
         endpoint sits under /xero/data/, which 403s for that role, so the
         control would only ever produce an error. -->
    <div v-if="!isAuditor && selectedCount" class="cc-bulk" data-test="cc-bulk">
      <span><strong>{{ selectedCount }}</strong> selected</span>
      <label class="cc-bulk__field">
        <span>Assign to</span>
        <select v-model="bulkHandle" :disabled="bulkBusy" data-test="cc-bulk-handle">
          <option v-for="o in assignOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
      </label>
      <button
        class="btn btn-ghost btn-sm"
        :disabled="bulkBusy"
        data-test="cc-bulk-apply"
        @click="assignSelected"
      >{{ bulkBusy ? `Assigning… ${bulkDone}/${selectedCount}` : 'Assign' }}</button>
      <button class="btn btn-ghost btn-sm" :disabled="bulkBusy" @click="clearSelection">Clear</button>
    </div>

    <!-- What a bulk run ACTUALLY did. One call per comment, so a run can
         partly succeed, and reporting "42 assigned" when nine were refused
         would be a lie the register would then quietly disagree with. Each
         failure is named, with the server's own words for why. -->
    <div
      v-if="bulkResult"
      class="cc-bulk-result"
      :class="{ 'cc-bulk-result--bad': bulkResult.failed.length }"
      data-test="cc-bulk-result"
      role="status"
    >
      <p class="cc-bulk-result__head">
        {{ bulkResult.assigned }} of {{ bulkResult.attempted }}
        {{ bulkResult.handle ? `assigned to ${bulkResult.handleLabel}` : 'unassigned' }}<template
          v-if="bulkResult.failed.length"
        >, {{ bulkResult.failed.length }} refused</template>.
      </p>
      <ul v-if="bulkResult.failed.length" class="cc-bulk-result__list">
        <li v-for="f in bulkResult.failed" :key="f.id" data-test="cc-bulk-failure">
          <strong>{{ f.label }}</strong> — {{ f.error }}
        </li>
      </ul>
      <p v-if="bulkResult.failed.length" class="cc-bulk-result__note">
        The ones that failed are still selected, so a retry is one click.
      </p>
      <button class="btn btn-ghost btn-sm" @click="bulkResult = null" aria-label="Dismiss">&times;</button>
    </div>

    <SectionCard>
      <KSpinner v-if="loading && !rows.length" size="sm" tone="accent" />
      <EmptyState
        v-else-if="!loading && !error && rows.length === 0"
        title="Nothing here"
        :body="emptyBody"
      />
      <template v-else>
      <div v-if="!isAuditor" class="cc-selectall">
        <label>
          <input
            type="checkbox"
            :checked="allShownSelected"
            data-test="cc-select-all"
            @change="toggleSelectAll"
          />
          Select all {{ rows.length }} shown
        </label>
      </div>

      <div class="cc-list">
        <article v-for="row in rows" :key="row.id" class="cc">
          <!-- 1. IDENTITY — deliberately recessive.
               Who wrote it and when is context, not the point of the card, so
               it sits at overline/caption weight with the status badge as the
               only colour in the line.
               The action buttons that used to live here have moved to the
               footer: "who said this" and "what do I do about it" are two
               different questions and were reading as one crowded row. -->
          <header class="cc__meta">
            <input
              v-if="!isAuditor"
              type="checkbox"
              class="cc__pick"
              :checked="selected.has(row.id)"
              :aria-label="`Select for bulk assign: ${rowLabel(row)}`"
              :data-test="`cc-pick-${row.id}`"
              @change="toggleSelected(row)"
            />
            <KBadge :tone="row.status === 'open' ? 'accent' : 'muted'">
              {{ row.status }}
            </KBadge>
            <span class="cc__author">{{ row.author || 'unattributed' }}</span>
            <span class="cc__when" :title="row.updated_at || ''">{{ formatWhen(row.updated_at) }}</span>
            <KBadge v-if="row.subject_type !== 'cube_cell'" tone="muted">
              {{ kindLabel(row.subject_type) }}
            </KBadge>
          </header>

          <!-- 2. THE ANCHOR HEADLINE — what the note is about, and the figure
               it was written against, on one line. The value used to be a
               12px chip buried at the end of the coordinate run, which is the
               wrong weight for the number the whole comment is arguing about. -->
          <div v-if="row.subject_label || row.cell_value !== null && row.cell_value !== undefined"
               class="cc__anchor">
            <h3 v-if="row.subject_label" class="cc__subject">{{ row.subject_label }}</h3>
            <span v-if="row.cell_value !== null && row.cell_value !== undefined"
                  class="cc__amount"
                  :data-test="`cc-amount-${row.id}`"><span class="cc__amount-cur">R</span>{{ money(row.cell_value) }}</span>
          </div>

          <!-- 3. THE COMMENT — the one thing on this card a human wrote, and
               until now the quietest thing on it. Full contrast, body size,
               the most air of any block here. Nothing competes with it.

               Editing is INLINE rather than a modal: the text is edited where
               it is read, and the anchor stays on screen while you do it —
               which matters, because the anchor is the one thing the edit
               endpoint refuses to change. -->
          <div class="cc__body">
            <p v-if="editing.id !== row.id" class="cc__text" :data-test="`cc-text-${row.id}`">{{ row.comment }}</p>

            <div v-else class="cc__edit" :data-test="`cc-editor-${row.id}`">
              <label class="cc__edit-label" :for="`cc-edit-input-${row.id}`">Comment text</label>
              <textarea
                :id="`cc-edit-input-${row.id}`"
                v-model="editing.text"
                class="cc__edit-input"
                rows="4"
                :disabled="editing.saving"
                :data-test="`cc-edit-input-${row.id}`"
              ></textarea>
              <!-- Stated, because the endpoint enforces it and a reader who
                   assumes otherwise would be editing under a misapprehension:
                   the text is yours to change, the anchor and the author are
                   not, and an admin editing an agent's note does not become
                   its author. -->
              <p class="cc__edit-note">
                Text only. The anchor and the author stay as they are —
                this stays {{ row.author || 'unattributed' }}'s comment.
              </p>
              <p v-if="editing.error" class="cc__edit-error" role="alert"
                 :data-test="`cc-edit-error-${row.id}`">{{ editing.error }}</p>
              <div class="cc__edit-actions">
                <button
                  class="btn btn-ghost btn-sm"
                  :disabled="editing.saving"
                  :data-test="`cc-edit-save-${row.id}`"
                  @click="saveEdit(row)"
                >{{ editing.saving ? 'Saving…' : 'Save text' }}</button>
                <button
                  class="btn btn-ghost btn-sm"
                  :disabled="editing.saving"
                  :data-test="`cc-edit-cancel-${row.id}`"
                  @click="cancelEdit"
                >Cancel</button>
                <button
                  type="button"
                  class="cc__linkbtn"
                  :data-test="`cc-history-${row.id}`"
                  @click="toggleHistory(row)"
                >{{ history[row.id] && history[row.id].open ? 'Hide edit history' : 'Edit history' }}</button>
              </div>
            </div>

            <!-- The byline carries the edit affordance and, separately, the
                 fact that the text HAS been edited. Two facts, never merged:
                 whose comment it is, and who last changed its wording. -->
            <p class="cc__byline">
              <button
                v-if="!isAuditor && editing.id !== row.id"
                type="button"
                class="cc__linkbtn"
                :data-test="`cc-edit-${row.id}`"
                @click="startEdit(row)"
              >Edit text</button>
              <span v-if="row.edited" class="cc__edited" :data-test="`cc-edited-${row.id}`">
                Text edited — written by {{ row.author || 'unattributed' }}
              </span>
              <button
                v-if="row.edited && editing.id !== row.id"
                type="button"
                class="cc__linkbtn"
                :data-test="`cc-history-open-${row.id}`"
                @click="toggleHistory(row)"
              >{{ history[row.id] && history[row.id].open ? 'Hide edit history' : 'Edit history' }}</button>
            </p>

            <!-- History lives on the same sunken layer as the transactions,
                 and only once asked for: a resting card must not carry the
                 weight of an audit trail nobody has opened. -->
            <div v-if="history[row.id] && history[row.id].open"
                 class="cc__drawer" :data-test="`cc-history-panel-${row.id}`">
              <p v-if="history[row.id].loading" class="cc__drawer-lead">Loading the edit history…</p>
              <p v-else-if="history[row.id].error" class="cc__drawer-lead cc__recon--bad" role="alert">
                {{ history[row.id].error }}
              </p>
              <template v-else>
                <p class="cc__drawer-lead">
                  {{ history[row.id].entries.length }}
                  edit{{ history[row.id].entries.length === 1 ? '' : 's' }} to the text.
                  The anchor and the author have never changed.
                </p>
                <p v-if="!history[row.id].entries.length" class="cc__note">
                  Nothing recorded — the text is as it was written.
                </p>
                <ol v-else class="cc__history">
                  <li v-for="(h, i) in history[row.id].entries" :key="h.id || i" class="cc__history-item">
                    <span class="cc__history-meta">
                      {{ h.edited_by || h.author || 'unknown' }} · {{ formatWhen(h.edited_at || h.created_at) }}
                    </span>
                    <span class="cc__history-text">{{ h.from_text ?? h.previous_text ?? h.text ?? '' }}</span>
                  </li>
                </ol>
              </template>
            </div>
          </div>

          <!-- 4. ANCHOR DETAIL — the rest of the coordinates, read as one
               muted run. Present because a note without its figure is just a
               sentence; recessive because the reader already has the headline. -->
          <div v-if="row.subject_type === 'cube_cell'" class="cc__coords">
            <span v-for="(v, k) in coordsOf(row)" :key="k" class="cc__coord">
              <span class="cc__dim">{{ k }}</span>{{ v }}
            </span>
            <span class="cc__measure">{{ row.measure }}</span>
          </div>

          <!-- The verdict SELECTOR is gone. It POSTed to /xero/data/comments/,
               which is the wrong door in both directions: that endpoint 400s
               outright on subject_type 'cube_cell' (the cube's key is built
               from coordinates, so it insists on the pivot door), and on the
               kinds it does accept it stamps the REQUESTER as author. Since it
               upserts on (subject_type, subject_key, author_key), sending back
               a comment somebody else wrote does not record a verdict at all —
               it INSERTS A SECOND ROW carrying their text under your name.
               Ninety-eight of the register's cube rows produced an API error
               string; the fifteen bank rows would have quietly forked.
               A control whose only outcomes are an error or a corrupted
               register is worse than no control, so it is not rendered.

               NOT replaced with a call to a new endpoint: the verdict
               vocabulary is an open design decision MC has reserved, and
               inventing one in the console would pre-empt it. The verdict
               FILTER stays — it reads `decision`, which is stored on rows the
               add-in and the MCP already write, so it filters real data.

               The wrapper survives for the read-only tags beside it. -->
          <div v-if="row.subject_type !== 'cube_cell' && row.tags && row.tags.length"
               class="cc__verdict">
            <span class="cc__tags">
              <span v-for="t in row.tags" :key="t" class="cc__tag">{{ t }}</span>
            </span>
          </div>

          <!-- 5. FILTER CONTEXT — collapsed to ONE line by default.
               Filters are part of the anchor (the same coordinates under a
               different window is a different number) but they are the LEAST
               of it, and rendered open they were the biggest thing on the
               card. The resting line names the FIELDS and says how many more
               there are; the values are one click away, exactly as before.
               The role label is what stops it reading as the anchor itself. -->
          <div v-if="hasFilters(row)" class="cc__context">
            <button
              type="button"
              class="cc__context-toggle"
              :aria-expanded="!!openFilters[row.id]"
              :aria-controls="openFilters[row.id] ? `cc-filters-${row.id}` : undefined"
              :data-test="`cc-context-${row.id}`"
              @click="toggleFilters(row)"
            >{{ openFilters[row.id] ? 'Hide filters' : anchorOf(row).summary }}</button>

            <div v-if="openFilters[row.id]" :id="`cc-filters-${row.id}`" class="cc__filters">
              <span v-for="chip in shownChips(row)" :key="chip.key" class="cc__filter">
                {{ chipText(row, chip) }}
              </span>
              <!-- "+N more" once meant two different things on one card —
                   fields folded away, and values folded inside a field. This
                   one is VALUES, and says so; the line above counts FIELDS,
                   and says that. -->
              <button
                v-if="chipOverflow(row)"
                type="button"
                class="cc__filter cc__filter--more"
                :data-test="`cc-values-${row.id}`"
                @click="toggleFilterValues(row)"
              >
                {{ openFilters[row.id] === ALL_VALUES ? 'Fewer values' : 'Show all values' }}
              </button>
            </div>
          </div>

          <!-- 6. WHAT DO I DO WITH THIS — every action on the card, in one
               row, at the bottom. Assignment on the left because it is a
               statement of where the point sits; the verbs on the right.

               An auditor keeps the read-only assignee chip and the thread:
               everything under /xero/data/ 403s for that role, so the picker,
               the drill and the status verbs are not rendered rather than
               rendered-and-failing. -->
          <footer class="cc__foot">
            <!-- Whose queue this is in.
                 A WRITER gets the picker; its value IS the stored handle, so
                 there is no second control mirroring the same fact. Options are
                 one shared array — active seats plus "Unassigned" — built once
                 per load, never per row.
                 A stood-down seat is offered as a DISABLED option on the rows
                 that already hold it, and nowhere else: the select must not show
                 a blank where a real assignment exists, and the server refuses
                 an inactive handle anyway ("assigning to a role nobody holds is
                 the same as assigning to nobody").
                 An AUDITOR gets the chip. Everything under /xero/data/ is 403
                 for that role, so a picker there could only ever fail — but
                 reading who holds a point is a reviewer's whole job. -->
            <div class="cc__assign">
              <template v-if="!isAuditor">
                <label :for="`asg-${row.id}`">Assigned to</label>
                <select
                  :id="`asg-${row.id}`"
                  class="cc__assign-select"
                  :value="assignmentOf(row).handle"
                  :disabled="busyId === row.id || bulkBusy"
                  :data-test="`cc-assign-${row.id}`"
                  @change="onAssignChange(row, $event)"
                >
                  <option v-for="o in assignmentOf(row).options" :key="o.value"
                          :value="o.value" :disabled="o.disabled">{{ o.label }}</option>
                </select>
              </template>
              <span
                v-else-if="assignmentOf(row).handle"
                class="cc__assignee"
                :class="{ 'cc__assignee--stale': assignmentOf(row).stale }"
                :data-test="`cc-assignee-${row.id}`"
                :title="`Assigned to the ${assignmentOf(row).handle} seat`"
              >
                <span class="cc__assignee-tag">to</span>{{ assignmentOf(row).label
                }}<span v-if="assignmentOf(row).stale"> — no longer active</span>
              </span>
            </div>

            <div class="cc__actions">
              <!-- The thread affordance sits FIRST and outside the auditor
                   gate: discussing a flagged figure is the one write an
                   auditor has, and it must not move when the status buttons
                   next to it disappear. -->
              <CubeCommentThreadCell
                :ref="(el) => registerThreadCell(row.id, el)"
                :commentId="row.id"
                :count="Number(row.reply_count) || 0"
                :currentUser="currentUser"
                @added="onInlineReply"
              />
              <!-- The drill resolves journal lines from /xero/data/journals/pivot/
                   — 403 for an auditor, so the affordance goes with it. -->
              <span v-if="!isAuditor && row.subject_type === 'cube_cell'" class="cc__drill">
                <button
                  class="btn btn-ghost btn-sm"
                  :disabled="drillBusy === row.id"
                  @click="toggleDrill(row)"
                >
                  {{ drillBusy === row.id
                    ? 'Resolving…'
                    : (drills[row.id] ? 'Hide transactions' : 'Show transactions') }}
                </button>
              </span>
              <template v-if="!isAuditor">
                <button
                  v-if="row.status !== 'actioned'"
                  class="btn btn-ghost btn-sm"
                  :disabled="busyId === row.id"
                  @click="setStatus(row, 'actioned')"
                >Actioned</button>
                <button
                  v-if="row.status !== 'dismissed'"
                  class="btn btn-ghost btn-sm"
                  :disabled="busyId === row.id"
                  @click="setStatus(row, 'dismissed')"
                >Dismiss</button>
                <button
                  v-if="row.status !== 'open'"
                  class="btn btn-ghost btn-sm"
                  :disabled="busyId === row.id"
                  @click="setStatus(row, 'open')"
                >Reopen</button>
              </template>
            </div>
          </footer>

          <!-- 7. THE TRANSACTIONS — a LAYER, not a third box.
               This was a bordered table inside a bordered card inside a
               bordered section: "widget in widget", and the reason the page
               read as cluttered. It is now a full-width sunken panel that
               reads as something underneath the row rather than another thing
               stacked on it, led by the reconciliation line. -->
          <div v-if="!isAuditor && row.subject_type === 'cube_cell' && drills[row.id]" class="cc__drawer">
            <p class="cc__drawer-lead cc__recon" :class="reconClass(row)">{{ reconText(row) }}</p>
            <div class="cc__lines">
              <table class="cc__table">
                <thead>
                  <tr>
                    <th>Date</th><th>Jrnl #</th><th>Type</th><th>Account</th>
                    <th>Supplier</th><th>Description</th><th class="ta-r">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="line in drills[row.id].rows" :key="line.id">
                    <td>{{ line.date }}</td>
                    <td>{{ line.journal_number }}</td>
                    <td>{{ line.journal_type }}</td>
                    <td>{{ line.account_code }} {{ line.account_name }}</td>
                    <td>{{ line.supplier_name }}</td>
                    <td>{{ line.description }}</td>
                    <td class="ta-r">{{ money(line.amount) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-if="drills[row.id].truncated" class="cc__note">
              Line cap reached — this shows the first {{ drills[row.id].rows.length }}.
            </p>
          </div>

          <!-- 8. The same thread as the row icon, in the expanded detail, on
               the same sunken layer as the transactions above it.
               Deliberately ONE store behind both: a reply posted in the
               popover appears here without a reload, and vice versa — two
               views of one discussion that disagree would be worse than one. -->
          <section v-if="isExpanded(row)" class="cc__drawer cc__thread" data-test="cc-detail-thread">
            <h4 class="cc__thread-heading">Discussion</h4>
            <CommentThread
              :ref="(el) => registerDetailThread(row.id, el)"
              :comments="threadOf(row.id).replies"
              :loading="threadOf(row.id).loading"
              :saving="threadOf(row.id).saving"
              :error="threadOf(row.id).error"
              :currentUser="currentUser"
              @post="(payload) => postReply(row, payload)"
            />
          </section>
        </article>
      </div>
      </template>
    </SectionCard>
  </AppPage>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import {
  getAuditCubeComments,
  getCubeCommentReplies,
  postCubeCommentReply,
  DECISIONS,
  setCubeCommentStatus,
  setCommentAssignee,
  setCubeCommentText,
  getCubeCommentTextHistory,
  drillCubeComment,
  commentCoordinates,
  normaliseFilters,
} from '../api/cubeComments';
import { useAuthStore } from '../stores/auth';
import { useCommentFeed } from '../composables/useCommentFeed';
import { useSeatDirectory } from '../composables/useSeatDirectory';
import CommentThread from '../components/comments/CommentThread.vue';
import CubeCommentThreadCell from '../components/comments/CubeCommentThreadCell.vue';
import AppPage from '../components/shell/AppPage.vue';
import PageHeader from '../components/klikk/PageHeader.vue';
import SectionCard from '../components/klikk/SectionCard.vue';
import EmptyState from '../components/klikk/EmptyState.vue';
import FilterBar from '../components/klikk/FilterBar.vue';
import KAlert from '../components/klikk/KAlert.vue';
import KBadge from '../components/klikk/KBadge.vue';
import KInput from '../components/klikk/KInput.vue';
import KSelect from '../components/klikk/KSelect.vue';
import KSpinner from '../components/klikk/KSpinner.vue';

const authStore = useAuthStore();

/**
 * Auditor accounts hold a read-only grant over /audit/ only. Every WRITE this
 * page offers — verdict, status, undo — and the drill-down all sit under
 * /xero/data/, which 403s for them. Rendering a control whose only outcome is
 * a 403 is worse than not offering it, so they are hidden rather than
 * disabled. The register, its filters, and the threads are unaffected.
 */
const isAuditor = computed(() => authStore.isAuditor);
const currentUser = computed(() => authStore.user?.username || '');
const currentEmail = computed(() => authStore.user?.email || '');

const directory = useSeatDirectory();

const STATUS_OPTIONS = [
  { label: 'Open', value: 'open' },
  { label: 'Actioned', value: 'actioned' },
  { label: 'Dismissed', value: 'dismissed' },
  { label: 'All', value: 'all' },
];

const loading = ref(false);
const error = ref(null);
const actionError = ref(null);
const busyId = ref(null);
const drillBusy = ref(null);
const all = ref([]);
const drills = reactive({});

const filters = reactive({
  status: 'open', subject_type: '', decision: '', author: '', assignee: '', q: '',
});

// A comment with neither author_key nor author. Not a stored value — "" means
// "no author filter" — so the two need separate tokens.
const NO_AUTHOR = '__no_author__';

// ── Assignment ──────────────────────────────────────────────────────────────
//
// A comment carries `assignee_role`: the HANDLE of a seat, not a person.
// `bookkeeper`, not `anzelle` — so replacing a bookkeeper is one row in the
// people directory rather than a rewrite of every point ever sent to her. The
// console therefore shows the display name and works in the handle throughout.
//
// Written through POST .../comments/<id>/assign/ — BY ID, and only by id.
//
// The upsert doors also accept `assignee`, and this page must never use them
// for it: they conflict on (subject_type, subject_key, author_key) with
// `author_key` stamped server-side from the credential, so re-posting somebody
// else's row does not reassign it — it inserts a second row carrying their
// text under your name. The live register's authors are 'MC (To Review)',
// 'MC', 'codex:…' and 'claude:…', none of them a console username, so that
// door would fork every row it touched rather than a few. The by-id endpoint
// re-derives nothing and never writes `author_key`.
//
// The server owns which handles are acceptable — unknown and INACTIVE are both
// a 400 with a message that names the problem. That message is shown verbatim
// rather than replaced with a generic failure: "handle 'jordyn' is not active"
// tells the reader what to do next, and "could not assign" does not.
//
// Two UI-only tokens, for the same reason NO_AUTHOR exists: "" already means
// "no assignee filter", so "assigned to nobody" and "assigned to me" each need
// their own, and neither may be compared against a stored handle.
const UNASSIGNED = '__unassigned__';
const ASSIGNED_TO_ME = '__me__';

/** My own seat, resolved by EMAIL — the same rule the server applies to 'me'. */
const myHandle = computed(() => directory.handleForEmail(currentEmail.value));

/**
 * Who a comment may be filtered to.
 *
 * ACTIVE seats only, filtered on `active` rather than assumed from the fetch.
 * "Assigned to me" appears only when the signed-in account actually has a
 * directory entry: offering a filter that can only ever match nothing is worse
 * than not offering it, and it is the same failure the server reports as
 * "you have no entry in the people directory".
 */
const assigneeOptions = computed(() => [
  { label: 'Anyone', value: '' },
  ...(myHandle.value
    ? [{ label: `Assigned to me (${directory.labelFor(myHandle.value)})`, value: ASSIGNED_TO_ME }]
    : []),
  { label: 'Unassigned', value: UNASSIGNED },
  ...directory.seats.value.map((p) => ({
    label: p.display_name ? `${p.display_name} — ${p.handle}` : p.handle,
    value: p.handle,
  })),
]);

/** The handle the current filter selection means, or '' for "no filter". */
const assigneeFilterHandle = computed(() => {
  if (filters.assignee === ASSIGNED_TO_ME) return myHandle.value;
  if (filters.assignee === UNASSIGNED || !filters.assignee) return '';
  return filters.assignee;
});

const KIND_OPTIONS = [
  { label: 'Everything', value: '' },
  { label: 'Cube cells', value: 'cube_cell' },
  { label: 'Bank transactions', value: 'bank_txn' },
];
const DECISION_OPTIONS = [
  { label: 'Any', value: '' },
  ...DECISIONS.filter((d) => d.value).map((d) => ({ label: d.label, value: d.value })),
  { label: 'Undecided only', value: '__none__' },
];

async function load() {
  loading.value = true;
  error.value = null;
  // A selection is made against what is ON SCREEN. Carrying it across a filter
  // change would let "assign the 12 I ticked" act on rows the reader can no
  // longer see — the same trap AuditReceipts already guards.
  selected.clear();
  bulkResult.value = null;
  try {
    const params = { status: filters.status, limit: 2000 };
    if (filters.subject_type) params.subject_type = filters.subject_type;
    // "__none__" cannot be a server-side equality filter -- an empty decision is
    // the ABSENCE of one -- so it is applied client-side below.
    if (filters.decision && filters.decision !== '__none__') params.decision = filters.decision;
    // Same shape, same reason: the register's list filter is an equality test,
    // and "assigned to nobody" is the ABSENCE of a handle rather than a value
    // to compare against, so UNASSIGNED is applied client-side below.
    if (assigneeFilterHandle.value) params.assignee = assigneeFilterHandle.value;
    // ONE load path for every role. /audit/cube-comments/ serves the same rows
    // and the same filters as the old /xero/data/comments/ list, plus
    // reply_count — and it is the only one an auditor may reach, so a
    // role-branched fetch would leave the auditor's branch untested by
    // everyone who does not hold an auditor account.
    const data = await getAuditCubeComments(params);
    all.value = data.results || [];
  } catch (e) {
    error.value = e?.response?.data?.error || e.message || 'Could not load comments.';
  } finally {
    loading.value = false;
  }
}

// Author and text filtering are done here rather than server-side: the whole
// queue is small (hundreds), and filtering locally keeps the status counts
// honest without a second round trip per keystroke.
const rows = computed(() => {
  const term = (filters.q || '').toLowerCase();
  return all.value.filter((r) => {
    if (filters.decision === '__none__' && r.decision) return false;
    if (filters.assignee === UNASSIGNED && String(r.assignee_role || '').trim()) return false;
    // "Assigned to me" with no directory entry for this account would otherwise
    // send no server-side filter and quietly show the WHOLE register under a
    // label that says it is showing mine. Nothing matches, and it says so.
    if (filters.assignee === ASSIGNED_TO_ME && !myHandle.value) return false;
    if (filters.author) {
      const who = r.author_key || r.author || '';
      // NO_AUTHOR is a UI-only token for the rows that carry neither; it must
      // not be compared against stored text.
      if (filters.author === NO_AUTHOR ? who !== '' : who !== filters.author) return false;
    }
    if (!term) return true;
    const hay = [
      r.comment,
      r.author,
      ...(r.row_path || []),
      String(r.col_path || ''),
    ].join(' ').toLowerCase();
    return hay.includes(term);
  });
});

/**
 * Every author in the register, plus the select-all row.
 *
 * Identity is `author_key`, falling back to `author` only when the key is
 * empty. The KEY is who wrote it; `author` is the display name. They agree on
 * every row today, but stating the rule matters: two people posting under the
 * same display name stay separate, and one identity that renames itself stays
 * one row here. A filter that silently relied on the two matching would break
 * the moment someone posts under a new identity.
 *
 * Options are derived from the rows actually loaded, never hard-coded, so a
 * new agent identity appears here the first time it comments — and a
 * deliberate attribution like "MC (To Review)" shows up as the first-class
 * author it is, with no special case.
 *
 * "Everyone" is `value: ''`, which the row filter reads as "no author filter".
 * That option used to be inert: reka-ui throws on an empty-string SelectItem
 * value and took the whole dropdown down with it, which is why the page looked
 * like it had no select-all. KSelect now carries "" past reka-ui — see
 * components/klikk/__tests__/KSelect.emptyOption.spec.ts.
 */
const authorOptions = computed(() => {
  const seen = new Map();
  let blank = 0;
  all.value.forEach((r) => {
    const key = r.author_key || r.author || '';
    if (!key) { blank += 1; return; }
    const e = seen.get(key);
    if (e) e.n += 1;
    else seen.set(key, { label: r.author || key, n: 1 });
  });
  // Counts, because the point of this filter is deciding whose notes to read.
  const named = [...seen.entries()]
    .sort((a, b) => b[1].n - a[1].n || a[1].label.localeCompare(b[1].label))
    .map(([value, { label, n }]) => ({ label: `${label} (${n})`, value }));
  return [
    { label: `Everyone (${all.value.length})`, value: '' },
    ...named,
    // Only when such rows exist. A comment with neither key nor name would
    // otherwise be visible under "Everyone" and reachable under nothing —
    // present in the register but impossible to filter to.
    ...(blank ? [{ label: `No author recorded (${blank})`, value: NO_AUTHOR }] : []),
  ];
});

const emptyBody = computed(() =>
  filters.status === 'open'
    ? 'No open comments. Comments are written on a cell in the Excel add-in, or by an agent through the MCP.'
    : 'Nothing matches these filters.');

function coordsOf(row) { return commentCoordinates(row); }

function kindLabel(kind) {
  return ({ bank_txn: 'Bank transaction', cube_cell: 'Cube cell',
            journal_line: 'Journal line', slip: 'Receipt', invoice: 'Invoice' })[kind] || kind;
}

/**
 * What a comment may be assigned TO — ACTIVE seats only, plus the unassign.
 *
 * Built once and shared by every row's picker and by the bulk bar. An inactive
 * seat is never offered: the server refuses one with a 400, so offering it
 * would be offering a choice that cannot be made.
 */
const assignOptions = computed(() => [
  { value: '', label: 'Unassigned' },
  ...directory.seats.value.map((p) => ({
    value: p.handle,
    label: p.display_name || p.handle,
  })),
]);

/**
 * Every row's assignment, resolved ONCE per load — not per render.
 *
 * Same discipline as `anchors`, and for the same reason: this is per-row work
 * read from the template, and the register is a hundred-plus rows deep. A
 * `labelFor()` call in the template would do a Map build and a lookup for
 * every row on every keystroke and every 5-second feed poll, which is exactly
 * the shape of the defect that took this page down. Keyed off `all` AND the
 * directory, so it recomputes when either actually changes and not otherwise —
 * mutating a row's `status` or `reply_count` does not touch `assignee_role`.
 *
 * `stale` is the seat having been stood down since the comment was routed to
 * it. Those rows are deliberately left alone by the backend, so the console
 * has to state it rather than render a dead assignment as a live one.
 */
/**
 * Resolve ONE handle to what a row needs to show — memoised, and keyed on the
 * DIRECTORY rather than on the rows.
 *
 * This indirection is load-bearing, and the register-scale spec is what
 * proved it. `assignments` below depends on every row's `assignee_role`, so a
 * bulk run that assigns 113 comments invalidates it 113 times. With the
 * resolution inlined there, each invalidation re-resolved all 113 rows: 21,321
 * directory reads for one bulk assign, O(n²) in the size of the register —
 * the same shape as the anchor defect that took this page down, reintroduced
 * by the assignment feature.
 *
 * A computed that returns a memoising function fixes it structurally. The
 * cache recomputes only when the DIRECTORY changes, so it survives every row
 * mutation; re-resolving the register afterwards costs one cached Map lookup
 * per row and zero reads. Distinct SEATS is the real dimension here — there
 * are four of them and a hundred and thirteen rows.
 */
const seatIndex = computed(() => {
  const dir = directory.byHandle.value;
  const base = assignOptions.value;
  const cache = new Map();
  return (handle) => {
    if (cache.has(handle)) return cache.get(handle);
    let entry;
    if (!handle) {
      // The common case shares ONE options array by reference. 113 rows each
      // holding their own copy of the same four options is the kind of
      // per-row allocation this page has already been taken down by once.
      entry = { handle: '', label: '', stale: false, options: base };
    } else {
      const person = dir.get(handle.toLowerCase());
      // Unknown to the directory is NOT stale — it is unknown, and saying
      // "no longer active" about a handle nobody has ever heard of would be a
      // guess. It shows as the bare handle instead.
      const stale = !!person && !person.active;
      const label = (person && person.display_name) || handle;
      const offered = base.some((o) => o.value === handle);
      entry = {
        handle,
        label,
        stale,
        // A row holding a handle the picker does not offer still has to SHOW
        // it, or the select renders blank and claims the point is unassigned.
        // It is added disabled, so it can be moved off and never onto.
        options: offered ? base : [
          ...base,
          { value: handle, label: stale ? `${label} — no longer active` : label, disabled: true },
        ],
      };
    }
    cache.set(handle, entry);
    return entry;
  };
});

const assignments = computed(() => {
  const resolve = seatIndex.value;
  const m = new Map();
  all.value.forEach((r) => {
    m.set(r.id, resolve(String(r.assignee_role || '').trim()));
  });
  return m;
});

const EMPTY_ASSIGNMENT = { handle: '', label: '', stale: false, options: [] };
function assignmentOf(row) { return assignments.value.get(row.id) || EMPTY_ASSIGNMENT; }

/** The server's own words, preferred over anything this page could invent. */
function assignError(e) {
  return e?.response?.data?.error || e?.message || 'Could not change the assignment.';
}

/** Enough of a comment to recognise it in a failure list. */
function rowLabel(row) {
  const label = (row.subject_label || '').trim();
  if (label) return label;
  const text = (row.comment || '').trim();
  return text.length > 50 ? `${text.slice(0, 50)}…` : (text || `comment ${row.id}`);
}

/**
 * Drop a row that no longer belongs under the current assignee filter.
 *
 * Same rule the status buttons already follow: leaving a row captioned
 * "with the bookkeeper" in a list filtered to the auditor is a list that lies.
 */
function reconcileAssigneeFilter(row) {
  const handle = String(row.assignee_role || '');
  const gone = filters.assignee === UNASSIGNED
    ? !!handle
    : !!assigneeFilterHandle.value && handle !== assigneeFilterHandle.value;
  if (gone) {
    all.value = all.value.filter((r) => r.id !== row.id);
    selected.delete(row.id);
  }
}

/**
 * Assign ONE comment.
 *
 * Driven off the change event rather than v-model because the failure path
 * matters: a native <select> has already moved when the handler runs, and
 * `row.assignee_role` does not change on a refusal, so nothing would re-render
 * and the control would sit there showing a seat the server rejected. The
 * element is put back by hand.
 */
async function onAssignChange(row, event) {
  const el = event.target;
  const handle = el.value;
  const previous = String(row.assignee_role || '');
  if (handle === previous) return;
  busyId.value = row.id;
  actionError.value = null;
  try {
    const updated = await setCommentAssignee(row.id, handle);
    row.assignee_role = updated?.assignee_role ?? handle;
    reconcileAssigneeFilter(row);
  } catch (e) {
    el.value = previous;
    actionError.value = assignError(e);
  } finally {
    busyId.value = null;
  }
}

// ── Bulk assign ─────────────────────────────────────────────────────────────
//
// A Set, so membership is O(1) from the template: this is read once per row on
// every render, and a list scan would put the register's size back into the
// render path.
const selected = reactive(new Set());
const bulkHandle = ref('');
const bulkBusy = ref(false);
const bulkDone = ref(0);
const bulkResult = ref(null);

const selectedCount = computed(() => selected.size);
const allShownSelected = computed(() =>
  rows.value.length > 0 && rows.value.every((r) => selected.has(r.id)));

function toggleSelected(row) {
  if (selected.has(row.id)) selected.delete(row.id);
  else selected.add(row.id);
}
function toggleSelectAll() {
  if (allShownSelected.value) rows.value.forEach((r) => selected.delete(r.id));
  else rows.value.forEach((r) => selected.add(r.id));
}
function clearSelection() { selected.clear(); }

/**
 * Assign the selection — ONE CALL PER COMMENT, reported honestly.
 *
 * The endpoint is by-id and takes one comment, so a run of forty is forty
 * requests and any of them can be refused on its own. Reporting a whole-batch
 * "42 assigned" when nine were rejected would be a claim the register itself
 * disagrees with the moment it reloads, so what is reported is what happened:
 * how many were attempted, how many landed, and every failure by name with the
 * server's reason.
 *
 * Sequential, not Promise.all: forty parallel writes to one table for the sake
 * of a second of wall-clock is not a trade worth making, and a serial run gives
 * an honest progress count.
 *
 * Successes are deselected and failures are KEPT selected, so the retry is the
 * same button again rather than re-ticking nine boxes.
 */
async function assignSelected() {
  const targets = all.value.filter((r) => selected.has(r.id));
  if (!targets.length || bulkBusy.value) return;
  const handle = bulkHandle.value;
  bulkBusy.value = true;
  bulkDone.value = 0;
  bulkResult.value = null;
  actionError.value = null;
  const done = [];
  const failed = [];
  for (const row of targets) {
    try {
      const updated = await setCommentAssignee(row.id, handle);
      row.assignee_role = updated?.assignee_role ?? handle;
      done.push(row);
    } catch (e) {
      failed.push({ id: row.id, label: rowLabel(row), error: assignError(e) });
    } finally {
      bulkDone.value += 1;
    }
  }
  done.forEach((row) => { selected.delete(row.id); });
  bulkResult.value = {
    attempted: targets.length,
    assigned: done.length,
    failed,
    handle,
    handleLabel: handle ? directory.labelFor(handle) : '',
  };
  bulkBusy.value = false;
  // Once, at the end — reconciling inside the loop would shrink the list under
  // a run that is still reading it.
  done.forEach(reconcileAssigneeFilter);
}
/* ── The anchor's filter context, rendered compactly ──────────────────────
 *
 * These filters are part of the anchor and must stay visible: the same
 * coordinates under a different date window is a different number, and showing
 * the cut is the difference between a reader trusting the figure and guessing.
 *
 * But they were rendered verbatim, and one key is not a scalar. `dimf` is a
 * JSON blob of {dimension: [members]}, and a comment written in the Excel
 * add-in after the subset picker's "add all shown" carried every year and
 * every month — twelve and a hundred and forty-four values — straight onto the
 * card. MC: "It clutters the space. Does not happen where Claude posts." It
 * did not happen for an agent because add_cube_comment sends only the
 * dimensions it actually narrowed.
 *
 * The add-in now writes an all-members subset the way it writes "no filter" —
 * omitted — so new comments are quiet at the source. This is the other half,
 * and it is the half that matters for the ~113 comments ALREADY stored: they
 * keep their verbose anchors, and nothing rewrites them. Collapsed by default,
 * expandable in place, so a verbose anchor from ANY source can never flood the
 * page again.
 *
 * Nothing is hidden, only folded: every value is one click away, and the
 * counts say how much is folded. */

/** How many field NAMES the resting disclosure line names before it counts. */
const FILTER_FIELDS_NAMED = 3;
const FILTER_VALUES_SHOWN = 3;

/**
 * The disclosure has three states, not two, and they live in ONE reactive.
 *
 * falsy      — collapsed. One line naming the fields. MC's explicit choice:
 *              he reads ~121 of these, and an open filter run was the largest
 *              thing on a card whose largest thing should be the comment.
 * 'fields'   — every field, with long member lists trimmed to three.
 * 'all'      — every field, every member.
 *
 * Same reactive, same per-row keying, same toggle machinery as before — this
 * extends it with one more rung rather than replacing it, so "nothing is
 * hidden, only folded" still holds: every value is still reachable, now in
 * two clicks instead of one.
 */
const FIELDS_ONLY = 'fields';
const ALL_VALUES = 'all';

// row.id -> expanded. Per row, so opening one card's filters does not open
// every card's.
const openFilters = reactive({});

function toggleFilters(row) {
  openFilters[row.id] = openFilters[row.id] ? false : FIELDS_ONLY;
}
function toggleFilterValues(row) {
  openFilters[row.id] = openFilters[row.id] === ALL_VALUES ? FIELDS_ONLY : ALL_VALUES;
}

/**
 * The anchor as a flat list of {key, label, values}.
 *
 * `dimf` is expanded into ONE CHIP PER DIMENSION rather than being shown as
 * the blob it is stored as — that is what turns a wall of JSON into "year: …"
 * and "month: …". A dimf that will not parse falls back to a single chip
 * carrying it raw: unreadable is still better than silently dropped, because
 * these values are what tell the reader which figure the comment is about.
 */
function filterChips(row) {
  const f = normaliseFilters(row.filters);
  const chips = [];
  Object.entries(f).forEach(([k, v]) => {
    if (v === '' || v == null) return;
    if (k === 'dimf') {
      let dims = v;
      if (typeof dims === 'string') {
        try { dims = JSON.parse(dims); } catch { dims = null; }
      }
      if (dims && typeof dims === 'object' && !Array.isArray(dims)) {
        Object.entries(dims).forEach(([dim, vals]) => {
          const list = (Array.isArray(vals) ? vals : [vals])
            .filter((x) => x !== '' && x != null)
            .map(String);
          if (list.length) chips.push({ key: `dimf.${dim}`, label: dim, values: list });
        });
        return;
      }
      chips.push({ key: 'dimf', label: 'dimf', values: [String(v)] });
      return;
    }
    chips.push({ key: k, label: k, values: [String(v)] });
  });
  return chips;
}

/**
 * Every row's anchor, parsed EXACTLY ONCE per load.
 *
 * `filterChips` JSON.parses the row's stored filters and then the `dimf` blob
 * inside it. That blob is ~10 KB — the whole list response is 1.4 MB for 113
 * comments, nearly all of it anchors — and the template touched it FOUR times
 * per row per render: `hasFilters`, `shownChips`, and `chipOverflow` twice.
 * Measured: 452 parses to draw the page, and 452 more on every re-render, so
 * every keystroke in the search box and every 5-second feed poll re-parsed
 * about four megabytes of JSON. That is what took the page down.
 *
 * A computed keyed off `all` fixes it structurally rather than by trimming the
 * call sites: the parse happens when rows arrive and never during render. It
 * recomputes only when the register is reloaded — mutating a row's `decision`
 * or `reply_count` does not touch `filters`, so triage does not re-parse.
 *
 * `overflow` is precomputed here for the same reason: it was the call site
 * hit twice per row, and the template must not do arithmetic over member
 * lists while painting.
 */
const anchors = computed(() => {
  const m = new Map();
  all.value.forEach((r) => {
    const chips = filterChips(r);
    // Hidden VALUES only. Fields are no longer folded away once the run is
    // open — the disclosure line above it is what folds those — so counting
    // them here would be counting the same thing twice under two labels,
    // which is the "+1 more" ambiguity this pass exists to remove.
    const overflow = chips.reduce(
      (n, c) => n + Math.max(0, c.values.length - FILTER_VALUES_SHOWN), 0);
    // The resting line, built HERE and not in the template: it is per-row
    // work read on every render and every 5-second feed poll, which is the
    // exact shape of the defect that took this page down.
    const named = chips.slice(0, FILTER_FIELDS_NAMED).map((c) => c.label);
    const rest = chips.length - named.length;
    const summary = chips.length
      ? `Under filters: ${named.join(', ')}${rest ? ` +${rest} more field${rest === 1 ? '' : 's'}` : ''}`
      : '';
    m.set(r.id, { chips, overflow, summary });
  });
  return m;
});

const EMPTY_ANCHOR = { chips: [], overflow: 0, summary: '' };
function anchorOf(row) { return anchors.value.get(row.id) || EMPTY_ANCHOR; }

function hasFilters(row) { return anchorOf(row).chips.length > 0; }

/**
 * Every field, once the run is open at all. The folding that remains at this
 * level is of VALUES, inside a field — one dimension holding 144 months is
 * the case that matters, and it is not helped by hiding the field next to it.
 */
function shownChips(row) { return anchorOf(row).chips; }

/**
 * One chip: "year: 2015, 2016, 2017 +9 more values" trimmed, all of it at
 * 'all'. The tail says "values" in words: the line above this run counts
 * FIELDS, and two counters reading "+1 more" on one card — sometimes both at
 * once — is what made the anchor unreadable.
 */
function chipText(row, chip) {
  const vals = chip.values;
  if (openFilters[row.id] === ALL_VALUES || vals.length <= FILTER_VALUES_SHOWN) {
    return `${chip.label}: ${vals.join(', ')}`;
  }
  const head = vals.slice(0, FILTER_VALUES_SHOWN).join(', ');
  return `${chip.label}: ${head} +${vals.length - FILTER_VALUES_SHOWN} more values`;
}

/**
 * How much folding is going on — 0 when the whole anchor is already visible,
 * so the toggle does not appear on the short anchors most comments carry.
 * Counts hidden CHIPS plus hidden VALUES, because a single chip holding a
 * hundred and forty-four months is the case this exists for.
 *
 * Deliberately independent of the open state: this is how much WOULD be
 * folded, so the toggle stays put once expanded. Deriving it from the current
 * state made "Show less" disappear on a card whose overflow was all values and
 * no extra chips — expanded, with no way back.
 *
 * Computed in `anchors`, not here: this is read twice per row per render and
 * used to re-parse the anchor each time.
 */
function chipOverflow(row) { return anchorOf(row).overflow; }

function money(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * When, said the way a reader of a queue actually reads it.
 *
 * A full locale timestamp on 121 cards is 121 pieces of chrome competing with
 * the sentence beside it; "3 days ago" is the fact being asked for. The exact
 * stamp survives as the element's title, so nothing is lost.
 */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
function formatWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const delta = Date.now() - d.getTime();
  // A stamp in the future is a clock skew, not a fact about the register;
  // say the date rather than "in -3 days".
  if (delta < 0) return d.toLocaleDateString();
  if (delta < MINUTE) return 'just now';
  if (delta < HOUR) {
    const n = Math.floor(delta / MINUTE);
    return `${n} minute${n === 1 ? '' : 's'} ago`;
  }
  if (delta < DAY) {
    const n = Math.floor(delta / HOUR);
    return `${n} hour${n === 1 ? '' : 's'} ago`;
  }
  if (delta < 30 * DAY) {
    const n = Math.floor(delta / DAY);
    return `${n} day${n === 1 ? '' : 's'} ago`;
  }
  return d.toLocaleDateString();
}

// ── Editing the text ────────────────────────────────────────────────────────
//
// POST /xero/data/journals/pivot/comments/<id>/text/  {comment}
//
// The one thing on a comment that may be rewritten is its WORDS. The anchor
// and the author are not editable — the server 400s if either is sent — and
// that constraint is the feature, not a limitation of it: the register is an
// audit trail, and a note whose figure or whose author could be swapped after
// the fact would not be one.
//
// So the console never conflates the two. An admin fixing the wording of an
// agent's comment leaves it the agent's comment; the card states both facts
// separately ("written by claude:year-end-audit", "text edited by mc"), and
// the edit form says so before you type.
//
// ONE editor at a time, held in ONE object rather than a per-row map: the
// register is 121 rows deep and per-row state on a page this size is how it
// was taken down before. A second Edit click just moves the editor.
const editing = ref({ id: null, text: '', saving: false, error: '' });

// Only ever populated for a row whose history has actually been ASKED for.
// A resting card carries none of this.
const history = reactive({});

function startEdit(row) {
  editing.value = { id: row.id, text: String(row.comment || ''), saving: false, error: '' };
}
function cancelEdit() {
  editing.value = { id: null, text: '', saving: false, error: '' };
}

/**
 * Save the text.
 *
 * The server's 400 is shown VERBATIM and next to the editor rather than
 * replaced with a house message: "comment may not be empty" and "the anchor
 * cannot be changed" tell the writer what to do, and "could not save" does
 * not. Same rule the assign path already follows.
 *
 * A no-op is NOT short-circuited here. The server answers `edited: false` and
 * writes no history row, and it is the server's normalisation that decides
 * what counts as a change — guessing at that in the console would eventually
 * disagree with the trail.
 */
async function saveEdit(row) {
  if (editing.value.saving || editing.value.id !== row.id) return;
  const text = String(editing.value.text || '');
  if (!text.trim()) {
    editing.value.error = 'A comment cannot be empty.';
    return;
  }
  editing.value.saving = true;
  editing.value.error = '';
  actionError.value = null;
  try {
    const result = await setCubeCommentText(row.id, text);
    // Prefer the server's stored text over what was typed — it owns any
    // trimming or normalisation, and showing the typed string would leave the
    // card disagreeing with the register on the next load.
    row.comment = typeof result?.comment === 'string' ? result.comment : text;
    if (result?.edited) {
      // The register returns `edited` (EXISTS over the edit trail), so mark the
      // row on the same field the list will carry on the next reload -- setting
      // a different one made the marker vanish the moment the page refetched.
      row.edited = true;
      // A recorded edit invalidates any history already on screen.
      if (history[row.id]?.open) await loadHistory(row, { force: true });
    } else {
      // Said out loud. Silently closing on a no-op reads as "saved", and the
      // trail would then have no row to back that up.
      actionError.value = 'No change to save — the text is as it was.';
    }
    cancelEdit();
  } catch (e) {
    editing.value.error = e?.response?.data?.error
      || e?.response?.data?.detail
      || e?.message
      || 'Could not save that text.';
  } finally {
    editing.value.saving = false;
  }
}

/**
 * The edit trail — fetched on demand, never on load.
 *
 * It is the answer to "was this always what it said", which is a question
 * asked of a handful of comments and never of the register, so it must not
 * add a byte to the 121 resting cards.
 */
async function loadHistory(row, { force = false } = {}) {
  const entry = history[row.id];
  if (!entry || (entry.loaded && !force)) return;
  entry.loading = true;
  entry.error = '';
  try {
    const envelope = await getCubeCommentTextHistory(row.id);
    const list = envelope?.history || envelope?.edits || envelope?.results || [];
    entry.entries = Array.isArray(list) ? list : [];
    entry.loaded = true;
  } catch (e) {
    entry.error = e?.response?.data?.error || e?.message || 'Could not load the edit history.';
  } finally {
    entry.loading = false;
  }
}

function toggleHistory(row) {
  const entry = history[row.id];
  if (entry?.open) {
    entry.open = false;
    return;
  }
  if (!entry) {
    history[row.id] = { open: true, loading: false, loaded: false, error: '', entries: [] };
  } else {
    entry.open = true;
  }
  loadHistory(row);
}

const undo = ref(null);
const undoBusy = ref(false);
let undoTimer = null;

/**
 * Put a comment back the way it was.
 *
 * Deliberately restores the PREVIOUS status rather than forcing "open": undoing
 * a dismissal on something that was already actioned should not quietly promote
 * it back into the queue.
 */
async function undoLast() {
  if (!undo.value) return;
  undoBusy.value = true;
  actionError.value = null;
  try {
    const { id, from } = undo.value;
    const restored = await setCubeCommentStatus(id, from);
    undo.value = null;
    if (undoTimer) clearTimeout(undoTimer);
    // It belongs back in view if it matches the current filter again.
    if (filters.status === 'all' || restored.status === filters.status) await load();
  } catch (e) {
    actionError.value = e?.response?.data?.error || e.message || 'Could not undo that.';
  } finally {
    undoBusy.value = false;
  }
}

async function setStatus(row, status) {
  busyId.value = row.id;
  actionError.value = null;
  try {
    const previous = row.status;
    const updated = await setCubeCommentStatus(row.id, status);
    row.status = updated.status;
    undo.value = {
      id: row.id,
      from: previous,
      status: updated.status,
      excerpt: (row.comment || '').slice(0, 60) + ((row.comment || '').length > 60 ? '…' : ''),
    };
    // Long enough to notice and act on, short enough not to linger as clutter.
    if (undoTimer) clearTimeout(undoTimer);
    undoTimer = setTimeout(() => { undo.value = null; }, 15000);
    // Drop it from view when it no longer matches the filter, rather than
    // leaving a row that says "actioned" in a list captioned "open".
    if (filters.status !== 'all' && updated.status !== filters.status) {
      all.value = all.value.filter((r) => r.id !== row.id);
    }
  } catch (e) {
    actionError.value = e?.response?.data?.error || e.message || 'Could not update that comment.';
  } finally {
    busyId.value = null;
  }
}

async function toggleDrill(row) {
  if (drills[row.id]) {
    delete drills[row.id];
    return;
  }
  drillBusy.value = row.id;
  actionError.value = null;
  // The expanded detail carries the thread too; fetch it alongside rather
  // than after, so the section does not appear empty and then fill in.
  loadThread(row.id);
  try {
    drills[row.id] = await drillCubeComment(row);
  } catch (e) {
    actionError.value = e?.response?.data?.error || e.message || 'Could not resolve the transactions.';
  } finally {
    drillBusy.value = null;
  }
}

/**
 * Reconciliation is reported, not assumed.
 *
 * The lines behind a figure move when Xero is re-synced. A drill that no longer
 * adds up to the value the comment was written about is a real signal — the
 * ledger changed under a figure someone already reviewed — so it is stated
 * plainly rather than quietly displayed as if it agreed.
 */
function reconDiff(row) {
  const d = drills[row.id];
  if (!d || row.cell_value === null || row.cell_value === undefined) return null;
  return Math.abs(Number(row.cell_value) - Number(d.line_total));
}
function reconClass(row) {
  const diff = reconDiff(row);
  if (diff === null) return 'cc__recon--plain';
  return diff > 0.005 ? 'cc__recon--bad' : 'cc__recon--ok';
}
function reconText(row) {
  const d = drills[row.id];
  if (!d) return '';
  const base = `${d.count} line${d.count === 1 ? '' : 's'}, ${money(d.line_total)}`;
  const diff = reconDiff(row);
  if (diff === null) return base;
  return diff > 0.005
    ? `${base} — does not match the commented ${money(row.cell_value)} (out by ${money(diff)}). The data has changed since.`
    : `${base} — matches the commented value.`;
}

// ── Reply threads ───────────────────────────────────────────────────────────
//
// Every comment in the register can be discussed. Two surfaces show the SAME
// discussion — the row icon's popover and the expanded detail — so the page,
// not either surface, owns the replies. Each surface keeps a mirror; the page
// pushes into both on every event (local post, popover post, live feed), and
// every merge is de-duped by reply id, so nothing is ever shown twice and the
// two views cannot drift apart.

const threads = reactive({});

/** Popover cells and inline threads, per row, so both can be kept in step. */
const threadCells = new Map();
const detailThreads = new Map();

function registerThreadCell(id, el) {
  if (el) threadCells.set(String(id), el);
  else threadCells.delete(String(id));
}
function registerDetailThread(id, el) {
  if (el) detailThreads.set(String(id), el);
  else detailThreads.delete(String(id));
}

const EMPTY_THREAD = Object.freeze({
  replies: [], loading: false, loaded: false, saving: false, error: '',
});

/** Read-only accessor — safe to call from the template (no write on render). */
function threadOf(id) {
  return threads[String(id)] || EMPTY_THREAD;
}

function ensureThread(id) {
  const key = String(id);
  if (!threads[key]) {
    threads[key] = { replies: [], loading: false, loaded: false, saving: false, error: '' };
  }
  return threads[key];
}

/** The detail is expanded exactly when its transactions are — one disclosure. */
function isExpanded(row) {
  return !isAuditor.value && row.subject_type === 'cube_cell' && !!drills[row.id];
}

async function loadThread(id) {
  const t = ensureThread(id);
  if (t.loaded || t.loading) return;
  t.loading = true;
  try {
    const envelope = await getCubeCommentReplies(id);
    t.replies = Array.isArray(envelope?.replies) ? envelope.replies : [];
    t.loaded = true;
  } catch {
    // Degrade to composer-only. Not being able to READ the thread must not
    // stop a reply being WRITTEN; the post path reports its own failures.
    t.loaded = false;
  } finally {
    t.loading = false;
  }
}

function knownReply(id, reply) {
  if (!reply || reply.id === undefined || reply.id === null) return false;
  return (threads[String(id)]?.replies || []).some((r) => String(r.id) === String(reply.id));
}

/** Append unless we already have it. Returns whether anything was added. */
function mergeReply(id, reply) {
  if (!reply || reply.id === undefined || reply.id === null) return false;
  if (knownReply(id, reply)) return false;
  const t = ensureThread(id);
  t.replies = [...t.replies, reply];
  return true;
}

function bumpReplyCount(id, by = 1) {
  const row = all.value.find((r) => String(r.id) === String(id));
  if (row) row.reply_count = (Number(row.reply_count) || 0) + by;
}

/** Posted from the expanded detail's composer. */
async function postReply(row, { text, parentId = null } = {}) {
  const body = String(text || '').trim();
  const t = ensureThread(row.id);
  if (!body || t.saving) return;
  t.saving = true;
  t.error = '';
  try {
    // parent_id is omitted entirely for a top-level reply, so that request
    // stays byte-identical to the simplest thing the contract accepts.
    const created = parentId == null
      ? await postCubeCommentReply(row.id, body)
      : await postCubeCommentReply(row.id, body, { parentId });
    // The contract returns the created reply; if a proxy ever strips the body,
    // show what was typed rather than swallowing it.
    const reply = created && created.id != null
      ? created
      : { id: `local-${Date.now()}`, parent_id: parentId, text: body, author: currentUser.value, created_at: null };
    mergeReply(row.id, reply);
    threadCells.get(String(row.id))?.mergeComment?.(reply);
    bumpReplyCount(row.id);
    // Only now is the draft safe to drop — a failed post keeps it for retry.
    detailThreads.get(String(row.id))?.clearDraft?.();
  } catch {
    t.error = 'Could not post — try again.';
  } finally {
    t.saving = false;
  }
}

/** Posted from the row icon's popover — the cell already appended its own. */
function onInlineReply({ commentId, comment }) {
  mergeReply(commentId, comment);
  bumpReplyCount(commentId);
}

/**
 * Live feed. A reply someone else leaves surfaces within one poll interval:
 * the badge bumps, an open thread appends in place, and a toast names them.
 *
 * The register is NOT refetched — a reply changes no server-side total, and
 * reloading mid-triage would move rows under the reader.
 */
function applyFeedEvents(events) {
  for (const event of events) {
    const id = String(event.object_id);
    // De-duped by reply id: your own POST already appended and bumped.
    if (knownReply(id, event.comment)) continue;
    mergeReply(id, event.comment);
    threadCells.get(id)?.mergeComment?.(event.comment);
    bumpReplyCount(id);
  }
}

useCommentFeed({
  kind: 'cube_comment',
  onEvents: applyFeedEvents,
  currentUser: () => currentUser.value,
});

watch(() => [filters.status, filters.subject_type, filters.decision, filters.assignee], load);
// The register does not wait on the directory: the seats decorate the rows and
// fill the "Assigned to" filter, and a directory that is slow (or unreachable)
// must not hold up the comments. `assignments` and `assigneeOptions` are
// computeds, so both fill in the moment it lands.
onMounted(() => { directory.load(); load(); });
</script>

<style scoped>
/* Everything here composes from the --kdl-* token map in css/klikk.css.
 * No new tokens were needed: the card wanted an 8/12 vertical rhythm on an
 * 11/12/14 type ramp, and both already exist. What it did NOT have was any
 * consistency about using them — margins ran 5/6/8/10px against a 4/8/12/16
 * scale, type ran 10.5/11/11.5/12/13 against 11/12/13/14, and de-emphasis was
 * done with raw `opacity` instead of the three text tokens that exist for
 * exactly that. Opacity-for-hierarchy is gone from this file: it dims the
 * BACKGROUND through the glyph as well as the ink, so .65 on one surface and
 * .65 on another are two different greys, and neither is one the design
 * system knows about. */

.cc-undo {
  display: flex;
  align-items: center;
  gap: var(--kdl-space-2);
  padding: var(--kdl-space-2) var(--kdl-space-3);
  margin-bottom: var(--kdl-space-3);
  border: var(--kdl-border-width) solid var(--kdl-border);
  border-radius: var(--kdl-radius-sm);
  background: var(--kdl-border-subtle);
  font-size: var(--kdl-font-size-caption);
}
.cc-undo > span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* The bulk bar and its report wear the same clothes as the undo bar — they
   are the same kind of thing: a transient strip about an action just taken or
   about to be. */
.cc-bulk,
.cc-bulk-result {
  display: flex;
  align-items: center;
  gap: var(--kdl-space-2);
  padding: var(--kdl-space-2) var(--kdl-space-3);
  margin-bottom: var(--kdl-space-3);
  border: var(--kdl-border-width) solid var(--kdl-border);
  border-radius: var(--kdl-radius-sm);
  background: var(--kdl-border-subtle);
  font-size: var(--kdl-font-size-caption);
}
.cc-bulk__field { display: flex; align-items: center; gap: var(--kdl-space-1); }
.cc-bulk__field > span { color: var(--kdl-text-muted); font-size: var(--kdl-font-size-overline); }

.cc-bulk-result { flex-wrap: wrap; align-items: flex-start; }
/* A run with refusals in it is not a success, and must not read as one. */
.cc-bulk-result--bad { border-color: var(--kdl-status-warning); }
.cc-bulk-result__head { margin: 0; flex: 1; min-width: 0; }
.cc-bulk-result__list {
  flex-basis: 100%;
  margin: var(--kdl-space-1) 0 0;
  padding-left: var(--kdl-space-4);
  font-size: var(--kdl-font-size-overline);
}
.cc-bulk-result__note {
  flex-basis: 100%;
  margin: var(--kdl-space-1) 0 0;
  font-size: var(--kdl-font-size-overline);
  color: var(--kdl-text-muted);
}

.cc-selectall {
  margin-bottom: var(--kdl-space-2);
  font-size: var(--kdl-font-size-overline);
  color: var(--kdl-text-muted);
}
.cc-selectall label { display: inline-flex; align-items: center; gap: var(--kdl-space-1); cursor: pointer; }

/* ── The row ──────────────────────────────────────────────────────────────
   NOT a card. It was a bordered, rounded box inside a bordered SectionCard,
   with a bordered table inside it when expanded — three nested frames, which
   is what "widget in widget" describes and why 121 of them read as clutter.
   One SectionCard edge; hairline-separated rows inside it. That removes a
   whole nesting level with nothing but CSS. */
.cc-list { display: flex; flex-direction: column; }
.cc {
  padding: var(--kdl-space-3) 0;
  border-bottom: var(--kdl-border-width) solid var(--kdl-border-subtle);
}
.cc:last-child { border-bottom: none; padding-bottom: 0; }
.cc:first-child { padding-top: 0; }

/* 1. Identity — the quietest line on the card. */
.cc__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--kdl-space-2);
  min-width: 0;
}
.cc__pick { flex: 0 0 auto; cursor: pointer; }
.cc__author { font-size: var(--kdl-font-size-caption); color: var(--kdl-text-muted); }
.cc__when { font-size: var(--kdl-font-size-overline); color: var(--kdl-text-hint); }

/* 2. The anchor headline and its figure — one focal line, the label left and
      the number right, so a column of cards scans down the amounts. */
.cc__anchor {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--kdl-space-3);
  margin-top: var(--kdl-space-2);
}
.cc__subject {
  margin: 0;
  min-width: 0;
  font-size: var(--kdl-font-size-body);
  font-weight: 600;
  line-height: var(--kdl-line-height-tight);
  color: var(--kdl-text-primary);
}
.cc__amount {
  flex: 0 0 auto;
  font-size: var(--kdl-font-size-body);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--kdl-text-primary);
  white-space: nowrap;
}
.cc__amount-cur { color: var(--kdl-text-muted); margin-right: var(--kdl-space-1); }

/* 3. The comment. The most-spaced, full-contrast block on the card — it is
      the only thing here a person wrote, and it used to read quieter than the
      chrome around it. */
.cc__body { margin: var(--kdl-space-3) 0; }
.cc__text {
  margin: 0;
  white-space: pre-wrap;
  font-size: var(--kdl-font-size-body);
  line-height: var(--kdl-line-height-body);
  color: var(--kdl-text-primary);
}

/* The inline editor. It replaces the paragraph in place rather than opening a
   dialog: the anchor above it is the thing this endpoint will NOT let you
   change, and it should stay in view while you type. */
.cc__edit { display: flex; flex-direction: column; gap: var(--kdl-space-2); }
.cc__edit-label {
  font-size: var(--kdl-font-size-overline);
  color: var(--kdl-text-hint);
}
.cc__edit-input {
  width: 100%;
  padding: var(--kdl-space-2);
  border: var(--kdl-border-width) solid var(--kdl-border);
  border-radius: var(--kdl-radius-sm);
  background: var(--kdl-card-bg);
  color: var(--kdl-text-primary);
  font-family: inherit;
  font-size: var(--kdl-font-size-body);
  line-height: var(--kdl-line-height-body);
  resize: vertical;
}
.cc__edit-input:focus { border-color: var(--kdl-accent); }
.cc__edit-note { margin: 0; font-size: var(--kdl-font-size-overline); color: var(--kdl-text-hint); }
.cc__edit-error { margin: 0; font-size: var(--kdl-font-size-caption); color: var(--kdl-status-danger); }
.cc__edit-actions { display: flex; align-items: center; gap: var(--kdl-space-2); flex-wrap: wrap; }

.cc__byline {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--kdl-space-2);
  margin: var(--kdl-space-2) 0 0;
  font-size: var(--kdl-font-size-overline);
  color: var(--kdl-text-hint);
}
/* Two facts, never one: whose comment this is, and who last changed its
   wording. Merging them would be re-attribution by typography. */
.cc__edited { color: var(--kdl-text-muted); }
/* A text affordance, not a button-shaped one: these sit beside prose and a
   bordered control there would out-weigh the prose.
   No :focus-visible rule — klikk.css authors the ring globally and overrides
   it to navy in light mode; restating the `outline` shorthand here would
   silently defeat that. */
.cc__linkbtn {
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  font-size: var(--kdl-font-size-overline);
  color: var(--kdl-text-muted);
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}
.cc__linkbtn:hover { color: var(--kdl-text-primary); }

/* 4. Anchor detail — one wrapped, muted run. */
.cc__coords {
  display: flex;
  flex-wrap: wrap;
  gap: var(--kdl-space-1);
  align-items: center;
  font-size: var(--kdl-font-size-caption);
  color: var(--kdl-text-muted);
}
/* Plain spans, deliberately NOT KChip/KBadge instances: 121 rows times ~8
   chips is a thousand component instances for a run of static text. They are
   on tokens now; they are not components. */
.cc__coord {
  background: var(--kdl-border-subtle);
  border-radius: var(--kdl-radius-sm);
  padding: 2px var(--kdl-space-1);
}
.cc__dim { color: var(--kdl-text-hint); margin-right: var(--kdl-space-1); }
.cc__measure { color: var(--kdl-text-hint); }

.cc__verdict {
  display: flex;
  align-items: center;
  gap: var(--kdl-space-2);
  margin-top: var(--kdl-space-2);
  flex-wrap: wrap;
}
.cc__tags { display: flex; gap: var(--kdl-space-1); flex-wrap: wrap; }
.cc__tag {
  font-size: var(--kdl-font-size-overline);
  color: var(--kdl-text-muted);
  background: var(--kdl-border-subtle);
  border-radius: var(--kdl-radius-sm);
  padding: 2px var(--kdl-space-1);
}

/* 5. Filter context — one line at rest, with a ROLE LABEL on it. Without the
      "Under filters:" prefix this run reads as the anchor itself, which is
      the confusion that put it here. */
.cc__context { margin-top: var(--kdl-space-2); }
.cc__context-toggle {
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  font-size: var(--kdl-font-size-overline);
  color: var(--kdl-text-hint);
  text-align: left;
  cursor: pointer;
}
.cc__context-toggle:hover { color: var(--kdl-text-muted); }
.cc__filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--kdl-space-1);
  margin-top: var(--kdl-space-2);
}
.cc__filter {
  font-size: var(--kdl-font-size-overline);
  color: var(--kdl-text-muted);
  border: var(--kdl-border-width) dashed var(--kdl-border);
  border-radius: var(--kdl-radius-sm);
  padding: 2px var(--kdl-space-1);
}
/* The values toggle wears the chip's clothes so the run still reads as one
   line of context, but it is a real <button> — operable by keyboard and
   announced as expandable, which a clickable <span> would not be. Solid
   border rather than the chips' dashed one is the "actionable" tell; the
   label carries the affordance in words, so it never rests on style alone.

   Longhands, NOT `font: inherit`: the shorthand resets font-size and would
   force this rule to restate the size .cc__filter already owns. */
.cc__filter--more {
  font-family: inherit;
  font-weight: inherit;
  line-height: inherit;
  background: none;
  border-style: solid;
  cursor: pointer;
}
.cc__filter--more:hover { color: var(--kdl-text-primary); }

/* 6. One row of "what do I do with this". */
.cc__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--kdl-space-2);
  margin-top: var(--kdl-space-3);
}
.cc__assign { display: flex; align-items: center; gap: var(--kdl-space-2); flex-wrap: wrap; min-width: 0; }
.cc__assign label { font-size: var(--kdl-font-size-overline); color: var(--kdl-text-hint); }
/* The read-only assignment chip an auditor sees. Reads as metadata, not as an
   action — that role cannot reassign, so anything pressable would be a lie. */
.cc__assignee {
  font-size: var(--kdl-font-size-overline);
  color: var(--kdl-text-secondary);
  background: var(--kdl-border-subtle);
  border-radius: var(--kdl-radius-sm);
  padding: 2px var(--kdl-space-1);
  white-space: nowrap;
}
.cc__assignee-tag { color: var(--kdl-text-hint); margin-right: var(--kdl-space-1); }
/* A seat that has been stood down. Colour is the tell, but the chip also SAYS
   "no longer active" in words, so it never rests on colour alone. */
.cc__assignee--stale { color: var(--kdl-status-warning); }
.cc__actions { display: flex; align-items: center; gap: var(--kdl-space-1); flex-wrap: wrap; }
.cc__drill { display: inline-flex; }

/* 7-8. The drawers — a LAYER under the row, not another box on top of it.
        Sunken surface, full row bleed, no border and no radius: the moment
        this gets an edge it becomes the third nested frame again. */
.cc__drawer {
  margin-top: var(--kdl-space-3);
  padding: var(--kdl-space-3);
  background: var(--kdl-surface-sunken);
}
.cc__drawer-lead {
  margin: 0 0 var(--kdl-space-2);
  font-size: var(--kdl-font-size-caption);
  color: var(--kdl-text-muted);
}
.cc__recon--plain { color: var(--kdl-text-muted); }
.cc__recon--ok { color: var(--kdl-status-success); }
.cc__recon--bad { color: var(--kdl-status-danger); font-weight: 600; }

.cc__lines { overflow-x: auto; }
.cc__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--kdl-font-size-caption);
  color: var(--kdl-text-secondary);
}
.cc__table th, .cc__table td {
  text-align: left;
  padding: var(--kdl-space-1) var(--kdl-space-2);
  border-bottom: var(--kdl-border-width) solid var(--kdl-border-subtle);
  white-space: nowrap;
}
.cc__table tr:last-child td { border-bottom: none; }
.cc__table th {
  color: var(--kdl-text-hint);
  font-weight: 500;
  font-size: var(--kdl-font-size-overline);
}
.ta-r { text-align: right; font-variant-numeric: tabular-nums; }
.cc__note { font-size: var(--kdl-font-size-overline); color: var(--kdl-text-hint); margin-top: var(--kdl-space-1); }

.cc__history { margin: 0; padding: 0; list-style: none; }
.cc__history-item {
  display: flex;
  flex-direction: column;
  gap: var(--kdl-space-1);
  padding: var(--kdl-space-2) 0;
  border-bottom: var(--kdl-border-width) solid var(--kdl-border-subtle);
}
.cc__history-item:last-child { border-bottom: none; }
.cc__history-meta { font-size: var(--kdl-font-size-overline); color: var(--kdl-text-hint); }
.cc__history-text {
  font-size: var(--kdl-font-size-caption);
  color: var(--kdl-text-muted);
  white-space: pre-wrap;
}

.cc__thread-heading {
  margin: 0 0 var(--kdl-space-2);
  font-size: var(--kdl-font-size-overline);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .04em;
  color: var(--kdl-text-hint);
}
</style>
