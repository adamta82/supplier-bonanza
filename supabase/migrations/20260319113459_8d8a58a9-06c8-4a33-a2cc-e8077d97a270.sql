ALTER TABLE public.sales_records ADD COLUMN IF NOT EXISTS zabilo_id text;
ALTER TABLE public.sales_records ADD COLUMN IF NOT EXISTS order_status text;