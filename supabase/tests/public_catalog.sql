-- Disposable fixtures; every change rolls back. Run with ON_ERROR_STOP.
BEGIN;
CREATE FUNCTION pg_temp.assert_ok(value boolean, label text) RETURNS void LANGUAGE plpgsql AS $test$
BEGIN
  IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF;
  RAISE NOTICE 'PASS: %', label;
END
$test$;
CREATE FUNCTION pg_temp.expect_error(statement text, expected text, label text) RETURNS void LANGUAGE plpgsql AS $test$
DECLARE actual text;
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS actual = RETURNED_SQLSTATE;
  END;
  PERFORM pg_temp.assert_ok(actual = expected, label);
END
$test$;

INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('e3000000-0000-0000-0000-000000000001','public-a@example.invalid',clock_timestamp()),
 ('e3000000-0000-0000-0000-000000000002','public-b@example.invalid',clock_timestamp());
CREATE TEMP TABLE public_catalog_fixture(slug_a text, slug_b text, published_a uuid, draft_a uuid, archived_a uuid, published_b uuid);
INSERT INTO public_catalog_fixture DEFAULT VALUES;
GRANT SELECT, UPDATE ON public_catalog_fixture TO authenticated;
GRANT SELECT ON public_catalog_fixture TO anon;

SELECT set_config('request.jwt.claims','{"sub":"e3000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT public.bootstrap_business('Public A','private-a@example.invalid','1234567890','Private A address','29',false,NULL);
UPDATE public_catalog_fixture SET slug_a=(SELECT public_catalog_slug FROM public.businesses),
  published_a=public.create_catalog_item('product','Published A','Public description','piece',9007199254740993,'no_gst',NULL,'private-code'),
  draft_a=public.create_catalog_item('product','Draft A',NULL,NULL,NULL,'no_gst',NULL,NULL),
  archived_a=public.create_catalog_item('product','Archived A',NULL,NULL,NULL,'no_gst',NULL,NULL);
SELECT pg_temp.assert_ok((SELECT NOT is_published FROM public.catalog_items WHERE id=(SELECT draft_a FROM public_catalog_fixture)), 'New items are private by default');
SELECT public.set_catalog_item_published(published_a,true), public.set_catalog_item_published(archived_a,true) FROM public_catalog_fixture;
RESET ROLE;
UPDATE public.catalog_items SET archived_at=clock_timestamp(), archived_by=created_by WHERE id=(SELECT archived_a FROM public_catalog_fixture);
UPDATE public.businesses SET display_name='Public A renamed' WHERE public_catalog_slug=(SELECT slug_a FROM public_catalog_fixture);
SELECT pg_temp.assert_ok(EXISTS(SELECT FROM public.businesses WHERE public_catalog_slug=(SELECT slug_a FROM public_catalog_fixture)), 'Business rename preserves public slug');
SELECT pg_temp.expect_error('UPDATE public.businesses SET public_catalog_slug=''changed'' WHERE public_catalog_slug=(SELECT slug_a FROM public_catalog_fixture)', '23514', 'Public slug is immutable');

SELECT set_config('request.jwt.claims','{"sub":"e3000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT public.bootstrap_business('Public B','private-b@example.invalid','1234567890','Private B address','27',false,NULL);
UPDATE public_catalog_fixture SET slug_b=(SELECT public_catalog_slug FROM public.businesses),
  published_b=public.create_catalog_item('service','Published B',NULL,NULL,NULL,'exempt',NULL,NULL);
SELECT public.set_catalog_item_published(published_b,true) FROM public_catalog_fixture;
SELECT pg_temp.expect_error('SELECT public.set_catalog_item_published((SELECT published_a FROM public_catalog_fixture),false)', 'P0002', 'Business B cannot change A publication');
SELECT pg_temp.expect_error('UPDATE public.catalog_items SET is_published=true', '42501', 'Raw publication writes remain denied');
SELECT pg_temp.assert_ok((SELECT count(*)=0 FROM public.get_catalog_item((SELECT published_a FROM public_catalog_fixture))), 'Private owner read still excludes another business even when published');
SELECT pg_temp.assert_ok((SELECT count(*)=0 FROM public.get_public_catalog_item((SELECT slug_b FROM public_catalog_fixture),(SELECT published_a FROM public_catalog_fixture))), 'Authenticated public detail scopes slug and item together');
SELECT pg_temp.assert_ok((SELECT count(*)=1 FROM public.businesses), 'Public reads do not broaden authenticated business RLS');
RESET ROLE;

SELECT set_config('request.jwt.claims','{"role":"anon"}',true);
SET LOCAL ROLE anon;
SELECT pg_temp.assert_ok((SELECT business_name='Public A renamed' AND item_count=1 FROM public.get_public_catalog((SELECT slug_a FROM public_catalog_fixture))), 'Guest can read business name and active published count');
SELECT pg_temp.assert_ok((SELECT count(*)=1 AND min(name)='Published A' AND min(price_minor)='9007199254740993' FROM public.list_public_catalog_items((SELECT slug_a FROM public_catalog_fixture),0,12)), 'Public list has only A published active items with exact paise');
SELECT pg_temp.assert_ok((SELECT count(*)=0 FROM public.list_public_catalog_items((SELECT slug_a FROM public_catalog_fixture),1,12)), 'Public pagination respects offset');
SELECT pg_temp.assert_ok((SELECT count(*)=0 FROM public.get_public_catalog_item((SELECT slug_a FROM public_catalog_fixture),(SELECT published_b FROM public_catalog_fixture))), 'Guest cannot combine A slug with B item ID');
SELECT pg_temp.assert_ok((SELECT count(*)=0 FROM public.get_public_catalog_item((SELECT slug_a FROM public_catalog_fixture),(SELECT draft_a FROM public_catalog_fixture))), 'Draft item cannot be opened by ID');
SELECT pg_temp.assert_ok((SELECT count(*)=0 FROM public.get_public_catalog_item((SELECT slug_a FROM public_catalog_fixture),(SELECT archived_a FROM public_catalog_fixture))), 'Archived item cannot be opened even if published');
SELECT pg_temp.assert_ok((SELECT count(*)=0 FROM public.get_public_catalog('missing-business')), 'Unknown slug returns no business');
SELECT pg_temp.assert_ok((SELECT NOT (to_jsonb(i) ?| ARRAY['business_id','created_by','archived_by','hsn_sac','created_at']) FROM public.get_public_catalog_item((SELECT slug_a FROM public_catalog_fixture),(SELECT published_a FROM public_catalog_fixture)) i), 'Public projection omits internal fields');
SELECT pg_temp.expect_error('SELECT * FROM public.businesses', '42501', 'Guest cannot read private business data');
SELECT pg_temp.expect_error('SELECT * FROM public.catalog_items', '42501', 'Guest cannot read raw catalog rows');
SELECT pg_temp.expect_error('SELECT * FROM public.business_memberships', '42501', 'Guest cannot read user membership data');
SELECT pg_temp.expect_error('SELECT public.set_catalog_item_published((SELECT published_a FROM public_catalog_fixture),true)', '42501', 'Guest cannot publish items');
SELECT pg_temp.expect_error('SELECT public.create_catalog_item(''product'',''Injected'',NULL,NULL,NULL,''no_gst'',NULL,NULL)', '42501', 'Guest cannot create catalog items');
SELECT pg_temp.expect_error('SELECT * FROM public.get_catalog_item((SELECT published_a FROM public_catalog_fixture))', '42501', 'Guest cannot call owner detail RPC');
SELECT pg_temp.expect_error('SET LOCAL ROLE webameen_catalog_reader', '42501', 'Guest cannot assume the public RPC role');
RESET ROLE;

GRANT webameen_catalog_reader TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;
SET LOCAL ROLE webameen_catalog_reader;
SELECT pg_temp.expect_error('SELECT bank_account_number FROM public.businesses', '42501', 'Public RPC role cannot read private business columns');
SELECT pg_temp.expect_error('SELECT created_by FROM public.catalog_items', '42501', 'Public RPC role cannot read user IDs');
SELECT pg_temp.expect_error('UPDATE public.catalog_items SET is_published=true', '42501', 'Public RPC role cannot write');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"e3000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT public.set_catalog_item_published(published_a,false) FROM public_catalog_fixture;
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.assert_ok((SELECT item_count=0 FROM public.get_public_catalog((SELECT slug_a FROM public_catalog_fixture))), 'Unpublishing immediately removes public items');
SELECT pg_temp.assert_ok((SELECT count(*)=0 FROM public.get_public_catalog_item((SELECT slug_a FROM public_catalog_fixture),(SELECT published_a FROM public_catalog_fixture))), 'Unpublished detail is unavailable');
RESET ROLE;
ROLLBACK;
