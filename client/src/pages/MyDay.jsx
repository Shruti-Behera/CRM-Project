import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { get, post, inr, shortDate } from '../lib/api.js';
import { Card, Pill, pClass, Loading, ErrorNote, Modal } from '../components/Bits.jsx';

const today = () => new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const todayIso = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const softGet = (p) => get(p).then(r => r || []).catch(() => []);

function TaskLine({ t }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '8px 0', borderBottom: '1px solid #F2F4F8' }}>
      <div>
        <Link to={`/internal/assignments/${t.id}`} className="mono" style={{ fontSize: 11.5, fontWeight: 600 }}>{t.assignment_no}</Link>{' '}
        <span style={{ fontSize: 13 }}>{t.title}</span>
        <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{t.department || '—'} · {t.progress_pct || 0}% done</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <Pill kind={pClass(t.priority)}>{t.priority}</Pill>
        <div className="mono" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{shortDate(t.due_date)}</div>
      </div>
    </div>
  );
}

const Block = ({ title, items, children, empty }) => (
  <Card title={<>{title} <span className="eyebrow" style={{ marginLeft: 6 }}>{items.length}</span></>}>
    {items.length ? children : <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>{empty}</p>}
  </Card>
);

export default function MyDay() {
  const [data, setData] = useState(null);
  const [meetings, setMeetings] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const [err, setErr] = useState('');
  const [log, setLog] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => get('/assignments/my-day').then(setData).catch(e => setErr(e.message));
  useEffect(() => {
    load();
    get(`/meetings?on=${todayIso()}`).then(m => setMeetings(m || [])).catch(() => setMeetings([]));
    softGet('/assignments').then(setAllTasks);
  }, []);

  const openLog = () => setLog({ assignment_id: '', log_date: todayIso(), hours: 1, narration: '' });
  const saveLog = async () => {
    if (!log.assignment_id) { setErr('Pick an assignment to log against'); return; }
    if (!Number(log.hours)) { setErr('Enter hours'); return; }
    setBusy(true);
    try {
      await post(`/assignments/${log.assignment_id}/time`, {
        log_date: log.log_date, hours: Number(log.hours), narration: log.narration || undefined
      });
      setLog(null); setErr(''); await load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  if (err && !data) return <ErrorNote>{err}</ErrorNote>;
  if (!data) return <Loading />;

  const { overdue = [], today: due = [], upcoming = [], approvals = [], logs_today = [], hours_today } = data;

  const kpis = [
    [due.length, 'Due today', ''],
    [upcoming.length, 'Due in 3 days', 'b2'],
    [overdue.length, 'Overdue', 'b5'],
    [approvals.length, 'To approve', 'b4'],
    [meetings.length, 'Meetings', 'b3'],
    [`${Number(hours_today) || 0}h`, 'Logged today', '']
  ];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div><div className="eyebrow">{today()}</div><h3>My day</h3></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={openLog}>Log time</button>
          <Link className="btn primary" to="/internal/assignments/new">New assignment</Link>
        </div>
      </div>
      {err && <ErrorNote>{err}</ErrorNote>}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', marginBottom: 14 }}>
        {kpis.map(([v, l, tone]) => (
          <div key={l} className={`stat ${tone}`}>
            <div className="cap">{l}</div><div className="big">{v}</div>
          </div>
        ))}
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.3fr 1fr' }}>
        <div className="grid">
          <Block title="Overdue" items={overdue} empty="Nothing overdue.">
            {overdue.map(t => <TaskLine key={t.id} t={t} />)}
          </Block>
          <Block title="Due today" items={due} empty="Nothing due today.">
            {due.map(t => <TaskLine key={t.id} t={t} />)}
          </Block>
          <Block title="Coming up" items={upcoming} empty="Nothing due in the next three days.">
            {upcoming.map(t => <TaskLine key={t.id} t={t} />)}
          </Block>
        </div>

        <div className="grid">
          <Block title="Today's meetings" items={meetings} empty="No meetings today.">
            {meetings.map(m => (
              <div key={m.id} style={{ padding: '8px 0', borderBottom: '1px solid #F2F4F8' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <b style={{ fontSize: 13 }}>{m.title}</b>
                  <span className="mono" style={{ fontSize: 12 }}>{m.meeting_time}</span>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                  {m.participant_count} participants · {m.duration_min} min
                </div>
                {m.link && <a href={m.link} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>Join</a>}
              </div>
            ))}
          </Block>

          <Block title="Work approvals on you" items={approvals} empty="Nothing waiting on you.">
            {approvals.map(w => (
              <div key={w.id} style={{ padding: '8px 0', borderBottom: '1px solid #F2F4F8' }}>
                <Link to="/internal/work-approvals" className="mono" style={{ fontSize: 11.5, fontWeight: 600 }}>{w.approval_no}</Link>{' '}
                <span style={{ fontSize: 13 }}>{w.title}</span>
                <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                  {w.work_type}{Number(w.amount) ? ` · ${inr(w.amount)}` : ''} · from {w.raised_by}
                </div>
              </div>
            ))}
          </Block>

          <Block title="Time logged today" items={logs_today} empty="No time logged today.">
            {logs_today.map(l => (
              <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #F2F4F8' }}>
                <div>
                  <Link to={`/internal/assignments/${l.assignment_id}`} className="mono" style={{ fontSize: 11.5, fontWeight: 600 }}>{l.assignment_no}</Link>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{l.narration || l.title}</div>
                </div>
                <span className="mono" style={{ fontSize: 12 }}>{Number(l.hours)}h</span>
              </div>
            ))}
          </Block>
        </div>
      </div>

      {log && (
        <Modal title="Log time" saveLabel="Log time" busy={busy} onClose={() => setLog(null)} onSave={saveLog}>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
            <div style={{ gridColumn: '1 / -1' }}><label>Assignment</label>
              <select value={log.assignment_id} onChange={e => setLog(v => ({ ...v, assignment_id: e.target.value }))}>
                <option value="">— pick an assignment —</option>
                {allTasks.map(t => <option key={t.id} value={t.id}>{t.assignment_no} — {t.title}</option>)}
              </select></div>
            <div><label>Date</label><input type="date" value={log.log_date}
              onChange={e => setLog(v => ({ ...v, log_date: e.target.value }))} /></div>
            <div><label>Hours</label><input type="number" step="0.25" value={log.hours}
              onChange={e => setLog(v => ({ ...v, hours: e.target.value }))} /></div>
            <div style={{ gridColumn: '1 / -1' }}><label>Narration</label>
              <input value={log.narration} onChange={e => setLog(v => ({ ...v, narration: e.target.value }))} /></div>
          </div>
        </Modal>
      )}
    </>
  );
}
