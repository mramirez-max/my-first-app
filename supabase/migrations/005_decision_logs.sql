-- Decision logs: lightweight capture of decisions, checkpoints, and call outcomes
-- Logged via Slack bot (/log command) or future inputs

CREATE TABLE decision_logs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  content       text        NOT NULL,
  logged_by     text,                        -- Slack display name
  slack_user_id text,                        -- Slack user ID
  quarter       int         NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  year          int         NOT NULL,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE decision_logs ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read
CREATE POLICY "Authenticated users can read decision logs"
  ON decision_logs FOR SELECT TO authenticated USING (true);

-- Service role (used by Slack bot) can insert
CREATE POLICY "Service role can insert decision logs"
  ON decision_logs FOR INSERT WITH CHECK (true);

-- Admins can delete
CREATE POLICY "Admins can delete decision logs"
  ON decision_logs FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );
