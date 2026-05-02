-- Team metrics: custom input/output metrics tracked week-over-week per team

CREATE TABLE team_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id uuid NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  metric_name text NOT NULL,
  metric_type text NOT NULL CHECK (metric_type IN ('input', 'output')),
  unit text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE team_metric_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_id uuid NOT NULL REFERENCES team_metrics(id) ON DELETE CASCADE,
  value numeric NOT NULL,
  week_date date NOT NULL,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(metric_id, week_date)
);

ALTER TABLE team_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_metric_values ENABLE ROW LEVEL SECURITY;

-- team_metrics: area members can read; admins and area_leads can write
CREATE POLICY "Area members can view team metrics" ON team_metrics
  FOR SELECT USING (
    area_id IN (SELECT area_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins and area_leads can manage team metrics" ON team_metrics
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'area_lead'))
  );

-- team_metric_values: area members can read; admins and area_leads can write
CREATE POLICY "Area members can view team metric values" ON team_metric_values
  FOR SELECT USING (
    metric_id IN (
      SELECT tm.id FROM team_metrics tm
      WHERE tm.area_id IN (SELECT area_id FROM profiles WHERE id = auth.uid())
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins and area_leads can manage team metric values" ON team_metric_values
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'area_lead'))
  );
