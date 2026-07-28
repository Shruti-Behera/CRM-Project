import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, Doughnut } from 'react-chartjs-2';
import { Chart, BarElement, CategoryScale, LinearScale, ArcElement, Tooltip, Legend } from 'chart.js';
import { get, post, shortDate } from '../lib/api.js';
import { Card, Avatar, Loading, Empty, ErrorNote, Modal } from '../components/Bits.jsx';

Chart.register(BarElement, CategoryScale, LinearScale, ArcElement, Tooltip, Legend);

const RAY = ['#23408E', '#1D5D9D', '#2596C2', '#20B7D2', '#1DB5B6', '#0FB59F', '#18B485', '#8794AB'];
const softGet = (p) => get(p).then(r => r || []).catch(() => []);
const todayIso = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const ymd = (s) => (s || '').slice(0, 10);
const noAspect = (o = {}) => ({ maintainAspectRatio: false, ...o });

export default function TimeLog() {
  const [logs, setLogs] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [err, setErr] = useState('');
  const [f, setF] = useState({ q: '', who: '', from: '', to: '' });
  const [log, setLog] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => get('/time-logs').then(setLogs).catch(e => setErr(e.message));
  useEffect(() => { load(); softGet('/assignments').then(setTasks); }, []);

  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const clear = () => setF({ q: '', who: '', from: '', to: '' });

  const people = useMemo(() => [...new Set((logs || []).map(l => l.who).filter(Boolean))].sort(), [logs]);

  const filtered = useMemo(() => {
    if (!logs) return [];
    const q = f.q.toLowerCase();
    return logs.filter(l =>
      (!f.who || l.who === f.who) &&
      (!f.from || ymd(l.log_date) >= f.from) &&
      (!f.to || ymd(l.log_date) <= f.to) &&
      (!q || `${l.title} ${l.assignment_no} ${l.narration || ''}`.toLowerCase().includes(q)));
  }, [logs, f]);

  const openLog = () => setLog({ assignment_id: '', log_date: todayIso(), hours: 1, narration: '' });
  const saveLog = async () => {
    if (!log.assignment_id) { setErr('Pick an assignment'); return; }
    if (!Number(log.hours)) { setErr('Enter hours'); return; }
    setBusy(true);
    try {
      await post(`/assignments/${log.assignment_id}/time`, {
        log_date: log.log_date, hours: Number(log.hours), narration: log.narration || undefined
      });
      setLog(null); setErr(''); await load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  if (err && !logs) return <ErrorNote>{err}</ErrorNote>;
  if (!logs) return <Loading />;

  const totalHours = filtered.reduce((n, l) => n + Number(l.hours || 0), 0);
  const estimated = tasks.reduce((n, t) => n + Number(t.estimated_hours || 0), 0);
  const entriesToday = logs.filter(l => ymd(l.log_date) === todayIso()).length;

  const byPerson = people.map(w => ({ w, h: logs.filter(l => l.who === w).reduce((n, l) => n + Number(l.hours || 0), 0) }));
  const depts = [...new Set(logs.map(l => l.department || 'Unassigned'))];
  const byDept = depts.map(dp => logs.filter(l => (l.department || 'Unassigned') === dp).reduce((n, l) => n + Number(l.hours || 0), 0));

  const kpis = [
    [`${totalHours}h`, 'Total logged', ''],
    [filtered.length, 'Entries', 'b2'],
    [people.length, 'People', 'b4'],
    [`${estimated}h`, 'Estimated', 'b3'],
    [entriesToday, 'Entries today', 'b5']
  ];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div><div className="eyebrow">Effort recorded across assignments</div><h3>Time log</h3></div>
        <button className="btn primary" onClick={openLog}>Log time</button>
      </div>
      {err && <ErrorNote>{err}</ErrorNote>}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', marginBottom: 14 }}>
        {kpis.map(([v, l, tone]) => (
          <div key={l} className={`stat ${tone}`}><div className="cap">{l}</div><div className="big">{v}</div></div>
        ))}
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 14 }}>
        <Card title="Hours by person">
          <div style={{ height: 220 }}>
            <Bar data={{
              labels: byPerson.length ? byPerson.map(x => x.w) : ['—'],
              datasets: [{ data: byPerson.map(x => x.h), backgroundColor: RAY[0], borderRadius: 4, barThickness: 18 }]
            }} options={noAspect({ indexAxis: 'y', plugins: { legend: { display: false } },
              scales: { x: { beginAtZero: true, ticks: { callback: v => `${v}h` } } } })} />
          </div>
        </Card>
        <Card title="Hours by department">
          <div style={{ height: 220 }}>
            <Doughnut data={{
              labels: depts.length ? depts : ['—'],
              datasets: [{ data: byDept.length ? byDept : [1], backgroundColor: RAY, borderWidth: 2, borderColor: '#fff' }]
            }} options={noAspect({ cutout: '58%', plugins: { legend: { position: 'right' } } })} />
          </div>
        </Card>
      </div>

      <Card>
        <div className="filters">
          <div><label>Search</label><input placeholder="Task, no. or narration" value={f.q} onChange={e => set('q', e.target.value)} /></div>
          <div><label>Person</label>
            <select value={f.who} onChange={e => set('who', e.target.value)}>
              <option value="">All</option>{people.map(n => <option key={n}>{n}</option>)}
            </select></div>
          <div><label>From</label><input type="date" value={f.from} onChange={e => set('from', e.target.value)} /></div>
          <div><label>To</label><input type="date" value={f.to} onChange={e => set('to', e.target.value)} /></div>
          <div><label>&nbsp;</label><button className="btn" style={{ width: '100%' }} onClick={clear}>Clear</button></div>
        </div>
      </Card>

      <div style={{ height: 14 }} />

      <Card pad={false}>
        <table className="tbl">
          <thead><tr><th>Date</th><th>Who</th><th>Task</th><th>Department</th><th style={{ textAlign: 'right' }}>Hours</th><th>Narration</th></tr></thead>
          <tbody>
            {filtered.length ? filtered.map(l => (
              <tr key={l.id}>
                <td className="mono" style={{ fontSize: 12 }}>{shortDate(l.log_date)}</td>
                <td><Avatar name={l.who} size={22} /> <span style={{ fontSize: 12.5 }}>{l.who}</span></td>
                <td><Link to={`/internal/assignments/${l.assignment_id}`} className="mono" style={{ fontSize: 11.5, fontWeight: 600 }}>{l.assignment_no}</Link>
                  {' '}<span style={{ fontSize: 12.5 }}>{l.title}</span></td>
                <td style={{ fontSize: 12.5 }}>{l.department || '—'}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{Number(l.hours)}h</td>
                <td style={{ fontSize: 12.5 }}>{l.narration || '—'}</td>
              </tr>
            )) : <Empty cols={6}>No time logged yet. Use the button above to record effort.</Empty>}
          </tbody>
        </table>
        <div className="eyebrow" style={{ padding: '10px 15px' }}>{filtered.length} of {logs.length} entries · {totalHours}h</div>
      </Card>

      {log && (
        <Modal title="Log time" saveLabel="Log time" busy={busy} onClose={() => setLog(null)} onSave={saveLog}>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
            <div style={{ gridColumn: '1 / -1' }}><label>Assignment</label>
              <select value={log.assignment_id} onChange={e => setLog(v => ({ ...v, assignment_id: e.target.value }))}>
                <option value="">— pick an assignment —</option>
                {tasks.map(t => <option key={t.id} value={t.id}>{t.assignment_no} — {t.title}</option>)}
              </select></div>
            <div><label>Date</label><input type="date" value={log.log_date} onChange={e => setLog(v => ({ ...v, log_date: e.target.value }))} /></div>
            <div><label>Hours</label><input type="number" step="0.25" value={log.hours} onChange={e => setLog(v => ({ ...v, hours: e.target.value }))} /></div>
            <div style={{ gridColumn: '1 / -1' }}><label>Narration</label>
              <input value={log.narration} onChange={e => setLog(v => ({ ...v, narration: e.target.value }))} /></div>
          </div>
        </Modal>
      )}
    </>
  );
}
