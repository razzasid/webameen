BEGIN;

-- The financial advisory locks serialize all payment commands for an invoice.
-- Older draft functions also requested row locks, which the immutable ledger
-- executor intentionally cannot take because it has no UPDATE privileges.
GRANT CREATE ON SCHEMA private TO webameen_executor;
GRANT webameen_executor TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;
SET ROLE webameen_executor;

DO $fix$
DECLARE
  v_definition text;
  v_signature regprocedure;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'private.record_invoice_payment(uuid,uuid,bigint,timestamp without time zone,text,text,uuid)'::regprocedure,
    'private.reverse_invoice_payment(uuid,text)'::regprocedure
  ] LOOP
    v_definition := pg_catalog.pg_get_functiondef(v_signature);
    IF pg_catalog.strpos(v_definition, 'FOR UPDATE;') > 0 THEN
      EXECUTE pg_catalog.replace(v_definition, 'FOR UPDATE;', ';');
    END IF;
  END LOOP;
END
$fix$;

RESET ROLE;
REVOKE CREATE ON SCHEMA private FROM webameen_executor;
REVOKE webameen_executor FROM CURRENT_USER;

COMMIT;
