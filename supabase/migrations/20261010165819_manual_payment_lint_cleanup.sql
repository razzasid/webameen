BEGIN;

-- Replace the existence-only row reads with PERFORMs. The executor cannot
-- update ledger records, and the returned payment tuples were never consumed.
GRANT CREATE ON SCHEMA private TO webameen_executor;
GRANT webameen_executor TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;
SET ROLE webameen_executor;

DO $fix$
DECLARE
  v_original text;
  v_definition text;
  v_signature regprocedure;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'private.record_invoice_payment(uuid,uuid,bigint,timestamp without time zone,text,text,uuid)'::regprocedure,
    'private.reverse_invoice_payment(uuid,text)'::regprocedure
  ] LOOP
    v_original := pg_catalog.pg_get_functiondef(v_signature);
    v_definition := v_original;
    IF v_signature = 'private.record_invoice_payment(uuid,uuid,bigint,timestamp without time zone,text,text,uuid)'::regprocedure THEN
      v_definition := pg_catalog.regexp_replace(
        v_definition,
        $pattern$v_predecessor public[.]payments%ROWTYPE;[[:space:]]*$pattern$,
        '',
        'g'
      );
      v_definition := pg_catalog.regexp_replace(
        v_definition,
        $pattern$SELECT p[.][*] INTO v_predecessor[[:space:]]+FROM public[.]payments AS p[[:space:]]+WHERE p[.]business_id = v_business_id AND p[.]invoice_id = p_invoice_id[[:space:]]+AND p[.]id = p_replaces_payment_id[[:space:]]*;$pattern$,
        $new$PERFORM 1 FROM public.payments AS p WHERE p.business_id = v_business_id AND p.invoice_id = p_invoice_id AND p.id = p_replaces_payment_id;$new$,
        'g'
      );
      IF pg_catalog.strpos(v_definition, 'v_predecessor public.payments%ROWTYPE;') > 0
        OR pg_catalog.strpos(v_definition, 'SELECT p.* INTO v_predecessor') > 0 THEN
        RAISE EXCEPTION 'Could not remove unused predecessor row variable';
      END IF;
    ELSE
      v_definition := pg_catalog.regexp_replace(
        v_definition,
        $pattern$v_payment public[.]payments%ROWTYPE;[[:space:]]*$pattern$,
        '',
        'g'
      );
      v_definition := pg_catalog.regexp_replace(
        v_definition,
        $pattern$SELECT p[.][*] INTO v_payment[[:space:]]+FROM public[.]payments AS p[[:space:]]+WHERE p[.]business_id = v_business_id AND p[.]invoice_id = v_invoice_id[[:space:]]+AND p[.]id = p_payment_id[[:space:]]*;$pattern$,
        $new$PERFORM 1 FROM public.payments AS p WHERE p.business_id = v_business_id AND p.invoice_id = v_invoice_id AND p.id = p_payment_id;$new$,
        'g'
      );
      IF pg_catalog.strpos(v_definition, 'v_payment public.payments%ROWTYPE;') > 0
        OR pg_catalog.strpos(v_definition, 'INTO v_payment') > 0 THEN
        RAISE EXCEPTION 'Could not remove unused payment row variable';
      END IF;
    END IF;
    IF v_definition IS DISTINCT FROM v_original THEN
      EXECUTE v_definition;
    END IF;
  END LOOP;
END
$fix$;

RESET ROLE;
REVOKE CREATE ON SCHEMA private FROM webameen_executor;
REVOKE webameen_executor FROM CURRENT_USER;

COMMIT;
