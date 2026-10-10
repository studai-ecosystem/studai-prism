-- Down: remove the PROD-READY Phase 5 job queue. Pending work (invite emails,
-- reminders, seat releases, retention passes) is lost; with PRISM_JOB_WORKER
-- off nothing writes to this table, so the down is safe on such a database.
DROP TABLE IF EXISTS jobs;
