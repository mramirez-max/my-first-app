-- Storage bucket for company documents (board decks, investor updates, etc.)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-documents',
  'company-documents',
  true,
  52428800,  -- 50 MB limit
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Anyone authenticated can read
CREATE POLICY "documents_storage_select" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'company-documents');

-- Only admins can upload
CREATE POLICY "documents_storage_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'company-documents' AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Only admins can delete
CREATE POLICY "documents_storage_delete" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'company-documents' AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
