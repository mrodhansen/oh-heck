import { useEffect } from 'react';
import { joinRoom, leaveRoom, onEvent } from './socket';

/** Join a socket room and re-run `onUpdate` when `event` fires. */
export function useSocketRoom(
  room: string | null | undefined,
  event: string,
  onUpdate: () => void,
) {
  useEffect(() => {
    if (!room) return;
    joinRoom(room);
    const off = onEvent(event, () => {
      onUpdate();
    });
    return () => {
      off();
      leaveRoom(room);
    };
  }, [room, event, onUpdate]);
}
