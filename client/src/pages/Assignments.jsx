import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { get, shortDate } from "../lib/api.js";
import {
  Card,
  Pill,
  pClass,
  statusTone,
  Avatar,
  Loading,
  Empty,
  ErrorNote,
} from "../components/Bits.jsx";

const STATUSES = [
  "Pending",
  "In Progress",
  "Under Review",
  "Completed",
  "On Hold",
];
const PRIOS = ["Low", "Medium", "High", "Critical"];

const softGet = (p) =>
  get(p)
    .then((r) => r || [])
    .catch(() => []);

const daysToDue = (due) => {
  if (!due) return null;

  const dueDate = new Date(due);

  if (isNaN(dueDate.getTime())) return null;

  dueDate.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diff = dueDate.getTime() - today.getTime();

  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

function toCsv(rows) {
  const cols = [
    "assignment_no",
    "title",
    "department",
    "category",
    "assigned_to_name",
    "due_date",
    "sla_days",
    "progress_pct",
    "priority",
    "status",
  ];
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [
    cols.join(","),
    ...rows.map((r) => cols.map((c) => esc(r[c])).join(",")),
  ].join("\n");
}

export default function Assignments() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [users, setUsers] = useState([]);
  const [depts, setDepts] = useState([]);
  const [f, setF] = useState({
    q: "",
    emp: "",
    dept: "",
    prio: "",
    status: "",
  });

  useEffect(() => {
    get("/assignments")
      .then(setRows)
      .catch((e) => setErr(e.message));
    softGet("/users").then(setUsers);
    softGet("/masters/departments").then(setDepts);
  }, []);

  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }));
  const clear = () => setF({ q: "", emp: "", dept: "", prio: "", status: "" });

  // Fall back to values present in the data when master lists aren't permitted.
  const empOptions = users.length
    ? users.map((u) => u.name)
    : [
        ...new Set((rows || []).map((r) => r.assigned_to_name).filter(Boolean)),
      ].sort();
  const deptOptions = depts.length
    ? depts.map((d) => d.name)
    : [
        ...new Set((rows || []).map((r) => r.department).filter(Boolean)),
      ].sort();

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = f.q.toLowerCase();
    return rows.filter(
      (t) =>
        (!f.emp ||
          (t.assigned_to_name || "").split(", ").includes(f.emp) ||
          t.assigned_by_name === f.emp) &&
        (!f.dept || t.department === f.dept) &&
        (!f.prio || t.priority === f.prio) &&
        (!f.status || t.status === f.status) &&
        (!q ||
          `${t.title} ${t.assignment_no} ${t.category || ""}`
            .toLowerCase()
            .includes(q)),
    );
  }, [rows, f]);

  const estimated = filtered.reduce(
    (n, t) => n + Number(t.estimated_hours || 0),
    0,
  );

  const downloadCsv = () => {
    const blob = new Blob([toCsv(filtered)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "assignments.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (err) return <ErrorNote>{err}</ErrorNote>;

  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 14,
        }}
      >
        <div>
          <div className="eyebrow">All departments</div>
          <h3>Assignments</h3>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="btn" to="/internal/kanban">
            Board
          </Link>
          <button
            className="btn"
            onClick={downloadCsv}
            disabled={!filtered.length}
          >
            CSV
          </button>
          <Link className="btn primary" to="/internal/assignments/new">
            New assignment
          </Link>
        </div>
      </div>

      <Card>
        <div className="filters">
          <div>
            <label>Search</label>
            <input
              placeholder="Title, no. or category"
              value={f.q}
              onChange={(e) => set("q", e.target.value)}
            />
          </div>
          <div>
            <label>Employee</label>
            <select value={f.emp} onChange={(e) => set("emp", e.target.value)}>
              <option value="">All</option>
              {empOptions.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Department</label>
            <select
              value={f.dept}
              onChange={(e) => set("dept", e.target.value)}
            >
              <option value="">All</option>
              {deptOptions.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Priority</label>
            <select
              value={f.prio}
              onChange={(e) => set("prio", e.target.value)}
            >
              <option value="">All</option>
              {PRIOS.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Status</label>
            <select
              value={f.status}
              onChange={(e) => set("status", e.target.value)}
            >
              <option value="">All</option>
              {STATUSES.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </div>
          <div>
            <label>&nbsp;</label>
            <button className="btn" style={{ width: "100%" }} onClick={clear}>
              Clear
            </button>
          </div>
        </div>
      </Card>

      <div style={{ height: 14 }} />

      <Card pad={false}>
        {!rows ? (
          <Loading />
        ) : (
          <>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Task no.</th>
                  <th>Title</th>
                  <th>Department</th>
                  <th>Owner</th>
                  <th>Due</th>
                  <th>SLA</th>
                  <th>Progress</th>
                  <th>Priority</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length ? (
                  filtered.map((t) => {
                    const left = daysToDue(t.due_date);
                    return (
                      <tr key={t.id}>
                        <td>
                          <Link
                            to={`/internal/assignments/${t.id}`}
                            className="mono"
                            style={{ fontSize: 11.5, fontWeight: 600 }}
                          >
                            {t.assignment_no}
                          </Link>
                        </td>
                        <td style={{ maxWidth: 260 }}>
                          <div style={{ fontWeight: 500 }}>{t.title}</div>
                          <div style={{ fontSize: 11, color: "var(--muted)" }}>
                            {t.category || "—"}
                          </div>
                        </td>
                        <td style={{ fontSize: 12.5 }}>
                          {t.department || "—"}
                        </td>
                        <td>
                          {(() => {
                            const names = (t.assigned_to_name || "")
                              .split(", ")
                              .filter(Boolean);
                            if (!names.length) return "—";
                            return (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                  flexWrap: "wrap",
                                }}
                              >
                                {names.slice(0, 3).map((n, i) => (
                                  <Avatar
                                    key={i}
                                    name={n}
                                    size={22}
                                    title={n}
                                  />
                                ))}
                                <span style={{ fontSize: 12.5 }}>
                                  {names.length === 1
                                    ? names[0]
                                    : `${names.length} people`}
                                </span>
                              </span>
                            );
                          })()}
                        </td>
                        <td
                          className="mono"
                          style={{
                            fontSize: 12,
                            color: t.is_overdue ? "var(--red)" : undefined,
                            fontWeight: t.is_overdue ? 600 : 400,
                          }}
                        >
                          {shortDate(t.due_date)}
                        </td>
                        <td>
                          {t.status === "Completed" || left == null ? (
                            <span style={{ color: "var(--muted)" }}>—</span>
                          ) : (
                            <span
                              className={`chip ${left < 0 ? "down" : left <= 2 ? "flat" : "up"}`}
                            >
                              {left < 0
                                ? `${Math.abs(left)}d over`
                                : `${left}d left`}
                            </span>
                          )}
                        </td>
                        <td>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <div className="prog">
                              <i style={{ width: `${t.progress_pct}%` }} />
                            </div>
                            <span className="mono" style={{ fontSize: 11 }}>
                              {t.progress_pct}%
                            </span>
                          </div>
                        </td>
                        <td>
                          <Pill kind={pClass(t.priority)}>{t.priority}</Pill>
                        </td>
                        <td>
                          <Pill kind={statusTone(t.status)}>{t.status}</Pill>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <Empty cols={9}>No assignments match these filters.</Empty>
                )}
              </tbody>
            </table>
            <div className="eyebrow" style={{ padding: "10px 15px" }}>
              {filtered.length} of {rows.length} assignments · {estimated}h
              estimated
            </div>
          </>
        )}
      </Card>
    </>
  );
}
