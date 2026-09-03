-- =====================================================================
--  Main Module mapping for departments.
--  Each department belongs to one of the three fixed main modules:
--    'banking'       -> Investment Banking & Merchant Banking
--    'institutional' -> Institutional Business
--    'internal'      -> Internal Work
--  Module visibility/access is driven by this column (joined to the user's
--  department) instead of hardcoded department names. Nullable so existing rows
--  don't break; the Create/Edit Department form makes it required going forward,
--  and a NULL value is treated as Internal Work.
--
--  Safe and re-runnable.
--      psql -U postgres -d ashika_wdm -f db/migrations/2026-08-department-main-module.sql
-- =====================================================================
ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS main_module VARCHAR(20) NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_dept_module') THEN
    ALTER TABLE departments
      ADD CONSTRAINT ck_dept_module
      CHECK (main_module IS NULL OR main_module IN ('banking','institutional','internal'));
  END IF;
END $$;

-- Optional convenience: pre-map the seed/known departments so existing users
-- keep sensible module access immediately. Everything left NULL behaves as
-- Internal Work. Adjust in the UI afterwards as needed.
UPDATE departments SET main_module = 'banking'
 WHERE main_module IS NULL AND lower(name) IN ('investment banking','merchant banking');
UPDATE departments SET main_module = 'institutional'
 WHERE main_module IS NULL AND lower(name) IN ('institutional broking','institutional business');
