
-- Supplier invoice line items (from standard supplier invoice file)
CREATE TABLE public.supplier_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text,
  internal_number text,
  po_number text,
  supplier_number text,
  supplier_name text,
  invoice_date date,
  total_payment numeric,
  item_code text,
  item_description text,
  quantity numeric,
  unit_price numeric,
  total_with_vat numeric,
  status text,
  upload_batch text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Delivery note line items (from delivery notes file)
CREATE TABLE public.delivery_note_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_number text,
  order_number text,
  supplier_number text,
  supplier_name text,
  customer_name text,
  item_code text,
  item_description text,
  quantity numeric,
  total_price numeric,
  status text,
  note_date date,
  upload_batch text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Consolidated supplier invoice line items (with GR field)
CREATE TABLE public.consolidated_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text,
  internal_number text,
  po_number text,
  gr_number text,
  supplier_number text,
  supplier_name text,
  invoice_date date,
  item_code text,
  item_description text,
  unit_price numeric,
  quantity numeric,
  total_with_vat numeric,
  status text,
  upload_batch text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Persistent reconciliation approvals (survives data re-uploads)
CREATE TABLE public.reconciliation_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_type text NOT NULL,
  match_key text NOT NULL,
  document_type text NOT NULL,
  approval_notes text,
  original_value numeric,
  matched_value numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(match_type, match_key, document_type)
);

-- Enable RLS
ALTER TABLE public.supplier_invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_note_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consolidated_invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_approvals ENABLE ROW LEVEL SECURITY;

-- RLS policies (public access like other tables)
CREATE POLICY "Allow all access to supplier_invoice_items" ON public.supplier_invoice_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to delivery_note_items" ON public.delivery_note_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to consolidated_invoice_items" ON public.consolidated_invoice_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to reconciliation_approvals" ON public.reconciliation_approvals FOR ALL USING (true) WITH CHECK (true);
