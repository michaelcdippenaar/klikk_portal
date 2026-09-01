<template>
  <section class="close-work" aria-labelledby="close-work-title">
    <header class="close-work__header">
      <div class="close-work__title-row">
        <h2 id="close-work-title" class="section-header">{{ title }}</h2>
        <span class="close-work__count">{{ items.length }}</span>
      </div>
      <p>{{ description }}</p>
    </header>

    <div v-if="items.length" class="close-work__table-wrap">
      <table class="close-work__table">
        <thead>
          <tr>
            <th scope="col">Work item</th>
            <th scope="col">Owner</th>
            <th scope="col">{{ reviewerLabel }}</th>
            <th scope="col">Due date</th>
            <th scope="col" class="close-work__numeric">Exposure (ZAR)</th>
            <th scope="col">Status</th>
            <th scope="col"><span class="sr-only">Open</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.id" :class="{ 'close-work__row--attention': item.tone === 'attention' }">
            <td>
              <button type="button" class="close-work__item-btn" @click="$emit('open', item)">
                <component :is="iconFor(item.icon)" :size="20" :stroke-width="1.75" aria-hidden="true" />
                <span>{{ item.label }}</span>
              </button>
            </td>
            <td><PersonCell :person="item.owner" /></td>
            <td><PersonCell :person="item.reviewer" /></td>
            <td>
              <span class="close-work__date">{{ item.dueDate }}</span>
              <span class="close-work__due" :class="`close-work__due--${item.dueTone}`">{{ item.dueLabel }}</span>
            </td>
            <td class="close-work__numeric">{{ item.exposure }}</td>
            <td>
              <span class="close-work__status" :class="`close-work__status--${item.statusTone}`">
                <span class="close-work__status-dot" aria-hidden="true" />
                {{ item.status }}
              </span>
            </td>
            <td class="close-work__action-cell">
              <button type="button" class="close-work__open-btn" :aria-label="`Open ${item.label}`" @click="$emit('open', item)">
                <ChevronRight :size="18" :stroke-width="1.75" aria-hidden="true" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else class="close-work__empty">
      <CheckCircle2 :size="24" :stroke-width="1.75" aria-hidden="true" />
      <div><strong>No work items for this stage</strong><p>Select another stage or month to continue the close.</p></div>
    </div>
  </section>
</template>

<script setup>
import { defineComponent, h } from 'vue';
import { ChartPie, CheckCircle2, ChevronRight, Landmark, PenLine, ReceiptText } from 'lucide-vue-next';

defineProps({
  title: { type: String, required: true },
  description: { type: String, required: true },
  items: { type: Array, required: true },
  reviewerLabel: { type: String, default: 'Reviewer' },
});
defineEmits(['open']);

const ICONS = { receipt: ReceiptText, journal: PenLine, variance: ChartPie, bank: Landmark };
function iconFor(key) { return ICONS[key] || ReceiptText; }

const PersonCell = defineComponent({
  props: { person: { type: Object, required: true } },
  setup(props) {
    return () => h('div', { class: 'close-work__person' }, [
      h('span', { class: 'close-work__avatar', 'aria-hidden': 'true' }, props.person.initials),
      h('span', { class: 'close-work__person-copy' }, [h('strong', props.person.name), h('span', props.person.role)]),
    ]);
  },
});
</script>
