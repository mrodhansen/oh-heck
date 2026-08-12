import { io, Socket } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL ?? '';

let socket: Socket | null = null;

/** Absolute API host for sockets; relative `/api` uses same-origin `/socket.io`. */
function socketBaseUrl(): string | undefined {
  if (!API_URL) return undefined;
  if (API_URL.startsWith('http://') || API_URL.startsWith('https://')) {
    return API_URL;
  }
  return undefined;
}

const joinedRooms = new Set<string>();

function getSocket(): Socket {
  if (!socket) {
    socket = io(socketBaseUrl(), {
      autoConnect: true,
      transports: ['websocket', 'polling'],
    });
    socket.on('connect', () => {
      for (const room of joinedRooms) {
        socket?.emit('join', { room });
      }
    });
  }
  return socket;
}

export function joinRoom(room: string) {
  const s = getSocket();
  joinedRooms.add(room);
  s.emit('join', { room });
}

export function leaveRoom(room: string) {
  const s = getSocket();
  joinedRooms.delete(room);
  s.emit('leave', { room });
}

export function onEvent(
  event: string,
  handler: () => void,
): () => void {
  const s = getSocket();
  s.on(event, handler);
  return () => {
    s.off(event, handler);
  };
}
