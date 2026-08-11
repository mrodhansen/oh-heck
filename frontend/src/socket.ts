import { io, Socket } from 'socket.io-client';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

let socket: Socket | null = null;

/** Absolute API host for sockets; relative `/api` uses same-origin `/socket.io`. */
function socketBaseUrl(): string | undefined {
  if (!API_URL) return undefined;
  if (API_URL.startsWith('http://') || API_URL.startsWith('https://')) {
    return API_URL;
  }
  return undefined;
}

function getSocket(): Socket {
  if (!socket) {
    socket = io(socketBaseUrl(), {
      autoConnect: true,
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}

export function joinRoom(room: string) {
  const s = getSocket();
  s.emit('join', { room });
}

export function leaveRoom(room: string) {
  const s = getSocket();
  s.emit('leave', { room });
}

export function onEvent(
  event: string,
  handler: (...args: unknown[]) => void,
): () => void {
  const s = getSocket();
  s.on(event, handler);
  return () => {
    s.off(event, handler);
  };
}
