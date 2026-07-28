import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart, BarElement, CategoryScale, LinearScale, ArcElement, Tooltip, Legend
} from 'chart.js';
import { get } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { Stat, Card, Pill, statusTone, Loading, Empty, ErrorNote } from '../components/Bits.jsx';

Chart.register(BarElement, CategoryScale, LinearScale, ArcElement, Tooltip, Legend);

const STATUSES = ['Pending', 'In Progress', 'Under Review', 'Completed', 'On Hold'];
const STATUS_COLORS = ['#8794AB', '#2596C2', '#20B7D2', '#18B485', '#E0A21C'];

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
};

export default function InternalDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => { get('/dashboards/internal').then(setData).catch(e => setErr(e.message)); }, []);

  if (err) return <ErrorNote>{err}</ErrorNote>;
  if (!data) return <Loading />;

  const { kpi, by_status, workload, performance } = data;
  const total = Number(kpi.total) || 0;
  const done = Number(kpi.completed) || 0;
  const pct = total ? Math.round((done / total) * 100) : 0;

  // Stacked status-by-department from the flat by_status rows.
  const depts = [...new Set(by_status.map(r => r.department || 'Unassigned'))];
  const statusData = {
    labels: depts,
    datasets: STATUSES.map((s, i) => ({
      label: s,
      data: depts.map(dp =>
        by_status
          .filter(r => (r.department || 'Unassigned') === dp && r.status === s)
          .reduce((n, r) => n + Number(r.n), 0)),
      backgroundColor: STATUS_COLORS[i],
      borderRadius: 2,
      barThickness: 20
    }))
  };

  return (
    <>
      <div className="hero">
        <div className="eyebrow" style={{ color: '#B9C6E2' }}>
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
        <h3 style={{ marginTop: 4 }}>Good {greeting()}, {(user?.name || '').split(' ')[0]}</h3>
        <div style={{ color: '#B9C6E2', fontSize: 12.5 }}>
          {total - done} open · {Number(kpi.overdue) ? <span style={{ color: '#FF9B92' }}>{kpi.overdue} overdue</span> : 'nothing overdue'}
          {' · '}{Number(kpi.in_flight) || 0} in progress
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', marginBottom: 14 }}>
        <Stat cap="Total assignments" big={total} foot={`${Number(kpi.pending) || 0} pending · ${Number(kpi.in_flight) || 0} active`} />
        <Stat cap="In flight" big={Number(kpi.in_flight) || 0} foot={`${Number(kpi.pending) || 0} not started`} tone="b2" />
        <Stat cap="Completion" big={`${pct}%`} foot={`${done} of ${total} closed`} tone="b3" />
        <Stat cap="Overdue" big={Number(kpi.overdue) || 0} foot={Number(kpi.overdue) ? 'past due' : 'nothing past due'} tone={Number(kpi.overdue) ? 'b5' : 'b4'} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.4fr 1fr', marginBottom: 14 }}>
        <Card title="Status mix by department">
          {depts.length ? (
            <Bar data={statusData} options={{
              plugins: { legend: { position: 'bottom' } },
              scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1 } } }
            }} />
          ) : <p style={{ color: 'var(--muted)' }}>No assignments yet.</p>}
        </Card>
        <Card title="Progress">
          <Doughnut data={{
            labels: ['Completed', 'Remaining'],
            datasets: [{ data: [done, Math.max(0, total - done)], backgroundColor: ['#1DB5B6', '#E6EAF2'], borderWidth: 0 }]
          }} options={{ cutout: '72%', plugins: { legend: { position: 'bottom' } } }} />
        </Card>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <Card title="Workload by employee" pad={false}>
          <table className="tbl">
            <thead><tr><th>Employee</th><th>Department</th><th>Open</th><th>Overdue</th><th>Utilisation</th></tr></thead>
            <tbody>
              {workload?.length ? workload.map(w => (
                <tr key={w.user_id}>
                  <td>{w.name}</td>
                  <td style={{ fontSize: 12.5 }}>{w.department || '—'}</td>
                  <td className="mono">{w.open_tasks}</td>
                  <td className="mono" style={{ color: Number(w.overdue_tasks) ? 'var(--red)' : undefined }}>{w.overdue_tasks}</td>
                  <td className="mono">{w.utilisation_pct == null ? '—' : `${w.utilisation_pct}%`}</td>
                </tr>
              )) : <Empty cols={5}>No workload data.</Empty>}
            </tbody>
          </table>
        </Card>

        <Card title="Employee performance" extra={<Link className="eyebrow" to="/internal/assignments">All assignments</Link>} pad={false}>
          <table className="tbl">
            <thead><tr><th>Employee</th><th>Completed</th><th>Pending</th><th>Delayed</th><th>Efficiency</th></tr></thead>
            <tbody>
              {performance?.length ? performance.map(p => (
                <tr key={p.user_id}>
                  <td>{p.name}</td>
                  <td className="mono">{p.completed}</td>
                  <td className="mono">{p.pending}</td>
                  <td className="mono" style={{ color: Number(p.delayed) ? 'var(--red)' : undefined }}>{p.delayed}</td>
                  <td><Pill kind={Number(p.efficiency_pct) >= 70 ? 'p-done' : Number(p.efficiency_pct) >= 40 ? 'p-progress' : 'p-red'}>
                    {p.efficiency_pct == null ? '—' : `${p.efficiency_pct}%`}</Pill></td>
                </tr>
              )) : <Empty cols={5}>No performance data.</Empty>}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
