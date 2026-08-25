CREATE POLICY "report photos readable by authenticated"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'report-photos');

CREATE POLICY "upload own report photo"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'report-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "update own report photo"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'report-photos' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'report-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "delete own report photo"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'report-photos' AND (storage.foldername(name))[1] = auth.uid()::text);