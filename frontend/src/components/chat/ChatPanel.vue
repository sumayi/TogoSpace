<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { getAgentAvatarUrl } from '../../avatar';
import { displayName, i18nText } from '../../utils';
import type { MessageInfo, RoomMemberProfile, RoomState } from '../../types';
import { useAgentStatus } from '../../realtime/selectors';
import MessageStream from './MessageStream.vue';

const props = defineProps<{
  currentRoom: RoomState | null;
  memberProfiles: RoomMemberProfile[];
  messages: MessageInfo[];
  errorMessage: string;
  reloadingMessages: boolean;
  draft: string;
  composerNotice: string;
  escalatingMessageIds?: number[];
}>();

const emit = defineEmits<{
  updateDraft: [value: string];
  submit: [];
  clickWorkingAgent: [agentId: number];
  clickAgent: [agentId: number];
  escalateMessage: [messageId: number];
}>();

const { t } = useI18n();

const hasBanner = computed(() => Boolean(props.errorMessage || props.reloadingMessages));
const membersOpen = ref(false);
const isDraftComposing = ref(false);
const currentMembers = computed(() => props.memberProfiles);

const isScheduling = computed(() => props.currentRoom?.state === 'scheduling');
const currentTurnAgentId = computed(() => props.currentRoom?.current_turn_agent_id ?? null);
const currentTurnAgent = computed<RoomMemberProfile | null>(() => {
  const agentId = currentTurnAgentId.value;
  if (agentId === null) {
    return null;
  }
  return props.memberProfiles.find((member) => member.id === agentId) ?? null;
});
const currentSpeaker = computed(() => {
  const agent = currentTurnAgent.value;
  return agent ? displayName(agent) : null;
});

const turnAgentStatus = useAgentStatus(currentTurnAgentId);
const workingAgent = computed<RoomMemberProfile | null>(() => {
  if (
    props.currentRoom?.need_scheduling
    && isScheduling.value
    && currentTurnAgent.value
    && turnAgentStatus.value === 'active'
  ) {
    return currentTurnAgent.value;
  }
  return null;
});

watch(
  () => props.currentRoom?.room_id ?? null,
  () => {
    membersOpen.value = false;
  },
);

function toggleMembers(): void {
  if (!props.currentRoom) {
    return;
  }
  membersOpen.value = !membersOpen.value;
}

function closeMembers(): void {
  membersOpen.value = false;
}

function handleComposerSubmit(): void {
  if (isDraftComposing.value) {
    return;
  }
  emit('submit');
}

function handleEnterKey(e: KeyboardEvent): void {
  if (isDraftComposing.value || e.isComposing || e.keyCode === 229) {
    return;
  }
  e.preventDefault();
  emit('submit');
}
</script>

<template>
  <section class="chat panel" :class="{ 'has-banner': hasBanner, 'no-banner': !hasBanner }">
    <div class="chat-head">
      <div class="chat-head-title">
        <h2>{{ currentRoom ? i18nText(currentRoom.i18n, 'display_name', currentRoom.room_name) : t('chat.noRoom') }}</h2>
      </div>
      <div class="chat-side-info">
        <template v-if="currentRoom">
          <span
            class="chat-head-pill"
            :class="isScheduling ? 'chat-head-pill-scheduling' : 'chat-head-pill-idle'"
            :data-tooltip="isScheduling && currentSpeaker ? t('chat.waitingSpeaker', { name: currentSpeaker }) : ''"
          >
            {{ isScheduling ? t('chat.active') : t('chat.idle') }}
          </span>
        </template>
        <button
          type="button"
          class="chat-members-button"
          :disabled="!currentRoom"
          @click="toggleMembers"
        >
          {{ t('chat.membersLabel', { count: currentMembers.length }) }}
        </button>
      </div>
    </div>

    <div v-if="errorMessage" class="banner error">{{ errorMessage }}</div>
    <div v-else-if="reloadingMessages" class="banner">{{ t('chat.loadingMessages') }}</div>

    <div class="message-viewport">
      <MessageStream
        :messages="messages"
        :member-profiles="memberProfiles"
        :working-agent="workingAgent"
        :escalating-message-ids="escalatingMessageIds"
        @click-agent="emit('clickAgent', $event)"
        @click-working-agent="emit('clickWorkingAgent', $event)"
        @escalate-message="emit('escalateMessage', $event)"
      />
    </div>

    <form v-if="currentRoom && !composerNotice" class="composer active" @submit.prevent="handleComposerSubmit">
      <div class="composer-editor">
        <textarea
          :value="draft"
          :placeholder="t('chat.inputPlaceholder')"
          rows="2"
          @input="emit('updateDraft', ($event.target as HTMLTextAreaElement).value)"
          @compositionstart="isDraftComposing = true"
          @compositionend="isDraftComposing = false"
          @keydown.enter.exact="handleEnterKey"
        ></textarea>
        <div class="composer-foot">
          <span>{{ t('chat.sendHint') }}</span>
          <button type="submit" :disabled="!draft.trim()">{{ t('chat.send') }}</button>
        </div>
      </div>
    </form>

    <div v-else-if="composerNotice" class="composer-hint">{{ composerNotice }}</div>

    <Teleport to="body">
      <div v-if="membersOpen" class="chat-members-modal" @click.self="closeMembers">
        <section class="chat-members-dialog">
          <div class="chat-members-dialog__head">
            <div>
              <p class="chat-members-dialog__eyebrow">Room Members</p>
              <h3>{{ t('chat.roomMembers') }}</h3>
            </div>
            <div class="chat-members-dialog__actions">
              <span>{{ t('room.membersCount', { count: currentMembers.length }) }}</span>
              <button type="button" class="chat-members-dialog__close" @click="closeMembers">{{ t('common.close') }}</button>
            </div>
          </div>

          <div v-if="currentMembers.length" class="chat-members-grid">
            <article v-for="member in currentMembers" :key="member.name" class="chat-member-card">
              <span v-if="member.employee_number !== null" class="chat-member-card__employee">#{{ member.employee_number }}</span>
              <div class="chat-member-card__avatar-wrap">
                <span v-if="member.is_leader" class="chat-member-card__leader-flag">Leader</span>
                <img class="chat-member-card__avatar" :src="getAgentAvatarUrl(member.name)" :alt="`${displayName(member)} avatar`" />
              </div>
              <strong>{{ displayName(member) }}</strong>
              <span v-if="member.role_template_name" class="chat-member-card__meta">{{ member.role_template_name }}</span>
            </article>
          </div>
          <p v-else class="chat-members-empty">{{ t('chat.noMembers') }}</p>
        </section>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.chat {
  display: grid;
  gap: 0;
  padding: 8px 7px;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--surface-chat);
  border-color: var(--panel-border-soft);
}

.chat.has-banner {
  grid-template-rows: auto auto minmax(0, 1fr) auto;
}

.chat.no-banner {
  grid-template-rows: auto minmax(0, 1fr) auto;
}

.chat-head {
  grid-row: 1;
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
  padding: 0 2px 8px;
  border-bottom: 1px solid var(--border-subtle);
}

.chat-head h2 {
  margin: 0;
  font-family: 'IBM Plex Sans', 'Noto Sans SC', sans-serif;
  font-weight: 600;
  letter-spacing: 0;
  color: var(--text-primary);
}

.chat-head-title {
  display: flex;
  align-items: center;
}

.chat-side-info {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  margin-left: auto;
}

.chat-head-pill,
.chat-members-button {
  border: 1px solid var(--border-subtle);
  background: color-mix(in srgb, var(--surface-pill) 88%, var(--surface-panel-muted) 12%);
  color: var(--text-secondary);
  font-size: 0.76rem;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
}

.chat-head-pill {
  position: relative;
  min-height: 28px;
  padding: 4px 12px 2px;
  border-radius: 8px;
  font-weight: 600;
}

.chat-head-pill-scheduling {
  color: var(--state-success);
  border-color: color-mix(in srgb, var(--state-success) 35%, var(--border-default) 65%);
  background: color-mix(in srgb, var(--state-success) 14%, var(--surface-panel) 86%);
}

.chat-head-pill-idle {
  color: var(--text-secondary);
}

.chat-head-pill[data-tooltip]:not([data-tooltip=''])::after {
  content: attr(data-tooltip);
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--surface-overlay);
  border: 1px solid var(--border-default);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.16);
  color: var(--text-primary);
  font-size: 0.72rem;
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
  opacity: 0;
  transform: translateY(-4px);
  pointer-events: none;
  transition:
    opacity 140ms ease,
    transform 140ms ease;
}

.chat-head-pill[data-tooltip]:not([data-tooltip='']):hover::after {
  opacity: 1;
  transform: translateY(0);
}

.chat-members-button {
  min-height: 28px;
  padding: 4px 12px 2px;
  border-radius: 8px;
  cursor: pointer;
  transition:
    border-color 140ms ease,
    background 140ms ease,
    color 140ms ease;
}

.chat-members-button:hover:not(:disabled) {
  border-color: var(--interactive-focus-border);
  color: var(--text-primary);
  background: color-mix(in srgb, var(--interactive-selected) 58%, var(--surface-panel) 42%);
}

.chat-members-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.chat-members-modal {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(6, 10, 16, 0.42);
  backdrop-filter: blur(6px);
}

.chat-members-dialog {
  width: min(860px, 100%);
  max-height: min(720px, calc(100vh - 48px));
  overflow: auto;
  padding: 18px;
  border: 1px solid color-mix(in srgb, var(--interactive-focus-border) 20%, var(--border-default) 80%);
  border-radius: 20px;
  background: var(--surface-overlay);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.18);
}

.chat-members-dialog__head,
.chat-members-dialog__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.chat-members-dialog__head {
  margin-bottom: 16px;
}

.chat-members-dialog__eyebrow {
  margin: 0 0 4px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 0.68rem;
}

.chat-members-dialog__head h3 {
  margin: 0;
  color: var(--text-primary);
  font-size: 1.15rem;
}

.chat-members-dialog__actions span,
.chat-members-empty {
  color: var(--text-secondary);
  font-size: 0.74rem;
}

.chat-members-dialog__close {
  border: 1px solid var(--border-default);
  border-radius: 999px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.76rem;
  line-height: 1;
  padding: 7px 12px;
  cursor: pointer;
}

.chat-members-dialog__close:hover {
  border-color: var(--interactive-focus-border);
  color: var(--text-primary);
}

.chat-members-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}

.chat-member-card {
  position: relative;
  padding: 12px 8px 10px;
  border: 1px solid color-mix(in srgb, var(--interactive-focus-border) 10%, var(--border-default) 90%);
  border-radius: 14px;
  background: color-mix(in srgb, var(--surface-panel-muted) 80%, var(--surface-panel) 20%);
  display: grid;
  justify-items: center;
  gap: 8px;
  text-align: center;
}

.chat-member-card__employee {
  position: absolute;
  top: 8px;
  left: 8px;
  color: var(--text-secondary);
  font-size: 0.8rem;
  line-height: 1;
  letter-spacing: 0.04em;
}

.chat-member-card__avatar-wrap {
  position: relative;
  padding-top: 14px;
}

.chat-member-card__leader-flag {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translate(-50%, -30%);
  color: color-mix(in srgb, var(--state-info) 72%, var(--text-primary) 28%);
  font-size: 0.72rem;
  line-height: 1;
  font-weight: 700;
  letter-spacing: 0.03em;
  white-space: nowrap;
}

.chat-member-card__avatar {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--interactive-focus-border) 22%, var(--border-default) 78%);
  object-fit: cover;
  background: color-mix(in srgb, var(--surface-panel-muted) 76%, var(--surface-panel) 24%);
}

.chat-member-card strong {
  color: var(--text-primary);
  font-size: 0.78rem;
  line-height: 1.25;
  word-break: break-word;
}

.chat-member-card__meta {
  color: var(--text-secondary);
  font-size: 0.76rem;
  line-height: 1.25;
  word-break: break-word;
}

.chat-members-empty {
  margin: 0;
}

.banner {
  border-radius: 6px;
  padding: 6px 8px;
  background: var(--surface-panel);
  font-size: 0.78rem;
}

.chat.has-banner .banner {
  grid-row: 2;
  margin-top: 8px;
}

.banner.error {
  background: var(--banner-error-bg);
  color: var(--banner-error-text);
}

.message-viewport {
  min-height: 0;
  overflow: hidden;
}

.chat.has-banner .message-viewport {
  grid-row: 3;
}

.chat.no-banner .message-viewport {
  grid-row: 2;
  margin-top: 2px;
}

.composer {
  background: transparent;
  border-top: 1px solid var(--border-subtle);
  padding: 8px 0 0;
  overflow: hidden;
}

.chat.has-banner .composer {
  grid-row: 4;
}

.chat.no-banner .composer {
  grid-row: 3;
}

.composer-editor {
  background: var(--surface-input);
  display: flex;
  flex-direction: column;
  border: 1px solid color-mix(in srgb, var(--border-subtle) 78%, var(--border-default) 22%);
  border-radius: 8px;
  overflow: hidden;
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease;
}

.composer-editor:focus-within {
  border-color: var(--input-focus-border);
  box-shadow: 0 0 0 2px var(--input-focus-ring);
}

.composer textarea {
  width: 100%;
  resize: none;
  min-height: 25vh;
  height: 25vh;
  max-height: 25vh;
  border: none;
  border-radius: 0;
  padding: 12px;
  color: var(--text-primary);
  background: transparent;
  outline: none;
  font-size: 0.8rem;
  line-height: 1.3;
  display: block;
}

.composer textarea::placeholder {
  color: var(--text-secondary);
}

.composer textarea:focus {
  box-shadow: none;
}

.composer textarea:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.composer-foot {
  position: relative;
  display: block;
  margin-top: 0;
  padding: 12px 64px 9px 12px;
  font-size: 0.74rem;
  background: transparent;
}

.composer-foot span {
  display: block;
  color: var(--text-secondary);
  line-height: 1;
}

.composer-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 5px;
  font-size: 0.74rem;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
}

.composer-toggle input {
  display: none;
}

.composer-toggle.active {
  color: #f59e0b;
}

.composer-hint {
  background: transparent;
  border-top: 1px solid var(--border-subtle);
  color: var(--text-tertiary);
  text-align: center;
  padding: 3px 8px;
  font-size: 0.74rem;
}

.chat.has-banner .composer-hint {
  grid-row: 4;
}

.chat.no-banner .composer-hint {
  grid-row: 3;
}

.composer button {
  position: absolute;
  right: 9px;
  bottom: 9px;
  border: 0;
  border-radius: 6px;
  padding: 5px 10px;
  background: var(--interactive-selected);
  color: var(--text-primary);
  font-weight: 700;
  cursor: pointer;
  font-size: 0.74rem;
}

.composer button:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

:global(html.bp-layout-narrow) .chat-head,
:global(html.bp-layout-narrow) .composer-foot {
  flex-direction: column;
  align-items: flex-start;
}

:global(html.bp-layout-narrow) .chat-members-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

:global(html.bp-compact) .chat {
  padding: 10px 6px 8px;
  border-radius: 16px;
}

:global(html.bp-compact) .chat-head {
  gap: 8px;
  padding-bottom: 10px;
}

:global(html.bp-compact) .chat-head h2 {
  font-size: 1.06rem;
  line-height: 1.2;
}

:global(html.bp-compact) .chat-side-info {
  width: 100%;
  justify-content: flex-start;
  gap: 8px;
}

:global(html.bp-compact) .chat-head-pill,
:global(html.bp-compact) .chat-members-button {
  min-height: 32px;
  padding: 6px 12px 4px;
  font-size: 0.78rem;
}

:global(html.bp-compact) .banner {
  font-size: 0.76rem;
}

:global(html.bp-compact) .composer {
  padding-top: 10px;
}

:global(html.bp-compact) .composer textarea {
  min-height: 108px;
  height: 108px;
  max-height: 180px;
  padding: 12px 12px 10px;
  font-size: 0.86rem;
  line-height: 1.45;
}

:global(html.bp-compact) .composer-foot {
  min-height: 58px;
  padding: 10px 76px 11px 12px;
}

:global(html.bp-compact) .composer-foot span {
  line-height: 1.35;
}

:global(html.bp-compact) .composer button {
  right: 10px;
  bottom: 10px;
  min-width: 56px;
  min-height: 36px;
  font-size: 0.76rem;
}

:global(html.bp-compact) .composer-hint {
  padding: 8px 10px calc(8px + env(safe-area-inset-bottom, 0px));
  line-height: 1.4;
}

:global(html.bp-compact) .chat-members-modal {
  padding: 14px;
}

:global(html.bp-compact) .chat-members-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

:global(html.bp-console-short) .chat {
  padding: 6px 5px 5px;
  border-radius: 12px;
}

:global(html.bp-console-short) .chat-head {
  gap: 4px;
  padding: 0 2px 4px;
}

:global(html.bp-console-short) .chat-head h2 {
  font-size: 0.92rem;
  line-height: 1.2;
}

:global(html.bp-console-short) .chat-side-info {
  gap: 4px;
}

:global(html.bp-console-short) .chat-head-pill,
:global(html.bp-console-short) .chat-members-button {
  min-height: 24px;
  padding: 3px 8px 2px;
  font-size: 0.68rem;
}

:global(html.bp-console-short) .banner {
  padding: 4px 6px;
  font-size: 0.68rem;
}

:global(html.bp-console-short) .chat.has-banner .banner {
  margin-top: 4px;
}

:global(html.bp-console-short) .chat.no-banner .message-viewport {
  margin-top: 0;
}

:global(html.bp-console-short) .composer {
  padding-top: 4px;
}

:global(html.bp-console-short) .composer-editor {
  border-radius: 8px;
}

:global(html.bp-console-short) .composer textarea {
  min-height: 56px;
  height: 56px;
  max-height: 72px;
  padding: 8px 8px 6px;
  font-size: 0.76rem;
  line-height: 1.3;
}

:global(html.bp-console-short) .composer-foot {
  min-height: 34px;
  padding: 6px 54px 6px 8px;
  font-size: 0.64rem;
}

:global(html.bp-console-short) .composer-foot span {
  line-height: 1.2;
}

:global(html.bp-console-short) .composer button {
  right: 6px;
  bottom: 5px;
  min-width: 44px;
  min-height: 24px;
  font-size: 0.66rem;
}

:global(html.bp-console-short) .composer-hint {
  padding: 4px 6px;
  font-size: 0.66rem;
}
</style>
