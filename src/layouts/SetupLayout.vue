<template>
  <div class="row no-wrap" style="height: 100%;">
    <q-drawer
      v-model="drawerOpen"
      show-if-above
      bordered
      class="bg-grey-1"
      :width="220"
      :breakpoint="700"
    >
      <q-list>
        <q-item-label header class="text-grey-8">Setup</q-item-label>

        <q-item clickable v-ripple :to="{ name: 'credentials' }">
          <q-item-section avatar><q-icon name="vpn_key" /></q-item-section>
          <q-item-section>Credentials</q-item-section>
        </q-item>

        <q-item clickable v-ripple :to="{ name: 'ai-agent-setup' }">
          <q-item-section avatar><q-icon name="smart_toy" /></q-item-section>
          <q-item-section>AI Agent</q-item-section>
        </q-item>

        <q-item clickable v-ripple :to="{ name: 'agent-monitor' }">
          <q-item-section avatar><q-icon name="monitor_heart" /></q-item-section>
          <q-item-section>Agent Monitor</q-item-section>
        </q-item>
      </q-list>
    </q-drawer>

    <div class="col">
      <router-view />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const drawerOpen = ref(true);
</script>
