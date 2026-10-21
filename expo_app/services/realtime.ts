import { io, Socket } from 'socket.io-client';
import ENV from '@/env';
import { getToken } from '@/services/client-auth.service';

/**
 * Live channel to the server. It signs in with the current access token (read again on every reconnect,
 * so a refreshed token is used) and only receives events for this account. Events are nudges: the
 * screens still fetch their data from the normal endpoints.
 */
export function connectRealtime(onEvent: (event: string, payload: any) => void): () => void {
  const socket: Socket = io(ENV.API_URL, {
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 15000,
    auth: (cb) => { getToken().then(token => cb({ token: token ?? '' })).catch(() => cb({ token: '' })); },
  });
  socket.on('new-notification', payload => onEvent('new-notification', payload));
  socket.on('connect_error', () => { /* it keeps retrying on its own; polling and push still cover us */ });
  return () => { socket.removeAllListeners(); socket.disconnect(); };
}
