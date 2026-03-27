-- Company documents (board decks, investor updates, etc.)
CREATE TABLE company_documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  doc_type    text NOT NULL DEFAULT 'other',
  doc_date    date,
  blob_url    text,
  summary     text NOT NULL DEFAULT '',
  created_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE company_documents ENABLE ROW LEVEL SECURITY;

-- Everyone (authenticated) can read documents
CREATE POLICY "documents_select" ON company_documents
  FOR SELECT TO authenticated USING (true);

-- Only admins can write
CREATE POLICY "documents_insert" ON company_documents
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "documents_update" ON company_documents
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "documents_delete" ON company_documents
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
