BEGIN;

-- Return paise and unscaled NUMERIC values as decimal text, preserving exact
-- catalog values across JSON and JavaScript boundaries. These SECURITY INVOKER
-- reads remain subject to catalog_items RLS.
CREATE FUNCTION public.list_catalog_items(
  p_search text,
  p_offset integer,
  p_limit integer
)
RETURNS TABLE(
  id uuid,
  kind text,
  name text,
  description text,
  unit_label text,
  default_unit_price_minor text,
  default_gst_category text,
  default_gst_rate text,
  hsn_sac text,
  archived_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $fn$
  SELECT i.id, i.kind, i.name, i.description, i.unit_label,
         i.default_unit_price_minor::text, i.default_gst_category,
         i.default_gst_rate::text, i.hsn_sac, i.archived_at, i.created_at, i.updated_at
  FROM public.catalog_items AS i
  WHERE i.archived_at IS NULL
    AND (
      COALESCE(p_search, '') = ''
      OR i.name ILIKE '%' || p_search || '%'
      OR i.description ILIKE '%' || p_search || '%'
      OR i.hsn_sac ILIKE '%' || p_search || '%'
    )
  ORDER BY i.name, i.id
  OFFSET p_offset LIMIT p_limit
$fn$;

CREATE FUNCTION public.get_catalog_item(p_catalog_item_id uuid)
RETURNS TABLE(
  id uuid,
  kind text,
  name text,
  description text,
  unit_label text,
  default_unit_price_minor text,
  default_gst_category text,
  default_gst_rate text,
  hsn_sac text,
  archived_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $fn$
  SELECT i.id, i.kind, i.name, i.description, i.unit_label,
         i.default_unit_price_minor::text, i.default_gst_category,
         i.default_gst_rate::text, i.hsn_sac, i.archived_at, i.created_at, i.updated_at
  FROM public.catalog_items AS i
  WHERE i.id = p_catalog_item_id
$fn$;

REVOKE ALL ON FUNCTION public.list_catalog_items(text,integer,integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_catalog_item(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_catalog_items(text,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_catalog_item(uuid) TO authenticated;

COMMIT;
