import { useEffect, useState } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart, BarElement, CategoryScale, LinearScale, ArcElement, Tooltip, Legend
} from 'chart.js';
import { get, lakh, crore, shortDate } from '../lib/api.js';
import { Stat, Card, Loading, ErrorNote, Empty } from '../components/Bits.jsx';

Chart.register(BarElement, CategoryScale, LinearScale, ArcElement, Tooltip, Legend);
Chart.defaults.font.family = "'Poppins', system-ui, sans-serif";
Chart.defaults.font.size = 10.5;
Chart.defaults.color = '#69748A';

/* the logo's rays, left to right */
const RAY = ['#23408E','#1D5D9D','#2596C2','#20B7D2','#1DB5B6','#0FB59F','#18B485','#8794AB'];

export default function BankingDashboard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => { get('/dashboards/banking').then(setData).catch(e => setErr(e.message)); }, []);

  if (err) return <ErrorNote>{err}</ErrorNote>;
  if (!data) return <Loading />;

  const { kpi, funnel, by_division, by_deal_type, next_actions } = data;

  return (
    <>
      <div className="hero">
        <div className="eyebrow" style={{ color: '#B9C6E2' }}>Investment &amp; Merchant Banking</div>
        <h3 style={{ marginTop: 4 }}>Pipeline &amp; mandates</h3>
        <div style={{ color: '#B9C6E2', fontSize: 12.5 }}>
          {kpi.live_opps} live opportunities · {kpi.active || 0} active mandates
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', marginBottom: 14 }}>
        <Stat cap="Pipeline value" big={crore(kpi.pipeline_cr)} foot={`${kpi.live_opps} live`} />
        <Stat cap="Weighted fee" big={lakh(kpi.weighted_fee_l)} foot={`of ${lakh(kpi.gross_fee_l)} gross`} tone="b2" />
        <Stat cap="Fees realised" big={lakh(kpi.realised_l)} foot={`of ${lakh(kpi.mandated_l)} mandated`} tone="b3" />
        <Stat cap="Mandates" big={kpi.total || 0} foot={`${kpi.active || 0} active`} tone="b4" />
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 14 }}>
        <Card title="By division">
          {by_division.length ? (
            <Doughnut data={{
              labels: by_division.map(d => d.division || 'Unassigned'),
              datasets: [{ data: by_division.map(d => Number(d.gross_fee_l)),
                backgroundColor: RAY, borderWidth: 2, borderColor: '#fff' }]
            }} options={{ cutout: '58%', plugins: { legend: { position: 'right' } } }} />
          ) : <p style={{ color: 'var(--muted)' }}>Nothing in the pipeline yet.</p>}
        </Card>

        <Card title="Pipeline by stage">
          <Bar data={{
            labels: funnel.map(f => f.stage),
            datasets: [
              { label: 'Gross fee', data: funnel.map(f => Number(f.gross_fee_l)), backgroundColor: '#C8D3E6' },
              { label: 'Weighted', data: funnel.map(f => Number(f.weighted_fee_l)), backgroundColor: RAY[0] }
            ]
          }} options={{ plugins: { legend: { position: 'bottom' } },
            scales: { y: { beginAtZero: true, ticks: { callback: v => `₹${v}L` } } } }} />
        </Card>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.2fr 1fr' }}>
        <Card title="Pipeline by deal type">
          <Bar data={{
            labels: by_deal_type.map(d => d.deal_type),
            datasets: [{ data: by_deal_type.map(d => Number(d.gross_fee_l)),
              backgroundColor: RAY[3], borderRadius: 3 }]
          }} options={{ indexAxis: 'y', plugins: { legend: { display: false } },
            scales: { x: { beginAtZero: true, ticks: { callback: v => `₹${v}L` } } } }} />
        </Card>

        <Card title="Next actions" pad={false}>
          <table className="tbl">
            <thead><tr><th>Deal</th><th>Account</th><th>Due</th></tr></thead>
            <tbody>
              {next_actions.length ? next_actions.map(a => (
                <tr key={a.opportunity_no}>
                  <td className="mono" style={{ fontSize: 11.5 }}>{a.opportunity_no}</td>
                  <td>{a.account}<div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{a.next_action}</div></td>
                  <td className="mono" style={{ fontSize: 12 }}>{shortDate(a.next_action_due)}</td>
                </tr>
              )) : <Empty cols={3}>No open actions.</Empty>}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
