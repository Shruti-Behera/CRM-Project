import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart, BarElement, CategoryScale, LinearScale, ArcElement, Tooltip, Legend
} from 'chart.js';
import { get, post, inr, shortDate } from '../lib/api.js';
import { Stat, Card, Pill, Avatar, Loading, Empty, ErrorNote, Modal } from '../components/Bits.jsx';
import { useAuth } from '../lib/auth.jsx';
import { dictate, speechSupported } from '../lib/voice.js';

Chart.register(BarElement, CategoryScale, LinearScale, ArcElement, Tooltip, Legend);

const RAY = ['#23408E', '#1D5D9D', '#2596C2', '#20B7D2', '#1DB5B6', '#0FB59F', '#18B485', '#8794AB'];
const SEG_COLORS = { Cash: '#23408E', 'F&O': '#20B7D2', 'Block / Bulk': '#18B485' };
const REPORT_TYPES = ['Sector report', 'Stock initiation', 'Stock update', 'Result update', 'Event update', 'Thematic', 'Model portfolio', 'Morning note'];
const RECOS = ['Buy', 'Accumulate', 'Hold', 'Reduce', 'Sell', 'Not rated'];
const VISIT_TYPES = ['Client visit', 'Office meeting', 'Call', 'Video call', 'Conference', 'Roadshow', 'Analyst day'];
const noAspect = (o = {}) => ({ maintainAspectRatio: false, ...o });
const thisMonth = () => new Date().toISOString().slice(0, 7);
const softGet = (p) => get(p).then(r => r || []).catch(() => []);
const ymd = (s) => (s || '').slice(0, 10);
const todayIso = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const dPlus = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return todayIsoOf(d); };
const todayIsoOf = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export default function InstitutionalDashboard() {
  const { can } = useAuth();
  const [data, setData] = useState(null);
  const [visits, setVisits] = useState([]);
  const [reports, setReports] = useState([]);
  const [clients, setClients] = useState([]);
  const [sectors, setSectors] = useState([]);
  const [users, setUsers] = useState([]);
  const [err, setErr] = useState('');
  const [reportForm, setReportForm] = useState(null);
  const [voice, setVoice] = useState(null);
  const [busy, setBusy] = useState(false);
  const recRef = useRef(null);

  const loadAll = () => {
    get('/dashboards/institutional').then(setData).catch(e => setErr(e.message));
    softGet('/institutions/visits/all').then(setVisits);
    softGet('/research-reports').then(setReports);
  };
  useEffect(() => {
    loadAll();
    softGet('/institutions').then(setClients);
    softGet('/masters/sectors').then(setSectors);
    softGet('/users').then(setUsers);
  }, []);

  const charts = useMemo(() => {
    if (!data) return null;
    const monthly = data.monthly || [];
    const months = [...new Set(monthly.map(m => m.period_month))].sort();
    const segments = [...new Set(monthly.map(m => m.segment))];
    const brokByMonth = {
      labels: months,
      datasets: segments.map(seg => ({
        label: seg,
        data: months.map(mo => monthly.filter(m => m.period_month === mo && m.segment === seg).reduce((n, m) => n + Number(m.brokerage || 0), 0)),
        backgroundColor: SEG_COLORS[seg] || '#8794AB', borderRadius: 2
      }))
    };

    // reports by type
    const rTypes = REPORT_TYPES.filter(t => reports.some(r => r.report_type === t));
    const byType = { labels: rTypes.length ? rTypes : ['—'], datasets: [{ data: rTypes.map(t => reports.filter(r => r.report_type === t).length), backgroundColor: RAY, borderWidth: 2, borderColor: '#fff' }] };

    // coverage by sector (published)
    const pub = reports.filter(r => r.status === 'Published');
    const secs = [...new Set(pub.map(r => r.sector || 'Unassigned'))];
    const bySector = { labels: secs.length ? secs : ['—'], datasets: [{ data: secs.map(s => pub.filter(r => (r.sector || 'Unassigned') === s).length), backgroundColor: RAY[3], borderRadius: 3 }] };

    // interactions by person (last 30 days)
    const since30 = dPlus(-30);
    const people = [...new Set(visits.map(v => v.logged_by_name).filter(Boolean))];
    const byPerson = { labels: people.length ? people : ['—'], datasets: [{ data: people.map(p => visits.filter(v => v.logged_by_name === p && ymd(v.visit_date) >= since30).length), backgroundColor: RAY[0], borderRadius: 3, barThickness: 16 }] };

    // daily movement last 14 days
    const days = [], counts = [];
    for (let i = 13; i >= 0; i--) { const day = dPlus(-i); days.push(shortDate(day)); counts.push(visits.filter(v => ymd(v.visit_date) === day).length); }
    const daily = { labels: days, datasets: [{ label: 'Interactions', data: counts, backgroundColor: RAY[4], borderRadius: 3 }] };

    return { brokByMonth, months, byType, bySector, byPerson, daily };
  }, [data, reports, visits]);

  const stopVoice = () => { try { recRef.current?.stop(); } catch { /* noop */ } recRef.current = null; };
  const openVoice = () => setVoice({ institution_id: '', visit_type: 'Client visit', visit_date: todayIso(), agenda: '', listening: false });
  const startListening = () => {
    setVoice(v => ({ ...v, listening: true }));
    recRef.current = dictate(
      (text) => setVoice(v => ({ ...v, agenda: text })),
      (final, error) => { setVoice(v => v ? { ...v, listening: false } : v); if (error === 'unsupported') setErr('Voice input needs Chrome or Edge'); }
    );
  };
  const saveVoice = async () => {
    stopVoice();
    if (!voice.institution_id) { setErr('Pick a client'); return; }
    setBusy(true);
    try {
      await post(`/institutions/${voice.institution_id}/visits`, {
        visit_date: voice.visit_date, visit_type: voice.visit_type,
        agenda: voice.agenda || undefined, source: 'voice', transcript: voice.agenda || undefined
      });
      setVoice(null); setErr(''); loadAll();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const openReport = () => setReportForm({
    title: '', report_type: 'Stock update', sector_id: '', symbol: '', analyst_id: '',
    recommendation: 'Not rated', cmp: '', target_price: '', report_date: todayIso(), summary: '', status: 'Draft'
  });
  const setR = (k, v) => setReportForm(f => ({ ...f, [k]: v }));
  const saveReport = async () => {
    if (!reportForm.title.trim()) { setErr('Give the report a title'); return; }
    setBusy(true);
    try {
      await post('/research-reports', {
        title: reportForm.title, report_type: reportForm.report_type,
        sector_id: reportForm.sector_id ? Number(reportForm.sector_id) : undefined,
        symbol: reportForm.symbol || undefined,
        analyst_id: reportForm.analyst_id ? Number(reportForm.analyst_id) : undefined,
        recommendation: reportForm.recommendation, cmp: Number(reportForm.cmp) || 0,
        target_price: Number(reportForm.target_price) || 0, report_date: reportForm.report_date,
        summary: reportForm.summary || undefined, status: reportForm.status
      });
      setReportForm(null); setErr(''); loadAll();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  if (err && !data) return <ErrorNote>{err}</ErrorNote>;
  if (!data || !charts) return <Loading />;

  const { kpi, monthly = [], top_clients = [], cold = [] } = data;
  const tmVol = monthly.filter(m => m.period_month === thisMonth()).reduce((n, m) => n + Number(m.turnover || 0), 0);
  const weekVisits = Number(kpi.visits_week) || 0;
  const published = reports.filter(r => r.status === 'Published').length;
  const topMax = Math.max(1, ...top_clients.map(c => Number(c.brokerage)));

  return (
    <>
      <div className="hero">
        <div className="eyebrow" style={{ color: '#B9C6E2' }}>Institutional Business</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h3 style={{ marginTop: 4 }}>Coverage, research and flow</h3>
            <div style={{ color: '#B9C6E2', fontSize: 12.5 }}>
              {kpi.clients} clients · {weekVisits} interaction{weekVisits === 1 ? '' : 's'} this week · {published || kpi.reports} report{(published || Number(kpi.reports)) === 1 ? '' : 's'} published
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {can('institutional.create') && <button className="btn" onClick={() => { openVoice(); setTimeout(startListening, 60); }}>🎤 Speak an update</button>}
            {can('institutional.create') && <button className="btn" onClick={openVoice}>Log interaction</button>}
            {can('research.create') && <button className="btn teal" onClick={openReport}>New report</button>}
          </div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', marginBottom: 14 }}>
        <Stat cap="Brokerage MTD" big={inr(kpi.brokerage_mtd)} foot={`${inr(tmVol)} turnover`} />
        <Stat cap="Interactions MTD" big={weekVisits} foot="last 7 days" tone="b2" />
        <Stat cap="Reports published" big={published || Number(kpi.reports) || 0} foot={`${reports.filter(r => r.status === 'Draft').length} in draft`} tone="b3" />
        <Stat cap="Not met in 30 days" big={cold.length} foot={`of ${kpi.clients} covered`} tone={cold.length ? 'b5' : 'b3'} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.4fr 1fr', marginBottom: 14 }}>
        <Card title="Brokerage by month" extra={<span className="eyebrow">Cash vs F&amp;O</span>}>
          <div style={{ height: 230 }}>
            {charts.months.length ? <Bar data={charts.brokByMonth} options={noAspect({ plugins: { legend: { position: 'bottom' } }, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } })} />
              : <p style={{ color: 'var(--muted)' }}>No brokerage booked yet.</p>}
          </div>
        </Card>
        <Card title="Top clients by brokerage">
          {top_clients.length ? top_clients.map((c, i) => (
            <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
              <span className="mono" style={{ fontSize: 11.5, color: 'var(--muted)', width: 18 }}>{i + 1}</span>
              <span style={{ fontSize: 12.5, width: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
              <span className="bar-track"><i style={{ width: `${(Number(c.brokerage) / topMax) * 100}%`, background: 'linear-gradient(90deg,var(--navy),var(--teal))' }} /></span>
              <span className="mono" style={{ fontSize: 11.5, width: 78, textAlign: 'right' }}>{inr(c.brokerage)}</span>
            </div>
          )) : <p style={{ color: 'var(--muted)', margin: 0 }}>No brokerage yet.</p>}
        </Card>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1.4fr', marginBottom: 14 }}>
        <Card title="Reports by type">
          <div style={{ height: 230 }}><Doughnut data={charts.byType} options={noAspect({ cutout: '58%', plugins: { legend: { position: 'right', labels: { font: { size: 10 } } } } })} /></div>
        </Card>
        <Card title="Coverage by sector" extra={<span className="eyebrow">reports published</span>}>
          <div style={{ height: 230 }}><Bar data={charts.bySector} options={noAspect({ plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } })} /></div>
        </Card>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 14 }}>
        <Card title="Interactions by person" extra={<span className="eyebrow">last 30 days</span>}>
          <div style={{ height: 210 }}><Bar data={charts.byPerson} options={noAspect({ indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } } })} /></div>
        </Card>
        <Card title="Daily movement" extra={<span className="eyebrow">last 14 days</span>}>
          <div style={{ height: 210 }}><Bar data={charts.daily} options={noAspect({ plugins: { legend: { display: false } }, scales: { x: { ticks: { font: { size: 9 } } }, y: { beginAtZero: true, ticks: { stepSize: 1 } } } })} /></div>
        </Card>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
        <Card title="Latest interactions" extra={<Link className="eyebrow" to="/institutional/movement">All movement</Link>} pad={false}>
          <table className="tbl">
            <thead><tr><th>Date</th><th>Client</th><th>Type</th><th>Ideas discussed</th><th>By</th></tr></thead>
            <tbody>
              {visits.length ? visits.slice(0, 6).map(v => (
                <tr key={v.id}>
                  <td className="mono" style={{ fontSize: 12 }}>{shortDate(v.visit_date)}</td>
                  <td style={{ fontSize: 12.5 }}>{v.client}</td>
                  <td><Pill kind="p-progress">{v.visit_type}</Pill></td>
                  <td style={{ fontSize: 12 }}>{v.stocks ? v.stocks.split(',').filter(Boolean).map(sx => <span key={sx} className="tag">{sx}</span>) : (v.agenda || '').slice(0, 40)}</td>
                  <td><Avatar name={v.logged_by_name} size={22} /></td>
                </tr>
              )) : <Empty cols={5}>No interactions logged yet.</Empty>}
            </tbody>
          </table>
        </Card>

        <Card title="Needs a call" extra={<span className="eyebrow">longest since contact</span>}>
          {cold.length ? cold.slice(0, 8).map(c => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #F2F4F8' }}>
              <div><span style={{ fontSize: 13 }}>{c.name}</span>
                <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{c.rm || ''}</div></div>
              <span className="chip down">{c.days_since_met == null ? 'never' : `${c.days_since_met}d`}</span>
            </div>
          )) : <p style={{ color: 'var(--muted)', margin: 0 }}>Everyone's been seen recently.</p>}
        </Card>
      </div>

      {reportForm && (
        <Modal title="New research report" saveLabel="Save report" busy={busy} onClose={() => setReportForm(null)} onSave={saveReport}>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
            <div style={{ gridColumn: '1 / -1' }}><label>Title</label><input value={reportForm.title} onChange={e => setR('title', e.target.value)} /></div>
            <div><label>Type</label><select value={reportForm.report_type} onChange={e => setR('report_type', e.target.value)}>{REPORT_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
            <div><label>Sector</label><select value={reportForm.sector_id} onChange={e => setR('sector_id', e.target.value)}><option value="">None</option>{sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div><label>Symbol</label><input value={reportForm.symbol} onChange={e => setR('symbol', e.target.value)} /></div>
            <div><label>Analyst</label><select value={reportForm.analyst_id} onChange={e => setR('analyst_id', e.target.value)}><option value="">Me</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
            <div><label>Recommendation</label><select value={reportForm.recommendation} onChange={e => setR('recommendation', e.target.value)}>{RECOS.map(r => <option key={r}>{r}</option>)}</select></div>
            <div><label>Report date</label><input type="date" value={reportForm.report_date} onChange={e => setR('report_date', e.target.value)} /></div>
            <div><label>CMP</label><input type="number" value={reportForm.cmp} onChange={e => setR('cmp', e.target.value)} /></div>
            <div><label>Target price</label><input type="number" value={reportForm.target_price} onChange={e => setR('target_price', e.target.value)} /></div>
            <div><label>Status</label><select value={reportForm.status} onChange={e => setR('status', e.target.value)}><option>Draft</option><option>Published</option></select></div>
            <div style={{ gridColumn: '1 / -1' }}><label>Summary</label><textarea rows={3} value={reportForm.summary} onChange={e => setR('summary', e.target.value)} /></div>
          </div>
        </Modal>
      )}

      {voice && (
        <Modal title="Speak an update" saveLabel="Log it" busy={busy} onClose={() => { stopVoice(); setVoice(null); }} onSave={saveVoice}>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
            <div style={{ gridColumn: '1 / -1' }}><label>Client</label>
              <select value={voice.institution_id} onChange={e => setVoice(v => ({ ...v, institution_id: e.target.value }))}>
                <option value="">— pick a client —</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
            <div><label>Date</label><input type="date" value={voice.visit_date} onChange={e => setVoice(v => ({ ...v, visit_date: e.target.value }))} /></div>
            <div><label>Type</label><select value={voice.visit_type} onChange={e => setVoice(v => ({ ...v, visit_type: e.target.value }))}>{VISIT_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Spoken notes</span>
                {speechSupported()
                  ? <button type="button" className="btn" style={{ padding: '0 8px' }} onClick={voice.listening ? stopVoice : startListening}>{voice.listening ? '■ Stop' : '🎤 Start'}</button>
                  : <span className="eyebrow" style={{ color: 'var(--red)' }}>Chrome / Edge only</span>}
              </label>
              <textarea rows={4} value={voice.agenda} placeholder="Press Start and speak — the transcript appears here"
                onChange={e => setVoice(v => ({ ...v, agenda: e.target.value }))} />
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
