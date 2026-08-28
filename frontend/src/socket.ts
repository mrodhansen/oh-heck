import { io, Socket } from 'socket.io-client';
import { apiBaseUrl } from './api/baseUrl';

const API_URL = apiBaseUrl();

let socket: Socket | null = null;

/** Absolute API host for sockets; relative `/api` uses same-origin `/socket.io`. */
function socketBaseUrl(): string | undefined {
  if (!API_URL) return undefined;
  if (API_URL.startsWith('http://') || API_URL.startsWith('https://')) {
    return new URL(API_URL).origin;
  }
  return undefined;
}

const joinedRooms = new Map<string, string | undefined>();

function getSocket(): Socket {
  if (!socket) {
    socket = io(socketBaseUrl(), {
      autoConnect: true,
      transports: ['websocket', 'polling'],
    });
    socket.on('connect', () => {
      for (const [room, token] of joinedRooms) {
        socket?.emit('join', { room, token });
      }
    });
  }
  return socket;
}

export function joinRoom(room: string, token?: string) {
  const s = getSocket();
  joinedRooms.set(room, token);
  s.emit('join', { room, token });
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
