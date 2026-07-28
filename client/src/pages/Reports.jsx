import { useEffect, useMemo, useState } from 'react';
import { get, post, patch, shortDate } from '../lib/api.js';
import { Card, Pill, Loading, Empty, ErrorNote, Modal } from '../components/Bits.jsx';
import { useAuth } from '../lib/auth.jsx';

const REPORT_TYPES = ['Sector report', 'Stock initiation', 'Stock update', 'Result update', 'Event update', 'Thematic', 'Model portfolio', 'Morning note'];
const RECOS = ['Buy', 'Accumulate', 'Hold', 'Reduce', 'Sell', 'Not rated'];
const softGet = (p) => get(p).then(r => r || []).catch(() => []);
const todayIso = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const recoTone = (r) => /Buy|Accum/.test(r) ? 'p-done' : /Sell|Reduce/.test(r) ? 'p-red' : 'p-hold';

function toCsv(rows) {
  const cols = ['report_no', 'title', 'report_type', 'sector', 'symbol', 'recommendation', 'target_price', 'upside_pct', 'analyst', 'report_date', 'status'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
}

export default function Reports() {
  const { can } = useAuth();
  const [rows, setRows] = useState(null);
  const [sectors, setSectors] = useState([]);
  const [users, setUsers] = useState([]);
  const [err, setErr] = useState('');
  const [f, setF] = useState({ q: '', type: '', sector: '', analyst: '', reco: '' });
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => get('/research-reports').then(setRows).catch(e => setErr(e.message));
  useEffect(() => { load(); softGet('/masters/sectors').then(setSectors); softGet('/users').then(setUsers); }, []);

  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const clear = () => setF({ q: '', type: '', sector: '', analyst: '', reco: '' });

  const sectorOptions = useMemo(() => [...new Set((rows || []).map(r => r.sector).filter(Boolean))].sort(), [rows]);
  const analystOptions = useMemo(() => [...new Set((rows || []).map(r => r.analyst).filter(Boolean))].sort(), [rows]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = f.q.toLowerCase();
    return rows.filter(r =>
      (!f.type || r.report_type === f.type) &&
      (!f.sector || r.sector === f.sector) &&
      (!f.analyst || r.analyst === f.analyst) &&
      (!f.reco || r.recommendation === f.reco) &&
      (!q || `${r.title} ${r.report_no} ${r.symbol || ''} ${r.sector || ''}`.toLowerCase().includes(q)));
  }, [rows, f]);

  const openNew = () => setForm({
    title: '', report_type: 'Stock update', sector_id: '', symbol: '', analyst_id: '',
    recommendation: 'Not rated', cmp: '', target_price: '', report_date: todayIso(), summary: '', status: 'Draft'
  });
  const setR = (k, v) => setForm(x => ({ ...x, [k]: v }));
  const save = async () => {
    if (!form.title.trim()) { setErr('Give the report a title'); return; }
    setBusy(true);
    try {
      await post('/research-reports', {
        title: form.title, report_type: form.report_type,
        sector_id: form.sector_id ? Number(form.sector_id) : undefined,
        symbol: form.symbol || undefined, analyst_id: form.analyst_id ? Number(form.analyst_id) : undefined,
        recommendation: form.recommendation, cmp: Number(form.cmp) || 0, target_price: Number(form.target_price) || 0,
        report_date: form.report_date, summary: form.summary || undefined, status: form.status
      });
      setForm(null); setErr(''); load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };
  const togglePublish = async (r) => {
    try { await patch(`/research-reports/${r.id}`, { status: r.status === 'Published' ? 'Draft' : 'Published' }); load(); }
    catch (e) { setErr(e.message); }
  };
  const exportCsv = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([toCsv(filtered)], { type: 'text/csv' }));
    a.download = 'research-reports.csv'; a.click(); URL.revokeObjectURL(a.href);
  };

  if (err && !rows) return <ErrorNote>{err}</ErrorNote>;
  if (!rows) return <Loading />;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div><div className="eyebrow">Sector and stock work published to clients</div><h3>Research reports</h3></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={exportCsv} disabled={!filtered.length}>Excel</button>
          {can('research.create') && <button className="btn primary" onClick={openNew}>New report</button>}
        </div>
      </div>
      {err && <ErrorNote>{err}</ErrorNote>}

      <Card>
        <div className="filters">
          <div><label>Search</label><input placeholder="Title, no. or stock" value={f.q} onChange={e => set('q', e.target.value)} /></div>
          <div><label>Type</label><select value={f.type} onChange={e => set('type', e.target.value)}><option value="">All</option>{REPORT_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
          <div><label>Sector</label><select value={f.sector} onChange={e => set('sector', e.target.value)}><option value="">All</option>{sectorOptions.map(t => <option key={t}>{t}</option>)}</select></div>
          <div><label>Analyst</label><select value={f.analyst} onChange={e => set('analyst', e.target.value)}><option value="">All</option>{analystOptions.map(t => <option key={t}>{t}</option>)}</select></div>
          <div><label>Recommendation</label><select value={f.reco} onChange={e => set('reco', e.target.value)}><option value="">All</option>{RECOS.map(t => <option key={t}>{t}</option>)}</select></div>
          <div><label>&nbsp;</label><button className="btn" style={{ width: '100%' }} onClick={clear}>Clear</button></div>
        </div>
      </Card>

      <div style={{ height: 14 }} />

      <Card pad={false}>
        <table className="tbl">
          <thead><tr>
            <th>No.</th><th>Title</th><th>Type</th><th>Sector</th><th>Stock</th><th>Reco</th>
            <th style={{ textAlign: 'right' }}>TP</th><th style={{ textAlign: 'right' }}>Upside</th><th>Analyst</th><th>Date</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th>
          </tr></thead>
          <tbody>
            {filtered.length ? filtered.map(r => {
              const up = r.upside_pct != null ? Number(r.upside_pct) : null;
              return (
                <tr key={r.id}>
                  <td className="mono" style={{ fontSize: 11.5, fontWeight: 600 }}>{r.report_no}</td>
                  <td style={{ maxWidth: 260, fontWeight: 500 }}>{r.title}</td>
                  <td style={{ fontSize: 12.5 }}>{r.report_type}</td>
                  <td style={{ fontSize: 12.5 }}>{r.sector || '—'}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{r.symbol || '—'}</td>
                  <td>{r.recommendation ? <Pill kind={recoTone(r.recommendation)}>{r.recommendation}</Pill> : '—'}</td>
                  <td className="mono" style={{ textAlign: 'right', fontSize: 12 }}>{Number(r.target_price) ? `₹${Number(r.target_price)}` : '—'}</td>
                  <td className="mono" style={{ textAlign: 'right', fontSize: 12, color: up > 0 ? 'var(--green)' : up < 0 ? 'var(--red)' : 'inherit' }}>{up == null ? '—' : `${up}%`}</td>
                  <td style={{ fontSize: 12.5 }}>{r.analyst}</td>
                  <td className="mono" style={{ fontSize: 11.5 }}>{shortDate(r.report_date)}</td>
                  <td><Pill kind={r.status === 'Published' ? 'p-done' : 'p-pending'}>{r.status}</Pill></td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {can('research.edit') && <button className="btn" style={{ padding: '2px 8px' }} onClick={() => togglePublish(r)}>{r.status === 'Published' ? 'Unpublish' : 'Publish'}</button>}
                  </td>
                </tr>
              );
            }) : <Empty cols={12}>No reports match.</Empty>}
          </tbody>
        </table>
        <div className="eyebrow" style={{ padding: '10px 15px' }}>{filtered.length} of {rows.length} reports</div>
      </Card>

      {form && (
        <Modal title="New research report" saveLabel="Save report" busy={busy} onClose={() => setForm(null)} onSave={save}>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
            <div style={{ gridColumn: '1 / -1' }}><label>Title</label><input value={form.title} onChange={e => setR('title', e.target.value)} /></div>
            <div><label>Type</label><select value={form.report_type} onChange={e => setR('report_type', e.target.value)}>{REPORT_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
            <div><label>Sector</label><select value={form.sector_id} onChange={e => setR('sector_id', e.target.value)}><option value="">None</option>{sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div><label>Stock / ticker</label><input value={form.symbol} onChange={e => setR('symbol', e.target.value)} /></div>
            <div><label>Analyst</label><select value={form.analyst_id} onChange={e => setR('analyst_id', e.target.value)}><option value="">Me</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
            <div><label>Recommendation</label><select value={form.recommendation} onChange={e => setR('recommendation', e.target.value)}>{RECOS.map(r => <option key={r}>{r}</option>)}</select></div>
            <div><label>Report date</label><input type="date" value={form.report_date} onChange={e => setR('report_date', e.target.value)} /></div>
            <div><label>CMP (₹)</label><input type="number" value={form.cmp} onChange={e => setR('cmp', e.target.value)} /></div>
            <div><label>Target price (₹)</label><input type="number" value={form.target_price} onChange={e => setR('target_price', e.target.value)} /></div>
            <div><label>Status</label><select value={form.status} onChange={e => setR('status', e.target.value)}><option>Draft</option><option>Published</option></select></div>
            <div style={{ gridColumn: '1 / -1' }}><label>Idea in brief</label><textarea rows={3} value={form.summary} onChange={e => setR('summary', e.target.value)} /></div>
          </div>
        </Modal>
      )}
    </>
  );
}
