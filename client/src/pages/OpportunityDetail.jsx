import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { get, post, patch, lakh, crore, shortDate } from '../lib/api.js';
import { Card, Pill, stageTone, Loading, ErrorNote } from '../components/Bits.jsx';
import { useAuth } from '../lib/auth.jsx';

const STAGES = ['Lead','Qualified','Pitched','Term Sheet','Mandated','Closed Won','Lost'];

export default function OpportunityDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const [o, setO] = useState(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');

  const load = () => get(`/opportunities/${id}`).then(setO).catch(e => setErr(e.message));
  useEffect(() => { load(); }, [id]);

  const move = async (stage) => {
    try { await patch(`/opportunities/${id}/stage`, { stage }); load(); }
    catch (e) { setErr(e.message); }
  };
  const addNote = async () => {
    if (!note.trim()) return;
    await post(`/opportunities/${id}/notes`, { comment: note });
    setNote(''); load();
  };

  if (err) return <ErrorNote>{err}</ErrorNote>;
  if (!o) return <Loading />;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div className="eyebrow">{o.opportunity_no} · {o.division || 'No division'}</div>
          <h3>{o.account} — {o.deal_type}</h3>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {can('opportunities.move_stage') && (
            <select value={o.stage} onChange={e => move(e.target.value)} style={{ width: 160 }}>
              {STAGES.map(s => <option key={s}>{s}</option>)}
            </select>
          )}
          <Link className="btn" to="/banking/opportunities">Back</Link>
        </div>
      </div>

      {o.is_converted === 1 && (
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
              <Field label="Transaction size" value={o.txn_size_cr ? crore(o.txn_size_cr) : '—'} />
              <Field label="Expected fee" value={lakh(o.expected_fee_l)} />
              <Field label="Probability" value={`${o.probability_pct}%`} />
              <Field label="Weighted fee" value={lakh(o.weighted_fee_l)} />
              <Field label="Expected close" value={shortDate(o.expected_close)} />
              <Field label="Owner" value={o.owner} />
              <Field label="Support team" value={o.team || 'nobody yet'} />
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
    </>
  );
}

const Field = ({ label, value }) => (
  <div><div className="eyebrow">{label}</div><div style={{ fontSize: 13.5 }}>{value}</div></div>
);
