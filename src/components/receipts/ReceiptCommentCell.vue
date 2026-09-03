<!--
  ReceiptCommentCell — inline commenting from an Audit → Receipts table row.

  The register is triaged a row at a time; opening the detail modal just to
  leave a one-line note is the slowest possible path. This cell IS the comment
  affordance: the icon+count doubles as the trigger, and the popover holds the
  threaded conversation (CommentThread) plus a composer.

  WHY a popover and not an expanded row: KTable's API is frozen (no expanded-row
  slot), and a portalled popover cannot be clipped by the table's overflow or
  push row heights around mid-triage.

  Props:
    sha256 (String, required) — the receipt being commented on
    count  (Number)           — comment_count from the list row; the cell renders
                                it and keeps it in step optimistically after a post
    currentUser (String)      — username, so your own comments read "(you)"

  Emits:
    added ({ sha256, comment, count }) — after a successful POST, so the page can
                                bump the row's comment_count without a reload

  The thread is fetched lazily on first open (one request per row, never on list
  render). A failed fetch degrades to input-only — you can still leave a comment.
-->
<template>
  <!-- @click.stop: the row click opens the detail modal; commenting must not. -->
  <span class="rcc" @click.stop>
    <KPopover v-model="open" side="bottom" align="end">
      <template #trigger>
        <button
          type="button"
          class="rcc__trigger"
          :class="{ 'rcc__trigger--empty': !displayCount }"
          :title="triggerLabel"
          :aria-label="triggerLabel"
          data-test="inline-comment-trigger"
        >
          <!-- Lucide message-circle — the house comment glyph (AuditFindings quick actions) -->
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
          <span class="rcc__count" data-test="inline-comment-count">{{ displayCount }}</span>
        </button>
      </template>

      <div class="rcc__panel">
        <h4 class="rcc__heading">Comments</h4>
        <CommentThread
          ref="threadRef"
          dense
          :comments="thread"
          :saving="saving"
          :error="error"
          :loading="loading"
          :currentUser="currentUser"
          @post="submit"
        />
      </div>
    </KPopover>
  </span>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import KPopover from '../klikk/KPopover.vue';
import CommentThread from '../comments/CommentThread.vue';
import { getReceipt, postReceiptComment } from '../../api/receipts';

const props = defineProps({
  sha256: { type: String, required: true },
  count: { type: Number, default: 0 },
  // Passed down rather than read from the auth store: this is a leaf cell
  // rendered once per row, and a store dependency here buys nothing.
  currentUser: { type: String, default: '' },
});

const emit = defineEmits(['added']);

const open = ref(false);
const saving = ref(false);
const loading = ref(false);
const loaded = ref(false);
const error = ref('');
const thread = ref([]);
const threadRef = ref(null);


// Locally-posted comments must show immediately even before/without a fetch,
// so the count is max(server count, what we know about) rather than either one.
const localCount = ref(0);
const displayCount = computed(
  () => Math.max(Number(props.count) || 0, localCount.value, thread.value.length),
);

const triggerLabel = computed(() => {
  const n = displayCount.value;
  return n ? `${n} comment${n === 1 ? '' : 's'} — click to read or add` : 'Add a comment';
});

watch(open, async (isOpen) => {
  if (!isOpen) {
    error.value = '';
    return;
  }
  if (loaded.value || loading.value) return;
  loading.value = true;
  try {
    const full = await getReceipt(props.sha256);
    thread.value = Array.isArray(full?.comments) ? full.comments : [];
    loaded.value = true;
  } catch {
    // Degrade to input-only: not being able to READ the thread must not stop a
    // triage note being WRITTEN. The post path reports its own failures.
    loaded.value = false;
  } finally {
    loading.value = false;
  }
});

async function submit({ text, parentId = null } = {}) {
  const body = String(text || '').trim();
  if (!body || saving.value) return;
  saving.value = true;
  error.value = '';
  try {
    // Only send the options object when it carries something: a top-level post
    // stays byte-identical to the pre-threading request.
    const created = parentId == null
      ? await postReceiptComment(props.sha256, body)
      : await postReceiptComment(props.sha256, body, { parentId });
    const comment =
      created && typeof created === 'object'
        ? created
        : { id: `local-${Date.now()}`, parent_id: parentId, text: body, author: '', created_at: null };
    thread.value = [...thread.value, comment];
    localCount.value = Math.max(Number(props.count) || 0, localCount.value + 1, thread.value.length);
    // Only now is the draft safe to drop — a failed post keeps it for retry.
    threadRef.value?.clearDraft?.();
    emit('added', { sha256: props.sha256, comment, count: displayCount.value });
  } catch {
    error.value = 'Could not post — try again.';
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.rcc {
  display: inline-flex;
}

.rcc__trigger {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border: 1px solid var(--kdl-border);
  border-radius: 6px;
  background: var(--kdl-card-bg);
  color: var(--kdl-text-primary);
  font-size: 12px;
  line-height: 1.4;
  cursor: pointer;
  transition: background-color var(--duration-short) var(--ease-standard),
              border-color var(--duration-short) var(--ease-standard),
              color var(--duration-short) var(--ease-standard);
}

.rcc__trigger:hover {
  background: var(--kdl-hover-bg);
}

.rcc__trigger:focus-visible {
  outline: 2px solid var(--kdl-accent);
  outline-offset: 1px;
}

/* Zero comments is the common case — recede, but stay a real target. */
.rcc__trigger--empty {
  color: var(--kdl-text-muted);
  border-color: transparent;
}

.rcc__count {
  font-variant-numeric: tabular-nums;
}

.rcc__panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 320px;
  max-width: 100%;
}

.rcc__heading {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--kdl-text-secondary);
  margin: 0;
}














</style>
