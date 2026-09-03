<!--
  CommentThread — one receipt's or one finding's comment thread, threaded one
  level deep.

  The server stores a flat list with a nullable `parent_id` (SlipComment.parent /
  AuditFindingComment.parent) and guarantees the tree is never deeper than
  parent → replies: replying to a reply re-parents onto the root. This component
  mirrors that guarantee rather than recursing — a reply whose parent is not in
  the list is promoted to top level so an out-of-order or partially-loaded thread
  still renders every comment. Nothing may be silently dropped from an audit
  trail.

  Deliberately dumb: it owns the draft state and nothing else. Posting is the
  parent's job (the API call, the optimistic append, the error copy), because the
  register cell and the detail dialog report failures in different places.

  Props:
    comments (Array)   — [{ id, parent_id, author, text, created_at }]
    saving   (Boolean) — a post is in flight; composers lock
    error    (String)  — message to show under the composer
    loading  (Boolean) — thread still being fetched
    dense    (Boolean) — the register-cell variant (tighter, no headings)
    currentUser (String) — marks "you" on your own comments

  Emits:
    post ({ text, parentId }) — parentId is null for a new top-level comment
-->
<template>
  <div class="ct" :class="{ 'ct--dense': dense }">
    <ul v-if="tree.length" class="ct__list" data-test="comment-thread">
      <li v-for="node in tree" :key="node.id" class="ct__node">
        <article class="ct__comment" data-test="comment">
          <header class="ct__meta">
            <span class="ct__author" data-test="comment-author">{{ authorLabel(node) }}</span>
            <time class="ct__time" :datetime="node.created_at || undefined">
              {{ formatDateTime(node.created_at) }}
            </time>
          </header>
          <p class="ct__text">{{ node.text }}</p>
          <button
            type="button"
            class="ct__reply-btn"
            :disabled="saving"
            :data-test="`comment-reply-${node.id}`"
            @click="toggleReply(node.id)"
          >
            {{ replyingTo === node.id ? 'Cancel' : 'Reply' }}
          </button>
        </article>

        <ul v-if="node.replies.length || replyingTo === node.id" class="ct__replies">
          <li v-for="reply in node.replies" :key="reply.id" class="ct__node">
            <article class="ct__comment ct__comment--reply" data-test="comment-reply">
              <header class="ct__meta">
                <span class="ct__author" data-test="comment-author">{{ authorLabel(reply) }}</span>
                <time class="ct__time" :datetime="reply.created_at || undefined">
                  {{ formatDateTime(reply.created_at) }}
                </time>
              </header>
              <p class="ct__text">{{ reply.text }}</p>
              <!-- Replying to a reply is allowed; the server flattens it onto
                   this root, so the affordance never creates a third level. -->
              <button
                type="button"
                class="ct__reply-btn"
                :disabled="saving"
                :data-test="`comment-reply-${reply.id}`"
                @click="toggleReply(node.id)"
              >
                Reply
              </button>
            </article>
          </li>

          <li v-if="replyingTo === node.id" class="ct__node">
            <form class="ct__form ct__form--reply" @submit.prevent="submitReply(node.id)">
              <textarea
                ref="replyInputRef"
                v-model="replyDraft"
                class="ct__input"
                rows="2"
                placeholder="Write a reply…"
                :disabled="saving"
                :data-test="`comment-reply-input-${node.id}`"
              />
              <div class="ct__actions">
                <button
                  type="submit"
                  class="btn btn-ghost btn-xs"
                  :disabled="!replyDraft.trim() || saving"
                  :data-test="`comment-reply-submit-${node.id}`"
                >
                  {{ saving ? 'Posting…' : 'Post reply' }}
                </button>
              </div>
            </form>
          </li>
        </ul>
      </li>
    </ul>
    <p v-else-if="loading" class="ct__muted">Loading…</p>
    <p v-else class="ct__muted">No comments yet.</p>

    <form class="ct__form" @submit.prevent="submitTopLevel">
      <textarea
        ref="topInputRef"
        v-model="draft"
        class="ct__input"
        :rows="dense ? 1 : 2"
        placeholder="Add a comment…"
        :disabled="saving"
        data-test="comment-input"
      />
      <div class="ct__actions">
        <span v-if="error" class="ct__error" role="alert" data-test="comment-error">{{ error }}</span>
        <span v-else class="ct__spacer" />
        <button
          type="submit"
          class="btn btn-ghost btn-xs"
          :disabled="!draft.trim() || saving"
          data-test="comment-submit"
        >
          {{ saving ? 'Posting…' : 'Add comment' }}
        </button>
      </div>
    </form>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue';
import { formatDateTime } from '../../utils/receipts';

const props = defineProps({
  comments: { type: Array, default: () => [] },
  saving: { type: Boolean, default: false },
  error: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  dense: { type: Boolean, default: false },
  currentUser: { type: String, default: '' },
});

const emit = defineEmits(['post']);

const draft = ref('');
const replyDraft = ref('');
const replyingTo = ref(null);
const topInputRef = ref(null);
const replyInputRef = ref(null);

/**
 * Flat list → one level of nesting. A reply whose parent is missing from the
 * list is promoted to top level rather than dropped: a partially-loaded or
 * out-of-order thread must still show every comment.
 */
const tree = computed(() => {
  const list = Array.isArray(props.comments) ? props.comments : [];
  const roots = [];
  const byId = new Map();
  for (const c of list) {
    if (!c || c.id === undefined || c.id === null) continue;
    const node = { ...c, replies: [] };
    byId.set(String(c.id), node);
    if (c.parent_id === null || c.parent_id === undefined) roots.push(node);
  }
  for (const c of list) {
    if (!c || c.parent_id === null || c.parent_id === undefined) continue;
    const node = byId.get(String(c.id));
    if (!node) continue;
    const parent = byId.get(String(c.parent_id));
    if (parent && parent !== node) parent.replies.push(node);
    else roots.push(node); // orphan — never lose it
  }
  return roots;
});

function authorLabel(c) {
  const author = c.author || 'Unknown';
  return props.currentUser && author === props.currentUser ? `${author} (you)` : author;
}

async function toggleReply(id) {
  replyingTo.value = replyingTo.value === id ? null : id;
  replyDraft.value = '';
  if (replyingTo.value === null) return;
  await nextTick();
  const el = Array.isArray(replyInputRef.value) ? replyInputRef.value[0] : replyInputRef.value;
  el?.focus?.();
}

/** Which composer fired the in-flight post, so clearDraft() clears the right one. */
const lastScope = ref(null);

function submitTopLevel() {
  const text = draft.value.trim();
  if (!text || props.saving) return;
  lastScope.value = 'top';
  emit('post', { text, parentId: null });
}

function submitReply(parentId) {
  const text = replyDraft.value.trim();
  if (!text || props.saving) return;
  lastScope.value = 'reply';
  emit('post', { text, parentId });
}

/**
 * Called by the parent ONLY after a post actually succeeded.
 *
 * The draft is deliberately not cleared on submit: a failed post that also ate
 * what you typed is the worst version of this control, and a long comment is
 * exactly the kind of thing that is painful to retype. The parent owns the
 * network result, so the parent says when the draft is safe to drop.
 */
function clearDraft() {
  if (lastScope.value === 'reply') {
    replyDraft.value = '';
    replyingTo.value = null;
  } else {
    draft.value = '';
  }
  lastScope.value = null;
}

defineExpose({
  focus: () => topInputRef.value?.focus?.(),
  clearDraft,
});
</script>

<style scoped>
.ct {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ct__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ct--dense .ct__list {
  max-height: 240px;
  overflow-y: auto;
  gap: 6px;
}

.ct__node {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ct__comment {
  padding: 6px 8px;
  border: 1px solid var(--kdl-border-subtle, var(--kdl-border));
  border-radius: 6px;
  background: var(--kdl-hover-bg);
}

/* The indent IS the parent/child relationship — keep the rail visible so a
   reply is never mistaken for a top-level comment. */
.ct__replies {
  list-style: none;
  margin: 0 0 0 16px;
  padding-left: 10px;
  border-left: 2px solid var(--kdl-border);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ct__comment--reply {
  background: var(--kdl-card-bg);
}

.ct__meta {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  font-size: 11px;
  color: var(--kdl-text-muted);
}

.ct__author {
  font-weight: 600;
  color: var(--kdl-text-secondary);
  overflow-wrap: anywhere;
}

.ct__time {
  white-space: nowrap;
}

.ct__text {
  margin: 2px 0 0;
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.ct__reply-btn {
  margin-top: 4px;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-size: 11px;
  font-weight: 500;
  color: var(--kdl-text-secondary);
  cursor: pointer;
}

.ct__reply-btn:hover:not(:disabled) {
  color: var(--kdl-accent);
  text-decoration: underline;
}

.ct__reply-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.ct__reply-btn:focus-visible {
  outline: 2px solid var(--kdl-accent);
  outline-offset: 2px;
}

.ct__form {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ct__form--reply {
  margin-left: 16px;
}

.ct__input {
  width: 100%;
  font: inherit;
  font-size: 13px;
  padding: 6px 8px;
  border: 1px solid var(--kdl-border);
  border-radius: 6px;
  background: var(--kdl-card-bg);
  color: var(--kdl-text-primary);
  resize: vertical;
}

.ct__input:focus-visible {
  outline: 2px solid var(--kdl-accent);
  outline-offset: -1px;
}

.ct__input:disabled {
  opacity: 0.6;
}

.ct__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.ct__spacer {
  flex: 1 1 auto;
}

.ct__error {
  flex: 1 1 auto;
  font-size: 11px;
  color: var(--kdl-text-muted);
}

.ct__muted {
  margin: 0;
  font-size: 12px;
  color: var(--kdl-text-muted);
}
</style>
