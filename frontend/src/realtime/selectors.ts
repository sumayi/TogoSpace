import { computed, type MaybeRefOrGetter, toValue } from 'vue';
import type {
  AgentActivity,
  AgentInfo,
  AgentStatus,
  DeptTreeNode,
  MessageInfo,
  RoleTemplateSummary,
  RoomState,
} from '../types';
import {
  getAgentActivities,
  getAgentStatus,
  getDeptTreeState,
  getRoomMessages,
  getRoleTemplatesState,
  getTeamAgents,
  getTeamRooms,
} from './runtimeStore';

export function useTeamAgents(teamId: MaybeRefOrGetter<number | null>) {
  return computed<AgentInfo[]>(() => getTeamAgents(toValue(teamId)));
}

export function useTeamRooms(teamId: MaybeRefOrGetter<number | null>) {
  return computed<RoomState[]>(() => getTeamRooms(toValue(teamId)));
}

export function useRoomMessages(roomId: MaybeRefOrGetter<number | null>) {
  return computed<MessageInfo[]>(() => getRoomMessages(toValue(roomId)));
}

export function useAgentActivities(agentId: MaybeRefOrGetter<number | null>) {
  return computed<AgentActivity[]>(() => getAgentActivities(toValue(agentId)));
}

export function useAgentStatus(agentId: MaybeRefOrGetter<number | null>) {
  return computed<AgentStatus | null>(() => getAgentStatus(toValue(agentId)));
}

export function useDeptTree(teamId: MaybeRefOrGetter<number | null>) {
  return computed<DeptTreeNode | null>(() => getDeptTreeState(toValue(teamId)));
}

export function useRoleTemplates() {
  return computed<RoleTemplateSummary[]>(() => getRoleTemplatesState());
}
