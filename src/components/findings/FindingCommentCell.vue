<!--
  FindingCommentCell — the findings-register binding of CommentPopoverCell.

  Same affordance as the receipts register, deliberately: MC asked for threads
  "across all comments", and two registers that comment differently would be
  two things to learn.

  Props:
    findingId   (Number, required)
    count       (Number)  — comment_count from the list row
    currentUser (String)  — marks your own comments "(you)"

  Emits:
    added ({ findingId, comment, count })
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
import { getFinding, addFindingComment } from '../../api/findings';

const props = defineProps({
  findingId: { type: [Number, String], required: true },
  count: { type: Number, default: 0 },
  currentUser: { type: String, default: '' },
});

const emit = defineEmits(['added']);

const cellRef = ref(null);

async function loadThread() {
  // The detail GET returns the ENVELOPE { finding, comments, attachments }.
  const envelope = await getFinding(props.findingId);
  return Array.isArray(envelope?.comments) ? envelope.comments : [];
}

function postComment({ text, parentId }) {
  return parentId == null
    ? addFindingComment(props.findingId, text)
    : addFindingComment(props.findingId, text, { parentId });
}

function onAdded({ comment, count }) {
  emit('added', { findingId: props.findingId, comment, count });
}

defineExpose({
  mergeComment: (comment) => cellRef.value?.mergeComment?.(comment),
});
</script>
