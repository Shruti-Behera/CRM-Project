import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { get, shortDate } from '../lib/api.js';
import { Card, Avatar, Loading, Empty, ErrorNote } from '../components/Bits.jsx';

// Deal meetings are simply the banking-workspace meetings — the existing
// /api/meetings endpoint already supports a workspace filter, so this reuses it.
export default function DealMeetings() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    get('/meetings?workspace=banking').then(r => setRows(r || [])).catch(e => setErr(e.message));
  }, []);

  if (err && !rows) return <ErrorNote>{err}</ErrorNote>;
  if (!rows) return <Loading />;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow">Execution</div>
          <h3>Deal meetings</h3>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '2px 0 0' }}>Client and lender interactions</p>
        </div>
        <Link className="btn" to="/internal/meetings">All meetings</Link>
      </div>

      <Card pad={false}>
        <table className="tbl">
          <thead><tr>
            <th>Meeting</th><th>Participants</th><th>Date &amp; time</th><th>Duration</th><th>Agenda</th><th>Minutes</th>
          </tr></thead>
          <tbody>
            {rows.length ? rows.map(m => (
              <tr key={m.id}>
                <td style={{ fontWeight: 500 }}>{m.title}</td>
                <td>{m.participants
                  ? m.participants.split(', ').filter(Boolean).slice(0, 5).map((p, i) => (
                    <span key={i} style={{ marginLeft: i ? -6 : 0, display: 'inline-block' }}><Avatar name={p} size={22} tone="t" title={p} /></span>))
                  : '—'}</td>
                <td className="mono" style={{ fontSize: 12 }}>{shortDate(m.meeting_date)}
                  <div style={{ color: 'var(--muted)' }}>{m.meeting_time}</div></td>
                <td className="mono" style={{ fontSize: 12 }}>{m.duration_min} min</td>
                <td style={{ fontSize: 12.5 }}>{m.agenda || '—'}</td>
                <td style={{ fontSize: 12.5 }}>{m.minutes || '—'}</td>
              </tr>
            )) : <Empty cols={6}>No deal meetings scheduled. Create one from the Meetings screen with the Banking workspace.</Empty>}
          </tbody>
        </table>
      </Card>
    </>
  );
}
