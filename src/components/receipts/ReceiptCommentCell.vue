<!--
  ReceiptCommentCell — the receipts-register binding of CommentPopoverCell.

  Everything about the icon, the popover and the thread lives in
  CommentPopoverCell; this wrapper exists only to bind the two receipts API
  calls and to keep the `added` payload carrying the sha256 the page needs.

  Props:
    sha256      (String, required) — the receipt being commented on
    count       (Number)           — comment_count from the list row
    currentUser (String)           — marks your own comments "(you)"

  Emits:
    added ({ sha256, comment, count }) — after a successful POST, so the page
                                can bump the row's comment_count without a reload
-->
<template>
  <CommentPopoverCell
    ref="cellRef"
    :count="count"
    :currentUser="currentUser"
    :load="loadThread"
    :post="postComment"
    @added="onAdded"
  />
</template>

<script setup>
import { ref } from 'vue';
import CommentPopoverCell from '../comments/CommentPopoverCell.vue';
import { getReceipt, postReceiptComment } from '../../api/receipts';

const props = defineProps({
  sha256: { type: String, required: true },
  count: { type: Number, default: 0 },
  currentUser: { type: String, default: '' },
});

const emit = defineEmits(['added']);

const cellRef = ref(null);

async function loadThread() {
  const full = await getReceipt(props.sha256);
  return Array.isArray(full?.comments) ? full.comments : [];
}

function postComment({ text, parentId }) {
  // Only send the options object when it carries something: a top-level post
  // stays byte-identical to the pre-threading request.
  return parentId == null
    ? postReceiptComment(props.sha256, text)
    : postReceiptComment(props.sha256, text, { parentId });
}

function onAdded({ comment, count }) {
  emit('added', { sha256: props.sha256, comment, count });
}

defineExpose({
  mergeComment: (comment) => cellRef.value?.mergeComment?.(comment),
});
</script>
