-- =====================================================================
--  Migration: password reset tokens (run once on an EXISTING database)
--  New installs already get this from schema.sql.
--
--  Run as the postgres superuser (the app user has no DDL rights):
--      psql -U postgres -d ashika_wdm -f db/migrations/2026-01-password-resets.sql
--
--  Then make sure the app user can use it:
--      GRANT SELECT, INSERT, UPDATE, DELETE ON password_resets TO ashika_app;
--      GRANT USAGE, SELECT ON SEQUENCE password_resets_id_seq TO ashika_app;
-- =====================================================================
CREATE TABLE IF NOT EXISTS password_resets (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  token_hash VARCHAR(128) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at    TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pwreset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE);

CREATE INDEX IF NOT EXISTS ix_pwreset_token ON password_resets (token_hash);
