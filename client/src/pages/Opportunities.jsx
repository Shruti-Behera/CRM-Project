import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { get, lakh, crore, shortDate } from '../lib/api.js';
import { Card, Pill, stageTone, Loading, Empty, ErrorNote } from '../components/Bits.jsx';

export default function Opportunities() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [openOnly, setOpenOnly] = useState(true);

  const load = () => {
    const params = new URLSearchParams();
    if (openOnly) params.set('open', '1');
    if (q) params.set('q', q);
    get(`/opportunities?${params}`).then(setRows).catch(e => setErr(e.message));
  };
  useEffect(load, [openOnly]);

  if (err) return <ErrorNote>{err}</ErrorNote>;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div><div className="eyebrow">Origination pipeline</div><h3>Opportunities</h3></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input placeholder="Search…" value={q} style={{ width: 220 }}
            onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()} />
          <button className="btn" onClick={() => setOpenOnly(o => !o)}>
            {openOnly ? 'Showing live' : 'Showing all'}
          </button>
        </div>
      </div>

      <Card pad={false}>
        {!rows ? <Loading /> : (
          <table className="tbl">
            <thead><tr>
              <th>No.</th><th>Account</th><th>Deal type</th><th>Stage</th>
              <th>Size</th><th>Fee</th><th>Weighted</th><th>Close</th><th>Assigned to</th>
            </tr></thead>
            <tbody>
              {rows.length ? rows.map(o => (
                <tr key={o.id}>
                  <td><Link to={`/banking/opportunities/${o.id}`} className="mono"
                        style={{ fontSize: 11.5, fontWeight: 600 }}>{o.opportunity_no}</Link>
                      {o.attachments > 0 && <span title={`${o.attachments} attachment(s)`}> 📎{o.attachments}</span>}</td>
                  <td>{o.account}
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{o.division || '—'}</div></td>
                  <td>{o.deal_type}</td>
                  <td><Pill kind={stageTone(o.stage)}>{o.stage}</Pill></td>
                  <td className="mono" style={{ fontSize: 12 }}>{o.txn_size_cr ? crore(o.txn_size_cr) : '—'}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{lakh(o.expected_fee_l)}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{lakh(o.weighted_fee_l)}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{shortDate(o.expected_close)}</td>
                  <td>{o.owner}{o.team && <div style={{ fontSize: 11, color: 'var(--muted)' }}>+ {o.team}</div>}</td>
                </tr>
              )) : <Empty cols={9}>No opportunities match.</Empty>}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
