import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, post } from '../lib/api.js';
import { Card, ErrorNote } from '../components/Bits.jsx';
import { useAuth } from '../lib/auth.jsx';

const STATUSES = ['Pending', 'In Progress', 'Under Review', 'Completed', 'On Hold'];
const PRIOS = ['Low', 'Medium', 'High', 'Critical'];
const RECUR = ['None', 'Weekly', 'Monthly', 'Quarterly'];

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };

// Reference lists need view rights the assignment-creator may not hold; fall
// back gracefully so the form still works instead of erroring on a 403.
const softGet = (path) => get(path).then(r => r || []).catch(() => []);

export default function AssignmentForm() {
  const nav = useNavigate();
  const { user } = useAuth();

  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [projects, setProjects] = useState([]);
  const [tags, setTags] = useState([]);

  const [form, setForm] = useState({
    title: '', description: '', department_id: '', category_id: '', project_id: '',
    assigned_to: '', start_date: addDays(0), due_date: addDays(7), sla_days: 5,
    status: 'Pending', priority: 'Medium', estimated_hours: 8, recurrence: 'None',
    watchers: [], tags: []
  });
  const [subtasks, setSubtasks] = useState([]);
  const [checklist, setChecklist] = useState([
    'Requirement received', 'Discussion completed', 'Work started',
    'Under Review', 'Approved', 'Completed'
  ]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    softGet('/users').then(list =>
      setUsers(list.length ? list : (user ? [{ id: user.id, name: user.name }] : [])));
    softGet('/masters/departments').then(setDepartments);
    softGet('/masters/categories').then(setCategories);
    softGet('/masters/projects').then(setProjects);
    softGet('/masters/tags').then(setTags);
    if (user) setForm(f => ({ ...f, assigned_to: user.id }));
  }, [user]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setMulti = (k, e) => set(k, [...e.target.selectedOptions].map(o => Number(o.value)));

  const addSub = () => setSubtasks(s => [...s, { title: '', owner_id: '' }]);
  const setSub = (i, key, v) => setSubtasks(s => s.map((x, j) => j === i ? { ...x, [key]: v } : x));
  const dropSub = (i) => setSubtasks(s => s.filter((_, j) => j !== i));

  const addChk = () => setChecklist(c => [...c, '']);
  const setChk = (i, v) => setChecklist(c => c.map((x, j) => j === i ? v : x));
  const dropChk = (i) => setChecklist(c => c.filter((_, j) => j !== i));

  const save = async (e) => {
    e.preventDefault();
    setErr('');
    if (!form.title.trim()) { setErr('Add a title before saving'); return; }
    if (!form.assigned_to) { setErr('Pick who this is assigned to'); return; }
    if (form.due_date < form.start_date) { setErr('The due date is before the start date'); return; }
    setBusy(true);
    try {
      const payload = {
        title: form.title,
        description: form.description || undefined,
        department_id: form.department_id ? Number(form.department_id) : undefined,
        category_id: form.category_id ? Number(form.category_id) : undefined,
        project_id: form.project_id ? Number(form.project_id) : undefined,
        assigned_to: Number(form.assigned_to),
        start_date: form.start_date,
        due_date: form.due_date,
        sla_days: Number(form.sla_days) || 5,
        status: form.status,
        priority: form.priority,
        estimated_hours: Number(form.estimated_hours) || 0,
        recurrence: form.recurrence,
        watchers: form.watchers,
        tags: form.tags,
        subtasks: subtasks
          .filter(s => s.title.trim())
          .map(s => ({ title: s.title, owner_id: s.owner_id ? Number(s.owner_id) : undefined })),
        checklist: checklist.map(c => c.trim()).filter(Boolean)
      };
      const res = await post('/assignments', payload);
      nav(res?.id ? `/internal/assignments/${res.id}` : '/internal/assignments');
    } catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  };

  return (
    <form onSubmit={save}>
      <div className="eyebrow">New record</div>
      <h3 style={{ marginBottom: 14 }}>Create assignment</h3>
      {err && <ErrorNote>{err}</ErrorNote>}

      <div className="grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <Card title="Assignment information">
          <div className="grid" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
            <L label="Title" full><input value={form.title} required
              onChange={e => set('title', e.target.value)} /></L>
            <L label="Description" full><textarea rows={3} value={form.description}
              onChange={e => set('description', e.target.value)} /></L>

            <L label="Department"><Select value={form.department_id} onChange={e => set('department_id', e.target.value)}
              opts={departments} placeholder="None" /></L>
            <L label="Category"><Select value={form.category_id} onChange={e => set('category_id', e.target.value)}
              opts={categories} placeholder="None" /></L>
            <L label="Project"><Select value={form.project_id} onChange={e => set('project_id', e.target.value)}
              opts={projects} placeholder="None" /></L>
            <L label="Assigned to"><Select value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)}
              opts={users} placeholder="— pick —" /></L>

            <L label="Start date"><input type="date" value={form.start_date}
              onChange={e => set('start_date', e.target.value)} /></L>
            <L label="Due date"><input type="date" value={form.due_date}
              onChange={e => set('due_date', e.target.value)} /></L>
            <L label="SLA (working days)"><input type="number" value={form.sla_days}
              onChange={e => set('sla_days', e.target.value)} /></L>
            <L label="Estimated hours"><input type="number" value={form.estimated_hours}
              onChange={e => set('estimated_hours', e.target.value)} /></L>

            <L label="Status"><select value={form.status} onChange={e => set('status', e.target.value)}>
              {STATUSES.map(s => <option key={s}>{s}</option>)}</select></L>
            <L label="Priority"><select value={form.priority} onChange={e => set('priority', e.target.value)}>
              {PRIOS.map(s => <option key={s}>{s}</option>)}</select></L>
            <L label="Repeats"><select value={form.recurrence} onChange={e => set('recurrence', e.target.value)}>
              {RECUR.map(s => <option key={s}>{s}</option>)}</select></L>

            <L label="Watchers"><select multiple size={3}
              value={form.watchers.map(String)} onChange={e => setMulti('watchers', e)}>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></L>
            <L label="Tags"><select multiple size={3}
              value={form.tags.map(String)} onChange={e => setMulti('tags', e)}>
              {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></L>
          </div>
        </Card>

        <div className="grid">
          <Card title="Checklist" extra={<button type="button" className="btn" onClick={addChk}>Add</button>}>
            {checklist.length ? checklist.map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
                <input type="checkbox" checked readOnly style={{ width: 'auto' }} title="Ticked off on the assignment page" />
                <input placeholder="Checklist item" value={c} style={{ flex: 1 }}
                  onChange={e => setChk(i, e.target.value)} />
                <button type="button" className="btn" style={{ padding: '0 8px' }} onClick={() => dropChk(i)}>×</button>
              </div>
            )) : <p style={{ color: 'var(--muted)', margin: 0, fontSize: 13 }}>
              No checklist items — add the steps this work must pass through.</p>}
            <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '6px 0 0' }}>
              These carry over to the assignment, where they can be ticked off.</p>
          </Card>

          <Card title="Sub-tasks" extra={<button type="button" className="btn" onClick={addSub}>Add</button>}>
            {subtasks.length ? subtasks.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <input placeholder="Sub-task" value={s.title} style={{ flex: 2 }}
                  onChange={e => setSub(i, 'title', e.target.value)} />
                <Select value={s.owner_id} onChange={e => setSub(i, 'owner_id', e.target.value)}
                  opts={users} placeholder="Owner" />
                <button type="button" className="btn" style={{ padding: '0 8px' }} onClick={() => dropSub(i)}>×</button>
              </div>
            )) : <p style={{ color: 'var(--muted)', margin: 0, fontSize: 13 }}>
              Break the work down — sub-tasks carry over to the assignment.</p>}
          </Card>
        </div>
      </div>

      <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
        <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Create assignment'}</button>
        <button type="button" className="btn" onClick={() => nav('/internal/assignments')}>Cancel</button>
      </div>
    </form>
  );
}

const L = ({ label, children, full }) => (
  <div style={full ? { gridColumn: '1 / -1' } : undefined}>
    <label>{label}</label>{children}
  </div>
);

const Select = ({ value, onChange, opts, placeholder }) => (
  <select value={value} onChange={onChange}>
    <option value="">{placeholder}</option>
    {opts.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
  </select>
);
