import { useEffect, useRef } from 'react';
import { joinRoom, leaveRoom, onEvent } from './socket';

/** Join a socket room and re-run `onUpdate` when `event` fires. */
export function useSocketRoom(
  room: string | null | undefined,
  event: string,
  onUpdate: () => void,
  token?: string | null,
) {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!room) return;
    joinRoom(room, token ?? undefined);
    const off = onEvent(event, () => {
      onUpdateRef.current();
    });
    return () => {
      off();
      leaveRoom(room);
    };
  }, [room, event, token]);
}
