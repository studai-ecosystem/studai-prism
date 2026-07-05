-- Rollback for 0006_credentials.
DROP TRIGGER IF EXISTS trg_credentials_guard ON credentials;
DROP FUNCTION IF EXISTS credentials_guard();
DROP TABLE IF EXISTS credentials;
