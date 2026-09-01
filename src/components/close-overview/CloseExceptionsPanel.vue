<template>
  <section class="close-exceptions" aria-labelledby="close-exceptions-title">
    <header class="close-support-panel__header">
      <div>
        <div class="close-support-panel__title-row">
          <h2 id="close-exceptions-title" class="section-header">Exceptions</h2>
          <span class="close-support-panel__count close-support-panel__count--attention">{{ exceptions.count }}</span>
        </div>
        <p>Material breaks that can delay close or audit sign-off.</p>
      </div>
      <button type="button" class="close-support-panel__view-all" @click="$emit('view-all')">View all</button>
    </header>

    <div class="close-exceptions__list">
      <button v-for="item in exceptions.items" :key="item.id" type="button" class="close-exception" @click="$emit('open', item)">
        <AlertTriangle class="close-exception__icon" :class="`overview-tone--${item.tone || 'neutral'}`" aria-hidden="true" />
        <span class="close-exception__body">
          <strong>{{ item.title }}</strong>
          <span>{{ item.detail }}</span>
          <span>Owner · {{ item.owner }}</span>
        </span>
        <span class="close-exception__impact">{{ item.impact }}</span>
        <span class="close-exception__severity" :class="`overview-tone--${item.tone || 'neutral'}`">
          <span class="close-exception__status-dot" aria-hidden="true" />
          {{ item.severity }}
        </span>
        <ChevronRight class="close-exception__chevron" aria-hidden="true" />
      </button>
    </div>
  </section>
</template>

<script setup>
import { AlertTriangle, ChevronRight } from 'lucide-vue-next';

defineProps({ exceptions: { type: Object, required: true } });
defineEmits(['open', 'view-all']);
</script>
