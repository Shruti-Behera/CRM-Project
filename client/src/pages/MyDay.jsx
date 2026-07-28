import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { get, inr, shortDate } from '../lib/api.js';
import { Card, Pill, pClass, Loading, ErrorNote } from '../components/Bits.jsx';

const today = () => new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const todayIso = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

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
  const [err, setErr] = useState('');

  useEffect(() => {
    get('/assignments/my-day').then(setData).catch(e => setErr(e.message));
    // Meetings are a separate module; fetch today's and fail soft if unavailable.
    get(`/meetings?on=${todayIso()}`).then(m => setMeetings(m || [])).catch(() => setMeetings([]));
  }, []);

  if (err) return <ErrorNote>{err}</ErrorNote>;
  if (!data) return <Loading />;

  const { overdue = [], today: due = [], upcoming = [], approvals = [], hours_today } = data;

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
        <Link className="btn primary" to="/internal/assignments/new">New assignment</Link>
      </div>

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
        </div>
      </div>
    </>
  );
}
