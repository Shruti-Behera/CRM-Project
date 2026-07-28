import { useEffect, useMemo, useState } from 'react';
import { get, post, patch, del, shortDate } from '../lib/api.js';
import { Card, Pill, statusTone, Avatar, Loading, Empty, ErrorNote, Modal } from '../components/Bits.jsx';

const softGet = (p) => get(p).then(r => r || []).catch(() => []);
const isoLocal = (off = 1) => {
  const d = new Date(); d.setDate(d.getDate() + off);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const wsLabel = (w) => w === 'banking' ? 'Banking' : w === 'institutional' ? 'Institutional' : 'Internal';
const MEET_STATUS = ['Scheduled', 'Completed', 'Cancelled'];

export default function Meetings() {
  const [rows, setRows] = useState(null);
  const [users, setUsers] = useState([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [create, setCreate] = useState(null);
  const [edit, setEdit] = useState(null);
  const [f, setF] = useState({ q: '', workspace: '', status: '' });

  const load = () => get('/meetings').then(setRows).catch(e => setErr(e.message));
  useEffect(() => { load(); softGet('/users').then(setUsers); }, []);

  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const clear = () => setF({ q: '', workspace: '', status: '' });

  const startCreate = () => setCreate({
    title: '', duration_min: 30, participants: [], meeting_date: isoLocal(1),
    meeting_time: '11:00', link: '', agenda: '', workspace: 'internal'
  });
  const setC = (k, v) => setCreate(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!create.title.trim()) { setErr('Give the meeting a title'); return; }
    setBusy(true);
    try {
      await post('/meetings', {
        title: create.title, duration_min: Number(create.duration_min) || 30,
        participants: create.participants, meeting_date: create.meeting_date,
        meeting_time: create.meeting_time, link: create.link || undefined,
        agenda: create.agenda || undefined, workspace: create.workspace
      });
      setCreate(null); setErr(''); load();
    } catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  };

  const saveEdit = async () => {
    setBusy(true);
    try {
      await patch(`/meetings/${edit.id}`, { status: edit.status, minutes: edit.minutes || undefined });
      setEdit(null); setErr(''); load();
    } catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  };

  const remove = async (m) => {
    if (!window.confirm(`Delete "${m.title}"?`)) return;
    try { await del(`/meetings/${m.id}`); load(); } catch (e) { setErr(e.message); }
  };

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = f.q.toLowerCase();
    return rows.filter(m =>
      (!f.workspace || m.workspace === f.workspace) &&
      (!f.status || m.status === f.status) &&
      (!q || `${m.title} ${m.agenda || ''} ${m.participants || ''}`.toLowerCase().includes(q)));
  }, [rows, f]);

  if (err && !rows) return <ErrorNote>{err}</ErrorNote>;
  if (!rows) return <Loading />;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div><div className="eyebrow">Scheduled and past</div><h3>Meetings</h3></div>
        <button className="btn primary" onClick={startCreate}>Create meeting</button>
      </div>
      {err && <ErrorNote>{err}</ErrorNote>}

      <Card>
        <div className="filters">
          <div><label>Search</label><input placeholder="Title, agenda or participant" value={f.q} onChange={e => set('q', e.target.value)} /></div>
          <div><label>Workspace</label>
            <select value={f.workspace} onChange={e => set('workspace', e.target.value)}>
              <option value="">All</option>
              <option value="internal">Internal</option>
              <option value="banking">Banking</option>
              <option value="institutional">Institutional</option>
            </select></div>
          <div><label>Status</label>
            <select value={f.status} onChange={e => set('status', e.target.value)}>
              <option value="">All</option>{MEET_STATUS.map(s => <option key={s}>{s}</option>)}</select></div>
          <div><label>&nbsp;</label><button className="btn" style={{ width: '100%' }} onClick={clear}>Clear</button></div>
        </div>
      </Card>

      <div style={{ height: 14 }} />

      <Card pad={false}>
        <table className="tbl">
          <thead><tr>
            <th>Meeting</th><th>Workspace</th><th>Participants</th><th>Date &amp; time</th>
            <th>Duration</th><th>Link</th><th>Minutes</th><th>Attendance</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th>
          </tr></thead>
          <tbody>
            {filtered.length ? filtered.map(m => (
              <tr key={m.id}>
                <td><div style={{ fontWeight: 500 }}>{m.title}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{m.agenda || '—'}</div></td>
                <td><Pill kind={m.workspace === 'banking' ? 'p-review' : 'p-progress'}>{wsLabel(m.workspace)}</Pill></td>
                <td>{(m.participants || '').split(', ').filter(Boolean).map(n => <Avatar key={n} name={n} size={22} />)}</td>
                <td className="mono" style={{ fontSize: 12 }}>{shortDate(m.meeting_date)}
                  <div style={{ color: 'var(--muted)' }}>{m.meeting_time}</div></td>
                <td className="mono" style={{ fontSize: 12 }}>{m.duration_min} min</td>
                <td>{m.link
                  ? <a href={m.link} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>Join</a>
                  : <span style={{ color: 'var(--muted)' }}>In person</span>}</td>
                <td style={{ fontSize: 12.5, maxWidth: 190 }}>{m.minutes || '—'}</td>
                <td className="mono" style={{ fontSize: 12 }}>{m.attended_count}/{m.participant_count}</td>
                <td><Pill kind={statusTone(m.status === 'Cancelled' ? 'Rejected' : m.status === 'Completed' ? 'Completed' : 'Pending')}>{m.status}</Pill></td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button className="btn" style={{ padding: '2px 8px' }} onClick={() => setEdit({ id: m.id, status: m.status, minutes: m.minutes || '' })}>Edit</button>{' '}
                  <button className="btn" style={{ padding: '2px 8px', color: 'var(--red)' }} onClick={() => remove(m)}>Delete</button>
                </td>
              </tr>
            )) : <Empty cols={10}>No meetings yet. Schedule one with the button above.</Empty>}
          </tbody>
        </table>
        <div className="eyebrow" style={{ padding: '10px 15px' }}>{filtered.length} of {rows.length} meetings</div>
      </Card>

      {create && (
        <Modal title="Create meeting" onClose={() => setCreate(null)} onSave={save} saveLabel="Save meeting" busy={busy}>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
            <div style={{ gridColumn: '1 / -1' }}><label>Meeting title</label>
              <input value={create.title} onChange={e => setC('title', e.target.value)} /></div>
            <div><label>Meeting date</label>
              <input type="date" value={create.meeting_date} onChange={e => setC('meeting_date', e.target.value)} /></div>
            <div><label>Meeting time</label>
              <input type="time" value={create.meeting_time} onChange={e => setC('meeting_time', e.target.value)} /></div>
            <div><label>Duration (min)</label>
              <input type="number" value={create.duration_min} onChange={e => setC('duration_min', e.target.value)} /></div>
            <div><label>Workspace</label>
              <select value={create.workspace} onChange={e => setC('workspace', e.target.value)}>
                <option value="internal">Internal</option>
                <option value="banking">Banking</option>
                <option value="institutional">Institutional</option>
              </select></div>
            <div style={{ gridColumn: '1 / -1' }}><label>Participants</label>
              <select multiple size={4} value={create.participants.map(String)}
                onChange={e => setC('participants', [...e.target.selectedOptions].map(o => Number(o.value)))}>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select></div>
            <div style={{ gridColumn: '1 / -1' }}><label>Meeting link (optional)</label>
              <input value={create.link} placeholder="Google Meet / Teams URL" onChange={e => setC('link', e.target.value)} /></div>
            <div style={{ gridColumn: '1 / -1' }}><label>Agenda</label>
              <textarea rows={3} value={create.agenda} onChange={e => setC('agenda', e.target.value)} /></div>
          </div>
        </Modal>
      )}

      {edit && (
        <Modal title="Update meeting" onClose={() => setEdit(null)} onSave={saveEdit} saveLabel="Save" busy={busy}>
          <div className="grid">
            <div><label>Status</label>
              <select value={edit.status} onChange={e => setEdit(v => ({ ...v, status: e.target.value }))}>
                {MEET_STATUS.map(s => <option key={s}>{s}</option>)}</select></div>
            <div><label>Minutes</label>
              <textarea rows={4} value={edit.minutes} placeholder="What was discussed and decided"
                onChange={e => setEdit(v => ({ ...v, minutes: e.target.value }))} /></div>
          </div>
        </Modal>
      )}
    </>
  );
}
