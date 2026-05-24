<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import TeamMemberGraph from './TeamMemberGraph.vue';
import type { TeamGraphNode } from './teamGraphTypes';

type MemberPanelAction = {
  key: string;
  label: string;
  disabled?: boolean;
  primary?: boolean;
};

withDefaults(defineProps<{
  teamName: string;
  selectedAgents: string[];
  selectedAgentIds?: Record<string, number | null>;
  memberTemplates?: Record<string, string>;
  rootNode?: TeamGraphNode | null;
  statusMessage?: string;
  readonly?: boolean;
  actions?: MemberPanelAction[];
  showEditAction?: boolean;
}>(), {
  memberTemplates: () => ({}),
  rootNode: null,
  statusMessage: '',
  readonly: false,
  actions: () => [],
  showEditAction: false,
});

const emit = defineEmits<{
  toggleAgent: [nodeId: string];
  viewAgent: [agentId: number | null, nodeId: string, agentName: string];
  editAgent: [nodeId: string];
  editDepartment: [nodeId: string];
  viewDepartment: [nodeId: string];
  addSubordinate: [nodeId: string];
  editPendingSlot: [slotId: string];
  removePendingSlot: [slotId: string];
  action: [key: string];
}>();

const { t } = useI18n();
</script>

<template>
  <section class="member-panel">
    <div class="member-panel-head">
      <div class="member-panel-head-segment member-panel-head-segment--label">
        <span class="panel-label">{{ t('agent.teamMembersLabel') }}</span>
      </div>
    </div>

    <div v-if="actions.length" class="member-panel-actions">
        <button
          v-for="action in actions"
          :key="action.key"
          type="button"
          class="secondary-button member-panel-action"
          :class="{ 'member-panel-action--primary': action.primary }"
          :disabled="action.disabled"
          @click="emit('action', action.key)"
        >
          {{ action.label }}
        </button>
    </div>

    <div v-if="statusMessage" class="member-panel-status">
      <strong>{{ statusMessage }}</strong>
    </div>

    <TeamMemberGraph
      v-else
      :team-name="teamName"
      :selected-agents="selectedAgents"
      :selected-agent-ids="selectedAgentIds"
      :member-templates="memberTemplates"
      :root-node="rootNode"
      :readonly="readonly"
      :show-edit-action="showEditAction"
      @toggle-agent="emit('toggleAgent', $event)"
      @view-agent="(agentId, nodeId, agentName) => emit('viewAgent', agentId, nodeId, agentName)"
      @edit-agent="emit('editAgent', $event)"
      @edit-department="emit('editDepartment', $event)"
      @view-department="emit('viewDepartment', $event)"
      @add-subordinate="emit('addSubordinate', $event)"
      @edit-pending-slot="emit('editPendingSlot', $event)"
      @remove-pending-slot="emit('removePendingSlot', $event)"
    />
  </section>
</template>

<style scoped>
.member-panel {
  position: relative;
  display: grid;
  gap: 8px;
  border: 1px solid var(--team-create-panel-border);
  border-radius: 20px;
  background: var(--panel-bg);
  box-shadow: var(--panel-shadow);
  padding: 10px 12px;
  min-height: 0;
  overflow: hidden;
  align-self: stretch;
  padding-bottom: 10px;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    background-color 0.18s ease;
}

.member-panel:focus-within {
  border-color: color-mix(in srgb, var(--focus-border) 88%, #ffffff 12%);
  box-shadow:
    var(--panel-shadow),
    0 0 0 4px color-mix(in srgb, var(--focus-border) 28%, transparent);
  background: color-mix(in srgb, var(--panel-bg) 84%, var(--selected) 16%);
}

.member-panel-head {
  position: absolute;
  top: 10px;
  left: 12px;
  z-index: 2;
  display: flex;
  align-items: center;
  min-height: 36px;
}

.member-panel-head-segment {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  background: color-mix(in srgb, var(--panel-bg) 90%, transparent);
  padding: 0 8px;
}

.panel-label {
  display: inline-flex;
  align-items: center;
  padding: 0;
  border-radius: 0;
  background: transparent;
  color: var(--text-strong);
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.member-panel-actions {
  position: absolute;
  right: 12px;
  bottom: 10px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 40px;
  background: color-mix(in srgb, var(--panel-bg) 90%, transparent);
  padding: 4px 10px 0;
}

.member-panel-action {
  height: 30px;
  min-width: 108px;
  padding: 0 12px;
  font-size: 0.82rem;
}

.member-panel-action:disabled {
  opacity: 1;
  cursor: not-allowed;
  color: var(--hint-text);
  border-color: color-mix(in srgb, var(--panel-border) 76%, transparent 24%);
  background: color-mix(in srgb, var(--surface-soft) 82%, var(--panel-bg) 18%);
  box-shadow: none;
}

.member-panel-action--primary {
  border-color: color-mix(in srgb, var(--focus-border) 45%, var(--team-create-control-border) 55%);
  background: color-mix(in srgb, var(--selected) 28%, var(--panel-bg) 72%);
}

.member-panel-action--primary:disabled {
  border-color: color-mix(in srgb, var(--panel-border) 76%, transparent 24%);
  background: color-mix(in srgb, var(--surface-soft) 82%, var(--panel-bg) 18%);
}

.member-panel-status {
  min-height: 452px;
  display: grid;
  place-items: center;
  padding: 48px 20px 20px;
  text-align: center;
}

.member-panel-status strong {
  min-width: 280px;
  min-height: 220px;
  padding: 24px 28px;
  border: 1px dashed color-mix(in srgb, var(--focus-border) 26%, var(--panel-border) 74%);
  border-radius: 20px;
  background: color-mix(in srgb, var(--panel-bg) 72%, var(--surface-soft) 28%);
  display: grid;
  place-items: center;
  color: var(--text-strong);
  font-size: 1rem;
  font-weight: 600;
}
</style>
