
-- Add document_path column to bonus_agreements
ALTER TABLE public.bonus_agreements ADD COLUMN document_path text;

-- Create storage bucket for agreement documents
INSERT INTO storage.buckets (id, name, public) VALUES ('agreement-documents', 'agreement-documents', true);

-- Allow public read access
CREATE POLICY "Agreement documents are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'agreement-documents');

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload agreement documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'agreement-documents' AND auth.role() = 'authenticated');

-- Allow authenticated users to delete
CREATE POLICY "Authenticated users can delete agreement documents"
ON storage.objects FOR DELETE
USING (bucket_id = 'agreement-documents' AND auth.role() = 'authenticated');
