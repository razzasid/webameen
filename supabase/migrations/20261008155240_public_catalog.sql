BEGIN;

-- URLs are allocated once, independently of the business name. Existing
-- businesses get a URL too; existing catalog items remain private drafts.
ALTER TABLE public.businesses ADD COLUMN public_catalog_slug text NOT NULL
  DEFAULT ('catalog-' || gen_random_uuid()::text)
  UNIQUE CHECK (public_catalog_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(public_catalog_slug) <= 80);
ALTER TABLE public.catalog_items ADD COLUMN is_published boolean NOT NULL DEFAULT false;
CREATE INDEX catalog_items_public_list_idx ON public.catalog_items(business_id, name, id)
  WHERE is_published AND archived_at IS NULL;

CREATE FUNCTION private.keep_public_catalog_slug() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $fn$
BEGIN
  IF NEW.public_catalog_slug IS DISTINCT FROM OLD.public_catalog_slug THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Public catalog URLs cannot change';
  END IF;
  RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION private.keep_public_catalog_slug() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER a_public_catalog_slug BEFORE UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION private.keep_public_catalog_slug();

-- A dedicated, read-only role uses forced RLS and column grants. Public RPCs
-- deliberately do not require auth: they expose only the fields below. Neither
-- anon nor authenticated gains public SELECT access to the private base tables.
DO $role$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'webameen_catalog_reader') THEN
    CREATE ROLE webameen_catalog_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'webameen_catalog_reader'
    AND (rolcanlogin OR rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole)) THEN
    RAISE EXCEPTION 'Public catalog reader has incompatible privileges';
  END IF;
END
$role$;
GRANT USAGE ON SCHEMA public, private TO webameen_catalog_reader;
GRANT SELECT (id, display_name, public_catalog_slug) ON public.businesses TO webameen_catalog_reader;
GRANT SELECT (id, business_id, kind, name, description, unit_label,
  default_unit_price_minor, default_gst_category, default_gst_rate, is_published, archived_at)
  ON public.catalog_items TO webameen_catalog_reader;
CREATE POLICY businesses_public_catalog_read ON public.businesses
  FOR SELECT TO webameen_catalog_reader USING (true);
CREATE POLICY catalog_items_public_catalog_read ON public.catalog_items
  FOR SELECT TO webameen_catalog_reader USING (is_published AND archived_at IS NULL);

CREATE FUNCTION private.get_public_catalog(p_slug text)
RETURNS TABLE(slug text, business_name text, item_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
  SELECT b.public_catalog_slug, b.display_name,
    (SELECT count(*)::integer FROM public.catalog_items i WHERE i.business_id = b.id)
  FROM public.businesses b WHERE b.public_catalog_slug = p_slug
$fn$;
CREATE FUNCTION public.get_public_catalog(p_slug text)
RETURNS TABLE(slug text, business_name text, item_count integer)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $fn$
  SELECT * FROM private.get_public_catalog(p_slug)
$fn$;

CREATE FUNCTION private.list_public_catalog_items(p_slug text, p_offset integer, p_limit integer)
RETURNS TABLE(id uuid, kind text, name text, description text, unit_label text,
  price_minor text, gst_category text, gst_rate text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
  SELECT i.id, i.kind, i.name, i.description, i.unit_label,
    i.default_unit_price_minor::text, i.default_gst_category, i.default_gst_rate::text
  FROM public.businesses b JOIN public.catalog_items i ON i.business_id = b.id
  WHERE b.public_catalog_slug = p_slug
  ORDER BY i.name, i.id
  OFFSET greatest(coalesce(p_offset, 0), 0) LIMIT least(greatest(coalesce(p_limit, 12), 1), 24)
$fn$;
CREATE FUNCTION public.list_public_catalog_items(p_slug text, p_offset integer DEFAULT 0, p_limit integer DEFAULT 12)
RETURNS TABLE(id uuid, kind text, name text, description text, unit_label text,
  price_minor text, gst_category text, gst_rate text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $fn$
  SELECT * FROM private.list_public_catalog_items(p_slug, p_offset, p_limit)
$fn$;

CREATE FUNCTION private.get_public_catalog_item(p_slug text, p_item_id uuid)
RETURNS TABLE(id uuid, kind text, name text, description text, unit_label text,
  price_minor text, gst_category text, gst_rate text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
  SELECT i.id, i.kind, i.name, i.description, i.unit_label,
    i.default_unit_price_minor::text, i.default_gst_category, i.default_gst_rate::text
  FROM public.businesses b JOIN public.catalog_items i ON i.business_id = b.id
  WHERE b.public_catalog_slug = p_slug AND i.id = p_item_id
$fn$;
CREATE FUNCTION public.get_public_catalog_item(p_slug text, p_item_id uuid)
RETURNS TABLE(id uuid, kind text, name text, description text, unit_label text,
  price_minor text, gst_category text, gst_rate text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $fn$
  SELECT * FROM private.get_public_catalog_item(p_slug, p_item_id)
$fn$;

REVOKE ALL ON FUNCTION private.get_public_catalog(text), public.get_public_catalog(text),
  private.list_public_catalog_items(text,integer,integer), public.list_public_catalog_items(text,integer,integer),
  private.get_public_catalog_item(text,uuid), public.get_public_catalog_item(text,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA private TO anon;
GRANT EXECUTE ON FUNCTION private.get_public_catalog(text), public.get_public_catalog(text),
  private.list_public_catalog_items(text,integer,integer), public.list_public_catalog_items(text,integer,integer),
  private.get_public_catalog_item(text,uuid), public.get_public_catalog_item(text,uuid)
  TO anon, authenticated;

GRANT UPDATE (is_published) ON public.catalog_items TO webameen_executor;
CREATE FUNCTION private.set_catalog_item_published(p_item_id uuid, p_published boolean) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_business uuid; v_item uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required';
  END IF;
  SELECT m.business_id INTO v_business FROM public.business_memberships m
    WHERE m.user_id = auth.uid() AND m.role = 'owner' AND m.disabled_at IS NULL;
  IF v_business IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Active business owner required';
  END IF;
  IF p_published IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Publication choice is required';
  END IF;
  UPDATE public.catalog_items SET is_published = p_published, updated_at = clock_timestamp()
    WHERE id = p_item_id AND business_id = v_business AND archived_at IS NULL
    RETURNING id INTO v_item;
  IF v_item IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Catalog item unavailable';
  END IF;
  RETURN v_item;
END
$fn$;
CREATE FUNCTION public.set_catalog_item_published(p_item_id uuid, p_published boolean) RETURNS uuid
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $fn$
  SELECT private.set_catalog_item_published(p_item_id, p_published)
$fn$;
REVOKE ALL ON FUNCTION private.set_catalog_item_published(uuid,boolean), public.set_catalog_item_published(uuid,boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.set_catalog_item_published(uuid,boolean), public.set_catalog_item_published(uuid,boolean)
  TO authenticated;

-- Function owners cannot log in or bypass RLS. No caller can assume these roles.
GRANT CREATE ON SCHEMA private TO webameen_catalog_reader, webameen_executor;
GRANT webameen_catalog_reader, webameen_executor TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;
ALTER FUNCTION private.get_public_catalog(text) OWNER TO webameen_catalog_reader;
ALTER FUNCTION private.list_public_catalog_items(text,integer,integer) OWNER TO webameen_catalog_reader;
ALTER FUNCTION private.get_public_catalog_item(text,uuid) OWNER TO webameen_catalog_reader;
ALTER FUNCTION private.set_catalog_item_published(uuid,boolean) OWNER TO webameen_executor;
REVOKE CREATE ON SCHEMA private FROM webameen_catalog_reader, webameen_executor;
REVOKE webameen_catalog_reader, webameen_executor FROM CURRENT_USER;

COMMIT;
