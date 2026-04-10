-- Migration 006: Independent team OKRs for /my-team
-- These tables are separate from area_objectives/area_key_results/area_kr_updates
-- so that team-level OKRs are fully independent from the area page.

CREATE TABLE team_objectives (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  area_id uuid NOT NULL REFERENCES areas(id),
  title text NOT NULL,
  quarter int NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  year int NOT NULL,
  aligned_to uuid REFERENCES company_objectives(id),
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE team_key_results (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  objective_id uuid NOT NULL REFERENCES team_objectives(id) ON DELETE CASCADE,
  description text NOT NULL,
  target_value numeric NOT NULL,
  current_value numeric NOT NULL DEFAULT 0,
  unit text,
  owner_id uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE team_kr_updates (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  key_result_id uuid NOT NULL REFERENCES team_key_results(id) ON DELETE CASCADE,
  update_text text NOT NULL,
  confidence_score int NOT NULL CHECK (confidence_score BETWEEN 1 AND 5),
  current_value numeric NOT NULL,
  created_by uuid REFERENCES profiles(id),
  week_date date NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE team_objectives  ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_key_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_kr_updates  ENABLE ROW LEVEL SECURITY;

-- team_objectives: all can read; admin or area_lead in the matching area can write
CREATE POLICY team_objectives_select ON team_objectives
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY team_objectives_insert ON team_objectives
  FOR INSERT WITH CHECK (
    get_my_role() = 'admin' OR
    (get_my_role() = 'area_lead' AND area_id = get_my_area_id())
  );

CREATE POLICY team_objectives_update ON team_objectives
  FOR UPDATE USING (
    get_my_role() = 'admin' OR
    (get_my_role() = 'area_lead' AND area_id = get_my_area_id())
  );

CREATE POLICY team_objectives_delete ON team_objectives
  FOR DELETE USING (
    get_my_role() = 'admin' OR
    (get_my_role() = 'area_lead' AND area_id = get_my_area_id())
  );

-- team_key_results: all can read; admin or area_lead in the matching area can write
CREATE POLICY team_kr_select ON team_key_results
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY team_kr_insert ON team_key_results
  FOR INSERT WITH CHECK (
    get_my_role() = 'admin' OR
    (get_my_role() = 'area_lead' AND EXISTS (
      SELECT 1 FROM team_objectives o
      WHERE o.id = objective_id AND o.area_id = get_my_area_id()
    ))
  );

CREATE POLICY team_kr_update ON team_key_results
  FOR UPDATE USING (
    get_my_role() = 'admin' OR
    (get_my_role() = 'area_lead' AND EXISTS (
      SELECT 1 FROM team_objectives o
      WHERE o.id = objective_id AND o.area_id = get_my_area_id()
    ))
  );

CREATE POLICY team_kr_delete ON team_key_results
  FOR DELETE USING (
    get_my_role() = 'admin' OR
    (get_my_role() = 'area_lead' AND EXISTS (
      SELECT 1 FROM team_objectives o
      WHERE o.id = objective_id AND o.area_id = get_my_area_id()
    ))
  );

-- team_kr_updates: all can read; area members can insert; only creator or admin can edit/delete
CREATE POLICY team_kr_updates_select ON team_kr_updates
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY team_kr_updates_insert ON team_kr_updates
  FOR INSERT WITH CHECK (
    get_my_role() = 'admin' OR
    (get_my_role() IN ('area_lead', 'team_member') AND EXISTS (
      SELECT 1 FROM team_key_results kr
      JOIN team_objectives o ON o.id = kr.objective_id
      WHERE kr.id = key_result_id AND o.area_id = get_my_area_id()
    ))
  );

CREATE POLICY team_kr_updates_update ON team_kr_updates
  FOR UPDATE USING (
    get_my_role() = 'admin' OR created_by = auth.uid()
  );

CREATE POLICY team_kr_updates_delete ON team_kr_updates
  FOR DELETE USING (
    get_my_role() = 'admin' OR created_by = auth.uid()
  );
