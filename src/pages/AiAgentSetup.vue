<template>
  <q-page class="q-pa-md">
    <div class="text-h5 q-mb-xs">AI Agent</div>
    <div class="text-subtitle2 text-grey-7 q-mb-lg">Manage skills, tools, and routing keywords</div>

    <div class="row items-center justify-between q-mb-md">
      <div class="text-subtitle1">Registered skill modules ({{ skills.length }})</div>
      <q-btn flat color="primary" label="Refresh" icon="refresh" :loading="loading" @click="loadSkills" />
    </div>

    <div v-if="loading && !skills.length" class="text-grey-7 q-pa-md">Loading...</div>

    <div v-else-if="!skills.length" class="text-grey-7">No skills found in registry.</div>

    <div v-else class="q-gutter-md">
      <q-card v-for="skill in skills" :key="skill.module_name" bordered flat>
        <q-card-section>
          <div class="row items-center justify-between">
            <div class="col">
              <div class="row items-center q-gutter-sm">
                <div class="text-subtitle1 text-weight-medium">{{ skill.display_name || skill.module_name }}</div>
                <q-badge v-if="skill.always_on" color="blue" outline>always on</q-badge>
                <q-badge :color="skill.enabled ? 'positive' : 'grey-6'" outline>
                  {{ skill.enabled ? 'enabled' : 'disabled' }}
                </q-badge>
              </div>
              <div class="text-caption text-grey-7 q-mt-xs">{{ skill.description || 'No description' }}</div>
              <div class="text-caption text-grey-6 q-mt-xs font-mono">{{ skill.module_name }}</div>
            </div>
            <div class="row q-gutter-sm items-center">
              <q-badge color="primary" outline>{{ skill.tool_count }} tools</q-badge>
              <q-toggle
                :model-value="skill.enabled"
                @update:model-value="(val) => toggleSkill(skill, val)"
                color="positive"
                :disable="skill.always_on"
              >
                <q-tooltip v-if="skill.always_on">Always-on skills cannot be disabled</q-tooltip>
              </q-toggle>
              <q-btn flat dense icon="info" @click="viewDetail(skill.module_name)">
                <q-tooltip>View tools & keywords</q-tooltip>
              </q-btn>
            </div>
          </div>

          <!-- Keywords chips -->
          <div v-if="skill.keywords && skill.keywords.length" class="q-mt-sm">
            <div class="text-caption text-grey-6 q-mb-xs">Routing keywords:</div>
            <div class="row q-gutter-xs">
              <q-chip
                v-for="kw in skill.keywords.slice(0, 8)"
                :key="kw"
                size="sm"
                color="grey-3"
                text-color="grey-8"
                dense
              >{{ kw }}</q-chip>
              <q-chip
                v-if="skill.keywords.length > 8"
                size="sm"
                color="grey-2"
                text-color="grey-6"
                dense
              >+{{ skill.keywords.length - 8 }} more</q-chip>
            </div>
          </div>
        </q-card-section>
      </q-card>
    </div>

    <!-- Detail dialog -->
    <q-dialog v-model="detailDialog" position="right" full-height>
      <q-card style="width: 650px; max-width: 90vw;">
        <q-card-section class="row items-center q-pb-none">
          <div class="text-h6">{{ detailData?.display_name || detailData?.module_name || '' }}</div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>

        <q-card-section v-if="detailData">
          <div class="text-caption text-grey-7 q-mb-md">{{ detailData.description || '' }}</div>

          <!-- Enable/disable -->
          <div class="row items-center q-mb-md">
            <q-toggle v-model="detailEnabled" color="positive" label="Enabled" :disable="detailData.always_on" />
            <q-toggle v-model="detailAlwaysOn" color="blue" label="Always on" class="q-ml-md" />
            <q-btn
              flat
              dense
              label="Save"
              color="primary"
              class="q-ml-md"
              @click="saveDetail"
              :loading="detailSaving"
            />
          </div>

          <!-- Keywords editor -->
          <div class="q-mb-md">
            <div class="text-subtitle2 q-mb-xs">Routing keywords</div>
            <div class="text-caption text-grey-6 q-mb-sm">These keywords trigger this skill when found in user messages</div>
            <q-select
              v-model="detailKeywords"
              use-input
              use-chips
              multiple
              hide-dropdown-icon
              input-debounce="0"
              new-value-mode="add-unique"
              outlined
              dense
              placeholder="Type keyword and press Enter"
            />
          </div>

          <!-- Tool list -->
          <div v-if="detailData.tools && detailData.tools.length">
            <div class="text-subtitle2 q-mb-xs">Tools ({{ detailData.tools.length }})</div>
            <q-list dense bordered separator class="rounded-borders">
              <q-item v-for="t in detailData.tools" :key="t.name" dense>
                <q-item-section>
                  <q-item-label class="font-mono text-caption">{{ t.name }}</q-item-label>
                  <q-item-label v-if="t.description" caption>{{ t.description }}</q-item-label>
                </q-item-section>
              </q-item>
            </q-list>
          </div>
        </q-card-section>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import { listSkills, getSkillDetail, updateSkill } from '../api/skills';

const $q = useQuasar();

// Skills list
const skills = ref([]);
const loading = ref(false);

async function loadSkills() {
  loading.value = true;
  try {
    const data = await listSkills();
    skills.value = Array.isArray(data) ? data : (data.skills || []);
  } catch (err) {
    $q.notify({ type: 'negative', message: `Failed to load skills: ${err.message}` });
  } finally {
    loading.value = false;
  }
}

async function toggleSkill(skill, enabled) {
  try {
    await updateSkill(skill.module_name, { enabled });
    skill.enabled = enabled;
  } catch (err) {
    $q.notify({ type: 'negative', message: `Failed to update: ${err.message}` });
  }
}

// Detail view
const detailDialog = ref(false);
const detailData = ref(null);
const detailEnabled = ref(true);
const detailAlwaysOn = ref(false);
const detailKeywords = ref([]);
const detailSaving = ref(false);

async function viewDetail(moduleName) {
  try {
    const data = await getSkillDetail(moduleName);
    detailData.value = data;
    detailEnabled.value = data.enabled;
    detailAlwaysOn.value = data.always_on;
    detailKeywords.value = data.keywords || [];
    detailDialog.value = true;
  } catch (err) {
    $q.notify({ type: 'negative', message: `Failed to load detail: ${err.message}` });
  }
}

async function saveDetail() {
  if (!detailData.value) return;
  detailSaving.value = true;
  try {
    await updateSkill(detailData.value.module_name, {
      enabled: detailEnabled.value,
      always_on: detailAlwaysOn.value,
      keywords: detailKeywords.value,
    });
    // Update the list item too
    const idx = skills.value.findIndex(s => s.module_name === detailData.value.module_name);
    if (idx >= 0) {
      skills.value[idx].enabled = detailEnabled.value;
      skills.value[idx].always_on = detailAlwaysOn.value;
      skills.value[idx].keywords = [...detailKeywords.value];
    }
    $q.notify({ type: 'positive', message: 'Skill updated' });
  } catch (err) {
    $q.notify({ type: 'negative', message: `Save failed: ${err.message}` });
  } finally {
    detailSaving.value = false;
  }
}

onMounted(() => {
  loadSkills();
});
</script>

<style scoped>
.font-mono {
  font-family: 'Fira Code', 'Consolas', monospace;
}
</style>
