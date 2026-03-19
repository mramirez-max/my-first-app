-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Areas
CREATE TABLE areas (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- User profiles (extends Supabase auth.users)
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  full_name text,
  role text NOT NULL DEFAULT 'team_member' CHECK (role IN ('admin', 'area_lead', 'team_member')),
  area_id uuid REFERENCES areas(id),
  created_at timestamptz DEFAULT now()
);

-- Company Objectives
CREATE TABLE company_objectives (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title text NOT NULL,
  quarter int NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  year int NOT NULL,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

-- Company Key Results
CREATE TABLE company_key_results (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  objective_id uuid NOT NULL REFERENCES company_objectives(id) ON DELETE CASCADE,
  description text NOT NULL,
  target_value numeric NOT NULL,
  current_value numeric NOT NULL DEFAULT 0,
  unit text,
  owner_id uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

-- Area Objectives
CREATE TABLE area_objectives (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  area_id uuid NOT NULL REFERENCES areas(id),
  title text NOT NULL,
  quarter int NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  year int NOT NULL,
  aligned_to uuid REFERENCES company_objectives(id),
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

-- Area Key Results
CREATE TABLE area_key_results (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  objective_id uuid NOT NULL REFERENCES area_objectives(id) ON DELETE CASCADE,
  description text NOT NULL,
  target_value numeric NOT NULL,
  current_value numeric NOT NULL DEFAULT 0,
  unit text,
  owner_id uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

-- Weekly Updates (area KRs)
CREATE TABLE area_kr_updates (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  key_result_id uuid NOT NULL REFERENCES area_key_results(id) ON DELETE CASCADE,
  update_text text NOT NULL,
  confidence_score int NOT NULL CHECK (confidence_score BETWEEN 1 AND 5),
  current_value numeric NOT NULL,
  created_by uuid REFERENCES profiles(id),
  week_date date NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Weekly Updates (company KRs)
CREATE TABLE company_kr_updates (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  key_result_id uuid NOT NULL REFERENCES company_key_results(id) ON DELETE CASCADE,
  update_text text NOT NULL,
  confidence_score int NOT NULL CHECK (confidence_score BETWEEN 1 AND 5),
  current_value numeric NOT NULL,
  created_by uuid REFERENCES profiles(id),
  week_date date NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_key_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE area_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE area_key_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE area_kr_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_kr_updates ENABLE ROW LEVEL SECURITY;

-- Helper function to get current user's role
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- Helper function to get current user's area_id
CREATE OR REPLACE FUNCTION get_my_area_id()
RETURNS uuid AS $$
  SELECT area_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- RLS Policies: areas (everyone can read, only admins write)
CREATE POLICY "areas_select" ON areas FOR SELECT USING (true);
CREATE POLICY "areas_insert" ON areas FOR INSERT WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "areas_update" ON areas FOR UPDATE USING (get_my_role() = 'admin');
CREATE POLICY "areas_delete" ON areas FOR DELETE USING (get_my_role() = 'admin');

-- RLS Policies: profiles
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (id = auth.uid() OR get_my_role() = 'admin');
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (id = auth.uid() OR get_my_role() = 'admin');
CREATE POLICY "profiles_delete" ON profiles FOR DELETE USING (get_my_role() = 'admin');

-- RLS Policies: company_objectives
CREATE POLICY "company_objectives_select" ON company_objectives FOR SELECT USING (true);
CREATE POLICY "company_objectives_insert" ON company_objectives FOR INSERT WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "company_objectives_update" ON company_objectives FOR UPDATE USING (get_my_role() = 'admin');
CREATE POLICY "company_objectives_delete" ON company_objectives FOR DELETE USING (get_my_role() = 'admin');

-- RLS Policies: company_key_results
CREATE POLICY "company_kr_select" ON company_key_results FOR SELECT USING (true);
CREATE POLICY "company_kr_insert" ON company_key_results FOR INSERT WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "company_kr_update" ON company_key_results FOR UPDATE USING (get_my_role() = 'admin');
CREATE POLICY "company_kr_delete" ON company_key_results FOR DELETE USING (get_my_role() = 'admin');

-- RLS Policies: area_objectives
CREATE POLICY "area_objectives_select" ON area_objectives FOR SELECT USING (true);
CREATE POLICY "area_objectives_insert" ON area_objectives FOR INSERT WITH CHECK (
  get_my_role() = 'admin' OR (get_my_role() = 'area_lead' AND area_id = get_my_area_id())
);
CREATE POLICY "area_objectives_update" ON area_objectives FOR UPDATE USING (
  get_my_role() = 'admin' OR (get_my_role() = 'area_lead' AND area_id = get_my_area_id())
);
CREATE POLICY "area_objectives_delete" ON area_objectives FOR DELETE USING (
  get_my_role() = 'admin' OR (get_my_role() = 'area_lead' AND area_id = get_my_area_id())
);

-- RLS Policies: area_key_results
CREATE POLICY "area_kr_select" ON area_key_results FOR SELECT USING (true);
CREATE POLICY "area_kr_insert" ON area_key_results FOR INSERT WITH CHECK (
  get_my_role() = 'admin' OR (
    get_my_role() = 'area_lead' AND EXISTS (
      SELECT 1 FROM area_objectives ao WHERE ao.id = objective_id AND ao.area_id = get_my_area_id()
    )
  )
);
CREATE POLICY "area_kr_update" ON area_key_results FOR UPDATE USING (
  get_my_role() = 'admin' OR (
    get_my_role() = 'area_lead' AND EXISTS (
      SELECT 1 FROM area_objectives ao WHERE ao.id = objective_id AND ao.area_id = get_my_area_id()
    )
  )
);
CREATE POLICY "area_kr_delete" ON area_key_results FOR DELETE USING (
  get_my_role() = 'admin' OR (
    get_my_role() = 'area_lead' AND EXISTS (
      SELECT 1 FROM area_objectives ao WHERE ao.id = objective_id AND ao.area_id = get_my_area_id()
    )
  )
);

-- RLS Policies: area_kr_updates
CREATE POLICY "area_kr_updates_select" ON area_kr_updates FOR SELECT USING (true);
CREATE POLICY "area_kr_updates_insert" ON area_kr_updates FOR INSERT WITH CHECK (
  get_my_role() = 'admin' OR (
    get_my_role() IN ('area_lead', 'team_member') AND EXISTS (
      SELECT 1 FROM area_key_results akr
      JOIN area_objectives ao ON ao.id = akr.objective_id
      WHERE akr.id = key_result_id AND ao.area_id = get_my_area_id()
    )
  )
);
CREATE POLICY "area_kr_updates_update" ON area_kr_updates FOR UPDATE USING (
  get_my_role() = 'admin' OR created_by = auth.uid()
);
CREATE POLICY "area_kr_updates_delete" ON area_kr_updates FOR DELETE USING (
  get_my_role() = 'admin' OR created_by = auth.uid()
);

-- RLS Policies: company_kr_updates
CREATE POLICY "company_kr_updates_select" ON company_kr_updates FOR SELECT USING (true);
CREATE POLICY "company_kr_updates_insert" ON company_kr_updates FOR INSERT WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "company_kr_updates_update" ON company_kr_updates FOR UPDATE USING (
  get_my_role() = 'admin' OR created_by = auth.uid()
);
CREATE POLICY "company_kr_updates_delete" ON company_kr_updates FOR DELETE USING (
  get_my_role() = 'admin' OR created_by = auth.uid()
);

-- Trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, full_name, role)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', 'team_member');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Seed: 10 Areas
INSERT INTO areas (name) VALUES
  ('Operations'),
  ('Revenue'),
  ('Marketing'),
  ('Customer Success'),
  ('Finance'),
  ('Legal'),
  ('Compliance'),
  ('People'),
  ('Tech'),
  ('Product');
