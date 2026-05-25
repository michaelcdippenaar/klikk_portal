<!--
  KMenuSeparator — visual divider between groups inside a KMenu.
  Wraps Reka DropdownMenuSeparator.
-->
<template>
  <DropdownMenuSeparator class="km-sep" />
</template>

<script setup>
import { DropdownMenuSeparator } from 'reka-ui';
</script>

<style scoped>
.km-sep {
  height: 1px;
  background: var(--kdl-border-subtle);
  margin: 4px 0;
  border: none;
}
</style>
