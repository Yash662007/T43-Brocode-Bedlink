ALTER TABLE public.inventory_audit_history
  ADD COLUMN source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN nurse_name TEXT;

ALTER TABLE public.inventory_audit_history
  ADD CONSTRAINT inventory_audit_history_source_check
  CHECK (source IN ('ai', 'manual', 'restore'));

UPDATE public.inventory_audit_history
SET source = CASE
  WHEN event_type = 'ai_proposed' THEN 'ai'
  WHEN event_type = 'restored' THEN 'restore'
  ELSE 'manual'
END,
nurse_name = CASE
  WHEN event_type = 'ai_proposed' THEN NULL
  ELSE 'Nurse Patel'
END
WHERE source = 'manual' AND nurse_name IS NULL;