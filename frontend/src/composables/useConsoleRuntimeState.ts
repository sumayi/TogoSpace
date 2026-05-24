import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';
import { loadRoomMessagesState, loadTeamAgents, loadTeamRooms, setActiveRealtimeContext } from '../realtime/runtimeStore';
import { useRoomMessages, useTeamAgents, useTeamRooms } from '../realtime/selectors';
import type { AgentInfo, RoomState } from '../types';

type LoadRoomMessagesOptions = {
  force?: boolean;
  replaceRoute?: boolean;
  syncRoute?: boolean;
};

type UseConsoleRuntimeStateOptions = {
  teamId: MaybeRefOrGetter<number>;
  routeRoomId: MaybeRefOrGetter<number | null>;
  navigateToRoom: (roomId: number, replace?: boolean) => Promise<void>;
};

export function useConsoleRuntimeState(options: UseConsoleRuntimeStateOptions) {
  const selectedRoomId = ref<number | null>(null);

  const rooms = useTeamRooms(() => toValue(options.teamId));
  const agents = useTeamAgents(() => toValue(options.teamId));
  const messages = useRoomMessages(selectedRoomId);
  const currentRoom = computed(
    () => rooms.value.find((room) => room.room_id === selectedRoomId.value) ?? null,
  );

  async function refreshRuntimeState(): Promise<{ agents: AgentInfo[]; rooms: RoomState[] }> {
    const teamId = toValue(options.teamId);
    const [nextAgents, nextRooms] = await Promise.all([
      loadTeamAgents(teamId, { includeSpecial: true }),
      loadTeamRooms(teamId),
    ]);

    return {
      agents: nextAgents,
      rooms: nextRooms,
    };
  }

  async function loadRoomMessages(
    roomId: number,
    loadOptions?: LoadRoomMessagesOptions,
  ): Promise<void> {
    if (!loadOptions?.force && selectedRoomId.value === roomId) {
      return;
    }

    await loadRoomMessagesState(toValue(options.teamId), roomId);
    selectedRoomId.value = roomId;
    setActiveRealtimeContext(toValue(options.teamId), roomId);

    if (
      loadOptions?.syncRoute !== false
      && toValue(options.routeRoomId) !== roomId
    ) {
      await options.navigateToRoom(roomId, loadOptions?.replaceRoute ?? false);
    }
  }

  function clearSelectedRoom(): void {
    selectedRoomId.value = null;
    setActiveRealtimeContext(toValue(options.teamId), null);
  }

  function clearRuntimeContext(): void {
    setActiveRealtimeContext(null, null);
  }

  watch(
    () => [toValue(options.teamId), selectedRoomId.value] as const,
    ([teamId, roomId]) => {
      setActiveRealtimeContext(teamId, roomId);
    },
    { immediate: true },
  );

  return {
    agents,
    currentRoom,
    messages,
    rooms,
    selectedRoomId,
    clearSelectedRoom,
    refreshRuntimeState,
    loadRoomMessages,
    clearRuntimeContext,
  };
}
