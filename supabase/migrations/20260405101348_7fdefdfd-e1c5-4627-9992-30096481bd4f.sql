
-- Notes table for voucher campaigns (same pattern as agreement_notes)
CREATE TABLE public.voucher_campaign_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES public.voucher_campaigns(id) ON DELETE CASCADE,
  author_name text NOT NULL,
  note_text text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.voucher_campaign_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to voucher_campaign_notes"
  ON public.voucher_campaign_notes
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add campaign-level status and manual claimed amount
ALTER TABLE public.voucher_campaigns
  ADD COLUMN claim_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN claimed_amount numeric,
  ADD COLUMN report_file_path text;

-- Storage bucket for voucher campaign reports
INSERT INTO storage.buckets (id, name, public) VALUES ('voucher-reports', 'voucher-reports', true);

CREATE POLICY "Anyone can read voucher reports"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'voucher-reports');

CREATE POLICY "Anyone can upload voucher reports"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'voucher-reports');

CREATE POLICY "Anyone can delete voucher reports"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'voucher-reports');
