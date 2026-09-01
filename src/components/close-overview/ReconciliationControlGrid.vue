<template>
  <section class="reconcile-widgets" aria-labelledby="reconcile-widgets-title">
    <header class="reconcile-widgets__header">
      <div class="reconcile-widgets__title-row">
        <h2 id="reconcile-widgets-title" class="section-header">{{ title }}</h2>
        <span class="reconcile-widgets__count">{{ items.length }}</span>
      </div>
      <p>{{ description }}</p>
    </header>

    <div class="reconcile-widgets__grid">
      <article v-for="item in items" :key="item.id" class="reconcile-widget" :class="`reconcile-widget--${item.statusTone}`">
        <header class="reconcile-widget__header">
          <span class="reconcile-widget__icon" aria-hidden="true"><ArrowLeftRight /></span>
          <div>
            <h3>{{ item.label }}</h3>
            <span class="reconcile-widget__status" :class="`reconcile-widget__status--${item.statusTone}`">
              <span aria-hidden="true" />{{ item.status }}
            </span>
          </div>
        </header>

        <div class="reconcile-widget__comparison">
          <div class="reconcile-widget__source">
            <span>{{ item.sourceA.label }}</span>
            <strong>{{ item.sourceA.value }}</strong>
            <small>{{ item.sourceA.detail }}</small>
          </div>
          <ArrowRight class="reconcile-widget__comparison-arrow" aria-hidden="true" />
          <div class="reconcile-widget__source">
            <span>{{ item.sourceB.label }}</span>
            <strong>{{ item.sourceB.value }}</strong>
            <small>{{ item.sourceB.detail }}</small>
          </div>
        </div>

        <div class="reconcile-widget__difference">
          <span>{{ item.difference.label }}</span>
          <strong>{{ item.difference.value }}</strong>
          <small>{{ item.difference.detail }}</small>
        </div>

        <footer class="reconcile-widget__footer">
          <div class="reconcile-widget__accountability">
            <span>Owner {{ item.owner.name }}</span>
            <span>Verifier {{ item.reviewer.name }}</span>
          </div>
          <button type="button" class="reconcile-widget__open" :aria-label="`Open ${item.label}`" @click="$emit('open', item)">
            Open control <ChevronRight aria-hidden="true" />
          </button>
        </footer>
      </article>
    </div>
  </section>
</template>

<script setup>
import { ArrowLeftRight, ArrowRight, ChevronRight } from 'lucide-vue-next';

defineProps({
  title: { type: String, required: true },
  description: { type: String, required: true },
  items: { type: Array, required: true },
});
defineEmits(['open']);
</script>
