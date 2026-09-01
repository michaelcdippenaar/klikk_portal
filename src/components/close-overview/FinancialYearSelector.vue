<template>
  <KTooltip text="Financial year" side="bottom">
    <select
      class="close-period-year__control"
      :class="{ 'close-period-year__control--missing': !modelValue }"
      :value="modelValue"
      aria-label="Financial year"
      :aria-invalid="modelValue ? undefined : 'true'"
      @change="$emit('update:modelValue', $event.target.value)"
    >
      <option value="">Select FY</option>
      <option v-for="year in years" :key="year" :value="year">{{ year }}</option>
    </select>
  </KTooltip>
</template>

<script setup>
import KTooltip from '../klikk/KTooltip.vue';

defineProps({
  years: { type: Array, required: true },
  modelValue: { type: String, default: '' },
});
defineEmits(['update:modelValue']);
</script>
