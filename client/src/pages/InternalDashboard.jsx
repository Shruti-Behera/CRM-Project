import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import {
  Chart, BarElement, CategoryScale, LinearScale, ArcElement,
  PointElement, LineElement, Filler, Tooltip, Legend
} from 'chart.js';
import { get, shortDate } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { Stat, Card, Pill, pClass, statusTone, Avatar, Loading, Empty, ErrorNote } from '../components/Bits.jsx';

Chart.register(BarElement, CategoryScale, LinearScale, ArcElement,
  PointElement, LineElement, Filler, Tooltip, Legend);

const RAY = ['#23408E', '#1D5D9D', '#2596C2', '#20B7D2', '#1DB5B6', '#0FB59F', '#18B485', '#8794AB'];
const STATUSES = ['Pending', 'In Progress', 'Under Review', 'Completed', 'On Hold'];
const PRIOS = ['Low', 'Medium', 'High', 'Critical'];
const PRIO_COLORS = ['#8794AB', '#2596C2', '#E0A21C', '#D0483F'];
const noAspect = (o = {}) => ({ maintainAspectRatio: false, ...o });

const isoOf = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const today = isoOf(new Date());
const dPlus = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return isoOf(d); };
const ymd = (s) => (s || '').slice(0, 10);
const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'; };

const ChartBox = ({ h = 220, children }) => <div style={{ height: h }}>{children}</div>;

export default function InternalDashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [tasks, setTasks] = useState(null);
  const [meetings, setMeetings] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    get('/dashboards/internal').then(setSummary).catch(e => setErr(e.message));
    get('/assignments').then(setTasks).catch(e => setErr(e.message));
    get(`/meetings?from=${today}`).then(m => setMeetings(m || [])).catch(() => setMeetings([]));
  }, []);

  const derived = useMemo(() => {
    if (!tasks) return null;
    const open = tasks.filter(t => t.status !== 'Completed');

    // Priority split
    const prioCounts = PRIOS.map(pr => tasks.filter(t => t.priority === pr).length);

    // Due-date runway (next 14 days)
    const runLabels = [], runDue = [], runHigh = [];
    for (let i = 0; i < 14; i++) {
      const day = dPlus(i);
      runLabels.push(shortDate(day));
      runDue.push(open.filter(t => ymd(t.due_date) === day).length);
      runHigh.push(open.filter(t => ymd(t.due_date) === day && ['High', 'Critical'].includes(t.priority)).length);
    }

    // Ageing of open work (by days since start)
    const age = [0, 0, 0, 0];
    open.forEach(t => {
      const a = Math.max(0, daysBetween(ymd(t.start_date), today));
      age[a <= 3 ? 0 : a <= 7 ? 1 : a <= 14 ? 2 : 3]++;
    });

    // Created vs completed (last 6 months)
    const cvcL = [], cvcC = [], cvcD = [];
    for (let i = 5; i >= 0; i--) {
      const dt = new Date(); dt.setMonth(dt.getMonth() - i);
      const key = isoOf(dt).slice(0, 7);
      cvcL.push(dt.toLocaleDateString('en-IN', { month: 'short' }));
      cvcC.push(tasks.filter(t => ymd(t.start_date).slice(0, 7) === key).length);
      cvcD.push(tasks.filter(t => t.status === 'Completed' && ymd(t.due_date).slice(0, 7) === key).length);
    }

    // Department load
    const depts = [...new Set(tasks.map(t => t.department).filter(Boolean))];
    const deptLoad = depts.map(dp => {
      const list = tasks.filter(t => t.department === dp);
      return {
        dp, total: list.length,
        done: list.filter(t => t.status === 'Completed').length,
        late: list.filter(t => t.is_overdue).length
      };
    }).filter(r => r.total).sort((a, b) => b.total - a.total).slice(0, 7);

    const upcoming = open.filter(t => t.due_date).sort((a, b) => ymd(a.due_date) < ymd(b.due_date) ? -1 : 1).slice(0, 5);

    return { open, prioCounts, runLabels, runDue, runHigh, age, cvcL, cvcC, cvcD, deptLoad, upcoming };
  }, [tasks]);

  if (err && !summary) return <ErrorNote>{err}</ErrorNote>;
  if (!summary || !tasks || !derived) return <Loading />;

  const { kpi } = summary;
  const total = Number(kpi.total) || 0, done = Number(kpi.completed) || 0;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const overdue = Number(kpi.overdue) || 0;
  const deptMax = Math.max(1, ...derived.deptLoad.map(r => r.total));

  return (
    <>
      <div className="hero">
        <div className="eyebrow" style={{ color: '#B9C6E2' }}>
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h3 style={{ marginTop: 4 }}>Good {greeting()}, {(user?.name || '').split(' ')[0]}</h3>
            <div style={{ color: '#B9C6E2', fontSize: 12.5 }}>
              {total - done} open · {overdue ? <span style={{ color: '#FF9B92' }}>{overdue} overdue</span> : 'nothing overdue'}
              {' · '}{Number(kpi.in_flight) || 0} in progress · {meetings.filter(m => ymd(m.meeting_date) === today).length} meetings today
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link className="btn" to="/internal/my-day">My day</Link>
            <Link className="btn teal" to="/internal/assignments/new">New assignment</Link>
          </div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', marginBottom: 14 }}>
        <Stat cap="Total assignments" big={total} foot={`${Number(kpi.pending) || 0} pending · ${Number(kpi.in_flight) || 0} active`} />
        <Stat cap="In flight" big={Number(kpi.in_flight) || 0} foot={`${Number(kpi.pending) || 0} not started`} tone="b2" />
        <Stat cap="Completion" big={`${pct}%`} foot={`${done} of ${total} closed`} tone="b3" />
        <Stat cap="Overdue" big={overdue} foot={overdue ? 'past due' : 'nothing past due'} tone={overdue ? 'b5' : 'b4'} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.4fr 1fr', marginBottom: 14 }}>
        <Card title="Status mix by department">
          <ChartBox h={240}><StatusByDept by_status={summary.by_status} /></ChartBox>
        </Card>
        <Card title="Priority split">
          <ChartBox h={240}>
            <Doughnut data={{
              labels: PRIOS,
              datasets: [{ data: derived.prioCounts.some(Boolean) ? derived.prioCounts : [0, 0, 0, 1],
                backgroundColor: PRIO_COLORS, borderWidth: 2, borderColor: '#fff' }]
            }} options={noAspect({ cutout: '62%', plugins: { legend: { position: 'right' } } })} />
          </ChartBox>
        </Card>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.3fr 1fr', marginBottom: 14 }}>
        <Card title="Due-date runway" extra={<span className="eyebrow">Next 14 days</span>}>
          <ChartBox h={200}>
            <Bar data={{
              labels: derived.runLabels,
              datasets: [
                { label: 'Due', data: derived.runDue, backgroundColor: '#C8D3E6', borderRadius: 3 },
                { label: 'High / critical', data: derived.runHigh, backgroundColor: RAY[0], borderRadius: 3 }
              ]
            }} options={noAspect({
              plugins: { legend: { position: 'bottom' } },
              scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1 } } }
            })} />
          </ChartBox>
        </Card>
        <Card title="Ageing of open work">
          <ChartBox h={200}>
            <Bar data={{
              labels: ['0–3 days', '4–7 days', '8–14 days', '15+ days'],
              datasets: [{ data: derived.age, borderRadius: 4,
                backgroundColor: [RAY[6], RAY[4], '#E0A21C', '#D0483F'] }]
            }} options={noAspect({ plugins: { legend: { display: false } },
              scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } })} />
          </ChartBox>
        </Card>
      </div>

      <Card title="Created vs completed" extra={<span className="eyebrow">Six months</span>}>
        <ChartBox h={200}>
          <Line data={{
            labels: derived.cvcL,
            datasets: [
              { label: 'Created', data: derived.cvcC, borderColor: RAY[0], backgroundColor: 'rgba(35,64,142,.10)', fill: true, tension: .35, pointRadius: 3 },
              { label: 'Completed', data: derived.cvcD, borderColor: '#1DB5B6', backgroundColor: 'rgba(29,181,182,.12)', fill: true, tension: .35, pointRadius: 3 }
            ]
          }} options={noAspect({ plugins: { legend: { position: 'bottom' } },
            interaction: { mode: 'index', intersect: false },
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } })} />
        </ChartBox>
      </Card>

      <div style={{ height: 14 }} />

      <div className="grid" style={{ gridTemplateColumns: '1.3fr 1fr', marginBottom: 14 }}>
        <Card title="Recent assignments" extra={<Link className="eyebrow" to="/internal/assignments">View all</Link>} pad={false}>
          <table className="tbl">
            <thead><tr><th>Task</th><th>Owner</th><th>Due</th><th>Priority</th><th>Status</th></tr></thead>
            <tbody>
              {tasks.length ? tasks.slice(0, 6).map(t => (
                <tr key={t.id}>
                  <td><Link to={`/internal/assignments/${t.id}`} className="mono" style={{ fontSize: 11.5, fontWeight: 600 }}>{t.assignment_no}</Link>
                    <div style={{ fontSize: 12.5 }}>{t.title}</div></td>
                  <td><Avatar name={t.assigned_to_name} size={22} /></td>
                  <td className="mono" style={{ fontSize: 12, color: t.is_overdue ? 'var(--red)' : undefined }}>{shortDate(t.due_date)}</td>
                  <td><Pill kind={pClass(t.priority)}>{t.priority}</Pill></td>
                  <td><Pill kind={statusTone(t.status)}>{t.status}</Pill></td>
                </tr>
              )) : <Empty cols={5}>Nothing here yet.</Empty>}
            </tbody>
          </table>
        </Card>

        <Card title="Department load">
          {derived.deptLoad.length ? derived.deptLoad.map((r, i) => (
            <div key={r.dp} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
              <span className="mono" style={{ fontSize: 11.5, color: 'var(--muted)', width: 20 }}>{String(i + 1).padStart(2, '0')}</span>
              <span style={{ fontSize: 12.5, width: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.dp}</span>
              <span style={{ flex: 1, height: 8, borderRadius: 5, overflow: 'hidden', display: 'flex', background: '#EDF1F7', width: `${(r.total / deptMax) * 70 + 20}%` }}>
                <i style={{ width: `${(r.done / r.total) * 100}%`, background: 'var(--green)' }} />
                <i style={{ width: `${(r.late / r.total) * 100}%`, background: 'var(--red)' }} />
                <i style={{ flex: 1, background: 'linear-gradient(90deg,var(--navy),var(--teal))' }} />
              </span>
              <span className="mono" style={{ fontSize: 11.5, width: 24, textAlign: 'right' }}>{r.total}</span>
            </div>
          )) : <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>No work assigned to any department yet.</p>}
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)' }}>
            <span className="legend-dot" style={{ background: 'var(--green)' }} />completed
            <span className="legend-dot" style={{ background: 'var(--red)', marginLeft: 8 }} />overdue
            <span className="legend-dot" style={{ background: 'var(--teal)', marginLeft: 8 }} />in flight
          </div>
        </Card>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <Card title="Upcoming deadlines">
          {derived.upcoming.length ? derived.upcoming.map(t => {
            const dl = daysBetween(today, ymd(t.due_date));
            return (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #F2F4F8' }}>
                <div>
                  <Link to={`/internal/assignments/${t.id}`} className="mono" style={{ fontSize: 11.5, fontWeight: 600 }}>{t.assignment_no}</Link>{' '}
                  <span style={{ fontSize: 13 }}>{t.title}</span>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{t.department || '—'} · {t.assigned_to_name}</div>
                </div>
                <span className={`chip ${dl < 0 ? 'down' : dl <= 2 ? 'flat' : 'up'}`}>
                  {dl < 0 ? `${Math.abs(dl)}d late` : dl === 0 ? 'today' : `in ${dl}d`}</span>
              </div>
            );
          }) : <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>No open assignments.</p>}
        </Card>

        <Card title="Upcoming meetings" extra={<Link className="eyebrow" to="/internal/meetings">View all</Link>}>
          {meetings.length ? meetings.slice(0, 6).map(m => (
            <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F2F4F8' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{m.title}</div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{m.participant_count} participants · {m.duration_min} min</div>
              </div>
              <div className="mono" style={{ fontSize: 12, textAlign: 'right' }}>{m.meeting_time}
                <div style={{ color: 'var(--muted)' }}>{shortDate(m.meeting_date)}</div></div>
            </div>
          )) : <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>Nothing scheduled.</p>}
        </Card>
      </div>
    </>
  );
}

function StatusByDept({ by_status }) {
  const STATUS_COLORS = ['#8794AB', '#2596C2', '#20B7D2', '#18B485', '#E0A21C'];
  const depts = [...new Set(by_status.map(r => r.department || 'Unassigned'))];
  if (!depts.length) return <p style={{ color: 'var(--muted)' }}>No assignments yet.</p>;
  return (
    <Bar data={{
      labels: depts,
      datasets: STATUSES.map((s, i) => ({
        label: s,
        data: depts.map(dp => by_status.filter(r => (r.department || 'Unassigned') === dp && r.status === s)
          .reduce((n, r) => n + Number(r.n), 0)),
        backgroundColor: STATUS_COLORS[i], borderRadius: 2
      }))
    }} options={noAspect({
      plugins: { legend: { position: 'bottom' } },
      scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1 } } }
    })} />
  );
}
