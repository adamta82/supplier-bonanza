ALTER TABLE public.shekel_campaign_settings
ADD COLUMN double_gift_threshold numeric DEFAULT NULL,
ADD COLUMN supplier_reported_gifts integer DEFAULT NULL;