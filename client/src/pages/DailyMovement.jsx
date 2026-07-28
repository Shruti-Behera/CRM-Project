import { useEffect, useMemo, useRef, useState } from 'react';
import { get, post, put, shortDate } from '../lib/api.js';
import { Card, Pill, Avatar, Loading, Empty, ErrorNote, Modal } from '../components/Bits.jsx';
import { useAuth } from '../lib/auth.jsx';
import { dictate, speechSupported } from '../lib/voice.js';

const VISIT_TYPES = ['Client visit', 'Office meeting', 'Call', 'Video call', 'Conference', 'Roadshow', 'Analyst day'];
const INTEREST = ['High', 'Medium', 'Low'];

function toCsv(rows) {
  const cols = ['visit_date', 'client', 'visit_type', 'met_person', 'logged_by_name', 'stocks', 'outcome', 'follow_up_on'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
}
const softGet = (p) => get(p).then(r => r || []).catch(() => []);
const todayIso = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const ymd = (s) => (s || '').slice(0, 10);

export default function DailyMovement() {
  const { can } = useAuth();
  const [rows, setRows] = useState(null);
  const [clients, setClients] = useState([]);
  const [err, setErr] = useState('');
  const [f, setF] = useState({ q: '', by: '', type: '', from: '', to: '' });
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);

  const load = () => get('/institutions/visits/all').then(setRows).catch(e => setErr(e.message));
  useEffect(() => { load(); softGet('/institutions').then(setClients); }, []);

  const stopVoice = () => { try { recRef.current?.stop(); } catch { /* noop */ } recRef.current = null; setListening(false); };
  const startVoice = () => {
    setListening(true);
    recRef.current = dictate(
      (text) => setForm(v => v ? { ...v, agenda: text } : v),
      (final, error) => { setListening(false); if (error === 'unsupported') setErr('Voice input needs Chrome or Edge'); }
    );
  };
  const exportCsv = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([toCsv(filtered)], { type: 'text/csv' }));
    a.download = 'daily-movement.csv';
    a.click(); URL.revokeObjectURL(a.href);
  };

  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const clear = () => setF({ q: '', by: '', type: '', from: '', to: '' });

  const people = useMemo(() => [...new Set((rows || []).map(v => v.logged_by_name).filter(Boolean))].sort(), [rows]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = f.q.toLowerCase();
    return rows.filter(v =>
      (!f.by || v.logged_by_name === f.by) &&
      (!f.type || v.visit_type === f.type) &&
      (!f.from || ymd(v.visit_date) >= f.from) &&
      (!f.to || ymd(v.visit_date) <= f.to) &&
      (!q || `${v.client} ${v.agenda || ''} ${v.outcome || ''} ${v.stocks || ''}`.toLowerCase().includes(q)));
  }, [rows, f]);

  const openLog = () => setForm({
    id: null, institution_id: '', visit_date: todayIso(), visit_type: 'Client visit', met_person: '',
    city: '', stocks: '', agenda: '', outcome: '', follow_up_on: '', interest: 'Medium'
  });
  const openEdit = (v) => setForm({
    id: v.id, institution_id: v.institution_id, visit_date: ymd(v.visit_date), visit_type: v.visit_type,
    met_person: v.met_person || '', city: v.city || '', stocks: v.stocks || '',
    agenda: v.agenda || '', outcome: v.outcome || '',
    follow_up_on: v.follow_up_on ? ymd(v.follow_up_on) : '', interest: v.interest || 'Medium'
  });
  const setFo = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const save = async () => {
    if (!form.institution_id) { setErr('Pick a client'); return; }
    setBusy(true);
    try {
      const body = {
        visit_date: form.visit_date, visit_type: form.visit_type,
        met_person: form.met_person || undefined, city: form.city || undefined,
        agenda: form.agenda || undefined, outcome: form.outcome || undefined,
        follow_up_on: form.follow_up_on || undefined, interest: form.interest,
        source: 'typed',
        stocks: form.stocks.split(',').map(x => x.trim()).filter(Boolean)
      };
      if (form.id) await put(`/institutions/visits/${form.id}`, body);
      else await post(`/institutions/${form.institution_id}/visits`, body);
      setForm(null); setErr(''); load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  if (err && !rows) return <ErrorNote>{err}</ErrorNote>;
  if (!rows) return <Loading />;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div><div className="eyebrow">Client interactions logged by the desk</div><h3>Daily movement</h3></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={exportCsv} disabled={!filtered.length}>Excel</button>
          {can('institutional.create') && <button className="btn teal" onClick={() => { openLog(); setTimeout(startVoice, 60); }}>🎤 Speak an update</button>}
          {can('institutional.create') && <button className="btn primary" onClick={openLog}>Log interaction</button>}
        </div>
      </div>
      {err && <ErrorNote>{err}</ErrorNote>}

      <Card>
        <div className="filters">
          <div><label>Search</label><input placeholder="Client, idea or stock" value={f.q} onChange={e => set('q', e.target.value)} /></div>
          <div><label>Person</label>
            <select value={f.by} onChange={e => set('by', e.target.value)}>
              <option value="">All</option>{people.map(n => <option key={n}>{n}</option>)}</select></div>
          <div><label>Type</label>
            <select value={f.type} onChange={e => set('type', e.target.value)}>
              <option value="">All</option>{VISIT_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
          <div><label>From</label><input type="date" value={f.from} onChange={e => set('from', e.target.value)} /></div>
          <div><label>To</label><input type="date" value={f.to} onChange={e => set('to', e.target.value)} /></div>
          <div><label>&nbsp;</label><button className="btn" style={{ width: '100%' }} onClick={clear}>Clear</button></div>
        </div>
      </Card>

      <div style={{ height: 14 }} />

      <Card pad={false}>
        <table className="tbl">
          <thead><tr>
            <th>Date</th><th>Client</th><th>Type</th><th>Met</th><th>By</th><th>Ideas / stocks</th><th>Outcome</th><th>Follow-up</th><th style={{ textAlign: 'right' }}>Actions</th>
          </tr></thead>
          <tbody>
            {filtered.length ? filtered.map(v => (
              <tr key={v.id}>
                <td className="mono" style={{ fontSize: 12 }}>{shortDate(v.visit_date)}</td>
                <td style={{ fontSize: 12.5 }}>{v.client}</td>
                <td><Pill kind="p-progress">{v.visit_type}</Pill></td>
                <td style={{ fontSize: 12.5 }}>{v.met_person || '—'}</td>
                <td><Avatar name={v.logged_by_name} size={22} /></td>
                <td style={{ fontSize: 12, maxWidth: 200 }}>
                  {v.stocks ? v.stocks.split(',').filter(Boolean).map(sx => <span key={sx} className="tag">{sx}</span>)
                    : (v.agenda || '').slice(0, 50)}
                </td>
                <td style={{ fontSize: 12.5, maxWidth: 220 }}>{v.outcome || '—'}</td>
                <td>{v.follow_up_on
                  ? <span className={`chip ${ymd(v.follow_up_on) < todayIso() ? 'down' : 'flat'}`}>{shortDate(v.follow_up_on)}</span> : '—'}</td>
                <td style={{ textAlign: 'right' }}>
                  {can('institutional.edit') && <button className="btn" style={{ padding: '2px 8px' }} onClick={() => openEdit(v)}>Edit</button>}
                </td>
              </tr>
            )) : <Empty cols={9}>Nothing logged for this filter.</Empty>}
          </tbody>
        </table>
        <div className="eyebrow" style={{ padding: '10px 15px' }}>{filtered.length} interaction{filtered.length === 1 ? '' : 's'}</div>
      </Card>

      {form && (
        <Modal title={form.id ? 'Edit interaction' : 'Log interaction'} saveLabel={form.id ? 'Save' : 'Log it'} busy={busy} onClose={() => { stopVoice(); setForm(null); }} onSave={save}>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
            <div><label>Date</label><input type="date" value={form.visit_date} onChange={e => setFo('visit_date', e.target.value)} /></div>
            <div><label>Type</label>
              <select value={form.visit_type} onChange={e => setFo('visit_type', e.target.value)}>
                {VISIT_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
            <div style={{ gridColumn: '1 / -1' }}><label>Client</label>
              <select value={form.institution_id} disabled={!!form.id} onChange={e => setFo('institution_id', e.target.value)}>
                <option value="">— pick a client —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
            <div><label>Who we met</label><input value={form.met_person} onChange={e => setFo('met_person', e.target.value)} /></div>
            <div><label>City</label><input value={form.city} onChange={e => setFo('city', e.target.value)} /></div>
            <div style={{ gridColumn: '1 / -1' }}><label>Stocks discussed (comma separated)</label>
              <input value={form.stocks} onChange={e => setFo('stocks', e.target.value)} /></div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Ideas discussed</span>
                {speechSupported()
                  ? <button type="button" className="btn" style={{ padding: '0 8px' }} onClick={listening ? stopVoice : startVoice}>{listening ? '■ Stop' : '🎤 Dictate'}</button>
                  : <span className="eyebrow" style={{ color: 'var(--muted)' }}>voice: Chrome / Edge</span>}
              </label>
              <textarea rows={2} value={form.agenda} onChange={e => setFo('agenda', e.target.value)} /></div>
            <div style={{ gridColumn: '1 / -1' }}><label>Outcome</label>
              <textarea rows={2} value={form.outcome} onChange={e => setFo('outcome', e.target.value)} /></div>
            <div><label>Follow-up by</label><input type="date" value={form.follow_up_on} onChange={e => setFo('follow_up_on', e.target.value)} /></div>
            <div><label>Client's interest</label>
              <select value={form.interest} onChange={e => setFo('interest', e.target.value)}>
                {INTEREST.map(i => <option key={i}>{i}</option>)}</select></div>
          </div>
        </Modal>
      )}
    </>
  );
}
