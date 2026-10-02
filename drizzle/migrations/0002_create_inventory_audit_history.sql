CREATE TABLE public.inventory_audit_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_key TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('ai_proposed', 'nurse_applied', 'restored')),
  changes JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL DEFAULT 'nurse'
);

GRANT SELECT, INSERT ON public.inventory_audit_history TO anon, authenticated;
GRANT ALL ON public.inventory_audit_history TO service_role;

ALTER TABLE public.inventory_audit_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read inventory audit history"
ON public.inventory_audit_history
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Demo staff can add inventory audit history"
ON public.inventory_audit_history
FOR INSERT
TO anon, authenticated
WITH CHECK (true);