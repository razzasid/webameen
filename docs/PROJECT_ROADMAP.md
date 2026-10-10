# Webameen — Master Development Roadmap

Audit baseline: **8 October 2026**, commit **d89fb74** (`feat: Implement public catalog feature with item listing and detail views`). Phase 6 implementation updated **9 October 2026** in **D:\webameen**. The baseline audit was documentation only; the Phase 6 update below records application and database changes.

This is the source of truth for implementation order, scope, progress and acceptance. Phase numbers in this file are stable: **“Implement Phase 6” means Business Document Setup below**, not Phase 6 in an older document. Do not renumber phases after work begins; add amendments and update task status.

## 1. Product Overview

Webameen helps small businesses manage **customer records and reusable products/services → quotation → customer approval or change request → invoice → manually recorded payments → receipt → customer history and dashboard**. Its purpose is to keep the offered terms, customer response, amount due and payment history together and reliable. The validation target in the original brief is approximately 10–20 businesses; the initial business segment is still unspecified.

The owner is an authenticated business operator. The implemented and approved initial model is one owner per business and one workspace per user. There is no staff/admin role, invitation system or workspace switcher. A customer is a business contact, separate from Supabase's user identity. Customers must be able to browse a public catalog and open authorized document links **without registration or login**.

The public catalog is an implemented extension to the original document workflow. It exposes selected products/services through `/c/<slug>`. It is not currently a checkout or ordering system. No repository requirement authorizes cart, orders, fulfillment, stock or payment collection. Example ordering phases in the audit request illustrate roadmap formatting; they do not establish a product requirement.

### Sources and precedence

1. Explicit later user requirements govern their scope, including public catalogs and accountless access.
2. This roadmap governs future phase execution and records conflicts/decisions.
3. Existing migrations, application code and tests establish what actually exists. `supabase/migrations/20261005203045_prototype_database_foundation.sql` is the implemented foundation; subsequent migrations extend it.
4. `16-prototype-database-spec.md`, updated for decisions on 5–6 October, defines the approved document/financial contracts. Its older “design for review” banner describes its creation milestone; the foundation was subsequently implemented. Useful references: §§3–5 field/arithmetic rules, §7 states, §8 transactions, §9 authorization, §§4.19–4.20 numbering/rate configuration.
5. Documents `01`–`12`, `14` and `15` provide product history. Their earlier alternatives do not reopen later resolved decisions. The old `06-roadmap.md` phase numbers are superseded here.

**Documentation portability:** all existing `docs/` files were ignored and untracked at audit start because `.gitignore` contains `docs`. This roadmap must be included explicitly in version control. Older documents may be absent in a fresh clone; the governing rules needed for these phases are summarized here, and migrations provide the exact existing fields/constraints. Preserve the approved detailed specification in a future documentation maintenance task rather than assuming it is already committed.

### Fixed product rules

| Topic              | Governing rule                                                                                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Region/currency    | India, INR, two monetary decimals; no currency selector/conversion                                                                                                           |
| Money              | Integer paise (`bigint`), transported as decimal strings; exact arithmetic                                                                                                   |
| Quantity           | Positive, at most three decimals, validated before database typmod coercion                                                                                                  |
| Pricing            | Prices exclusive of GST; no discounts, extra charges, cess or inclusive mode                                                                                                 |
| GST                | `taxable`, `exempt`, `no_gst`; operator-configured rates; same-state CGST+SGST suggestion, different-state IGST; preserve explicit override separately                       |
| Rounding           | Round each extended line base and each applicable tax component half-up to paise, then sum; rule `in-gst-exclusive-line-paise-half-up-v1`                                    |
| Master data        | Customer/catalog/profile edits never rewrite frozen documents                                                                                                                |
| Quote              | Editable current draft; sharing freezes content; revisions preserve prior snapshots/responses                                                                                |
| Customer response  | Approve or request changes; one terminal response per version; optional note/name; typed name is unverified                                                                  |
| Expiry             | Inclusive `valid_until` in captured document timezone; deadline is next local midnight; no new response at/after deadline; timely existing approval remains convertible      |
| Revision links     | Creating revision immediately prevents old approval conversion/new responses; old link can read frozen content while revision is draft; sharing revision revokes older links |
| Conversion         | One invoice per quotation, from current approved version; retry returns same invoice; no independent invoice edits or GST override                                           |
| Payments           | Only against issued invoice; multiple payments per invoice; one invoice per payment; reject overpayment; no pre-invoice deposits/refunds/split allocation                    |
| Correction/receipt | Immutable payment; one full reversal with reason; one receipt ever per payment, created atomically; replacement has its own receipt; reprint retains original reference      |
| Delivery           | Manually shared, independently secured quotation/invoice URLs; customer pages and PDF downloads are required; automated messaging is deferred                                |
| History            | Derive from typed versions/responses/invoices/payments/reversals/receipts; no generic event or ledger subsystem                                                              |

These are agreed prototype behavior, not a claim of complete statutory GST compliance. Actual classifications, profile particulars and numbering choices are setup inputs, not unanswered schema decisions.

## 2. Current Architecture

### Frontend

- **Next.js 16.3.8 App Router**, React 19.3.0, strict TypeScript 5.9.3. One deployable modular monolith; no separate backend or ORM.
- Server Components load data through `src/server/modules/*/queries.ts`. Promise-based route/search parameters follow the installed Next.js conventions. React `cache` deduplicates user/business/catalog lookups within rendering; there is no shared client store or React Query layer.
- `(auth)` contains login/signup; `(workspace)` contains the protected shell; `(public)/c/[slug]` contains catalog browsing. Route group names are not URL segments.
- Tailwind CSS 4.3.3, semantic HTML and project CSS variables; no UI component library. Sidebar becomes horizontal navigation on small screens. Public catalog has a separate responsive shell and card/detail layouts.
- Client forms use `useActionState`, local state and Zod-backed server validation. Pending buttons and field errors are implemented. Customer form preserves values against React action resets; catalog controls wait for hydration before accepting edits. Customer search debounces URL updates by 250 ms; catalog search uses a GET form.
- Loading/empty/error/not-found handling exists in feature routes; uniform accessibility and all failure paths have not been exhaustively tested.

### Backend and authentication

- Server Actions handle first-party mutations in identity/business/customers/catalog modules. Queries and application rules remain behind server modules; client components do not perform business CRUD directly.
- Narrow HTTP handlers: `/auth/callback` exchanges confirmation codes; `/api/health` reports process health and whether configuration exists. Health does **not** verify database connectivity.
- Supabase JS 2.117.2 and SSR 0.12.7 factories in `src/lib/supabase`. Owner requests use the publishable key plus user session; no service credential is configured in application environment keys inspected.
- `src/proxy.ts` refreshes sessions through verified claims; it is not the route authorization boundary. `identity/session.ts` verifies the user with `getUser`; `business/context.ts` resolves membership and business. Workspace layout redirects guests to login, new owners to setup, and displays a disabled-access screen.
- Cookies are HTTP-only, SameSite=Lax, secure in production. Email/password signup/login/logout and callback are implemented. Password reset and resend-confirmation UI are absent. Local email confirmation is disabled; bootstrap still checks the provider verification field.
- RPC commands derive business/actor from `auth.uid()` and active owner membership, never from a client-provided business ID. Application validation improves feedback; PostgreSQL commands, grants, RLS and guards enforce persistence.

### Database and access boundaries

Local Supabase runs PostgreSQL 17. Six committed migrations are applied locally. All **17 application tables have enabled and forced RLS**:

| Group                    | Existing tables and relationships                                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace                | `businesses`, `business_memberships` → provider `auth.users`; one owner/business and one workspace/user                                |
| Master data              | `customers`, `catalog_items` → business; archive columns exist                                                                         |
| Quotations               | `quotations` → customer/current version; `quotation_versions` → quote/predecessor; `quotation_items` → version/optional catalog source |
| Public quote/evidence    | `quotation_public_links` → exact version; `quotation_responses` → exact version and link                                               |
| Invoices                 | `invoices` → source quote/version/approval; `invoice_items` → invoice and source quotation items                                       |
| Money received           | `payments` → invoice/optional predecessor; `payment_reversals` → original payment; `receipts` → payment/optional predecessor receipt   |
| Invoice access/numbering | `invoice_public_links` → invoice; `invoice_number_sequences` → business and configured period                                          |
| Global configuration     | `gst_rate_options`: exact numeric percentages and `selectable`; sole non-tenant table                                                  |

Composite foreign keys include business and applicable parent IDs. Deferred constraints handle owner/bootstrap and quotation/current-version cycles. Guards enforce frozen data, exact source copying, line arithmetic/sums, response consistency, invoice-number allocation, overpayment and complete receipt pairing. No PostgreSQL sequence allocates invoice numbers: a locked period row advances with its invoice transaction. Future application workflows still need command authorization, trusted inputs, retries and concurrency tests; these tables/guards alone do not implement those workflows.

| Database identity          | Actual access                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `authenticated`            | Owner-scoped table reads plus exact exposed command/read RPC execution; no raw application writes                                     |
| `webameen_executor`        | NOLOGIN/NOBYPASSRLS, non-table-owner execution role; constrained writes subject to caller-owner RLS; never assumable by runtime roles |
| `anon`                     | No base application-table reads/writes; exact public catalog RPC execution                                                            |
| `webameen_catalog_reader`  | NOLOGIN/NOBYPASSRLS read role, safe business/item column grants; RLS permits only published, unarchived items                         |
| Quote/invoice broker roles | Foundation role identities exist, but no callable token broker operations or operational table privileges yet                         |

Public wrappers are SECURITY INVOKER; private owner commands/public catalog helpers are SECURITY DEFINER owned by the restricted execution role, with empty search paths and qualified objects. The bootstrap verification helper is a narrow provider-account exception. The `private` schema is not exposed through PostgREST. Do not simplify this into ordinary service-role CRUD.

**Public catalog:** immutable `businesses.public_catalog_slug`, default `catalog-<UUID>`; `catalog_items.is_published` defaults false. Safe list/detail projection: item ID, kind, name, description, unit, exact price and GST category/rate; business name/slug/count. Public reads never return contacts, banking, user IDs, audit fields or HSN/SAC. Slug and item business must match. Owning a business is irrelevant to browsing another business's legitimately published catalog; it does not grant private management access.

### Storage and files

Local Storage is enabled with a 50 MiB service limit, but **zero buckets exist**. No application upload/download, storage RLS, product images, logo/signature handling or PDF renderer exists. Schema asset-key/hash columns are preparation only. `output/pdf/webameen-tech-stack.pdf` is a project artifact, not an implemented customer PDF workflow.

### Development and testing

- Node 24/npm 11; exact dependency versions and lockfile. Scripts: `dev`, `build`, `start`, `lint`, `format`, `typecheck`, `test`, `test:watch`, `test:e2e`, `test:all`, `db:start`, `db:stop`, `db:status`.
- Next build output `.next`; Playwright dev output `.next-playwright`, port 3301, Chromium, one worker, 90-second tests, retained failure traces. Normal local app port 3000. Both generated route-type directories are included by TypeScript.
- Vitest: five Node-environment files for environment/credentials/business/customer/catalog validation and exact catalog money conversion. No separate mocked server/integration runner or financial calculation module exists.
- Playwright: five spec files, 14 tests using real local Auth/database and browser-created workspaces. New accounts/rows persist; tests close contexts rather than cleaning database fixtures. Public catalog tests share mutable beforeAll fixtures and final unpublish scenario; suite is intentionally serial.
- Five plain SQL suites use explicit errors/assertions and rolled-back disposable fixtures; they are not pgTAP. They cover schema, authorization and integrity. Existing tests do not provide multi-session concurrent command coverage.
- `.env.example`: public Supabase URL/key and `APP_URL`; `.env.local` ignored. Values were not copied into this document. Local configuration uses fixed project ID `webameen`, API 54321/database 54322. No source/config dependency on the old Desktop project path was found in inspected application/test configuration.
- No CI workflow, production deployment configuration, custom operational scripts or seed file exists. `config.toml` nevertheless lists `./seed.sql`; fresh verification uses no seed. Rates 5/18/40 are current local operator data, absent from migration seeds; fresh database replay does not install them automatically.

## 3. User Journeys

### Owner — available now

Signup/login → business setup → protected dashboard → edit business document settings and review readiness → create/search/view/edit customers → create/search/view/edit product/service defaults → open stable public catalog → publish/unpublish items and share URL manually. Saved edits to published items update their public representation. Dashboard currently shows business/account identity and GSTIN-state warning, without financial summaries.

### Customer — available now

Open `/c/<slug>` as guest → browse published, unarchived items → open `/c/<slug>/<id>` → view description, price/unit and GST label → return to list. Empty catalogs and invalid/unavailable links have friendly states. There is no order submission or customer account.

### Owner/customer — remaining MVP journey

Owner completes document settings → selects customer and prepares exact draft → shares frozen version → customer approves or requests changes through secure link → owner revises/re-shares if required → converts latest approval to numbered invoice → records initial/partial/final money received and prints receipt → shares independent customer invoice link → customer views/downloads frozen documents → owner reviews balances and customer history.

Catalog browsing need not precede a quotation: an owner may use catalog defaults or one-off quotation lines. Public catalog publication is unrelated to eligibility for privately authored quote lines. No future ordering dependency is introduced.

## 4. Current Implementation Status

Feature status vocabulary: ✅ COMPLETE; 🟡 PARTIAL; 🔴 NOT IMPLEMENTED; ⚠️ IMPLEMENTED BUT NEEDS HARDENING; ❓ UNCLEAR / NEEDS DECISION. “Complete” describes the stated slice; it does not certify production readiness. Phase/task tracking uses ✅ COMPLETE, 🟡 IN PROGRESS, 🔴 NOT STARTED, ⚠️ NEEDS HARDENING, ❓ NEEDS DECISION. Checked boxes have implementation evidence; open boxes identify remaining work.

| Feature                                         | Status                                       | Evidence / precise boundary                                                                                                                                                                                                                |
| ----------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Database foundation                             | ✅ COMPLETE                                  | Foundation migration; `supabase/tests/foundation.sql` checks schema, monetary/snapshot/numbering/payment integrity and RLS. Feature commands are additive migrations.                                                                      |
| Signup/login/logout/session                     | ✅ COMPLETE                                  | `(auth)`, `/auth/callback`, `components/auth/auth-form.tsx`, identity actions/session/credentials, Supabase factories/proxy; credential unit tests and navigation E2E. Recovery/hosted verification coverage deferred to Phase 13.         |
| Business onboarding/owner isolation             | ✅ COMPLETE                                  | `/onboarding/business`, business setup form/module; bootstrap migration/RPC; `business_bootstrap.sql`, business unit tests and onboarding E2E. Profile editing is tracked separately below.                                                |
| Protected owner shell                           | ✅ COMPLETE                                  | `(workspace)/layout.tsx`, workspace shell/sidebar, business context; navigation/public management E2E. Owner role only.                                                                                                                    |
| Customer C/R/U/search/pagination                | ⚠️ IMPLEMENTED BUT NEEDS HARDENING           | `/customers`, `/new`, `/[id]`, `/[id]/edit`; customer form/search/actions/queries; customer command migration/RPCs, unit/SQL/E2E tests. Audit edit navigation failed although source exists. Does not include history or archive controls. |
| Catalog C/R/U/search/pagination                 | ⚠️ IMPLEMENTED BUT NEEDS HARDENING           | `/catalog`, `/new`, `/[id]`, `/[id]/edit`; catalog form/actions/queries/validation; command and exact-read migrations, unit/SQL/E2E tests. Audit found an edit-route browser failure; see verification log.                                |
| GST default selection/exact prices              | ✅ COMPLETE                                  | Catalog validation/RPCs and exact reads; rates operationally configured; unit/SQL checks cover categories, configured/retired rates and exact paise. Full document calculations not implemented.                                           |
| Public catalog/public detail/publication        | ⚠️ IMPLEMENTED BUT NEEDS HARDENING           | `/c/[slug]`, `/c/[slug]/[id]`, public shell/queries, publication form/action, public migration; public SQL suite and six browser scenarios. SQL and mobile browsing pass; five browser scenarios fail with global not-found responses.     |
| Archived item exclusion                         | ✅ COMPLETE                                  | Catalog list and public reader filter `archived_at IS NULL`; public SQL test inserts archived fixture. This is read behavior, not an archive workflow.                                                                                     |
| Archive/unarchive customers/items               | 🟡 PARTIAL                                   | Columns/grants/guards exist; no application command or owner controls. Customer list does not exclude archived rows. Optional follow-up, not claimed as completed CRUD deletion.                                                           |
| Business settings/document readiness            | ✅ COMPLETE for Phase 6                      | Owner-only `update_business_settings` command, `/settings` form, server-derived readiness, rate operator runbook; Phase 6 SQL/unit/browser checks. Future quote draft selection remains Phase 7.                                           |
| Quotations/GST draft editor                     | ✅ COMPLETE for Phase 7                       | Owner draft create/edit, authoritative saved calculations, concurrency check and tenant-scoped reads are implemented. Sharing and frozen-version actions are tracked in Phase 8.                                                         |
| Secure quotation sharing/responses/revisions    | ✅ COMPLETE for Phase 8                       | Atomic owner share/revision/rotation/revoke commands, isolated quote broker, frozen public reads, customer approval/change requests and response history are covered by rollback-only SQL and browser checks. Per-process rate limiting remains a single-instance prototype limit. |
| Invoice conversion/number configuration         | 🟡 PARTIAL at database level; 🔴 application | Schema/guards exist; `/invoices` placeholder; no conversion/numbering commands.                                                                                                                                                            |
| Payments/reversals/receipts                     | 🟡 PARTIAL at database level; 🔴 application | Schema/guards exist; `/payments` placeholder; no commands or receipt routes.                                                                                                                                                               |
| Customer invoice links/document PDF             | 🟡 PARTIAL schema; 🔴 application/storage    | Invoice link table and asset references exist; no active broker/routes/PDF or buckets.                                                                                                                                                     |
| Dashboard metrics/customer transaction history  | 🟡 PARTIAL                                   | Identity dashboard/customer detail exist; no workflow read models or history UI.                                                                                                                                                           |
| Product images/categories/cart/orders/inventory | 🔴 NOT IMPLEMENTED                           | No supporting routes/modules/schema; not required for agreed document MVP.                                                                                                                                                                 |
| Customer accounts/team admin                    | 🔴 NOT IMPLEMENTED                           | Deliberately excluded from initial workflow.                                                                                                                                                                                               |
| Production operations                           | 🔴 NOT IMPLEMENTED / ❓ deployment decisions | Local stack only; no production resource/configuration, CI or recovery exercises.                                                                                                                                                          |

### Verification log — current audit

Previous reports are historical evidence, not the current result. Checks below were rerun against this checkout on 8 October:

| Check                                   | Current result                                                                                                                                                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Vitest                                  | PASS: 20 tests / five files                                                                                                                                                                                              |
| Biome                                   | PASS: 83 files, no fixes                                                                                                                                                                                                 |
| TypeScript                              | PASS; production build also completed its TypeScript step                                                                                                                                                                |
| Five SQL suites, actual local Supabase  | PASS: bootstrap 14, catalog 17, customers 11, foundation 76, public catalog 28 assertions; **146 total**; all ROLLBACK                                                                                                   |
| Migration history                       | All six versions applied locally, including `20261008155240`                                                                                                                                                             |
| Fresh migration replay                  | PASS: all six migrations and all five SQL suites in disposable `webameen_roadmap_audit_20261008`; database removed afterward                                                                                             |
| Fresh replay boundary                   | Reuses existing cluster roles and a minimal provider `auth.users`/`auth.uid` shim; verifies application DDL/guards, not full Auth/Storage provisioning. Actual provider integration is exercised by local browser tests. |
| Browser regression / `npm run test:all` | **FAIL: 7 passed, 7 failed (12.3 minutes), exit 1** after 20 passing unit tests. All seven failed snapshots show the global not-found page. Current run does not reproduce previous 14/14 passing report.                |
| Production build                        | PASS, exit 0. Route inventory includes both customer/catalog edit pages and `/c/[slug]/[id]`; build success does not establish browser success.                                                                          |

**Browser evidence:** passed onboarding; private catalog/customer cross-business isolation; three navigation/auth tests; public mobile list. Failed owner catalog edit (`catalog.spec.ts:60`), customer edit (`customers.spec.ts`, final edit step), public product detail, guest protection of catalog edit, public slug/item mismatch unavailable page, invalid-link unavailable page, and owner edit/public unpublish workflow. The guest edit-path check returned global 404 rather than login; this is not evidence of unauthorized private data access. The failure traces and snapshots are under `test-results/*/trace.zip` and `error-context.md` (ignored local artifacts). In particular: `test-results/catalog-catalog-is-protect-fd90d-earch-view-and-edit-an-item-chromium/trace.zip`.

The source files for the affected edit/detail/unavailable routes exist, and the production build lists them. The inspected running dev app-path manifest omitted the edit routes; this suggests route discovery/build-state investigation, but **does not establish the root cause**. Stream-closed errors also appeared. No arbitrary timeout increase, assertion weakening, cache deletion or source fix was attempted during this documentation-only audit. Preserve failure evidence and diagnose before certifying browser readiness.

### T1 investigation — 9 October 2026 (stopped; cause unresolved)

Application source, browser assertions, timeouts and test/server configuration were unchanged. No cache was deleted. Results, in execution order:

| Check                                                                                                             | Result                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Targeted catalog, customer and public-catalog specs                                                               | PASS: 10/10 browser tests, 4.6 minutes                                                                                                      |
| Full `npm run test:all`, run 1                                                                                    | PASS: 20/20 unit tests and 14/14 browser tests, browser duration 5.1 minutes; exit 0                                                        |
| Full `npm run test:all`, run 2, with a deliberately concurrent normal `npm run build` to investigate interference | FAIL: 20/20 unit tests; 13/14 browser tests, 5.2 minutes; exit 1. Catalog creation timed out at `catalog.spec.ts:45`, before its edit step. |
| Concurrent normal production build                                                                                | PASS; inventory includes both edit routes and `/c/[slug]/[id]`                                                                              |

Ordered investigation evidence:

1. **Output sharing/interference:** normal build selects `.next`; Playwright dev selects `.next-playwright`. No competing application build/dev process ran during the targeted reproduction or full run 1. The controlled concurrent build rewrote shared `next-env.d.ts`, but did not reproduce the original global 404s. The submission timeout does not establish whether shared-file writes, compilation load or another condition caused it.
2. **Test output/port:** Playwright actually started `next dev` on `127.0.0.1:3301` with `.next-playwright/dev` output. Normal production output remained unchanged throughout the targeted run and full run 1.
3. **Dev manifests:** after the targeted run visited them, the app-path manifest contained both edit routes and the public detail route. Entries absent before first navigation are consistent with on-demand compilation and alone cannot prove failed route discovery.
4. **Windows paths/locks:** all three source files exist, have ordinary Archive attributes and could be opened for reading with exclusive file sharing. No path/access/lock error was observed; historical transient locks remain unproven.
5. **Stream errors:** `The destination stream closed early` occurred during passing customer edit workflows as well as the controlled run; it does not identify the original routing failure's cause.
6. **Nested dynamic discovery:** unchanged nested edit/detail routes passed in the targeted run and full run 1. Persistent missing source routes are ruled out; an intermittent dev-discovery defect is neither reproduced nor established.

The inspected controlled-run trace contains an unfinished second `POST /catalog/new` (status/time recorded as `-1`), with the page still showing “Saving item…”. It contains no reproduction of the original edit-route 404. Its trace, error context and manifest snapshots are preserved in ignored `playwright-report/t1-investigation-20261009/`. The original 8 October trace was replaced when Playwright reused `test-results`; the trace at its former catalog path now belongs to this different 9 October failure.

**Stop decision:** T1 remains open. Three consecutive green full runs have not been achieved. Following the requested stop condition, no speculative server change was made and Tasks 2–5 were not started. No phase/task is marked complete by these results; no database reset, schema change, commit or deployment occurred. Generated `next-env.d.ts` changes were restored after the checks.

## 5. MVP Scope

The initial useful release completes the original document/payment journey and retains the public catalog already delivered. Older documents distinguish prototype/MVP differently; this roadmap calls the first useful pilot release **MVP**, without importing later team/integration features.

**MVP:** implemented owner identity/onboarding/customer/catalog/public browsing; document text settings and readiness; exact quotation drafting; immutable version sharing and accountless response/revision; idempotent numbered invoice conversion; manual payments/reversals/receipts; accountless quote/invoice pages with PDFs; basic owner dashboard/customer history; recovery and launch safeguards.

**Post-MVP:** optional master-data archival UI, catalog images/categories/search enrichment, bulk import/export, richer filtering/templates/CRM, validated notifications and team features. These are independent of the essential transaction chain.

**Future / Optional:** cart/orders/checkout/fulfillment, inventory, customer accounts, online payment gateways, pre-invoice deposits, refunds/allocations/credit notes, accounting integrations, full GST/e-invoice/e-waybill engines, multi-currency/countries, SaaS subscriptions, microservices/background-job frameworks. Implement only after explicit scope authorization and governing rules. No placeholder tables or speculative abstractions now.

## 6. Phase Roadmap

Dependency overview: `1 → 2 → {3,4}; {2,4} → 5; 2 → 6; {3,4,6} → 7 → 8 → 9 → 10; {8,9} → 11; {8,9,10} → 12; {1…12} → 13 release gate`. Phase 5 is required for the already promised public catalog, but does not block private quotation construction. Phase 13 preparatory work can run earlier. Optional branding in Phase 11 does not block financial phases.

### Phase 1 — Database and Project Foundation

**Status:** ✅ COMPLETE. **Goal:** reliable local modular monolith and relational tenant/document foundation.

**Depends on:** none. **Required before:** all subsequent phases. **Blocks:** any persistence change without reproducible schema/security. **Can be implemented independently:** completed; future maintenance can be isolated.

**Tasks / evidence**

- [x] ✅ COMPLETE — Establish pinned Next/React/TypeScript/Tailwind/Zod/Supabase tools and shared layouts (`package.json`, lockfile, app/config).
- [x] ✅ COMPLETE — Create 17 tables, composite tenant keys, exact values, immutable/snapshot/payment/numbering guards and forced RLS (foundation migration).
- [x] ✅ COMPLETE — Define constrained executor/inactive document broker roles and deny runtime raw writes.
- [x] ✅ COMPLETE — Provide Vitest/Playwright/Biome/typecheck setup and rollback-only SQL foundation assertions.
- [x] ✅ COMPLETE — Verify current six-migration application replay without resetting the working local database (audit log).

**Acceptance:** application schema replays; every tenant relation rejects cross-business parents; all application tables force RLS; authenticated raw writes fail; monetary/snapshot/numbering guards pass existing SQL checks. This phase does not claim financial commands exist.

### Phase 2 — Identity, Business Onboarding and Protected Workspace

**Status:** ✅ COMPLETE for delivered slice. **Goal:** an owner can authenticate and operate one authorized workspace.

**Depends on:** 1. **Required before:** 3–12 owner operations. **Blocks:** tenant operations without active membership. **Can be implemented independently:** auth recovery/hosted verification hardening can proceed before financial work under Phase 13.

**Tasks / evidence**

- [x] ✅ COMPLETE — Implement email/password signup/login, logout, safe errors and callback (`identity`, auth form/routes).
- [x] ✅ COMPLETE — Verify server user, refresh cookies, protect workspace and direct Server Action calls (session/proxy/layout).
- [x] ✅ COMPLETE — Validate India/state/GST setup and warning-only GSTIN prefix mismatch (business form/module/unit tests).
- [x] ✅ COMPLETE — Atomically bootstrap verified provider user/business/owner membership; retry returns same workspace; disabled membership cannot bootstrap another (bootstrap migration/SQL tests).
- [x] ✅ COMPLETE — Cover guest protection, setup, session reload/login/logout and tenant access in SQL/browser suites.

**Acceptance:** guests redirected; no-business owner sent to setup; active owner sees own business; disabled owner blocked; repeated setup creates no duplicate; clients cannot assign business/owner/role. Recovery/production provider setup remain explicit Phase 13 tasks.

### Phase 3 — Customer Directory

**Status:** ⚠️ NEEDS HARDENING; C/R/U/search implementation exists. **Goal:** maintain private customer contacts for future documents.

**Depends on:** 1, 2. **Required before:** 7 and 12 customer workflow. **Blocks:** selecting an authorized document recipient. **Can be implemented independently:** complete; optional archival/import work is separate.

**Tasks / evidence**

- [x] ✅ COMPLETE — List/search/paginate and open/create/edit customer routes and form (`customers` pages/components/module).
- [x] ✅ COMPLETE — Normalize optional contacts, require explicit state/GST applicability, validate GSTIN and preserve invalid-submit form values (validation/unit/E2E).
- [x] ✅ COMPLETE — Derive tenant/actor inside `create_customer`/`update_customer`; deny foreign reads/updates and raw writes (customer migration/SQL).
- [x] ✅ COMPLETE — Cover create/search/detail/edit and changed-ID privacy in browser tests.
- [ ] ⚠️ NEEDS HARDENING — Diagnose the audit customer edit-route global 404 alongside Phase 4 routing evidence; rerun the unchanged customer E2E before marking current browser verification complete.

**Acceptance:** owner creates/finds/edits own customer; invalid inputs remain recoverable; foreign IDs disclose no customer; customer data stays private; directory edits do not mutate historical snapshots. Full transaction history belongs to 12; archive controls are post-MVP.

### Phase 4 — Owner Product/Service Catalog

**Status:** ⚠️ NEEDS HARDENING; core implementation exists. **Goal:** reusable owner-scoped defaults.

**Depends on:** 1, 2. **Required before:** 5, catalog-assisted 7. **Blocks:** declaring catalog regression fully green until the audit failure is resolved in an authorized fix task. **Can be implemented independently:** catalog hardening is independent of future document code.

**Tasks / evidence**

- [x] ✅ COMPLETE — Implement list/add/detail/edit/search/pagination, product/service distinction and custom unit suggestions (`catalog` routes/form/module).
- [x] ✅ COMPLETE — Store optional description/unit/HSN/default price and explicit GST category/rate; support empty configuration and retained unchanged retired catalog rate.
- [x] ✅ COMPLETE — Transport paise/numeric rates as exact strings through read RPCs; unit/SQL tests cover exact conversion and tenant ownership (catalog command/exact-read migrations).
- [x] ✅ COMPLETE — Provide pending/validation/empty/loading/error states and hydration edit guard.
- [ ] ⚠️ NEEDS HARDENING — Investigate the audit edit-route 404 using retained trace; distinguish route discovery/dev cache issues from an application defect; preserve the existing edit assertions. Do not change code as part of this audit.
- [ ] ⚠️ NEEDS HARDENING — Rerun affected edit/public-update E2E after diagnosis and record a reliable complete baseline.

**Acceptance:** all existing owner catalog assertions pass, including edit navigation/save; exact price and selected GST persist; wrong-business create/update/read is denied; no frozen documents are touched. Do not recreate the existing schema/features to finish the remaining verification task.

### Phase 5 — Public Catalog

**Status:** ⚠️ NEEDS HARDENING; implementation tasks are complete. **Goal:** customers browse selected business items without accounts.

**Depends on:** 1, 2, 4 core publication/data model. **Required before:** 13 public release. **Blocks:** catalog exposure unless safe projection and publication checks hold. **Can be implemented independently:** no dependency on quotations, orders, images or payments.

**Tasks / evidence**

- [x] ✅ COMPLETE — Allocate immutable unique business slug/backfill and private-by-default publication flag (public catalog migration).
- [x] ✅ COMPLETE — Expose guest list/detail through restricted reader role, fixed projections, slug-to-business join and published/unarchived RLS (public queries/RPCs).
- [x] ✅ COMPLETE — Add owner public link and authorized Publish/Unpublish, with public path revalidation (owner pages/publication form/action).
- [x] ✅ COMPLETE — Render mobile card/detail pages, exact price/GST, pagination, empty/unavailable/retry states (public routes/shell).
- [x] ✅ COMPLETE — Add SQL checks for archive/draft exclusion, exact values, forbidden columns, role safety and foreign slug/ID combinations; add six browser scenarios (`public_catalog.sql`, `public-catalog.spec.ts`).
- [ ] ⚠️ NEEDS HARDENING — Diagnose/reverify public detail and unavailable routing, guest edit-route protection and edit/unpublish regression after the audit's five failing public-catalog scenarios. Preserve completed publication/RLS work; do not rebuild it.

**Acceptance:** guest lists/opens own-slug published items; wrong slug/item, private/archived/missing items unavailable; no private fields or owner controls leak; private routes stay protected; URL survives rename/reload; public view fits 375px; edits/unpublish update visibility. A valid different business's published URL is intentionally public.

### Phase 6 — Business Document Setup

**Status:** ✅ COMPLETE (9 October 2026; the full-run customer browser failure remains under Phase 3 hardening). **Goal:** let owners review/edit the text and tax particulars that future documents copy, and identify incomplete setup.

**Depends on:** 1, 2. **Required before:** 7 draft identity defaults and 8 share readiness. **Blocks:** sharing incomplete seller particulars; does not require images or invoice numbering. **Can be implemented independently:** yes, before quotation code.

**Database**

- [x] ✅ COMPLETE — Fixed `update_business_settings` command reuses `businesses` text columns; actor/business come from `auth.uid()`. SQL validates trimmed/nullable text, state, basic GSTIN shape, conditional GSTIN and PostgreSQL-listed time zone. Existing asset key/hash constraints stay in place; command has no asset, country, currency, slug or membership parameters (`20261009104916_business_document_setup.sql`).
- [x] ✅ COMPLETE — Shared business advisory lock followed by active-owner recheck; restricted executor and existing forced RLS; fixed update column list, no raw authenticated writes or document mutation (`business_document_setup.sql`).
- [x] ✅ COMPLETE — `docs/GST_RATE_OPERATIONS.md` documents trusted operator configuration/retirement and optional local 5/18/40 examples outside migrations. No owner rate-master UI or automatic legal-rate seed.

**Backend / Frontend**

- [x] ✅ COMPLETE — Business settings query/validation/Server Action follow current modules; `/settings` shows document setup and fixed India/INR.
- [x] ✅ COMPLETE — Form edits approved text fields, normalizes optional blanks, displays field/general errors and pending/saved states, preserves entries; logo/signature untouched.
- [x] ✅ COMPLETE — Server-derived readiness lists missing seller name/address/state/registration/conditional GSTIN, missing selectable rate configuration for taxable documents, and the document time zone. Customer/line readiness remains Phase 7–8.
- [x] ✅ COMPLETE for Phase 6 — Prefix mismatch is a review warning. Optional bank/UPI/terms are private profile defaults only; no document-draft code exists yet. Phase 7 must add explicit selection and frozen copying without live-master fallback.

**Security / Testing**

- [x] ✅ COMPLETE — `supabase/tests/business_document_setup.sql` checks owner/foreign/disabled/guest, restricted executor/grants, fixed region/slug, raw-write denial, invalid input and unchanged existing document fields. Existing foundation tests cover frozen snapshot immutability.
- [x] ✅ COMPLETE — Unit tests cover normalization/readiness/GST declaration; two settings browser journeys cover persistence, field-error recovery, guest redirect and owner separation. Typecheck, lint, nine unit files/28 tests, all six SQL suites, local DB lint, targeted browser tests and production build passed. Full browser run: **15/16 passed**, with the existing customer cross-business test failing on customer creation at `/customers/new`; Phase 6 browser tests passed. See verification note below.

**9 October 2026 verification note:** Applied the Phase 6 migration with `supabase migration up --local` without resetting the local database. `npm run typecheck`, `npm run lint`, `npm run test` (9 files, 28 tests), all six rolled-back SQL suites, `supabase db lint --local --schema public,private --level error --fail-on error`, targeted `business-settings.spec.ts` (2/2), and `npm run build` passed. A full `npm run test:e2e` run passed 15/16; `customers.spec.ts` cross-business case remained on `/customers/new` after submission, with the captured page showing a required customer-name error. The isolated retry passed 1/1, so the full-run failure is intermittent and remains under earlier customer hardening. A fresh full-stack migration replay was not run against a separate disposable database; the local existing database and migration history were verified.

**Acceptance:** owner can save/reopen authorized text settings; missing prerequisites are actionable; secrets/private remittance settings never enter the public catalog; old documents remain unchanged; no storage/invoice workflow is required to complete this phase.

### Phase 7 — Quotation Drafts and Exact GST Calculations

**Status:** ✅ COMPLETE — the user manually confirmed the quotation draft workflow works; type, lint, unit, SQL and full browser verification also pass. UX issues from manual use are deferred for a later UX pass. **Goal:** save/review an editable quotation with deterministic amounts and explicit snapshots.

**Depends on:** 1–4 core, 6. **Required before:** 8. **Blocks:** sharing/approval until the separate Phase 8 transaction/broker contract exists. **Can be implemented independently:** draft/calculation slice can ship without public sharing.

**Database**

- [x] ✅ IMPLEMENTED — Reuse `quotations`, `quotation_versions`, `quotation_items`; add atomic create draft with preallocated IDs and current pointer. Use a stable creation ID; identical authorized retry returns original quote; changed customer conflicts. Require same-business active customer.
- [x] ✅ IMPLEMENTED — Add one authoritative exact calculation/save transaction. Validate positive quantity ≤3 decimals before storage; integer-paise prices; supported categories/routes and active configured taxable rates. Calculate/persist all line and document components; reject overflow/client-forged totals.
- [x] ✅ IMPLEMENTED — Implement expected `edit_sequence` conflicts and atomic line replace/update/delete only on current draft. Lock GST configuration shared → business shared → quotation; re-read after locks. Never overwrite stale edits or mutate frozen rows.
- [x] ✅ IMPLEMENTED — Snapshot all existing seller/buyer/document/line fields; retain provenance only internally. Explicitly populate route suggestion/override/final route, supply/reverse-charge choices, validity/timezone, terms and selected remittance fields. Assets may be null.

**Backend / Frontend**

- [x] ✅ IMPLEMENTED — Add quotation module with exact-string DTOs, validation/actions/queries and draft calculation preview using the same authoritative contract as save. Do not implement independent floating-point browser arithmetic.
- [x] ✅ IMPLEMENTED — Replace `/quotations` placeholder; add `/quotations/new`, `/quotations/[id]`, draft editing, customer selection and catalog or one-off ordered lines. Private catalog items may supply owner defaults; public publication is not required.
- [x] ✅ IMPLEMENTED — Provide line description/unit/HSN, quantity/price/category/rate, terms/date/supply choices, tax route suggestion/override and full tax breakdown. Catalog defaults become editable copies; master edits do not silently refresh them.
- [x] ✅ IMPLEMENTED — Handle empty draft, invalid/missing snapshot fields, retired copied rates, stale edit conflict and server failure without input loss. Sharing is implemented in Phase 8; quotation PDF download remains in Phase 11.
- [x] ✅ IMPLEMENTED — For reverse charge show: **“Reverse-charge calculation is not supported in this version. Confirm the tax treatment with your accountant before issuing this document.”** Indicator does not alter arithmetic or automatically block issuance. GSTIN prefix mismatch remains warning-only.

**Security / Testing**

- [x] ✅ VERIFIED — Unit/exact SQL fixtures: same-state 18% on ₹10,000 → ₹11,800; different-state/override identical total but different components; taxable zero distinct from exempt/no-GST; ₹0.20 at 5% → ₹0.22 CGST+SGST vs ₹0.21 IGST; 1.5×₹0.01 → ₹0.02; reject 1.2345 quantity; decimal rates/overflow/mixed sums.
- [x] ✅ VERIFIED — SQL fixtures cover foreign customer/catalog/version IDs, raw-write denial, disabled access, frozen edit denial, snapshot copying, stale sequence rejection, and forged totals.
- [x] ✅ VERIFIED — Two simultaneous draft saves accept one and reject the stale one.
- [x] ✅ VERIFIED — E2E covers create/edit/reopen, custom lines/catalog defaults, exact displayed totals, concurrent edits and owner isolation.

**10 October 2026 verification note:** The user manually confirmed the workflow and deferred UX polish. The full project verification now passes: 36 unit tests, eight rollback-only SQL suites, type checking, lint, production-mode browser suite (19 tests) and its production build. The quotation E2E now reaches and passes the simultaneous stale-save check and owner-isolation journey.

**Acceptance:** saved draft reconstructs identical values; server owns totals; stale saves conflict; copied defaults remain independent; no customer can read drafts; no partial quote/items commit. Sharing is deliberately unavailable until 8.

### Phase 8 — Quotation Sharing, Customer Response and Revisions

**Status:** ✅ COMPLETE for the single-instance prototype. **Goal:** accountless customers review exact offered terms and the owner safely handles acceptance/change requests.

**Depends on:** 7, 6. **Required before:** 9, quotation part of 11, 12. **Blocks:** conversion without current recorded approval. **Can be implemented independently:** yes, no invoice/payment/PDF dependency; PDF is delivered in 11.

**Database**

- [x] ✅ COMPLETE — Add atomic owner share/freeze/link, rotate/revoke, and create-revision commands using the approved tables. Sharing validates the frozen snapshot, lines, current rates, deadline and asset references; the transaction freezes the version, replaces an older active link and records the new link together.
- [x] ✅ COMPLETE — Activate the isolated `webameen_quote_broker` role, forced-RLS policies, and exact public wrapper permissions. Normal owner operations use the authenticated session; public reads use only the server-side broker key.
- [x] ✅ COMPLETE — Token lookup resolves the business/quote/version; the broker locks the shared business and quote, then rechecks access and current version before returning the frozen allow-list.
- [x] ✅ COMPLETE — The response broker validates token, current version, link status, response deadline and business availability, then records one response and updates version state atomically. Existing trigger projections and narrow broker grants allow commit-time integrity checks without changing trigger ownership or widening grants.
- [x] ✅ VERIFIED — First response, identical retry, conflicting response, expired link, disabled business, response-versus-revision and response-versus-revocation behavior pass rollback-only SQL/browser checks. A conflict or stale link never adds duplicate evidence.
- [x] ✅ COMPLETE — Revision copies frozen document fields/items, immediately supersedes the predecessor, returns the same successor for retries and rejects revisions after invoice issuance.

**Backend / Frontend / Security**

- [x] ✅ COMPLETE — Generate 32 cryptographic random bytes server-side, persist only SHA-256 hash, use stable request keys, reveal the raw URL once after commit and require explicit rotation to recover a lost URL.
- [x] ✅ COMPLETE — Add owner share/revoke/rotate/revise/version-history UI and the accountless `/q/[token]` read page. A separate guest browser context reads the frozen quote and submits approval/change requests; the public projection excludes owner-private notes, catalog provenance, membership data and token hashes.
- [x] ✅ COMPLETE — Keep response deadlines separate from link access cutoffs: expired-response documents remain readable, old links show a read-only revision-in-preparation state, and sharing the revision revokes older links.
- [x] ✅ COMPLETE for the prototype — Bounded inputs, safe unavailable responses, token hashing and no-store/no-referrer headers are in place. The rate limiter is per-process and must be replaced with a shared production limiter before a multi-instance deployment.

**Testing**

- [x] ✅ COMPLETE — Rollback-only SQL checks cover narrow broker grants, allow-listed reads, unknown/oversized input, link expiry, disabled business, invalid timestamps, response idempotency/conflicts, link rotation/revocation, revision snapshots and deferred integrity.
- [x] ✅ VERIFIED — Focused Playwright journey covers owner share → separate accountless guest read → competing response/revision → revision share → old-link denial → competing response/revocation → change-request history.

**Acceptance:** customer needs no account; approved terms match the exact immutable version; one response is retained; new revision requires approval again; old/private/foreign access is blocked; repeated requests create no duplicate links/versions/evidence or silently rotate newer links.

**10 October 2026 closeout:** Local migrations through `20261009201414_quotation_response_integrity_context.sql` are applied. The existing response RPC and scoped trigger projections pass with the approved narrow broker grants; no new role, grant or trigger-owner change was needed. `quotation_sharing.sql` passes the added expiry, disabled-business, retry/conflict and integrity checks. `npm test` passes (36 tests), and typecheck/lint pass. The focused Playwright journey reports one passing test, including revision and revocation races; its runner remained open after reporting the pass and was interrupted manually, so the Windows E2E process-shutdown issue remains under T6. The in-process rate limiter remains a single-instance prototype limit. Phase 9 followed Phase 8; its completion is recorded below. No invoice conversion, payments, customer invoice access or PDFs were added within Phase 8.

### Phase 9 — Numbered Invoice Conversion

**Status:** ✅ COMPLETE for the prototype. **Goal:** issue one immutable invoice from a current approved quotation.

**Depends on:** 8. **Required before:** 10, invoice part of 11, 12. **Blocks:** invoice issuance without configured applicable numbering period or current approval. **Can be implemented independently:** after approval, without payments/PDF/public invoice access.

**Database**

- [x] ✅ COMPLETE — Add owner numbering configure command over `invoice_number_sequences`: exclusive business lock, validated nonoverlapping `[starts_on, ends_before)` range, prefix/template `{prefix}/{period}/{number}` placeholders, padding/start; only unused settings editable. Never accept cursor rewinds/deletes.
- [x] ✅ COMPLETE — Add atomic conversion: shared business → quotation lock; return existing invoice first; validate current approved evidence; lock applicable period row; capture post-wait issue time/date in frozen timezone, recheck range, allocate next number, copy invoice/items and commit cursor together.
- [x] ✅ COMPLETE — Copy/compare **every** shared content field and source item/position, including nulls, identities, GST/HSN/supply/reverse-charge/assets/selected remittance. Only invoice identity/source/number/issue/due metadata differ. Do not refresh live masters or revalidate historical rates against current options.
- [x] ✅ COMPLETE — Keep no invoice draft/edit/GST override path; exhaustion aborts; date boundary crossing returns retryable `40001`; same quote retry cannot allocate another number.

**Backend / Frontend / Security**

- [x] ✅ COMPLETE — Add invoice/numbering modules, settings section for actual owner-supplied periods/format and authorized conversion action. No invented financial-year boundary or statutory format.
- [x] ✅ COMPLETE — Replace invoice placeholder with list/detail and issued snapshot; show source version/approval, number/date/due date; handle setup error before issue and confirmed success afterward.
- [x] ✅ COMPLETE — Require current approval/checklist, show review warnings and existing invoice after retry. Validate tenant/source and due-date semantics in command; no client totals, actors, issue timestamps or editable frozen terms.

**Testing**

- [x] ✅ PASS — Field-by-field snapshot/structure regression with distinguishable/null values; customer/profile edits and rate retirement after approval do not change conversion.
- [x] ✅ PASS — Concurrent conversions of different quotes start at 100/101; same-quote retry returns original; failed operations leave the cursor unchanged; used settings are immutable; missing/overlapping periods and bigint overflow are rejected. The date-boundary guard is present and returns retryable `40001`; a real midnight wait was not simulated.
- [x] ✅ PASS — E2E approve→convert→reopen same invoice; unapproved and foreign conversion blocked; SQL/RLS/default-denial and regression suites pass.

**Acceptance:** one immutable invoice per quote, exact approved content, transactionally unique number/date, retry returns same invoice, failed conversion consumes no committed allocation, another business cannot read/issue it.

**10 October 2026 closeout:** Migration `20261010104752_invoice_numbering_and_conversion.sql` is applied locally. All nine rollback-only SQL files pass through `psql`; database lint and security advisors report no issues. `npm test` passes (36 tests), and typecheck/lint pass. The focused invoice Playwright test reports one passing test, including simultaneous numbering from two owner tabs and reopening the same snapshots. Its assertions pass, but the Windows runner remained open after reporting the pass and was interrupted manually; this shutdown issue remains tracked under T6. The date-boundary retry branch was code-reviewed but not forced across a real midnight in the test environment.

### Phase 10 — Manual Payments, Corrections and Receipts

**Status:** ✅ COMPLETE. **Goal:** record money received and reliable outstanding balance with retained correction history.

**Depends on:** 9. **Required before:** 12 payment/history metrics, 13 complete MVP. **Blocks:** claiming payment/receipt functionality before atomic command coverage. **Can be implemented independently:** no gateway, public invoice or PDF dependency.

**Database**

- [x] ✅ COMPLETE — Add fixed confirm-payment command under shared business/invoice advisory locks. Resolve existing request key before new-operation balance checks; validate positive amount, INR, post-issue/not-future received time and current outstanding; insert payment and exactly one matching receipt atomically.
- [x] ✅ COMPLETE — Add full reversal with immutable reason/actor/time and identical retry; optional replacement command requires reversed same-invoice predecessor and exact payment/receipt predecessor pair. Conflicting retry payload/reason rejected; no UPDATE/DELETE to ledger-like records.
- [x] ✅ COMPLETE — Wrong-invoice correction remains reversal then independent payment on correct authorized invoice with null predecessor references. Do not relax same-invoice FKs or silently transfer money.
- [x] ✅ COMPLETE — Add exact authorized balance/read DTOs: effective paid excludes reversed entries; outstanding=total-paid; paid at zero including zero-total invoices, unpaid if paid=0 and total>0, otherwise part_paid; overdue derived by frozen timezone/due date.

**Backend / Frontend / Security**

- [x] ✅ COMPLETE — Add payment/receipt modules and actions with stable request keys and exact money/date validation; method is trimmed nonempty owner-entered text, optional suggestions only; no gateway credentials.
- [x] ✅ COMPLETE — Add Record payment on invoice, payment details/list, reversal reason/review, replacement flow and `/receipts/[id]` owner print view. Show original/reversed/replacement trail and error/pending states.
- [x] ✅ COMPLETE — Render receipt identity/terms from immutable invoice and receipt money/method/reference/time from immutable payment; reprint retrieves original reference. Reversal derives void receipt status without editing receipt.
- [x] ✅ COMPLETE — Server locks/rechecks every mutation; reject pre-invoice money, overpayment and foreign IDs; retries must still return original pair after a later reversal. Do not expose payment references/history through public document brokers.

**Testing**

- [x] ✅ PASS — SQL/integration tests for atomic payment+receipt, exact sums, partial/final/zero-total, timestamps, overpayment, retry payload conflicts, reversal/replacement, wrong-invoice correction and RLS.
- [x] ✅ PASS — Multi-session concurrent payments cannot exceed outstanding; duplicate request/reversal/replacement produces one result, rollback leaves neither payment nor receipt.
- [x] ✅ PASS — E2E invoice partial/final payment and receipt reprint, reverse/replacement updates derived balance/history, other-business access denied; no refund/credit-note behavior added.

**Acceptance:** effective paid+outstanding=invoice total; never negative outstanding; each committed payment has one receipt; correction history immutable; retry cannot duplicate money/reference; owner can reprint original receipt.

**10 October 2026 closeout:** Migrations `20261010161336_manual_payment_commands.sql`, `20261010163511_manual_payment_executor_lock_fix.sql` and `20261010165819_manual_payment_lint_cleanup.sql` are applied locally. All ten rollback-only SQL files pass; `npm test` passes (39 tests), and typecheck/lint pass. The invoice browser journey reports one passing test covering concurrent partial-payment attempts, final payment, Payments history, reversal/replacement, receipt reprint and cross-business denial. The Windows Playwright runner remained open after reporting the pass and was interrupted manually; this shutdown issue remains tracked under T6. Supabase security advisors report no issues; database lint retains one unrelated existing unused-variable warning in `private.revoke_quotation_link`. Customer invoice sharing and invoice PDF downloads remain Phase 11 work.

### Phase 11 — Accountless Invoice Access, Document PDFs and Optional Branding

**Status:** 🔴 NOT STARTED. **Goal:** customers securely view/download the same frozen quotation/invoice the owner shared.

**Depends on:** 8 for quotes, 9 for invoices; Phase 6 text settings. **Required before:** 13 customer delivery acceptance. **Blocks:** exposing PDF/assets without token authorization. **Can be implemented independently:** quote PDF can start after 8, invoice branch after 9; no payments dependency. Logo/signature uploads are optional within this phase and must not block text-only downloads.

**Database / Storage**

- [ ] 🔴 NOT STARTED — Add owner invoice-link create/rotate/revoke over existing table, stable keys and same one-time secret handoff as quote links; shared business/invoice advisory locks; retries do not rotate a newer link.
- [ ] 🔴 NOT STARTED — Activate only invoice broker read grants/RLS and fixed private SECURITY DEFINER read/invoker entry functions. Only isolated server service invocation; no quote/response/payment/receipt/master/number-settings access.
- [ ] 🔴 NOT STARTED — If branding is included, create private business-scoped immutable object storage with narrow owner membership policies, allowed image types/size, trusted keys and SHA-256 pairing. Deny overwrites and deletion of retained historical assets; no public product media or file table required.

**Backend / Frontend / Security**

- [ ] 🔴 NOT STARTED — Add independent invoice token namespace (`/i/[token]` proposed) and read-only customer page. Token resolves invoice; never search quote tokens or infer authorization from ID alone. Allow-list frozen content only.
- [ ] 🔴 NOT STARTED — Select a minimal maintained server PDF renderer compatible with deployment runtime; share one frozen-snapshot view model between owner/customer HTML and PDFs. Include number/date, seller/buyer particulars, ordered HSN/units/quantity/prices, GST components, supply/reverse-charge, selected remittance and terms.
- [ ] 🔴 NOT STARTED — Add functional Download PDF to quotation/invoice pages and owner views. Authorize every request through the same read contract; render after transaction release; no persisted PDFs, permanent download URLs or live-master fallback.
- [ ] 🔴 NOT STARTED — If branding exists, add owner upload/settings and document-bound asset handler that verifies token, same-business frozen key and digest before serving bytes. Recheck revocation/access expiry on new image/PDF requests. Renderer must not fetch arbitrary remote/user URLs.
- [ ] 🔴 NOT STARTED — Rate-limit reads/downloads, cap input/render workload, use safe unavailable/no-store behavior and redact tokens/assets from logs. Quote token never grants invoice access; invoice link never grants payment/receipt access.

**Testing**

- [ ] 🔴 NOT STARTED — SQL broker/tenant/token-scope/revocation/expiry/disabled-business checks; same-key link retry and explicit rotation tests.
- [ ] 🔴 NOT STARTED — E2E guests view/download quote/invoice without login; invalid/wrong-scope/revoked links fail for page, image and PDF; assert downloaded content matches frozen snapshot.
- [ ] 🔴 NOT STARTED — PDF visual/content fixtures for long/multiple-page documents, mixed GST, tiny rounding amounts and absent optional fields. If assets included, test MIME/size/namespace/digest/overwrite/deletion rules and retained branding after profile changes.

**Acceptance:** PDFs and pages represent identical authorized historical data; revocation blocks future requests; no arbitrary storage access or private history leaks; text-only documents work without upload setup. A previously downloaded copy cannot be remotely revoked and the UI must not promise otherwise.

### Phase 12 — Dashboard and Customer Transaction History

**Status:** 🔴 NOT STARTED workflow read models (identity/contact screens exist). **Goal:** owner sees recent work, effective payments and money still due.

**Depends on:** 3, 8, 9, 10. **Required before:** 13 usable end-to-end pilot. **Blocks:** claims of complete business history/reporting. **Can be implemented independently:** quote metrics can start after 8; invoice/payment portions wait for corresponding transactions; no PDF dependency.

**Database / Backend**

- [ ] 🔴 NOT STARTED — Add owner-scoped exact-string read models for current quote states, recent activity, invoice unpaid/part_paid/paid/overdue and outstanding total. Reuse typed records; any view must preserve caller RLS (`security_invoker`), no definer reporting bypass.
- [ ] 🔴 NOT STARTED — Add paged customer timeline from their quotes/versions/responses, invoices/payments/reversals/receipts, with deterministic date/type/ID ordering and same-business joins. No new generic events/ledger/cached-balance subsystem.
- [ ] 🔴 NOT STARTED — Derive balance/status consistently with Phase 10; typed changes/response history remains linked to exact version; avoid double-counting reversed payments or replaced receipts.

**Frontend / Security / Testing**

- [ ] 🔴 NOT STARTED — Extend dashboard with useful counts/recent work/outstanding and next actions; extend `/customers/[id]` with paged document/payment history and protected links. Show real empty/loading/error states.
- [ ] 🔴 NOT STARTED — Return only authorized business/customer rows and required fields; deny changed customer IDs, guests and disabled owners; do not make customer timeline public.
- [ ] 🔴 NOT STARTED — Unit/SQL tests for states/rounding-free aggregation/timezone/deterministic paging and two-business isolation; E2E complete workflow visible in dashboard/customer detail, including reversal and revision.

**Acceptance:** totals equal authoritative invoices/effective payments; old/new version activity remains distinguishable; one business/customer cannot see another's history; no fabricated dashboard counters or broad reporting subsystem.

### Phase 13 — Pilot Readiness and Release Hardening

**Status:** 🔴 NOT STARTED, with decisions below. **Goal:** run the agreed MVP safely with real pilot businesses.

**Depends on:** 1–12 for final release. **Required before:** hosted pilot/real customer data. **Blocks:** production provision/release until operational decisions and regression gates pass. **Can be implemented independently:** CI, recovery, diagnostics and documentation preparation can start now; no feature phase must wait for unrelated polish.

**Tasks**

- [ ] ❓ NEEDS DECISION — Resolve initial pilot segment, hosting/data region/environment ownership, retention/deletion/export policy, backup objectives and pilot acceptance targets (decision register below). Do not assume a deployed production project exists.
- [ ] 🔴 NOT STARTED — Implement provider password recovery/resend-confirmation UX with safe redirect/session handling, matching hosted confirmation requirements; add invalid/expired-link and session-expiry tests. Configure production callback origins/SMTP separately from local bypass.
- [ ] 🔴 NOT STARTED — Add CI for lint/typecheck/unit/build, disposable migration replay/SQL and browser regression with deliberately configured fixture rates/confirmation behavior; retain failure traces and fail on missing prerequisites.
- [ ] 🔴 NOT STARTED — Resolve current edit-route regression and document generated-route/cache isolation; remove source-file churn caused by different Next output directories through a narrowly scoped authorized maintenance task.
- [ ] 🔴 NOT STARTED — Complete multi-session concurrency/security suites in 7–11; verify all role grants/function ownership/search paths, no raw runtime writes, public projections, token abuse limits and upload policies.
- [ ] 🔴 NOT STARTED — Add secret-redacted operational errors/correlation identifiers and useful health/readiness checks. Define rate-limit configuration for public catalog and document endpoints without introducing background infrastructure by default.
- [ ] 🔴 NOT STARTED — Exercise backup restore, migration upgrade/fresh replay, owner-disable and incident access procedures in disposable environments; configure separate hosted credentials and publishable/server-only secrets as applicable.
- [ ] 🔴 NOT STARTED — Verify public catalog disabled-owner behavior against the decision register; document owner publication/removal expectations and privacy-safe public content.
- [ ] 🔴 NOT STARTED — Review keyboard/mobile forms and documents, validation retention, long content, empty/error states and print/PDF output; replace misleading foundation-placeholder copy and resolve `/products` legacy route deliberately.
- [ ] 🔴 NOT STARTED — Run end-to-end pilot scenario with representative business/customer/catalog, revised quote, approval, invoice, partial/final payment, reversal and receipt; update this roadmap with dated evidence and agreed limitations.

**Acceptance:** relevant suites and build pass on a reproducible environment; no unresolved current regression is called verified; real pilot completes the promised journey without customer accounts; recovery works; operations decisions recorded and restore exercised; no unapproved post-MVP scope included.

## 7. Post-MVP Roadmap

These are candidates, not authorization to implement. Each has status and dependencies; define a detailed accepted slice before promoting it to a numbered phase.

| Candidate                                  | Status                                        | Dependencies / bounded direction                                                                                     |
| ------------------------------------------ | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Archive customer/catalog controls          | 🟡 PARTIAL schema, 🔴 NOT STARTED application | 3/4; owner command, retained references, list semantics and SQL/E2E; never hard-delete document sources              |
| Catalog categories/images/public search    | ❓ NEEDS DECISION                             | 5; validate actual discovery need; new media storage must be separate from sensitive immutable document assets       |
| Bulk import/export and richer filters      | 🔴 NOT STARTED                                | 3/4/12; explicit validation/tenant/export privacy before bulk writes                                                 |
| Additional document templates/localization | ❓ NEEDS DECISION                             | 11; preserve frozen values/authorized rendering; current interface English                                           |
| Automated email/WhatsApp notifications     | ❓ NEEDS DECISION                             | 8/11; explicit channel/provider/consent and retry rules before jobs                                                  |
| Team roles/invitations/multiple workspaces | ❓ NEEDS DECISION                             | 2; current uniqueness/role constraints intentionally reject these; requires separately reviewed authorization change |
| Customer ordering/commerce                 | ❓ NEEDS DECISION, outside current MVP        | Explicit new product brief before cart/orders/fulfillment or schema; public catalog alone does not require checkout  |

Online gateways, refunds/credit notes, deposits, inventory/accounting, SaaS billing, tax/compliance expansion and microservices remain future/optional. Do not choose a payment provider or model stock merely to implement the document roadmap.

## 8. Technical Debt / Hardening

Findings below are documented, not fixed by this audit. Priority indicates implementation attention, not a claim of exploitation.

| ID / priority                 | Finding and evidence                                                                                                                                                                                                                                                                                                                      | Follow-up                                                                                                                                                                                                   |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1 — High                     | 8 October: 7/14 browser tests passed with global 404 failures. 9 October: unchanged targeted specs 10/10 and full run 1 14/14 passed; a concurrent-build experiment produced 13/14 with an unfinished catalog-create request, not the original 404. Root cause remains unestablished; three consecutive green full runs are not verified. | OPEN: investigation stopped as requested; see dated evidence above. Preserve the controlled-run trace; do not treat a different timeout as proof of the original routing cause or mark Phases 3–5 verified. |
| T2 — High                     | README says customers/workflows unimplemented and all other routes placeholders; older specs include obsolete tables/roles/open decisions; docs ignored by Git.                                                                                                                                                                           | Roadmap supersedes these statements; later doc maintenance should preserve approved sources and update entry-point README.                                                                                  |
| T3 — High before transactions | Core customer/catalog commands recheck membership but do not explicitly acquire the full documented shared-business lock/recheck protocol. Catalog UPDATE locks item before rate guard acquires global configuration lock.                                                                                                                | Before concurrent owner-disable/config workflows, implement agreed lock order with multi-session tests; current SQL isolation pass does not prove race safety.                                              |
| T4 — Medium                   | Pending buttons reduce duplicates; customer/catalog creates lack durable request keys. Foundation financial request fields exist but no commands use them.                                                                                                                                                                                | Assess network duplicate risk; financial phases must provide specified durable retries. Do not claim master-data creates are idempotent.                                                                    |
| T5 — High before hosted pilot | Recovery/resend UI absent; local confirmation disabled; hosted callback/email/session-expiry paths not browser-tested.                                                                                                                                                                                                                    | Phase 13; successful local signup is not hosted recovery/verification evidence.                                                                                                                             |
| T6 — Medium                   | No CI; SQL tests separate from `test:all`; tests run dev Chromium only. Taxable catalog UI/empty-rate/retired-rate E2E, pagination with enough rows and fault/retry paths lack dedicated coverage.                                                                                                                                        | Phase 13 CI and relevant future feature suites; retain existing tests.                                                                                                                                      |
| T7 — Medium                   | Phase 10 now covers payment concurrency with advisory-locked commands, SQL retry/reversal checks and a two-tab browser overpayment race.                                                                                                                                                                                                   | RESOLVED for Phase 10 core. Revisit if payment-provider, batch-payment or multi-owner workflows are introduced.                                                                                              |
| T8 — Medium                   | Public catalog reader checks publication/archive but not active owner availability; disabling membership does not automatically withdraw public items.                                                                                                                                                                                    | Decision D3, then documented Phase 13 policy/test. No exposure of private data was established.                                                                                                             |
| T9 — Medium                   | Config lists nonexistent `seed.sql`; selectable rates remain operator data. Phase 6 added `docs/GST_RATE_OPERATIONS.md`, but each fresh taxable setup still needs deliberate operator configuration.                                                                                                                                      | Keep the runbook current and add deterministic test configuration in Phase 13; no invented migration rate list.                                                                                             |
| T10 — Medium                  | Supabase's default storage service setting is not an application file policy; no buckets/renderer/asset verification exists.                                                                                                                                                                                                              | Phase 11; do not interpret schema asset columns as secure upload support.                                                                                                                                   |
| T11 — Low/scale dependent     | Search uses `%term%`/OR and exact counts; current B-tree sort indexes do not optimize arbitrary substring search. Count/list are separate snapshots.                                                                                                                                                                                      | Measure pilot volume before trigram/search/cursor additions; tolerate/document concurrent pagination changes.                                                                                               |
| T12 — Medium                  | Owner customer/catalog ID queries do not uniformly validate UUID syntax before RPC/PostgREST; malformed IDs may reach generic errors rather than feature 404. Public detail validates UUID.                                                                                                                                               | Authorized hardening task: safe consistent unavailable states without existence leaks.                                                                                                                      |
| T13 — Low                     | `/products` remains protected placeholder while sidebar routes catalog; sidebar still says foundation only; generic root goes to dashboard rather than old marketing-page proposal.                                                                                                                                                       | Phase 13 small UI/routing review; marketing page is optional, no assumed redesign.                                                                                                                          |
| T14 — Medium operations       | Health reports configured values, not connectivity; generic safe errors lack operational correlation/diagnostics; E2E records accumulate and fixtures are coupled.                                                                                                                                                                        | Phase 13 instrumentation/isolated test DB lifecycle; protect secrets and preserve failure evidence.                                                                                                         |
| T15 — Medium                  | No explicit public catalog abuse controls; provider Auth limits exist, not general application rate limiting. Local vector logging container was restarting during audit.                                                                                                                                                                 | Phase 13 public request limits and local service diagnostics; no claim that vector restart caused browser routing failure.                                                                                  |

## 9. Product Decisions Required

Do not reopen India/INR, three-decimal quantity, agreed GST arithmetic, accountless customers, one-owner workspace, approval/revision model, one invoice/quote, no overpayment, manual payments, one receipt/payment, or required quote/invoice PDFs. Those are already resolved.

| ID  | Genuine unresolved decision                                                                                                                              | Needed by / action                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | First pilot business segment and representative document examples; numeric pilot success criteria                                                        | Before 13 pilot signoff; select users/examples rather than adding segment-specific schema now                                                                |
| D2  | Hosting/provider/data region, environment ownership, privacy/retention/deletion/export policy, backup recovery objectives/support                        | Before production provisioning/real data; record decisions and implement operational controls in 13                                                          |
| D3  | Should disabling an owner also withdraw that business's already published public catalog? No explicit public-catalog availability contract settles this. | Before public launch; current behavior remains published/active-only regardless of membership disable. Choose withdraw or intentional retention and test it. |
| D4  | Optional catalog enrichment/commerce priority after current MVP: images/categories vs later ordering, if any                                             | Does not block 6–13; require explicit scope if promoted. No current evidence requires order/fulfillment architecture.                                        |

Renderer choice, specific route spelling and upload size are ordinary implementation choices to document when the affected phase begins. Actual GST choices, numbering prefix/start/template/ranges and business particulars are operational setup values, not reasons to redesign schema or pause unrelated phases.

## 10. Testing Strategy

### Verification commands and prerequisites

From `D:\webameen`, use Node 24/npm 11 and installed Chromium. Start the local Supabase stack with Docker before browser/SQL checks; set the public URL/key together in ignored `.env.local` and appropriate callback `APP_URL`. Do not print credentials. Keep public-rate operator configuration distinct from historical calculation fixtures.

```text
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run test:all
npm run build
```

`test:all` runs unit then browser tests; it does not run SQL, lint, typecheck or build. Production build should run after browser checks, avoiding concurrent dev/build output interference. Next may regenerate `next-env.d.ts` for the selected output directory; inspect/revert only generated audit changes so source stays unchanged.

SQL suites are independent rolled-back scripts; run each with `psql -X -v ON_ERROR_STOP=1` against confirmed local disposable/test environment:

```text
supabase/tests/foundation.sql
supabase/tests/business_bootstrap.sql
supabase/tests/customer_commands.sql
supabase/tests/catalog_commands.sql
supabase/tests/public_catalog.sql
```

Discover Supabase CLI commands with installed `--help` before use. Verify migration history and security advisors when implementing schema/grant changes. Fresh replay must apply all migrations in order and run SQL checks; never reset a developer database without explicit authorization. The audit used a separate named disposable DB; future CI should also verify provider integration in a fresh full local stack.

### Required coverage by layer

- **Unit:** boundary validation, exact money/quantity/rate parsing, GST examples, date boundaries, response/balance derivation and safe errors.
- **SQL/security:** every exposed RPC's guest/active/disabled/foreign behavior, safe columns, raw-write denial, function grants/owner, composite references, snapshot immutability, retries/rollback. Foundation fixtures do not replace command tests.
- **Integration/concurrency:** separate transactions/connections with barriers, duplicate/conflicting requests, stale edits, post-lock expiry, revision/approval races, invoice numbering and payment balance serialization. No arbitrary browser sleeps as race coverage.
- **Browser:** complete owner/guest journeys; catalog isolation stays covered; customer never needs account; invalid/unavailable/error states; mobile/keyboard forms; meaningful assertions unchanged when diagnosing failures.
- **Documents/storage:** downloaded content and visual layout match authorized snapshots; revocation applies on every new request; no unrelated assets/remote fetch or historical asset mutation.
- **Release:** full relevant regression, clean migration replay, production build, provider callback/recovery and operational restore evidence. Record actual results and unresolved failures; no blanket pass copied from an earlier run.

## 11. Development Rules

1. Read `docs/PROJECT_ROADMAP.md` before implementing a requested phase; use these phase IDs.
2. Inspect current code/migrations/tests before architectural assumptions. Read applicable `AGENTS.md` and installed Next.js guidance before code changes.
3. Do not redo completed work. Existing financial tables/guards need commands and UI, not recreation.
4. Do not silently change product requirements. Document a genuine ambiguity and resolve only work dependent on it.
5. Do not skip authorization/RLS, safe projections, token scope, immutable history or exact financial rules.
6. Do not mark tasks complete without verification. Code present, tests present and tests passing are distinct facts.
7. Add/update tests for new functionality, including command security/concurrency as the workflow is exposed.
8. Update roadmap tasks/phase status after implementation; record date, useful references and actual test outcomes.
9. Keep migrations additive/reproducible; do not rewrite applied foundation migrations or insert arbitrary configuration seeds.
10. Run relevant suites before declaring completion and disclose any remaining failures with evidence.
11. Prefer existing modular monolith/server modules/Server Actions/fixed RPC boundaries unless a documented need warrants change.
12. Avoid implementing later phases prematurely: draft work cannot expose incomplete sharing; public catalog cannot be reused as document authorization.
13. Keep MVP scope under control: no orders, images/categories, gateways, stock, teams, generic events/counters/jobs or broad compliance engine without explicit scope.
14. Keep normal owner queries on user-session clients. Isolate future document service credentials to exact restricted brokers; never browser exposure or general CRUD.
15. Respect configuration-before-use gates without turning warning-only GSTIN/reverse-charge choices into new blockers. Null optional assets do not require storage provisioning.
16. Preserve user changes and failure evidence; do not commit/deploy/provision production during an audit. The 8 October baseline audit authorized documentation only; later explicit phase requests authorize their named implementation scope.

### Future phase execution record

For a requested phase: confirm dependencies and current status → inspect referenced modules/migrations → implement only unchecked tasks in the requested layer → add security/tests → run relevant checks → update task status/evidence. For “Phase 6, database tasks first”, implement only the Phase 6 Database list and its SQL tests; leave other Phase 6 tasks explicitly open until completed.
