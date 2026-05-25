<template>
  <router-view />
  <!-- Global toast region — one instance for the whole app -->
  <KToastRegion />
</template>

<script setup>
// App shell - tenant loading happens after login in MainLayout
import KToastRegion from './components/klikk/KToastRegion.vue';
</script>
