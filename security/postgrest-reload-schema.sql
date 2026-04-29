-- Run in Supabase SQL Editor when the browser shows:
--   "Could not find the 'client_name' column of 'sessions' in the schema cache"
-- (or any other column you know exists in Postgres).
-- PostgREST caches the OpenAPI schema separately from Postgres; NOTIFY forces a reload.

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'sessions'
order by ordinal_position;

notify pgrst, 'reload schema';
