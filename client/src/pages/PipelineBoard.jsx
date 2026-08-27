import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { get, patch, lakh } from '../lib/api.js';
import { Avatar, Loading, ErrorNote } from '../components/Bits.jsx';
import { useAuth } from '../lib/auth.jsx';
import OpportunityForm from './OpportunityForm.jsx';

const STAGES = ['Lead', 'Qualified', 'Pitched', 'Term Sheet', 'Mandated', 'Closed Won', 'Lost'];
const border = (s) => s === 'Lost' ? 'var(--red)' : (s === 'Closed Won' || s === 'Mandated') ? 'var(--green)' : 'var(--navy)';

export default function PipelineBoard() {
  const { can } = useAuth();
  const nav = useNavigate();
  const [board, setBoard] = useState(null);
  const [err, setErr] = useState('');
  const [drag, setDrag] = useState(null);         // { id, from }
  const [over, setOver] = useState('');           // stage being dragged over
  const [creating, setCreating] = useState(false);

  const load = () => get('/opportunities/board').then(setBoard).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);

  const drop = async (stage) => {
    setOver('');
    if (!drag || drag.from === stage) { setDrag(null); return; }
    const id = drag.id;
    setDrag(null);
    try { await patch(`/opportunities/${id}/stage`, { stage }); await load(); }
    catch (e) { setErr(e.message); }
  };

  if (err && !board) return <ErrorNote>{err}</ErrorNote>;
  if (!board) return <Loading />;

  const canMove = can('opportunities.move_stage');

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div><div className="eyebrow">Opportunities by stage</div><h3>Pipeline board</h3></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link className="btn" to="/banking/opportunities">Table view</Link>
          {can('opportunities.create') && <button className="btn primary" onClick={() => setCreating(true)}>New opportunity</button>}
        </div>
      </div>
      {err && <ErrorNote>{err}</ErrorNote>}
      {canMove && <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 8px' }}>Drag a card to another column to move its stage.</p>}

      <div className="board">
        {STAGES.map(stage => {
          const col = board[stage] || { deals: [], count: 0, fee_l: 0 };
          const deals = col.deals || [];
          return (
            <div key={stage} className="col-k"
              onDragOver={canMove ? (e => { e.preventDefault(); if (over !== stage) setOver(stage); }) : undefined}
              onDragLeave={() => over === stage && setOver('')}
              onDrop={canMove ? (() => drop(stage)) : undefined}
              style={{ outline: over === stage ? '2px dashed var(--cyan)' : 'none', outlineOffset: -2, transition: 'outline .1s' }}>
              <div className="kh">
                <span>{stage}</span>
                <span className="n">{col.count}{col.count ? ` · ${lakh(col.fee_l)}` : ''}</span>
              </div>
              {deals.length ? deals.map(o => (
                <div key={o.id} className="kcard" style={{ borderLeftColor: border(stage), cursor: canMove ? 'grab' : 'pointer' }}
                  draggable={canMove}
                  onDragStart={canMove ? (e => { setDrag({ id: o.id, from: stage }); e.dataTransfer.effectAllowed = 'move'; }) : undefined}
                  onDragEnd={() => { setDrag(null); setOver(''); }}
                  onClick={() => nav(`/banking/opportunities/${o.id}`)}>
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--muted)' }}>{o.opportunity_no}</span>
                  <div className="t">{o.account}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{o.deal_type}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                    <span className="mono" style={{ fontSize: 11.5, fontWeight: 600 }}>{lakh(o.expected_fee_l)}</span>
                    <Avatar name={o.owner} size={22} tone="t" />
                  </div>
                </div>
              )) : <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 2px' }}>Nothing here</div>}
            </div>
          );
        })}
      </div>

      {creating && <OpportunityForm onClose={() => setCreating(false)}
        onCreated={(id) => { setCreating(false); if (id) nav(`/banking/opportunities/${id}`); else load(); }} />}
    </>
  );
}
