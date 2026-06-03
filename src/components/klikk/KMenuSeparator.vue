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

<!--
  No <style scoped> here: DropdownMenuSeparator (.km-sep) renders inside the
  teleported DropdownMenuContent, so a scoped style would not reach it. The
  .km-sep rule lives in the global src/css/portals.css.
-->
