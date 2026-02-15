
-- ============================================
-- WE LOVE Profit - Database Schema
-- ============================================

-- 1. Suppliers table
CREATE TABLE public.suppliers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  supplier_number TEXT,
  payment_terms TEXT,
  shotef INTEGER, -- שוטף
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

-- Public access for small team (no auth for now, simplified)
CREATE POLICY "Allow all access to suppliers" ON public.suppliers FOR ALL USING (true) WITH CHECK (true);

-- 2. Bonus agreements table
CREATE TABLE public.bonus_agreements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  bonus_type TEXT NOT NULL CHECK (bonus_type IN ('annual_target', 'marketing', 'transaction', 'annual_fixed', 'network')),
  period_type TEXT CHECK (period_type IN ('monthly', 'quarterly', 'annual', 'custom')),
  period_start DATE,
  period_end DATE,
  vat_included BOOLEAN DEFAULT false,
  target_type TEXT CHECK (target_type IN ('amount', 'quantity')), -- שקלי או כמותי
  category_filter TEXT, -- קטגוריה/סדרה ספציפית
  category_mode TEXT CHECK (category_mode IN ('include_only', 'exclude', 'all')), -- מצב סינון
  fixed_amount NUMERIC, -- סכום קבוע (לבונוס קבוע/שיווק)
  fixed_percentage NUMERIC, -- אחוז קבוע (לבונוס קבוע/שיווק/עסקה)
  series_name TEXT, -- שם סדרה לבונוס רשתי
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bonus_agreements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to bonus_agreements" ON public.bonus_agreements FOR ALL USING (true) WITH CHECK (true);

-- 3. Bonus tiers (מדרגות) for target-based bonuses
CREATE TABLE public.bonus_tiers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agreement_id UUID NOT NULL REFERENCES public.bonus_agreements(id) ON DELETE CASCADE,
  tier_order INTEGER NOT NULL,
  target_value NUMERIC NOT NULL, -- סכום/כמות יעד
  bonus_percentage NUMERIC NOT NULL, -- אחוז בונוס
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bonus_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to bonus_tiers" ON public.bonus_tiers FOR ALL USING (true) WITH CHECK (true);

-- 4. Purchase records (from Excel uploads)
CREATE TABLE public.purchase_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT,
  supplier_number TEXT,
  order_number TEXT,
  order_date DATE,
  item_code TEXT,
  item_description TEXT,
  quantity NUMERIC,
  unit_price NUMERIC,
  total_amount NUMERIC,
  category TEXT,
  upload_batch TEXT, -- for grouping uploads
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.purchase_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to purchase_records" ON public.purchase_records FOR ALL USING (true) WITH CHECK (true);

-- 5. Sales records (from Excel uploads)
CREATE TABLE public.sales_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT,
  item_code TEXT,
  item_description TEXT,
  quantity NUMERIC,
  sale_price NUMERIC,
  cost_price NUMERIC, -- עלות ישירה
  profit_direct NUMERIC, -- רווח ישיר
  customer_name TEXT,
  sale_date DATE,
  category TEXT,
  upload_batch TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sales_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to sales_records" ON public.sales_records FOR ALL USING (true) WITH CHECK (true);

-- 6. Transaction bonuses (manual entry)
CREATE TABLE public.transaction_bonuses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  agreement_id UUID REFERENCES public.bonus_agreements(id) ON DELETE SET NULL,
  transaction_date DATE NOT NULL,
  description TEXT,
  total_value NUMERIC NOT NULL, -- ערך העסקה הכולל
  bonus_value NUMERIC NOT NULL, -- שווי הבונוס (חינם/הנחה)
  items_detail TEXT, -- פירוט פריטים
  counts_toward_target BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.transaction_bonuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to transaction_bonuses" ON public.transaction_bonuses FOR ALL USING (true) WITH CHECK (true);

-- Update timestamp function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers for updated_at
CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_bonus_agreements_updated_at BEFORE UPDATE ON public.bonus_agreements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
