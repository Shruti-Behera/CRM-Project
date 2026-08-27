-- =====================================================================
--  One-time recalculation of assignment progress so existing rows reflect
--  the new rule: progress = completed items ÷ total items across BOTH the
--  sub-tasks and the checklist. Going forward the API keeps this current on
--  every add/toggle/delete; this just corrects rows created before the fix.
--
--  Safe and re-runnable. Only non-completed, non-deleted assignments are
--  touched; those with no items at all keep their existing value. Completed
--  assignments stay at 100.
--
--      psql -U postgres -d ashika_wdm -f db/migrations/2026-06-recalc-progress.sql
-- =====================================================================
UPDATE assignments a
   SET progress_pct = COALESCE((
         SELECT ROUND(100.0 * SUM(done) / NULLIF(SUM(total), 0))::int
           FROM (
             SELECT COUNT(*) FILTER (WHERE is_done::integer = 1) AS done, COUNT(*) AS total
               FROM assignment_subtasks WHERE assignment_id = a.id
             UNION ALL
             SELECT COUNT(*) FILTER (WHERE is_done::integer = 1), COUNT(*)
               FROM assignment_checklist WHERE assignment_id = a.id
           ) items
       ), a.progress_pct)
 WHERE a.status <> 'Completed' AND a.deleted_at IS NULL;
