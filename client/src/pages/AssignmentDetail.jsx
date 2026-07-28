import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { get, post, patch, del, shortDate } from '../lib/api.js';
import { Card, Pill, pClass, statusTone, Avatar, Loading, Empty, ErrorNote, Modal } from '../components/Bits.jsx';
import { useAuth } from '../lib/auth.jsx';

const STATUSES = ['Pending', 'In Progress', 'Under Review', 'Completed', 'On Hold'];
const PRIOS = ['Low', 'Medium', 'High', 'Critical'];
const softGet = (p) => get(p).then(r => r || []).catch(() => []);
const isoLocal = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const daysToDue = (due) => due ? Math.round((new Date(String(due).slice(0, 10) + 'T00:00:00') - new Date(new Date().toDateString())) / 86400000) : null;

const Field = ({ label, children }) => (
  <div><div className="eyebrow">{label}</div><div style={{ fontSize: 13.5 }}>{children}</div></div>
);

export default function AssignmentDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { can } = useAuth();
  const [t, setT] = useState(null);
  const [users, setUsers] = useState([]);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [noteStatus, setNoteStatus] = useState('');
  const [newSub, setNewSub] = useState('');
  const [newChk, setNewChk] = useState('');
  const [timer, setTimer] = useState(null);

  const load = () => get(`/assignments/${id}`).then(t => { setT(t); setNoteStatus(t.status); }).catch(e => setErr(e.message));
  useEffect(() => { load(); softGet('/users').then(setUsers); /* eslint-disable-next-line */ }, [id]);

  const guard = (fn) => async (...a) => { try { await fn(...a); await load(); } catch (e) { setErr(e.message); } };

  const setStatus = guard((s) => patch(`/assignments/${id}`, { status: s }));
  const setPriority = guard((p) => patch(`/assignments/${id}`, { priority: p }));
  const complete = guard(() => post(`/assignments/${id}/complete`, {}));
  const toggleSub = guard((s) => patch(`/assignments/${id}/subtasks/${s.id}`, { is_done: !(Number(s.is_done) === 1) }));
  const addSub = guard(() => { if (!newSub.trim()) return Promise.resolve(); const r = post(`/assignments/${id}/subtasks`, { title: newSub }); setNewSub(''); return r; });
  const dropSub = guard((s) => del(`/assignments/${id}/subtasks/${s.id}`));
  const toggleChk = guard((c) => patch(`/assignments/${id}/checklist/${c.id}`, { is_done: !(Number(c.is_done) === 1) }));
  const addChk = guard(() => { if (!newChk.trim()) return Promise.resolve(); const r = post(`/assignments/${id}/checklist`, { item_text: newChk }); setNewChk(''); return r; });
  const dropChk = guard((c) => del(`/assignments/${id}/checklist/${c.id}`));
  const addNote = guard(() => {
    if (!note.trim()) return Promise.resolve();
    const body = { comment: note };
    if (noteStatus && noteStatus !== t.status) body.status = noteStatus;
    const r = post(`/assignments/${id}/notes`, body);
    setNote('');
    return r;
  });
  const remove = async () => {
    if (!window.confirm(`Delete ${t.assignment_no}? This cannot be undone.`)) return;
    try { await del(`/assignments/${id}`); nav('/internal/assignments'); } catch (e) { setErr(e.message); }
  };

  if (err && !t) return <ErrorNote>{err}</ErrorNote>;
  if (!t) return <Loading />;

  const subs = t.subtasks || [], checks = t.checklist || [], notes = t.notes || [];
  const logs = t.time_logs || [], activity = t.activity || [], watchers = t.watchers || [];
  const logged = logs.reduce((n, l) => n + Number(l.hours || 0), 0);
  const left = daysToDue(t.due_date);
  const subsDone = subs.filter(s => Number(s.is_done) === 1).length;
  const checksDone = checks.filter(c => Number(c.is_done) === 1).length;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow">{t.assignment_no} · {t.department || '—'} · {t.category || '—'}</div>
          <h3>{t.title}</h3>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => setTimer({ log_date: isoLocal(), hours: 1, narration: '', user_id: '' })}>Log time</button>
          {can('assignments.delete') && <button className="btn" style={{ color: 'var(--red)' }} onClick={remove}>Delete</button>}
          {t.status !== 'Completed' && can('assignments.edit') &&
            <button className="btn teal" onClick={complete}>Mark complete</button>}
          <Link className="btn" to="/internal/assignments">Back</Link>
        </div>
      </div>
      {err && <ErrorNote>{err}</ErrorNote>}

      <div className="grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <div className="grid">
          <Card>
            <p style={{ fontSize: 13.5 }}>{t.description || <span style={{ color: 'var(--muted)' }}>No description.</span>}</p>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginTop: 8 }}>
              <Field label="Assigned by">{t.assigned_by_name}</Field>
              <Field label="Assigned to">{t.assigned_to_name}</Field>
              <Field label="Project">{t.project || '—'}</Field>
              <Field label="Start">{shortDate(t.start_date)}</Field>
              <Field label="Due">{shortDate(t.due_date)}</Field>
              <Field label="SLA">{t.status === 'Completed' || left == null ? 'closed'
                : <span className={`chip ${left < 0 ? 'down' : left <= 2 ? 'flat' : 'up'}`}>
                    {left < 0 ? `${Math.abs(left)}d over` : `${left}d left`}</span>}</Field>
              <Field label="Estimated / logged">{Number(t.estimated_hours)}h / {logged}h</Field>
              <Field label="Repeats">{t.recurrence}</Field>
              <Field label="Watchers">{watchers.length
                ? watchers.map(w => <Avatar key={w.id} name={w.name} size={22} />) : '—'}</Field>

              <Field label="Status">
                {can('assignments.edit')
                  ? <select value={t.status} onChange={e => setStatus(e.target.value)} style={{ marginTop: 2 }}>
                      {STATUSES.map(s => <option key={s}>{s}</option>)}</select>
                  : <Pill kind={statusTone(t.status)}>{t.status}</Pill>}
              </Field>
              <Field label="Priority">
                {can('assignments.edit')
                  ? <select value={t.priority} onChange={e => setPriority(e.target.value)} style={{ marginTop: 2 }}>
                      {PRIOS.map(s => <option key={s}>{s}</option>)}</select>
                  : <Pill kind={pClass(t.priority)}>{t.priority}</Pill>}
              </Field>
              <Field label={`Progress — ${t.progress_pct}%`}>
                <div className="prog" style={{ height: 7, marginTop: 6 }}><i style={{ width: `${t.progress_pct}%` }} /></div>
              </Field>
            </div>
          </Card>

          <Card title={<>Sub-tasks <span className="eyebrow" style={{ marginLeft: 6 }}>{subsDone} of {subs.length} done</span></>}>
            {subs.length ? subs.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid #F2F4F8' }}>
                <input type="checkbox" checked={Number(s.is_done) === 1} onChange={() => toggleSub(s)}
                  disabled={!can('assignments.edit')} style={{ width: 'auto' }} />
                <span style={{ flex: 1, textDecoration: Number(s.is_done) === 1 ? 'line-through' : 'none', color: Number(s.is_done) === 1 ? 'var(--muted)' : 'inherit' }}>{s.title}</span>
                {s.owner && <Avatar name={s.owner} size={20} />}
                {can('assignments.edit') && <button className="btn" style={{ padding: '0 7px' }} onClick={() => dropSub(s)}>×</button>}
              </div>
            )) : <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>No sub-tasks. Break the work down if more than one person is involved.</p>}
            {can('assignments.edit') && (
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                <input placeholder="Add a sub-task" value={newSub} onChange={e => setNewSub(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addSub()} />
                <button className="btn" onClick={addSub}>Add</button>
              </div>
            )}
          </Card>

          <Card title={<>Notes <span className="eyebrow" style={{ marginLeft: 6 }}>{notes.length} entries</span></>}>
            {notes.map(n => (
              <div key={n.id} style={{ borderBottom: '1px solid #F2F4F8', padding: '8px 0' }}>
                <b style={{ fontSize: 12.5 }}>{n.author}</b>
                {n.status_at_note && <Pill kind={statusTone(n.status_at_note)}>{n.status_at_note}</Pill>}
                <span className="mono" style={{ float: 'right', fontSize: 11, color: 'var(--muted)' }}>{shortDate(n.note_at)}</span>
                <div style={{ fontSize: 13 }}>{n.comment}</div>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'flex-start' }}>
              <textarea rows={2} style={{ flex: 2 }} value={note} placeholder="What happened, and what's next"
                onChange={e => setNote(e.target.value)} />
              {can('assignments.edit') && (
                <select style={{ flex: 1 }} value={noteStatus} onChange={e => setNoteStatus(e.target.value)}>
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              )}
            </div>
            <button className="btn primary" style={{ marginTop: 8 }} onClick={addNote}>Add note</button>
          </Card>

          <Card title={<>Time log <span className="eyebrow" style={{ marginLeft: 6 }}>{logged}h of {Number(t.estimated_hours)}h</span></>} pad={false}>
            <table className="tbl">
              <thead><tr><th>Date</th><th>Who</th><th>Hours</th><th>Narration</th></tr></thead>
              <tbody>
                {logs.length ? logs.map(l => (
                  <tr key={l.id}>
                    <td className="mono" style={{ fontSize: 12 }}>{shortDate(l.log_date)}</td>
                    <td style={{ fontSize: 12.5 }}>{l.who}</td>
                    <td className="mono">{Number(l.hours)}h</td>
                    <td style={{ fontSize: 12.5 }}>{l.narration || '—'}</td>
                  </tr>
                )) : <Empty cols={4}>No time logged yet.</Empty>}
              </tbody>
            </table>
          </Card>
        </div>

        <div className="grid">
          <Card title={<>Checklist <span className="eyebrow" style={{ marginLeft: 6 }}>{checksDone} of {checks.length}</span></>}>
            {checks.length ? checks.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                <input type="checkbox" checked={Number(c.is_done) === 1} onChange={() => toggleChk(c)}
                  disabled={!can('assignments.edit')} style={{ width: 'auto' }} />
                <span style={{ flex: 1, textDecoration: Number(c.is_done) === 1 ? 'line-through' : 'none', color: Number(c.is_done) === 1 ? 'var(--muted)' : 'inherit', fontSize: 13 }}>{c.item_text}</span>
                {can('assignments.edit') && <button className="btn" style={{ padding: '0 7px' }} onClick={() => dropChk(c)}>×</button>}
              </div>
            )) : <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>No checklist items yet.</p>}
            {can('assignments.edit') && (
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                <input placeholder="Add checklist item" value={newChk} onChange={e => setNewChk(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addChk()} />
                <button className="btn" onClick={addChk}>Add</button>
              </div>
            )}
          </Card>

          <Card title="Activity timeline">
            {activity.length ? activity.map((a, i) => (
              <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid #F2F4F8', fontSize: 12.5 }}>
                <b>{a.description}</b>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {a.who || 'system'} · {shortDate(a.created_at)}
                </div>
              </div>
            )) : <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>No activity yet.</p>}
          </Card>
        </div>
      </div>

      {timer && (
        <Modal title="Log time" saveLabel="Log time" onClose={() => setTimer(null)}
          onSave={async () => {
            const h = Number(timer.hours);
            if (!h || h <= 0) { setErr('Enter hours'); return; }
            try {
              await post(`/assignments/${id}/time`, {
                log_date: timer.log_date, hours: h,
                narration: timer.narration || undefined,
                user_id: timer.user_id ? Number(timer.user_id) : undefined
              });
              setTimer(null); await load();
            } catch (e) { setErr(e.message); }
          }}>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
            <div><label>Date</label><input type="date" value={timer.log_date}
              onChange={e => setTimer(v => ({ ...v, log_date: e.target.value }))} /></div>
            <div><label>Hours</label><input type="number" step="0.25" value={timer.hours}
              onChange={e => setTimer(v => ({ ...v, hours: e.target.value }))} /></div>
            <div><label>Who</label>
              <select value={timer.user_id} onChange={e => setTimer(v => ({ ...v, user_id: e.target.value }))}>
                <option value="">Me</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select></div>
            <div style={{ gridColumn: '1 / -1' }}><label>Narration</label>
              <input value={timer.narration} onChange={e => setTimer(v => ({ ...v, narration: e.target.value }))} /></div>
          </div>
        </Modal>
      )}
    </>
  );
}
