-- 00003_expose_app_schema.sql
-- Expose the "app" schema via PostgREST and grant access to Supabase roles.
-- Required for @supabase/supabase-js to query app.* tables.

ALTER ROLE authenticator SET pgrst.db_schemas TO 'public,graphql_public,app';

GRANT USAGE ON SCHEMA app TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA app TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA app TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
