import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, Doughnut, Chart as ReactChart } from 'react-chartjs-2';
import {
  Chart, BarElement, LineElement, PointElement, CategoryScale, LinearScale, ArcElement, Filler, Tooltip, Legend
} from 'chart.js';
import { get, lakh, crore, shortDate } from '../lib/api.js';
import { Stat, Card, Loading, Empty, ErrorNote } from '../components/Bits.jsx';

Chart.register(BarElement, LineElement, PointElement, CategoryScale, LinearScale, ArcElement, Filler, Tooltip, Legend);

const OPEN_STAGES = ['Lead', 'Qualified', 'Pitched', 'Term Sheet', 'Mandated'];
const MND_STATUS = ['Active', 'Executed', 'On Hold', 'Terminated'];
const FUNNEL_COLORS = ['#8794AB', '#1D5D9D', '#2596C2', '#20B7D2', '#18B485'];
const noAspect = (o = {}) => ({ maintainAspectRatio: false, ...o });
const softGet = (p) => get(p).then(r => r || []).catch(() => []);
const monthKey = (s) => (s || '').slice(0, 7);
const num = (v) => Number(v || 0);

export default function BankingDashboard() {
  const [data, setData] = useState(null);
  const [opps, setOpps] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    get('/dashboards/banking').then(setData).catch(e => setErr(e.message));
    softGet('/opportunities').then(setOpps);
    softGet('/accounts').then(setAccounts);
  }, []);

  const derived = useMemo(() => {
    if (!data) return null;
    const mandates = data.mandate_fees || [];
    const funnel = data.funnel || [];
    const byDivision = data.by_division || [];
    const byDealType = data.by_deal_type || [];

    // Win rate from opportunities
    const won = opps.filter(o => ['Mandated', 'Closed Won'].includes(o.stage)).length;
    const lost = opps.filter(o => o.stage === 'Lost').length;
    const winPct = (won + lost) ? Math.round((won / (won + lost)) * 100) : 0;

    // Funnel by stage (sum across divisions)
    const funnelRows = OPEN_STAGES.map(s => {
      const rs = funnel.filter(f => f.stage === s);
      return { stage: s, fee: rs.reduce((n, f) => n + num(f.gross_fee_l), 0), deals: rs.reduce((n, f) => n + num(f.deals), 0) };
    });
    const funnelMax = Math.max(1, ...funnelRows.map(r => r.fee));

    // Ageing of live opps
    const live = opps.filter(o => OPEN_STAGES.includes(o.stage) && Number(o.is_converted) !== 1);
    const age = [0, 0, 0, 0];
    live.forEach(o => { const a = num(o.age_days); age[a <= 30 ? 0 : a <= 60 ? 1 : a <= 120 ? 2 : 3]++; });

    // Mandate status doughnut
    const statusCounts = MND_STATUS.map(s => mandates.filter(m => m.status === s).length);

    // Fee realisation (first 8 mandates)
    const mList = mandates.slice(0, 8);

    // Signed & realised over 6 months
    const mL = [], mS = [], mF = [];
    for (let i = 5; i >= 0; i--) {
      const dt = new Date(); dt.setMonth(dt.getMonth() - i);
      const k = dt.toISOString().slice(0, 7);
      mL.push(dt.toLocaleDateString('en-IN', { month: 'short' }));
      mS.push(mandates.filter(m => monthKey(m.signed_on) === k).length);
      mF.push(mandates.filter(m => monthKey(m.signed_on) === k).reduce((n, m) => n + num(m.realised_fee_l), 0));
    }

    const topAccounts = accounts.filter(a => num(a.fees_to_date) > 0).sort((a, b) => num(b.fees_to_date) - num(a.fees_to_date)).slice(0, 7);
    const activeMandates = mandates.filter(m => m.status === 'Active');

    return { mandates, byDivision, byDealType, won, lost, winPct, funnelRows, funnelMax, age, statusCounts, mList, mL, mS, mF, topAccounts, activeMandates };
  }, [data, opps, accounts]);

  if (err && !data) return <ErrorNote>{err}</ErrorNote>;
  if (!data || !derived) return <Loading />;

  const { kpi } = data;
  const divMax = Math.max(1, ...derived.byDivision.map(d => num(d.gross_fee_l)));
  const accMax = Math.max(1, ...derived.topAccounts.map(a => num(a.fees_to_date)));

  return (
    <>
      <div className="hero">
        <div className="eyebrow" style={{ color: '#B9C6E2' }}>Investment &amp; Merchant Banking</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h3 style={{ marginTop: 4 }}>Pipeline &amp; mandates</h3>
            <div style={{ color: '#B9C6E2', fontSize: 12.5 }}>
              {kpi.live_opps} live opportunities · {kpi.active || 0} active mandates · {accounts.filter(a => a.status === 'Active').length} active accounts
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link className="btn" to="/banking/board">Pipeline board</Link>
            <Link className="btn teal" to="/banking/opportunities">Opportunities</Link>
          </div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', marginBottom: 14 }}>
        <Stat cap="Pipeline value" big={crore(kpi.pipeline_cr)} foot={`${kpi.live_opps} live opportunities`} />
        <Stat cap="Weighted fee" big={lakh(kpi.weighted_fee_l)} foot={`of ${lakh(kpi.gross_fee_l)} gross`} tone="b2" />
        <Stat cap="Fees realised" big={lakh(kpi.realised_l)} foot={`of ${lakh(kpi.mandated_l)} mandated`} tone="b3" />
        <Stat cap="Win rate" big={`${derived.winPct}%`} foot={`${derived.won} won · ${derived.lost} lost`} tone="b4" />
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1.4fr', marginBottom: 14 }}>
        <Card title="By division" extra={<span className="eyebrow">Gross pipeline fee</span>}>
          {derived.byDivision.length ? derived.byDivision.map(d => (
            <div key={d.division || 'Unassigned'} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
              <span style={{ fontSize: 12.5, width: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.division || 'Unassigned'}</span>
              <span className="bar-track"><i style={{ width: `${(num(d.gross_fee_l) / divMax) * 100}%`, background: 'linear-gradient(90deg,var(--navy),var(--teal))' }} /></span>
              <span className="mono" style={{ fontSize: 11.5, width: 64, textAlign: 'right' }}>{lakh(d.gross_fee_l)}</span>
            </div>
          )) : <p style={{ color: 'var(--muted)', margin: 0 }}>Nothing in the pipeline yet.</p>}
        </Card>
        <Card title="Pipeline funnel" extra={<span className="eyebrow">Fee value by stage</span>}>
          {derived.funnelRows.some(r => r.deals) ? <>
            {derived.funnelRows.map((r, i) => (
              <div key={r.stage} className="funnel-row">
                <span style={{ fontSize: 12, width: 78, flex: 'none' }}>{r.stage}</span>
                <div className="funnel-bar" style={{ width: `${Math.max(8, (r.fee / derived.funnelMax) * 100)}%`, background: FUNNEL_COLORS[i] }}>{r.fee ? lakh(r.fee) : ''}</div>
                <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{r.deals}</span>
              </div>
            ))}
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)' }}>Bar length is expected fee; the number on the right is deal count.</div>
          </> : <p style={{ color: 'var(--muted)', margin: 0 }}>No opportunities yet.</p>}
        </Card>
      </div>

      <Card title="Pipeline by deal type" extra={<span className="eyebrow">Gross vs weighted fee</span>}>
        <div style={{ height: 250 }}>
          <Bar data={{
            labels: derived.byDealType.map(d => d.deal_type),
            datasets: [
              { label: 'Gross fee', data: derived.byDealType.map(d => num(d.gross_fee_l)), backgroundColor: '#C8D3E6', borderRadius: 3 },
              { label: 'Weighted', data: derived.byDealType.map(d => num(d.weighted_fee_l)), backgroundColor: '#23408E', borderRadius: 3 }
            ]
          }} options={noAspect({ plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true, ticks: { callback: v => `₹${v}L` } } } })} />
        </div>
      </Card>

      <div style={{ height: 14 }} />

      <div className="grid" style={{ gridTemplateColumns: '1fr 1.6fr', marginBottom: 14 }}>
        <Card title="Mandate status">
          <div style={{ height: 210 }}>
            <Doughnut data={{
              labels: MND_STATUS,
              datasets: [{ data: derived.statusCounts.some(Boolean) ? derived.statusCounts : [0, 0, 0, 1], backgroundColor: ['#1DB5B6', '#18B485', '#E0A21C', '#D0483F'], borderWidth: 2, borderColor: '#fff' }]
            }} options={noAspect({ cutout: '64%', plugins: { legend: { position: 'right' } } })} />
          </div>
        </Card>
        <Card title="Fee realisation by mandate" extra={<span className="eyebrow">Estimated vs realised</span>}>
          <div style={{ height: 210 }}>
            <Bar data={{
              labels: derived.mList.map(m => m.mandate_no?.slice(-4) || '—'),
              datasets: [
                { label: 'Estimated fee', data: derived.mList.map(m => num(m.estimated_fee_l)), backgroundColor: '#C8D3E6', borderRadius: 3 },
                { label: 'Realised', data: derived.mList.map(m => num(m.realised_fee_l)), backgroundColor: '#18B485', borderRadius: 3 }
              ]
            }} options={noAspect({ plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true, ticks: { callback: v => `₹${v}L` } } } })} />
          </div>
        </Card>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.4fr 1fr', marginBottom: 14 }}>
        <Card title="Top accounts by fees earned">
          {derived.topAccounts.length ? derived.topAccounts.map((a, i) => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
              <span className="rank">{String(i + 1).padStart(2, '0')}</span>
              <span style={{ fontSize: 12.5, width: 150, flex: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
              <span className="bar-track"><i style={{ width: `${(num(a.fees_to_date) / accMax) * 100}%`, background: 'linear-gradient(90deg,var(--navy),var(--teal))' }} /></span>
              <span className="mono" style={{ fontSize: 11.5, width: 56, textAlign: 'right' }}>{lakh(a.fees_to_date)}</span>
            </div>
          )) : <p style={{ color: 'var(--muted)', margin: 0 }}>No fees booked against any account yet.</p>}
        </Card>
        <Card title="Opportunity ageing" extra={<span className="eyebrow">Days in pipeline</span>}>
          <div style={{ height: 200 }}>
            <Bar data={{
              labels: ['0–30 d', '31–60 d', '61–120 d', '120+ d'],
              datasets: [{ data: derived.age, borderRadius: 4, backgroundColor: ['#18B485', '#1DB5B6', '#E0A21C', '#D0483F'] }]
            }} options={noAspect({ plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } })} />
          </div>
        </Card>
      </div>

      <Card title="Mandates signed & fees realised" extra={<span className="eyebrow">Six months</span>}>
        <div style={{ height: 200 }}>
          <ReactChart type="bar" data={{
            labels: derived.mL,
            datasets: [
              { type: 'bar', label: 'Mandates signed', data: derived.mS, backgroundColor: '#23408E', borderRadius: 4, yAxisID: 'y', order: 2 },
              { type: 'line', label: 'Fees realised (₹L)', data: derived.mF, borderColor: '#1DB5B6', backgroundColor: 'rgba(29,181,182,.12)', fill: true, tension: .35, pointRadius: 3, yAxisID: 'y1', order: 1 }
            ]
          }} options={noAspect({
            plugins: { legend: { position: 'bottom' } }, interaction: { mode: 'index', intersect: false },
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 }, position: 'left' }, y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: v => `₹${v}L` } } }
          })} />
        </div>
      </Card>

      <div style={{ height: 14 }} />

      <div className="grid" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
        <Card title="Next actions" extra={<Link className="eyebrow" to="/banking/opportunities">All opportunities</Link>} pad={false}>
          <table className="tbl">
            <thead><tr><th>Opportunity</th><th>Account</th><th>Action</th><th>Due</th></tr></thead>
            <tbody>
              {(data.next_actions || []).length ? data.next_actions.map(a => (
                <tr key={a.opportunity_no}>
                  <td className="mono" style={{ fontSize: 11.5, fontWeight: 600 }}>{a.opportunity_no}</td>
                  <td style={{ fontSize: 12.5 }}>{a.account}</td>
                  <td style={{ fontSize: 12.5 }}>{a.next_action}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{shortDate(a.next_action_due)}</td>
                </tr>
              )) : <Empty cols={4}>No open actions.</Empty>}
            </tbody>
          </table>
        </Card>

        <Card title="Live mandate milestones">
          {derived.activeMandates.length ? derived.activeMandates.map(m => {
            const total = num(m.milestones) || 0, done = num(m.milestones_done) || 0;
            const pct = total ? Math.round((done / total) * 100) : 0;
            return (
              <div key={m.id} style={{ padding: '8px 0', borderBottom: '1px solid #F2F4F8' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="mono" style={{ fontSize: 11.5, fontWeight: 600 }}>{m.mandate_no}</span>
                  <span className="mono" style={{ fontSize: 11.5 }}>{done}/{total}</span>
                </div>
                <div style={{ fontSize: 12.5 }}>{m.account}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <div className="prog"><i style={{ width: `${pct}%`, background: 'var(--teal)' }} /></div>
                  <span className="mono" style={{ fontSize: 11 }}>{pct}%</span>
                </div>
              </div>
            );
          }) : <p style={{ color: 'var(--muted)', margin: 0 }}>No active mandates yet.</p>}
        </Card>
      </div>
    </>
  );
}
