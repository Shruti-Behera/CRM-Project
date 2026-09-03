import { useEffect, useMemo, useState } from 'react';
import { get, post, put, del } from '../lib/api.js';
import { Card, Pill, Loading, Empty, ErrorNote, Modal } from '../components/Bits.jsx';
import { useAuth } from '../lib/auth.jsx';
import { downloadXLSX, readXLSX } from '../lib/xlsx.js';
import { MAIN_MODULES, moduleLabel } from '../lib/segments.js';

// Bulk-import columns = the same fields as the manual Add-department form.
const IMPORT_COLS = ['code', 'name', 'main_module'];
const stamp = () => new Date().toISOString().slice(0, 10);

export default function Departments() {
  const { can } = useAuth();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => get('/masters/departments').then(setRows).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const s = q.toLowerCase();
    return rows.filter(d => !s || `${d.name} ${d.code || ''}`.toLowerCase().includes(s));
  }, [rows, q]);

  const openAdd = () => setForm({ _new: true, code: '', name: '', main_module: '' });
  const openEdit = (d) => setForm({ _new: false, id: d.id, code: d.code || '', name: d.name, main_module: d.main_module || '' });
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) { setErr('A department name is needed'); return; }
    if (!form.main_module) { setErr('Please select a Main Module for this department'); return; }
    setBusy(true);
    try {
      const body = { name: form.name, code: form.code || undefined, main_module: form.main_module };
      if (form._new) await post('/masters/departments', body);
      else await put(`/masters/departments/${form.id}`, body);
      setForm(null); setErr(''); load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const remove = async (d) => {
    if (!window.confirm(`Delete ${d.name}?`)) return;
    try { await del(`/masters/departments/${d.id}`); load(); }
    catch (e) { setErr(e.message); }  // server explains if still in use
  };

  /* ---- bulk import (same fields/rules as manual create) ---- */
  const [impOpen, setImpOpen] = useState(false);
  const [impRows, setImpRows] = useState([]);
  const [impPreview, setImpPreview] = useState(null);
  const [impResult, setImpResult] = useState(null);
  const [impBusy, setImpBusy] = useState(false);
  const [impErr, setImpErr] = useState('');
  const [impFile, setImpFile] = useState('');

  const openImport = () => {
    setImpOpen(true); setImpRows([]); setImpPreview(null);
    setImpResult(null); setImpErr(''); setImpFile('');
  };

  const downloadTemplate = () => {
    const example = { code: 'FIN', name: 'Finance', main_module: 'internal' };
    const sheet = { name: 'Departments', headers: IMPORT_COLS, rows: [IMPORT_COLS.map(c => example[c] ?? '')] };
    const ref = {
      name: 'Reference', headers: ['Field', 'Notes'], rows: [
        ['name', 'required, must be unique (same rule as manual create)'],
        ['code', 'optional, up to 12 characters'],
        ['main_module', `required — one of: ${MAIN_MODULES.map(m => m.value).join(', ')} (or the full label, e.g. "${MAIN_MODULES[0].label}")`]
      ]
    };
    downloadXLSX(`ashika-departments-template-${stamp()}.xlsx`, [sheet, ref]);
  };

  const onImportFile = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setImpErr(''); setImpResult(null); setImpPreview(null); setImpBusy(true); setImpFile(file.name);
    try {
      const parsed = await readXLSX(file);
      if (!parsed.length) { setImpErr('That file has no data rows.'); return; }
      setImpRows(parsed);
      setImpPreview(await post('/masters/departments/import', { rows: parsed, commit: false }));
    } catch (err) { setImpErr(err.message); }
    finally { setImpBusy(false); e.target.value = ''; }
  };

  const confirmImport = async () => {
    if (!impPreview?.valid) return;
    setImpBusy(true); setImpErr('');
    try {
      setImpResult(await post('/masters/departments/import', { rows: impRows, commit: true }));
      load();
    } catch (err) { setImpErr(err.message); }
    finally { setImpBusy(false); }
  };

  const downloadFailed = () => {
    const serverRows = (impResult || impPreview)?.rows || [];
    const failed = serverRows.map((sr, i) => ({ sr, orig: impRows[i] || {} })).filter(x => !x.sr.valid);
    if (!failed.length) return;
    const headers = [...IMPORT_COLS, 'errors'];
    const out = failed.map(({ sr, orig }) => [...IMPORT_COLS.map(c => orig[c] ?? ''), (sr.errors || []).join('; ')]);
    downloadXLSX(`ashika-departments-import-errors-${stamp()}.xlsx`, [{ name: 'Failed rows', headers, rows: out }]);
  };

  if (err && !rows) return <ErrorNote>{err}</ErrorNote>;
  if (!rows) return <Loading />;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div><div className="eyebrow">Organisation structure</div><h3>Departments</h3></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input placeholder="Search…" value={q} style={{ width: 200 }} onChange={e => setQ(e.target.value)} />
          {can('masters.create') && <button className="btn" onClick={openImport}>Import</button>}
          {can('masters.create') && <button className="btn primary" onClick={openAdd}>Add department</button>}
        </div>
      </div>
      {err && <ErrorNote>{err}</ErrorNote>}

      <Card pad={false}>
        <table className="tbl">
          <thead><tr><th>Code</th><th>Name</th><th>Main module</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
          <tbody>
            {filtered.length ? filtered.map(d => (
              <tr key={d.id}>
                <td className="mono" style={{ fontSize: 12 }}>{d.code || '—'}</td>
                <td style={{ fontWeight: 500 }}>{d.name}</td>
                <td style={{ fontSize: 12.5 }}>{moduleLabel(d.main_module) || '—'}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {can('masters.edit') && <button className="btn" style={{ padding: '2px 8px' }} onClick={() => openEdit(d)}>Edit</button>}{' '}
                  {can('masters.delete') && <button className="btn" style={{ padding: '2px 8px', color: 'var(--red)' }} onClick={() => remove(d)}>Delete</button>}
                </td>
              </tr>
            )) : <Empty cols={4}>No departments yet.</Empty>}
          </tbody>
        </table>
        <div className="eyebrow" style={{ padding: '10px 15px' }}>{filtered.length} of {rows.length} departments</div>
      </Card>

      {form && (
        <Modal title={form._new ? 'Add department' : `Edit ${form.name}`} saveLabel={form._new ? 'Create' : 'Save'}
          busy={busy} onClose={() => setForm(null)} onSave={save}>
          <div className="grid" style={{ gridTemplateColumns: '1fr 2fr' }}>
            <div><label>Code</label><input value={form.code} onChange={e => setF('code', e.target.value)} /></div>
            <div><label>Name</label><input value={form.name} onChange={e => setF('name', e.target.value)} /></div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label>Main module</label>
              <select value={form.main_module} onChange={e => setF('main_module', e.target.value)}>
                <option value="">— select —</option>
                {MAIN_MODULES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>
        </Modal>
      )}

      {impOpen && (
        <Modal title="Import departments" busy={impBusy}
          saveLabel={impResult ? 'Done'
            : impPreview ? (impPreview.valid ? `Create ${impPreview.valid}` : 'Nothing to import')
            : 'Import'}
          onClose={() => setImpOpen(false)}
          onSave={impResult ? () => setImpOpen(false) : impPreview ? confirmImport : () => {}}>
          {impErr && <ErrorNote>{impErr}</ErrorNote>}

          {!impPreview && !impResult && (
            <div>
              <p style={{ fontSize: 13, marginTop: 0 }}>
                Upload an <b>.xlsx</b> or <b>.csv</b> with one row per department. Columns: <b>code</b>, <b>name</b> and
                <b> main_module</b> — the same fields as Add department. Name is required and unique; main_module is
                required (banking / institutional / internal, or the full label). Every row is validated first.
              </p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="btn" onClick={downloadTemplate}>Download template</button>
                <label className="btn primary" style={{ cursor: 'pointer', margin: 0 }}>
                  {impBusy ? 'Reading…' : 'Choose file'}
                  <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={onImportFile} />
                </label>
                {impFile && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{impFile}</span>}
              </div>
            </div>
          )}

          {impPreview && !impResult && (
            <div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 8, fontSize: 13, alignItems: 'center' }}>
                <b style={{ color: 'var(--green)' }}>{impPreview.valid} valid</b>
                <b style={{ color: 'var(--red)' }}>{impPreview.invalid} invalid</b>
                <span style={{ color: 'var(--muted)' }}>of {impPreview.total} rows</span>
                {impPreview.invalid > 0 &&
                  <button className="btn" style={{ padding: '2px 8px', marginLeft: 'auto' }} onClick={downloadFailed}>Download invalid rows</button>}
              </div>
              <div style={{ maxHeight: 320, overflow: 'auto' }}>
                <table className="tbl">
                  <thead><tr><th>#</th><th>Code</th><th>Name</th><th>Module</th><th>Result</th></tr></thead>
                  <tbody>
                    {impPreview.rows.map((r, i) => (
                      <tr key={i} style={{ background: r.valid ? '' : '#FFF5F5' }}>
                        <td className="mono" style={{ fontSize: 11.5 }}>{r.row}</td>
                        <td className="mono" style={{ fontSize: 12 }}>{r.code || '—'}</td>
                        <td style={{ fontSize: 12.5 }}>{r.name || '—'}</td>
                        <td style={{ fontSize: 12 }}>{r.module || '—'}</td>
                        <td style={{ fontSize: 12 }}>
                          {r.valid ? <Pill kind="p-done">Ready</Pill>
                            : <span style={{ color: 'var(--red)' }}>{r.errors.join('; ')}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 0 }}>Only valid rows are created, in one transaction. Invalid rows are skipped.</p>
            </div>
          )}

          {impResult && (
            <div>
              <div style={{ display: 'flex', gap: 16, fontSize: 14, marginBottom: 10 }}>
                <b style={{ color: 'var(--green)' }}>{impResult.created} created</b>
                <b style={{ color: impResult.failed ? 'var(--red)' : 'var(--muted)' }}>{impResult.failed} failed</b>
                <span style={{ color: 'var(--muted)' }}>of {impResult.total} rows</span>
              </div>
              {impResult.failed > 0 &&
                <button className="btn" onClick={downloadFailed}>Download failed rows with reasons</button>}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
