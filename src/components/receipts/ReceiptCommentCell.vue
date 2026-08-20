<!--
  ReceiptCommentCell — inline commenting from an Audit → Receipts table row.

  The register is triaged a row at a time; opening the detail modal just to
  leave a one-line note is the slowest possible path. This cell IS the comment
  affordance: the count doubles as the trigger, and the popover holds the
  existing thread plus a single-line input that posts on Enter.

  WHY a popover and not an expanded row: KTable's API is frozen (no expanded-row
  slot), and a portalled popover cannot be clipped by the table's overflow or
  push row heights around mid-triage.

  Props:
    sha256 (String, required) — the receipt being commented on
    count  (Number)           — comment_count from the list row; the cell renders
                                it and keeps it in step optimistically after a post

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
          <!-- Lucide message-square -->
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span class="rcc__count" data-test="inline-comment-count">{{ displayCount }}</span>
        </button>
      </template>

      <div class="rcc__panel">
        <h4 class="rcc__heading">Comments</h4>

        <ul v-if="thread.length" class="rcc__thread" data-test="inline-comment-thread">
          <li v-for="c in thread" :key="c.id" class="rcc__comment">
            <div class="rcc__comment-meta">
              <span class="rcc__author">{{ c.author || 'Unknown' }}</span>
              <span>{{ formatDateTime(c.created_at) }}</span>
            </div>
            <p class="rcc__comment-text">{{ c.text }}</p>
          </li>
        </ul>
        <p v-else-if="loading" class="rcc__muted">Loading…</p>
        <p v-else class="rcc__muted">No comments yet.</p>

        <form class="rcc__form" @submit.prevent="submit">
          <label class="rcc__label" :for="inputId">Add a comment</label>
          <input
            :id="inputId"
            ref="inputRef"
            v-model="draft"
            type="text"
            class="rcc__input"
            placeholder="Add a comment…"
            :disabled="saving"
            data-test="inline-comment-input"
          />
          <div class="rcc__actions">
            <span v-if="error" class="rcc__error" role="alert" data-test="inline-comment-error">{{ error }}</span>
            <span v-else class="rcc__spacer" />
            <button
              type="submit"
              class="btn btn-primary btn-xs"
              :disabled="!draft.trim() || saving"
              data-test="inline-comment-submit"
            >
              {{ saving ? 'Posting…' : 'Comment' }}
            </button>
          </div>
        </form>
      </div>
    </KPopover>
  </span>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import KPopover from '../klikk/KPopover.vue';
import { getReceipt, postReceiptComment } from '../../api/receipts';
import { formatDateTime } from '../../utils/receipts';

const props = defineProps({
  sha256: { type: String, required: true },
  count: { type: Number, default: 0 },
});

const emit = defineEmits(['added']);

const open = ref(false);
const draft = ref('');
const saving = ref(false);
const loading = ref(false);
const loaded = ref(false);
const error = ref('');
const thread = ref([]);
const inputRef = ref(null);

// Locally-posted comments must show immediately even before/without a fetch,
// so the count is max(server count, what we know about) rather than either one.
const localCount = ref(0);
const displayCount = computed(
  () => Math.max(Number(props.count) || 0, localCount.value, thread.value.length),
);

const inputId = computed(() => `rcc-input-${String(props.sha256).slice(0, 12)}`);
const triggerLabel = computed(() => {
  const n = displayCount.value;
  return n ? `${n} comment${n === 1 ? '' : 's'} — click to read or add` : 'Add a comment';
});

watch(open, async (isOpen) => {
  if (!isOpen) {
    error.value = '';
    return;
  }
  await nextTick();
  inputRef.value?.focus?.();
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

async function submit() {
  const text = draft.value.trim();
  if (!text || saving.value) return;
  saving.value = true;
  error.value = '';
  try {
    const created = await postReceiptComment(props.sha256, text);
    const comment =
      created && typeof created === 'object'
        ? created
        : { id: `local-${Date.now()}`, text, author: '', created_at: null };
    thread.value = [...thread.value, comment];
    localCount.value = Math.max(Number(props.count) || 0, localCount.value + 1, thread.value.length);
    draft.value = '';
    emit('added', { sha256: props.sha256, comment, count: displayCount.value });
    inputRef.value?.focus?.();
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

.rcc__thread {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 200px;
  overflow-y: auto;
}

.rcc__comment {
  padding: 6px 8px;
  border: 1px solid var(--kdl-border-subtle, var(--kdl-border));
  border-radius: 6px;
  background: var(--kdl-hover-bg);
}

.rcc__comment-meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  color: var(--kdl-text-muted);
}

.rcc__author {
  font-weight: 600;
  color: var(--kdl-text-secondary);
}

.rcc__comment-text {
  margin: 2px 0 0;
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
}

.rcc__muted {
  margin: 0;
  font-size: 12px;
  color: var(--kdl-text-muted);
}

.rcc__form {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rcc__label {
  font-size: 11px;
  font-weight: 500;
  color: var(--kdl-text-secondary);
}

.rcc__input {
  width: 100%;
  font: inherit;
  font-size: 13px;
  padding: 6px 8px;
  border: 1px solid var(--kdl-border);
  border-radius: 6px;
  background: var(--kdl-card-bg);
  color: var(--kdl-text-primary);
}

.rcc__input:focus-visible {
  outline: 2px solid var(--kdl-accent);
  outline-offset: -1px;
}

.rcc__input:disabled {
  opacity: 0.6;
}

.rcc__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.rcc__spacer {
  flex: 1 1 auto;
}

.rcc__error {
  font-size: 11px;
  color: var(--kdl-text-muted);
}
</style>
