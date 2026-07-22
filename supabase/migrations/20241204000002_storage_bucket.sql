-- Create storage bucket for pharmacy logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('pharmacy-logos', 'pharmacy-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Set up storage policies
CREATE POLICY "Authenticated users can upload logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'pharmacy-logos');

CREATE POLICY "Public can view logos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'pharmacy-logos');

CREATE POLICY "Users can update their pharmacy logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'pharmacy-logos');

CREATE POLICY "Users can delete their pharmacy logos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'pharmacy-logos');
