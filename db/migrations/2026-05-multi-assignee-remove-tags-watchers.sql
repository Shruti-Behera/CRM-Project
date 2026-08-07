-- =====================================================================
--  Migration: one assignment → many assignees, and the complete removal of
--  the Tags and Watchers features.
--
--  * Adds a normalised assignment_assignees junction (no comma-separated ids).
--  * Backfills it from the existing single assigned_to column so no data is
--    lost and existing assignments keep working. assigned_to is retained as the
--    "primary" assignee (the first one) for backward compatibility.
--  * Drops assignment_watchers, assignment_tags and tags entirely.
--  * Re-points the per-user workload / performance views through the junction
--    so every assignee is credited, not just the primary one.
--
--  Safe and re-runnable. Run once on an EXISTING database (new installs get
--  this from schema.sql):
--      psql -U postgres -d ashika_wdm -f db/migrations/2026-05-multi-assignee-remove-tags-watchers.sql
-- =====================================================================
BEGIN;

-- 1. Normalised multi-assignee junction.
CREATE TABLE IF NOT EXISTS assignment_assignees (
  assignment_id INTEGER NOT NULL,
  user_id       INTEGER NOT NULL,
  PRIMARY KEY (assignment_id, user_id),
  CONSTRAINT fk_aa_asg  FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
  CONSTRAINT fk_aa_user FOREIGN KEY (user_id)       REFERENCES users(id)       ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_aa_user ON assignment_assignees (user_id);

-- 2. Backfill from the existing single assignee so nothing is lost.
INSERT INTO assignment_assignees (assignment_id, user_id)
SELECT id, assigned_to FROM assignments
ON CONFLICT DO NOTHING;

-- 3. Remove Tags and Watchers completely.
DROP TABLE IF EXISTS assignment_watchers CASCADE;
DROP TABLE IF EXISTS assignment_tags CASCADE;
DROP TABLE IF EXISTS tags CASCADE;

-- 4. Credit every assignee (through the junction) in the aggregate views.
CREATE OR REPLACE VIEW v_employee_performance AS
SELECT u.id AS user_id, u.name, d.name AS department,
       COUNT(a.id) AS received,
       COUNT(*) FILTER (WHERE a.status = 'Completed') AS completed,
       COUNT(*) FILTER (WHERE a.id IS NOT NULL AND a.status <> 'Completed') AS pending,
       COUNT(*) FILTER (WHERE a.status <> 'Completed' AND a.due_date < CURRENT_DATE) AS delayed,
       COALESCE(SUM(a.actual_hours),0) AS hours_logged,
       GREATEST(0, ROUND(100.0 * COUNT(*) FILTER (WHERE a.status = 'Completed') / NULLIF(COUNT(a.id),0)
              - 8 * COUNT(*) FILTER (WHERE a.status <> 'Completed' AND a.due_date < CURRENT_DATE))) AS efficiency_pct
FROM users u
LEFT JOIN departments d ON d.id = u.department_id
LEFT JOIN assignment_assignees aa ON aa.user_id = u.id
LEFT JOIN assignments a ON a.id = aa.assignment_id AND a.deleted_at IS NULL
GROUP BY u.id, u.name, d.name;

CREATE OR REPLACE VIEW v_workload AS
SELECT u.id AS user_id, u.name, d.name AS department, u.weekly_capacity_hours,
       COUNT(a.id) AS open_tasks,
       COUNT(*) FILTER (WHERE a.due_date < CURRENT_DATE) AS overdue_tasks,
       COALESCE(SUM(a.estimated_hours),0) AS open_hours,
       ROUND(100.0 * COALESCE(SUM(a.estimated_hours),0) / NULLIF(u.weekly_capacity_hours,0)) AS utilisation_pct
FROM users u
LEFT JOIN departments d ON d.id = u.department_id
LEFT JOIN assignment_assignees aa ON aa.user_id = u.id
LEFT JOIN assignments a ON a.id = aa.assignment_id AND a.status <> 'Completed' AND a.deleted_at IS NULL
WHERE u.status = 'Active'
GROUP BY u.id, u.name, d.name, u.weekly_capacity_hours;

COMMIT;

-- Sanity check (optional):
--   SELECT assignment_id, COUNT(*) FROM assignment_assignees GROUP BY 1 ORDER BY 2 DESC LIMIT 5;
