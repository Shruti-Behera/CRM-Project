import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { get, post, patch, lakh, crore, shortDate } from '../lib/api.js';
import { Card, Pill, Avatar, Loading, Empty, ErrorNote, Modal, statusTone } from '../components/Bits.jsx';
import { useAuth } from '../lib/auth.jsx';
import { mCls } from './Mandates.jsx';

const CLOSED = ['Executed', 'Terminated'];
const num = (v) => Number(v || 0);
const iso = () => new Date().toISOString().slice(0, 10);
const COMPLIANCE = [['sebi_cleared', 'SEBI / regulatory clearance'], ['kyc_cleared', 'Client KYC complete'], ['agreement_signed', 'Signed engagement letter']];

const Field = ({ label, children }) => (
  <div><div className="eyebrow">{label}</div><div style={{ fontSize: 13.5 }}>{children}</div></div>
);

export default function MandateDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { can } = useAuth();
  const [m, setM] = useState(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [fee, setFee] = useState(null);
  const [closer, setCloser] = useState(null);

  const load = () => get(`/mandates/${id}`).then(setM).catch(e => setErr(e.message));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);
  const guard = (fn) => async (...a) => { try { await fn(...a); await load(); } catch (e) { setErr(e.message); } };

  const toggleMs = guard((ms) => patch(`/mandates/${id}/milestones/${ms.id}`, { is_done: !(num(ms.is_done) === 1) }));
  const toggleComp = guard((key, val) => patch(`/mandates/${id}`, { [key]: val }));
  const addNote = guard(() => { if (!note.trim()) return Promise.resolve(); const r = post(`/mandates/${id}/notes`, { note }); setNote(''); return r; });
  const saveFee = guard(async () => {
    if (!num(fee.amount_l)) { setErr('Enter an amount'); return; }
    await post(`/mandates/${id}/fees`, { amount_l: Number(fee.amount_l), fee_type: fee.fee_type, received_on: fee.received_on, narration: fee.narration || undefined });
    setFee(null);
  });
  const saveClose = guard(async () => {
    await patch(`/mandates/${id}`, { status: closer.status, closed_on: closer.closed_on });
    if (closer.note?.trim()) await post(`/mandates/${id}/notes`, { note: `Closing note: ${closer.note}` });
    setCloser(null);
  });

  if (err && !m) return <ErrorNote>{err}</ErrorNote>;
  if (!m) return <Loading />;

  const ms = m.milestones || [], team = m.team || [], fees = m.fees || [], links = m.assignments || [], activity = m.activity || [];
  const done = ms.filter(x => num(x.is_done) === 1).length;
  const pct = ms.length ? Math.round(100 * done / ms.length) : 0;
  const realisePct = num(m.estimated_fee_l) ? Math.round(100 * num(m.realised_fee_l) / num(m.estimated_fee_l)) : 0;
  const isClosed = CLOSED.includes(m.status);
  const compAll = COMPLIANCE.every(([k]) => num(m[k]) === 1);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow">{m.mandate_no} · signed {shortDate(m.signed_on)}</div>
          <h3>{m.account} — {m.deal_type}</h3>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {can('fees.create') && !isClosed && <button className="btn" onClick={() => setFee({ amount_l: '', fee_type: 'Retainer', received_on: iso(), narration: '' })}>Record fee</button>}
          {can('mandates.edit') && !isClosed && <button className="btn teal" onClick={() => setCloser({ status: 'Executed', closed_on: iso(), note: '' })}>Close mandate</button>}
          <Link className="btn" to="/banking/mandates">Back</Link>
        </div>
      </div>
      {err && <ErrorNote>{err}</ErrorNote>}

      {isClosed && (
        <div className="card" style={{ borderLeft: `3px solid ${m.status === 'Executed' ? 'var(--green)' : 'var(--red)'}`, marginBottom: 14 }}>
          <div className="bd" style={{ padding: '10px 15px', fontSize: 13 }}>
            This mandate is <b>{m.status.toLowerCase()}</b>{m.closed_on ? ` as of ${shortDate(m.closed_on)}` : ''} and sits under{' '}
            <Link to="/banking/closed" className="tid">Closed projects</Link>.
          </div>
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <div className="grid">
          <Card>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
              <Field label="Account">{m.account}</Field>
              <Field label="Source opportunity">{m.opportunity_no
                ? <Link to="/banking/opportunities" className="tid">{m.opportunity_no}</Link> : '—'}</Field>
              <Field label="Division">{m.division || '—'}</Field>
              <Field label="Mandate type">{m.deal_type}</Field>
              <Field label="Status"><Pill kind={mCls(m.status)}>{m.status}</Pill></Field>
              <Field label="Signed">{shortDate(m.signed_on)}</Field>
              <Field label="Expected end">{shortDate(m.expected_end)}</Field>
              <Field label="Retainer">{lakh(m.retainer_l)}</Field>
              <Field label="Success fee">{num(m.success_fee_pct)}%</Field>
              <Field label="Estimated fee">{lakh(m.estimated_fee_l)}</Field>
              <Field label="Realised"><b style={{ color: 'var(--green)' }}>{lakh(m.realised_fee_l)}</b></Field>
              <Field label="Outstanding">{lakh(num(m.estimated_fee_l) - num(m.realised_fee_l))}</Field>
              <Field label="Transaction value">{num(m.txn_value_cr) ? crore(m.txn_value_cr) : '—'}</Field>
              <Field label="Deal team">{team.length ? team.map(t => t.name).join(', ') : '—'}</Field>
            </div>
            <div style={{ marginTop: 12 }}>
              <div className="eyebrow" style={{ marginBottom: 4 }}>Fee realisation — {realisePct}%</div>
              <div className="prog" style={{ height: 8 }}><i style={{ width: `${realisePct}%`, background: 'var(--green)' }} /></div>
            </div>
          </Card>

          <Card title={<>Milestones <span className="eyebrow" style={{ marginLeft: 6 }}>{done} of {ms.length} · {pct}%</span></>}>
            {ms.length ? ms.map(x => (
              <label key={x.id} className={`chk${num(x.is_done) === 1 ? ' done' : ''}`} style={{ cursor: can('mandates.edit') ? 'pointer' : 'default' }}>
                <input type="checkbox" checked={num(x.is_done) === 1} disabled={!can('mandates.edit')}
                  onChange={() => toggleMs(x)} style={{ width: 'auto' }} />
                <span style={{ flex: 1 }}>{x.name}</span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{shortDate(x.due_date)}</span>
              </label>
            )) : <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>No milestones.</p>}
          </Card>

          <Card title={<>Fee receipts <span className="eyebrow" style={{ marginLeft: 6 }}>{fees.length}</span></>} pad={false}>
            <table className="tbl">
              <thead><tr><th>Type</th><th>Amount</th><th>Received</th><th>Narration</th></tr></thead>
              <tbody>
                {fees.length ? fees.map(fr => (
                  <tr key={fr.id}>
                    <td style={{ fontSize: 12.5 }}>{fr.fee_type}</td>
                    <td className="mono" style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>{lakh(fr.amount_l)}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{shortDate(fr.received_on)}</td>
                    <td style={{ fontSize: 12.5 }}>{fr.narration || '—'}</td>
                  </tr>
                )) : <Empty cols={4}>No fees recorded yet.</Empty>}
              </tbody>
            </table>
          </Card>

          <Card title="Linked internal work" pad={false}>
            <table className="tbl">
              <thead><tr><th>Task</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead>
              <tbody>
                {links.length ? links.map(t => (
                  <tr key={t.id}>
                    <td><Link to={`/internal/assignments/${t.id}`} className="mono" style={{ fontSize: 11.5, fontWeight: 600 }}>{t.assignment_no}</Link>
                      <div style={{ fontSize: 12.5 }}>{t.title}</div></td>
                    <td style={{ fontSize: 12.5 }}>{t.owner || '—'}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{shortDate(t.due_date)}</td>
                    <td><Pill kind={statusTone(t.status)}>{t.status}</Pill></td>
                  </tr>
                )) : <Empty cols={4}>No internal assignments linked to this mandate yet.</Empty>}
              </tbody>
            </table>
          </Card>
        </div>

        <div className="grid">
          <Card title="Compliance">
            {COMPLIANCE.map(([key, label]) => (
              <label key={key} className={`chk${num(m[key]) === 1 ? ' done' : ''}`} style={{ cursor: can('mandates.edit') ? 'pointer' : 'default' }}>
                <input type="checkbox" checked={num(m[key]) === 1} disabled={!can('mandates.edit')}
                  onChange={e => toggleComp(key, e.target.checked)} style={{ width: 'auto' }} />
                <span>{label}</span>
              </label>
            ))}
            {!compAll && <p style={{ fontSize: 12, color: 'var(--red)', margin: '8px 0 0' }}>Open items must close before fee invoicing.</p>}
          </Card>

          <Card title="Notes">
            <textarea rows={2} value={note} placeholder="Add an execution note" onChange={e => setNote(e.target.value)} />
            <button className="btn primary" style={{ marginTop: 8 }} onClick={addNote}>Add note</button>
          </Card>

          <Card title="Activity">
            {activity.length ? activity.map((a, i) => (
              <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid #F2F4F8', fontSize: 12.5 }}>
                <b>{a.description}</b>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{a.who || 'system'} · {shortDate(a.created_at)}</div>
              </div>
            )) : <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>No activity yet.</p>}
          </Card>
        </div>
      </div>

      {fee && (
        <Modal title="Record fee received" saveLabel="Record" onClose={() => setFee(null)} onSave={saveFee}>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
            <div><label>Amount received (₹L)</label><input type="number" value={fee.amount_l} onChange={e => setFee(v => ({ ...v, amount_l: e.target.value }))} /></div>
            <div><label>Fee type</label>
              <select value={fee.fee_type} onChange={e => setFee(v => ({ ...v, fee_type: e.target.value }))}>
                {['Retainer', 'Success Fee', 'Milestone', 'Reimbursement'].map(s => <option key={s}>{s}</option>)}</select></div>
            <div><label>Received on</label><input type="date" value={fee.received_on} onChange={e => setFee(v => ({ ...v, received_on: e.target.value }))} /></div>
            <div style={{ gridColumn: '1 / -1' }}><label>Narration</label><input value={fee.narration} onChange={e => setFee(v => ({ ...v, narration: e.target.value }))} /></div>
          </div>
        </Modal>
      )}

      {closer && (
        <Modal title={`Close ${m.mandate_no}`} saveLabel="Close mandate" onClose={() => setCloser(null)} onSave={saveClose}>
          <div className="card" style={{ background: '#FBFCFE', marginBottom: 12 }}>
            <div className="bd" style={{ padding: '8px 12px', fontSize: 12.5 }}>
              <b>{m.account}</b> — {m.deal_type}<br />
              Fee {lakh(m.realised_fee_l)} realised of {lakh(m.estimated_fee_l)}
              {num(m.estimated_fee_l) - num(m.realised_fee_l) > 0 &&
                <> · <b style={{ color: 'var(--red)' }}>{lakh(num(m.estimated_fee_l) - num(m.realised_fee_l))} outstanding</b></>}
              {ms.length - done > 0 && <><br />{ms.length - done} milestone(s) not ticked.</>}
            </div>
          </div>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
            <div><label>Outcome</label>
              <select value={closer.status} onChange={e => setCloser(v => ({ ...v, status: e.target.value }))}>
                <option>Executed</option><option>Terminated</option></select></div>
            <div><label>Closed on</label><input type="date" value={closer.closed_on} onChange={e => setCloser(v => ({ ...v, closed_on: e.target.value }))} /></div>
            <div style={{ gridColumn: '1 / -1' }}><label>Closing note</label><textarea rows={2} value={closer.note} onChange={e => setCloser(v => ({ ...v, note: e.target.value }))} /></div>
          </div>
        </Modal>
      )}
    </>
  );
}
