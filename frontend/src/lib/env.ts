/**
 * Where the backend lives. By default the web app calls its own address ("") and the dev server (or, in
 * production, the backend itself) forwards API calls, so the app and the API share one address.
 * Set VITE_API_URL only if the API is somewhere else.
 */
const API_URL = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/+$/, '');

const ENV = {
  API_URL,
  UPLOADS_URL: `${API_URL}/uploads`,
};

export default ENV;
