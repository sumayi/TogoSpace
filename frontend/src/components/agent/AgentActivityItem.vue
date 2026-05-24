<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { getTeamRooms } from '../../realtime/runtimeStore';
import type { AgentActivity } from '../../types';
import { displayName } from '../../utils';

const { t } = useI18n();

const props = defineProps<{
  activity: AgentActivity;
}>();

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function formatActivityTime(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  return value.replace('T', ' ').slice(0, 19);
}

function formatDuration(durationMs: number | null | undefined): string {
  if (durationMs == null || Number.isNaN(durationMs) || durationMs < 0) {
    return '0ms';
  }
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  return `${(durationMs / 1000).toFixed(durationMs >= 10_000 ? 0 : 1)}s`;
}

const toolName = computed(() => {
  const metadataToolName = props.activity.metadata?.tool_name;
  if (typeof metadataToolName === 'string' && metadataToolName.trim()) {
    return metadataToolName.trim();
  }
  const detail = props.activity.detail.trim();
  return props.activity.activity_type === 'tool_call' ? detail : '';
});

const roomName = computed(() => {
  // send_chat_msg 的目标房间存放在 tool_arguments.room_name
  const toolArguments = props.activity.metadata?.tool_arguments;
  if (toolArguments && typeof toolArguments === 'object') {
    const argRoomName = (toolArguments as { room_name?: unknown }).room_name;
    if (typeof argRoomName === 'string' && argRoomName.trim()) {
      return argRoomName.trim();
    }
  }
  return '';
});

function activityStatusSymbol(status: AgentActivity['status']): string {
  if (status === 'started') {
    return '●';
  }
  if (status === 'succeeded') {
    return '✓';
  }
  return '×';
}

function shouldShowToolName(activity: AgentActivity): boolean {
  return activity.activity_type === 'tool_call'
    && toolName.value !== 'send_chat_msg'
    && toolName.value !== 'finish_chat_turn'
    && toolName.value !== 'start_chat'
    && toolName.value.length > 0;
}

function activityTitle(activity: AgentActivity): string {
  if (activity.activity_type === 'agent_state') {
    const detail = activity.detail.trim().toUpperCase();
    if (detail === 'ACTIVE') {
      return t('agent.activityType.startActivity');
    }
    if (detail === 'IDLE') {
      return t('agent.activityType.stopAction');
    }
  }

  if (activity.activity_type === 'tool_call') {
    if (toolName.value === 'send_chat_msg') {
      return t('agent.activityType.sendMessage');
    }
    if (toolName.value === 'finish_chat_turn') {
      return t('agent.activityType.finishTurn');
    }
    if (toolName.value === 'start_chat') {
      return t('agent.activityType.startChat');
    }
  }

  switch (activity.activity_type) {
    case 'agent_state':
      return t('agent.activityType.agentState');
    case 'llm_infer':
      return t('agent.activityType.llmInfer');
    case 'reasoning':
      return t('agent.activityType.reasoning');
    case 'chat_reply':
      return t('agent.activityType.chatReply');
    case 'tool_call':
      return t('agent.activityType.toolCall');
    case 'compact':
      return t('agent.activityType.compact');
    case 'message_received':
      return t('agent.activityType.messageReceived');
    case 'unknown':
      return t('agent.activityType.unknown');
    default:
      return t('agent.activityType.unknown');
  }
}

function getReceivedMessages(activity: AgentActivity): Array<{ sender: string; content: string }> {
  const messages = activity.metadata?.messages;
  if (!Array.isArray(messages)) {
    return [];
  }
  return messages.filter(
    (m): m is { sender: string; content: string } =>
      m != null && typeof m.sender === 'string' && typeof m.content === 'string',
  );
}

function getActivityToolCommand(activity: AgentActivity): string {
  const command = activity.metadata?.command;
  return typeof command === 'string' ? command : '';
}

function getActivityToolArguments(activity: AgentActivity): string {
  const toolArguments = activity.metadata?.tool_arguments;
  if (toolArguments == null) {
    return '';
  }

  if (typeof toolArguments !== 'object' || toolArguments === null) {
    return t('agent.parseFailed');
  }

  if (toolName.value === 'execute_bash') {
    const command = readTrimmedString((toolArguments as { command?: unknown }).command);
    if (command) {
      return command;
    }
  }

  if (toolName.value === 'write_file' || toolName.value === 'read_file') {
    const filePath = readTrimmedString((toolArguments as { file_path?: unknown }).file_path);
    if (filePath) {
      return filePath;
    }
  }

  return JSON.stringify(toolArguments);
}

function getSendMessageContent(activity: AgentActivity): string {
  const toolArguments = activity.metadata?.tool_arguments;
  if (toolArguments == null || typeof toolArguments !== 'object') {
    return toolArguments == null ? '' : t('agent.parseFailed');
  }

  const candidate = toolArguments as { msg?: unknown; content?: unknown; text?: unknown };
  const message = [candidate.msg, candidate.content, candidate.text]
    .map((item) => readTrimmedString(item))
    .find(Boolean);
  return message || t('agent.parseFailed');
}

function getSendMessagePrefix(): string {
  if (!roomName.value) {
    return '';
  }
  return t('agent.sendToRoomPrefix', { room: roomName.value });
}

function getStartChatTarget(): string {
  if (toolName.value !== 'start_chat') {
    return '';
  }
  const toolArguments = props.activity.metadata?.tool_arguments;
  if (!toolArguments || typeof toolArguments !== 'object') {
    return '';
  }
  const agentName = readTrimmedString((toolArguments as { agent_name?: unknown }).agent_name);
  return agentName ? t('agent.startChatTarget', { agent: agentName }) : '';
}

function getTaskRoomDisplayName(activity: AgentActivity): string {
  const taskRoomId = activity.metadata?.task_room_id;
  if (typeof taskRoomId !== 'number') {
    return '';
  }
  const room = getTeamRooms(activity.team_id).find((item) => item.room_id === taskRoomId);
  if (!room) {
    return '';
  }
  return displayName({ name: room.room_name, i18n: room.i18n });
}

function getTaskRoomLabel(activity: AgentActivity): string {
  if (
    activity.activity_type !== 'message_received'
    && !(activity.activity_type === 'tool_call' && toolName.value === 'finish_chat_turn')
  ) {
    return '';
  }
  const taskRoomName = getTaskRoomDisplayName(activity);
  if (!taskRoomName) {
    return '';
  }
  return t('agent.finishTurnRoomLabel', { room: taskRoomName });
}

function getExecuteBashStdout(activity: AgentActivity): string {
  const toolResult = activity.metadata?.tool_result;
  if (!toolResult || typeof toolResult !== 'object') {
    return '';
  }
  return readTrimmedString((toolResult as { stdout?: unknown }).stdout);
}

function getExecuteBashStderr(activity: AgentActivity): string {
  const toolResult = activity.metadata?.tool_result;
  if (!toolResult || typeof toolResult !== 'object') {
    return '';
  }
  return readTrimmedString((toolResult as { stderr?: unknown }).stderr);
}

function getExecuteBashExitCode(activity: AgentActivity): string {
  const toolResult = activity.metadata?.tool_result;
  if (!toolResult || typeof toolResult !== 'object') {
    return '';
  }
  const exitCode = (toolResult as { exit_code?: unknown }).exit_code;
  return typeof exitCode === 'number' ? `return_code=${exitCode}` : '';
}

function getActivityToolResult(activity: AgentActivity): string {
  if (toolName.value === 'execute_bash') {
    return [getExecuteBashStdout(activity), getExecuteBashStderr(activity)].filter(Boolean).join('\n');
  }

  if (toolName.value === 'write_file') {
    const toolArguments = activity.metadata?.tool_arguments;
    if (toolArguments && typeof toolArguments === 'object') {
      const candidate = toolArguments as { content?: unknown; text?: unknown };
      const writeContent = [candidate.content, candidate.text]
        .map((item) => readTrimmedString(item))
        .find(Boolean);
      if (writeContent) {
        return writeContent;
      }
    }
  }

  const toolResult = activity.metadata?.tool_result;
  if (toolResult == null) {
    return '';
  }
  if (typeof toolResult === 'string') {
    return toolResult.trim();
  }
  if (typeof toolResult === 'number' || typeof toolResult === 'boolean') {
    return String(toolResult);
  }
  if (typeof toolResult === 'object') {
    const candidate = toolResult as { message?: unknown; content?: unknown; text?: unknown };
    const preferredText = [candidate.message, candidate.content, candidate.text]
      .map((item) => readTrimmedString(item))
      .find(Boolean);
    if (preferredText) {
      return preferredText;
    }
    try {
      return JSON.stringify(toolResult, null, 2);
    } catch {
      return t('agent.parseFailed');
    }
  }
  return t('agent.parseFailed');
}

function activityMetaTokens(activity: AgentActivity): string {
  const metadata = activity.metadata ?? {};
  const currentTotal = typeof metadata.current_total_tokens === 'number' ? metadata.current_total_tokens : null;
  const finalTotal = typeof metadata.final_total_tokens === 'number' ? metadata.final_total_tokens : null;
  const estimated = typeof metadata.estimated_prompt_tokens === 'number' ? metadata.estimated_prompt_tokens : null;
  const currentCompletion = typeof metadata.current_completion_tokens === 'number' ? metadata.current_completion_tokens : null;
  if (finalTotal !== null) {
    return `tokens ${finalTotal}`;
  }
  if (currentTotal !== null) {
    return `tokens ${currentTotal}`;
  }
  if (estimated !== null) {
    return t('agent.tokenEstimate', { count: estimated + (currentCompletion ?? 0) });
  }
  return '';
}

function getActivityModel(activity: AgentActivity): string {
  const model = activity.metadata?.model;
  return typeof model === 'string' ? model : '';
}

function getActivityToolName(activity: AgentActivity): string {
  const metadataToolName = activity.metadata?.tool_name;
  return typeof metadataToolName === 'string' ? metadataToolName : '';
}

function activitySummary(
  activity: AgentActivity,
  summaryToolName: string,
  showToolName: boolean,
  toolArguments: string,
  toolCommand: string,
): string {
  if (activity.activity_type === 'tool_call') {
    if (summaryToolName === 'send_chat_msg') {
      return '';
    }
    if (summaryToolName === 'finish_chat_turn') {
      return '';
    }
    if (showToolName && toolArguments) {
      return '';
    }
  }

  if (toolCommand) {
    return toolCommand;
  }

  const detail = activity.detail.trim();
  if (activity.activity_type === 'agent_state' && (detail.toUpperCase() === 'ACTIVE' || detail.toUpperCase() === 'IDLE')) {
    return '';
  }
  if (detail && detail !== summaryToolName) {
    if (activity.activity_type === 'reasoning') {
      return `💭 ${detail}`;
    }
    return detail;
  }

  return activity.error_message?.trim() ?? '';
}

const activityView = computed(() => {
  const activity = props.activity;
  const currentToolName = toolName.value;
  const isFinishTurnActivity = activity.activity_type === 'tool_call' && currentToolName === 'finish_chat_turn';
  const currentTitle = activityTitle(activity);
  const currentToolCommand = getActivityToolCommand(activity);
  const currentToolArguments = getActivityToolArguments(activity);
  const currentModel = getActivityModel(activity);
  const currentMetadataToolName = getActivityToolName(activity);
  const showToolName = shouldShowToolName(activity);
  const currentSendMessagePrefix = currentToolName === 'send_chat_msg' ? getSendMessagePrefix() : '';
  const currentStartChatTarget = currentToolName === 'start_chat' ? getStartChatTarget() : '';
  const currentTaskRoomLabel = getTaskRoomLabel(activity);
  const executeBashResult = activity.activity_type === 'tool_call' && currentToolName === 'execute_bash';
  const currentStdout = executeBashResult ? getExecuteBashStdout(activity) : '';
  const currentStderr = executeBashResult ? getExecuteBashStderr(activity) : '';
  const currentExitCode = executeBashResult ? getExecuteBashExitCode(activity) : '';
  const currentToolResult = getActivityToolResult(activity);
  const currentErrorMessage = readTrimmedString(activity.error_message);
  const expandedToolResult = activity.activity_type === 'tool_call'
    && currentToolName !== 'send_chat_msg'
    && (!isFinishTurnActivity || activity.status === 'failed')
    && Boolean(currentToolResult);
  const expandedMessage = activity.activity_type === 'tool_call' && currentToolName === 'send_chat_msg';
  const sendChatMsgContent = expandedMessage ? getSendMessageContent(activity) : '';
  const sendChatMsgTruncated = sendChatMsgContent.split('\n').length > 5 || sendChatMsgContent.length > 350;
  const sendChatMsgError = expandedMessage && activity.status === 'failed'
    ? (currentErrorMessage || currentToolResult)
    : '';
  const receivedMessages = getReceivedMessages(activity);
  const expandedContent = activity.activity_type === 'chat_reply' || expandedMessage || expandedToolResult
    || (activity.activity_type === 'message_received' && receivedMessages.length > 0);
  const currentSummary = activitySummary(
    activity,
    currentToolName,
    showToolName,
    currentToolArguments,
    currentToolCommand,
  );
  const inlineTitle = !(
    Boolean(currentSummary)
    || showToolName
    || (activity.activity_type === 'llm_infer' && Boolean(currentModel))
    || (activity.activity_type !== 'tool_call' && Boolean(currentMetadataToolName))
  );

  return {
    durationText: formatDuration(activity.duration_ms),
    executeBashResult,
    expandedContent,
    expandedMessage,
    expandedToolResult,
    taskRoomLabel: currentTaskRoomLabel,
    receivedMessages,
    exitCode: currentExitCode,
    inlineTitle,
    metadataToolName: currentMetadataToolName,
    model: currentModel,
    sendChatMsgContent,
    sendChatMsgError,
    sendChatMsgTruncated,
    sendMessagePrefix: currentSendMessagePrefix,
    startChatTarget: currentStartChatTarget,
    showErrorMessage: Boolean(currentErrorMessage) && currentErrorMessage !== currentToolResult && !expandedMessage,
    showSummary: Boolean(currentSummary),
    showToolArguments: showToolName && Boolean(currentToolArguments),
    showToolName,
    startedAtText: formatActivityTime(activity.started_at),
    stateSymbol: activityStatusSymbol(activity.status),
    stderr: currentStderr,
    stdout: currentStdout,
    summary: currentSummary,
    summaryIsCode: Boolean(currentToolCommand),
    summaryTitle: expandedContent ? '' : currentSummary,
    title: currentTitle,
    tokenText: activityMetaTokens(activity),
    toolArguments: currentToolArguments,
    toolName: currentToolName,
    toolResult: currentToolResult,
  };
});
</script>

<template>
  <article
    class="agent-activity-item"
    :class="{
      'agent-activity-item--expanded': activityView.expandedContent,
      'agent-activity-item--message': activityView.expandedMessage,
      'agent-activity-item--tool-result': activityView.expandedToolResult,
      'agent-activity-item--bash-result': activityView.executeBashResult,
    }"
    :data-status="activity.status"
    :data-activity-type="activity.activity_type"
  >
    <div class="agent-activity-item__row">
      <span class="agent-activity-item__state-anchor" tabindex="0">
        <span class="agent-activity-item__state" :data-status="activity.status">{{ activityView.stateSymbol }}</span>
        <span class="agent-activity-item__state-popover">
          <span class="agent-activity-item__state-row">
            <span class="agent-activity-item__state-row-left">
              <span class="agent-activity-item__state-title">{{ activityView.title }}</span>
              <span class="agent-activity-item__state-meta agent-activity-item__state-meta--strong">{{ activityView.durationText }}</span>
            </span>
            <span class="agent-activity-item__state-meta">{{ activityView.startedAtText }}</span>
          </span>
          <span v-if="activityView.exitCode" class="agent-activity-item__state-extra">
            {{ activityView.exitCode }}
          </span>
        </span>
      </span>
      <strong v-if="activityView.inlineTitle" class="agent-activity-item__title">{{ activityView.title }}</strong>
      <span
        v-if="activityView.showToolName"
        class="agent-activity-item__chip agent-activity-item__chip--mono agent-activity-item__tool-name"
        :title="activityView.toolName"
      >{{ activityView.toolName }}</span>
      <span
        v-if="activityView.showToolArguments"
        class="agent-activity-item__summary agent-activity-item__summary--code agent-activity-item__tool-args"
        :title="activityView.toolArguments"
      >{{ activityView.toolArguments }}</span>
      <span
        v-if="activity.activity_type === 'llm_infer' && activityView.model"
        class="agent-activity-item__chip agent-activity-item__chip--mono"
        :title="activityView.model"
      >{{ activityView.model }}</span>
      <span
        v-if="activityView.sendMessagePrefix"
        class="agent-activity-item__chip"
        :title="activityView.sendMessagePrefix"
      >{{ activityView.sendMessagePrefix }}</span>
      <span
        v-if="activityView.startChatTarget"
        class="agent-activity-item__chip"
        :title="activityView.startChatTarget"
      >{{ activityView.startChatTarget }}</span>
      <span
        v-if="activityView.showSummary"
        class="agent-activity-item__summary"
        :class="{ 'agent-activity-item__summary--code': activityView.summaryIsCode }"
        :title="activityView.summaryTitle"
      >{{ activityView.summary }}</span>
      <span
        v-if="activity.activity_type !== 'llm_infer' && activityView.model"
        class="agent-activity-item__chip agent-activity-item__chip--mono"
        :title="activityView.model"
      >{{ activityView.model }}</span>
      <span
        v-if="activity.activity_type !== 'tool_call' && activityView.metadataToolName"
        class="agent-activity-item__chip agent-activity-item__chip--mono"
        :title="activityView.metadataToolName"
      >{{ activityView.metadataToolName }}</span>
      <span v-if="activityView.tokenText" class="agent-activity-item__tail">
        <span class="agent-activity-item__tokens">{{ activityView.tokenText }}</span>
      </span>
      <span v-if="activityView.taskRoomLabel" class="agent-activity-item__tail">
        <span
          class="agent-activity-item__finish-turn-room"
          :title="activityView.taskRoomLabel"
        >{{ activityView.taskRoomLabel }}</span>
      </span>
    </div>
    <p v-if="activityView.sendChatMsgContent" class="agent-activity-item__send-chat-content">{{ activityView.sendChatMsgContent }}</p>
    <p v-if="activityView.sendChatMsgTruncated && !activityView.sendChatMsgError" class="agent-activity-item__content-more">...</p>
    <p v-if="activityView.sendChatMsgError" class="agent-activity-item__error">调用失败：{{ activityView.sendChatMsgError }}</p>
    <template v-if="activityView.executeBashResult">
      <p
        v-if="activityView.stdout"
        class="agent-activity-item__tool-result agent-activity-item__tool-result--stdout"
      >{{ activityView.stdout }}</p>
      <p
        v-if="activityView.stderr"
        class="agent-activity-item__tool-result agent-activity-item__tool-result--stderr"
      >{{ activityView.stderr }}</p>
    </template>
    <template v-else>
      <p
        v-if="activityView.expandedToolResult"
        class="agent-activity-item__tool-result"
      >{{ activityView.toolResult }}</p>
    </template>
    <template v-if="activity.activity_type === 'message_received' && activityView.receivedMessages.length > 0">
      <p
        v-for="(msg, idx) in activityView.receivedMessages"
        :key="idx"
        class="agent-activity-item__received-message"
      ><span class="agent-activity-item__received-sender">{{ msg.sender }}:</span> {{ msg.content }}</p>
    </template>
    <p v-if="activityView.showErrorMessage" class="agent-activity-item__error">{{ activity.error_message }}</p>
  </article>
</template>

<style scoped>
.agent-activity-item {
  display: grid;
  gap: 3px;
  padding: 6px 8px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--panel-bg) 94%, var(--surface-soft) 6%);
  border: 1px solid color-mix(in srgb, var(--panel-border) 84%, transparent);
}

.agent-activity-item[data-status='started'] {
  background: color-mix(in srgb, var(--accent) 6%, var(--panel-bg) 94%);
  border-color: color-mix(in srgb, var(--accent) 20%, var(--panel-border) 80%);
}

.agent-activity-item[data-status='failed'] {
  border-color: color-mix(in srgb, var(--danger, #f85149) 52%, var(--panel-border) 48%);
  background:
    linear-gradient(180deg,
      color-mix(in srgb, var(--danger, #f85149) 14%, var(--panel-bg) 86%) 0%,
      color-mix(in srgb, var(--danger, #f85149) 10%, var(--panel-bg) 90%) 100%);
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--danger, #f85149) 10%, transparent),
    0 0 0 1px color-mix(in srgb, var(--danger, #f85149) 6%, transparent);
}

.agent-activity-item__row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex-wrap: nowrap;
  overflow: visible;
}

.agent-activity-item__state-anchor {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  outline: none;
}

.agent-activity-item__state {
  flex: none;
  width: 14px;
  text-align: center;
  font-size: 0.78rem;
  font-weight: 600;
  line-height: 1;
  color: var(--muted);
}

.agent-activity-item__state[data-status='started'] {
  color: var(--good);
}

.agent-activity-item__state[data-status='succeeded'] {
  color: var(--good);
}

.agent-activity-item__state[data-status='failed'],
.agent-activity-item__state[data-status='cancelled'] {
  color: var(--danger, #f85149);
}

.agent-activity-item__state-popover {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 10;
  display: grid;
  gap: 8px;
  min-width: 236px;
  max-width: 280px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--panel-border) 84%, transparent);
  background: var(--surface-elevated);
  box-shadow: none;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-4px);
  pointer-events: auto;
  transition:
    opacity 120ms ease,
    transform 120ms ease,
    visibility 120ms ease;
}

.agent-activity-item__state-title {
  color: var(--text-strong);
  font-size: 0.78rem;
  line-height: 1.25;
  font-weight: 600;
  white-space: nowrap;
}

.agent-activity-item__state-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
}

.agent-activity-item__state-row-left {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.agent-activity-item__state-anchor:hover .agent-activity-item__state-popover,
.agent-activity-item__state-anchor:focus-visible .agent-activity-item__state-popover,
.agent-activity-item__state-anchor:focus-within .agent-activity-item__state-popover {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}

.agent-activity-item__state-meta {
  color: var(--text);
  font-size: 0.72rem;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  opacity: 0.88;
}

.agent-activity-item__state-meta--strong {
  font-weight: 600;
  opacity: 1;
}

.agent-activity-item__state-extra {
  color: var(--muted);
  font-size: 0.7rem;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.agent-activity-item__title {
  flex: none;
  color: var(--text-strong);
  font-size: 0.82rem;
  line-height: 1.2;
  font-weight: 600;
}

.agent-activity-item__row span {
  color: var(--muted);
  font-size: 0.7rem;
  line-height: 1.2;
}

.agent-activity-item__chip {
  flex: none;
  display: inline-flex;
  align-items: center;
  max-width: 180px;
  min-width: 0;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface-soft) 74%, transparent);
  color: var(--muted);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-activity-item__chip--mono {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 0.68rem;
}

.agent-activity-item__status {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 42px;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: color-mix(in srgb, var(--accent) 76%, var(--text) 24%);
  font-weight: 600;
}

.agent-activity-item__tail {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex: none;
  min-width: max-content;
  padding-left: 8px;
}

.agent-activity-item__tail > * {
  flex: none;
}

.agent-activity-item__tokens {
  min-width: 66px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.agent-activity-item__finish-turn-room {
  min-width: 0;
  max-width: 220px;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-activity-item[data-status='started'] .agent-activity-item__status {
  background: color-mix(in srgb, var(--good) 16%, transparent);
  color: color-mix(in srgb, var(--good) 84%, var(--text) 16%);
}

.agent-activity-item[data-status='failed'] .agent-activity-item__status {
  background: color-mix(in srgb, var(--danger, #f85149) 18%, transparent);
  color: var(--danger, #f85149);
}

.agent-activity-item__summary {
  min-width: 0;
  flex: 1 1 auto;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-activity-item__tool-name,
.agent-activity-item__tool-args {
  min-width: 0;
  white-space: nowrap;
}

.agent-activity-item__tool-name {
  max-width: 150px;
}

.agent-activity-item__tool-args {
  flex: 1 1 auto;
  max-width: none;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-activity-item[data-activity-type='tool_call'] .agent-activity-item__tail {
  flex: 0 1 auto;
  min-width: 0;
}

.agent-activity-item[data-activity-type='tool_call'] .agent-activity-item__tokens {
  min-width: 0;
  max-width: 96px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-activity-item[data-status='started'] .agent-activity-item__summary {
  color: var(--muted);
}

.agent-activity-item__summary--code {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 0.69rem;
  font-weight: 600;
  color: var(--muted);
}

.agent-activity-item__send-chat-content {
  margin: 0;
  padding-left: 22px;
  color: var(--text);
  font-size: 0.8rem;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 5;
}

.agent-activity-item[data-status='failed'] .agent-activity-item__send-chat-content {
  color: color-mix(in srgb, var(--danger, #f85149) 68%, var(--text) 32%);
}

.agent-activity-item__content-more {
  margin: 0;
  padding-left: 22px;
  color: var(--muted);
  font-size: 0.8rem;
  line-height: 1.2;
}

.agent-activity-item__error {
  margin: 0;
  color: var(--danger, #f85149);
  font-size: 0.7rem;
  font-weight: 600;
  line-height: 1.35;
  padding-left: 22px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-activity-item[data-status='failed'] .agent-activity-item__title {
  color: color-mix(in srgb, var(--danger, #f85149) 56%, var(--text-strong) 44%);
}

.agent-activity-item[data-status='failed'] .agent-activity-item__row span {
  color: color-mix(in srgb, var(--danger, #f85149) 52%, var(--text) 48%);
}

.agent-activity-item[data-status='failed'] .agent-activity-item__summary {
  color: color-mix(in srgb, var(--danger, #f85149) 68%, var(--text) 32%);
}

.agent-activity-item[data-status='failed'] .agent-activity-item__chip {
  background: color-mix(in srgb, var(--danger, #f85149) 16%, transparent);
  color: color-mix(in srgb, var(--danger, #f85149) 72%, var(--text) 28%);
}

.agent-activity-item[data-status='failed'] .agent-activity-item__tool-result,
.agent-activity-item[data-status='failed'] .agent-activity-item__received-message {
  color: color-mix(in srgb, var(--danger, #f85149) 76%, var(--text) 24%);
}

.agent-activity-item[data-status='failed'] .agent-activity-item__received-sender {
  color: color-mix(in srgb, var(--danger, #f85149) 88%, var(--text-strong) 12%);
}

.agent-activity-item--expanded .agent-activity-item__row {
  flex-wrap: nowrap;
  align-items: flex-start;
}

.agent-activity-item--expanded .agent-activity-item__state-anchor {
  margin-top: 0.18rem;
}

.agent-activity-item--expanded .agent-activity-item__summary {
  flex: 1 1 auto;
  min-width: 0;
  padding-left: 0;
  white-space: pre-wrap;
  overflow: visible;
  text-overflow: clip;
  font-size: 0.8rem;
  line-height: 1.55;
  color: var(--text);
}

.agent-activity-item--expanded .agent-activity-item__tail {
  margin-left: auto;
  width: auto;
  padding-left: 8px;
}

.agent-activity-item--message .agent-activity-item__row {
  flex-wrap: wrap;
  align-items: flex-start;
}

.agent-activity-item--message .agent-activity-item__summary {
  flex: 1 0 100%;
  order: 10;
  padding-left: 22px;
}

.agent-activity-item--message .agent-activity-item__tail {
  order: 11;
}

.agent-activity-item--tool-result .agent-activity-item__row {
  flex-wrap: nowrap;
  align-items: center;
}

.agent-activity-item--tool-result .agent-activity-item__summary {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 0.68rem;
  line-height: 1.2;
  color: var(--muted);
}

.agent-activity-item__tool-result {
  margin: 0;
  padding-left: 22px;
  color: var(--text);
  font-size: 0.76rem;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 5;
  overflow: hidden;
  white-space: pre-wrap;
}

.agent-activity-item__tool-result--stdout {
  color: var(--text);
}

.agent-activity-item__tool-result--stderr {
  color: var(--danger, #f85149);
}

.agent-activity-item__received-message {
  margin: 0;
  padding-left: 22px;
  color: var(--text);
  font-size: 0.76rem;
  line-height: 1.45;
  white-space: pre-wrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.agent-activity-item__received-sender {
  font-weight: 600;
  color: var(--text-strong);
  margin-right: 4px;
}

</style>
