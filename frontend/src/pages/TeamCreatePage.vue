<script setup lang="ts">
import '../theme/legacy-aliases.css';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { showGlobalSuccessToast, totalMessageCount } from '../appUiState';
import { createTeam } from '../api';
import SettingsNavSidebar from '../components/settings/SettingsNavSidebar.vue';
import TeamInfoCard from '../components/team/TeamInfoCard.vue';
import ConfirmDialog from '../components/ui/ConfirmDialog.vue';
import { useSettingsNavItems } from '../components/settings/settingsNavItems';
import SettingsBreadcrumb from '../components/settings/SettingsBreadcrumb.vue';
import type { SettingsBreadcrumbItem } from '../components/settings/types';
import { firstTeamId, loadTeams, preferredTeamId } from '../teamStore';

const router = useRouter();

const navItems = useSettingsNavItems();

const name = ref('');
const workingDirectory = ref('');
const slogan = ref('');
const rules = ref('');
const submitting = ref(false);
const errorMessage = ref('');
const confirmOpen = ref(false);

const breadcrumbItems = computed<SettingsBreadcrumbItem[]>(() => [
  { key: 'settings', label: '系统设置', current: false },
  { key: 'teams', label: '团队管理', current: false },
  { key: 'create', label: '新建团队', current: true },
]);

const hasDraftChanges = computed(() =>
  name.value.trim().length > 0
  || workingDirectory.value.trim().length > 0
  || slogan.value.trim().length > 0
  || rules.value.trim().length > 0,
);

const canSubmit = computed(() => name.value.trim().length > 0 && !submitting.value);

function resetDraft(): void {
  name.value = '';
  workingDirectory.value = '';
  slogan.value = '';
  rules.value = '';
  errorMessage.value = '';
}

function navigateBreadcrumb(key: string): void {
  if (key === 'create') {
    return;
  }

  if (key === 'teams' || key === 'settings') {
    const targetTeamId = preferredTeamId.value ?? firstTeamId.value;
    if (targetTeamId !== null) {
      router.push({
        name: 'settings',
        params: {
          teamId: targetTeamId,
          section: 'teams',
        },
      }).catch(console.error);
      return;
    }
  }

  router.push({ name: 'home' }).catch(console.error);
}

function goBack(): void {
  navigateBreadcrumb('teams');
}

function openSection(sectionId: string): void {
  const targetTeamId = preferredTeamId.value ?? firstTeamId.value;
  if (targetTeamId !== null) {
    router.push({
      name: 'settings',
      params: {
        teamId: targetTeamId,
        section: sectionId,
      },
    }).catch(console.error);
    return;
  }

  router.push({ name: 'home' }).catch(console.error);
}

async function handleSubmit(): Promise<void> {
  if (!canSubmit.value) {
    return;
  }

  confirmOpen.value = false;
  submitting.value = true;
  errorMessage.value = '';

  try {
    const created = await createTeam({
      name: name.value.trim(),
      working_directory: workingDirectory.value.trim(),
      config: {
        slogan: slogan.value.trim(),
        rules: rules.value.trim(),
      },
    });
    await loadTeams();
    showGlobalSuccessToast('团队创建成功，请添加成员');
    router.push({
      name: 'settings',
      params: {
        teamId: created.id,
        section: 'teams',
      },
      query: {
        detailTeamId: String(created.id),
      },
    }).catch(console.error);
  } catch (error) {
    errorMessage.value = '创建团队失败，请检查名称是否重复。';
    console.error(error);
  } finally {
    submitting.value = false;
  }
}

function requestSubmit(): void {
  if (!canSubmit.value) {
    return;
  }

  confirmOpen.value = true;
}

function closeConfirmDialog(): void {
  confirmOpen.value = false;
}

onMounted(() => {
  totalMessageCount.value = 0;
  loadTeams().catch(console.error);
});
</script>

<template>
  <section class="settings-shell panel">
    <header class="settings-head">
      <div class="settings-head-main">
        <div class="settings-title-row">
          <h2>系统设置</h2>
          <p class="settings-eyebrow">Admin Console</p>
        </div>
      </div>
      <button type="button" class="secondary-button" @click="$router.push({ name: 'home' })">返回主界面</button>
    </header>

    <div class="settings-layout">
      <SettingsNavSidebar
        :items="navItems"
        active-id="teams"
        :count-label="`${navItems.length} 项`"
        @select="openSection"
      />

      <main class="settings-main">
        <section class="config-section">
          <div v-if="errorMessage" class="error-banner">{{ errorMessage }}</div>

          <div class="create-shell">
            <SettingsBreadcrumb :items="breadcrumbItems" @navigate="navigateBreadcrumb" />

            <div class="team-detail-head team-detail-head--compact">
              <div class="team-detail-actions">
                <button type="button" class="secondary-button" @click="goBack">返回团队列表</button>
              </div>
            </div>

            <form class="team-detail-stack" @submit.prevent="requestSubmit">
              <TeamInfoCard
                :name="name"
                :working-directory="workingDirectory"
                :slogan="slogan"
                :rules="rules"
                @update:name="name = $event"
                @update:working-directory="workingDirectory = $event"
                @update:slogan="slogan = $event"
              @update:rules="rules = $event"
            >
              <template #actions>
                <button
                  v-if="hasDraftChanges"
                  type="button"
                    class="secondary-button team-info-action-button team-info-action-button--compact"
                    :disabled="submitting"
                    @click="resetDraft"
                  >
                    重置
                  </button>
                  <button
                    type="button"
                    class="secondary-button team-info-action-button"
                    :disabled="!canSubmit"
                    @click="requestSubmit"
                  >
                  {{ submitting ? '创建中...' : '创建团队' }}
                </button>
              </template>
            </TeamInfoCard>
          </form>

          <ConfirmDialog
            :open="confirmOpen"
            title="确认创建团队"
            :message="`确认创建团队“${name.trim()}”吗？创建后会进入团队详情页。`"
            confirm-label="创建"
            @close="closeConfirmDialog"
            @confirm="handleSubmit"
          />
        </div>
      </section>
      </main>
    </div>
  </section>
</template>

<style scoped>
.settings-shell {
  height: 100%;
  min-height: 0;
  padding: 10px 12px;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 0;
}

.settings-head {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: var(--panel-bg);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--divider);
}

.settings-head-main {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.settings-title-row {
  display: flex;
  align-items: baseline;
  gap: 14px;
  min-width: 0;
}

.settings-head h2 {
  margin: 0;
  color: var(--text-strong);
  font-size: 1.72rem;
  line-height: 1.04;
}

.settings-eyebrow {
  margin: 0;
  color: var(--accent);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 0.68rem;
  flex: 0 0 auto;
}

.settings-layout {
  min-height: 0;
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 0;
}

.settings-sidebar,
.settings-main {
  min-height: 0;
}

.settings-sidebar {
  padding-top: 10px;
}

.sidebar-card {
  height: 100%;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid var(--panel-border);
  border-radius: 14px;
  background: var(--surface-soft);
}

.sidebar-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.sidebar-card-head span {
  color: var(--muted);
}

.settings-nav {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.nav-link {
  width: 100%;
  border: 1px solid var(--panel-border);
  border-radius: 12px;
  background: var(--panel-bg);
  color: inherit;
  padding: 8px 10px;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 140ms ease,
    background 140ms ease;
}

.nav-link strong {
  display: block;
  color: var(--text-strong);
  font-size: 0.82rem;
}

.nav-link span {
  display: block;
  margin-top: 2px;
  color: var(--muted);
  font-size: 0.7rem;
}

.nav-link:hover {
  border-color: var(--focus-border);
  background: var(--backend-selected-hover, color-mix(in srgb, var(--selected) 52%, var(--panel-bg) 48%));
}

.nav-link.active {
  border-color: var(--focus-border);
  background: var(--backend-selected-active, color-mix(in srgb, var(--selected) 60%, var(--panel-bg) 40%));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--focus-border) 40%, transparent);
}

.settings-main {
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 4px 0 18px;
}

.config-section {
  padding: 12px 0 0;
}

.create-shell {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  min-height: 100%;
}

.team-detail-head {
  margin-top: 4px;
  margin-bottom: 8px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.team-detail-head--compact {
  justify-content: flex-end;
}

.team-detail-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 6px;
}

.team-detail-stack {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  min-height: 0;
  align-items: start;
}

.team-info-action-button {
  min-width: 132px;
}

.team-info-action-button--compact {
  min-width: 88px;
}

.error-banner {
  margin: 0 0 8px;
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--banner-error-bg);
  color: var(--banner-error-text);
}

@media (max-width: 960px) {
  .settings-layout {
    grid-template-columns: 1fr;
  }

  .settings-sidebar {
    padding-top: 0;
  }

  .settings-main {
    padding-left: 0;
  }

  .team-detail-head {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
