
-- Voucher Campaigns: campaign metadata per supplier
CREATE TABLE public.voucher_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  campaign_name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.voucher_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to voucher_campaigns" ON public.voucher_campaigns FOR ALL USING (true) WITH CHECK (true);

-- Voucher Campaign Groups: SKU groups with voucher value
CREATE TABLE public.voucher_campaign_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.voucher_campaigns(id) ON DELETE CASCADE,
  group_name text NOT NULL,
  voucher_value numeric NOT NULL DEFAULT 0,
  item_codes text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.voucher_campaign_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to voucher_campaign_groups" ON public.voucher_campaign_groups FOR ALL USING (true) WITH CHECK (true);

-- Voucher Claim Status: track status per sales line
CREATE TABLE public.voucher_claim_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.voucher_campaigns(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.voucher_campaign_groups(id) ON DELETE CASCADE,
  sales_record_id uuid NOT NULL REFERENCES public.sales_records(id) ON DELETE CASCADE,
  quantity numeric NOT NULL DEFAULT 1,
  voucher_value numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.voucher_claim_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to voucher_claim_status" ON public.voucher_claim_status FOR ALL USING (true) WITH CHECK (true);

-- Updated_at triggers
CREATE TRIGGER update_voucher_campaigns_updated_at BEFORE UPDATE ON public.voucher_campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_voucher_claim_status_updated_at BEFORE UPDATE ON public.voucher_claim_status FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
