import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, lakh, crore, shortDate } from '../lib/api.js';
import { Card, Pill, stageTone, Loading, Empty, ErrorNote } from '../components/Bits.jsx';
import { Kpi, mCls, MND_HEADERS, mndRowX } from './Mandates.jsx';
import { downloadXLSX, bankingName } from '../lib/xlsx.js';
import { Bar, Doughnut, PolarArea } from 'react-chartjs-2';
import { Chart, BarElement, CategoryScale, LinearScale, ArcElement, RadialLinearScale, Tooltip, Legend } from 'chart.js';

Chart.register(BarElement, CategoryScale, LinearScale, ArcElement, RadialLinearScale, Tooltip, Legend);

const STAGES = ['Lead', 'Qualified', 'Pitched', 'Term Sheet', 'Mandated', 'Closed Won', 'Lost'];
const OPEN_STAGES = ['Lead', 'Qualified', 'Pitched', 'Term Sheet', 'Mandated'];
const MND_STATUS = ['Active', 'Executed', 'On Hold', 'Terminated'];
const C = { navy: '#23408E', blue: '#1D5D9D', cyan: '#20B7D2', teal: '#1DB5B6', aqua: '#0FB59F', green: '#18B485', amber: '#E0A21C', red: '#D0483F', grey: '#8794AB' };
const PALETTE = [C.navy, C.blue, '#2596C2', C.cyan, C.teal, C.aqua, C.green, C.grey];
const num = (v) => Number(v || 0);
const sum = (arr, f) => arr.reduce((n, x) => n + num(f(x)), 0);
const uniq = (arr) => [...new Set(arr.filter(Boolean))];
const softGet = (p) => get(p).then(r => r || []).catch(() => []);

const ChartBox = ({ h = 230, children }) => <div style={{ height: h }}>{children}</div>;
const barY = { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } }, y: { grid: { display: false } } } };

// ---- Excel row builders (kept local so the Reports page never edits other modules) ----
const ACC_HEADERS = ['Code', 'Account', 'Sector', 'Type', 'Owner', 'City', 'Since', 'KYC', 'Contact', 'Designation', 'Email', 'Phone', 'Fees Earned (L)', 'Status'];
const accRowX = (a) => [a.account_code, a.name, a.sector, a.account_type, a.owner, a.city,
  a.client_since ? String(a.client_since).slice(0, 10) : '', a.kyc_status, a.contact, a.contact_designation,
  a.contact_email, `${a.phone_code || ''} ${a.phone_number || ''}`.trim(), num(a.fees_to_date), a.status];
const OPP_HEADERS = ['No', 'Account', 'Deal Type', 'Stage', 'Size (cr)', 'Fee (L)', 'Probability %', 'Weighted (L)',
  'Expected Close', 'Owner', 'Source', 'Next Action', 'Action Due', 'Created', 'Days in Pipeline'];
const oppRowX = (o) => [o.opportunity_no, o.account, o.deal_type, o.stage, num(o.txn_size_cr), num(o.expected_fee_l),
  num(o.probability_pct), num(o.weighted_fee_l), o.expected_close ? String(o.expected_close).slice(0, 10) : '',
  o.owner, o.source, o.next_action || '', o.next_action_due ? String(o.next_action_due).slice(0, 10) : '',
  o.created || '', num(o.age_days)];

export default function BankingReports() {
  const nav = useNavigate();
  const [tab, setTab] = useState('pipeline');
  const [data, setData] = useState(null);   // { opps, mandates, accounts }
  const [err, setErr] = useState('');

  useEffect(() => {
    Promise.all([softGet('/opportunities'), softGet('/mandates'), softGet('/accounts')])
      .then(([opps, mandates, accounts]) => setData({ opps, mandates, accounts }))
      .catch(e => setErr(e.message));
  }, []);

  const sectorOf = useMemo(() => {
    const m = {}; (data?.accounts || []).forEach(a => { m[a.name] = a.sector; }); return m;
  }, [data]);

  const exportAll = () => {
    if (!data) return;
    const { opps, mandates, accounts } = data;
    const live = opps.filter(o => OPEN_STAGES.includes(o.stage) && num(o.is_converted) === 0);
    const est = sum(mandates, m => m.estimated_fee_l), real = sum(mandates, m => m.realised_fee_l);
    downloadXLSX(bankingName('.xlsx'), [
      { name: 'Summary', headers: ['Measure', 'Value'], rows: [
        ['Report generated', new Date().toLocaleString('en-IN')],
        ['Active accounts', accounts.filter(a => a.status === 'Active').length],
        ['Live opportunities', live.length],
        ['Pipeline transaction value (cr)', sum(live, o => o.txn_size_cr)],
        ['Gross pipeline fee (L)', sum(live, o => o.expected_fee_l)],
        ['Weighted pipeline fee (L)', Math.round(sum(live, o => o.weighted_fee_l))],
        ['Mandates', mandates.length],
        ['Fee mandated (L)', est], ['Fee realised (L)', real], ['Fee outstanding (L)', est - real]] },
      { name: 'Accounts', headers: ACC_HEADERS, rows: accounts.map(accRowX) },
      { name: 'Opportunities', headers: OPP_HEADERS, rows: opps.map(oppRowX) },
      { name: 'Mandates', headers: MND_HEADERS, rows: mandates.map(mndRowX) }
    ]);
  };

  if (err && !data) return <ErrorNote>{err}</ErrorNote>;
  if (!data) return <Loading />;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div><div className="eyebrow">Pipeline, fees and accounts</div><h3>Banking reports</h3></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={exportAll}>Excel</button>
          <button className="btn" onClick={() => window.print()}>Print</button>
        </div>
      </div>

      <div className="tab-x">
        {[['pipeline', 'Pipeline report'], ['fee', 'Fee & mandate report'], ['acct', 'Account report']].map(([k, l]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'pipeline' && <Pipeline opps={data.opps} sectorOf={sectorOf} nav={nav} />}
      {tab === 'fee' && <FeeReport mandates={data.mandates} nav={nav} />}
      {tab === 'acct' && <AccountReport {...data} nav={nav} />}
    </>
  );
}

/* ------------------------------------------------------- Pipeline report */
function Pipeline({ opps, sectorOf, nav }) {
  const live = opps.filter(o => OPEN_STAGES.includes(o.stage) && num(o.is_converted) === 0);
  const kpis = [
    { v: live.length, l: 'Live opportunities' },
    { v: crore(sum(live, o => o.txn_size_cr)), l: 'Transaction value', t: 'b' },
    { v: lakh(sum(live, o => o.expected_fee_l)), l: 'Gross fee', t: 'o' },
    { v: lakh(Math.round(sum(live, o => o.weighted_fee_l))), l: 'Weighted fee', t: 'g' },
    { v: opps.filter(o => o.stage === 'Lost').length, l: 'Lost', t: 'r' },
    { v: live.length ? Math.round(sum(live, o => num(o.age_days)) / live.length) : 0, l: 'Avg age (days)', t: 'a' }
  ];
  const stageCounts = STAGES.map(s => opps.filter(o => o.stage === s).length);
  const owners = uniq(opps.map(o => o.owner));
  const openBy = (w, f) => sum(opps.filter(o => o.owner === w && OPEN_STAGES.includes(o.stage)), f);

  return (
    <>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', marginBottom: 14 }}>
        {kpis.map((k, i) => <Kpi key={i} {...k} />)}
      </div>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 14 }}>
        <Card title="Stage distribution"><ChartBox>
          <Bar data={{ labels: STAGES, datasets: [{ data: stageCounts, backgroundColor: PALETTE, borderRadius: 4, barThickness: 22 }] }} options={barY} />
        </ChartBox></Card>
        <Card title="Pipeline by owner"><ChartBox>
          <Bar data={{
            labels: owners.length ? owners : ['—'],
            datasets: [
              { label: 'Gross fee', data: owners.map(w => openBy(w, o => o.expected_fee_l)), backgroundColor: '#C8D3E6', borderRadius: 3 },
              { label: 'Weighted', data: owners.map(w => Math.round(openBy(w, o => o.weighted_fee_l))), backgroundColor: C.navy, borderRadius: 3 }
            ]
          }} options={{ maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${lakh(c.raw)}` } } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { callback: v => `₹${v}L` } } } }} />
        </ChartBox></Card>
      </div>
      <Card pad={false}>
        <table className="tbl">
          <thead><tr><th>No.</th><th>Account</th><th>Segment</th><th>Deal type</th><th>Stage</th>
            <th style={{ textAlign: 'right' }}>Size</th><th style={{ textAlign: 'right' }}>Fee</th><th style={{ textAlign: 'right' }}>Prob.</th>
            <th style={{ textAlign: 'right' }}>Weighted</th><th style={{ textAlign: 'right' }}>Age</th><th>Owner</th></tr></thead>
          <tbody>
            {opps.length ? opps.map(o => (
              <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => nav(`/banking/opportunities/${o.id}`)}>
                <td><span className="tid">{o.opportunity_no}</span></td>
                <td style={{ fontSize: 12.5 }}>{o.account}</td>
                <td style={{ fontSize: 12.5 }}>{sectorOf[o.account] || '—'}</td>
                <td style={{ fontSize: 12.5 }}>{o.deal_type}</td>
                <td><Pill kind={stageTone(o.stage)}>{o.stage}</Pill></td>
                <td className="mono" style={{ fontSize: 12, textAlign: 'right' }}>{num(o.txn_size_cr) ? crore(o.txn_size_cr) : '—'}</td>
                <td className="mono" style={{ fontSize: 12, textAlign: 'right' }}>{lakh(o.expected_fee_l)}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{num(o.probability_pct)}%</td>
                <td className="mono" style={{ fontSize: 12, textAlign: 'right' }}>{lakh(o.weighted_fee_l)}</td>
                <td className="mono" style={{ fontSize: 12, textAlign: 'right' }}>{num(o.age_days)}d</td>
                <td style={{ fontSize: 12.5 }}>{o.owner}</td>
              </tr>
            )) : <Empty cols={11}>No opportunities to report.</Empty>}
          </tbody>
        </table>
      </Card>
    </>
  );
}

/* --------------------------------------------------- Fee & mandate report */
function FeeReport({ mandates, nav }) {
  const est = sum(mandates, m => m.estimated_fee_l), real = sum(mandates, m => m.realised_fee_l);
  const kpis = [
    { v: mandates.length, l: 'Mandates' },
    { v: lakh(est), l: 'Fee mandated', t: 'b' },
    { v: lakh(real), l: 'Realised', t: 'g' },
    { v: lakh(est - real), l: 'Outstanding', t: 'a' },
    { v: est ? `${Math.round(100 * real / est)}%` : '0%', l: 'Realisation', t: 'o' },
    { v: crore(sum(mandates, m => m.txn_value_cr)), l: 'Transaction value' }
  ];
  const types = uniq(mandates.map(m => m.deal_type));
  return (
    <>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', marginBottom: 14 }}>
        {kpis.map((k, i) => <Kpi key={i} {...k} />)}
      </div>
      <div className="grid" style={{ gridTemplateColumns: '1.4fr 1fr', marginBottom: 14 }}>
        <Card title="Fee by deal type"><ChartBox>
          <Bar data={{
            labels: types.length ? types : ['—'],
            datasets: [
              { label: 'Estimated', data: types.map(t => sum(mandates.filter(m => m.deal_type === t), m => m.estimated_fee_l)), backgroundColor: '#C8D3E6', borderRadius: 3 },
              { label: 'Realised', data: types.map(t => sum(mandates.filter(m => m.deal_type === t), m => m.realised_fee_l)), backgroundColor: C.green, borderRadius: 3 }
            ]
          }} options={{ maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${lakh(c.raw)}` } } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 35 } }, y: { beginAtZero: true, ticks: { callback: v => `₹${v}L` } } } }} />
        </ChartBox></Card>
        <Card title="Realisation by status"><ChartBox>
          <Doughnut data={{
            labels: MND_STATUS,
            datasets: [{ data: MND_STATUS.map(s => sum(mandates.filter(m => m.status === s), m => m.realised_fee_l) || 0), backgroundColor: [C.teal, C.green, C.amber, C.red], borderWidth: 2, borderColor: '#fff' }]
          }} options={{ maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'right' }, tooltip: { callbacks: { label: c => `${c.label}: ${lakh(c.raw)}` } } } }} />
        </ChartBox></Card>
      </div>
      <Card pad={false}>
        <table className="tbl">
          <thead><tr><th>No.</th><th>Account</th><th>Type</th><th>Signed</th><th>End</th>
            <th style={{ textAlign: 'right' }}>Retainer</th><th style={{ textAlign: 'right' }}>Success %</th>
            <th style={{ textAlign: 'right' }}>Est. fee</th><th style={{ textAlign: 'right' }}>Realised</th>
            <th style={{ textAlign: 'right' }}>Outstanding</th><th>Status</th></tr></thead>
          <tbody>
            {mandates.length ? mandates.map(m => (
              <tr key={m.id} style={{ cursor: 'pointer' }} onClick={() => nav(`/banking/mandates/${m.id}`)}>
                <td><span className="tid">{m.mandate_no}</span></td>
                <td style={{ fontSize: 12.5 }}>{m.account}</td>
                <td style={{ fontSize: 12.5 }}>{m.deal_type}</td>
                <td className="mono" style={{ fontSize: 12 }}>{shortDate(m.signed_on)}</td>
                <td className="mono" style={{ fontSize: 12 }}>{shortDate(m.expected_end)}</td>
                <td className="mono" style={{ fontSize: 12, textAlign: 'right' }}>{lakh(m.retainer_l)}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{num(m.success_fee_pct)}%</td>
                <td className="mono" style={{ fontSize: 12, textAlign: 'right' }}>{lakh(m.estimated_fee_l)}</td>
                <td className="mono" style={{ fontSize: 12, textAlign: 'right', color: 'var(--green)' }}>{lakh(m.realised_fee_l)}</td>
                <td className="mono" style={{ fontSize: 12, textAlign: 'right' }}>{lakh(num(m.estimated_fee_l) - num(m.realised_fee_l))}</td>
                <td><Pill kind={mCls(m.status)}>{m.status}</Pill></td>
              </tr>
            )) : <Empty cols={11}>No mandates to report.</Empty>}
          </tbody>
        </table>
      </Card>
    </>
  );
}

/* ------------------------------------------------------- Account report */
function AccountReport({ accounts, opps, mandates, nav }) {
  const rows = accounts.map(a => {
    const o = opps.filter(x => x.account === a.name), m = mandates.filter(x => x.account === a.name);
    return {
      a, live: o.filter(x => OPEN_STAGES.includes(x.stage)).length,
      won: o.filter(x => ['Mandated', 'Closed Won'].includes(x.stage)).length,
      lost: o.filter(x => x.stage === 'Lost').length, mnd: m.length,
      real: sum(m, x => x.realised_fee_l), pipe: sum(o.filter(x => OPEN_STAGES.includes(x.stage)), x => x.expected_fee_l)
    };
  }).sort((x, y) => y.real - x.real);

  const secs = uniq(accounts.map(a => a.sector));
  const top = rows.filter(r => r.real > 0).slice(0, 8);

  return (
    <>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 14 }}>
        <Card title="Accounts by segment"><ChartBox h={240}>
          <PolarArea data={{
            labels: secs.length ? secs : ['—'],
            datasets: [{ data: secs.length ? secs.map(s => accounts.filter(a => a.sector === s).length) : [1], backgroundColor: PALETTE.map(c => c + 'CC'), borderWidth: 1, borderColor: '#fff' }]
          }} options={{ maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { font: { size: 10 } } } }, scales: { r: { ticks: { display: false } } } }} />
        </ChartBox></Card>
        <Card title="Fees earned by account"><ChartBox h={240}>
          <Bar data={{
            labels: top.length ? top.map(r => r.a.name.split(' ')[0]) : ['—'],
            datasets: [{ data: top.map(r => num(r.real)), backgroundColor: C.teal, borderRadius: 4, barThickness: 18 }]
          }} options={{ ...barY, plugins: { legend: { display: false }, tooltip: { callbacks: { title: i => top[i[0].dataIndex]?.a.name || '', label: c => lakh(c.raw) } } }, scales: { x: { beginAtZero: true, ticks: { callback: v => `₹${v}L` } }, y: { grid: { display: false } } } }} />
        </ChartBox></Card>
      </div>
      <Card pad={false}>
        <table className="tbl">
          <thead><tr><th>Code</th><th>Account</th><th>Segment</th><th>Owner</th>
            <th style={{ textAlign: 'right' }}>Live opps</th><th style={{ textAlign: 'right' }}>Won</th>
            <th style={{ textAlign: 'right' }}>Lost</th><th style={{ textAlign: 'right' }}>Mandates</th>
            <th style={{ textAlign: 'right' }}>Pipeline fee</th><th style={{ textAlign: 'right' }}>Fee realised</th></tr></thead>
          <tbody>
            {rows.length ? rows.map(r => (
              <tr key={r.a.id} style={{ cursor: 'pointer' }} onClick={() => nav(`/banking/accounts/${r.a.id}`)}>
                <td><span className="tid">{r.a.account_code}</span></td>
                <td style={{ fontSize: 12.5, fontWeight: 500 }}>{r.a.name}</td>
                <td style={{ fontSize: 12.5 }}>{r.a.sector || '—'}</td>
                <td style={{ fontSize: 12.5 }}>{r.a.owner}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{r.live}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{r.won}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{r.lost}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{r.mnd}</td>
                <td className="mono" style={{ fontSize: 12, textAlign: 'right' }}>{lakh(r.pipe)}</td>
                <td className="mono" style={{ fontSize: 12, textAlign: 'right', color: 'var(--green)', fontWeight: 600 }}>{lakh(r.real)}</td>
              </tr>
            )) : <Empty cols={10}>No accounts to report.</Empty>}
          </tbody>
        </table>
      </Card>
    </>
  );
}
