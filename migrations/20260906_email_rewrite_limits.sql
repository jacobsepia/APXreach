-- A daily allowance of AI tone rewrites per workspace. Both columns are
-- bookkeeping only; existing rows keep working with the defaults.
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS rewrite_count integer NOT NULL DEFAULT 0;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS rewrite_count_day date;
