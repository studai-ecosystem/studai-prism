-- Down: remove the PROD-READY Phase 8 guardian-consent storage. The path is
-- dark (PRISM_UNDER18_PATH off), so no row exists unless a human enabled it;
-- never run on a database holding guardian consent records.
DROP TABLE IF EXISTS guardian_consents;
