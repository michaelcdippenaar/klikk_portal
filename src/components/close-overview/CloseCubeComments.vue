<template>
  <section class="close-comments" aria-labelledby="close-comments-title">
    <header class="close-support-panel__header">
      <div>
        <div class="close-support-panel__title-row">
          <h2 id="close-comments-title" class="section-header">Cube comments</h2>
          <span class="close-support-panel__count">{{ comments.length }}</span>
        </div>
        <p>Open commentary pinned to figures in the selected close period.</p>
      </div>
      <button type="button" class="close-support-panel__view-all" @click="$emit('view-all')">View all</button>
    </header>

    <div class="close-comments__list">
      <button v-for="comment in comments" :key="comment.id" type="button" class="close-comment" @click="$emit('open', comment)">
        <MessageSquareText class="close-comment__icon" aria-hidden="true" />
        <span class="close-comment__body">
          <strong>{{ comment.comment }}</strong>
          <span>{{ comment.intersection }}</span>
          <span>{{ comment.author }} · {{ comment.when }}</span>
        </span>
        <span class="close-comment__value">{{ comment.value }}</span>
        <span class="close-comment__status" :class="`overview-tone--${comment.tone || 'neutral'}`">
          <span class="close-comment__status-dot" aria-hidden="true" />
          {{ comment.status }}
        </span>
        <ChevronRight class="close-comment__chevron" aria-hidden="true" />
      </button>
      <p v-if="comments.length === 0" class="close-support-panel__empty">No open cube comments for this period.</p>
    </div>
  </section>
</template>

<script setup>
import { ChevronRight, MessageSquareText } from 'lucide-vue-next';

defineProps({ comments: { type: Array, required: true } });
defineEmits(['open', 'view-all']);
</script>
