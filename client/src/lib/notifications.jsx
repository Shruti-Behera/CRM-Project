import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, post, patch, del, getToken } from './api.js';

const BASE = import.meta.env.VITE_API_URL || '/api';
const NotifCtx = createContext(null);
const APP_NAME = 'Ashika WDM';

/* Where a notification points, by the record it relates to. */
export function notificationPath(n) {
  const id = n.entity_id;
  switch (n.entity_type) {
    case 'assignment': return id ? `/internal/assignments/${id}` : '/internal/assignments';
    case 'opportunity': return id ? `/banking/opportunities/${id}` : '/banking/opportunities';
    case 'account': return '/banking/accounts';
    case 'work_approval': return '/internal/work-approvals';
    case 'meeting': return '/internal/meetings';
    case 'institution': return id ? `/institutional/clients/${id}/edit` : '/institutional/clients';
    case 'research_report': return '/institutional/reports';
    case 'user': return '/users';
    default: return null;
  }
}

export function NotificationsProvider({ children }) {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [total, setTotal] = useState(0);
  const [prefs, setPrefs] = useState({ sound: true, desktop: true });

  const itemsRef = useRef([]);
  const prefsRef = useRef(prefs);
  const lastIdRef = useRef(0);          // highest notification id we've already seen
  const primedRef = useRef(false);      // becomes true after the first load, so we never sound on load
  const soundAtRef = useRef(0);         // throttle so a burst plays once
  const audioRef = useRef(null);
  const askedRef = useRef(false);

  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { prefsRef.current = prefs; }, [prefs]);

  const playSound = useCallback(() => {
    if (!prefsRef.current.sound) return;
    const now = Date.now();
    if (now - soundAtRef.current < 400) return;   // one sound per burst
    soundAtRef.current = now;
    try {
      if (!audioRef.current) { audioRef.current = new Audio('/notify.wav'); audioRef.current.volume = 0.6; }
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => { /* autoplay blocked until a gesture — fine */ });
    } catch { /* ignore */ }
  }, []);

  const showDesktop = useCallback((n) => {
    if (!prefsRef.current.desktop) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    try {
      const note = new Notification(`${n.title} · ${APP_NAME}`, {
        body: n.message, icon: '/logo.jpg', tag: `notif-${n.id}`, renotify: false
      });
      note.onclick = () => {
        window.focus();
        const to = notificationPath(n);
        if (to) navigate(to);
        note.close();
      };
    } catch { /* ignore */ }
  }, [navigate]);

  // Fetch page 0. Only `sound:true` calls (the SSE push) may chime / pop a desktop notice,
  // and only for notifications newer than anything seen before.
  const refresh = useCallback(async ({ sound = false } = {}) => {
    try {
      const r = await get('/notifications?limit=20&offset=0');
      const list = r?.items || [];
      const maxId = list.reduce((m, n) => Math.max(m, Number(n.id)), 0);

      if (sound && primedRef.current) {
        const fresh = list.filter(n => Number(n.id) > lastIdRef.current && Number(n.is_read) === 0);
        if (fresh.length) { playSound(); showDesktop(fresh[0]); }   // one sound; desktop for the newest
      }
      lastIdRef.current = Math.max(lastIdRef.current, maxId);
      primedRef.current = true;

      setUnread(r?.unread || 0); setTotal(r?.total || 0); setItems(list);
    } catch { /* keep last known state */ }
  }, [playSound, showDesktop]);

  const loadMore = useCallback(async () => {
    try {
      const r = await get(`/notifications?limit=20&offset=${itemsRef.current.length}`);
      setUnread(r?.unread || 0); setTotal(r?.total || 0);
      setItems(prev => [...prev, ...(r?.items || [])]);
    } catch { /* ignore */ }
  }, []);

  const markRead = useCallback(async (id) => { try { await post('/notifications/read', { id }); } finally { refresh(); } }, [refresh]);
  const markAll = useCallback(async () => { try { await post('/notifications/read', {}); } finally { refresh(); } }, [refresh]);
  const remove = useCallback(async (id) => { try { await del(`/notifications/${id}`); } finally { refresh(); } }, [refresh]);
  const clearAll = useCallback(async () => { try { await del('/notifications'); } finally { refresh(); } }, [refresh]);

  const requestDesktop = useCallback(async () => {
    if (typeof Notification === 'undefined') return 'unsupported';
    if (Notification.permission === 'default') { try { return await Notification.requestPermission(); } catch { return 'default'; } }
    return Notification.permission;
  }, []);

  const updatePrefs = useCallback(async (next) => {
    setPrefs(p => ({ ...p, ...next }));
    if (next.desktop && typeof Notification !== 'undefined' && Notification.permission === 'default') requestDesktop();
    try { await patch('/me/preferences', next); } catch { /* ignore */ }
  }, [requestDesktop]);

  useEffect(() => {
    // load saved preferences (per user, from PostgreSQL)
    get('/me/preferences')
      .then(p => {
        setPrefs({ sound: p?.sound !== false, desktop: p?.desktop !== false });
        if (!askedRef.current && p?.desktop !== false &&
            typeof Notification !== 'undefined' && Notification.permission === 'default') {
          askedRef.current = true;
          Notification.requestPermission().catch(() => {});   // ask once
        }
      })
      .catch(() => {});

    refresh({ sound: false });        // initial load — never sounds

    const token = getToken();
    let es;
    if (token) {
      es = new EventSource(`${BASE}/notifications/stream?access_token=${encodeURIComponent(token)}`);
      es.onmessage = () => refresh({ sound: true });   // real-time push → may chime for genuinely new
      es.onerror = () => { /* EventSource reconnects on its own */ };
    }
    const onFocus = () => refresh({ sound: false });    // returning to the tab must not chime
    window.addEventListener('focus', onFocus);
    return () => { es?.close(); window.removeEventListener('focus', onFocus); };
  }, [refresh]);

  return (
    <NotifCtx.Provider value={{
      items, unread, total, refresh, loadMore, markRead, markAll, remove, clearAll,
      prefs, updatePrefs, requestDesktop
    }}>
      {children}
    </NotifCtx.Provider>
  );
}

export const useNotifications = () => useContext(NotifCtx);
