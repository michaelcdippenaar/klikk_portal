<!--
  CubeCommentThreadCell — the cell-comments binding of CommentPopoverCell.

  Third register to get the same affordance (receipts, findings, now cube
  cells): one glyph, one count, one thread. MC asked for threads "across all
  comments", and three registers that discuss differently would be three things
  to learn.

  The only thing this wrapper owns is which two functions fetch and post, so
  the /audit/cube-comments/ vocabulary stays at the edge.

  Props:
    commentId   (Number|String, required) — the cube comment being replied to
    count       (Number)  — reply_count from the list row
    currentUser (String)  — marks your own replies "(you)"

  Emits:
    added ({ commentId, comment, count })
-->
<template>
  <CommentPopoverCell
    ref="cellRef"
    :count="count"
    :currentUser="currentUser"
    :load="loadThread"
    :post="postReply"
    @added="onAdded"
  />
</template>

<script setup>
import { ref } from 'vue';
import CommentPopoverCell from './CommentPopoverCell.vue';
import { getCubeCommentReplies, postCubeCommentReply } from '../../api/cubeComments';

const props = defineProps({
  commentId: { type: [Number, String], required: true },
  count: { type: Number, default: 0 },
  currentUser: { type: String, default: '' },
});

const emit = defineEmits(['added']);

const cellRef = ref(null);

async function loadThread() {
  // The replies GET returns the ENVELOPE { comment_id, replies }.
  const envelope = await getCubeCommentReplies(props.commentId);
  return Array.isArray(envelope?.replies) ? envelope.replies : [];
}

function postReply({ text, parentId }) {
  // Only send the options object when it carries something, so a top-level
  // reply posts `{ text }` and nothing else.
  return parentId == null
    ? postCubeCommentReply(props.commentId, text)
    : postCubeCommentReply(props.commentId, text, { parentId });
}

function onAdded({ comment, count }) {
  emit('added', { commentId: props.commentId, comment, count });
}

defineExpose({
  mergeComment: (comment) => cellRef.value?.mergeComment?.(comment),
});
</script>
