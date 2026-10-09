-- Local/test fixtures only. These are selectable UI options, not legal advice
-- or production GST configuration. Configure production rates separately.
INSERT INTO public.gst_rate_options (rate, selectable)
VALUES
  (0, true),
  (5, true),
  (12, true),
  (18, true),
  (28, true),
  (40, true)
ON CONFLICT (rate) DO UPDATE SET selectable = EXCLUDED.selectable;
