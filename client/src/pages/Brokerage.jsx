import { useEffect, useState } from 'react';
import { get, inr, shortDate } from '../lib/api.js';
import { Card, Pill, Loading, Empty, ErrorNote } from '../components/Bits.jsx';

export default function Brokerage() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { get('/brokerage').then(setRows).catch(e => setErr(e.message)); }, []);

  if (err) return <ErrorNote>{err}</ErrorNote>;
  if (!rows) return <Loading />;

  const total = rows.reduce((n, r) => n + Number(r.brokerage), 0);
  const turnover = rows.reduce((n, r) => n + Number(r.turnover), 0);

  return (
    <>
      <div className="eyebrow">What the coverage is producing</div>
      <h3 style={{ marginBottom: 14 }}>Volume &amp; brokerage</h3>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', marginBottom: 14 }}>
        <div className="stat"><div className="cap">Brokerage</div><div className="big">{inr(total)}</div></div>
        <div className="stat b2"><div className="cap">Turnover</div><div className="big">{inr(turnover)}</div></div>
        <div className="stat b3"><div className="cap">Blended yield</div>
          <div className="big">{turnover ? (total / turnover * 10000).toFixed(1) : '—'}<span
            style={{ fontSize: 14 }}> bps</span></div></div>
      </div>

      <Card pad={false}>
        <table className="tbl">
          <thead><tr>
            <th>Date</th><th>Month</th><th>Client</th><th>Scheme / code</th><th>Segment</th>
            <th style={{ textAlign: 'right' }}>Volume</th>
            <th style={{ textAlign: 'right' }}>Brokerage</th>
            <th style={{ textAlign: 'right' }}>Yield</th><th>Source</th>
          </tr></thead>
          <tbody>
            {rows.length ? rows.map(b => (
              <tr key={b.id}>
                <td className="mono" style={{ fontSize: 12 }}>{shortDate(b.trade_date)}</td>
                <td className="mono" style={{ fontSize: 12 }}>{b.period_month}</td>
                <td>{b.client}</td>
                <td>{b.scheme || <span style={{ color: 'var(--muted)' }}>house</span>}
                  {b.client_code && <div className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {b.client_code}</div>}</td>
                <td>{b.segment}</td>
                <td className="mono" style={{ textAlign: 'right', fontSize: 12 }}>{inr(b.turnover)}</td>
                <td className="mono" style={{ textAlign: 'right', fontSize: 12, color: 'var(--green)' }}>
                  {inr(b.brokerage)}</td>
                <td className="mono" style={{ textAlign: 'right', fontSize: 12 }}>
                  {b.yield_bps != null ? `${b.yield_bps} bps` : '—'}</td>
                <td><Pill kind={b.source === 'import' ? 'p-review' : 'p-hold'}>{b.source}</Pill></td>
              </tr>
            )) : <Empty cols={9}>Nothing booked yet.</Empty>}
          </tbody>
        </table>
      </Card>
    </>
  );
}
