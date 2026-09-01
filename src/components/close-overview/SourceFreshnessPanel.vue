<template>
  <aside class="source-panel" aria-labelledby="source-panel-title">
    <header class="source-panel__header">
      <h2 id="source-panel-title" class="section-header">Source freshness</h2>
      <div class="source-panel__summary">
        <CheckCircle2 :size="20" :stroke-width="1.75" aria-hidden="true" />
        <div>
          <strong>{{ currentCount }} of {{ sources.length }} sources current</strong>
          <span>Coverage · {{ coverage }}</span>
        </div>
      </div>
    </header>

    <div class="source-panel__list">
      <button v-for="source in sources" :key="source.key" type="button" class="source-row" @click="$emit('open', source)">
        <span class="source-row__icon" :class="`source-row__icon--${source.key}`" aria-hidden="true">
          <span v-if="source.key === 'xero'" class="source-row__xero">xero</span>
          <Landmark v-else-if="source.key === 'bank'" :size="30" :stroke-width="1.75" />
          <Box v-else :size="22" :stroke-width="1.75" />
        </span>
        <span class="source-row__body">
          <strong>{{ source.name }}</strong>
          <span>{{ source.timestampLabel }}</span>
          <span>{{ source.ageLabel }}</span>
        </span>
        <span class="source-row__status" :class="`source-row__status--${source.state}`">
          <CheckCircle2 v-if="source.state === 'current'" :size="18" :stroke-width="1.75" aria-hidden="true" />
          <AlertCircle v-else :size="18" :stroke-width="1.75" aria-hidden="true" />
          {{ source.state === 'current' ? 'Current' : 'Needs attention' }}
        </span>
      </button>
    </div>

    <button type="button" class="source-panel__all" @click="$emit('view-all')">
      View all sources
      <ChevronRight :size="16" :stroke-width="1.75" aria-hidden="true" />
    </button>
  </aside>
</template>

<script setup>
import { computed } from 'vue';
import { AlertCircle, Box, CheckCircle2, ChevronRight, Landmark } from 'lucide-vue-next';
const props = defineProps({ sources: { type: Array, required: true }, coverage: { type: String, required: true } });
defineEmits(['open', 'view-all']);
const currentCount = computed(() => props.sources.filter((source) => source.state === 'current').length);
</script>
