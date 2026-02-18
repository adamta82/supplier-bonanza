
-- Add annual bonus status: 'none' (no annual bonus for this supplier), 'pending', 'received'
ALTER TABLE public.suppliers ADD COLUMN annual_bonus_status text DEFAULT 'pending';

-- Reconciliation date - when was the supplier account last reconciled
ALTER TABLE public.suppliers ADD COLUMN reconciliation_date date DEFAULT NULL;
