import { useEffect, useMemo, useState } from 'react';
import { get } from '../lib/api.js';
import { Card, Avatar, Loading, Empty, ErrorNote } from '../components/Bits.jsx';

const CAP = 40; // hours per week, as in the prototype
const softGet = (p) => get(p).then(r => r || []).catch(() => []);
const barColor = (pct) => pct > 100 ? 'var(--red)' : pct > 75 ? 'var(--amber)' : 'var(--green)';

export default function Workload() {
  const [tasks, setTasks] = useState(null);
  const [users, setUsers] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    get('/assignments').then(setTasks).catch(e => setErr(e.message));
    softGet('/users').then(setUsers);
  }, []);

  const rows = useMemo(() => {
    if (!tasks) return [];
    // Employee basis: all active users if available, else whoever owns work.
    const names = users.length
      ? users.filter(u => u.status === 'Active').map(u => ({ name: u.name, dept: u.department || '—' }))
      : [...new Set(tasks.map(t => t.assigned_to_name).filter(Boolean))]
          .map(n => ({ name: n, dept: (tasks.find(t => t.assigned_to_name === n) || {}).department || '—' }));

    return names.map(({ name, dept }) => {
      const mine = tasks.filter(t => t.assigned_to_name === name);
      const open = mine.filter(t => t.status !== 'Completed');
      return {
        name, dept,
        total: mine.length,
        open: open.length,
        late: mine.filter(t => t.is_overdue).length,
        crit: open.filter(t => ['High', 'Critical'].includes(t.priority)).length,
        est: open.reduce((n, t) => n + Number(t.estimated_hours || 0), 0),
        logged: mine.reduce((n, t) => n + Number(t.actual_hours || 0), 0)
      };
    }).sort((a, b) => b.est - a.est);
  }, [tasks, users]);

  if (err) return <ErrorNote>{err}</ErrorNote>;
  if (!tasks) return <Loading />;

  return (
    <>
      <div className="eyebrow">Open effort by person, against a 40-hour week</div>
      <h3 style={{ marginBottom: 14 }}>Workload</h3>

      <Card title="Capacity" extra={<span className="eyebrow">Open estimated hours vs {CAP}h</span>}>
        {rows.length ? rows.map(r => {
          const pct = Math.min(150, Math.round((r.est / CAP) * 100));
          return (
            <div key={r.name} className="bar-row">
              <Avatar name={r.name} />
              <span style={{ fontSize: 12.5, width: 140, flex: 'none' }}>{r.name}
                <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{r.dept}</div></span>
              <span className="bar-track"><i style={{ width: `${Math.min(100, pct)}%`, background: barColor(pct) }} /></span>
              <span className="mono" style={{ fontSize: 11.5, width: 96, textAlign: 'right' }}>{r.est}h · {pct}%</span>
            </div>
          );
        }) : <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>No active users.</p>}
      </Card>

      <div style={{ height: 14 }} />

      <Card pad={false}>
        <table className="tbl">
          <thead><tr>
            <th>Employee</th><th>Department</th>
            <th style={{ textAlign: 'right' }}>Total</th><th style={{ textAlign: 'right' }}>Open</th>
            <th style={{ textAlign: 'right' }}>Overdue</th><th style={{ textAlign: 'right' }}>High / critical</th>
            <th style={{ textAlign: 'right' }}>Open effort</th><th style={{ textAlign: 'right' }}>Logged</th>
            <th>Utilisation</th>
          </tr></thead>
          <tbody>
            {rows.length ? rows.map(r => {
              const pct = Math.round((r.est / CAP) * 100);
              return (
                <tr key={r.name}>
                  <td><Avatar name={r.name} /> <span style={{ fontSize: 13 }}>{r.name}</span></td>
                  <td style={{ fontSize: 12.5 }}>{r.dept}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{r.total}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{r.open}</td>
                  <td className="mono" style={{ textAlign: 'right', color: r.late ? 'var(--red)' : undefined, fontWeight: r.late ? 600 : 400 }}>{r.late}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{r.crit}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{r.est}h</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{r.logged}h</td>
                  <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className="prog"><i style={{ width: `${Math.min(100, pct)}%`, background: barColor(pct) }} /></div>
                    <span className="mono" style={{ fontSize: 11 }}>{pct}%</span></div></td>
                </tr>
              );
            }) : <Empty cols={9}>No users to show.</Empty>}
          </tbody>
        </table>
      </Card>
    </>
  );
}
