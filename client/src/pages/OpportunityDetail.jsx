import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { get, post, patch, lakh, crore, shortDate } from '../lib/api.js';
import { Card, Pill, stageTone, Loading, ErrorNote, Modal } from '../components/Bits.jsx';
import { useAuth } from '../lib/auth.jsx';
import { OPP_STAGES } from './OpportunityForm.jsx';

const softGet = (p) => get(p).then(r => r || []).catch(() => []);
const num = (v) => Number(v || 0);

export default function OpportunityDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const [o, setO] = useState(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [users, setUsers] = useState([]);
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => get(`/opportunities/${id}`).then(setO).catch(e => setErr(e.message));
  useEffect(() => { load(); softGet('/users').then(setUsers); /* eslint-disable-next-line */ }, [id]);

  const move = async (stage) => {
    try { await patch(`/opportunities/${id}/stage`, { stage }); load(); }
    catch (e) { setErr(e.message); }
  };
  const addNote = async () => {
    if (!note.trim()) return;
    await post(`/opportunities/${id}/notes`, { comment: note });
    setNote(''); load();
  };
  const openEdit = () => setEdit({
    stage: o.stage, txn_size_cr: num(o.txn_size_cr), expected_fee_l: num(o.expected_fee_l),
    probability_pct: num(o.probability_pct), expected_close: o.expected_close ? String(o.expected_close).slice(0, 10) : '',
    owner_id: o.owner_id || '', next_action: o.next_action || '',
    next_action_due: o.next_action_due ? String(o.next_action_due).slice(0, 10) : ''
  });
  const setE = (k, v) => setEdit(x => ({ ...x, [k]: v }));
  const saveEdit = async () => {
    setBusy(true);
    try {
      await patch(`/opportunities/${id}`, {
        stage: edit.stage, txn_size_cr: Number(edit.txn_size_cr) || 0,
        expected_fee_l: Number(edit.expected_fee_l) || 0, probability_pct: Number(edit.probability_pct) || 0,
        expected_close: edit.expected_close || undefined, owner_id: Number(edit.owner_id) || undefined,
        next_action: edit.next_action || undefined, next_action_due: edit.next_action_due || undefined
      });
      setEdit(null); await load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  if (err && !o) return <ErrorNote>{err}</ErrorNote>;
  if (!o) return <Loading />;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow">{o.opportunity_no} · {o.division || 'No division'}</div>
          <h3>{o.account} — {o.deal_type}</h3>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {can('opportunities.move_stage') && (
            <select value={o.stage} onChange={e => move(e.target.value)} style={{ width: 150 }}>
              {OPP_STAGES.map(s => <option key={s}>{s}</option>)}
            </select>
          )}
          {can('opportunities.edit') && num(o.is_converted) === 0 && <button className="btn primary" onClick={openEdit}>Edit</button>}
          <Link className="btn" to="/banking/opportunities">Back</Link>
        </div>
      </div>
      {err && <ErrorNote>{err}</ErrorNote>}

      {num(o.is_converted) === 1 && (
        <div className="card" style={{ borderLeft: '3px solid var(--green)', marginBottom: 14 }}>
          <div className="bd" style={{ padding: '10px 15px' }}>
            This opportunity has been converted and no longer sits in the pipeline.
          </div>
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <div className="grid">
          <Card>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
              <Field label="Stage" value={<Pill kind={stageTone(o.stage)}>{o.stage}</Pill>} />
              <Field label="Transaction size" value={num(o.txn_size_cr) ? crore(o.txn_size_cr) : '—'} />
              <Field label="Expected fee" value={lakh(o.expected_fee_l)} />
              <Field label="Probability" value={`${num(o.probability_pct)}%`} />
              <Field label="Weighted fee" value={lakh(o.weighted_fee_l)} />
              <Field label="Expected close" value={shortDate(o.expected_close)} />
              <Field label="Owner" value={o.owner} />
              <Field label="Support team" value={o.team || 'nobody yet'} />
              <Field label="Source" value={o.source || '—'} />
              <Field label="Next action" value={o.next_action || '—'} />
              <Field label="Action due" value={shortDate(o.next_action_due)} />
              <Field label="Days in pipeline" value={`${o.age_days} d`} />
            </div>
          </Card>

          <Card title="Notes">
            {o.notes.map(n => (
              <div key={n.id} style={{ borderBottom: '1px solid #F1F4F8', padding: '8px 0' }}>
                <b style={{ fontSize: 12.5 }}>{n.author}</b>
                <span className="mono" style={{ float: 'right', fontSize: 11, color: 'var(--muted)' }}>
                  {shortDate(n.note_at)}</span>
                <div style={{ fontSize: 13 }}>{n.comment}</div>
              </div>
            ))}
            <textarea rows={2} value={note} placeholder="Log a call, meeting or update"
              onChange={e => setNote(e.target.value)} style={{ marginTop: 10 }} />
            <button className="btn primary" style={{ marginTop: 8 }} onClick={addNote}>Add note</button>
          </Card>
        </div>

        <Card title="Stage history">
          {o.history.map((h, i) => (
            <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid #F1F4F8', fontSize: 12.5 }}>
              {h.from_stage ? `${h.from_stage} → ` : ''}<b>{h.to_stage}</b>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                {h.moved_by || 'system'} · {shortDate(h.moved_at)}
                {h.days_in_stage != null && ` · ${h.days_in_stage}d in stage`}
              </div>
            </div>
          ))}
        </Card>
      </div>

      {edit && (
        <Modal title={`Edit opportunity ${o.opportunity_no}`} saveLabel="Save changes" busy={busy}
          onClose={() => setEdit(null)} onSave={saveEdit}>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
            <div><label>Stage</label>
              <select value={edit.stage} onChange={e => setE('stage', e.target.value)}>{OPP_STAGES.map(s => <option key={s}>{s}</option>)}</select></div>
            <div><label>Transaction size (₹cr)</label><input type="number" value={edit.txn_size_cr} onChange={e => setE('txn_size_cr', e.target.value)} /></div>
            <div><label>Expected fee (₹L)</label><input type="number" value={edit.expected_fee_l} onChange={e => setE('expected_fee_l', e.target.value)} /></div>
            <div><label>Probability %</label><input type="number" value={edit.probability_pct} onChange={e => setE('probability_pct', e.target.value)} /></div>
            <div><label>Expected close</label><input type="date" value={edit.expected_close} onChange={e => setE('expected_close', e.target.value)} /></div>
            <div><label>Owner</label>
              <select value={edit.owner_id} onChange={e => setE('owner_id', e.target.value)}>
                <option value="">— pick —</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
            <div style={{ gridColumn: 'span 2' }}><label>Next action</label><input value={edit.next_action} onChange={e => setE('next_action', e.target.value)} /></div>
            <div><label>Action due</label><input type="date" value={edit.next_action_due} onChange={e => setE('next_action_due', e.target.value)} /></div>
          </div>
        </Modal>
      )}
    </>
  );
}

const Field = ({ label, value }) => (
  <div><div className="eyebrow">{label}</div><div style={{ fontSize: 13.5 }}>{value}</div></div>
);
