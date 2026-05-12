CREATE TABLE public.shekel_campaign_groups (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.shekel_campaign_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to shekel_campaign_groups"
ON public.shekel_campaign_groups FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.shekel_campaign_settings
  ADD COLUMN group_id uuid REFERENCES public.shekel_campaign_groups(id) ON DELETE SET NULL;

-- Migrate existing free-text group_name values into the new groups table
INSERT INTO public.shekel_campaign_groups (name)
SELECT DISTINCT group_name FROM public.shekel_campaign_settings
WHERE group_name IS NOT NULL AND trim(group_name) <> ''
ON CONFLICT (name) DO NOTHING;

UPDATE public.shekel_campaign_settings s
SET group_id = g.id
FROM public.shekel_campaign_groups g
WHERE s.group_name = g.name;