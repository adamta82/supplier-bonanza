
-- Add bonus_payment_type: 'money' or 'goods'. If money, bonus doesn't count in profit.
ALTER TABLE public.bonus_agreements 
ADD COLUMN bonus_payment_type text NOT NULL DEFAULT 'goods';

-- Add exclusions: JSONB array of {keyword, counts_toward_target, gets_bonus}
ALTER TABLE public.bonus_agreements 
ADD COLUMN exclusions jsonb DEFAULT '[]'::jsonb;
