
CREATE OR REPLACE FUNCTION get_purchases_by_supplier()
RETURNS TABLE (
  supplier_name text,
  total_amount numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    pr.supplier_name,
    COALESCE(SUM(pr.total_amount), 0) as total_amount
  FROM public.purchase_records pr
  WHERE pr.supplier_name IS NOT NULL
  GROUP BY pr.supplier_name;
$$;
