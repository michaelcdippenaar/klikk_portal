<template>
  <nav class="month-strip" aria-label="Financial year close periods">
    <button
      type="button"
      class="month-strip__all"
      :class="{ 'month-strip__all--active': allSelected }"
      :aria-pressed="allSelected"
      :disabled="disabled"
      @click="toggleAll"
    >
      All
    </button>
    <button
      v-for="month in months"
      :key="month.key"
      type="button"
      class="month-strip__item"
      :class="{ 'month-strip__item--active': modelValue.includes(month.key) }"
      :aria-pressed="modelValue.includes(month.key)"
      :aria-label="`${month.label} close, ${month.progress}% complete`"
      :disabled="disabled"
      @click="toggleMonth(month.key)"
    >
      <span class="month-strip__label">{{ month.label }}</span>
      <span class="month-strip__progress" :class="`month-strip__progress--${month.progress}`" aria-hidden="true" />
    </button>
  </nav>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  months: { type: Array, required: true },
  modelValue: { type: Array, required: true },
  disabled: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue']);

const allSelected = computed(() => props.modelValue.length === props.months.length);

function toggleAll() {
  emit('update:modelValue', allSelected.value ? [props.months[0].key] : props.months.map((month) => month.key));
}

function toggleMonth(monthKey) {
  if (allSelected.value) {
    emit('update:modelValue', [monthKey]);
    return;
  }
  if (props.modelValue.includes(monthKey)) {
    if (props.modelValue.length > 1) emit('update:modelValue', props.modelValue.filter((key) => key !== monthKey));
    return;
  }
  const selected = new Set([...props.modelValue, monthKey]);
  emit('update:modelValue', props.months.map((month) => month.key).filter((key) => selected.has(key)));
}
</script>
