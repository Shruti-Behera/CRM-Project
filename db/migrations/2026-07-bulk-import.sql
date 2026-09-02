-- =====================================================================
--  Bulk User Upload support.
--  Adds users.must_change_password so a bulk-imported user, created with a
--  temporary password from the uploaded spreadsheet, is forced to set a new
--  password the first time they sign in. Existing users default to 0 (no
--  forced reset), so this migration changes nothing for anyone already in the
--  system. Safe and re-runnable.
--
--      psql -U postgres -d ashika_wdm -f db/migrations/2026-07-bulk-import.sql
-- =====================================================================
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password SMALLINT NOT NULL DEFAULT 0;
