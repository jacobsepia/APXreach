-- Additive and rerunnable. Existing memberships and customer records are untouched.
DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS workspace_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces(id),
    user_id text NOT NULL,
    role text NOT NULL DEFAULT 'owner',
    created_at timestamptz NOT NULL DEFAULT now()
  );
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspace_members_user_id_fkey' AND conrelid = 'workspace_members'::regclass) THEN
    ALTER TABLE workspace_members ADD CONSTRAINT workspace_members_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;
  END IF;
  CREATE UNIQUE INDEX IF NOT EXISTS workspace_members_user_workspace_idx ON workspace_members(user_id, workspace_id);
END $$;
