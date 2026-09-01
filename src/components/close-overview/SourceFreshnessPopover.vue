<template>
  <KPopover v-model="menuOpen" side="bottom" align="end">
    <template #trigger>
      <button
        type="button"
        class="source-freshness-trigger"
        :class="`source-freshness-trigger--${allCurrent ? 'current' : 'attention'}`"
        :aria-label="`Source freshness: ${currentCount} of ${sources.length} sources current for ${coverage}`"
      >
        <CheckCircle2 v-if="allCurrent" class="source-freshness-trigger__state-icon" aria-hidden="true" />
        <AlertCircle v-else class="source-freshness-trigger__state-icon" aria-hidden="true" />
        <span class="source-freshness-trigger__copy">
          <strong>{{ allCurrent ? 'Sources current' : 'Source attention' }}</strong>
          <span>{{ currentCount }}/{{ sources.length }} · {{ coverage }}</span>
        </span>
        <ChevronDown class="source-freshness-trigger__chevron" aria-hidden="true" />
      </button>
    </template>

    <section class="source-freshness-popover" aria-labelledby="source-freshness-popover-title">
      <header class="source-freshness-popover__header">
        <div>
          <h2 id="source-freshness-popover-title">Source freshness</h2>
          <p>{{ currentCount }} of {{ sources.length }} sources current · {{ coverage }}</p>
        </div>
        <span class="source-freshness-popover__summary" :class="`source-freshness-popover__summary--${allCurrent ? 'current' : 'attention'}`">
          {{ allCurrent ? 'Current' : 'Review' }}
        </span>
      </header>

      <div class="source-freshness-popover__list">
        <button v-for="source in sources" :key="source.key" type="button" class="source-freshness-popover__row" @click="openSource(source)">
          <span class="source-freshness-popover__source-icon" :class="`source-freshness-popover__source-icon--${source.key}`" aria-hidden="true">
            <span v-if="source.key === 'xero'" class="source-freshness-popover__xero">xero</span>
            <Landmark v-else-if="source.key === 'bank'" />
            <Box v-else />
          </span>
          <span class="source-freshness-popover__body">
            <strong>{{ source.name }}</strong>
            <span>{{ source.timestampLabel }}</span>
            <span>{{ source.ageLabel }}</span>
          </span>
          <span class="source-freshness-popover__status" :class="`source-freshness-popover__status--${source.state}`">
            <CheckCircle2 v-if="source.state === 'current'" aria-hidden="true" />
            <AlertCircle v-else aria-hidden="true" />
            {{ source.state === 'current' ? 'Current' : 'Attention' }}
          </span>
        </button>
      </div>

      <button type="button" class="source-freshness-popover__all" @click="viewAll">
        View source connections
        <ChevronRight aria-hidden="true" />
      </button>
    </section>
  </KPopover>
</template>

<script setup>
import { computed, ref } from 'vue';
import { AlertCircle, Box, CheckCircle2, ChevronDown, ChevronRight, Landmark } from 'lucide-vue-next';
import KPopover from '../klikk/KPopover.vue';

const props = defineProps({
  sources: { type: Array, required: true },
  coverage: { type: String, required: true },
});
const emit = defineEmits(['open-source', 'view-all']);

const menuOpen = ref(false);
const currentCount = computed(() => props.sources.filter((source) => source.state === 'current').length);
const allCurrent = computed(() => currentCount.value === props.sources.length);

function openSource(source) {
  menuOpen.value = false;
  emit('open-source', source);
}

function viewAll() {
  menuOpen.value = false;
  emit('view-all');
}
</script>
