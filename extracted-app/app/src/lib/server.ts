import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@protocol';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SERVER_PORT = 3001;

/** The Expo dev server's port; any other port means the web app is served by the game server itself. */
const EXPO_DEV_PORT = '8081';

/**
 * Where the game server is:
 * - EXPO_PUBLIC_SERVER_URL if set (native app builds pointing at the online server);
 * - on the web, the same site the page came from (the game server hosts the web app),
 *   except during development, where Expo serves the page and the server is on port 3001;
 * - on a phone in development, the computer running the Expo dev server, port 3001.
 */
export function serverUrl(): string {
  const configured = process.env.EXPO_PUBLIC_SERVER_URL;
  if (configured) return configured.replace(/\/$/, '');
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const { protocol, hostname, port, origin } = window.location;
    return port === EXPO_DEV_PORT ? `${protocol}//${hostname}:${SERVER_PORT}` : origin;
  }
  const devHost = Constants.expoConfig?.hostUri?.split(':')[0];
  return `http://${devHost ?? 'localhost'}:${SERVER_PORT}`;
}

let socket: GameSocket | null = null;

export function getSocket(): GameSocket {
  if (!socket) {
    socket = io(serverUrl(), { transports: ['websocket'], reconnectionDelayMax: 3000 });
  }
  return socket;
}
