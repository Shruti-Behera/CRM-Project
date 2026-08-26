import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, lakh, crore, shortDate } from '../lib/api.js';
import { Card, Pill, Loading, Empty, ErrorNote } from '../components/Bits.jsx';
import { Kpi } from './Mandates.jsx';

const CLOSED = ['Executed', 'Terminated'];
const num = (v) => Number(v || 0);
const sum = (arr, f) => arr.reduce((n, x) => n + num(f(x)), 0);
const days = (a, b) => (a && b) ? Math.max(0, Math.round((new Date(b) - new Date(a)) / 86400000)) : 0;

export default function ClosedProjects() {
  const nav = useNavigate();
  const [mandates, setMandates] = useState(null);
  const [projects, setProjects] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    get('/mandates').then(r => setMandates((r || []).filter(m => CLOSED.includes(m.status)))).catch(e => setErr(e.message));
    get('/banking/closed-projects').then(r => setProjects(r || [])).catch(() => setProjects([]));
  }, []);

  const kpis = useMemo(() => {
    const m = mandates || [];
    return [
      { v: m.filter(x => x.status === 'Executed').length, l: 'Executed', t: 'g' },
      { v: m.filter(x => x.status === 'Terminated').length, l: 'Terminated', t: 'r' },
      { v: lakh(sum(m, x => x.realised_fee_l)), l: 'Fee realised', t: 'b' },
      { v: lakh(sum(m, x => x.estimated_fee_l) - sum(m, x => x.realised_fee_l)), l: 'Written off', t: 'a' },
      { v: crore(sum(m, x => x.txn_value_cr)), l: 'Transaction value', t: 'o' },
      { v: projects.length, l: 'Internal projects' }
    ];
  }, [mandates, projects]);

  if (err && !mandates) return <ErrorNote>{err}</ErrorNote>;
  if (!mandates) return <Loading />;

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <div className="eyebrow">Execution</div>
        <h3>Closed projects</h3>
        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '2px 0 0' }}>Completed mandates and finished internal projects</p>
      </div>
      {err && <ErrorNote>{err}</ErrorNote>}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', marginBottom: 14 }}>
        {kpis.map((k, i) => <Kpi key={i} {...k} />)}
      </div>

      <Card title={<>Closed mandates <span className="eyebrow" style={{ marginLeft: 6 }}>{mandates.length} total</span></>} pad={false}>
        <table className="tbl">
          <thead><tr>
            <th>No.</th><th>Account</th><th>Type</th><th>Signed</th><th>Closed</th><th>Duration</th>
            <th>Est. fee</th><th>Realised</th><th>Realisation</th><th>From</th><th>Status</th>
          </tr></thead>
          <tbody>
            {mandates.length ? mandates.map(x => {
              const pct = num(x.estimated_fee_l) ? Math.round(100 * num(x.realised_fee_l) / num(x.estimated_fee_l)) : 0;
              return (
                <tr key={x.id} style={{ cursor: 'pointer' }} onClick={() => nav(`/banking/mandates/${x.id}`)}>
                  <td><span className="tid">{x.mandate_no}</span></td>
                  <td style={{ fontSize: 12.5 }}>{x.account}</td>
                  <td style={{ fontSize: 12.5 }}>{x.deal_type}</td>
                  <td className="mono" style={{ fontSize: 11.5 }}>{shortDate(x.signed_on)}</td>
                  <td className="mono" style={{ fontSize: 11.5 }}>{shortDate(x.closed_on || x.expected_end)}</td>
                  <td className="mono" style={{ fontSize: 11.5 }}>{days(x.signed_on, x.closed_on || x.expected_end)}d</td>
                  <td className="mono" style={{ fontSize: 12 }}>{lakh(x.estimated_fee_l)}</td>
                  <td className="mono" style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>{lakh(x.realised_fee_l)}</td>
                  <td style={{ minWidth: 110 }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className="prog"><i style={{ width: `${Math.min(100, pct)}%`, background: pct >= 100 ? 'var(--green)' : pct >= 60 ? 'var(--teal)' : 'var(--amber)' }} /></div>
                    <span className="mono" style={{ fontSize: 11 }}>{pct}%</span></div></td>
                  <td>{x.opportunity_no ? <span className="tid">{x.opportunity_no}</span> : '—'}</td>
                  <td><Pill kind={x.status === 'Executed' ? 'p-done' : 'p-red'}>{x.status}</Pill></td>
                </tr>
              );
            }) : <Empty cols={11}>Nothing closed yet. Mandates arrive here when you close them.</Empty>}
          </tbody>
        </table>
      </Card>

      <div style={{ height: 14 }} />

      <Card title={<>Closed internal projects <span className="eyebrow" style={{ marginLeft: 6 }}>{projects.length} total</span></>} pad={false}>
        <table className="tbl">
          <thead><tr>
            <th>Code</th><th>Project</th><th>Department</th><th>Owner</th><th>Closed</th>
            <th>Assignments</th><th>Completed</th><th>Hours logged</th>
          </tr></thead>
          <tbody>
            {projects.length ? projects.map((x, i) => (
              <tr key={i}>
                <td className="mono" style={{ fontSize: 12 }}>{x.code || '—'}</td>
                <td style={{ fontWeight: 500 }}>{x.name}</td>
                <td style={{ fontSize: 12.5 }}>{x.department || '—'}</td>
                <td style={{ fontSize: 12.5 }}>{x.owner || '—'}</td>
                <td className="mono" style={{ fontSize: 11.5 }}>{x.closed_on ? shortDate(x.closed_on) : '—'}</td>
                <td className="mono">{x.assignments}</td>
                <td className="mono">{x.completed}</td>
                <td className="mono">{num(x.hours)}h</td>
              </tr>
            )) : <Empty cols={8}>No closed projects. Close one from Masters → Projects.</Empty>}
          </tbody>
        </table>
      </Card>
    </>
  );
}
