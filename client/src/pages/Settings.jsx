import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { get, post, put, del } from '../lib/api.js';
import { Card, Empty, Loading, ErrorNote, Modal } from '../components/Bits.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useNotifications } from '../lib/notifications.jsx';

const Toggle = ({ on, onChange, label, hint }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #F2F4F8' }}>
    <div><div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
      {hint && <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{hint}</div>}</div>
    <label style={{ margin: 0, cursor: 'pointer' }}>
      <input type="checkbox" checked={on} onChange={e => onChange(e.target.checked)} style={{ width: 'auto', transform: 'scale(1.25)' }} />
    </label>
  </div>
);

function MyNotifications() {
  const { prefs, updatePrefs, requestDesktop } = useNotifications();
  const perm = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
  return (
    <Card title="My notifications">
      <Toggle on={prefs.sound} onChange={v => updatePrefs({ sound: v })}
        label="Notification sound" hint="Play a chime when a new notification arrives in real time." />
      <Toggle on={prefs.desktop} onChange={v => updatePrefs({ desktop: v })}
        label="Desktop notifications" hint="Show a browser pop-up even when this tab isn't focused." />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10 }}>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          Browser permission: {perm === 'unsupported' ? 'not supported'
            : perm === 'granted' ? 'granted' : perm === 'denied' ? 'blocked (change it in your browser)' : 'not asked yet'}
        </span>
        {perm !== 'granted' && perm !== 'unsupported' && perm !== 'denied' &&
          <button className="btn" onClick={requestDesktop}>Enable desktop</button>}
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '8px 0 0' }}>
        Saved to your profile, so it follows you across devices.
      </p>
    </Card>
  );
}

const softGet = (p) => get(p).then(r => r || []).catch(() => []);
const todayIso = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DEFAULTS = {
  work_days: 'Mon,Tue,Wed,Thu,Fri,Sat', office_open: '09:30', office_close: '18:30',
  colour_low: '#69748A', colour_medium: '#2596C2', colour_high: '#E0A21C', colour_critical: '#D0483F',
  smtp_host: '', smtp_port: '587', smtp_encryption: 'STARTTLS', smtp_from: '',
  sla_critical: '2', sla_high: '5', sla_medium: '8', sla_low: '12',
  ai_mode: 'off', ai_url: '', ai_key: '', ai_model: 'claude-sonnet-4-6'
};

export default function Settings() {
  const { user } = useAuth();
  const admin = user?.level === 1;
  const [s, setS] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const [holidays, setHolidays] = useState([]);
  const [holForm, setHolForm] = useState(null);
  const [audit, setAudit] = useState([]);
  const [auditQ, setAuditQ] = useState('');

  const loadHolidays = () => softGet('/holidays').then(setHolidays);
  useEffect(() => {
    get('/settings')
      .then(v => setS({ ...DEFAULTS, ...(v || {}) }))
      .catch(e => setErr(e.message));
    loadHolidays();
    softGet('/audit').then(setAudit);
  }, []);

  const auditRows = useMemo(() => {
    const q = auditQ.toLowerCase();
    return audit.filter(a => !q || `${a.who} ${a.description} ${a.action}`.toLowerCase().includes(q));
  }, [audit, auditQ]);

  const saveHoliday = async () => {
    if (!holForm.title.trim() || !holForm.holiday_date) { setErr('A date and title are needed'); return; }
    try {
      const body = { holiday_date: holForm.holiday_date, title: holForm.title };
      if (holForm._new) await post('/holidays', body);
      else await put(`/holidays/${holForm.id}`, body);
      setHolForm(null); setErr(''); loadHolidays();
    } catch (e) { setErr(e.message); }
  };
  const removeHoliday = async (h) => {
    if (!window.confirm(`Remove ${h.title}?`)) return;
    try { await del(`/holidays/${h.id}`); loadHolidays(); } catch (e) { setErr(e.message); }
  };
  const exportBackup = async () => {
    try {
      const data = await get('/backup/export');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      a.download = `ashika-backup-${todayIso()}.json`;
      a.click(); URL.revokeObjectURL(a.href);
    } catch (e) { setErr(e.message); }
  };

  const set = (k, v) => { setS(o => ({ ...o, [k]: v })); setSaved(false); };
  const days = (s?.work_days || '').split(',').filter(Boolean);
  const toggleDay = (d) => {
    const next = days.includes(d) ? days.filter(x => x !== d) : [...days, d];
    set('work_days', DAYS.filter(x => next.includes(x)).join(','));
  };

  const save = async () => {
    setBusy(true);
    try { await put('/settings', s); setSaved(true); setErr(''); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  if (err && !s) return <ErrorNote>{err}</ErrorNote>;
  if (!s) return <Loading />;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div><div className="eyebrow">Administrator only</div><h3>Settings</h3></div>
        {admin && <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : saved ? 'Saved ✓' : 'Save changes'}</button>}
      </div>
      {err && <ErrorNote>{err}</ErrorNote>}

      <div style={{ marginBottom: 14 }}><MyNotifications /></div>

      {!admin && <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>Only a Super Admin can change these settings.</p>}

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 14 }}>
        <Card title="Working days and hours">
          <label>Working days</label>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            {DAYS.map(d => (
              <label key={d} style={{ display: 'flex', gap: 5, alignItems: 'center', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>
                <input type="checkbox" checked={days.includes(d)} onChange={() => toggleDay(d)} disabled={!admin} style={{ width: 'auto' }} />{d}
              </label>
            ))}
          </div>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div><label>Office opens</label><input type="time" value={s.office_open} disabled={!admin} onChange={e => set('office_open', e.target.value)} /></div>
            <div><label>Office closes</label><input type="time" value={s.office_close} disabled={!admin} onChange={e => set('office_close', e.target.value)} /></div>
          </div>
        </Card>

        <Card title="SLA defaults (working days)">
          {[['Critical', 'sla_critical'], ['High', 'sla_high'], ['Medium', 'sla_medium'], ['Low', 'sla_low']].map(([l, k]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0' }}>
              <span style={{ fontSize: 13 }}>{l}</span>
              <input value={s[k]} disabled={!admin} onChange={e => set(k, e.target.value)} style={{ width: 100 }} />
            </div>
          ))}
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '6px 0 0' }}>Used to flag SLA breaches on the assignment list.</p>
        </Card>

        <Card title="Priority colours">
          {[['Low', 'colour_low'], ['Medium', 'colour_medium'], ['High', 'colour_high'], ['Critical', 'colour_critical']].map(([l, k]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
              <span style={{ fontSize: 13 }}>{l}</span>
              <input type="color" value={s[k]} disabled={!admin} onChange={e => set(k, e.target.value)} style={{ width: 54, padding: 2 }} />
            </div>
          ))}
        </Card>

        <Card title="Email configuration">
          <div><label>SMTP host</label><input value={s.smtp_host} disabled={!admin} placeholder="smtp.office365.com" onChange={e => set('smtp_host', e.target.value)} /></div>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 8 }}>
            <div><label>Port</label><input value={s.smtp_port} disabled={!admin} onChange={e => set('smtp_port', e.target.value)} /></div>
            <div><label>Encryption</label>
              <select value={s.smtp_encryption} disabled={!admin} onChange={e => set('smtp_encryption', e.target.value)}>
                <option>STARTTLS</option><option>SSL</option></select></div>
          </div>
          <div style={{ marginTop: 8 }}><label>From address</label><input value={s.smtp_from} disabled={!admin} placeholder="workflow@ashika.com" onChange={e => set('smtp_from', e.target.value)} /></div>
        </Card>
      </div>

      <Card title="Reading voice notes">
        <p style={{ fontSize: 13 }}>
          Spoken updates are read on this device by default. Turning on AI assist sends the transcript away to be
          read more carefully, and anything it returns is still shown for checking.
        </p>
        <div className="grid" style={{ gridTemplateColumns: '1fr 2fr' }}>
          <div><label>Mode</label>
            <select value={s.ai_mode} disabled={!admin} onChange={e => set('ai_mode', e.target.value)}>
              <option value="off">Built-in reader only</option>
              <option value="server">Through our own server</option>
              <option value="direct">Direct to the API — trying it out</option>
            </select></div>
          <div><label>Server endpoint</label><input value={s.ai_url} disabled={!admin} placeholder="https://…/api/voice/extract" onChange={e => set('ai_url', e.target.value)} /></div>
          <div><label>Model</label><input value={s.ai_model} disabled={!admin} onChange={e => set('ai_model', e.target.value)} /></div>
          <div><label>API key — direct mode only</label><input type="password" value={s.ai_key} disabled={!admin} placeholder="sk-ant-…" onChange={e => set('ai_key', e.target.value)} /></div>
        </div>
        <div className="err" style={{ marginTop: 12, background: '#FBE5E3' }}>
          <b>About the key.</b> In direct mode the key is stored in the settings and travels with any backup —
          anyone who can read it can use it. For shared use, put the key on the server and point the endpoint at it.
        </div>
      </Card>

      <div style={{ height: 14 }} />

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 14 }}>
        <Card title="Holiday list" extra={admin && <button className="btn" onClick={() => setHolForm({ _new: true, holiday_date: todayIso(), title: '' })}>Add holiday</button>}>
          <table className="tbl">
            <thead><tr><th>Date</th><th>Holiday</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
            <tbody>
              {holidays.length ? holidays.map(h => (
                <tr key={h.id}>
                  <td className="mono" style={{ fontSize: 12 }}>{h.holiday_date}</td>
                  <td style={{ fontSize: 13 }}>{h.title}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {admin && <button className="btn" style={{ padding: '2px 8px' }} onClick={() => setHolForm({ _new: false, id: h.id, holiday_date: h.holiday_date, title: h.title })}>Edit</button>}{' '}
                    {admin && <button className="btn" style={{ padding: '2px 8px', color: 'var(--red)' }} onClick={() => removeHoliday(h)}>Delete</button>}
                  </td>
                </tr>
              )) : <Empty cols={3}>No holidays listed.</Empty>}
            </tbody>
          </table>
        </Card>

        <Card title="Backup">
          <p style={{ fontSize: 13 }}>
            Records live in the shared PostgreSQL database. Export a JSON snapshot for off-site safekeeping,
            or open the full <Link to="/data-backup">Data &amp; backup</Link> screen for record counts.
          </p>
          {admin && <button className="btn primary" onClick={exportBackup}>Export backup</button>}
        </Card>
      </div>

      <Card title="Audit log" extra={<input placeholder="Search activity…" value={auditQ} onChange={e => setAuditQ(e.target.value)} style={{ width: 220 }} />} pad={false}>
        <table className="tbl">
          <thead><tr><th>User</th><th>Activity</th><th>Date &amp; time</th></tr></thead>
          <tbody>
            {auditRows.length ? auditRows.slice(0, 200).map(a => (
              <tr key={a.id}>
                <td style={{ fontSize: 12.5 }}>{a.who}</td>
                <td style={{ fontSize: 12.5 }}>{a.description}</td>
                <td className="mono" style={{ fontSize: 12 }}>{a.created_at}</td>
              </tr>
            )) : <Empty cols={3}>No activity recorded yet.</Empty>}
          </tbody>
        </table>
        <div className="eyebrow" style={{ padding: '10px 15px' }}>{auditRows.length} entries</div>
      </Card>

      {holForm && (
        <Modal title={holForm._new ? 'Add holiday' : 'Edit holiday'} saveLabel="Save"
          onClose={() => setHolForm(null)} onSave={saveHoliday}>
          <div className="grid" style={{ gridTemplateColumns: '1fr 2fr' }}>
            <div><label>Date</label><input type="date" value={holForm.holiday_date} onChange={e => setHolForm(f => ({ ...f, holiday_date: e.target.value }))} /></div>
            <div><label>Holiday</label><input value={holForm.title} onChange={e => setHolForm(f => ({ ...f, title: e.target.value }))} /></div>
          </div>
        </Modal>
      )}
    </>
  );
}
