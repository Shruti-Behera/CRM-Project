import { useEffect, useState } from 'react';
import { get, post, shortDate } from '../lib/api.js';
import { Card, Pill, Avatar, Loading, Empty, ErrorNote, Modal } from '../components/Bits.jsx';

const softGet = (p) => get(p).then(r => r || []).catch(() => []);
const isoLocal = (off = 1) => {
  const d = new Date(); d.setDate(d.getDate() + off);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const wsLabel = (w) => w === 'banking' ? 'Banking' : w === 'institutional' ? 'Institutional' : 'Internal';

export default function Meetings() {
  const [rows, setRows] = useState(null);
  const [users, setUsers] = useState([]);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(null);

  const load = () => get('/meetings').then(setRows).catch(e => setErr(e.message));
  useEffect(() => { load(); softGet('/users').then(setUsers); }, []);

  const startCreate = () => {
    setForm({
      title: '', duration_min: 30, participants: [], meeting_date: isoLocal(1),
      meeting_time: '11:00', link: '', agenda: '', workspace: 'internal'
    });
    setOpen(true);
  };
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.title.trim()) { setErr('Give the meeting a title'); return; }
    setBusy(true);
    try {
      await post('/meetings', {
        title: form.title,
        duration_min: Number(form.duration_min) || 30,
        participants: form.participants,
        meeting_date: form.meeting_date,
        meeting_time: form.meeting_time,
        link: form.link || undefined,
        agenda: form.agenda || undefined,
        workspace: form.workspace
      });
      setOpen(false); setErr(''); load();
    } catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  };

  if (err && !rows) return <ErrorNote>{err}</ErrorNote>;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div><div className="eyebrow">Scheduled and past</div><h3>Meetings</h3></div>
        <button className="btn primary" onClick={startCreate}>Create meeting</button>
      </div>
      {err && <ErrorNote>{err}</ErrorNote>}

      <Card pad={false}>
        {!rows ? <Loading /> : (
          <table className="tbl">
            <thead><tr>
              <th>Meeting</th><th>Workspace</th><th>Participants</th><th>Date &amp; time</th>
              <th>Duration</th><th>Link</th><th>Minutes</th><th>Attendance</th>
            </tr></thead>
            <tbody>
              {rows.length ? rows.map(m => (
                <tr key={m.id}>
                  <td><div style={{ fontWeight: 500 }}>{m.title}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{m.agenda || '—'}</div></td>
                  <td><Pill kind={m.workspace === 'banking' ? 'p-review' : 'p-progress'}>{wsLabel(m.workspace)}</Pill></td>
                  <td>{(m.participants || '').split(', ').filter(Boolean).map(n =>
                    <Avatar key={n} name={n} size={22} />)}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{shortDate(m.meeting_date)}
                    <div style={{ color: 'var(--muted)' }}>{m.meeting_time}</div></td>
                  <td className="mono" style={{ fontSize: 12 }}>{m.duration_min} min</td>
                  <td>{m.link
                    ? <a href={m.link} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>Join</a>
                    : <span style={{ color: 'var(--muted)' }}>In person</span>}</td>
                  <td style={{ fontSize: 12.5, maxWidth: 190 }}>{m.minutes || '—'}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{m.attended_count}/{m.participant_count}</td>
                </tr>
              )) : <Empty cols={8}>No meetings yet. Schedule one with the button above.</Empty>}
            </tbody>
          </table>
        )}
      </Card>

      {open && form && (
        <Modal title="Create meeting" onClose={() => setOpen(false)} onSave={save} saveLabel="Save meeting" busy={busy}>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
            <div style={{ gridColumn: '1 / -1' }}><label>Meeting title</label>
              <input value={form.title} onChange={e => set('title', e.target.value)} /></div>
            <div><label>Meeting date</label>
              <input type="date" value={form.meeting_date} onChange={e => set('meeting_date', e.target.value)} /></div>
            <div><label>Meeting time</label>
              <input type="time" value={form.meeting_time} onChange={e => set('meeting_time', e.target.value)} /></div>
            <div><label>Duration (min)</label>
              <input type="number" value={form.duration_min} onChange={e => set('duration_min', e.target.value)} /></div>
            <div><label>Workspace</label>
              <select value={form.workspace} onChange={e => set('workspace', e.target.value)}>
                <option value="internal">Internal</option>
                <option value="banking">Banking</option>
                <option value="institutional">Institutional</option>
              </select></div>
            <div style={{ gridColumn: '1 / -1' }}><label>Participants</label>
              <select multiple size={4} value={form.participants.map(String)}
                onChange={e => set('participants', [...e.target.selectedOptions].map(o => Number(o.value)))}>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select></div>
            <div style={{ gridColumn: '1 / -1' }}><label>Meeting link (optional)</label>
              <input value={form.link} placeholder="Google Meet / Teams URL" onChange={e => set('link', e.target.value)} /></div>
            <div style={{ gridColumn: '1 / -1' }}><label>Agenda</label>
              <textarea rows={3} value={form.agenda} onChange={e => set('agenda', e.target.value)} /></div>
          </div>
        </Modal>
      )}
    </>
  );
}
