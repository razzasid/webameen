BEGIN;

-- Owner commands derive business scope from the authenticated session. Browser
-- clients never receive direct catalog write privileges or choose business_id.
CREATE FUNCTION private.create_catalog_item(
  p_kind text,
  p_name text,
  p_description text,
  p_unit_label text,
  p_default_unit_price_minor bigint,
  p_default_gst_category text,
  p_default_gst_rate numeric,
  p_hsn_sac text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_item_id uuid;
  v_name text := NULLIF(pg_catalog.btrim(p_name), '');
  v_description text := NULLIF(pg_catalog.btrim(p_description), '');
  v_unit_label text := NULLIF(pg_catalog.btrim(p_unit_label), '');
  v_hsn_sac text := NULLIF(pg_catalog.btrim(p_hsn_sac), '');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required';
  END IF;
  SELECT m.business_id INTO v_business_id
  FROM public.business_memberships AS m
  WHERE m.user_id = v_user_id AND m.role = 'owner' AND m.disabled_at IS NULL;
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Active business owner required';
  END IF;
  IF p_kind NOT IN ('product', 'service') OR v_name IS NULL
    OR p_default_gst_category NOT IN ('taxable', 'exempt', 'no_gst')
    OR p_default_unit_price_minor < 0
    OR ((p_default_gst_category = 'taxable') <> (p_default_gst_rate IS NOT NULL)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid catalog item input';
  END IF;
  IF p_default_gst_rate IS NOT NULL AND (
    p_default_gst_rate < 0 OR p_default_gst_rate > 100
    OR p_default_gst_rate::text IN ('NaN', 'Infinity', '-Infinity')
    OR NOT EXISTS (
      SELECT FROM public.gst_rate_options AS r
      WHERE r.rate = p_default_gst_rate AND r.selectable
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Select a currently configured catalog GST rate';
  END IF;
  INSERT INTO public.catalog_items (
    business_id, kind, name, description, unit_label, default_unit_price_minor,
    default_gst_category, default_gst_rate, hsn_sac, created_by
  ) VALUES (
    v_business_id, p_kind, v_name, v_description, v_unit_label,
    p_default_unit_price_minor, p_default_gst_category, p_default_gst_rate,
    v_hsn_sac, v_user_id
  ) RETURNING id INTO v_item_id;
  RETURN v_item_id;
END
$fn$;

CREATE FUNCTION private.update_catalog_item(
  p_catalog_item_id uuid,
  p_kind text,
  p_name text,
  p_description text,
  p_unit_label text,
  p_default_unit_price_minor bigint,
  p_default_gst_category text,
  p_default_gst_rate numeric,
  p_hsn_sac text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_item_id uuid;
  v_name text := NULLIF(pg_catalog.btrim(p_name), '');
  v_description text := NULLIF(pg_catalog.btrim(p_description), '');
  v_unit_label text := NULLIF(pg_catalog.btrim(p_unit_label), '');
  v_hsn_sac text := NULLIF(pg_catalog.btrim(p_hsn_sac), '');
  v_current_rate numeric;
  v_current_category text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required';
  END IF;
  SELECT m.business_id INTO v_business_id
  FROM public.business_memberships AS m
  WHERE m.user_id = v_user_id AND m.role = 'owner' AND m.disabled_at IS NULL;
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Active business owner required';
  END IF;
  IF p_catalog_item_id IS NULL OR p_kind NOT IN ('product', 'service') OR v_name IS NULL
    OR p_default_gst_category NOT IN ('taxable', 'exempt', 'no_gst')
    OR p_default_unit_price_minor < 0
    OR ((p_default_gst_category = 'taxable') <> (p_default_gst_rate IS NOT NULL)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid catalog item input';
  END IF;
  SELECT i.default_gst_category, i.default_gst_rate
  INTO v_current_category, v_current_rate
  FROM public.catalog_items AS i
  WHERE i.id = p_catalog_item_id AND i.business_id = v_business_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Catalog item not found';
  END IF;
  IF p_default_gst_rate IS NOT NULL AND (
    p_default_gst_rate < 0 OR p_default_gst_rate > 100
    OR p_default_gst_rate::text IN ('NaN', 'Infinity', '-Infinity')
    OR ((p_default_gst_category, p_default_gst_rate)
        IS DISTINCT FROM (v_current_category, v_current_rate)
        AND NOT EXISTS (
          SELECT FROM public.gst_rate_options AS r
          WHERE r.rate = p_default_gst_rate AND r.selectable
        ))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Select a currently configured catalog GST rate';
  END IF;
  UPDATE public.catalog_items AS i SET
    kind = p_kind, name = v_name, description = v_description,
    unit_label = v_unit_label, default_unit_price_minor = p_default_unit_price_minor,
    default_gst_category = p_default_gst_category, default_gst_rate = p_default_gst_rate,
    hsn_sac = v_hsn_sac, updated_at = pg_catalog.clock_timestamp()
  WHERE i.id = p_catalog_item_id AND i.business_id = v_business_id
  RETURNING i.id INTO v_item_id;
  RETURN v_item_id;
END
$fn$;

CREATE FUNCTION public.create_catalog_item(
  p_kind text, p_name text, p_description text, p_unit_label text,
  p_default_unit_price_minor bigint, p_default_gst_category text,
  p_default_gst_rate numeric, p_hsn_sac text
) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $fn$ SELECT private.create_catalog_item($1,$2,$3,$4,$5,$6,$7,$8) $fn$;

CREATE FUNCTION public.update_catalog_item(
  p_catalog_item_id uuid, p_kind text, p_name text, p_description text,
  p_unit_label text, p_default_unit_price_minor bigint,
  p_default_gst_category text, p_default_gst_rate numeric, p_hsn_sac text
) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $fn$ SELECT private.update_catalog_item($1,$2,$3,$4,$5,$6,$7,$8,$9) $fn$;

-- Return exact configured decimal text so the app never round-trips NUMERIC
-- rates through JavaScript floating-point values.
CREATE FUNCTION public.list_catalog_gst_rates()
RETURNS TABLE(rate text)
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $fn$
  SELECT options.rate::text
  FROM public.gst_rate_options AS options
  WHERE options.selectable
  ORDER BY options.rate
$fn$;


REVOKE ALL ON FUNCTION private.create_catalog_item(text,text,text,text,bigint,text,numeric,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.update_catalog_item(uuid,text,text,text,text,bigint,text,numeric,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_catalog_item(text,text,text,text,bigint,text,numeric,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_catalog_item(uuid,text,text,text,text,bigint,text,numeric,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_catalog_gst_rates() FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.create_catalog_item(text,text,text,text,bigint,text,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.update_catalog_item(uuid,text,text,text,text,bigint,text,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_catalog_item(text,text,text,text,bigint,text,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_catalog_item(uuid,text,text,text,text,bigint,text,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_catalog_gst_rates() TO authenticated;

GRANT CREATE ON SCHEMA private TO webameen_executor;
GRANT webameen_executor TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;
ALTER FUNCTION private.create_catalog_item(text,text,text,text,bigint,text,numeric,text) OWNER TO webameen_executor;
ALTER FUNCTION private.update_catalog_item(uuid,text,text,text,text,bigint,text,numeric,text) OWNER TO webameen_executor;
REVOKE CREATE ON SCHEMA private FROM webameen_executor;
REVOKE webameen_executor FROM CURRENT_USER;

COMMIT;
