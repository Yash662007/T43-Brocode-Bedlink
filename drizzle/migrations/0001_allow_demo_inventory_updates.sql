GRANT INSERT, UPDATE ON public.hospital_inventory TO anon;

DROP POLICY "Signed-in staff can add hospital inventory" ON public.hospital_inventory;
DROP POLICY "Signed-in staff can update hospital inventory" ON public.hospital_inventory;

CREATE POLICY "Demo staff can add hospital inventory"
ON public.hospital_inventory
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Demo staff can update hospital inventory"
ON public.hospital_inventory
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);