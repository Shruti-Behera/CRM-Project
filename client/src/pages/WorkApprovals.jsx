import { useEffect, useState } from 'react';
import { get, patch, inr, shortDate } from '../lib/api.js';
import { Card, Pill, statusTone, Loading, Empty, ErrorNote } from '../components/Bits.jsx';
import { useAuth } from '../lib/auth.jsx';

export default function WorkApprovals() {
  const { user } = useAuth();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');

  const load = () => get('/work-approvals').then(setRows).catch(e => setErr(e.message));
  // Return undefined from the effect (not load()'s Promise) — a Promise as a
  // cleanup value throws "destroy is not a function" when React unmounts.
  useEffect(() => { load(); }, []);

  const decide = async (id, status) => {
    const remarks = window.prompt(`${status} — any remarks?`) ?? '';
    try { await patch(`/work-approvals/${id}/decide`, { status, remarks }); load(); }
    catch (e) { setErr(e.message); }
  };

  if (err) return <ErrorNote>{err}</ErrorNote>;
  if (!rows) return <Loading />;

  const pending = rows.filter(r => r.status === 'Pending');

  return (
    <>
      <div className="eyebrow">Agreements, fit-outs, purchases</div>
      <h3 style={{ marginBottom: 14 }}>Work approvals</h3>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', marginBottom: 14 }}>
        <div className="stat b4"><div className="cap">Pending</div><div className="big">{pending.length}</div></div>
        <div className="stat b5"><div className="cap">On you</div>
          <div className="big">{pending.filter(r => r.approver_id === user.id).length}</div></div>
        <div className="stat b3"><div className="cap">Value pending</div>
          <div className="big" style={{ fontSize: 20 }}>
            {inr(pending.reduce((n, r) => n + Number(r.amount), 0))}</div></div>
      </div>

      <Card pad={false}>
        <table className="tbl">
          <thead><tr>
            <th>No.</th><th>What it is for</th><th>Type of work</th><th>Department</th>
            <th style={{ textAlign: 'right' }}>Amount</th><th>Raised by</th><th>Approver</th>
            <th>Needed by</th><th>Status</th><th />
          </tr></thead>
          <tbody>
            {rows.length ? rows.map(w => (
              <tr key={w.id}>
                <td className="mono" style={{ fontSize: 11.5 }}>{w.approval_no}
                  {w.attachments > 0 && <span> 📎{w.attachments}</span>}</td>
                <td>{w.title}</td>
                <td>{w.work_type}</td>
                <td>{w.department || '—'}</td>
                <td className="mono" style={{ textAlign: 'right', fontSize: 12 }}>
                  {w.amount ? inr(w.amount) : '—'}</td>
                <td>{w.raised_by_name}</td>
                <td>{w.approver_name}</td>
                <td className="mono" style={{ fontSize: 12 }}>{shortDate(w.needed_by)}</td>
                <td><Pill kind={statusTone(w.status)}>{w.status}</Pill></td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {w.status === 'Pending' && w.approver_id === user.id && (
                    <>
                      <button className="btn primary" style={{ padding: '2px 8px' }}
                        onClick={() => decide(w.id, 'Approved')}>Approve</button>{' '}
                      <button className="btn" style={{ padding: '2px 8px' }}
                        onClick={() => decide(w.id, 'Rejected')}>Reject</button>
                    </>
                  )}
                </td>
              </tr>
            )) : <Empty cols={10}>Nothing raised yet.</Empty>}
          </tbody>
        </table>
      </Card>
    </>
  );
}
