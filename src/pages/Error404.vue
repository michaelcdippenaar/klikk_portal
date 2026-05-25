<template>
  <div class="fullscreen flex flex-center">
    <div class="text-center">
      <div class="text-h1" style="font-size: 8rem">404</div>
      <PageHeader title="Page not found" subtitle="The page you're looking for doesn't exist" />
      <q-btn
        label="Go Home"
        color="primary"
        to="/"
        class="q-mt-lg"
      />
    </div>
  </div>
</template>

<script setup>
import PageHeader from '../components/klikk/PageHeader.vue';
</script>
