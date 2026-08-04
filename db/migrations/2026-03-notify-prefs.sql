-- =====================================================================
--  Migration: per-user notification preferences (sound / desktop)
--  Run once on an EXISTING database (new installs get it from schema.sql):
--      psql -U postgres -d ashika_wdm -f db/migrations/2026-03-notify-prefs.sql
-- =====================================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS pref_sound   SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pref_desktop SMALLINT NOT NULL DEFAULT 1;
