# GST rate configuration for operators

The selectable GST percentages in `public.gst_rate_options` are application configuration. They are not seeded by migrations and are not a statement of current law. A business owner cannot edit this table. Confirm appropriate choices with the business owner/accountant before making them selectable. Historical catalog/document rates remain stored when an option is retired.

Use a trusted database operator connection against the intended environment. Do not use the browser publishable key or a Webameen owner account. Check the target database and take an operational backup before changing shared configuration.

For **local prototype testing only**, the agreed examples use 5%, 18% and 40%. To make these available in a local development database, run the following transaction with an operator connection after reviewing the target:

```sql
BEGIN;
INSERT INTO public.gst_rate_options (rate, selectable)
VALUES (5, true), (18, true), (40, true)
ON CONFLICT (rate) DO UPDATE SET selectable = EXCLUDED.selectable;
SELECT rate, selectable FROM public.gst_rate_options ORDER BY rate;
COMMIT;
```

To retire an option for **new selections**, use `UPDATE public.gst_rate_options SET selectable = false WHERE rate = <confirmed_rate>;` in a transaction. To reactivate it, set `selectable = true`. To change a percentage, add the new value and retire the old one; do not rewrite the rate key. Review existing catalog defaults that point to a retired choice before drafting new taxable lines. The table trigger acquires the shared configuration lock used by rate-validating commands. No existing document is recalculated.
