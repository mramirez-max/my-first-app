ALTER TABLE team_metrics ADD COLUMN owner_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
