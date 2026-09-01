<template>
  <nav class="close-stages" aria-label="Close workflow stages">
    <template v-for="(stage, index) in stages" :key="stage.key">
      <button
        type="button"
        class="close-stage"
        :class="[
          `close-stage--${stage.tone || stage.state}`,
          { 'close-stage--active': stage.key === modelValue },
        ]"
        :aria-current="stage.key === modelValue ? 'step' : undefined"
        @click="$emit('update:modelValue', stage.key)"
      >
        <span class="close-stage__icon-wrap">
          <component :is="iconFor(stage.key)" :size="24" :stroke-width="1.75" aria-hidden="true" />
          <span
            class="close-stage__state"
            :class="[
              `close-stage__state--${stage.state}`,
              `close-stage__state-tone--${stage.tone || stage.state}`,
            ]"
          >
            <Check v-if="stage.state === 'complete'" :size="11" :stroke-width="2.4" aria-hidden="true" />
            <AlertCircle v-else-if="stage.state === 'warning'" :size="12" :stroke-width="2.4" aria-hidden="true" />
            <LockKeyhole v-else :size="10" :stroke-width="2.2" aria-hidden="true" />
          </span>
        </span>
        <span class="close-stage__label">{{ stage.label }}</span>
        <span class="close-stage__value">{{ stage.progress }}%</span>
      </button>
      <span v-if="index < stages.length - 1" class="close-stages__connector" :class="`close-stages__connector--${connectorTone(index)}`" aria-hidden="true" />
    </template>
  </nav>
</template>

<script setup>
import { AlertCircle, ArrowLeftRight, Check, Database, FileSearch, LockKeyhole, Signature } from 'lucide-vue-next';

const props = defineProps({
  stages: { type: Array, required: true },
  modelValue: { type: String, required: true },
});
defineEmits(['update:modelValue']);

const ICONS = { ingest: Database, reconcile: ArrowLeftRight, review: FileSearch, signoff: Signature };
function iconFor(key) { return ICONS[key] || FileSearch; }
function connectorTone(index) {
  const nextStage = props.stages[index + 1];
  return nextStage?.tone || nextStage?.state || 'pending';
}
</script>
