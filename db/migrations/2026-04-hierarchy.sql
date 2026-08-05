-- =====================================================================
--  Migration: move from the 4-tier to the 5-tier organisation hierarchy.
--
--    OLD                         NEW
--    1  Super Admin              1  Super Admin
--    2  Head / Director          2  Management            (new)
--    3  Manager                  3  Head / HOD            (renamed from Head / Director)
--    4  Executive                4  Manager
--                                5  Executive
--
--  Safe and re-runnable. Role ids never change, so every users.role_id and
--  role_permissions row stays valid — no data is lost and no foreign key is
--  touched. Only role.level numbers and the Head role's display name change,
--  plus one new Management role and its permissions.
--
--  Run once on an EXISTING database (new installs get this from seed.sql):
--      psql -U postgres -d ashika_wdm -f db/migrations/2026-04-hierarchy.sql
-- =====================================================================
BEGIN;

-- 1. Rename "Head / Director" to "Head / HOD" and move it to level 3.
--    The slug 'director' is kept so all existing assignments/permissions hold.
UPDATE roles SET name = 'Head / HOD', level = 3 WHERE slug = 'director';

-- 2. Renumber the tiers that now sit one step lower.
UPDATE roles SET level = 4 WHERE slug = 'manager';
UPDATE roles SET level = 5 WHERE slug = 'executive';

-- 3. Add the new Management tier at level 2 with organisation-wide scope.
INSERT INTO roles (name, slug, level, scope)
SELECT 'Management', 'management', 2, 'all'
 WHERE NOT EXISTS (SELECT 1 FROM roles WHERE slug = 'management');

-- 4. Give Management the same permission set the Head / HOD role carries,
--    so it slots in as a broad management role. Guarded against duplicates
--    on the (role_id, permission_id) primary key, so this is re-runnable.
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE slug = 'management'), rp.permission_id
  FROM role_permissions rp
 WHERE rp.role_id = (SELECT id FROM roles WHERE slug = 'director')
   AND NOT EXISTS (
     SELECT 1 FROM role_permissions x
      WHERE x.role_id = (SELECT id FROM roles WHERE slug = 'management')
        AND x.permission_id = rp.permission_id);

COMMIT;

-- Sanity check (optional): SELECT name, slug, level, scope FROM roles ORDER BY level;
