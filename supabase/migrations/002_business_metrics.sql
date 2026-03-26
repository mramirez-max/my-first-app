-- Business metrics table for monthly operational data

CREATE TABLE business_metrics (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name text        NOT NULL,
  category    text        NOT NULL,
  month       int         NOT NULL CHECK (month >= 1 AND month <= 12),
  year        int         NOT NULL,
  value       numeric,
  updated_by  uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE(metric_name, month, year)
);

ALTER TABLE business_metrics ENABLE ROW LEVEL SECURITY;

-- Everyone can read
CREATE POLICY "Everyone can read business_metrics"
  ON business_metrics FOR SELECT
  USING (true);

-- Only admins can write
CREATE POLICY "Admins can insert business_metrics"
  ON business_metrics FOR INSERT
  WITH CHECK (get_my_role() = 'admin');

CREATE POLICY "Admins can update business_metrics"
  ON business_metrics FOR UPDATE
  USING (get_my_role() = 'admin');

CREATE POLICY "Admins can delete business_metrics"
  ON business_metrics FOR DELETE
  USING (get_my_role() = 'admin');

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER business_metrics_updated_at
  BEFORE UPDATE ON business_metrics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
