import { useEffect, useMemo, useState } from 'react';
import { get, post, inr, shortDate } from '../lib/api.js';
import { Card, Pill, Loading, Empty, ErrorNote, Modal } from '../components/Bits.jsx';
import { useAuth } from '../lib/auth.jsx';

const SEGMENTS = ['Cash', 'F&O', 'Block / Bulk'];
const softGet = (p) => get(p).then(r => r || []).catch(() => []);
const todayIso = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const num = (v) => Number(v || 0);

function lastMonths(n) {
  const out = [];
  const d = new Date(); d.setDate(1);
  for (let i = n - 1; i >= 0; i--) { const x = new Date(d); x.setMonth(d.getMonth() - i); out.push(x.toISOString().slice(0, 7)); }
  return out;
}
const monthName = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
};

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  const head = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return lines.slice(1).map(line => {
    const cells = line.split(',');
    const row = {};
    head.forEach((h, i) => { row[h] = (cells[i] || '').trim(); });
    return {
      client_code: row.client_code || row.code || undefined,
      trade_date: row.trade_date || row.date || undefined,
      period_month: row.period_month || row.month || undefined,
      segment: row.segment || 'Cash',
      turnover: Number(row.turnover || row.volume || 0),
      brokerage: Number(row.brokerage || 0)
    };
  });
}

export default function Brokerage() {
  const { can } = useAuth();
  const [rows, setRows] = useState(null);
  const [clients, setClients] = useState([]);
  const [err, setErr] = useState('');
  const [entry, setEntry] = useState(null);
  const [imp, setImp] = useState(null);   // { rows, result }
  const [busy, setBusy] = useState(false);

  const load = () => get('/brokerage').then(setRows).catch(e => setErr(e.message));
  useEffect(() => { load(); softGet('/institutions').then(setClients); }, []);

  const months = lastMonths(6);
  const rmByName = useMemo(() => Object.fromEntries(clients.map(c => [c.name, c.rm])), [clients]);

  const contribution = useMemo(() => {
    if (!rows) return { names: [], data: {} };
    const names = [...new Set(rows.map(b => b.client).filter(Boolean))].sort();
    const data = {};
    names.forEach(n => {
      data[n] = { total: 0, months: {} };
      months.forEach(m => {
        const v = rows.filter(b => b.client === n && (b.period_month || '').slice(0, 7) === m).reduce((s, b) => s + num(b.brokerage), 0);
        data[n].months[m] = v; data[n].total += v;
      });
    });
    return { names, data };
  }, [rows, clients]);

  const openEntry = () => setEntry({ institution_id: '', segment: 'Cash', trade_date: todayIso(), turnover: '', brokerage: '' });
  const setE = (k, v) => setEntry(f => ({ ...f, [k]: v }));
  const saveEntry = async () => {
    if (!entry.institution_id) { setErr('Pick a client'); return; }
    if (!Number(entry.turnover) && !Number(entry.brokerage)) { setErr('Enter a turnover or brokerage figure'); return; }
    setBusy(true);
    try {
      await post('/brokerage', {
        institution_id: Number(entry.institution_id), trade_date: entry.trade_date,
        segment: entry.segment, turnover: Number(entry.turnover) || 0, brokerage: Number(entry.brokerage) || 0
      });
      setEntry(null); setErr(''); load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const onFile = (file) => {
    const reader = new FileReader();
    reader.onload = () => setImp({ rows: parseCsv(String(reader.result)), result: null });
    reader.readAsText(file);
  };
  const runImport = async () => {
    setBusy(true);
    try {
      const res = await post('/brokerage/import', { rows: imp.rows, skipDuplicates: true });
      setImp(i => ({ ...i, result: res })); load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  if (err && !rows) return <ErrorNote>{err}</ErrorNote>;
  if (!rows) return <Loading />;

  const brokTotal = rows.reduce((n, b) => n + num(b.brokerage), 0);
  const volTotal = rows.reduce((n, b) => n + num(b.turnover), 0);
  const thisM = new Date().toISOString().slice(0, 7);
  const monthTotal = rows.filter(b => (b.period_month || '').slice(0, 7) === thisM).reduce((n, b) => n + num(b.brokerage), 0);
  const kpis = [
    [inr(brokTotal), 'Brokerage total', ''],
    [inr(volTotal), 'Turnover total', 'b2'],
    [inr(monthTotal), 'This month', 'b3'],
    [new Set(rows.map(b => b.client)).size, 'Clients contributing', 'b4'],
    [volTotal ? `${((brokTotal / volTotal) * 10000).toFixed(1)} bps` : '—', 'Blended yield', 'b5']
  ];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div><div className="eyebrow">What the coverage is producing</div><h3>Volume &amp; brokerage</h3></div>
        <div style={{ display: 'flex', gap: 8 }}>
          {can('institutional.create') && <label className="btn" style={{ marginBottom: 0 }}>Import file
            <input type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={e => e.target.files[0] && onFile(e.target.files[0])} /></label>}
          {can('institutional.create') && <button className="btn primary" onClick={openEntry}>Add entry</button>}
        </div>
      </div>
      {err && <ErrorNote>{err}</ErrorNote>}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', marginBottom: 14 }}>
        {kpis.map(([v, l, tone]) => (
          <div key={l} className={`stat ${tone}`}><div className="cap">{l}</div><div className="big" style={{ fontSize: 20 }}>{v}</div></div>
        ))}
      </div>

      <Card title="Client contribution" extra={<span className="eyebrow">last six months</span>} pad={false}>
        <table className="tbl">
          <thead><tr><th>Client</th><th>RM</th>{months.map(m => <th key={m} style={{ textAlign: 'right' }}>{monthName(m)}</th>)}<th style={{ textAlign: 'right' }}>Total</th></tr></thead>
          <tbody>
            {contribution.names.length ? <>
              {contribution.names.map(n => (
                <tr key={n}>
                  <td style={{ fontWeight: 500, fontSize: 12.5 }}>{n}</td>
                  <td style={{ fontSize: 12.5 }}>{rmByName[n] || '—'}</td>
                  {months.map(m => <td key={m} className="mono" style={{ textAlign: 'right', fontSize: 12 }}>{contribution.data[n].months[m] ? inr(contribution.data[n].months[m]) : '—'}</td>)}
                  <td className="mono" style={{ textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'var(--green)' }}>{inr(contribution.data[n].total)}</td>
                </tr>
              ))}
              <tr style={{ background: '#FAFCFF' }}>
                <td colSpan={2} style={{ fontWeight: 600 }}>Total</td>
                {months.map(m => <td key={m} className="mono" style={{ textAlign: 'right', fontSize: 12, fontWeight: 600 }}>
                  {inr(rows.filter(b => (b.period_month || '').slice(0, 7) === m).reduce((s, b) => s + num(b.brokerage), 0))}</td>)}
                <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{inr(brokTotal)}</td>
              </tr>
            </> : <Empty cols={months.length + 3}>Nothing booked yet.</Empty>}
          </tbody>
        </table>
      </Card>

      <div style={{ height: 14 }} />

      <Card title="Entries" pad={false}>
        <table className="tbl">
          <thead><tr>
            <th>Date</th><th>Month</th><th>Client</th><th>Scheme / code</th><th>Segment</th>
            <th style={{ textAlign: 'right' }}>Volume</th><th style={{ textAlign: 'right' }}>Brokerage</th>
            <th style={{ textAlign: 'right' }}>Yield</th><th>Source</th>
          </tr></thead>
          <tbody>
            {rows.length ? rows.slice(0, 200).map(b => (
              <tr key={b.id}>
                <td className="mono" style={{ fontSize: 12 }}>{b.trade_date ? shortDate(b.trade_date) : '—'}</td>
                <td className="mono" style={{ fontSize: 12 }}>{b.period_month ? monthName(b.period_month.slice(0, 7)) : '—'}</td>
                <td style={{ fontSize: 12.5 }}>{b.client}</td>
                <td style={{ fontSize: 12 }}>{b.scheme || <span style={{ color: 'var(--muted)' }}>house</span>}
                  {b.client_code && <div className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{b.client_code}</div>}</td>
                <td style={{ fontSize: 12.5 }}>{b.segment}</td>
                <td className="mono" style={{ textAlign: 'right', fontSize: 12 }}>{inr(b.turnover)}</td>
                <td className="mono" style={{ textAlign: 'right', fontSize: 12, color: 'var(--green)' }}>{inr(b.brokerage)}</td>
                <td className="mono" style={{ textAlign: 'right', fontSize: 12 }}>{b.yield_bps != null ? `${b.yield_bps} bps` : '—'}</td>
                <td><Pill kind={b.source === 'import' ? 'p-review' : 'p-hold'}>{b.source}</Pill></td>
              </tr>
            )) : <Empty cols={9}>No entries yet. Add one, or import a file.</Empty>}
          </tbody>
        </table>
      </Card>

      {entry && (
        <Modal title="Add brokerage entry" saveLabel="Add" busy={busy} onClose={() => setEntry(null)} onSave={saveEntry}>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
            <div style={{ gridColumn: '1 / -1' }}><label>Client</label>
              <select value={entry.institution_id} onChange={e => setE('institution_id', e.target.value)}>
                <option value="">— pick a client —</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div><label>Segment</label><select value={entry.segment} onChange={e => setE('segment', e.target.value)}>{SEGMENTS.map(s => <option key={s}>{s}</option>)}</select></div>
            <div><label>Date</label><input type="date" value={entry.trade_date} onChange={e => setE('trade_date', e.target.value)} /></div>
            <div><label>Volume / turnover (₹)</label><input type="number" value={entry.turnover} onChange={e => setE('turnover', e.target.value)} /></div>
            <div><label>Brokerage (₹)</label><input type="number" value={entry.brokerage} onChange={e => setE('brokerage', e.target.value)} /></div>
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 0 0' }}>Figures roll up by month on the contribution grid.</p>
        </Modal>
      )}

      {imp && (
        <Modal title="Import brokerage" saveLabel={imp.result ? 'Done' : 'Import rows'} busy={busy}
          onClose={() => setImp(null)} onSave={imp.result ? () => setImp(null) : runImport}>
          {!imp.result ? (
            <>
              <p style={{ fontSize: 13 }}>
                Parsed <b>{imp.rows.length}</b> row(s). Columns recognised: client_code, trade_date / period_month, segment, turnover, brokerage.
                Duplicates are skipped automatically.
              </p>
              <div style={{ maxHeight: 220, overflow: 'auto' }}>
                <table className="tbl">
                  <thead><tr><th>Code</th><th>Date / month</th><th>Segment</th><th style={{ textAlign: 'right' }}>Turnover</th><th style={{ textAlign: 'right' }}>Brokerage</th></tr></thead>
                  <tbody>
                    {imp.rows.slice(0, 50).map((r, i) => (
                      <tr key={i}><td className="mono" style={{ fontSize: 12 }}>{r.client_code || '—'}</td>
                        <td className="mono" style={{ fontSize: 12 }}>{r.trade_date || r.period_month || '—'}</td>
                        <td style={{ fontSize: 12.5 }}>{r.segment}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{r.turnover}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{r.brokerage}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13.5 }}>
              <p><b>{imp.result.imported}</b> imported · <b>{imp.result.skipped}</b> skipped
                {imp.result.unmatched?.length ? <> · <b>{imp.result.unmatched.length}</b> unmatched</> : null}</p>
              {imp.result.unmatched?.length ? (
                <div className="err" style={{ background: '#FFF9E9', color: '#7a5b0a' }}>
                  Unmatched codes: {imp.result.unmatched.join(', ')}
                </div>
              ) : <p style={{ color: 'var(--green)' }}>All rows matched a client.</p>}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
