const BASE = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'ashika.token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);

/**
 * One place that talks to the server. A 401 clears the token and reloads,
 * so an expired session lands on the sign-in screen rather than a wall of
 * failed requests.
 */
export async function api(path, { method = 'GET', body, isForm } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!isForm && body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: isForm ? body : body !== undefined ? JSON.stringify(body) : undefined
  });

  if (res.status === 401) { setToken(null); window.location.reload(); return; }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

export const get  = (p) => api(p);
export const post = (p, body) => api(p, { method: 'POST', body });
export const put  = (p, body) => api(p, { method: 'PUT', body });
export const patch= (p, body) => api(p, { method: 'PATCH', body });
export const del  = (p) => api(p, { method: 'DELETE' });

/* the app's own vocabulary for money, used everywhere so it reads the same */
export const lakh  = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}L`;
export const crore = (v) => `₹${Number(v || 0).toLocaleString('en-IN')} cr`;
export const inr = (v) => {
  const n = Number(v || 0);
  return n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} cr`
       : n >= 1e5 ? `₹${(n / 1e5).toFixed(2)} L`
       : `₹${Math.round(n).toLocaleString('en-IN')}`;
};
export const shortDate = (s) => s
  ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—';
