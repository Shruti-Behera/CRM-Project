import { useEffect, useState } from 'react';
import { get } from '../lib/api.js';
import { Card, Loading, ErrorNote } from '../components/Bits.jsx';
import { useAuth } from '../lib/auth.jsx';

const LABELS = [
  ['accounts', 'Accounts'], ['opportunities', 'Opportunities'], ['mandates', 'Mandates'],
  ['assignments', 'Assignments'], ['institutions', 'Institutions'], ['users', 'Users'],
  ['meetings', 'Meetings'], ['emails', 'Emails'], ['work_approvals', 'Work approvals'],
  ['activity_logs', 'Activity log entries']
];

export default function DataBackup() {
  const { user } = useAuth();
  const admin = user?.level === 1;
  const [counts, setCounts] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { get('/backup').then(setCounts).catch(e => setErr(e.message)); }, []);

  const exportBackup = async () => {
    setBusy(true);
    try {
      const data = await get('/backup/export');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      a.download = `ashika-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  if (err && !counts) return <ErrorNote>{err}</ErrorNote>;
  if (!counts) return <Loading />;

  const total = LABELS.reduce((n, [k]) => n + Number(counts[k] || 0), 0);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div><div className="eyebrow">Where the system keeps your records</div><h3>Data &amp; backup</h3></div>
        {admin && <button className="btn primary" onClick={exportBackup} disabled={busy}>{busy ? 'Exporting…' : 'Export backup'}</button>}
      </div>
      {err && <ErrorNote>{err}</ErrorNote>}

      <Card title="Storage" extra={<span className="pill p-done">PostgreSQL</span>}>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
          <div><div className="eyebrow">Store</div><div style={{ fontSize: 13.5 }}>PostgreSQL — server database</div></div>
          <div><div className="eyebrow">Total records</div><div style={{ fontSize: 13.5 }} className="mono">{total}</div></div>
          <div><div className="eyebrow">Backup format</div><div style={{ fontSize: 13.5 }}>JSON export</div></div>
        </div>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '10px 0 0' }}>
          Records live in the shared PostgreSQL database, so every user works from the same data — no file to pass around.
        </p>
      </Card>

      <div style={{ height: 14 }} />

      <div className="grid" style={{ gridTemplateColumns: '1fr 1.2fr' }}>
        <Card title="What's stored">
          {LABELS.map(([k, l]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #F2F4F8' }}>
              <span style={{ fontSize: 13 }}>{l}</span>
              <span className="mono" style={{ fontSize: 12.5 }}>{Number(counts[k] || 0)}</span>
            </div>
          ))}
        </Card>

        <Card title="Backup and restore">
          <p style={{ fontSize: 13 }}>
            A backup is an ordinary <span className="mono">.json</span> file exported straight from the database.
            Save it to your drive or a shared folder — it captures the master data and core records.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <button className="btn primary" onClick={exportBackup} disabled={!admin || busy}>Export backup</button>
          </div>
          <div className="err" style={{ background: '#FFF9E9', color: '#7a5b0a' }}>
            <b>Worth knowing.</b> Because everyone shares one PostgreSQL database, a manual restore overwrites
            live data and is a server-side operation (e.g. <span className="mono">pg_restore</span>). The export
            here is for off-site safekeeping and audits; ask an administrator before restoring.
          </div>
        </Card>
      </div>
    </>
  );
}
