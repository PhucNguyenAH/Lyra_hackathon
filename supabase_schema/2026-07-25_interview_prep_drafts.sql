-- Make inbox-to-interview handoffs idempotent for databases created before
-- idx_prep_materials_source_email was added to job_pipeline.sql.
create unique index if not exists idx_prep_materials_source_email
    on prep_materials(source_email_id)
    where source_email_id is not null;
