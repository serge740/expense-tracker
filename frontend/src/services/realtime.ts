import { io, type Socket } from 'socket.io-client';
import ENV from '@/lib/env';
import { getToken } from '@/services/client-auth.service';

/**
 * Live channel to the server. It signs in with the current access token (read again on every reconnect,
 * so a refreshed token is used) and only receives events for this account. Events are nudges: the
 * screens still fetch their data from the normal endpoints.
 */
export function connectRealtime(onEvent: (event: string, payload: any) => void): () => void {
  // An empty API address means "this same address", which is what the dev proxy / the backend serves.
  const socket: Socket = io(ENV.API_URL || undefined, {
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 15000,
    auth: cb => cb({ token: getToken() ?? '' }),
  });
  socket.on('new-notification', payload => onEvent('new-notification', payload));
  socket.on('family-changed', payload => onEvent('family-changed', payload));
  socket.on('connect_error', () => { /* it keeps retrying on its own */ });
  return () => { socket.removeAllListeners(); socket.disconnect(); };
}
