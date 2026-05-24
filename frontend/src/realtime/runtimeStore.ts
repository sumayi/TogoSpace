import { ref } from 'vue';
import { totalMessageCount, updateScheduleState } from '../appUiState';
import type { RawMessageInfo } from '../api';
import {
  getAgentActivities as fetchAgentActivities,
  getAgentsByTeamId as fetchAgentsByTeamId,
  getDeptTree as fetchDeptTree,
  getRoleTemplates as fetchRoleTemplates,
  getRoomMessages as fetchRoomMessages,
  getRooms as fetchRooms,
} from '../api';
import type {
  AgentActivity,
  AgentInfo,
  AgentStatus,
  DeptTreeNode,
  MessageInfo,
  RoleTemplateSummary,
  RoomState,
} from '../types';
import { displayName, formatPreview } from '../utils';
import type { FrontendRealtimeEvent } from './eventNormalizer';
import { resolveRoomPreview } from './roomPreview';
import { subscribeRealtimeEvents } from './wsClient';

const teamAgentsState = ref<Record<number, AgentInfo[]>>({});
const teamRoomsState = ref<Record<number, RoomState[]>>({});
const roomMessagesState = ref<Record<number, MessageInfo[]>>({});
const agentActivitiesState = ref<Record<number, AgentActivity[]>>({});
const agentStatusState = ref<Record<number, AgentStatus>>({});
const teamDeptTreeState = ref<Record<number, DeptTreeNode | null>>({});
const roleTemplatesState = ref<RoleTemplateSummary[]>([]);
const MAX_AGENT_ACTIVITY_ITEMS = 100;

const activeTeamId = ref<number | null>(null);
const activeRoomId = ref<number | null>(null);

function syncTotalMessageCount(): void {
  if (activeRoomId.value === null) {
    totalMessageCount.value = 0;
    return;
  }

  totalMessageCount.value = roomMessagesState.value[activeRoomId.value]?.length ?? 0;
}

function normalizeMessage(teamId: number, raw: RawMessageInfo): MessageInfo {
  return {
    db_id: raw.id,
    sender_id: raw.sender_id,
    sender_display_name: resolveMessageSenderDisplayName(teamId, raw.sender_id),
    content: raw.content,
    time: raw.send_time,
    seq: raw.seq,
    insert_immediately: raw.insert_immediately,
  };
}

function compareMessages(left: MessageInfo, right: MessageInfo): number {
  if (left.seq !== null && right.seq !== null) {
    return left.seq - right.seq;
  }
  if (left.seq !== null) {
    return -1;
  }
  if (right.seq !== null) {
    return 1;
  }

  if (left.db_id !== null && right.db_id !== null) {
    return left.db_id - right.db_id;
  }

  return left.time.localeCompare(right.time);
}

function sortMessages(messages: MessageInfo[]): MessageInfo[] {
  return [...messages].sort(compareMessages);
}

function resolveMessageSenderDisplayName(teamId: number, senderId: number): string {
  if (senderId === -1) {
    return 'OPERATOR';
  }
  if (senderId === -2) {
    return 'SYSTEM';
  }

  const matchedAgent = (teamAgentsState.value[teamId] ?? []).find((agent) => agent.id === senderId);
  if (matchedAgent) {
    return displayName(matchedAgent);
  }

  return String(senderId);
}

function updateTeamRooms(teamId: number, updater: (rooms: RoomState[]) => RoomState[]): void {
  const currentRooms = teamRoomsState.value[teamId] ?? [];
  teamRoomsState.value = {
    ...teamRoomsState.value,
    [teamId]: updater(currentRooms),
  };
}

function refreshTeamRoomPreviews(teamId: number): void {
  updateTeamRooms(teamId, (rooms) =>
    rooms.map((room) => ({
      ...room,
      preview: resolveRoomPreview({
        messages: roomMessagesState.value[room.room_id],
        previousRoom: room,
        resolveSenderDisplayName: (senderId) => resolveMessageSenderDisplayName(teamId, senderId),
      }),
    })),
  );
}

function syncRoomPreview(teamId: number, roomId: number, messages?: MessageInfo[]): void {
  updateTeamRooms(teamId, (rooms) =>
    rooms.map((room) =>
      room.room_id === roomId
        ? {
          ...room,
          preview: resolveRoomPreview({
            messages,
            previousRoom: room,
            resolveSenderDisplayName: (senderId) => resolveMessageSenderDisplayName(teamId, senderId),
          }),
        }
        : room,
    ),
  );
}

function markRoomAsReadInternal(teamId: number, roomId: number): void {
  updateTeamRooms(teamId, (rooms) =>
    rooms.map((room) =>
      room.room_id === roomId
        ? { ...room, unread: 0 }
        : room,
    ),
  );
}

function trimAgentActivities(items: AgentActivity[]): void {
  if (items.length > MAX_AGENT_ACTIVITY_ITEMS) {
    items.splice(0, items.length - MAX_AGENT_ACTIVITY_ITEMS);
  }
}

function upsertAgentActivity(activity: AgentActivity): void {
  const currentItems = agentActivitiesState.value[activity.agent_id];
  if (!currentItems) {
    agentActivitiesState.value = {
      ...agentActivitiesState.value,
      [activity.agent_id]: [activity],
    };
    return;
  }

  const index = currentItems.findIndex((item) => item.id === activity.id);

  if (index >= 0) {
    Object.assign(currentItems[index], activity);
    return;
  }

  const lastItem = currentItems[currentItems.length - 1];
  if (!lastItem || lastItem.id < activity.id) {
    currentItems.push(activity);
    trimAgentActivities(currentItems);
    return;
  }

  const insertIndex = currentItems.findIndex((item) => item.id > activity.id);
  currentItems.splice(insertIndex < 0 ? currentItems.length : insertIndex, 0, activity);
  trimAgentActivities(currentItems);
}

export function seedTeamAgents(teamId: number, agents: AgentInfo[]): void {
  teamAgentsState.value = {
    ...teamAgentsState.value,
    [teamId]: agents,
  };

  const nextStatusState = { ...agentStatusState.value };
  for (const agent of agents) {
    if (typeof agent.id === 'number' && agent.id > 0) {
      nextStatusState[agent.id] = agent.status;
    }
  }
  agentStatusState.value = nextStatusState;
  refreshTeamRoomPreviews(teamId);
}

export async function loadTeamAgents(teamId: number, options?: { includeSpecial?: boolean }): Promise<AgentInfo[]> {
  const agents = await fetchAgentsByTeamId(teamId, options);
  seedTeamAgents(teamId, agents);
  return agents;
}

export function seedTeamRooms(teamId: number, rooms: RoomState[]): void {
  const existingRooms = new Map((teamRoomsState.value[teamId] ?? []).map((room) => [room.room_id, room]));
  const mergedRooms = rooms.map((room) => {
    const previous = existingRooms.get(room.room_id);
    return {
      ...room,
      unread: previous?.unread ?? room.unread ?? 0,
      current_turn_agent_id: room.current_turn_agent_id ?? previous?.current_turn_agent_id ?? null,
    };
  });

  teamRoomsState.value = {
    ...teamRoomsState.value,
    [teamId]: mergedRooms,
  };
}

export async function loadTeamRooms(teamId: number): Promise<RoomState[]> {
  const baseRooms = await fetchRooms(teamId);
  const rooms: RoomState[] = baseRooms.map((room) => ({
    ...room,
    preview: resolveRoomPreview({
      messages: roomMessagesState.value[room.room_id],
      previousRoom: (teamRoomsState.value[teamId] ?? []).find((item) => item.room_id === room.room_id) ?? null,
      resolveSenderDisplayName: (senderId) => resolveMessageSenderDisplayName(teamId, senderId),
    }),
    unread: 0,
    current_turn_agent_id: room.current_turn_agent_id ?? null,
  }));

  seedTeamRooms(teamId, rooms);
  return rooms;
}

export function seedRoomMessages(roomId: number, messages: MessageInfo[]): void {
  roomMessagesState.value = {
    ...roomMessagesState.value,
    [roomId]: sortMessages(messages),
  };
  syncTotalMessageCount();
}

export async function loadRoomMessagesState(teamId: number, roomId: number): Promise<MessageInfo[]> {
  const rawMessages = await fetchRoomMessages(roomId);
  const messages = rawMessages.map((m) => normalizeMessage(teamId, m));
  seedRoomMessages(roomId, messages);
  syncRoomPreview(teamId, roomId, messages);
  return messages;
}

export function seedAgentActivities(agentId: number, activities: AgentActivity[]): void {
  agentActivitiesState.value[agentId] = [...activities]
    .sort((a, b) => a.id - b.id)
    .slice(-MAX_AGENT_ACTIVITY_ITEMS);
}

export async function loadAgentActivities(agentId: number): Promise<AgentActivity[]> {
  const activities = await fetchAgentActivities(agentId);
  seedAgentActivities(agentId, activities);
  return activities;
}

export function seedDeptTree(teamId: number, deptTree: DeptTreeNode | null): void {
  teamDeptTreeState.value = {
    ...teamDeptTreeState.value,
    [teamId]: deptTree,
  };
}

export async function loadDeptTree(teamId: number): Promise<DeptTreeNode | null> {
  const deptTree = await fetchDeptTree(teamId);
  seedDeptTree(teamId, deptTree);
  return deptTree;
}

export function seedRoleTemplates(roleTemplates: RoleTemplateSummary[]): void {
  roleTemplatesState.value = [...roleTemplates];
}

export async function loadRoleTemplates(): Promise<RoleTemplateSummary[]> {
  const roleTemplates = await fetchRoleTemplates();
  seedRoleTemplates(roleTemplates);
  return roleTemplates;
}

export function setActiveRealtimeContext(teamId: number | null, roomId: number | null): void {
  activeTeamId.value = teamId;
  activeRoomId.value = roomId;

  if (teamId !== null && roomId !== null) {
    markRoomAsReadInternal(teamId, roomId);
  }

  syncTotalMessageCount();
}

export function getTeamAgents(teamId: number | null): AgentInfo[] {
  if (teamId === null) {
    return [];
  }
  return teamAgentsState.value[teamId] ?? [];
}

export function getTeamRooms(teamId: number | null): RoomState[] {
  if (teamId === null) {
    return [];
  }
  return teamRoomsState.value[teamId] ?? [];
}

export function getRoomMessages(roomId: number | null): MessageInfo[] {
  if (roomId === null) {
    return [];
  }
  return roomMessagesState.value[roomId] ?? [];
}

export function getAgentActivities(agentId: number | null): AgentActivity[] {
  if (agentId === null) {
    return [];
  }
  return agentActivitiesState.value[agentId] ?? [];
}

export function getAgentStatus(agentId: number | null): AgentStatus | null {
  if (agentId === null) {
    return null;
  }
  return agentStatusState.value[agentId] ?? null;
}

export function getDeptTreeState(teamId: number | null): DeptTreeNode | null {
  if (teamId === null) {
    return null;
  }
  return teamDeptTreeState.value[teamId] ?? null;
}

export function getRoleTemplatesState(): RoleTemplateSummary[] {
  return roleTemplatesState.value;
}

export function applyRealtimeEvent(event: FrontendRealtimeEvent): void {
  if (event.type === 'message') {
    const nextMessage: MessageInfo = event.message;

    updateTeamRooms(event.teamId, (rooms) =>
      rooms.map((room) => {
        if (room.room_id !== event.roomId) {
          return room;
        }

        const shouldResetUnread =
          activeTeamId.value === event.teamId && activeRoomId.value === event.roomId;

        return {
          ...room,
          preview: formatPreview(
            nextMessage.sender_display_name || resolveMessageSenderDisplayName(event.teamId, nextMessage.sender_id),
            nextMessage.content,
          ),
          unread: shouldResetUnread ? 0 : room.unread + 1,
        };
      }),
    );

    const currentMessages = roomMessagesState.value[event.roomId] ?? [];
    const alreadyExists = nextMessage.db_id !== null
      ? currentMessages.some((m) => m.db_id === nextMessage.db_id)
      : currentMessages.some((m) =>
          m.sender_id === nextMessage.sender_id
          && m.content === nextMessage.content
          && m.time === nextMessage.time,
        );
    if (!alreadyExists) {
      roomMessagesState.value = {
        ...roomMessagesState.value,
        [event.roomId]: sortMessages([...currentMessages, nextMessage]),
      };
    }

    if (activeTeamId.value === event.teamId && activeRoomId.value === event.roomId) {
      syncTotalMessageCount();
    }
    return;
  }

  if (event.type === 'message_changed') {
    const updatedMessage: MessageInfo = event.message;
    const currentMessages = roomMessagesState.value[event.roomId] ?? [];
    const existingIndex = updatedMessage.db_id !== null
      ? currentMessages.findIndex((m) => m.db_id === updatedMessage.db_id)
      : -1;

    if (existingIndex >= 0) {
      const updated = [...currentMessages];
      updated[existingIndex] = updatedMessage;
      roomMessagesState.value = {
        ...roomMessagesState.value,
        [event.roomId]: sortMessages(updated),
      };
    }

    if (activeTeamId.value === event.teamId && activeRoomId.value === event.roomId) {
      syncTotalMessageCount();
    }
    return;
  }

  if (event.type === 'agent_status') {
    agentStatusState.value = {
      ...agentStatusState.value,
      [event.agentId]: event.status,
    };

    const currentAgents = teamAgentsState.value[event.teamId] ?? [];
    if (!currentAgents.length) {
      return;
    }

    teamAgentsState.value = {
      ...teamAgentsState.value,
      [event.teamId]: currentAgents.map((agent) =>
        agent.id === event.agentId
          ? { ...agent, status: event.status }
          : agent,
      ),
    };
    return;
  }

  if (event.type === 'room_status') {
    updateTeamRooms(event.teamId, (rooms) =>
      rooms.map((room) =>
        room.room_id === event.roomId
          ? {
            ...room,
            state: event.state,
            need_scheduling: event.needScheduler,
            current_turn_agent_id: event.currentTurnAgentId,
          }
          : room,
      ),
    );
    return;
  }

  if (event.type === 'schedule_state') {
    updateScheduleState(event.scheduleState, event.notRunningReason);
    return;
  }

  if (event.type === 'room_added') {
    updateTeamRooms(event.teamId, (rooms) => {
      if (rooms.some((r) => r.room_id === event.room.room_id)) {
        return rooms;
      }
      return [...rooms, event.room];
    });
    return;
  }

  upsertAgentActivity(event.activity);
}

subscribeRealtimeEvents((event) => {
  applyRealtimeEvent(event);
});

export function clearRuntimeStore(): void {
  teamAgentsState.value = {};
  teamRoomsState.value = {};
  roomMessagesState.value = {};
  agentActivitiesState.value = {};
  agentStatusState.value = {};
  teamDeptTreeState.value = {};
  roleTemplatesState.value = [];
  activeTeamId.value = null;
  activeRoomId.value = null;
  totalMessageCount.value = 0;
}
