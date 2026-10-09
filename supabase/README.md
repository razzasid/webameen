# Database foundation

Source of truth: `docs/16-prototype-database-spec.md` (approved 6 October 2026).

## Migration

`20261005203045_prototype_database_foundation.sql` creates the 17 approved application tables. Supabase supplies `auth.users` and its authentication roles; the migration does not recreate or alter the provider schema.

The migration includes:

- Explicit quotation/invoice document and line snapshots, with the approved nullability and defaults.
- Integer-paise `bigint` amounts, three-decimal quantity checks, exact numeric GST percentages and the approved line/component rounding contract.
- Composite business/parent foreign keys, unique constraints, supporting indexes and deferred checks for circular references and complete records.
- Frozen-record guards, source snapshot equality, version/response consistency, transactional invoice-number cursor checks, payment/reversal/receipt integrity.
- A replaceable, operator-controlled `gst_rate_options` table. It starts empty and has no foreign keys from historical rates.
- Enabled and forced RLS on every application table, owner-scoped reads and restricted internal execution identities.

There is no PostgreSQL sequence object for invoice numbers. A period row is locked and advanced in the same transaction as its invoice. Every advance must have its invoice at commit; rollback undoes both. Used period settings are immutable.

Wrong-invoice correction uses a reversal followed by an independent ordinary payment on the correct invoice, with null replacement references. The optional replacement foreign keys permit only the same invoice.

## Foundation boundary

No application code, API routes, server actions, UI, seed data or public workflow RPCs are included. The migration's private invoker functions enforce database integrity; they are not application services or public operation endpoints.

`authenticated` can read its authorized rows and cannot directly insert, update, delete or truncate application tables. `webameen_executor` has the specified constrained table privileges under owner RLS, cannot log in or bypass RLS, and is not granted to runtime logins. No owner command exposes those write privileges yet. The two document broker roles have no table grants or callable entry points in this foundation; each broker's scoped policies and token-authorized functions must ship together with its workflow.

Future database command migrations must implement the operation contracts in section 8 before exposing writes: verified bootstrap, trusted actor/time assignments, request-key retries, draft edit sequences, rate selection, lock ordering, public token authorization and narrowly scoped wrappers. Application modules remain deferred.

Quantity input must pass `private.validate_quantity(numeric)` before assignment to `numeric(18,6)`. The table CHECK also rejects stored quantities needing a fourth decimal. PostgreSQL applies a column's type precision before row CHECKs, so the table CHECK alone cannot see digits already lost through coercion. Runtime direct writes remain denied.

GSTIN checks validate the documented basic shape only. There is no prefix-equality CHECK, online verification, legal rate list, reverse-charge engine or complete place-of-supply implementation. Prefix mismatch and reverse-charge warnings belong to the later application boundary.

## Local commands

From the project root, with Docker Desktop running:

```powershell
npx supabase start
npx supabase db reset --local --no-seed
npx supabase migration list --local
```

For this database-only milestone, `npx supabase db start` is sufficient. It starts PostgreSQL without the full API/Studio stack. Use `npx supabase start` when those services are needed later.

`db reset --local` recreates this project's local development database. It is appropriate for fresh-database verification; it removes local development data.

Run the SQL checks with the installed PostgreSQL client:

```powershell
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -v ON_ERROR_STOP=1 -f supabase/tests/foundation.sql
npx supabase db advisors --local --type security --fail-on error
```

The URL above is the project's configured local Supabase connection, not a production connection. Confirm current local endpoints with `npx supabase status`. No cloud project needs to be linked.

`foundation.sql` is a plain SQL verification script, not a pgTAP suite. It creates temporary helpers and fixtures inside a transaction and rolls everything back. It covers the exact field inventory, defaults, monetary types, quantity validation, keys/indexes, frozen snapshots, historical rates, numbering, payment correction and tenant isolation. It does not create application seed data.

Before each future workflow is enabled, add its command-level and concurrency tests. Never substitute service-role CRUD or weaken RLS to make a pending workflow usable.

## Verified locally on 6 October 2026

- Supabase CLI 2.119.0; Supabase PostgreSQL server 17.11 in Docker. PostgreSQL 18 `psql` was the client only.
- `supabase db start` applied the migration successfully. A subsequent `supabase db reset --local --no-seed` recreated the database and applied it successfully from scratch.
- `supabase migration list --local` confirms version `20261005203045` is applied.
- `foundation.sql` completed with **76 passing assertions**, exit code 0 and a final ROLLBACK. Fixtures and test-only role memberships were removed.
- Checked exact columns/types/nullability/defaults, all 55 foreign keys, the two deferred FK cycles, all 36 named unique keys/indexes and 11 supporting indexes.
- Verified integer-paise types, quantity validation before coercion, replaceable decimal rate configuration, retirement of a selectable rate without damaging approved/invoiced historical snapshots, all document/line snapshot values and immutable records.
- Verified transactional invoice cursor advances, numbering uniqueness scope, rollback enforcement, one full reversal per payment, independent wrong-invoice correction, same-invoice replacement, complete receipt pairing and cross-business foreign-key rejection.
- Verified forced RLS on all 17 tables, owner/executor tenant reads, denial of cross-tenant executor updates, disabled-owner isolation, authenticated raw-write denial, no runtime executor membership, and denied anonymous/service-role/broker general table access.
- `supabase db advisors --local --type security --fail-on error` returned **No issues found**, exit code 0.
- The local database remains running at `127.0.0.1:54322`, database/user/password `postgres`. No production resources were provisioned.

This verifies the foundation, not future authenticated command wrappers, customer token entry points or concurrent command execution. Those interfaces have not been implemented and require their own workflow tests before exposure. No specification changes or application-feature implementation were made.

## Business setup milestone

`20261007120000_business_bootstrap.sql` adds one fixed business-creation command. The public wrapper is callable only by `authenticated`; the transaction function runs as `webameen_executor`, which still has no login or RLS bypass. It checks the JWT subject, serializes creation per user, verifies that user's email, inserts the business and owner membership together, and returns the existing business on retry. The database keeps the one-business-per-user restriction.

Supabase owns the `auth` schema and its `auth.users` RLS. The migration gives the executor inherited `authenticated` schema access for `auth.uid()`; it does not let `authenticated` assume the executor. A private, no-argument, read-only helper owned by the local migration role checks only the current JWT subject's provider verification field. That helper can bypass provider-table RLS but cannot write or read application tenant tables. Business inserts remain under forced application RLS.

`supabase/tests/business_bootstrap.sql` uses disposable provider fixtures in a rolled-back transaction to check verification, owner linkage, retries, disabled memberships, and cross-business isolation.

## Public catalog milestone

`20261008155240_public_catalog.sql` assigns every existing and new business an immutable, unique `public_catalog_slug`. The public URL is `/c/<slug>` and product details are at `/c/<slug>/<item-id>`. Owners can open the public link from `/catalog`, then publish or unpublish individual items from the protected item detail page. Existing and new items default to private; only explicitly published, unarchived products and services appear. Saved edits to published items update the public listing.

Public RPCs expose business name, slug, item count, and an explicit item projection (name, description, kind, unit, exact paise price, and GST category/rate). They use a private function owned by `webameen_catalog_reader`, a role with no login, write access, or RLS bypass. Its column grants exclude private business fields, user IDs, and audit data; forced RLS excludes unpublished and archived items. Both list and detail reads join the requested slug to the item's business. Anonymous and authenticated visitors can call the same public reads without gaining base-table access. Owner publication uses the existing executor and active owner membership rules.

`supabase/tests/public_catalog.sql` verifies guest access, safe projections, publication changes, archive/draft exclusion, URL stability, exact prices, and tenant isolation. The foundation inventory includes the two new fields and the restricted reader role. All fixtures roll back.

## Quotation sharing milestone (Phase 8, partial)

`20261009183439_quotation_sharing_and_revisions.sql` adds owner share/freeze, link rotation/revocation, revision creation, owner history, and the isolated accountless quotation read/respond broker wrappers. The public quotation broker role is `NOLOGIN` and `NOBYPASSRLS`; only the server-side service credential can call the public wrappers. Owner commands continue to use the authenticated session. The customer page is `/q/<token>` and returns only the frozen, allow-listed snapshot.

`20261009200908_quotation_response_trigger_column_scopes.sql` keeps the existing response eligibility and deferred quotation-integrity checks while restricting their row reads to the columns already granted to the quotation broker. `20261009201414_quotation_response_integrity_context.sql` makes the response RPC run those deferred checks before its scoped broker context ends. Neither migration broadens broker grants, alters RLS, or changes the table design. `supabase/tests/quotation_sharing.sql` covers the denied pre-link timestamp, a successful customer approval, idempotent retries, unchanged trigger/RPC roles, and the deferred state/response integrity check alongside sharing, revision, rotation, and revocation behavior.

The public broker key is configured only as `SUPABASE_QUOTE_BROKER_KEY` in the server environment. It is never used for normal owner CRUD. A per-process public-request limiter is sufficient only for the current single-instance prototype; hosted multi-instance deployment needs a shared limiter. PDF and authorized logo/signature delivery remain later work.
