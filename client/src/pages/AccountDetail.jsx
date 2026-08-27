import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { get, post, lakh, crore, shortDate } from '../lib/api.js';
import { Card, Pill, stageTone, statusTone, Loading, Empty, ErrorNote } from '../components/Bits.jsx';
import { useAuth } from '../lib/auth.jsx';
import AccountForm from './AccountForm.jsx';
import OpportunityForm from './OpportunityForm.jsx';
import { mCls } from './Mandates.jsx';

const OPEN_STAGES = ['Lead', 'Qualified', 'Pitched', 'Term Sheet', 'Mandated'];
const num = (v) => Number(v || 0);
const kycTone = (k) => k === 'Completed' ? 'p-done' : k === 'Pending' ? 'p-pending' : 'p-review';
const phoneText = (code, no) => (no ? `${code || ''} ${no}`.trim() : '—');

const Field = ({ label, children }) => (
  <div><div className="eyebrow">{label}</div><div style={{ fontSize: 13.5 }}>{children}</div></div>
);

export default function AccountDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { can } = useAuth();
  const [a, setA] = useState(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(false);
  const [newOpp, setNewOpp] = useState(false);

  const load = () => get(`/accounts/${id}`).then(setA).catch(e => setErr(e.message));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const addNote = async () => {
    if (!note.trim()) return;
    try { await post(`/accounts/${id}/notes`, { comment: note }); setNote(''); load(); }
    catch (e) { setErr(e.message); }
  };

  if (err && !a) return <ErrorNote>{err}</ErrorNote>;
  if (!a) return <Loading />;

  const opps = a.opportunities || [], mnds = a.mandates || [], notes = a.notes || [], activity = a.activity || [];
  const prefs = a.preferences || [];
  const liveOpps = opps.filter(o => OPEN_STAGES.includes(o.stage)).length;
  const sub = [a.account_code, a.sector, a.account_type, a.group_name].filter(x => x && x !== '—').join(' · ');

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow">{sub}</div>
          <h3>{a.name}</h3>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {can('accounts.edit') && <button className="btn teal" onClick={() => setEditing(true)}>Edit account</button>}
          {can('opportunities.create') && <button className="btn" onClick={() => setNewOpp(true)}>New opportunity</button>}
          <button className="btn" onClick={() => window.print()}>Print</button>
          <Link className="btn" to="/banking/accounts">Back to accounts</Link>
        </div>
      </div>
      {err && <ErrorNote>{err}</ErrorNote>}

      <div className="grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <div className="grid">
          <Card>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
              <Field label="Division">{a.division || '—'}</Field>
              <Field label="Group">{a.group_name || '—'}</Field>
              <Field label="Relationship owner">{a.owner}</Field>
              <Field label="Country">{a.country || '—'}</Field>
              <Field label="City">{a.city || '—'}</Field>
              <Field label="Client since">{shortDate(a.client_since)}</Field>
              <Field label="KYC"><Pill kind={kycTone(a.kyc_status)}>{a.kyc_status}</Pill></Field>
              <Field label="Primary contact">{a.contact?.name || '—'}</Field>
              <Field label="Designation">{a.contact?.designation || '—'}</Field>
              <Field label="Email">{a.contact?.email || '—'}</Field>
              <Field label="Phone">{phoneText(a.phone_code, a.phone_number)}</Field>
              <Field label="Mobile">{phoneText(a.mobile_code, a.mobile_number)}</Field>
              <Field label="Fees earned to date">{lakh(a.fees_to_date)}</Field>
              <Field label="Live opportunities">{liveOpps}</Field>
              <Field label="Mandates">{mnds.length}</Field>
              <Field label="Status"><Pill kind={a.status === 'Active' ? 'p-done' : 'p-hold'}>{a.status}</Pill></Field>
              <div style={{ gridColumn: '1 / -1' }}><div className="eyebrow">Preferences</div>
                <div style={{ fontSize: 13.5 }}>{prefs.length
                  ? prefs.map((p, i) => <span key={i} className="tag">{p.name}</span>)
                  : <span style={{ color: 'var(--muted)' }}>none recorded</span>}</div></div>
              <div style={{ gridColumn: '1 / -1' }}><div className="eyebrow">Notes</div>
                <div style={{ fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{a.remark || <span style={{ color: 'var(--muted)' }}>—</span>}</div></div>
            </div>
          </Card>

          <Card title={<>Opportunities <span className="eyebrow" style={{ marginLeft: 6 }}>{opps.length} total</span></>} pad={false}>
            <table className="tbl">
              <thead><tr><th>No.</th><th>Deal type</th><th>Stage</th><th style={{ textAlign: 'right' }}>Size</th>
                <th style={{ textAlign: 'right' }}>Fee</th><th style={{ textAlign: 'right' }}>Prob.</th><th>Expected close</th></tr></thead>
              <tbody>
                {opps.length ? opps.map(o => (
                  <tr key={o.id}>
                    <td><Link to={`/banking/opportunities/${o.id}`} className="tid">{o.opportunity_no}</Link></td>
                    <td style={{ fontSize: 12.5 }}>{o.deal_type}</td>
                    <td><Pill kind={stageTone(o.stage)}>{o.stage}</Pill></td>
                    <td className="mono" style={{ fontSize: 12, textAlign: 'right' }}>{num(o.txn_size_cr) ? crore(o.txn_size_cr) : '—'}</td>
                    <td className="mono" style={{ fontSize: 12, textAlign: 'right' }}>{lakh(o.expected_fee_l)}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{num(o.probability_pct)}%</td>
                    <td className="mono" style={{ fontSize: 12 }}>{shortDate(o.expected_close)}</td>
                  </tr>
                )) : <Empty cols={7}>No opportunities logged for this account.</Empty>}
              </tbody>
            </table>
          </Card>

          <Card title="Mandates" pad={false}>
            <table className="tbl">
              <thead><tr><th>No.</th><th>Type</th><th>Signed</th><th style={{ textAlign: 'right' }}>Est. fee</th>
                <th style={{ textAlign: 'right' }}>Realised</th><th>Status</th></tr></thead>
              <tbody>
                {mnds.length ? mnds.map(m => (
                  <tr key={m.id}>
                    <td><Link to={`/banking/mandates/${m.id}`} className="tid">{m.mandate_no}</Link></td>
                    <td style={{ fontSize: 12.5 }}>{m.deal_type}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{shortDate(m.signed_on)}</td>
                    <td className="mono" style={{ fontSize: 12, textAlign: 'right' }}>{lakh(m.estimated_fee_l)}</td>
                    <td className="mono" style={{ fontSize: 12, textAlign: 'right' }}>{lakh(m.realised_fee_l)}</td>
                    <td><Pill kind={mCls(m.status)}>{m.status}</Pill></td>
                  </tr>
                )) : <Empty cols={6}>No mandates signed with this account yet.</Empty>}
              </tbody>
            </table>
          </Card>
        </div>

        <div className="grid">
          <Card title="Notes">
            {notes.length ? notes.map(n => (
              <div key={n.id} style={{ borderBottom: '1px solid #F1F4F8', padding: '8px 0' }}>
                <b style={{ fontSize: 12.5 }}>{n.author}</b>
                <span className="mono" style={{ float: 'right', fontSize: 11, color: 'var(--muted)' }}>{shortDate(n.note_at)}</span>
                <div style={{ fontSize: 13 }}>{n.comment}</div>
              </div>
            )) : <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>No notes yet.</p>}
            <textarea rows={2} value={note} placeholder="Add a relationship note" onChange={e => setNote(e.target.value)} style={{ marginTop: 10 }} />
            <button className="btn primary" style={{ marginTop: 8 }} onClick={addNote}>Add note</button>
          </Card>

          <Card title="Activity">
            {activity.length ? activity.map((x, i) => (
              <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid #F1F4F8', fontSize: 12.5 }}>
                <b>{x.description}</b>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{x.who || 'system'} · {shortDate(x.created_at)}</div>
              </div>
            )) : <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>No activity yet.</p>}
          </Card>
        </div>
      </div>

      {editing && <AccountForm accountId={Number(id)} onClose={() => setEditing(false)}
        onSaved={() => { setEditing(false); load(); }} />}
      {newOpp && <OpportunityForm defaultAccountId={Number(id)} onClose={() => setNewOpp(false)}
        onCreated={(oid) => { setNewOpp(false); if (oid) nav(`/banking/opportunities/${oid}`); else load(); }} />}
    </>
  );
}
