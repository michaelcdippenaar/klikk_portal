<template>
  <aside class="overview-detail-panel" aria-labelledby="overview-detail-title" aria-live="polite">
    <header class="overview-detail-panel__header">
      <div>
        <span class="overview-detail-panel__kind">{{ kindLabel }}</span>
        <h2 id="overview-detail-title">{{ title }}</h2>
      </div>
      <button type="button" class="overview-detail-panel__close" aria-label="Close detail panel" @click="$emit('close')">
        <X aria-hidden="true" />
      </button>
    </header>

    <div class="overview-detail-panel__body">
      <template v-if="selection.kind === 'work'">
        <span class="overview-detail-panel__status" :class="`overview-tone--${selection.item.tone || selection.item.statusTone || 'neutral'}`">
          <span class="overview-detail-panel__status-dot" aria-hidden="true" />
          {{ selection.item.status }}
        </span>

        <template v-if="selection.item.category === 'ingest'">
          <dl class="overview-detail-panel__facts">
            <div><dt>Source</dt><dd>{{ selection.item.source }}</dd></div>
            <div><dt>Method</dt><dd>{{ selection.item.mode }}</dd></div>
            <div><dt>Owner</dt><dd>{{ selection.item.owner?.name }}</dd></div>
            <div><dt>Reviewer</dt><dd>{{ selection.item.reviewer?.name }}</dd></div>
            <div><dt>Close period</dt><dd>{{ selection.item.period }}</dd></div>
            <div><dt>Last update</dt><dd>{{ selection.item.freshnessLabel }}</dd></div>
            <div><dt>Records</dt><dd class="overview-detail-panel__amount">{{ selection.item.recordsLabel }}</dd></div>
            <div><dt>Validation</dt><dd>{{ selection.item.validationLabel }}</dd></div>
          </dl>
        </template>

        <template v-else>
          <dl class="overview-detail-panel__facts">
            <div><dt>Owner</dt><dd>{{ selection.item.owner?.name }}</dd></div>
            <div><dt>Reviewer</dt><dd>{{ selection.item.reviewer?.name }}</dd></div>
            <div><dt>Due date</dt><dd>{{ selection.item.dueDate }} · {{ selection.item.dueLabel }}</dd></div>
            <div><dt>Exposure</dt><dd>{{ selection.item.exposure }}</dd></div>
          </dl>

          <section v-if="selection.item.evidence" class="overview-detail-panel__evidence" aria-label="Work item evidence">
            <span>Evidence</span>
            <strong>{{ selection.item.evidence.title }}</strong>
            <span>{{ selection.item.evidence.amount }} · AI confidence {{ selection.item.evidence.confidence }}</span>
          </section>
        </template>
      </template>

      <template v-else-if="selection.kind === 'comment'">
        <span class="overview-detail-panel__status" :class="`overview-tone--${selection.item.tone || 'neutral'}`">
          <span class="overview-detail-panel__status-dot" aria-hidden="true" />
          {{ selection.item.status }}
        </span>
        <p class="overview-detail-panel__comment">{{ selection.item.comment }}</p>
        <section class="overview-detail-panel__evidence" aria-label="Commented cube intersection">
          <span>Cube intersection</span>
          <strong>{{ selection.item.intersection }}</strong>
          <span class="overview-detail-panel__amount">{{ selection.item.value }}</span>
        </section>
        <dl class="overview-detail-panel__facts">
          <div><dt>Author</dt><dd>{{ selection.item.author }}</dd></div>
          <div><dt>Updated</dt><dd>{{ selection.item.when }}</dd></div>
        </dl>
      </template>

      <template v-else>
        <span class="overview-detail-panel__status" :class="`overview-tone--${selection.item.tone || 'neutral'}`">
          <span class="overview-detail-panel__status-dot" aria-hidden="true" />
          {{ selection.item.severity }}
        </span>
        <p class="overview-detail-panel__comment">{{ selection.item.detail }}</p>
        <dl class="overview-detail-panel__facts">
          <div><dt>Owner</dt><dd>{{ selection.item.owner }}</dd></div>
          <div><dt>Financial impact</dt><dd class="overview-detail-panel__amount">{{ selection.item.impact }}</dd></div>
        </dl>
      </template>
    </div>

    <footer class="overview-detail-panel__footer">
      <button v-if="selection.item.routeName" type="button" class="overview-detail-panel__action" @click="$emit('open', selection.item)">
        {{ actionLabel }}
        <ExternalLink aria-hidden="true" />
      </button>
      <p v-else class="overview-detail-panel__unavailable">
        {{ selection.item.actionUnavailableMessage || 'No operational workspace is configured for this item.' }}
      </p>
    </footer>
  </aside>
</template>

<script setup>
import { computed } from 'vue';
import { ExternalLink, X } from 'lucide-vue-next';

const props = defineProps({ selection: { type: Object, required: true } });
defineEmits(['close', 'open']);

const kindLabel = computed(() => {
  if (props.selection.kind === 'work' && props.selection.item.category === 'ingest') return 'Ingest source';
  return ({ work: 'Assigned work', comment: 'Cube comment', exception: 'Exception' })[props.selection.kind];
});
const title = computed(() => {
  if (props.selection.kind === 'comment') return 'Comment detail';
  return props.selection.item.label || props.selection.item.title;
});
const actionLabel = computed(() => props.selection.item.actionLabel
  || ({ work: 'Open workbench', comment: 'Open comment register', exception: 'Open exception' })[props.selection.kind]);
</script>
