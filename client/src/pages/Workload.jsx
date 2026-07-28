import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { get, shortDate } from '../lib/api.js';
import { Card, Pill, pClass, Loading, Empty, ErrorNote } from '../components/Bits.jsx';

const utilTone = (v) => v == null ? 'p-hold' : v > 100 ? 'p-red' : v >= 75 ? 'p-pending' : 'p-done';

export default function Workload() {
  const [workload, setWorkload] = useState(null);
  const [sla, setSla] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    get('/assignments/reports/workload').then(setWorkload).catch(e => setErr(e.message));
    get('/assignments/reports/sla').then(setSla).catch(e => setErr(e.message));
  }, []);

  if (err) return <ErrorNote>{err}</ErrorNote>;
  if (!workload || !sla) return <Loading />;

  return (
    <>
      <div className="eyebrow">Capacity &amp; delivery</div>
      <h3 style={{ marginBottom: 14 }}>Workload &amp; SLA</h3>

      <Card title="Workload by employee" extra={<span className="eyebrow">{workload.length} people</span>} pad={false}>
        <table className="tbl">
          <thead><tr>
            <th>Employee</th><th>Department</th>
            <th style={{ textAlign: 'right' }}>Open</th><th style={{ textAlign: 'right' }}>Overdue</th>
            <th style={{ textAlign: 'right' }}>Open hours</th><th style={{ textAlign: 'right' }}>Capacity</th>
            <th>Utilisation</th>
          </tr></thead>
          <tbody>
            {workload.length ? workload.map(w => (
              <tr key={w.user_id}>
                <td style={{ fontWeight: 500 }}>{w.name}</td>
                <td style={{ fontSize: 12.5 }}>{w.department || '—'}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{w.open_tasks}</td>
                <td className="mono" style={{ textAlign: 'right', color: Number(w.overdue_tasks) ? 'var(--red)' : undefined }}>{w.overdue_tasks}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{Number(w.open_hours)}h</td>
                <td className="mono" style={{ textAlign: 'right' }}>{Number(w.weekly_capacity_hours)}h</td>
                <td><Pill kind={utilTone(w.utilisation_pct == null ? null : Number(w.utilisation_pct))}>
                  {w.utilisation_pct == null ? '—' : `${w.utilisation_pct}%`}</Pill></td>
              </tr>
            )) : <Empty cols={7}>No active employees.</Empty>}
          </tbody>
        </table>
      </Card>

      <div style={{ height: 14 }} />

      <Card title="SLA breaches" extra={<span className="eyebrow">{sla.length} over SLA</span>} pad={false}>
        <table className="tbl">
          <thead><tr>
            <th>No.</th><th>Title</th><th>Owner</th><th>Department</th><th>Due</th>
            <th style={{ textAlign: 'right' }}>Days over</th><th>Priority</th><th>Status</th>
          </tr></thead>
          <tbody>
            {sla.length ? sla.map(s => (
              <tr key={s.id}>
                <td><Link to={`/internal/assignments/${s.id}`} className="mono" style={{ fontSize: 11.5, fontWeight: 600 }}>{s.assignment_no}</Link></td>
                <td>{s.title}</td>
                <td style={{ fontSize: 12.5 }}>{s.owner}</td>
                <td style={{ fontSize: 12.5 }}>{s.department || '—'}</td>
                <td className="mono" style={{ fontSize: 12 }}>{shortDate(s.due_date)}</td>
                <td className="mono" style={{ textAlign: 'right', color: 'var(--red)', fontWeight: 600 }}>{s.days_over_sla}d</td>
                <td><Pill kind={pClass(s.priority)}>{s.priority}</Pill></td>
                <td>{s.status}</td>
              </tr>
            )) : <Empty cols={8}>Nothing is past its SLA. </Empty>}
          </tbody>
        </table>
      </Card>
    </>
  );
}
