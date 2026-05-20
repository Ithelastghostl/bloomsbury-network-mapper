-- 00005_pipeline_jobs_unique.sql
-- Add unique constraint on (run_id, phase) for idempotent phase enqueue (PRD §21.2)

-- Drop the existing non-unique index first
drop index if exists app.pipeline_jobs_run_id_phase_idx;

-- Add unique constraint (creates an index implicitly)
alter table app.pipeline_jobs add constraint pipeline_jobs_run_id_phase_key unique (run_id, phase);
