import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { get, post } from '../lib/api.js';
import { Card, Pill, Loading, Empty, ErrorNote, Modal } from '../components/Bits.jsx';

const softGet = (p) => get(p).then(r => r || []).catch(() => []);

export default function Emails() {
  const [rows, setRows] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [err, setErr] = useState('');
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => get('/emails').then(setRows).catch(e => setErr(e.message));
  useEffect(() => { load(); softGet('/assignments').then(setTasks); }, []);

  const openCompose = () => setForm({ to: '', cc: '', subject: '', body: '', assignment_id: '' });
  const setFo = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const send = async () => {
    if (!form.to.trim()) { setErr('Add a recipient'); return; }
    setBusy(true);
    try {
      await post('/emails', {
        to: form.to, cc: form.cc || undefined,
        subject: form.subject || undefined, body: form.body || undefined,
        assignment_id: form.assignment_id ? Number(form.assignment_id) : undefined
      });
      setForm(null); setErr(''); load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  if (err && !rows) return <ErrorNote>{err}</ErrorNote>;
  if (!rows) return <Loading />;

  const statusTone = (e) => e.status === 'Failed' ? 'p-red' : e.direction === 'in' ? 'p-review' : 'p-done';

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div><div className="eyebrow">Sent from assignments, opportunities and mandates</div><h3>Emails</h3></div>
        <button className="btn primary" onClick={openCompose}>Send email</button>
      </div>
      {err && <ErrorNote>{err}</ErrorNote>}

      <Card pad={false}>
        <table className="tbl">
          <thead><tr>
            <th>Date</th><th></th><th>From</th><th>To</th><th>Subject</th><th>Thread</th><th>Linked to</th><th>Status</th>
          </tr></thead>
          <tbody>
            {rows.length ? rows.map(e => (
              <tr key={e.id}>
                <td className="mono" style={{ fontSize: 12 }}>{e.sent_at ? e.sent_at.replace('T', ' ') : '—'}</td>
                <td><Pill kind={e.direction === 'in' ? 'p-review' : 'p-progress'}>{e.direction === 'in' ? 'In' : 'Out'}</Pill></td>
                <td style={{ fontSize: 12.5 }}>{e.from_address}</td>
                <td style={{ fontSize: 12.5 }}>{e.to_addresses}</td>
                <td style={{ fontSize: 12.5 }}>{e.subject}</td>
                <td className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{(e.thread_key || '').slice(0, 26)}</td>
                <td>{e.linked_no
                  ? <Link to={`/internal/assignments/${e.entity_id}`} className="mono" style={{ fontSize: 11.5, fontWeight: 600 }}>{e.linked_no}</Link>
                  : '—'}</td>
                <td><Pill kind={statusTone(e)}>{e.status}</Pill></td>
              </tr>
            )) : <Empty cols={8}>No correspondence yet.</Empty>}
          </tbody>
        </table>
      </Card>

      {form && (
        <Modal title="Send email" saveLabel="Send email" busy={busy} onClose={() => setForm(null)} onSave={send}>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
            <div><label>To</label><input value={form.to} onChange={e => setFo('to', e.target.value)} /></div>
            <div><label>CC</label><input value={form.cc} onChange={e => setFo('cc', e.target.value)} /></div>
            <div style={{ gridColumn: '1 / -1' }}><label>Subject</label>
              <input value={form.subject} onChange={e => setFo('subject', e.target.value)} /></div>
            <div style={{ gridColumn: '1 / -1' }}><label>Link to assignment (optional)</label>
              <select value={form.assignment_id} onChange={e => setFo('assignment_id', e.target.value)}>
                <option value="">None</option>
                {tasks.map(t => <option key={t.id} value={t.id}>{t.assignment_no} — {t.title}</option>)}
              </select></div>
            <div style={{ gridColumn: '1 / -1' }}><label>Message</label>
              <textarea rows={6} value={form.body} onChange={e => setFo('body', e.target.value)} /></div>
          </div>
        </Modal>
      )}
    </>
  );
}
