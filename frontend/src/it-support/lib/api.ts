import axios from 'axios';
import ENV from '@/lib/env';

/**
 * Dedicated instance for the IT Support portal — purely cookie-based (httpOnly AccessITAdminToken
 * set by the backend), with none of the Client app's Bearer-token/refresh-rotation/family-header
 * logic (see @/lib/api.ts). Both cookies can coexist in the browser; each guard only reads its own.
 */
const api = axios.create({
  baseURL: ENV.API_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

export default api;
