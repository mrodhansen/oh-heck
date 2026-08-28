/** Local API when Vite is on 5173. Docker web overrides with VITE_API_URL=/api. */
const LOCAL_API = 'http://localhost:3010';

export function apiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_URL;
  if (typeof raw === 'string' && raw.trim()) {
    return raw.replace(/\/$/, '');
  }
  if (import.meta.env.DEV) {
    return LOCAL_API;
  }
  return '';
}
