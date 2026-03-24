
CREATE TABLE public.historical_supplier_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year integer NOT NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE CASCADE,
  supplier_name text,
  supplier_number text,
  purchase_volume numeric DEFAULT 0,
  sales_volume numeric DEFAULT 0,
  cost_total numeric DEFAULT 0,
  profit_amount numeric DEFAULT 0,
  profit_margin numeric DEFAULT 0,
  record_count integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(year, supplier_id)
);

ALTER TABLE public.historical_supplier_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to historical_supplier_data"
  ON public.historical_supplier_data
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);
