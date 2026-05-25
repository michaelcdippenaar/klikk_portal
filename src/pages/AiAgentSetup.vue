<template>
  <div class="page-content">
    <PageHeader title="AI Agent Setup" subtitle="Manage skills, tools, and routing keywords" />

    <div class="setup-header">
      <div class="setup-header__title">Registered skill modules ({{ skills.length }})</div>
      <button class="btn btn-ghost btn-sm" :disabled="loading" @click="loadSkills">
        <!-- Lucide refresh-cw -->
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="23 4 23 10 17 10" />
          <polyline points="1 20 1 14 7 14" />
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
        {{ loading ? 'Refreshing…' : 'Refresh' }}
      </button>
    </div>

    <div v-if="loading && !skills.length" class="setup-empty">Loading...</div>
    <div v-else-if="!skills.length" class="setup-empty">No skills found in registry.</div>

    <div v-else class="setup-skills">
      <div v-for="skill in skills" :key="skill.module_name" class="setup-skill-card">
        <div class="setup-skill-card__body">
          <div class="setup-skill-card__meta">
            <div class="setup-skill-card__name-row">
              <span class="setup-skill-card__name">{{ skill.display_name || skill.module_name }}</span>
              <KBadge v-if="skill.always_on" label="always on" tone="accent" />
              <KBadge :label="skill.enabled ? 'enabled' : 'disabled'" :tone="skill.enabled ? 'accent' : 'muted'" />
            </div>
            <div class="setup-skill-card__desc">{{ skill.description || 'No description' }}</div>
            <div class="setup-skill-card__module font-mono">{{ skill.module_name }}</div>
          </div>

          <div class="setup-skill-card__controls">
            <KBadge :label="`${skill.tool_count} tools`" tone="accent" />
            <KToggle
              :model-value="skill.enabled"
              :disabled="skill.always_on"
              @update:model-value="(val) => toggleSkill(skill, val)"
            />
            <button class="btn btn-ghost btn-sm" @click="viewDetail(skill.module_name)" title="View tools & keywords">
              <!-- Lucide info -->
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Keywords chips -->
        <div v-if="skill.keywords && skill.keywords.length" class="setup-skill-card__keywords">
          <span class="setup-skill-card__keywords-label">Routing keywords:</span>
          <div class="setup-skill-card__chips">
            <KChip
              v-for="kw in skill.keywords.slice(0, 8)"
              :key="kw"
              :label="kw"
            />
            <KChip
              v-if="skill.keywords.length > 8"
              :label="`+${skill.keywords.length - 8} more`"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Detail dialog -->
    <KDialog v-model="detailDialog" :title="detailData?.display_name || detailData?.module_name || ''" size="lg">
      <template v-if="detailData">
        <p class="setup-detail__desc">{{ detailData.description || '' }}</p>

        <!-- Enable/disable -->
        <div class="setup-detail__toggles">
          <KToggle v-model="detailEnabled" label="Enabled" :disabled="detailData.always_on" />
          <KToggle v-model="detailAlwaysOn" label="Always on" />
          <button class="btn btn-ghost btn-sm" :disabled="detailSaving" @click="saveDetail">
            {{ detailSaving ? 'Saving…' : 'Save' }}
          </button>
        </div>

        <!-- Keywords editor -->
        <div class="setup-detail__keywords-editor">
          <div class="setup-detail__section-title">Routing keywords</div>
          <p class="setup-detail__section-desc">These keywords trigger this skill when found in user messages</p>
          <div class="setup-detail__keyword-input-row">
            <KInput
              v-model="newKeyword"
              label=""
              placeholder="Type keyword and press Enter"
              @keydown.enter.prevent="addKeyword"
            />
            <button class="btn btn-ghost btn-sm" @click="addKeyword">Add</button>
          </div>
          <div v-if="detailKeywords.length" class="setup-detail__chips">
            <KChip
              v-for="kw in detailKeywords"
              :key="kw"
              :label="kw"
              removable
              @remove="removeKeyword(kw)"
            />
          </div>
        </div>

        <!-- Tool list -->
        <div v-if="detailData.tools && detailData.tools.length" class="setup-detail__tools">
          <div class="setup-detail__section-title">Tools ({{ detailData.tools.length }})</div>
          <div class="setup-detail__tool-list">
            <div v-for="t in detailData.tools" :key="t.name" class="setup-detail__tool-row">
              <span class="setup-detail__tool-name font-mono">{{ t.name }}</span>
              <span v-if="t.description" class="setup-detail__tool-desc">{{ t.description }}</span>
            </div>
          </div>
        </div>
      </template>
    </KDialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useToast } from '../composables/useToast';
import { listSkills, getSkillDetail, updateSkill } from '../api/skills';
import PageHeader from '../components/klikk/PageHeader.vue';
import KBadge from '../components/klikk/KBadge.vue';
import KChip from '../components/klikk/KChip.vue';
import KToggle from '../components/klikk/KToggle.vue';
import KDialog from '../components/klikk/KDialog.vue';
import KInput from '../components/klikk/KInput.vue';

const toast = useToast();

// Skills list
const skills = ref([]);
const loading = ref(false);

async function loadSkills() {
  loading.value = true;
  try {
    const data = await listSkills();
    skills.value = Array.isArray(data) ? data : (data.skills || []);
  } catch (err) {
    toast.error(`Failed to load skills: ${err.message}`);
  } finally {
    loading.value = false;
  }
}

async function toggleSkill(skill, enabled) {
  try {
    await updateSkill(skill.module_name, { enabled });
    skill.enabled = enabled;
  } catch (err) {
    toast.error(`Failed to update: ${err.message}`);
  }
}

// Detail view
const detailDialog = ref(false);
const detailData = ref(null);
const detailEnabled = ref(true);
const detailAlwaysOn = ref(false);
const detailKeywords = ref([]);
const detailSaving = ref(false);
const newKeyword = ref('');

function addKeyword() {
  const kw = newKeyword.value.trim();
  if (kw && !detailKeywords.value.includes(kw)) {
    detailKeywords.value.push(kw);
  }
  newKeyword.value = '';
}

function removeKeyword(kw) {
  detailKeywords.value = detailKeywords.value.filter((k) => k !== kw);
}

async function viewDetail(moduleName) {
  try {
    const data = await getSkillDetail(moduleName);
    detailData.value = data;
    detailEnabled.value = data.enabled;
    detailAlwaysOn.value = data.always_on;
    detailKeywords.value = data.keywords || [];
    newKeyword.value = '';
    detailDialog.value = true;
  } catch (err) {
    toast.error(`Failed to load detail: ${err.message}`);
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
    const idx = skills.value.findIndex(s => s.module_name === detailData.value.module_name);
    if (idx >= 0) {
      skills.value[idx].enabled = detailEnabled.value;
      skills.value[idx].always_on = detailAlwaysOn.value;
      skills.value[idx].keywords = [...detailKeywords.value];
    }
    toast.success('Skill updated');
  } catch (err) {
    toast.error(`Save failed: ${err.message}`);
  } finally {
    detailSaving.value = false;
  }
}

onMounted(() => {
  loadSkills();
});
</script>

<style scoped>
.page-content {
  padding: 16px;
}

.setup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.setup-header__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--kdl-text-primary);
}

.setup-empty {
  font-size: 13px;
  color: var(--kdl-text-muted);
  padding: 16px 0;
}

.setup-skills {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.setup-skill-card {
  background: var(--kdl-card-bg);
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 8px;
  padding: 14px 16px;
}

.setup-skill-card__body {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.setup-skill-card__meta {
  flex: 1 1 0;
  min-width: 0;
}

.setup-skill-card__name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}

.setup-skill-card__name {
  font-size: 15px;
  font-weight: 600;
  color: var(--kdl-text-primary);
}

.setup-skill-card__desc {
  font-size: 13px;
  color: var(--kdl-text-muted);
  margin-bottom: 2px;
}

.setup-skill-card__module {
  font-size: 11px;
  color: var(--kdl-text-hint);
}

.setup-skill-card__controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.setup-skill-card__keywords {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--kdl-border-subtle);
}

.setup-skill-card__keywords-label {
  font-size: 11px;
  color: var(--kdl-text-hint);
  margin-bottom: 6px;
  display: block;
}

.setup-skill-card__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

/* Detail dialog internals */
.setup-detail__desc {
  font-size: 13px;
  color: var(--kdl-text-muted);
  margin-bottom: 16px;
}

.setup-detail__toggles {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.setup-detail__keywords-editor {
  margin-bottom: 20px;
}

.setup-detail__section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--kdl-text-primary);
  margin-bottom: 4px;
}

.setup-detail__section-desc {
  font-size: 12px;
  color: var(--kdl-text-hint);
  margin-bottom: 8px;
}

.setup-detail__keyword-input-row {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  margin-bottom: 8px;
}

.setup-detail__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.setup-detail__tools {}

.setup-detail__tool-list {
  border: 1px solid var(--kdl-border-subtle);
  border-radius: 6px;
  overflow: hidden;
}

.setup-detail__tool-row {
  padding: 6px 10px;
  border-bottom: 1px solid var(--kdl-border-subtle);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.setup-detail__tool-row:last-child {
  border-bottom: none;
}

.setup-detail__tool-name {
  font-size: 12px;
  color: var(--kdl-text-primary);
}

.setup-detail__tool-desc {
  font-size: 11px;
  color: var(--kdl-text-muted);
}

.font-mono {
  font-family: 'Fira Code', 'Consolas', monospace;
}
</style>
