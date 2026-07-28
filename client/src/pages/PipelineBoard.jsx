import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { get, lakh } from '../lib/api.js';
import { Avatar, Loading, ErrorNote } from '../components/Bits.jsx';

const STAGES = ['Lead', 'Qualified', 'Pitched', 'Term Sheet', 'Mandated', 'Closed Won', 'Lost'];
const border = (s) => s === 'Lost' ? 'var(--red)' : (s === 'Closed Won' || s === 'Mandated') ? 'var(--green)' : 'var(--navy)';

export default function PipelineBoard() {
  const [board, setBoard] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => { get('/opportunities/board').then(setBoard).catch(e => setErr(e.message)); }, []);

  if (err) return <ErrorNote>{err}</ErrorNote>;
  if (!board) return <Loading />;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div><div className="eyebrow">Opportunities by stage</div><h3>Pipeline board</h3></div>
        <Link className="btn" to="/banking/opportunities">Table view</Link>
      </div>

      <div className="board">
        {STAGES.map(stage => {
          const col = board[stage] || { deals: [], count: 0, fee_l: 0 };
          const deals = col.deals || [];
          return (
            <div key={stage} className="col-k">
              <div className="kh">
                <span>{stage}</span>
                <span className="n">{col.count}{col.count ? ` · ${lakh(col.fee_l)}` : ''}</span>
              </div>
              {deals.length ? deals.map(o => (
                <Link key={o.id} className="kcard" to={`/banking/opportunities/${o.id}`} style={{ borderLeftColor: border(stage) }}>
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--muted)' }}>{o.opportunity_no}</span>
                  <div className="t">{o.account}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{o.deal_type}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                    <span className="mono" style={{ fontSize: 11.5, fontWeight: 600 }}>{lakh(o.expected_fee_l)}</span>
                    <Avatar name={o.owner} size={22} />
                  </div>
                </Link>
              )) : <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 2px' }}>Nothing here</div>}
            </div>
          );
        })}
      </div>
    </>
  );
}
