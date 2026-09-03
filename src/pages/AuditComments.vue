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
      <KInput
        v-model="filters.q"
        label="Search"
        placeholder="Comment text, account, supplier…"
        clearable
        :debounce="300"
        class="flex-1 min-w-56"
      />
    </FilterBar>

    <SectionCard>
      <KSpinner v-if="loading && !rows.length" size="sm" tone="accent" />
      <EmptyState
        v-else-if="!loading && !error && rows.length === 0"
        title="Nothing here"
        :body="emptyBody"
      />
      <div v-else class="cc-list">
        <article v-for="row in rows" :key="row.id" class="cc">
          <header class="cc__head">
            <div class="cc__who">
              <KBadge :tone="row.status === 'open' ? 'warning' : 'neutral'">
                {{ row.status }}
              </KBadge>
              <KBadge v-if="row.subject_type !== 'cube_cell'" tone="info">
                {{ kindLabel(row.subject_type) }}
              </KBadge>
              <strong class="cc__author">{{ row.author || 'unattributed' }}</strong>
              <span class="cc__when">{{ formatWhen(row.updated_at) }}</span>
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
          </header>

          <p v-if="row.subject_label" class="cc__subject">{{ row.subject_label }}</p>
          <p class="cc__text">{{ row.comment }}</p>

          <!-- The verdict answers a different question from the status: what
               IS this, versus have we finished with it. -->
          <div v-if="row.subject_type !== 'cube_cell'" class="cc__verdict">
            <!-- Recording a verdict POSTs to /xero/data/comments/, which 403s
                 for an auditor. The tags beside it are read-only, so they stay. -->
            <template v-if="!isAuditor">
              <label :for="'dec-' + row.id">Verdict</label>
              <select
                :id="'dec-' + row.id"
                :value="row.decision || ''"
                :disabled="busyId === row.id"
                @change="setDecision(row, $event.target.value)"
              >
                <option v-for="d in DECISIONS" :key="d.value" :value="d.value">{{ d.label }}</option>
              </select>
            </template>
            <span v-if="row.tags && row.tags.length" class="cc__tags">
              <span v-for="t in row.tags" :key="t" class="cc__tag">{{ t }}</span>
            </span>
          </div>

          <!-- The anchor, shown as coordinates. This is what the comment is
               ABOUT; without it the note is just a sentence. -->
          <div v-if="row.subject_type === 'cube_cell'" class="cc__coords">
            <span v-for="(v, k) in coordsOf(row)" :key="k" class="cc__coord">
              <span class="cc__dim">{{ k }}</span>{{ v }}
            </span>
            <span class="cc__measure">{{ row.measure }}</span>
            <span v-if="row.cell_value !== null" class="cc__value">{{ money(row.cell_value) }}</span>
          </div>

          <!-- Filters are part of the anchor: the same coordinates under a
               different date window is a different number. Showing them is the
               difference between a reader trusting the figure and guessing. -->
          <div v-if="hasFilters(row)" :id="`cc-filters-${row.id}`" class="cc__filters">
            <span v-for="chip in shownChips(row)" :key="chip.key" class="cc__filter">
              {{ chipText(row, chip) }}
            </span>
            <button
              v-if="chipOverflow(row)"
              type="button"
              class="cc__filter cc__filter--more"
              :aria-expanded="!!openFilters[row.id]"
              :aria-controls="`cc-filters-${row.id}`"
              @click="toggleFilters(row)"
            >
              {{ openFilters[row.id] ? 'Show less' : `+${chipOverflow(row)} more` }}
            </button>
          </div>

          <!-- The drill resolves journal lines from /xero/data/journals/pivot/
               — 403 for an auditor, so the affordance goes with it. -->
          <div v-if="!isAuditor && row.subject_type === 'cube_cell'" class="cc__drill">
            <button
              class="btn btn-ghost btn-sm"
              :disabled="drillBusy === row.id"
              @click="toggleDrill(row)"
            >
              {{ drillBusy === row.id
                ? 'Resolving…'
                : (drills[row.id] ? 'Hide transactions' : 'Show transactions') }}
            </button>

            <span v-if="drills[row.id]" class="cc__recon" :class="reconClass(row)">
              {{ reconText(row) }}
            </span>
          </div>

          <div v-if="!isAuditor && row.subject_type === 'cube_cell' && drills[row.id]" class="cc__lines">
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
            <p v-if="drills[row.id].truncated" class="cc__note">
              Line cap reached — this shows the first {{ drills[row.id].rows.length }}.
            </p>
          </div>

          <!-- The same thread as the row icon, in the expanded detail.
               Deliberately ONE store behind both: a reply posted in the
               popover appears here without a reload, and vice versa — two
               views of one discussion that disagree would be worse than one. -->
          <section v-if="isExpanded(row)" class="cc__thread" data-test="cc-detail-thread">
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
  setCommentDecision,
  setCubeCommentStatus,
  drillCubeComment,
  commentCoordinates,
  normaliseFilters,
} from '../api/cubeComments';
import { useAuthStore } from '../stores/auth';
import { useCommentFeed } from '../composables/useCommentFeed';
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

const filters = reactive({ status: 'open', subject_type: '', decision: '', author: '', q: '' });

// A comment with neither author_key nor author. Not a stored value — "" means
// "no author filter" — so the two need separate tokens.
const NO_AUTHOR = '__no_author__';

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
  try {
    const params = { status: filters.status, limit: 2000 };
    if (filters.subject_type) params.subject_type = filters.subject_type;
    // "__none__" cannot be a server-side equality filter -- an empty decision is
    // the ABSENCE of one -- so it is applied client-side below.
    if (filters.decision && filters.decision !== '__none__') params.decision = filters.decision;
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

async function setDecision(row, decision) {
  busyId.value = row.id;
  actionError.value = null;
  try {
    const updated = await setCommentDecision(row, decision);
    row.decision = updated.decision;
    if (filters.decision && filters.decision !== '__none__'
        && updated.decision !== filters.decision) {
      all.value = all.value.filter((r) => r.id !== row.id);
    }
  } catch (e) {
    actionError.value = e?.response?.data?.error || e.message || 'Could not record that verdict.';
  } finally {
    busyId.value = null;
  }
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

const FILTER_CHIPS_SHOWN = 4;
const FILTER_VALUES_SHOWN = 3;

// row.id -> expanded. Per row, so opening one card's filters does not open
// every card's.
const openFilters = reactive({});

function toggleFilters(row) { openFilters[row.id] = !openFilters[row.id]; }

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

function hasFilters(row) { return filterChips(row).length > 0; }

function shownChips(row) {
  const chips = filterChips(row);
  return openFilters[row.id] ? chips : chips.slice(0, FILTER_CHIPS_SHOWN);
}

/** One chip: "year: 2015, 2016, 2017 +9 more" collapsed, all of it expanded. */
function chipText(row, chip) {
  const vals = chip.values;
  if (openFilters[row.id] || vals.length <= FILTER_VALUES_SHOWN) {
    return `${chip.label}: ${vals.join(', ')}`;
  }
  const head = vals.slice(0, FILTER_VALUES_SHOWN).join(', ');
  return `${chip.label}: ${head} +${vals.length - FILTER_VALUES_SHOWN} more`;
}

/**
 * How much folding is going on — 0 when the whole anchor is already visible,
 * so the toggle does not appear on the short anchors most comments carry.
 * Counts hidden CHIPS plus hidden VALUES, because a single chip holding a
 * hundred and forty-four months is the case this exists for.
 */
function chipOverflow(row) {
  // Deliberately independent of the open state: this is how much WOULD be
  // folded, so the toggle stays put once expanded. Deriving it from the
  // current state made "Show less" disappear on a card whose overflow was all
  // values and no extra chips — expanded, with no way back.
  const chips = filterChips(row);
  const hiddenChips = Math.max(0, chips.length - FILTER_CHIPS_SHOWN);
  const hiddenValues = chips.slice(0, FILTER_CHIPS_SHOWN)
    .reduce((n, c) => n + Math.max(0, c.values.length - FILTER_VALUES_SHOWN), 0);
  return hiddenChips + hiddenValues;
}

function money(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
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

watch(() => [filters.status, filters.subject_type, filters.decision], load);
onMounted(load);
</script>

<style scoped>
.cc-undo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  margin-bottom: 12px;
  border: 1px solid var(--k-border, #e3e3e3);
  border-radius: 6px;
  background: var(--k-subtle, #f3f4f6);
  font-size: 12.5px;
}
.cc-undo > span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.cc-list { display: flex; flex-direction: column; gap: 10px; }
.cc {
  border: 1px solid var(--k-border, #e3e3e3);
  border-radius: 8px;
  padding: 10px 12px;
}
.cc__head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.cc__who { display: flex; align-items: center; gap: 8px; min-width: 0; }
.cc__author { font-size: 13px; }
.cc__when { font-size: 11px; opacity: .6; }
.cc__actions { display: flex; gap: 4px; flex: 0 0 auto; }
.cc__text { margin: 8px 0; white-space: pre-wrap; }
.cc__subject { margin: 6px 0 0; font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; }
.cc__verdict { display: flex; align-items: center; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
.cc__verdict label { font-size: 11px; opacity: .65; }
.cc__tags { display: flex; gap: 4px; flex-wrap: wrap; }
.cc__tag { font-size: 10.5px; background: var(--k-subtle, #f3f4f6); border-radius: 3px; padding: 1px 5px; }
.cc__coords { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.cc__coord {
  font-size: 11px;
  background: var(--k-subtle, #f3f4f6);
  border-radius: 4px;
  padding: 2px 6px;
}
.cc__dim { opacity: .6; margin-right: 4px; }
.cc__measure { font-size: 11px; opacity: .6; }
.cc__value { font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; }
.cc__filters { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 5px; }
.cc__filter { font-size: 10.5px; opacity: .65; border: 1px dashed var(--k-border, #ddd); border-radius: 4px; padding: 1px 5px; }
/* The expand toggle wears the chip's clothes so the row still reads as one
   line of context, but it is a real <button> — operable by keyboard and
   announced as expandable, which a clickable <span> would not be.
   Solid border rather than the chips' dashed one is the "actionable" tell; the
   label ("+N more" / "Show less") carries the affordance in words, so it never
   rests on style alone.

   Longhands, NOT `font: inherit`: the shorthand resets font-size and would
   force this rule to restate the 10.5px that .cc__filter already owns — a
   duplicated literal born from a reset, and one that silently drifts the day
   someone changes the chip.

   No :focus-visible rule here on purpose. klikk.css authors the ring globally
   and overrides it to navy in light mode; restating the `outline` shorthand
   locally re-sets outline-color and quietly defeats that, which is exactly the
   defect this file would have inherited by copying the six K-components that
   do it. Override the property, never the shorthand. */
.cc__filter--more {
  font-family: inherit;
  font-weight: inherit;
  line-height: inherit;
  color: inherit;
  background: none;
  border-style: solid;
  cursor: pointer;
  opacity: .8;
}
.cc__filter--more:hover { opacity: 1; }
.cc__drill { display: flex; align-items: center; gap: 10px; margin-top: 8px; flex-wrap: wrap; }
.cc__recon { font-size: 11.5px; }
.cc__recon--ok { color: var(--k-success, #157347); }
.cc__recon--bad { color: var(--k-danger, #b02a37); font-weight: 600; }
.cc__lines { margin-top: 8px; overflow-x: auto; }
.cc__table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
.cc__table th, .cc__table td {
  text-align: left;
  padding: 3px 6px;
  border-bottom: 1px solid var(--k-border, #eee);
  white-space: nowrap;
}
.cc__table th { opacity: .65; font-weight: 500; }
.ta-r { text-align: right; font-variant-numeric: tabular-nums; }
.cc__note { font-size: 11px; opacity: .65; margin-top: 4px; }
.cc__thread { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--k-border, #eee); }
.cc__thread-heading {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .04em;
  opacity: .65;
}
</style>
