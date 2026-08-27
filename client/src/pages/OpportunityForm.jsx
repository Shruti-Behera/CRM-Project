import { useEffect, useState } from 'react';
import { get, post } from '../lib/api.js';
import { Modal, ErrorNote } from '../components/Bits.jsx';
import { useAuth } from '../lib/auth.jsx';

export const OPP_STAGES = ['Lead', 'Qualified', 'Pitched', 'Term Sheet', 'Mandated', 'Closed Won', 'Lost'];
export const OPP_SOURCES = ['Referral', 'Existing client', 'Cold outreach', 'Banker network', 'Inbound', 'Conference', 'Promoter contact'];
const softGet = (p) => get(p).then(r => r || []).catch(() => []);
const iso = (n = 0) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

// Shared "New opportunity" modal — the same create flow the prototype's newOpp
// uses, wired to POST /api/opportunities. Reused by the list and the board.
export default function OpportunityForm({ onClose, onCreated, defaultAccountId = '' }) {
  const { user } = useAuth();
  const [refs, setRefs] = useState({ accounts: [], dealTypes: [], divisions: [], users: [] });
  const [form, setForm] = useState({
    account_id: defaultAccountId, deal_type_id: '', division_id: '', stage: 'Lead',
    txn_size_cr: 0, expected_fee_l: 0, probability_pct: 20, expected_close: iso(90),
    owner_id: '', source: 'Referral', next_action: '', next_action_due: iso(7), team: []
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([softGet('/accounts'), softGet('/masters/deal-types'), softGet('/masters/divisions'), softGet('/users')])
      .then(([accounts, dealTypes, divisions, users]) => {
        setRefs({ accounts, dealTypes, divisions, users });
        setForm(f => ({ ...f, owner_id: f.owner_id || user?.id || '' }));
      });
  }, [user]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleTeam = (uid) => setForm(f => ({ ...f, team: f.team.includes(uid) ? f.team.filter(x => x !== uid) : [...f.team, uid] }));

  const save = async () => {
    if (!form.account_id) { setErr('Pick an account'); return; }
    if (!form.deal_type_id) { setErr('Pick a deal type'); return; }
    setBusy(true);
    try {
      const res = await post('/opportunities', {
        account_id: Number(form.account_id), deal_type_id: Number(form.deal_type_id),
        division_id: form.division_id ? Number(form.division_id) : undefined,
        stage: form.stage, txn_size_cr: Number(form.txn_size_cr) || 0,
        expected_fee_l: Number(form.expected_fee_l) || 0, probability_pct: Number(form.probability_pct) || 0,
        expected_close: form.expected_close, owner_id: Number(form.owner_id) || undefined,
        source: form.source, next_action: form.next_action || undefined,
        next_action_due: form.next_action_due || undefined,
        team: form.team.filter(t => t !== Number(form.owner_id)).map(Number)
      });
      onCreated?.(res?.id);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Modal title="New opportunity" saveLabel="Create opportunity" busy={busy} onClose={onClose} onSave={save}>
      {err && <ErrorNote>{err}</ErrorNote>}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <div style={{ gridColumn: 'span 2' }}><label>Account</label>
          <select value={form.account_id} onChange={e => set('account_id', e.target.value)}>
            <option value="">— pick —</option>{refs.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
        <div><label>Deal type</label>
          <select value={form.deal_type_id} onChange={e => set('deal_type_id', e.target.value)}>
            <option value="">— pick —</option>{refs.dealTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
        <div><label>Division</label>
          <select value={form.division_id} onChange={e => set('division_id', e.target.value)}>
            <option value="">None</option>{refs.divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
        <div><label>Stage</label>
          <select value={form.stage} onChange={e => set('stage', e.target.value)}>{OPP_STAGES.map(s => <option key={s}>{s}</option>)}</select></div>
        <div><label>Transaction size (₹cr)</label><input type="number" value={form.txn_size_cr} onChange={e => set('txn_size_cr', e.target.value)} /></div>
        <div><label>Expected fee (₹L)</label><input type="number" value={form.expected_fee_l} onChange={e => set('expected_fee_l', e.target.value)} /></div>
        <div><label>Probability %</label><input type="number" value={form.probability_pct} onChange={e => set('probability_pct', e.target.value)} /></div>
        <div><label>Expected close</label><input type="date" value={form.expected_close} onChange={e => set('expected_close', e.target.value)} /></div>
        <div><label>Owner</label>
          <select value={form.owner_id} onChange={e => set('owner_id', e.target.value)}>
            <option value="">— pick —</option>{refs.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
        <div><label>Source</label>
          <select value={form.source} onChange={e => set('source', e.target.value)}>{OPP_SOURCES.map(s => <option key={s}>{s}</option>)}</select></div>
        <div style={{ gridColumn: 'span 2' }}><label>Next action</label>
          <input value={form.next_action} onChange={e => set('next_action', e.target.value)} /></div>
        <div><label>Action due</label><input type="date" value={form.next_action_due} onChange={e => set('next_action_due', e.target.value)} /></div>

        <div style={{ gridColumn: '1 / -1' }}><label>Support team</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, border: '1px solid var(--line)', borderRadius: 6, padding: 10, maxHeight: 140, overflowY: 'auto' }}>
            {refs.users.filter(u => u.id !== Number(form.owner_id)).map(u => {
              const on = form.team.includes(u.id);
              return (
                <label key={u.id} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, margin: 0, cursor: 'pointer', fontSize: 12.5,
                  fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: on ? 'var(--navy)' : 'var(--ink)',
                  background: on ? 'var(--tint)' : '#fff', border: '1px solid', borderColor: on ? 'var(--navy)' : 'var(--line)',
                  borderRadius: 20, padding: '3px 11px'
                }}>
                  <input type="checkbox" checked={on} onChange={() => toggleTeam(u.id)} style={{ width: 'auto', margin: 0 }} />
                  {u.name}
                </label>
              );
            })}
          </div></div>
      </div>
    </Modal>
  );
}
