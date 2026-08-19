<template>
  <AppPage>
    <PageHeader
      title="Findings"
      subtitle="Results from the year-end audit run"
    />

    <SectionCard>
      <EmptyState
        title="Coming soon — results from run_yearend_audit"
        body="Once the audit registry runs, each check's PASS / WARN / FAIL result and the rows it returned will land here, per financial year, with a diff against the previous run."
      />
    </SectionCard>
  </AppPage>
</template>

<script setup>
import AppPage from '../components/shell/AppPage.vue';
import PageHeader from '../components/klikk/PageHeader.vue';
import SectionCard from '../components/klikk/SectionCard.vue';
import EmptyState from '../components/klikk/EmptyState.vue';
</script>
