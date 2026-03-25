
-- Shekel campaign settings per supplier
CREATE TABLE public.shekel_campaign_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  campaign_name text NOT NULL, -- 'pesach' or 'rosh_hashana'
  start_date date NOT NULL,
  end_date date NOT NULL,
  threshold_amount numeric NOT NULL DEFAULT 1200,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(supplier_id, campaign_name)
);

ALTER TABLE public.shekel_campaign_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to shekel_campaign_settings" ON public.shekel_campaign_settings FOR ALL USING (true) WITH CHECK (true);

-- Exclusions for individual purchase items from shekel campaign
CREATE TABLE public.shekel_campaign_exclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_setting_id uuid NOT NULL REFERENCES public.shekel_campaign_settings(id) ON DELETE CASCADE,
  purchase_record_id uuid NOT NULL REFERENCES public.purchase_records(id) ON DELETE CASCADE,
  excluded_at timestamp with time zone NOT NULL DEFAULT now(),
  gift_status text NOT NULL DEFAULT 'pending', -- 'pending', 'received', 'not_received'
  UNIQUE(campaign_setting_id, purchase_record_id)
);

ALTER TABLE public.shekel_campaign_exclusions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to shekel_campaign_exclusions" ON public.shekel_campaign_exclusions FOR ALL USING (true) WITH CHECK (true);
