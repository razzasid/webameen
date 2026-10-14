BEGIN;

-- Business logos are intended to appear on customer-facing quotations. The
-- random asset path keeps them immutable so older quotation snapshots retain
-- their original logo after a business replaces it.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'webameen-quotation-logos',
  'webameen-quotation-logos',
  true,
  700000,
  ARRAY['image/png', 'image/jpeg']::text[]
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY webameen_quotation_logo_owner_upload
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'webameen-quotation-logos'
    AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg)$'
    AND EXISTS (
      SELECT 1
      FROM public.business_memberships AS membership
      WHERE membership.business_id::text = (storage.foldername(name))[1]
        AND membership.user_id = (SELECT auth.uid())
        AND membership.role = 'owner'
        AND membership.disabled_at IS NULL
    )
  );

GRANT webameen_executor, webameen_quote_broker TO CURRENT_USER
  WITH INHERIT FALSE, SET TRUE;
GRANT CREATE ON SCHEMA private TO webameen_executor, webameen_quote_broker;

SET LOCAL ROLE webameen_executor;
CREATE FUNCTION private.update_business_logo(
  p_logo_asset_key text,
  p_logo_sha256_hex text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_logo_asset_key text := NULLIF(pg_catalog.btrim(p_logo_asset_key), '');
  v_logo_sha256_hex text := NULLIF(pg_catalog.lower(pg_catalog.btrim(p_logo_sha256_hex)), '');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required';
  END IF;

  SELECT membership.business_id INTO v_business_id
  FROM public.business_memberships AS membership
  WHERE membership.user_id = v_user_id;
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Active owner required';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended('webameen/business/' || v_business_id::text, 0)
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.business_memberships AS membership
    WHERE membership.user_id = v_user_id
      AND membership.business_id = v_business_id
      AND membership.role = 'owner'
      AND membership.disabled_at IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Active owner required';
  END IF;

  IF (v_logo_asset_key IS NULL) <> (v_logo_sha256_hex IS NULL)
    OR (
      v_logo_asset_key IS NOT NULL
      AND (
        v_logo_asset_key !~ (
          '^' || v_business_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg)$'
        )
        OR v_logo_sha256_hex !~ '^[0-9a-f]{64}$'
      )
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid business logo';
  END IF;

  UPDATE public.businesses AS business
  SET logo_asset_key = v_logo_asset_key,
      logo_sha256 = CASE
        WHEN v_logo_sha256_hex IS NULL THEN NULL
        ELSE pg_catalog.decode(v_logo_sha256_hex, 'hex')
      END,
      updated_at = pg_catalog.clock_timestamp()
  WHERE business.id = v_business_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Active owner required';
  END IF;
  RETURN v_business_id;
END
$fn$;
RESET ROLE;

REVOKE ALL ON FUNCTION private.update_business_logo(text, text)
  FROM PUBLIC, anon, authenticated, service_role, webameen_executor, webameen_quote_broker;
GRANT EXECUTE ON FUNCTION private.update_business_logo(text, text) TO authenticated;

CREATE FUNCTION public.update_business_logo(
  p_logo_asset_key text,
  p_logo_sha256_hex text
) RETURNS uuid
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $fn$
  SELECT private.update_business_logo(p_logo_asset_key, p_logo_sha256_hex)
$fn$;
REVOKE ALL ON FUNCTION public.update_business_logo(text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_business_logo(text, text) TO authenticated;

SET LOCAL ROLE webameen_quote_broker;
CREATE FUNCTION private.read_public_quotation_logo_asset_key(p_token_hash_hex text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_hash bytea;
  v_business_id uuid;
  v_link record;
  v_logo_asset_key text;
BEGIN
  IF p_token_hash_hex IS NULL OR p_token_hash_hex !~ '^[0-9a-fA-F]{64}$' THEN
    RETURN NULL;
  END IF;
  v_hash := pg_catalog.decode(p_token_hash_hex, 'hex');

  SELECT link.business_id INTO v_business_id
  FROM public.quotation_public_links AS link
  WHERE link.token_hash = v_hash;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended('webameen/business/' || v_business_id::text, 0)
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.business_memberships AS membership
    WHERE membership.business_id = v_business_id
      AND membership.disabled_at IS NULL
  ) THEN
    RETURN NULL;
  END IF;

  SELECT link.version_id, link.access_expires_at, link.revoked_at
  INTO v_link
  FROM public.quotation_public_links AS link
  WHERE link.business_id = v_business_id
    AND link.token_hash = v_hash;
  IF NOT FOUND OR v_link.revoked_at IS NOT NULL
    OR (v_link.access_expires_at IS NOT NULL
      AND pg_catalog.clock_timestamp() >= v_link.access_expires_at)
  THEN
    RETURN NULL;
  END IF;

  SELECT version.seller_logo_asset_key INTO v_logo_asset_key
  FROM public.quotation_versions AS version
  WHERE version.business_id = v_business_id
    AND version.id = v_link.version_id
    AND version.shared_at IS NOT NULL;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN v_logo_asset_key;
END
$fn$;
RESET ROLE;

REVOKE ALL ON FUNCTION private.read_public_quotation_logo_asset_key(text)
  FROM PUBLIC, anon, authenticated, service_role, webameen_executor, webameen_quote_broker;
GRANT EXECUTE ON FUNCTION private.read_public_quotation_logo_asset_key(text) TO service_role;

CREATE FUNCTION public.read_public_quotation_logo_asset_key(p_token_hash_hex text)
RETURNS text
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $fn$
  SELECT private.read_public_quotation_logo_asset_key(p_token_hash_hex)
$fn$;
REVOKE ALL ON FUNCTION public.read_public_quotation_logo_asset_key(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.read_public_quotation_logo_asset_key(text) TO service_role;

REVOKE CREATE ON SCHEMA private FROM webameen_executor, webameen_quote_broker;
REVOKE webameen_executor, webameen_quote_broker FROM CURRENT_USER;

COMMIT;
