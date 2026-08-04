-- =====================================================================
--  Migration: enrich notifications for the real-time notification system
--  (run once on an EXISTING database; new installs get this from schema.sql)
--
--      psql -U postgres -d ashika_wdm -f db/migrations/2026-02-notifications.sql
--
--  If the app connects as a non-owner user, no extra grant is needed —
--  it already has DML on notifications.
-- =====================================================================
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS sender_id  INTEGER NULL;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_deleted SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_notif_sender') THEN
    ALTER TABLE notifications
      ADD CONSTRAINT fk_notif_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_notif_live ON notifications (user_id, is_deleted, created_at);
