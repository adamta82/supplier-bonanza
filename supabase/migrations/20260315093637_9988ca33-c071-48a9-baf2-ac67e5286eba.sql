
CREATE TABLE public.agreement_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agreement_id UUID NOT NULL REFERENCES public.bonus_agreements(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  note_text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.agreement_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to agreement_notes"
  ON public.agreement_notes
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);
