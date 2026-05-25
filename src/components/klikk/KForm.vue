<!--
  KForm — Klikk Design Language form wrapper (finance-admin variant).

  Replaces: q-form
  Minimal: native <form> with submit-prevent, no Quasar magic.
  Use native HTML5 validation on individual inputs or add your own validation layer.

  USAGE:
    <KForm @submit="handleSubmit">
      <KInput v-model="email" label="Email" type="email" required />
      <button type="submit" class="btn-primary">Submit</button>
    </KForm>

    Disable native browser validation (use app-level validation instead):
    <KForm @submit="handleSubmit" :no-validate="true">
      ...
    /KForm
-->
<template>
  <form
    class="kform"
    :novalidate="noValidate"
    @submit.prevent="$emit('submit', $event)"
  >
    <slot />
  </form>
</template>

<script setup>
defineProps({
  /**
   * When true, disables native browser constraint validation UI.
   * Use this when you handle validation in your component logic.
   */
  noValidate: {
    type: Boolean,
    default: false,
  },
});

defineEmits(['submit']);
</script>

<style scoped>
/* KForm — no visual chrome, just ensures sensible default layout */
.kform {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
</style>
