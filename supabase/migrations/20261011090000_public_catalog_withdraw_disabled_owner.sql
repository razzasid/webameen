BEGIN;

-- A disabled owner withdraws the business catalog from every public entry
-- point. This dedicated reader can see only active owner membership rows.
GRANT SELECT (business_id, role, disabled_at)
  ON public.business_memberships TO webameen_catalog_reader;
CREATE POLICY catalog_reader_active_owner_read ON public.business_memberships
  FOR SELECT TO webameen_catalog_reader
  USING (role = 'owner' AND disabled_at IS NULL);

-- These SECURITY DEFINER functions are owned by the restricted catalog role.
-- Temporarily assume that owner to preserve the existing privilege boundary.
GRANT CREATE ON SCHEMA private TO webameen_catalog_reader;
GRANT webameen_catalog_reader TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;
SET LOCAL ROLE webameen_catalog_reader;

CREATE OR REPLACE FUNCTION private.get_public_catalog(p_slug text)
RETURNS TABLE(slug text, business_name text, item_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
  SELECT b.public_catalog_slug, b.display_name,
    (SELECT count(*)::integer FROM public.catalog_items i WHERE i.business_id = b.id)
  FROM public.businesses b
  WHERE b.public_catalog_slug = p_slug
    AND EXISTS (
      SELECT FROM public.business_memberships m
      WHERE m.business_id = b.id AND m.role = 'owner' AND m.disabled_at IS NULL
    )
$fn$;

CREATE OR REPLACE FUNCTION private.list_public_catalog_items(p_slug text, p_offset integer, p_limit integer)
RETURNS TABLE(id uuid, kind text, name text, description text, unit_label text,
  price_minor text, gst_category text, gst_rate text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
  SELECT i.id, i.kind, i.name, i.description, i.unit_label,
    i.default_unit_price_minor::text, i.default_gst_category, i.default_gst_rate::text
  FROM public.businesses b
  JOIN public.catalog_items i ON i.business_id = b.id
  WHERE b.public_catalog_slug = p_slug
    AND EXISTS (
      SELECT FROM public.business_memberships m
      WHERE m.business_id = b.id AND m.role = 'owner' AND m.disabled_at IS NULL
    )
  ORDER BY i.name, i.id
  OFFSET greatest(coalesce(p_offset, 0), 0) LIMIT least(greatest(coalesce(p_limit, 12), 1), 24)
$fn$;

CREATE OR REPLACE FUNCTION private.get_public_catalog_item(p_slug text, p_item_id uuid)
RETURNS TABLE(id uuid, kind text, name text, description text, unit_label text,
  price_minor text, gst_category text, gst_rate text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
  SELECT i.id, i.kind, i.name, i.description, i.unit_label,
    i.default_unit_price_minor::text, i.default_gst_category, i.default_gst_rate::text
  FROM public.businesses b
  JOIN public.catalog_items i ON i.business_id = b.id
  WHERE b.public_catalog_slug = p_slug AND i.id = p_item_id
    AND EXISTS (
      SELECT FROM public.business_memberships m
      WHERE m.business_id = b.id AND m.role = 'owner' AND m.disabled_at IS NULL
    )
$fn$;

RESET ROLE;
REVOKE webameen_catalog_reader FROM CURRENT_USER;
REVOKE CREATE ON SCHEMA private FROM webameen_catalog_reader;

COMMIT;
