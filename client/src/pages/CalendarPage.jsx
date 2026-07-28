import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get } from '../lib/api.js';
import { Card, Loading, ErrorNote } from '../components/Bits.jsx';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const isoOf = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const today = isoOf(new Date());

const LEGEND = [
  ['var(--green)', 'Completed'], ['var(--amber)', 'In progress'],
  ['var(--red)', 'Overdue'], ['var(--cyan)', 'Meetings']
];

export default function CalendarPage() {
  const nav = useNavigate();
  const [tasks, setTasks] = useState(null);
  const [meetings, setMeetings] = useState(null);
  const [err, setErr] = useState('');
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });

  useEffect(() => {
    get('/assignments').then(setTasks).catch(e => setErr(e.message));
    get('/meetings').then(setMeetings).catch(() => setMeetings([]));
  }, []);

  const byDate = useMemo(() => {
    const map = {};
    const push = (iso, ev) => { (map[iso] ||= []).push(ev); };
    (tasks || []).forEach(t => {
      const iso = (t.due_date || '').slice(0, 10);
      if (!iso) return;
      push(iso, {
        color: t.status === 'Completed' ? 'var(--green)' : t.is_overdue ? 'var(--red)' : 'var(--amber)',
        label: `${t.assignment_no} ${t.title}`,
        go: () => nav(`/internal/assignments/${t.id}`)
      });
    });
    (meetings || []).forEach(m => {
      const iso = (m.meeting_date || '').slice(0, 10);
      if (!iso) return;
      push(iso, { color: 'var(--cyan)', label: `${m.meeting_time} ${m.title}`, go: () => nav('/internal/meetings') });
    });
    return map;
  }, [tasks, meetings, nav]);

  if (err) return <ErrorNote>{err}</ErrorNote>;
  if (!tasks || !meetings) return <Loading />;

  const y = cursor.getFullYear(), mo = cursor.getMonth();
  const start = new Date(y, mo, 1);
  start.setDate(1 - start.getDay());
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const cd = new Date(start); cd.setDate(start.getDate() + i);
    const iso = isoOf(cd);
    const out = cd.getMonth() !== mo;
    const evs = byDate[iso] || [];
    cells.push(
      <div key={i} className="cell" style={{ background: out ? '#FAFBFD' : '#fff' }}>
        <div className="mono" style={{ fontSize: 11.5, color: out ? '#B7BEC9' : 'var(--muted)' }}>
          {cd.getDate()}{iso === today && <span style={{ color: 'var(--teal)' }}> ●</span>}
        </div>
        {evs.slice(0, 3).map((e, j) => (
          <div key={j} className="ev" title={e.label} onClick={e.go} style={{ background: e.color }}>{e.label}</div>
        ))}
        {evs.length > 3 && <div className="mono" style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 2 }}>+{evs.length - 3} more</div>}
      </div>
    );
  }

  const shift = (n) => setCursor(c => { const d = new Date(c); d.setMonth(d.getMonth() + n); return d; });

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div><div className="eyebrow">{cursor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</div>
          <h3>Calendar</h3></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => shift(-1)}>‹ Prev</button>
          <button className="btn" onClick={() => { const d = new Date(); d.setDate(1); setCursor(d); }}>Today</button>
          <button className="btn" onClick={() => shift(1)}>Next ›</button>
        </div>
      </div>

      <Card>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, marginBottom: 12 }}>
          {LEGEND.map(([c, l]) => (
            <span key={l}><span className="legend-dot" style={{ background: c }} />{l}</span>
          ))}
        </div>
        <div className="cal">
          {DOW.map(x => <div key={x} className="dow">{x}</div>)}
          {cells}
        </div>
      </Card>
    </>
  );
}
