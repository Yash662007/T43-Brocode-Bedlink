CREATE TABLE public.hospital_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_key TEXT NOT NULL,
  hospital_name TEXT NOT NULL,
  bed_type TEXT NOT NULL CHECK (bed_type IN ('icu', 'ventilator', 'oxygen', 'cardiac', 'burns')),
  free_count INTEGER NOT NULL DEFAULT 0 CHECK (free_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT NOT NULL DEFAULT 'nurse',
  UNIQUE (hospital_key, bed_type)
);

GRANT SELECT ON public.hospital_inventory TO anon, authenticated;
GRANT INSERT, UPDATE ON public.hospital_inventory TO authenticated;
GRANT ALL ON public.hospital_inventory TO service_role;

ALTER TABLE public.hospital_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read hospital inventory"
ON public.hospital_inventory
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Signed-in staff can add hospital inventory"
ON public.hospital_inventory
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Signed-in staff can update hospital inventory"
ON public.hospital_inventory
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.hospital_inventory;