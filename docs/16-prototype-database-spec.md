# Webameen - Prototype database specification

Status: **Schema reference reconciled with the implemented migrations through `20261008155240_public_catalog.sql`.** The migration history is authoritative for the deployed schema; the later workflow sections also record intended command contracts, whether or not application commands/UI are available yet.

This specification turns documents 04, 05, 10, 12, 14 and 15 into a concrete PostgreSQL design for the prototype. It creates no tables, policies, functions or application behavior. PostgreSQL 17 is the design baseline, matching the existing local Supabase configuration.

Updated for the business decisions supplied on 5 October 2026 and the correction pass on 6 October 2026. Those decisions take precedence over conflicting earlier proposals. The referenced filenames 10-security-tenant-isolation.md, 12-prototype-decisions.md and 14-prototype-scope.md are not present; the reviewed counterparts are 10-security-model.md, 12-architecture-review.md and 14-prototype-decisions.md. Only this specification is updated.

Business public-catalog columns, publication behavior and catalog-reader RLS were reconciled to the public-catalog migration on 9 October 2026. No schema or migration is changed by this reconciliation.

## 1. Scope, precedence and decisions

The current request expressly selects editable drafts, frozen shared versions, responses tied to versions, one invoice per quotation, payments only after invoice creation, immutable confirmed payments with reversals, and one receipt per payment. Those choices take precedence over older open alternatives.

The following interpretations keep the model small:

- **One invoice can have many payments. Each payment belongs to exactly one invoice.** The phrase "one payment per invoice" in document 14's summary conflicts with its detailed analysis and the current request. There is no unique constraint on payments.invoice_id.
- **One receipt ever per payment**, not merely one currently active receipt. Correcting a payment reverses it, then optionally creates a replacement payment and its new receipt. Receipt-only editions, corrections and reissues are outside this prototype; a reprint uses the original reference.
- Create the receipt record in the same transaction as a confirmed payment. Rendering or printing it later does not create another record.
- One owner membership per business and, as a deliberately small technical restriction, one workspace per authenticated user. No staff roles, invitations, ownership transfer or workspace switching.
- A new revision immediately makes the old approval ineligible for conversion and the old version ineligible for new responses. An old link can show the frozen document read-only while the revision is a draft. Sharing the revision revokes all older links, after which those URLs are unavailable.
- India only, INR only, with amounts stored as integer paise and displayed to two decimal places. There is no currency selector or currency conversion.
- Basic GST is required: taxable, exempt and no-GST lines; configurable selectable GST rates for new content, independently preserved historical rates; CGST + SGST or IGST. Seller/customer state determines the suggested treatment, and a document override preserves both the suggestion and the final choice.
- Catalog GST defaults are copied into editable document lines. Frozen quotations and issued invoices retain the actual categories, rates, bases and component amounts used.
- Customer pages support quotation and invoice PDF downloads. A separate invoice access-token table is now necessary for the expressly requested accountless invoice page; it stores access permissions, not PDF files. Quote tokens never grant invoice access.
- No generic event, ledger, adjustment, profile, PDF/file-storage or generic document-counter table. A dedicated invoice_number_sequences table handles only invoice numbering. Typed records and lifecycle actor/timestamp columns preserve the core history.
- This is a basic GST calculation/data model for the agreed prototype, not a claim of complete or production-grade GST compliance. Discounts, charges and special jurisdiction rules are not inferred.

### Decision status and remaining confirmations

| Gate | Current status | Effect |
|---|---|---|
| B1 | **Decided:** India, INR, exponent 2, integer paise | No multi-currency schema or UI work. Quantity accepts at most 3 decimal places, with numeric(18,6) retained as storage capacity. |
| B2 | **Decided:** basic GST, configurable rate options and explicit categories, automatic state comparison plus manual override, catalog defaults plus document-line overrides, and line/component half-up paise rounding | Replaces the old no-tax baseline and conditional generic-tax alternatives. The owner expressly confirmed the rounding contract in section 5. Selectable rates are replaceable configuration; snapshots have no dependency on the active option list. |
| B3 | **Decided:** invoice particulars, HSN/SAC, place of supply, basic reverse-charge indicator and invoice numbering approach | Explicit profile/line/document columns and immutable asset references below support the requested PDF. Invoice-specific numbering settings are configured per business/period; no legal format or extra tax rule is inferred. |
| B4 | **Decided:** an expired quotation cannot receive a new approval; changes use a revision | Retain the existing date-boundary convention and version/link architecture in section 7. No reopened expiry-scope decision. |
| B5 | **Decided:** customer-facing quotation/invoice pages with PDF download | Owner shares secure URLs manually; no automated delivery or PDF-storage subsystem. Invoice numbers are assigned transactionally under section 4.19; quote and receipt references retain their existing behavior. |
| B6 | **Decided:** reject overpayment | A new effective payment must not exceed the invoice's outstanding amount. Existing reversal/receipt model is unchanged. |
| B7 | **Production only:** hosting/data region, retention/deletion and operational provider setup | Does not block a local schema migration; must be settled before production provisioning/real customer data. |
| R1 | **Decided:** quantity accepts up to 3 decimal places | quantity_scale = 3; validate before storage and reject excess precision without changing monetary rounding. No outstanding quantity decision. |

The owner clarified that **GST changes require a quotation revision and approval before invoice conversion**. Document-line overrides are therefore editable in quotation drafts and retained on the resulting invoice. Conversion copies the approved values exactly; no independent invoice GST override, invoice draft or post-issue editing is added.

### Staged implementation order

Keep the complete end-state schema in this document; implement it in the following order after authorization. This order does not authorize work in the present documentation-only milestone.

| Phase | Workflow scope | Security/integrity delivered with that workflow |
|---|---|---|
| 1 | Auth, business setup, customers, catalog; operator-provided selectable-rate configuration | Verified owner bootstrap, membership/RLS, composite tenant keys, constrained executor writes, validation/GSTIN warnings and protected configuration writes |
| 2 | Quotations, versions, quotation items, GST calculation and unit tests | Same-business relationships, draft concurrency, three-decimal quantities, snapshot column contracts, exact arithmetic, immutable-state guards and current-rate validation |
| 3 | Quotation public link, customer page, approval/change request | Hash-only tokens, isolated quotation broker, revoke/expiry checks, first-response evidence, share/freeze/link transaction and revision/reapproval behavior |
| 4 | Invoice conversion and transactional invoice numbering | Exact snapshot/line comparison tests, unique conversion, invoice-number locking/rollback, immutable dates/numbers, numbering RLS and tenant integrity |
| 5 | Payments, reversals and receipts | Immutable entries, invoice locks, overpayment rejection, receipt completeness, idempotency and same-invoice replacement constraints; guided wrong-invoice correction remains two operations |
| 6 | Invoice public link and quotation/invoice PDF downloads | Independent invoice broker/token scope, revocation on page/assets/downloads, frozen-asset access and identical authorized snapshot rendering |

Each phase adds its tables/constraints/functions/policies together in a reviewed implementation slice; avoid enabling a workflow whose required guards or dependent tables do not exist yet. Phase 2 can prepare draft/calculation/version code and tests, but customer sharing/freezing is not enabled until Phase 3 can atomically enforce the full link contract. PDF download is an end-state requirement delivered in Phase 6; earlier pages must not expose a nonfunctional or insecure download shortcut. Do not use service-role CRUD, disable RLS, omit ownership checks or temporarily allow edits to frozen data for convenience. Security tests belong to the phase that exposes the corresponding operation.

## 2. Final entity list

There are **17 application tables plus the provider-managed auth.users table**: 16 tenant-owned tables and one global application-configuration table, gst_rate_options. Business is the tenant root; its tenant-owned children carry business_id. auth.users is global provider identity, not a customer table. invoice_public_links supports customer invoice access; invoice_number_sequences is dedicated to invoice numbering. gst_rate_options contains only selectable-rate configuration, not tax law, product classifications or historical calculations.

The arrows in the product journey describe a workflow. A catalog product is owned by a business, not by a customer; a quote item may optionally use a catalog product.

| Table | Purpose and why needed | Scope / owner | Primary key | Important relationships |
|---|---|---|---|---|
| auth.users | Existing provider account identity and email verification; avoids storing passwords ourselves | Provider-managed, global | id | Referenced by business_memberships.user_id |
| businesses | Business identity, contact and approved locale/currency settings | Prototype, tenant root | id | Creator must be this business's owner membership |
| business_memberships | Maps a verified user to the business and permits disabling access without removing history | Prototype, tenant-owned | (business_id, user_id) | businesses; auth.users |
| customers | Editable customer directory distinct from frozen documents | Prototype, tenant-owned | id | businesses; owner actor |
| catalog_items | Reusable product/service descriptions and optional default prices | Prototype, tenant-owned | id | businesses; optional source for quote items |
| quotations | Stable quote reference, customer and current-version pointer | Prototype, tenant-owned | id | customer; current version |
| quotation_versions | Editable draft followed by a frozen document plus bounded lifecycle changes | Prototype, tenant-owned | id | quotation; previous version |
| quotation_items | Ordered line copies belonging to one version | Prototype, tenant-owned | id | version; optional catalog source |
| quotation_responses | Typed, immutable approval/change-request evidence | Prototype, tenant-owned | id | exact version and link used |
| quotation_public_links | Hashed bearer tokens, each bound to one frozen version, with expiry/revocation | Prototype, tenant-owned | id | exact quotation/version |
| invoices | One issued document for a quotation, with exact approved source and copied content including GST | Prototype, tenant-owned | id | quotation, source version, source approval, same customer |
| invoice_items | Frozen invoice lines copied from the exact source-version items, including the actual GST used | Prototype, tenant-owned | id | invoice; source quotation item |
| payments | Immutable confirmations of money received for one invoice | Prototype, tenant-owned | id | invoice; optional reversed predecessor payment |
| payment_reversals | One immutable full correction record per erroneous payment | Prototype, tenant-owned | id | exact payment and invoice |
| receipts | One immutable acknowledgement per payment, linked to the preceding receipt on replacement | Prototype, tenant-owned | id | exact payment/invoice; optional predecessor receipt |
| invoice_public_links | Separate revocable read/download access to one issued invoice | Prototype, tenant-owned | id | exact invoice; never a quote token |
| invoice_number_sequences | Invoice-only settings and transactional allocation state for one business/numbering period | Prototype, tenant-owned | (business_id, period_key) | businesses; referenced by invoices using the same business and period |
| gst_rate_options | Replaceable list of selectable total GST percentages for new content | Prototype, global application configuration | rate | No FK from catalog or document snapshots; operator-managed |

### Explicitly excluded tables

Profiles, teams/invitations, role catalogs, customer accounts, payment allocations, refunds, deposits, credit notes, debit notes, receipt editions, generic document-counter frameworks, general tax/compliance engines, PDF/file-storage tables, delivery jobs, view analytics, generic workflow_events and a general accounting ledger are future/out-of-scope. E-invoicing, e-way bills, GST returns, advanced GST compliance, inventory, subscription billing, gateways and WhatsApp/email automation remain excluded. No empty future tables are reserved.

Core history is reconstructed from version creation/share/supersession, responses, invoice issuance, payments, reversals and receipt records. Full before/after audit of every master-data edit is deferred; updated_at is not presented as such an audit log.

## 3. Schema conventions

### 3.1 Names, types and defaults

- Application tables are proposed in public with RLS and explicit grants. Transaction implementations live in an unexposed private schema. This is one database in the modular monolith.
- UUID primary keys default to gen_random_uuid(), except provider identity, the membership/invoice-number-sequence composite keys and the numeric gst_rate_options key. A transaction may allocate IDs before insertion to satisfy a deferred circular reference.
- B, Q, V, I and P below abbreviate business_id, quotation_id, version_id, invoice_id and payment_id **only in constraint notation**. They are not extra columns.
- NN means NOT NULL; NULL means nullable. A dash in Default means **no default**, not an implicit value. Nullable columns omitted on insert are null. Entries such as Authorized context, Command actor, Copied from invoice and Supplied stable command key describe required command assignments, not SQL DEFAULT expressions; no database default is implied by those labels.
- PK and unique constraints create their own indexes. Index labels point to section 10; a dash means no additional index for that column. A composite key is indexed as a tuple, not once for every component.
- All foreign keys use ON UPDATE NO ACTION and ON DELETE NO ACTION. There are no cascades into document/history tables. Explicitly marked references are DEFERRABLE INITIALLY DEFERRED; other FKs are immediate.
- All tenant foreign keys include business_id. Parent-specific tuples also enforce the correct quotation/version/invoice within the same business.
- Monetary values use bigint **integer paise**, including unit prices, line bases, GST components, totals, payments and receipts. Values are nonnegative; payments are positive. Never use float, real or PostgreSQL money. APIs must transport bigint amounts without JavaScript Number precision loss. Display INR (₹) with exactly two monetary decimals.
- quantity numeric(18,6) remains the storage ceiling, but business validation permits at most **3 decimal places**. quantity_scale smallint is fixed to 3 on documents. Validate exact decimal input before coercion; reject values needing a fourth decimal, never round quantity silently. A row CHECK quantity = round(quantity, 3) provides an additional guard on stored values. Prices accept whole paise only; no sub-paise price field is added.
- Retain currency_code/currency_exponent on historical documents, payments and receipts, with CHECK currency_code = 'INR' and currency_exponent = 2 whenever populated. These are historical units, not multi-currency support. Business/seller country is CHECK 'IN'.
- GST percentages use exact PostgreSQL numeric without a scale typmod, including catalog, line/component and configuration rates. Require finite values within the broad technical range 0..100; this range is not a legal rate list. No enum or CHECK IN fixes the selectable percentages. Exact division by two must preserve a component rate rather than round it to a currency precision. Money storage and half-up paise rounding are unchanged. Active selection is enforced by gst_rate_options; frozen rates have no FK or active-list constraint.
- state_code is text holding a normalized two-digit Indian state/territory code selected from a maintained application list, not arbitrary free-text spelling. No state table or special-jurisdiction tax engine is added. The two state codes are compared exactly under the user-selected prototype rule; they are not inferred from an address, GSTIN prefix or IP address.
- Timestamps are timestamptz. Store instants; interpret entered dates using the captured document_time_zone. Required text is trimmed and nonempty, except an explicitly empty invoice-number prefix. Optional blank text becomes null. Phone numbers, references and postal addresses are text, never numeric.
- All numeric inputs must be finite; reject NaN/Infinity. Validate quantity scale **before assignment** to numeric(18,6), because PostgreSQL can round to the declared scale. [PostgreSQL numeric types](https://www.postgresql.org/docs/17/datatype-numeric.html)
- Commands obtain actor IDs and recorded timestamps from trusted identity/database time. A default alone does not prevent forged inputs; command parameters do not accept actor or lifecycle timestamps.
- Server time used for response eligibility is captured after obtaining locks, using the actual wall clock. A transaction-start timestamp is insufficient for an expiry check after waiting on a lock.

### 3.2 Actor references

For every application column described as an owner actor, the FK is:

(business_id, actor_column) -> business_memberships(business_id, user_id).

This proves the actor belongs to the recorded business. Disabled memberships remain as historical references. Nullable actor/time pairs are either both null or both set. For businesses.created_by, business_id is businesses.id and the actor FK is deferred until the new membership exists.

Every non-root tenant table's business_id also references businesses.id. These direct FKs are included even when the longer parent FK also proves business ownership.

### 3.3 Constraint layers

Use row-local CHECKs for value shapes/ranges and valid nullable pairs, UNIQUE/FKs for identity/cardinality, and transactional commands plus thin guards for workflow rules. Do not describe a CHECK constraint as if it could safely validate other rows. Cross-row totals, eligibility, receipt completeness and snapshot copying require transaction logic or deferred constraint triggers. [PostgreSQL constraints](https://www.postgresql.org/docs/17/ddl-constraints.html)

Database command contracts in section 8 are part of the schema design, not optional frontend validation. Their implementation waits for the next authorized milestone.

## 4. Field-level specification

### 4.1 Provider-managed User: auth.users

This is an existing provider table, not an application table to recreate or alter. Only its public primary-key contract and verification fields are dependencies here; the provider controls its remaining schema, defaults and indexes.

| Column used | PostgreSQL type | Null? | Default | PK / unique | FK | Index | Use |
|---|---|---|---|---|---|---|---|
| id | uuid | NN | Provider-managed | Provider PK | - | Provider PK | Stable user identity; only provider PK is referenced by application FKs |
| email_confirmed_at | timestamptz | NULL | Provider-managed | - | - | None requested | Trusted verification check for workspace creation; not copied into an application user table |

Passwords, email changes, sessions and recovery remain provider-owned. Customers using quotation links do not get auth.users records.

### 4.2 businesses

| Column | PostgreSQL type | Null? | Default | PK / unique | FK | Index | Meaning |
|---|---|---|---|---|---|---|---|
| id | uuid | NN | gen_random_uuid() | PK | - | PK | Tenant identity |
| display_name | text | NN | - | - | - | - | Business name copied to the document |
| contact_email | text | NULL | - | - | - | - | Optional display contact, not auth identity |
| contact_phone | text | NULL | - | - | - | - | Optional display contact |
| postal_address | text | NULL | - | - | - | - | Exact formatted address text; no inferred legal or tax meaning |
| country_code | text | NN | 'IN' | - | - | - | CHECK = 'IN'; India-only prototype |
| currency_code | text | NN | 'INR' | - | - | - | CHECK = 'INR'; no currency selection |
| currency_exponent | smallint | NN | 2 | - | - | - | CHECK = 2; integer amounts are paise |
| state_code | text | NULL | - | - | - | - | Seller state; explicit validated selection required before sharing |
| gst_registered | boolean | NULL | - | - | - | - | Owner-declared registration status; must be selected before sharing |
| gstin | text | NULL | - | - | - | - | Seller GSTIN; required before sharing when gst_registered = true |
| logo_asset_key | text | NULL | - | - | - | - | Private immutable object key for configured logo; section 4.8 |
| logo_sha256 | bytea | NULL | - | - | - | - | 32-byte digest paired with logo_asset_key |
| signature_asset_key | text | NULL | - | - | - | - | Private immutable object key for owner-supplied authorized signature image |
| signature_sha256 | bytea | NULL | - | - | - | - | 32-byte digest paired with signature_asset_key |
| bank_name | text | NULL | - | - | - | - | Optional remittance bank display name |
| bank_account_name | text | NULL | - | - | - | - | Optional account-holder name for document payment instructions |
| bank_account_number | text | NULL | - | - | - | - | Optional bank account identifier; text, not numeric |
| bank_ifsc | text | NULL | - | - | - | - | Optional owner-entered bank routing text |
| upi_id | text | NULL | - | - | - | - | Optional UPI payment address; no gateway or stored credentials |
| payment_instructions | text | NULL | - | - | - | - | Optional human-readable remittance instructions |
| default_terms | text | NULL | - | - | - | - | Reusable terms copied selectively into drafts |
| time_zone | text | NN | 'Asia/Kolkata' | - | - | - | Prototype document-date default; validated IANA zone, captured on documents |
| public_catalog_slug | text | NN | 'catalog-' || gen_random_uuid() | UNIQUE | - | UNIQUE index | Stable public catalog URL slug; lowercase letters, digits and hyphens, at most 80 characters |
| created_by | uuid | NN | Command actor | - | (id, created_by) -> membership, deferred | No extra index | Creator and sole owner |
| created_at | timestamptz | NN | clock_timestamp() | - | - | - | Creation instant |
| updated_at | timestamptz | NN | clock_timestamp() | - | - | - | Last allowed profile/settings edit |

Country/currency/exponent are fixed to IN/INR/2 from workspace creation and cannot change. state_code may be incomplete during setup, but sharing requires a validated seller state and customer state even if the final tax route is manually overridden. A missing state is never treated as matching/different by default. State, GSTIN and contact edits affect masters only; existing draft/frozen copies do not refresh silently. The owner explicitly selects/reviews any draft update.

gstin has no uniqueness/FK/index and is not an authentication identity. Incomplete profile setup may remain null, but sharing requires an explicit registration declaration and a GSTIN when the seller declares registration. Registration does not automatically set line tax categories or prove eligibility; there is no GSTIN verification service or registration-category engine. Seller name/address/state are required on frozen documents; contact, logo and signature fields support the requested display when configured without inventing a compulsory signing workflow. Supplied seller/customer GSTINs use the server-side format check and non-blocking state-prefix warning below.

Asset key/hash pairs are both null or both set, with octet_length(hash) = 32. Profile asset replacement always uses a new immutable object key. Optional bank/UPI/terms values are copied only when the owner includes them in the draft; snapshot null means omitted. These fields hold document payment instructions, never passwords, UPI PINs or bank API credentials. None adds a key/index or a new asset/file table.

The deferred owner FK plus membership uniqueness means every committed business has exactly one owner membership, including a disabled owner. The system cannot commit an ownerless business.

`public_catalog_slug` is generated for each business, unique and immutable after creation. It is a public locator, not an authorization credential. Guest reads use only the dedicated safe public-catalog RPC projection in §9.4; private business profile and owner/user fields remain unavailable.

### GSTIN input validation and warnings

For every supplied seller/customer GSTIN, trim surrounding whitespace and normalize to uppercase. Apply a basic server-side PAN-based format check: exactly 15 ASCII characters, two leading digits, a ten-character PAN-shaped segment (five letters, four digits, one letter), followed by three alphanumeric characters. The prototype shape is ^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]{3}$. This is intentionally a basic shape check, not checksum, registration-type or online verification. [Government description of the state/PAN-based GSTIN structure](https://www.dor.gov.in/files/inline-documents/Report_on_GST_Registration.pdf)

Malformed supplied values produce a field validation error on profile/customer/draft input. Omission is allowed only under the existing optional/conditional rules; a required GSTIN cannot be skipped by providing an empty string. Server application boundaries and database commands that accept these values must agree; do not rely on browser validation alone.

Compare the normalized GSTIN's first two digits with the selected seller_state_code or buyer_state_code (master forms use state_code). A mismatch returns a **warning, not an automatic hard rejection**: show both values for owner review, but do not change either field, force a tax route, or add a CHECK that requires prefix equality. If the state is missing, show the missing-state setup item and compare once supplied. At share/conversion, warnings use the document's frozen/candidate fields, never a newly edited master.

A successful shape check does not prove that a GSTIN exists or is legally active. No online GSTIN lookup, checksum service, signature verification or warning-acknowledgement table is introduced. Recompute the warning from the stored inputs.

### 4.3 business_memberships

| Column | PostgreSQL type | Null? | Default | PK / unique | FK | Index | Meaning |
|---|---|---|---|---|---|---|---|
| business_id | uuid | NN | - | PK part; UNIQUE(business_id) | businesses.id | PK; unique | Exactly one retained owner membership per business |
| user_id | uuid | NN | Authenticated identity | PK part; UNIQUE(user_id) | auth.users.id | PK; unique | Exactly one workspace per user in this prototype |
| role | text | NN | 'owner' | - | - | - | CHECK role = 'owner'; no other app role |
| disabled_at | timestamptz | NULL | - | - | - | - | Null means active membership; disabling retains actor references |
| created_at | timestamptz | NN | clock_timestamp() | - | - | - | Membership creation |

The two single-column UNIQUE constraints are deliberate prototype restrictions. Future multiple memberships require removing them through a reviewed migration, without rewriting document FKs. No user-facing membership mutation or ownership-transfer operation exists.

### 4.4 customers

| Column | PostgreSQL type | Null? | Default | PK / unique | FK | Index | Meaning |
|---|---|---|---|---|---|---|---|
| id | uuid | NN | gen_random_uuid() | PK; U-C1 part | - | PK; U-C1 | Customer identity |
| business_id | uuid | NN | Authorized context | U-C1 part | businesses.id | U-C1; X-C1 | Tenant |
| display_name | text | NN | - | - | - | X-C1 | Display identity; names are not unique |
| contact_name | text | NULL | - | - | - | - | Named customer contact if used |
| email | text | NULL | - | - | - | - | Contact address, not an account or unique identity |
| phone | text | NULL | - | - | - | - | Contact telephone |
| billing_address | text | NULL | - | - | - | - | Customer address; setup may be incomplete, required on frozen document |
| state_code | text | NULL | - | - | - | - | Explicit buyer state for the agreed normal-case GST comparison; required before sharing |
| gstin_applicable | boolean | NULL | - | - | - | - | Owner-declared applicability; required before sharing |
| gstin | text | NULL | - | - | - | - | Buyer GSTIN; required on the document when applicability is true |
| private_note | text | NULL | - | - | - | - | Owner-only customer note; never copied to public documents |
| archived_at | timestamptz | NULL | - | - | - | - | Excludes customer from new quote selection |
| archived_by | uuid | NULL | - | - | Owner actor | - | Who archived the master record |
| created_by | uuid | NN | Command actor | - | Owner actor | - | Creation actor |
| created_at | timestamptz | NN | clock_timestamp() | - | - | - | Creation instant |
| updated_at | timestamptz | NN | clock_timestamp() | - | - | - | Last edit |

U-C1 = UNIQUE(business_id, id). Archive actor/time must agree. No UNIQUE constraint on name/email/phone. Archiving does not block viewing or finishing an existing quotation/invoice.

### 4.5 catalog_items (Product/Service)

| Column | PostgreSQL type | Null? | Default | PK / unique | FK | Index | Meaning |
|---|---|---|---|---|---|---|---|
| id | uuid | NN | gen_random_uuid() | PK; U-K1 part | - | PK; U-K1 | Catalog identity |
| business_id | uuid | NN | Authorized context | U-K1 part | businesses.id | U-K1; X-K1 | Tenant |
| kind | text | NN | - | - | - | - | CHECK IN ('product', 'service') |
| name | text | NN | - | - | - | X-K1 | Reusable display name |
| description | text | NULL | - | - | - | - | Reusable description, copied rather than live-linked for documents |
| unit_label | text | NULL | - | - | - | - | Owner-entered unit, e.g. a chosen label; no fixed unit taxonomy |
| default_unit_price_minor | bigint | NULL | - | - | - | - | Optional nonnegative price in paise, before GST |
| default_gst_category | text | NN | - | - | - | - | Explicit choice: taxable, exempt or no_gst; never silently defaults to exempt |
| default_gst_rate | numeric | NULL | - | - | - | - | Required finite 0..100 for taxable; create/change must select an active configured rate; null for exempt/no_gst |
| is_published | boolean | NN | false | - | - | Partial list index | Makes this item eligible for the public catalog when it is not archived |
| hsn_sac | text | NULL | - | - | - | - | Reusable HSN/SAC when applicable; preserve leading zeroes; no fixed digit length or master-table FK |
| archived_at | timestamptz | NULL | - | - | - | - | Excludes item from new selections |
| archived_by | uuid | NULL | - | - | Owner actor | - | Archive actor |
| created_by | uuid | NN | Command actor | - | Owner actor | - | Creation actor |
| created_at | timestamptz | NN | clock_timestamp() | - | - | - | Creation instant |
| updated_at | timestamptz | NN | clock_timestamp() | - | - | - | Last edit |

U-K1 = UNIQUE(business_id, id). Price is INR/paise. default_gst_category has a CHECK enumerating its three values; default_gst_rate is nonnull, finite and 0..100 exactly when category = taxable, otherwise null. An owner command checks an active gst_rate_options row when creating/changing the default; no FK ties a stored default to that configuration. Retiring an option preserves existing catalog values and allows unrelated name/archive edits. The UI marks a retired default as needing a new selection before use on a new draft line. Taxable at 0% is distinct from exempt and no_gst. These are user-selected classifications, not an automated legal determination. No stock, HSN/SAC classification engine, SKU or price-list model is added.

`is_published` defaults false. The partial `catalog_items_public_list_idx` index covers `(business_id, name, id)` only when `is_published` is true and `archived_at` is null. Publishing exposes only the fields explicitly listed in the public catalog projection; it does not grant guest access to owner catalog management.

unit_label remains simple text. UI suggestions are nos, kg, g, litre, meter, hour, day, month, service, box and piece; allow custom nonempty text. These are conveniences, not a database enum or unit master table. Preserve the exact chosen label on document lines.

Adding an item copies its description, unit, price, category, GST rate and applicable HSN/SAC into the draft line. The owner can override the copied category/rate for that line; no catalog update is required. Later catalog edits do not recalculate existing lines. Manual lines have no catalog source and require the same explicit category/active configured rate plus HSN/SAC where applicable. No HSN/SAC digit length or classification rule is inferred; null means omitted where inapplicable, not automatic exemption. The document's state-based CGST/SGST-versus-IGST choice cannot be a catalog default because it depends on the buyer.

### 4.6 quotations

| Column | PostgreSQL type | Null? | Default | PK / unique | FK | Index | Meaning |
|---|---|---|---|---|---|---|---|
| id | uuid | NN | gen_random_uuid() | PK; U-Q1/U-Q2 part | - | PK; U-Q1/U-Q2 | Stable quote identity |
| business_id | uuid | NN | Authorized context | U-Q1/U-Q2/U-Q3 part | businesses.id | U-Q1/U-Q2/U-Q3; X-Q1/X-Q2 | Tenant |
| customer_id | uuid | NN | - | U-Q2 part | (business_id, customer_id) -> customers(B, id) | X-Q2 | Customer remains fixed for this quotation |
| reference | text | NN | Command-generated | U-Q3 part | - | U-Q3 | Unique application reference; proposed Q- plus full UUID |
| current_version_id | uuid | NN | Command-allocated ID | - | (business_id, id, current_version_id) -> quotation_versions(B, quotation_id, id), deferred | No extra index | Current draft or frozen version |
| created_by | uuid | NN | Command actor | - | Owner actor | - | Creator |
| created_at | timestamptz | NN | clock_timestamp() | - | - | X-Q2 | Creation instant |
| updated_at | timestamptz | NN | clock_timestamp() | - | - | X-Q1 | Last draft/workflow change |

U-Q1 = UNIQUE(B, id); U-Q2 = UNIQUE(B, id, customer_id); U-Q3 = UNIQUE(B, reference).

No stored quotation.status or invoice_id. Display status is derived from current version and the unique invoice. The current-version FK is intentionally circular; allocate both IDs and insert quotation + initial version in one transaction. It must resolve at commit.

Customer, reference, business and creation fields never change. Correct a customer selection by removing a never-shared initial draft and starting again. This avoids altering the parties associated with historical versions.

### 4.7 quotation_versions

Includes every explicit document-content column in section 4.8, in addition to the following columns. This is a column list, not PostgreSQL table inheritance or a JSON object.

| Column | PostgreSQL type | Null? | Default | PK / unique | FK | Index | Meaning |
|---|---|---|---|---|---|---|---|
| id | uuid | NN | gen_random_uuid() | PK; U-V1/U-V2 part | - | PK; U-V1/U-V2 | Version identity |
| business_id | uuid | NN | Authorized context | U-V1..U-V5 part | businesses.id | U-V1..U-V5 | Tenant |
| quotation_id | uuid | NN | - | U-V2..U-V5 part | (B, quotation_id) -> quotations(B, id) | U-V2/U-V3 | Owning quotation |
| version_number | integer | NN | Command allocation | U-V3 part | - | U-V3 | Positive ordinal, allocated under quotation lock |
| previous_version_id | uuid | NULL | - | U-V4 part | (B, quotation_id, previous_version_id) -> quotation_versions(B, quotation_id, id) | U-V4 | Prior frozen version; null only for version 1 |
| state | text | NN | 'draft' | U-V5 predicate | - | U-V5 | draft/shared/approved/change_requested/superseded |
| edit_sequence | integer | NN | 0 | - | - | - | Optimistic edit counter for draft saves |
| valid_until | date | NULL | - | - | - | - | Optional owner-entered valid-through date; B4 |
| response_deadline_at | timestamptz | NULL | - | - | - | - | Frozen exclusive deadline derived from valid_until and document_time_zone under B4 |
| created_by | uuid | NN | Command actor | - | Owner actor | - | Draft/revision creator |
| created_at | timestamptz | NN | clock_timestamp() | - | - | - | Draft creation |
| edited_at | timestamptz | NN | clock_timestamp() | - | - | - | Last successful draft save |
| shared_by | uuid | NULL | - | - | Owner actor | - | Write-once freeze actor |
| shared_at | timestamptz | NULL | - | - | - | - | Write-once freeze instant |
| superseded_by | uuid | NULL | - | - | Owner actor | - | Revision creator who superseded it |
| superseded_at | timestamptz | NULL | - | - | - | - | Write-once supersession instant |

- U-V1 = UNIQUE(B, id).
- U-V2 = UNIQUE(B, quotation_id, id).
- U-V3 = UNIQUE(B, quotation_id, version_number).
- U-V4 = UNIQUE(B, quotation_id, previous_version_id). PostgreSQL's normal null semantics allow the first version; the root/number check and U-V3 permit only one version 1.
- U-V5 = partial UNIQUE(B, quotation_id) WHERE state = 'draft'.

Checks/guards: version_number > 0; edit_sequence >= 0; previous_version_id is null exactly when version_number = 1; previous_version_id <> id; previous version must be frozen and its successor number must be next in sequence. There is at most one successor per prior version, no branching.

state = draft exactly when shared_at is null. shared_by/time must agree. Supersession actor/time are set exactly when state is superseded. At commit the current pointer targets the last version in the unbranched chain, and every preceding version is superseded; it cannot target a superseded version. shared_at, not the literal state 'shared', is the permanent freeze indicator.

The draft has a candidate ordinal; sharing publishes that same ordinal without changing the row ID. A deleted never-shared quotation does not promise to preserve or reuse an external document number.

### 4.8 Explicit frozen document columns

These literal columns exist in **both quotation_versions and invoices**. "Q null?" describes quotation_versions; "I null?" describes invoices. No identity blob or live master-data rendering is permitted.

All columns below have no default, no PK/unique constraint, no FK and no dedicated index. Currency, state, precision and GST fields have the value/relationship checks described in sections 3 and 5; these checks do not introduce additional keys or indexes. A Q field marked conditional can be null in a draft, but must be nonnull before sharing.

| Column | PostgreSQL type | Q null? | I null? | Default / key / FK / index | Exact content and freeze rule |
|---|---|---|---|---|---|
| seller_display_name | text | Conditional | NN | None / none / none / none | Business name shown on the approved document |
| seller_contact_email | text | NULL | NULL | None / none / none / none | Email shown, or null if omitted |
| seller_contact_phone | text | NULL | NULL | None / none / none / none | Phone shown, or null if omitted |
| seller_postal_address | text | Conditional | NN | None / none / none / none | Exact business address shown; required before sharing |
| seller_country_code | text | Conditional | NN | None / none / none / none | Business country at share time; does not by itself determine tax |
| seller_state_code | text | Conditional | NN | None / none / none / none | Seller state used for the normal-case automatic GST suggestion |
| seller_gst_registered | boolean | Conditional | NN | None / none / none / none | Explicit seller declaration captured at share; no default |
| seller_gstin | text | NULL | NULL | None / none / none / none | Required when seller_gst_registered is true; copied exactly |
| seller_logo_asset_key | text | NULL | NULL | None / none / none / none | Exact immutable private object used for displayed logo, if configured |
| seller_logo_sha256 | bytea | NULL | NULL | None / none / none / none | 32-byte digest of frozen logo bytes, paired with key |
| seller_signature_asset_key | text | NULL | NULL | None / none / none / none | Exact immutable private object for owner-supplied authorized signature image |
| seller_signature_sha256 | bytea | NULL | NULL | None / none / none / none | 32-byte digest of frozen signature bytes, paired with key |
| buyer_display_name | text | Conditional | NN | None / none / none / none | Customer name shown on the approved document |
| buyer_contact_name | text | NULL | NULL | None / none / none / none | Named contact shown, or null |
| buyer_email | text | NULL | NULL | None / none / none / none | Email shown, or null |
| buyer_phone | text | NULL | NULL | None / none / none / none | Phone shown, or null |
| buyer_billing_address | text | Conditional | NN | None / none / none / none | Exact customer address shown; required before sharing |
| buyer_state_code | text | Conditional | NN | None / none / none / none | Buyer state actually used for the suggestion; not inferred from billing_address |
| buyer_gstin_applicable | boolean | Conditional | NN | None / none / none / none | Explicit owner-declared applicability on this document |
| buyer_gstin | text | NULL | NULL | None / none / none / none | Required when buyer_gstin_applicable is true; no live customer lookup |
| currency_code | text | Conditional | NN | None / none / none / none | CHECK = 'INR' when set; copied unchanged to invoice |
| currency_exponent | smallint | Conditional | NN | None / none / none / none | CHECK = 2 when set; amount interpretation is paise |
| quantity_scale | smallint | Conditional | NN | None / none / none / none | CHECK = 3 when set; the confirmed maximum quantity precision |
| calculation_rule_code | text | Conditional | NN | None / none / none / none | Identifier of the one approved, versioned calculation rule; no freeform executable rule or JSON |
| price_tax_mode | text | Conditional | NN | None / none / none / none | CHECK = 'exclusive' when set; supplied examples add GST to the base price |
| gst_auto_treatment | text | Conditional | NN | None / none / none / none | cgst_sgst if the two state codes match, otherwise igst; calculated from the frozen codes |
| gst_treatment_override | text | NULL | NULL | None / none / none / none | Owner-selected cgst_sgst or igst; null means no override, even when the auto suggestion exists |
| gst_treatment | text | Conditional | NN | None / none / none / none | Final cgst_sgst or igst; equals override when set, otherwise gst_auto_treatment |
| document_time_zone | text | Conditional | NN | None / none / none / none | IANA zone used for document dates/deadlines |
| place_of_supply_applicable | boolean | Conditional | NN | None / none / none / none | Explicit applicability choice; no inferred jurisdiction test |
| place_of_supply_state_code | text | NULL | NULL | None / none / none / none | Reviewed state of supply, required when applicability is true |
| place_of_supply_text | text | NULL | NULL | None / none / none / none | Optional additional location wording displayed with the supply state |
| reverse_charge_applies | boolean | Conditional | NN | None / none / none / none | Explicit yes/no indicator captured before sharing; display only, not an accounting mode |
| subtotal_minor | bigint | Conditional | NN | None / none / none / none | Sum of every rounded line base before GST, including exempt/no_gst lines |
| taxable_subtotal_minor | bigint | Conditional | NN | None / none / none / none | Sum of taxable_amount_minor; includes taxable 0% lines, excludes exempt/no_gst |
| cgst_total_minor | bigint | Conditional | NN | None / none / none / none | Sum of stored line CGST amounts |
| sgst_total_minor | bigint | Conditional | NN | None / none / none / none | Sum of stored line SGST amounts |
| igst_total_minor | bigint | Conditional | NN | None / none / none / none | Sum of stored line IGST amounts |
| gst_total_minor | bigint | Conditional | NN | None / none / none / none | cgst_total_minor + sgst_total_minor + igst_total_minor |
| total_minor | bigint | Conditional | NN | None / none / none / none | subtotal_minor + gst_total_minor, also sum of line_total_minor |
| seller_bank_name | text | NULL | NULL | None / none / none / none | Owner-selected remittance bank name, or omitted |
| seller_bank_account_name | text | NULL | NULL | None / none / none / none | Owner-selected account-holder name, or omitted |
| seller_bank_account_number | text | NULL | NULL | None / none / none / none | Exact account identifier included for payment, or omitted |
| seller_bank_ifsc | text | NULL | NULL | None / none / none / none | Exact routing text included for payment, or omitted |
| seller_upi_id | text | NULL | NULL | None / none / none / none | Owner-selected UPI address, or omitted |
| payment_instructions | text | NULL | NULL | None / none / none / none | Exact payment instructions chosen for this document |
| terms | text | NULL | NULL | None / none / none / none | Exact terms chosen/copied from business defaults; no live lookup |

Null optional fields mean **not shown**, never "look up today's customer record." Formatted addresses are display text; states, GSTINs, remittance fields and place of supply have separate columns. Sharing requires names, addresses, states, registration/applicability declarations and any conditionally required GSTINs. Phone/email, logo/signature and selected optional bank/UPI/terms data are preserved when included. This implements the requested particulars without inferring further mandatory legal fields.

When place_of_supply_applicable is true, require a reviewed place_of_supply_state_code; additional place_of_supply_text is optional. When false, both location columns are null. Do not infer legal applicability or equate place of supply with customer state automatically. The agreed GST auto-treatment continues to compare seller_state_code with buyer_state_code only; neither place-of-supply fields nor reverse_charge_applies silently change that rule. reverse_charge_applies must be explicitly true or false before sharing; it records/displays the choice without new accounting, tax-liability or balance equations.

All monetary totals are nonnegative. GST route values have CHECKs for the two allowed strings. At share/convert, validate the automatic state comparison and final-route equality; do not overwrite gst_auto_treatment when an override is chosen. A nonnull override records an intentional manual choice even if it equals the suggestion. Changing either state in a draft recalculates the suggestion; an existing override stays explicit and must be reviewed on the next share. No special place-of-supply, union-territory, reverse-charge or other jurisdiction rule is inferred from these codes or the override.

At share time, the owner reviews the exact identity/contact/address fields, asset versions, state codes, GSTINs, HSN/SAC, place of supply, reverse-charge indicator, selected payment instructions, tax categories, automatic/final treatment and calculations to be frozen. A later master edit never refreshes them. A revision starts by copying the frozen content and can be edited while still a draft. Invoice conversion copies the approved version's content exactly, including nulls and every GST component; it never refreshes identities, prices or rates from masters. This remains true when the catalog defaults or business/customer state have changed since approval.

calculation_rule_code must map to retained, versioned implementation/specification and approved examples. It is selected by the application, not entered by a customer. It does not replace the explicit inputs, precision and amounts.

### Frozen logo/signature references

Each asset key/hash pair is both null or both set, with a 32-byte SHA-256 digest. Keys identify private immutable objects under the same business namespace. Uploading a new logo/signature creates a new key; never overwrite an old object. Referenced bytes must remain available for historical documents. Do not delete old objects while any frozen version/invoice refers to them, and do not fall back to the current profile image if an object is unavailable. Retention can check these explicit key columns; no generic asset/PDF table is introduced.

The server generates/validates keys against the authorized business, validates the permitted image type, and verifies the digest before use. Never fetch arbitrary external URLs from document fields. Public page/image/PDF requests authorize the document token first and serve only the asset keys saved on that document; they cannot choose another business's asset or a caller-supplied object path. Keep object access private; no permanent public signature/logo bucket URL is implied.

An uploaded authorized-signature image is a visual document element supplied by the owner. It is not a cryptographic signature, identity verification or e-signing workflow. Both logo and signature bytes/keys are copied by reference unchanged from the approved version to the invoice. Reproducible content means retained frozen data/assets and the retained calculation rule, not a promise that every renderer produces byte-identical PDF files.

### 4.9 quotation_items

Includes the line-content columns in section 4.10.

| Column | PostgreSQL type | Null? | Default | PK / unique | FK | Index | Meaning |
|---|---|---|---|---|---|---|---|
| id | uuid | NN | gen_random_uuid() | PK; U-L1 part | - | PK; U-L1 | Line identity |
| business_id | uuid | NN | Authorized context | U-L1/U-L2 part | businesses.id | U-L1/U-L2 | Tenant |
| version_id | uuid | NN | - | U-L1/U-L2 part | (B, version_id) -> quotation_versions(B, id) | U-L1/U-L2 | Owning version |
| source_catalog_item_id | uuid | NULL | - | - | (B, source_catalog_item_id) -> catalog_items(B, id) | No extra index | Optional provenance; never live-rendered |
| position | integer | NN | - | U-L2 part | - | U-L2 | Positive order within version |

U-L1 = UNIQUE(B, version_id, id); U-L2 = UNIQUE(B, version_id, position). No per-item timestamps are needed: draft saves update the parent edit_sequence; the parent's share freezes every child.

### 4.10 Explicit line-content columns

The following columns exist in **quotation_items and invoice_items**. Nullability is explicit below; every default is absent; none is a PK, unique key, FK or separately indexed column. They are actual columns, not a JSON tax object.

| Column | PostgreSQL type | Null? | Default / key / FK / index | Meaning |
|---|---|---|---|---|
| description | text | NN | None / none / none / none | Complete product/service text shown on this line, including any displayed name |
| unit_label | text | NN | None / none / none / none | Exact displayed unit for the product/service line; must be supplied before persisting a complete line |
| hsn_sac | text | NULL | None / none / none / none | Applicable HSN/SAC copied/edited on the draft line; preserve text/leading zeroes, no fixed digit-length check |
| quantity | numeric(18,6) | NN | None / none / none / none | Positive finite quantity within the document's selected quantity_scale |
| unit_price_minor | bigint | NN | None / none / none / none | Nonnegative INR price in paise before GST |
| line_subtotal_minor | bigint | NN | None / none / none / none | quantity x unit_price_minor rounded to whole paise under section 5 |
| gst_category | text | NN | None / none / none / none | taxable, exempt or no_gst; actual document-line choice |
| gst_treatment | text | NN | None / none / none / none | cgst_sgst or igst for taxable lines, matching parent final treatment; none for exempt/no_gst |
| gst_rate | numeric | NULL | None / none / none / none | Actual finite 0..100 percentage; selectable-list check only on new/edited draft content and sharing; exempt/no_gst require null |
| taxable_amount_minor | bigint | NN | None / none / none / none | line_subtotal_minor for taxable lines; 0 for exempt/no_gst; never hides the latter's line value |
| cgst_rate | numeric | NULL | None / none / none / none | gst_rate / 2 when taxable and cgst_sgst; otherwise null |
| cgst_amount_minor | bigint | NN | None / none / none / none | Rounded CGST in paise; 0 when component inapplicable |
| sgst_rate | numeric | NULL | None / none / none / none | gst_rate / 2 when taxable and cgst_sgst; otherwise null |
| sgst_amount_minor | bigint | NN | None / none / none / none | Rounded SGST in paise; 0 when component inapplicable |
| igst_rate | numeric | NULL | None / none / none / none | gst_rate when taxable and igst; otherwise null |
| igst_amount_minor | bigint | NN | None / none / none / none | Rounded IGST in paise; 0 when component inapplicable |
| line_total_minor | bigint | NN | None / none / none / none | line_subtotal_minor + cgst_amount_minor + sgst_amount_minor + igst_amount_minor |

Row CHECKs enumerate category/treatment, bound rates numerically without listing legal percentages, and enforce the applicable/null component combinations, nonnegative amounts and total equation in section 5. Parent-route agreement and aggregate totals require transaction guards. The complete input and output fields allow replay without current catalog/settings data.

Empty drafts may have zero lines and null document totals. Persisted lines must be complete and valid; incomplete UI form rows are not stored. Saving lines requires the draft's state/route, INR units, quantity scale and calculation rule to be configured. Sharing requires at least one line and validated totals. The existing storage model permits a zero-value line or total; payments are always positive. Explicit taxable 0%, exempt and no_gst choices must never be represented by missing setup or a guessed zero rate.

All item INSERT/UPDATE/DELETE operations lock/check the owning quotation and version. They are rejected whenever shared_at is set, even if the version later becomes approved or superseded.

### 4.11 quotation_public_links

| Column | PostgreSQL type | Null? | Default | PK / unique | FK | Index | Meaning |
|---|---|---|---|---|---|---|---|
| id | uuid | NN | gen_random_uuid() | PK; U-T1 part | - | PK; U-T1 | Link identity |
| business_id | uuid | NN | Authorized context | U-T1/U-T3/U-T4 part | businesses.id | U-T1/U-T3/U-T4 | Tenant |
| quotation_id | uuid | NN | - | U-T1/U-T3 part | Through version FK | U-T1/U-T3 | Stable quote |
| version_id | uuid | NN | - | U-T1 part | (B, quotation_id, version_id) -> quotation_versions(B, quotation_id, id) | U-T1 | Exactly one frozen version |
| token_hash | bytea | NN | Trusted token generation | U-T2 | - | U-T2 | SHA-256 digest of 32 random token bytes; CHECK octet_length = 32 |
| creation_request_key | uuid | NN | - | U-T4 part | - | U-T4 | Stable nonsecret key supplied for one share/rotation attempt; never reused for a different target or expiry |
| access_expires_at | timestamptz | NULL | - | - | - | - | Optional link access cutoff; null means no automatic access expiry |
| created_by | uuid | NN | Command actor | - | Owner actor | - | Share/rotation actor |
| created_at | timestamptz | NN | clock_timestamp() | - | - | - | Link creation |
| revoked_by | uuid | NULL | - | - | Owner actor | - | Revocation actor |
| revoked_at | timestamptz | NULL | - | - | - | U-T3 predicate | One-way revocation marker |
| revocation_reason | text | NULL | - | - | - | - | CHECK IN ('revision_shared', 'owner_revoked', 'rotated') when revoked |

U-T1 = UNIQUE(B, quotation_id, version_id, id); U-T2 = UNIQUE(token_hash); U-T3 = partial UNIQUE(B, quotation_id) WHERE revoked_at IS NULL; U-T4 = UNIQUE(B, creation_request_key).

At most one non-revoked link exists per quote, including an expired one until explicitly revoked. Revocation actor/time/reason are all null or all set and cannot be cleared or edited. access_expires_at, if present, must be later than creation and is immutable; change it through rotation. Content, creation_request_key and token hash never update. Access expiry and quote response expiry are different concepts.

Rotation adds a link for the same frozen current version and revokes the prior link. It is the minimal recovery path for a lost raw URL; it does not create a quotation revision or reset a response. Old link rows remain for response evidence. Manual revocation may target any retained link belonging to the quotation, including an old read-only link while a revision draft is current.

### 4.12 quotation_responses

| Column | PostgreSQL type | Null? | Default | PK / unique | FK | Index | Meaning |
|---|---|---|---|---|---|---|---|
| id | uuid | NN | gen_random_uuid() | PK; U-R2 part | - | PK; U-R2 | Response identity |
| business_id | uuid | NN | Resolved from token | U-R1/U-R2 part | businesses.id | U-R1/U-R2 | Never accepted as public authorization input |
| quotation_id | uuid | NN | Resolved from token | - | Through version/link FKs | - | Owning quote |
| version_id | uuid | NN | Resolved from token | U-R1/U-R2 part | (B, quotation_id, version_id) -> quotation_versions(B, quotation_id, id) | U-R1/U-R2 | Exact frozen version |
| public_link_id | uuid | NN | Resolved from token | - | (B, quotation_id, version_id, public_link_id) -> quotation_public_links(B, quotation_id, version_id, id) | X-R1 | Exact link used |
| kind | text | NN | - | - | - | - | CHECK IN ('approved', 'change_requested') |
| customer_note | text | NULL | - | - | - | - | Customer's submitted note, not private owner notes |
| respondent_name | text | NULL | - | - | - | - | Optional self-entered name; unverified, not a signature |
| responded_at | timestamptz | NN | clock_timestamp() after lock | - | - | - | Server-recorded response instant |

U-R1 = UNIQUE(B, version_id); U-R2 = UNIQUE(B, version_id, id). One terminal response per version. No created_by user: the responder has no account. No IP address, device fingerprint or verified customer-signature identity is collected. The seller's displayed signature image is a separate frozen document element.

A repeated identical submission for the same access-valid link/current version returns the stored response, even after the response deadline. Identical retry also requires the stored public_link_id to match the presented link. A different action/note/name conflicts; it never changes the first response. A rotated link may read the already-recorded outcome, but a new submission through it returns already-responded and never creates or reattributes evidence. Revoked, access-expired or superseded links fail before any response lookup is returned, including retries. Only a new response requires state = shared and an unpassed response deadline.

### 4.13 invoices

Includes all document-content columns in section 4.8 with the invoice nullability. Issuance happens during conversion; there is no invoice draft, edit, cancellation or credit workflow. Exact copy refers to those commercial/document-content columns and source lines. Invoice identity/number, issue time/date, source references, creator and optional due date are invoice-specific issuance metadata, assigned once; the quotation cannot already possess its future invoice number or issue timestamp.

**Confirmed override boundary:** the invoice retains the GST choice made on its approved source quotation, including any catalog-rate or automatic-route override. To change GST before conversion, create/edit a quotation revision and obtain approval of that revision. Conversion accepts no independent tax override. After issuance neither invoice content nor GST can be edited; post-issue correction remains outside this prototype's scope.

| Column | PostgreSQL type | Null? | Default | PK / unique | FK | Index | Meaning |
|---|---|---|---|---|---|---|---|
| id | uuid | NN | gen_random_uuid() | PK; U-I1/U-I3 part | - | PK; U-I1/U-I3 | Invoice identity |
| business_id | uuid | NN | Authorized context | U-I1..U-I5 part | businesses.id | U-I1..U-I5; X-I1/X-I2 | Tenant |
| quotation_id | uuid | NN | - | U-I2 part | Through same-customer quotation FK | U-I2 | At most one invoice for this quote |
| customer_id | uuid | NN | Copied from quotation | - | (B, quotation_id, customer_id) -> quotations(B, id, customer_id) | X-I2 | Proves exact same customer, not merely another customer in the same business |
| source_version_id | uuid | NN | Current approved version | U-I3 part | (B, quotation_id, source_version_id) -> quotation_versions(B, quotation_id, id) | X-I3 | Exact source document |
| approved_response_id | uuid | NN | Source approval | - | (B, source_version_id, approved_response_id) -> quotation_responses(B, version_id, id) | No extra index | Exact response; insertion guard additionally requires kind = approved |
| numbering_period | text | NN | Selected configured period | U-I4/U-I5 part | (B, numbering_period) -> invoice_number_sequences(B, period_key) | U-I4/U-I5 | Immutable financial-year/numbering context |
| sequence_number | bigint | NN | Transactional allocation | U-I5 part | - | U-I5 | Positive sequential value within business/period |
| reference | text | NN | Rendered during allocation | U-I4 part | - | U-I4 | Displayed invoice number from period settings; stored permanently, never re-rendered from current settings |
| issued_at | timestamptz | NN | Command clock after locks | - | - | X-I1/X-I2 | Immutable system issuance instant; captured once |
| invoice_date | date | NN | Derived at issuance | - | - | - | Local date of issued_at in the frozen document_time_zone; persisted and immutable |
| due_on | date | NULL | - | - | - | - | Explicit optional due date; no invented credit period |
| created_by | uuid | NN | Command actor | - | Owner actor | - | Conversion actor |

U-I1 = UNIQUE(B, id); U-I2 = UNIQUE(B, quotation_id); U-I3 = UNIQUE(B, id, source_version_id); U-I4 = UNIQUE(B, numbering_period, reference); U-I5 = UNIQUE(B, numbering_period, sequence_number). The period FK references the composite PK in section 4.19.

No editable amount, cached balance, payment status or stored "converted" flag. invoice_date must equal the date of issued_at in the captured document_time_zone and fall within the numbering period. due_on, if present, cannot precede invoice_date. There is no independent backdating input or invented credit period. Store the date at issue; later timezone/profile/library changes never recalculate historical invoice dates. All invoice fields, including number and period, are immutable.

### 4.14 invoice_items

Includes all line-content columns in section 4.10, copied byte-for-byte/value-for-value from the source quotation item, including HSN/SAC, unit and every actual GST input/component.

| Column | PostgreSQL type | Null? | Default | PK / unique | FK | Index | Meaning |
|---|---|---|---|---|---|---|---|
| id | uuid | NN | gen_random_uuid() | PK | - | PK | Invoice line identity |
| business_id | uuid | NN | Authorized context | U-N1/U-N2 part | businesses.id | U-N1/U-N2 | Tenant |
| invoice_id | uuid | NN | Created invoice | U-N1/U-N2 part | (B, invoice_id, source_version_id) -> invoices(B, id, source_version_id) | U-N1/U-N2 | Parent invoice and its exact source version |
| source_version_id | uuid | NN | From invoice | - | Through invoice/source item FKs | X-N1 | Required redundancy to prevent cross-version line copying |
| source_quotation_item_id | uuid | NN | Source item | U-N2 part | (B, source_version_id, source_quotation_item_id) -> quotation_items(B, version_id, id) | X-N1 | Exact line within that source version |
| position | integer | NN | Copied from source | U-N1 part | - | U-N1 | Original ordering |

U-N1 = UNIQUE(B, invoice_id, position); U-N2 = UNIQUE(B, invoice_id, source_quotation_item_id). Conversion requires the same set of source item IDs, positions and values, not just matching counts. No later insert/update/delete is allowed.

### 4.15 payments

Only confirmed payments are stored. There is no pending-payment row or payment gateway status.

| Column | PostgreSQL type | Null? | Default | PK / unique | FK | Index | Meaning |
|---|---|---|---|---|---|---|---|
| id | uuid | NN | gen_random_uuid() | PK; U-P1 part | - | PK; U-P1 | Payment identity |
| business_id | uuid | NN | Authorized context | U-P1/U-P2/U-P3 part | businesses.id | U-P1/U-P2/U-P3; X-P1 | Tenant |
| invoice_id | uuid | NN | - | U-P1 part | (B, invoice_id) -> invoices(B, id) | U-P1 | Required existing invoice; no split/unallocated payment |
| amount_minor | bigint | NN | - | - | - | - | CHECK > 0; complete payment amount |
| currency_code | text | NN | Copied from invoice | - | - | - | Must equal invoice currency |
| currency_exponent | smallint | NN | Copied from invoice | - | - | - | Must equal invoice exponent |
| received_at | timestamptz | NN | - | - | - | X-P1 | Actual owner-entered receipt time; post-invoice only under selected prototype rule |
| method | text | NN | - | - | - | - | Plain payment method description; no gateway or bank-account credentials |
| external_reference | text | NULL | - | - | - | - | Optional transfer/reference text; not globally unique |
| request_key | uuid | NN | Supplied stable command key | U-P2 part | - | U-P2 | Reused for retries of the same submission |
| replaces_payment_id | uuid | NULL | - | U-P3 part | (B, invoice_id, replaces_payment_id) -> payments(B, invoice_id, id) | U-P3 | Optional reversed predecessor on this same invoice |
| created_by | uuid | NN | Command actor | - | Owner actor | - | Recorder |
| recorded_at | timestamptz | NN | clock_timestamp() | - | - | - | System confirmation time |

U-P1 = UNIQUE(B, invoice_id, id); U-P2 = UNIQUE(B, request_key); U-P3 = UNIQUE(B, replaces_payment_id), allowing multiple nulls.

Guards: currency/exponent exactly match invoice and are INR/2; received_at is not before invoice.issued_at and is not in the future at recording; amount does not exceed outstanding balance checked under the invoice advisory lock. B6 is final: effective paid after insertion must not exceed invoice.total_minor. A predecessor must already exist, be reversed, differ from the new ID and have no replacement. Parent/currency/amount/timestamps/method/reference and replacement relation are all immutable.

**Wrong-invoice correction is two separate operations:** the original payment is reversed on its original invoice, then a completely new ordinary payment may be recorded on a different invoice in the same authorized business. The new payment has a new request_key, replaces_payment_id = null, and its new receipt has replaces_receipt_id = null. Its invoice_id does not have to equal the reversed payment's invoice_id. No cross-invoice replacement FK or allocation is created.

The guided UI is: **reason -> reverse original payment -> open record-payment form -> prefill amount/date -> choose correct invoice -> record new payment**. Confirm the reversal commit before opening the next step. Prefill is editable convenience, not persisted correction linkage: revalidate amount, receipt date, target invoice ownership, post-invoice timing and outstanding balance. An invalid prefilled date/amount must be explained rather than silently changed. If the user cancels or the new payment fails, the committed reversal remains; do not silently restore the original payment. Retry the new recording with its own stable request key.

replaces_payment_id remains solely for a same-invoice replacement of a reversed predecessor, enforced by the composite FK (B, invoice_id, replaces_payment_id). That command must reject a cross-invoice predecessor; the guided flow above calls ordinary Record payment instead. Both invoice histories retain their separate payment/reversal/receipt records; no new cross-invoice correction table, JSON linkage or combined transaction is introduced.

### 4.16 payment_reversals

| Column | PostgreSQL type | Null? | Default | PK / unique | FK | Index | Meaning |
|---|---|---|---|---|---|---|---|
| id | uuid | NN | gen_random_uuid() | PK | - | PK | Reversal identity |
| business_id | uuid | NN | Authorized context | U-X1 part | businesses.id | U-X1 | Tenant |
| invoice_id | uuid | NN | From original payment | - | Through exact payment FK | - | Same invoice |
| payment_id | uuid | NN | - | U-X1 part | (B, invoice_id, payment_id) -> payments(B, invoice_id, id) | U-X1 | Exactly the payment being corrected |
| reason | text | NN | - | - | - | - | Nonempty explanation of the recording error/correction |
| reversed_by | uuid | NN | Command actor | - | Owner actor | - | Correction actor |
| reversed_at | timestamptz | NN | clock_timestamp() | - | - | - | Full reversal time, not before recorded_at |

U-X1 = UNIQUE(B, payment_id). A reversal cancels the original recorded payment's entire effect. It does not represent returning money to a customer, and has no independent amount/currency to disagree with the payment. No update/delete, partial reversal or reversal-of-reversal operation exists.

### 4.17 receipts

| Column | PostgreSQL type | Null? | Default | PK / unique | FK | Index | Meaning |
|---|---|---|---|---|---|---|---|
| id | uuid | NN | gen_random_uuid() | PK; U-E3 part | - | PK; U-E3 | Receipt identity |
| business_id | uuid | NN | Authorized context | U-E1..U-E4 part | businesses.id | U-E1..U-E4 | Tenant |
| invoice_id | uuid | NN | From payment | U-E3 part | Through exact payment FK | U-E3 | Same invoice |
| payment_id | uuid | NN | From payment | U-E1 part | (B, invoice_id, payment_id) -> payments(B, invoice_id, id) | U-E1 | Exactly one receipt ever for this payment |
| reference | text | NN | Command-generated | U-E2 part | - | U-E2 | RCP- plus full UUID application reference, not a statutory sequence |
| amount_minor | bigint | NN | Copied from payment | - | - | - | Must equal whole payment amount |
| currency_code | text | NN | Copied from payment | - | - | - | Frozen receipt currency |
| currency_exponent | smallint | NN | Copied from payment | - | - | - | Frozen receipt minor-unit precision |
| replaces_receipt_id | uuid | NULL | - | U-E4 part | (B, invoice_id, replaces_receipt_id) -> receipts(B, invoice_id, id) | U-E4 | Receipt belonging to replaced payment, or null for an ordinary payment |
| issued_by | uuid | NN | Command actor | - | Owner actor | - | Same recorder as its payment |
| issued_at | timestamptz | NN | clock_timestamp() | - | - | - | Issue time, not before payment.recorded_at |

U-E1 = UNIQUE(B, payment_id); U-E2 = UNIQUE(B, reference); U-E3 = UNIQUE(B, invoice_id, id); U-E4 = UNIQUE(B, replaces_receipt_id), allowing multiple nulls.

The command enforces exact amount/currency/exponent equality to the payment and exact predecessor-receipt equality to payments.replaces_payment_id. Both predecessor links must be null together or identify the matching old payment/receipt pair. They cannot point to themselves.

Seller/customer identity and terms on a receipt, if displayed, come only from the **immutable invoice columns**; method, reference and received time come only from the immutable payment. This preserves receipt content without copying all identity columns a third time or reading live masters.

There is no receipt.status or mutable void field. An associated payment_reversals row makes the receipt void and supplies the reason/actor/time. The replacement can be found by reverse lookup of replaces_receipt_id; the old receipt is never edited to point forward.

### 4.18 invoice_public_links

This is access-control metadata required by the customer invoice page/PDF decision, not a PDF-storage table. It parallels quotation link handling without mixing token scopes or changing immutable invoice rows.

| Column | PostgreSQL type | Null? | Default | PK / unique | FK | Index | Meaning |
|---|---|---|---|---|---|---|---|
| id | uuid | NN | gen_random_uuid() | PK | - | PK | Invoice access-link identity |
| business_id | uuid | NN | Authorized context | U-J2/U-J3 part | businesses.id | U-J2/U-J3 | Tenant |
| invoice_id | uuid | NN | - | U-J2 part | (B, invoice_id) -> invoices(B, id), U-I1 | U-J2; X-J1 | Exactly one issued invoice |
| token_hash | bytea | NN | Trusted token generation | U-J1 | - | U-J1 | SHA-256 of 32 random bytes; CHECK octet_length = 32 |
| creation_request_key | uuid | NN | - | U-J3 part | - | U-J3 | Stable nonsecret key for one explicit create/rotate attempt |
| access_expires_at | timestamptz | NULL | - | - | - | - | Optional access cutoff; if set, later than created_at |
| created_by | uuid | NN | Command actor | - | Owner actor | - | Owner who shared/rotated the invoice link |
| created_at | timestamptz | NN | clock_timestamp() | - | - | - | Link creation time |
| revoked_by | uuid | NULL | - | - | Owner actor | - | Revocation actor |
| revoked_at | timestamptz | NULL | - | - | - | U-J2 predicate | One-way revocation time |
| revocation_reason | text | NULL | - | - | - | - | CHECK IN ('owner_revoked', 'rotated') when revoked |

U-J1 = UNIQUE(token_hash); U-J2 = partial UNIQUE(B, invoice_id) WHERE revoked_at IS NULL; U-J3 = UNIQUE(B, creation_request_key). Revocation actor/time/reason are all absent or set together; once set they cannot change. All other columns are immutable. Rows cannot be deleted. At most one unrevoked link per invoice; rotation revokes it before inserting the replacement. An invoice can exist with no link until the owner chooses Share invoice.

The raw URL is returned once after creation/commit and shared manually. Same request key and normalized invoice/expiry return the recorded result, not a recoverable raw secret; different input conflicts. Lost URLs require explicit rotation with a new key, exactly as for quotation links. Quote and invoice tokens use separate route namespaces and separate lookup tables; an invoice endpoint never searches quotation_public_links. The invoice token authorizes only this invoice's frozen page/PDF, not quotations, payments, receipts or other customer records.

### 4.19 invoice_number_sequences

A small **invoice-only allocation table**, not a generic document-counter framework or a PostgreSQL SEQUENCE object. One row configures one business's numbering period, including its financial-year context. No additional settings/period/counter tables are needed.

| Column | PostgreSQL type | Null? | Default | PK / unique | FK | Index | Meaning |
|---|---|---|---|---|---|---|---|
| business_id | uuid | NN | Authorized context | PK part | businesses.id | PK | Owner business |
| period_key | text | NN | Owner configuration | PK part | - | PK | Explicit financial-year/period label used in invoice context and optional number rendering |
| starts_on | date | NN | Owner configuration | - | - | - | Inclusive start in the invoice's captured document-date semantics |
| ends_before | date | NN | Owner configuration | - | - | - | Exclusive end; CHECK ends_before > starts_on |
| prefix | text | NN | '' | - | - | - | Configurable prefix; empty is permitted |
| format_template | text | NN | Owner configuration | - | - | - | Validated display template using literal separators and allowed placeholders {prefix}, {period}, {number}; number required exactly once |
| minimum_digits | smallint | NN | 1 | - | - | - | CHECK 1..19; minimum zero-padding for the positive bigint number, never truncate larger values |
| starting_number | bigint | NN | Owner configuration | - | - | - | CHECK > 0; first allocated number for this period |
| last_issued_number | bigint | NULL | - | - | - | - | Null before first issue; otherwise the last committed allocation; at least starting_number |
| created_by | uuid | NN | Command actor | - | Owner actor | - | Configuration creator |
| created_at | timestamptz | NN | clock_timestamp() | - | - | - | Configuration creation |
| updated_at | timestamptz | NN | clock_timestamp() | - | - | - | Last permitted settings change or allocation |

PK = (business_id, period_key). Format validation is a fixed text formatter, never SQL, executable code or an arbitrary template engine. The owner selects actual prefix, start value, date range and visual format during setup. Do not hard-code an April boundary, a statutory format, a reset obligation or a fixed separator. For illustration only, templates {prefix}/{period}/{number} and {prefix}-{number} are both possible. Numbers may repeat in different configured periods; lookup and uniqueness always include business and period.

Only one configured period may cover a given date per business. The configure command holds the exclusive business advisory lock while checking non-overlapping [starts_on, ends_before) ranges; conversion holds its shared form. This prevents conflicting setup without adding a generic calendar table or a new indexing extension. A missing applicable period causes a setup error, never a fallback to UUID invoice numbering or an automatic invented period.

Configuration fields may be edited only before the first invoice uses the row. After first issue, period/date range/prefix/template/padding/start are immutable. business_id, period_key and creation fields never change. Only the allocator may advance last_issued_number and updated_at; the owner cannot set, rewind or reset the cursor directly. No runtime deletion, reuse of a committed number or renumbering is supported.

**Conversion allocation, one transaction:**

1. Take the shared business advisory lock, then the quotation row lock. Authorize and return an existing invoice first; an idempotent retry allocates no number.
2. Validate the current approved snapshot. Resolve the configured period and lock its row FOR UPDATE. Capture issued_at once after waiting; derive invoice_date from that timestamp and the frozen document_time_zone. Recheck that this date is in the selected period; if midnight/period rollover made it stale, abort and retry with the applicable configured period.
3. Candidate = starting_number when last_issued_number is null, otherwise last_issued_number + 1. Reject exhaustion rather than overflowing bigint. Render reference with the locked immutable settings and write the new cursor plus invoice number/period/date, invoice and copied items atomically.
4. At commit the allocated number must correspond to the new invoice in that same business/period, and the cursor equals the greatest issued sequence_number there. Row/command guards require exactly the next value; no standalone reservation endpoint is exposed. U-I4 and U-I5 additionally reject duplicate rendered/numeric values.
5. Any failure rolls back invoice/items and cursor together. Return the number only after commit. Concurrent conversions of different quotes serialize on this one period row; the second reads the advanced cursor. Same-quote retries return the original invoice. No gap-free statutory guarantee is asserted.

Example for verification: with starting_number = 100 and no issued invoices, two successful concurrent conversions receive numeric values 100 and 101 in lock-acquisition order. Retrying the first conversion returns 100 and leaves the cursor at 101. If an allocation transaction aborts before commit, it creates neither an invoice nor a committed cursor advance. Render each value with the configured template/padding; these numeric examples do not impose a visual format.

The executor has owner-scoped SELECT/UPDATE for this row; public brokers have none. This makes the row lock compatible with the privilege model. Transactional row allocation is deliberate: PostgreSQL SEQUENCE nextval values are not rolled back on abort. [PostgreSQL row locking](https://www.postgresql.org/docs/17/explicit-locking.html), [PostgreSQL sequence behavior](https://www.postgresql.org/docs/17/functions-sequence.html)

### 4.20 gst_rate_options (global application configuration)

One tiny database-backed application configuration list allows operator changes through data updates, without schema migrations or application redeployment. No rate engine, effective-date scheduler, classification hierarchy or government integration is added.

| Column | PostgreSQL type | Null? | Default | PK / unique | FK | Index | Meaning |
|---|---|---|---|---|---|---|---|
| rate | numeric | NN | - | PK | - | PK | Exact total GST percentage; finite, technical range 0..100 |
| selectable | boolean | NN | true | - | - | - | Whether new/changed draft content may choose this total rate |

No business_id: this is global, nonsecret application configuration controlled by the application operator, never by a tenant or customer. authenticated and webameen_executor may SELECT; all runtime INSERT/UPDATE/DELETE grants and policies are absent. Enable/FORCE RLS with role-specific read policy USING true; anonymous/public brokers get no access. Operator maintenance uses trusted administrative access, not an owner-facing rate-settings UI. Do not let a browser, user metadata or RPC argument supply its own allowed-rate list.

The initial selectable set must be supplied through an approved operational configuration step; **this specification supplies no legal list or automatic seed values**. Add/retire/replace options without a database migration. Retire by setting selectable = false; deleting a configuration row must also be safe for historical documents because no snapshot/default FK references it. Total/component percentages already stored remain valid under their numeric/category/arithmetic invariants. No rate-value update, option deletion or retirement cascades into catalog defaults or documents.

Rate configuration mutation takes an exclusive transaction advisory lock in a single global GST-configuration namespace. Commands that validate new selectable rates take its shared form **before** business/quotation locks, then read the live configuration within the transaction. This prevents a retirement racing share-time validation without granting runtime UPDATE on the configuration table just to acquire a row lock. The operator maintenance procedure/guard must enforce the exclusive lock for every configuration write. Publish a batch change atomically. Public reads, approval and exact-copy invoice conversion do not take this lock or validate against today's options.

## 5. Basic GST calculation and snapshot rules

### 5.1 Selected scope and automatic/manual treatment

The supplied examples use prices **before GST**. price_tax_mode is therefore fixed to exclusive for this prototype; inclusive-price entry, discounts, extra charges, cess, compound taxes and document-level adjustments are not introduced. Adding GST is a decided requirement, not a conditional future feature.

Use the seller_state_code and buyer_state_code copied into the document: matching codes produce gst_auto_treatment = cgst_sgst; different codes produce igst. The business may explicitly select either route in gst_treatment_override; gst_treatment is the override when present, otherwise the automatic result. Never change the stored automatic result to disguise an override. Both states are required before sharing, even with an override.

This comparison implements the agreed normal case only. It does not determine legal place of supply or handle special jurisdictions/registrations. Manual selection preserves what the owner used; it is not an automatic compliance check. No additional statutory treatment is inferred.

The place-of-supply fields remain explicit reviewed inputs. The seller/customer state comparison is only the normal-case suggestion; preserve the automatic suggestion and manual override separately and do not claim to implement all Indian place-of-supply rules.

Each taxable line copies the document's final route. Catalog defaults supply only its initial category/rate. The owner can change either on a quotation draft, including a revision; a resulting invoice retains the approved override exactly. Shared/issued lines never re-read current defaults.

### 5.2 Categories, rates and component constraints

| Line case | taxable_amount_minor | Total GST rate | Component rates | Component amounts |
|---|---|---|---|---|
| taxable + cgst_sgst | line_subtotal_minor | Actual stored finite 0..100 rate | cgst_rate = sgst_rate = gst_rate / 2; igst_rate null | Calculate/round CGST and SGST separately; IGST amount = 0 |
| taxable + igst | line_subtotal_minor | Actual stored finite 0..100 rate | igst_rate = gst_rate; cgst_rate/sgst_rate null | Calculate/round IGST; CGST and SGST amounts = 0 |
| exempt | 0 | gst_rate null | All component rates null; gst_treatment = none | All GST component amounts = 0; full line base still contributes to subtotal |
| no_gst | 0 | gst_rate null | All component rates null; gst_treatment = none | All GST component amounts = 0; full line base still contributes to subtotal |

For taxable 0%, applicable rates are explicitly zero, inapplicable rates are null, and amounts are zero. It remains a taxable-category line and is not silently relabelled exempt, no_gst or legally "zero-rated." Exempt and no_gst remain distinct user choices even though the arithmetic is the same. Missing classification is a validation error, not a zero-tax default.

Category/rate applicability is row-local. Matching the taxable line route to its parent, verifying calculation inputs/results and matching document sums require the guarded transaction. There is no GST-rate history table: each frozen line contains its own actual rates and values.

### 5.3 Confirmed paise rounding and calculation order

The owner expressly confirmed: **round each line base and each applicable GST component to the nearest paise, with half-paise rounded up, then sum the rounded amounts.** This is the project's calculation contract; it is not a statement of statutory rounding requirements.

Use exact integer/fixed-decimal arithmetic throughout. For a nonnegative exact value x expressed in paise, R(x) = floor(x + 0.5). Retain the versioned rule identifier in-gst-exclusive-line-paise-half-up-v1. Reject out-of-range results before converting to bigint. Never pass intermediate money through JavaScript Number or a binary floating-point database type.

1. Validate positive finite quantity against the document's fixed quantity_scale = 3; reject excess precision before storage rather than silently rounding entered quantity. Unit price is nonnegative integer paise.
2. line_subtotal_minor = R(quantity x unit_price_minor).
3. For taxable lines, taxable_amount_minor = line_subtotal_minor. Set the component rates from section 5.2. Each applicable component_amount_minor = R(taxable_amount_minor x component_rate / 100). Calculate both CGST and SGST from the same base; neither taxes the other. For exempt/no_gst, the taxable amount and all tax amounts are zero.
4. line_total_minor = line_subtotal_minor + cgst_amount_minor + sgst_amount_minor + igst_amount_minor.
5. subtotal_minor and taxable_subtotal_minor are their corresponding line sums. Each document component total is the sum of its already-rounded line amounts. gst_total_minor is the three component totals' sum; total_minor = subtotal_minor + gst_total_minor = sum(line_total_minor).
6. No second document-level tax calculation, rounding to whole rupees, balancing adjustment or hidden remainder redistribution is applied. Display the stored paise to two decimal places. Mixed rates are grouped for display by their saved category/route/rates and their stored amounts are summed, never recalculated from a grouped base.

One authoritative server-side calculation contract supplies draft previews/saves and share-time validation through the existing application/database boundary. Public pages/PDFs render the saved snapshot; conversion copies it and verifies equality. They must not implement a different rounding path. quantity_scale = 3 is finalized: quantities such as 1, 1.5 and 1.234 are valid; 1.2345 is rejected before the calculation or numeric(18,6) assignment. Monetary rounding is unchanged.

### 5.4 Worked examples and rounding edge

All values below are rupees for readability; storage uses paise. The example rates are arithmetic fixtures from the agreed examples, **not a declaration of currently lawful/selectable GST rates**. Operator-supplied configuration determines new choices; examples remain useful historical calculation tests even when an option is retired.

| Example | Base | CGST | SGST | IGST | Total |
|---|---|---|---|---|---|
| Same-state, taxable 18% | ₹10,000.00 | 9% = ₹900.00 | 9% = ₹900.00 | Not applicable | ₹11,800.00 |
| Different-state, taxable 18% | ₹10,000.00 | Not applicable | Not applicable | 18% = ₹1,800.00 | ₹11,800.00 |
| Same-state but manual igst override | ₹10,000.00 | Not applicable | Not applicable | 18% = ₹1,800.00 | ₹11,800.00 |
| Taxable 0%, cgst_sgst route | ₹10,000.00 | 0% = ₹0.00 | 0% = ₹0.00 | Not applicable | ₹10,000.00 |
| Exempt or no_gst, separate categories | ₹10,000.00 | Not applicable | Not applicable | Not applicable | ₹10,000.00 |
| Half-paise component: same-state 5% | ₹0.20 | 2.5%: ₹0.005 rounds to ₹0.01 | 2.5%: ₹0.005 rounds to ₹0.01 | Not applicable | ₹0.22 |
| Same tiny base, different-state 5% | ₹0.20 | Not applicable | Not applicable | 5% = ₹0.01 | ₹0.21 |

The last two rows deliberately show that independently rounded components can differ by one paise from a single-component route. Preserve those results under the confirmed rule; do not change one component merely to force equality with a separately rounded aggregate GST value. A quantity extension of 1.5 x ₹0.01 likewise rounds its base from ₹0.015 to ₹0.02, which is valid under the finalized three-decimal quantity limit.

The requested invoice particulars, conditional GSTIN capture, HSN/SAC snapshots and numbering mechanism are specified; they are no longer open schema decisions. Actual item classifications and business configuration are owner-supplied inputs. There is no inferred discount mechanism, exemption eligibility or full GST-compliance claim.

**Reverse-charge boundary:** reverse_charge_applies is stored/displayed as requested and must not change GST calculations in this first version. It does not remove/add tax components, change which party owes them, alter total_minor, or change payment/overpayment equations. No reverse-charge accounting engine, liability ledger or alternate calculation mode is introduced.

When selected, the owner UI must clearly show this exact warning in the document editor, sharing review and conversion/issue review:

> Reverse-charge calculation is not supported in this version. Confirm the tax treatment with your accountant before issuing this document.

The warning does not automatically modify tax inputs or block issuance by itself. Stored/PDF content shows the indicator; the owner remains responsible for reviewing the selected treatment. Do not add a warning-acknowledgement table or imply that dismissing the warning proves compliance.

### 5.5 Current rate choices versus historical rates

| Operation | Selectable-rate behavior |
|---|---|
| Create/change a taxable catalog default | Require an active configured total rate; show options from the server, reject an arbitrary client-supplied rate |
| Add/edit a draft line | Require an active configured rate; a retired copied catalog default must be explicitly replaced |
| Existing draft after configuration changes | Keep stored values, display a clear retired-rate warning; do not silently change rates or amounts |
| Create a revision | Copy historical values unchanged into the editable draft, even if a copied rate is now retired; mark those lines for review rather than rewriting history |
| Save edited draft / share draft | Recheck all taxable lines against the current selectable set under the configuration lock; list invalid lines for correction; share cannot freeze a retired choice |
| Read/PDF/respond to an already frozen quotation | Use its stored rates and arithmetic; do not reject or recalculate it because configuration changed |
| Convert an approved frozen quotation | Copy its exact historical rates/amounts, even if absent/inactive in current options; do not choose a replacement rate automatically |
| Retry an already-completed share/conversion | Return the existing result before new-operation rate checks; a retry cannot mutate the historical snapshot |

If no rates are configured, show a setup-unavailable message for taxable selection/sharing; never silently choose zero or claim exemption. Exempt/no_gst are explicit categories and do not require a selectable percentage. Retiring a percentage changes new selection, not approval evidence, historical numeric validity, or the exact-copy conversion rule. This is product configuration behavior, not a determination of tax applicability to a particular supply.

## 6. Tenant and parent integrity map

All tuples below use actual matching columns, even where a globally unique UUID would seem sufficient.

| Child reference | Required parent unique tuple | What it prevents |
|---|---|---|
| Any non-root business_id | businesses(id) | Orphan tenant data |
| businesses(id, created_by), deferred | business_memberships(B, user_id) PK | Committed ownerless business or unrelated creator |
| business_memberships.user_id | auth.users(id) PK | Invented application users |
| Owner actor (B, actor_id) | business_memberships(B, user_id) PK | Actor attributed to another business |
| quotations(B, customer_id) | customers(B, id), U-C1 | Cross-business customer on quote |
| versions(B, quotation_id) | quotations(B, id), U-Q1 | Cross-business version |
| quotations(B, id, current_version_id), deferred | versions(B, quotation_id, id), U-V2 | Current version of a different quotation, even in same business |
| versions(B, quotation_id, previous_version_id) | versions(B, quotation_id, id), U-V2 | Cross-quotation revision lineage |
| quotation_items(B, version_id) | versions(B, id), U-V1 | Items attached to another business's version |
| quotation_items(B, source_catalog_item_id) | catalog_items(B, id), U-K1 | Foreign-business catalog provenance |
| public_links/responses(B, quotation_id, version_id) | versions(B, quotation_id, id), U-V2 | Wrong version/quote combination |
| responses(B, quotation_id, version_id, public_link_id) | public_links(B, quotation_id, version_id, id), U-T1 | Evidence from a different link/version |
| invoices(B, quotation_id, customer_id) | quotations(B, id, customer_id), U-Q2 | Invoice for a different customer from its source quote |
| invoices(B, quotation_id, source_version_id) | versions(B, quotation_id, id), U-V2 | Source version from another quote |
| invoices(B, source_version_id, approved_response_id) | responses(B, version_id, id), U-R2 | Approval for a different version |
| invoice_items(B, invoice_id, source_version_id) | invoices(B, id, source_version_id), U-I3 | Source-version mismatch with parent invoice |
| invoice_items(B, source_version_id, source_quotation_item_id) | quotation_items(B, version_id, id), U-L1 | Line copied from wrong version/business |
| payments(B, invoice_id) | invoices(B, id), U-I1 | Cross-business payment/invoice association |
| payments(B, invoice_id, replaces_payment_id) | payments(B, invoice_id, id), U-P1 | Cross-invoice replacement |
| reversals/receipts(B, invoice_id, payment_id) | payments(B, invoice_id, id), U-P1 | Wrong-business or wrong-invoice correction/receipt |
| receipts(B, invoice_id, replaces_receipt_id) | receipts(B, invoice_id, id), U-E3 | Cross-invoice replacement receipt |
| invoice_public_links(B, invoice_id) | invoices(B, id), U-I1 | Invoice token attached to a different business's invoice |
| invoices(B, numbering_period) | invoice_number_sequences(B, period_key) PK | Number assigned from another business's period/settings |

There is no payment_id field on invoices: payment belongs to invoice, not the reverse. Listing an invoice's payments always filters by both business_id and invoice_id.

Optional source/predecessor FKs use normal MATCH SIMPLE behavior. Only the optional ID can be null; business and parent IDs remain NN. No ON DELETE SET NULL can erase tenant ownership.

FKs prove relationships, not workflow state. They cannot alone prove that the referenced response is approval, that the version is current, or that a payment predecessor has been reversed.

## 7. State model

| Entity | Stored representation | Allowed transition / derived display |
|---|---|---|
| Quotation | current_version_id; no status column | If invoice exists: converted. Otherwise use the current version's draft/shared/approved/change_requested state. A current superseded version is forbidden. |
| QuotationVersion | state plus shared/superseded timestamps | draft -> shared; shared -> approved OR change_requested; shared/approved/change_requested -> superseded on revision creation. No transition back to draft or out of superseded. |
| QuotationResponse | Immutable kind | approved OR change_requested. No pending/rejected/undone state. |
| Invoice | Issued row; no lifecycle status column | All invoice rows are issued. Derive unpaid/part_paid/paid from effective payments; overdue is a date flag, not another mutable state. |
| Payment | Immutable row plus zero/one reversal | confirmed if no reversal; reversed otherwise. No pending/refunded/allocated states. |
| Receipt | Immutable row plus its payment's reversal | issued if payment effective; void if reversed. A replacement is a different receipt for a different payment. |
| PublicLink (quotation or invoice) | revoked_at and access_expires_at in its own link table | revoked takes precedence; otherwise expired if access cutoff passed; otherwise active for reading/PDF. Quote respondability is a separate version/current/deadline check. Invoice links never accept a customer response. |

### Quote expiry

**Final B4 rule:** no new customer approval after the quotation's response deadline. Retain the existing technical date convention: valid_until is inclusive in document_time_zone; response_deadline_at is the next local midnight converted to an instant. A new response requires server time < deadline, checked after locking. The business default zone is Asia/Kolkata. Null valid_until means no configured response deadline; no default validity duration is invented. A shared version has both valid_until/response_deadline_at null or both set consistently; freeze the date and computed instant.

An access-active link to a time-expired quotation may still view/download its PDF but cannot submit a new response. Show the expired state and let the customer contact the business. The owner can create a new revision, choose a current validity date and share that revision. Sharing with an already-passed response deadline is rejected. access_expires_at instead blocks reading and PDF download as well. A revoked link blocks every action and does not disclose old contents.

The expiry check applies to accepting a **new** response. An approval recorded before the deadline remains historical approval and eligible for conversion while its version remains current; passage of the response deadline alone does not erase it. An identical retry returns the original evidence, not a fresh approval timestamp. Revision supersedes that eligibility and requires approval of the new version. No contractual/legal validity claim is made.

### Customer status, change requests and PDF access

1. The owner creates/edits a draft, then shares a secure version-bound quotation URL. The customer page and its Download PDF action render that same frozen version, including its GST breakdown.
2. While current and before its response deadline, the customer can approve or request changes. Store the exact version, link, response kind, note and time. Refreshing the active page shows the recorded response/status; no notification, realtime subscription or workflow-event table is needed.
3. A change request does not edit the version or count as approval. The owner reviews it. If accepted, Create revision copies the old content into a new draft with previous_version_id; the old response is retained. Pending review can be derived from change_requested with no successor, without adding a review-status entity.
4. While the successor remains a draft, the old access-active page can show its frozen quote/PDF and a revision-in-preparation status, with response actions disabled. Never expose the draft's content. The broker can derive that status from a differing current_version_id without reading draft rows.
5. Sharing the new revision creates its new URL and revokes prior quotation links. The owner manually shares that new URL; the customer sees and responds to the new frozen revision there. Old links are not a permanent portal or a redirect capability to new documents. This preserves the existing link-revocation rule and prevents stale-version approval.
6. After conversion, the owner explicitly shares an independent invoice URL. The customer invoice page provides view/download PDF for that issued invoice, with no approve/change/payment actions. A quotation token never authorizes the invoice page or reveals an invoice token.

PDF generation uses only an authorized frozen snapshot, its retained asset versions, stored HSN/SAC/rates/amounts and invoice-specific number/date. Apply the same link expiry/revocation/tenant checks to download requests as to page requests; an object ID alone is insufficient. Do not create public cached file URLs or accept a customer-supplied storage path. Renderer/library choice, caching and optional later storage remain implementation details; this schema adds no PDF path/blob/file table. Downloaded copies cannot be withdrawn by later revocation, which stops future server access only.

### Required setup checklist before sharing/conversion

Show this checklist in business setup/document review, with field-level missing-item messages and links to the appropriate form. Disable the relevant action until blocking prerequisites are met. Server/application commands recheck all prerequisites regardless of UI state. Report validation failures as actionable items, not an unexplained database constraint error.

| Prerequisite | Before sharing a quotation | Before invoice conversion |
|---|---|---|
| Business name and address | Required in candidate snapshot | Required in approved snapshot; never refresh from masters |
| Seller state | Required explicit selection | Use approved frozen seller state |
| GST registration choice | Explicit yes/no; not unknown | Use approved declaration |
| GSTIN when registered | Required; basic server-side format validation | Retain approved GSTIN; no online verification |
| Customer | Selected, same business; customer name/address captured | Same source customer and frozen identity |
| Customer state | Required explicit selection; customer GSTIN required when declared applicable | Use frozen fields, no new master-state inference |
| At least one valid line | Description/unit, quantity up to 3 decimals, integer paise price, explicit category/route/rates, applicable HSN/SAC and valid calculated totals | Exact approved line IDs/positions/content and totals |
| Selectable-rate setup | For taxable lines, current active operator-configured options; identify retired choices requiring correction | No current-option requirement for an already approved historical rate |
| Document particulars | Valid candidate identity, supply applicability/location, reverse-charge choice, selected optional data and valid configured asset references | Exact frozen approved particulars/assets |
| Validity | Response deadline, if set, has not already passed; timezone/date interpretation configured | Timely approval of current frozen version; unchanged rule on later conversion after response deadline |
| Invoice numbering | Not required to share a quotation | Configured business/period row covering invoice_date, valid prefix/template/start; allocated transactionally |
| Workflow eligibility | Editable current draft, no issued invoice | Current approved version and exact approval evidence; retry returns any existing invoice |

GSTIN state-prefix mismatches and the reverse-charge message are **warnings**, distinct from missing/invalid blocking fields. Do not silently turn either warning into a hard rejection. If correcting any frozen commercial/document value is necessary, offer Create revision and require fresh approval; the checklist must not invite invoice-only editing. Actual numbers/dates/line inputs still receive their transaction-time concurrency checks after the checklist passes.

### Invoice balance

effective paid = sum(payments.amount_minor for the invoice where no payment_reversals row exists).

outstanding = invoice.total_minor - effective paid.

Under the finalized no-overpayment rule, outstanding never goes below zero. Reject a new payment when amount_minor > outstanding, including any positive payment on an already-paid/zero-total invoice. paid means outstanding = 0 (including a zero-total invoice); unpaid means paid amount = 0 and total > 0; part_paid means 0 < paid amount < total. Reversal can return a paid invoice to part_paid/unpaid. No invoice row is rewritten. Overdue means outstanding > 0 and the current date in the frozen document_time_zone is after a nonnull due_on.

## 8. Required transaction and enforcement contracts

These are specifications for later database commands called by server application modules. Multiple supabase-js calls do not form one transaction. Each row below is one database transaction/RPC operation.

Use PostgreSQL READ COMMITTED for this locking protocol, with a fresh statement re-read after obtaining the lock. Do not combine pre-lock eligibility reads and mutation into a single stale-snapshot statement. Mutating and locking command functions are VOLATILE, not STABLE. If a stronger isolation level is later chosen, handle serialization failures by retrying the whole operation with the same request key. No transaction waits for user input, document rendering or network delivery.

All ordinary commands resolve the JWT user and active owner membership again inside the database. Lock and recheck before mutation. Do not accept server-calculated totals, actors or target tenant as unquestioned browser truth.

After authorization and locking, look for the operation's existing result **before** applying prerequisites for a new operation. Compare the normalized immutable request inputs; return the original result for an identical retry, and reject conflicting reuse. A later reversal, link rotation or revision must not cause a retry to repeat the original mutation. Public responses additionally require the original link/current-version access checks before returning evidence.

| Operation | Atomic behavior and locking | Retry behavior |
|---|---|---|
| Configure invoice numbering | Take exclusive business advisory lock; validate template/start/range and non-overlap; create period row or edit only an unused row; never set the allocation cursor from UI | Composite PK identifies a configuration; reject attempts to redefine a used period |
| Create workspace | Serialize by authenticated user using a transaction advisory lock; verify provider email; generate business ID internally; insert business without RETURNING, insert owner membership, then read business; deferred owner FK resolves at commit | UNIQUE(user_id) identifies an existing workspace; return it for a repeated request; do not update its settings on a create retry |
| Create quote | Validate active customer and create quote + initial draft + current pointer together with preallocated IDs | Stable quotation ID for this creation attempt; existing ID must be in authorized tenant and match the original customer |
| Save draft | Take the shared GST-configuration lock, then business/quotation/current-draft locks; require expected edit_sequence; validate state/category/rate/route inputs and current rate selections and replace/edit lines atomically; calculate all GST components/totals under section 5; increment sequence | Stale edit returns a conflict and current draft; never silently overwrites another save |
| Create revision | Lock quotation; reject if invoice exists; require a frozen predecessor; copy content/items to next draft unchanged, including retired rates marked for review under section 5.5; mark predecessor superseded and update current pointer together | U-V4 identifies the successor of the expected predecessor. Return that successor on retry; do not create another revision |
| Share draft | Take shared GST-configuration lock before business/quotation locks; look up creation_request_key; for a new share require current draft, required identity/address/state/registration fields, conditional GSTINs, reviewed HSN/SAC and asset references, place-of-supply/reverse-charge declarations, quantity_scale = 3, future response deadline if set, nonempty items, current selectable rates and exact GST breakdown/totals; surface setup errors and non-blocking warnings; freeze content; set shared state/actor/time; revoke prior links; insert version-bound link | U-T4 returns the original link/version and recorded link state for the same target/expiry; cannot recover a lost raw URL. Already-shared version with a different key returns already-shared without creating another link/version |
| Rotate/revoke link | Lock quotation; rotation requires its current frozen version and inserts a new link after revoking the previous one; manual revocation can target any retained link of this quotation, including during a revision draft | U-T4 identifies a rotation retry before mutation; return its recorded link even if later revoked, without revoking a newer link. Changed target/expiry conflicts. Revoking an already revoked link returns its recorded state |
| Respond publicly | Resolve candidate from token hash; acquire business/quotation locks; re-read token, revocation/access cutoff, current pointer and frozen version; look for an existing response first; only for a new response require shared state and an unpassed response deadline, then insert evidence and move state together | After valid-token/current-version checks, identical recorded payload returns the existing response, including after its response deadline. Different payload conflicts. A superseded/revoked link never returns a successful current approval |
| Convert | Lock quotation and return any existing invoice first; validate current snapshot with timely recorded approval and the conversion checklist; do not revalidate historical rates against current options; then lock the configured invoice-number period row, allocate number and capture issue date/time under section 4.19; copy all content/assets/HSN/GST fields and exact lines; commit invoice/items/cursor together | U-I2 returns the same invoice on retry without allocating another number. U-I4/U-I5 prevent business-period number duplicates; no independent content/GST override or live-master recalculation |
| Share/rotate/revoke invoice link | Authorize issued invoice; take invoice transaction advisory lock; check request-key retry first; create scoped link or revoke old link then create replacement; explicit revocation may leave no active link | U-J3 identifies original create/rotation result by invoice/expiry; changed input conflicts. Retry never rotates a newer link. Revoke is idempotent; raw URL recovery requires a fresh explicit rotation |
| View/download public document | Resolve only the token table appropriate to the route; take business lock and relevant quotation row/invoice advisory lock; re-read token validity and active-business state; return the allow-listed frozen snapshot | Rendering/download creates no document or file record; page and PDF use the same snapshot and access checks |
| Confirm payment | Take invoice transaction advisory lock; find retry result before checking current balance; for a new payment validate currency, post-invoice receipt time, amount and outstanding; insert payment and its receipt together | U-P2 identifies request. Same normalized input returns existing payment + receipt, even if later reversed; changed payload conflicts |
| Reverse payment | Take the same invoice advisory lock; look up existing reversal; for a new reversal record reason/actor/time; derived receipt status becomes void in same commit | U-X1 identifies the reversal. Same reason returns it; a changed reason cannot rewrite it |
| Record replacement payment | Take the same invoice advisory lock; check request/predecessor retry results first; for a new replacement require a reversed predecessor on the same invoice and no replacement, then apply normal payment checks and insert payment + receipt with exact predecessor links | Payment request key plus U-P3 prevent duplicate replacement. Identical retry returns the original result; a different attempt cannot create a second replacement. Old payment/receipt stay unchanged |
| Retrieve/reprint receipt | Authorize invoice/payment and retrieve its unique receipt | U-E1 returns the same receipt and reference; a missing receipt is an integrity error, not permission to silently issue another |

**Token handoff:** the trusted server generates a 32-byte random token using a cryptographic generator and sends only its hash to the database command, alongside creation_request_key. Store only the hash. Return the raw URL once, after the first successful commit; do not log it. If the result or raw URL is lost, retrying the same request key returns the original link ID/state but cannot recover its secret. An explicit rotation with a fresh request key creates a new URL. Never return a newly generated retry token as if it matched an existing hash, and never rotate automatically on a retry. The request key is nonsecret, authorizes nothing, and must remain stable for one attempt.

### Snapshot-structure and conversion testing requirements

The duplicated document/line columns are intentional historical snapshots. Keep them explicit; do not replace them with JSON or reconstruct them from live business/customer/catalog records.

- At Phase 4 conversion, compare **every** field in the shared document-content pack between approved quotation_versions and invoices, including nulls, numeric values, state/GST choices, optional remittance fields, asset keys and hashes. Exclude only the explicitly enumerated invoice-specific identity/source/number/date/creator/due-date metadata.
- Compare **every** line-content field in quotation_items and invoice_items. Assert the exact source-line ID set, positions and associated values, not merely line counts or aggregate totals. Missing, duplicated, reordered or substituted source lines must fail.
- Add a schema consistency test covering both snapshot pairs. It must flag any new content column present on only one side, incompatible types, or a field missing from the copy/comparison contract; account explicitly for the documented draft-versus-issued nullability difference.
- Each future schema change to either snapshot structure must update the counterpart, conversion mapping and field-by-field regression tests in the same change. Populate distinguishable values/nulls to catch omitted fields or live-master lookups.
- Test catalog/master edits and selectable-rate retirement after approval: conversion must preserve the source's old values, including retired historical rates, without recalculating under the new option list.

These are requirements for the relevant implementation phases; this documentation pass adds or runs no application/database tests.

### Guards required in addition to command logic

- IDs, business IDs, fixed parent IDs and creation actors never update.
- A frozen version's content, deadline, shared actor/time and every child item are immutable. Only the specified state/supersession fields can move forward.
- GST inputs are explicit: the final route must match the override/automatic choice, taxable line routes must match the parent, component applicability/rates/amounts must match section 5, and document totals must equal the line sums. INR/2 is enforced throughout. Catalog/state edits never cascade into document amounts.
- At commit draft/shared versions have no response; approved/change_requested versions have exactly one response with the matching kind; superseded versions retain their original zero-or-one response. State cannot drift from the retained evidence.
- A response, invoice, invoice item, payment, reversal or receipt cannot be updated or deleted through runtime roles. Invoice item insertion is permitted only during initial conversion, never as a later append.
- The approved response must match the source version and be of kind approved at invoice insertion. At commit the full shared document-column pack and source item set (including GST, HSN/SAC, assets, supply location, reverse-charge choice and selected payment information) must equal the approved source. Invoice-only issuance fields are assigned under sections 4.13/4.19. Any commercial/document value change requires a newly approved quotation revision first.
- Invoice number/reference, sequence and period are immutable and unique under U-I4/U-I5. Period configuration locks after first use; cursor advancement commits only with its matching invoice, never independently. invoice_date agrees with its captured issued_at/timezone and lies inside its configured period.
- quantity_scale is 3 and every persisted quantity meets the three-decimal rule. Asset references belong to the same business and preserve immutable bytes; no current-profile image/text fallback can alter a historical document.
- At commit every persisted payment row, including a payment already reversed in that transaction, must have exactly one receipt with matching invoice/amount/currency/actor and consistent predecessor links. UNIQUE gives at most one; a deferred completeness check gives at least one.
- A successful new sharing or rotation must commit its intended current-version link and revoke the previous non-revoked link. This is an operation-specific completeness condition, not a permanent requirement for every shared version: later manual revocation may leave no active link. Temporary intermediate states are confined to the transaction.
- Invoice link create/rotation likewise commits at most one unrevoked link; explicit revocation may leave none. Public invoice/PDF access is read-only and grants no payment, receipt or quotation permission.
- Draft-only deletion checks must reject any attempt to erase shared history. No cascade path bypasses those checks.

Use deferred constraint triggers where commit-time multirow checks are necessary, and immediate guards for immutable-row mutations. [PostgreSQL constraint triggers](https://www.postgresql.org/docs/17/sql-createtrigger.html)

**Common lock order:** operations validating new selectable GST rates first take the shared global GST-configuration advisory lock, then the business transaction advisory lock, then quotation/draft locks as needed. Other operations start with the business lock, then either a quotation row lock or an invoice transaction advisory lock. Never acquire the configuration lock after holding business/quotation locks. Conversion additionally locks its invoice-number period row after its quotation row; no command takes a quotation lock after a numbering-row lock. Quote operations re-read versions/items/links under their quotation lock. Payment, reversal and replacement operations all serialize on the same invoice advisory lock before reading effective payments; invoice-link create/rotation/revocation/read use that invoice advisory lock as well. They do not lock or update immutable invoice/payment rows and never acquire quotation locks. Public response operations take the quotation row lock, so response-versus-revision/share/convert cannot pass stale checks concurrently.

All commands for an existing business, including broker reads/responses, take a **shared** business advisory lock and recheck membership/availability after acquiring it. The operator procedure that disables membership and the invoice-numbering configuration command take the **exclusive** form. Conversion takes the shared business form before quotation/period row locks, so it cannot race a settings/range edit. Country/currency/exponent are fixed; no currency-change command exists. State/contact/GST defaults are copied from one consistent read into a draft, then reviewed before share; later master edits do not refresh the copies. A command needing exclusive access takes it initially, without upgrading a held shared lock. Bootstrap instead serializes by user ID. Plain authenticated SELECTs use statement-snapshot RLS; they do not acquire a long-lived business lock.

Advisory keys use a fixed global GST-configuration namespace or deterministic namespaced hashes of the relevant business or business/invoice UUIDs; collisions cause extra serialization, never authorization. Use transaction-scoped locks, not session locks. The protocol is mandatory in every exposed command; advisory locks alone do not protect against a writer that ignores them. No runtime command accepts a flag to skip guards or sets a user-forgeable session variable as authorization.

This avoids granting UPDATE on immutable tables merely to obtain row locks. PostgreSQL row-lock clauses require UPDATE privilege, so membership/invoice/payment row locks would conflict with the grants below. Quotation locks are compatible with the explicitly limited quotation UPDATE grants. [PostgreSQL SELECT and locking privileges](https://www.postgresql.org/docs/17/sql-select.html)

## 9. RLS and database-client strategy

### 9.1 Authenticated identity -> membership -> business -> records

The application verifies the owner session and resolves the one membership for auth.uid(). A business ID received from the browser is only a selector. Queries and commands include the authorized business and target ID. Database policies independently require:

- membership.user_id = (select auth.uid());
- membership.business_id = row.business_id (businesses uses row.id);
- membership.role = 'owner';
- membership.disabled_at IS NULL.

The membership SELECT policy itself is simply user_id = (select auth.uid()), including a disabled self-membership for account diagnostics. It does not query business_memberships again, avoiding recursive policies. The unique user key supports this lookup.

No user_metadata, email string, URL business ID, object UUID secrecy or browser role value grants business access. Auth users and customers are separate identities.

### 9.2 Grants, command functions and RLS roles

RLS filters rows; it does not alone make totals correct or freeze a document. Grants and policies must both be specified. [Supabase RLS and grants](https://supabase.com/docs/guides/database/postgres/row-level-security)

The selected design is **authenticated table reads plus narrowly scoped transactional writes**:

1. authenticated receives SELECT on tenant tables under owner RLS, SELECT on the nonsecret global gst_rate_options configuration, and EXECUTE on the exact owner commands. It receives no raw INSERT/UPDATE/DELETE/TRUNCATE grants.
2. One internal database role, webameen_executor, is NOLOGIN, NOBYPASSRLS, not a table owner, and is never granted to authenticated, anon, authenticator or an application login. This is a database execution identity, not a staff/team feature.
3. Private command functions are SECURITY DEFINER owned by that role, have an empty fixed search_path, fully qualified objects, explicit arguments and no arbitrary/dynamic SQL. The role has only the table operations in the matrix below.
4. Owner command functions still receive the user's JWT request context: auth.uid() is the caller identity while the effective SQL role is the executor. Executor RLS policies use that authenticated membership. No service-role key is used for ordinary owner operations.
5. Where Supabase RPC needs an exposed function, a public SECURITY INVOKER wrapper calls the exact private command. authenticated needs USAGE on private and EXECUTE on that specific inner function as well as its wrapper; merely granting the wrapper is insufficient.
6. Revoke default PUBLIC/anon execution, broad table grants, schema CREATE, and unneeded role privileges. private is not an exposed Data API schema. Grant execution for the exact function signatures only. Do not assume default privileges are safe.
7. Enable and FORCE RLS on application tables. Runtime functions must not be owned by postgres or the table owner. PostgreSQL role ownership/BYPASSRLS behavior is why the non-owner executor matters. [PostgreSQL row security](https://www.postgresql.org/docs/17/ddl-rowsecurity.html)
8. Security-definer search paths and execute privileges need explicit treatment. A SECURITY INVOKER function cannot write a table when its caller has no write grant; this design does not pretend otherwise. [PostgreSQL function security](https://www.postgresql.org/docs/17/sql-createfunction.html)
9. The executor needs USAGE on public/private/auth, EXECUTE on auth.uid() and the required fixed helpers, plus the narrowly scoped table grants. Custom NOLOGIN roles do not inherit authenticated's privileges automatically. Each document broker needs USAGE on public/private and EXECUTE only on its required fixed helpers. No role receives schema CREATE or arbitrary helper execution.

Only the executor owns normal write functions. Application modules provide UX validation, authorization context, DTOs and one operation boundary; database commands own atomic state/amount invariants. This does not require a general REST API, a second backend or duplicated financial calculation implementations.

### 9.3 Workspace bootstrap

Bootstrap is the only ordinary exception to the pre-existing-membership write predicate:

- The command takes profile/setup input, not a business_id, owner_id or role.
- It requires nonnull auth.uid() and trusted provider email verification; disable anonymous Supabase sign-in.
- Give the executor only SELECT(id, email_confirmed_at) on auth.users for this check, no provider table writes. Check only the current user.
- businesses INSERT policy for executor checks created_by = auth.uid(). Membership INSERT policy checks user_id = auth.uid(), role = owner and disabled_at is null. Those privileges are reachable only through the fixed bootstrap command, not through user DML.
- Generate the new business UUID internally; insert the business without RETURNING, then its membership, then read it through normal owner SELECT RLS. This avoids needing permanent creator-based read access.
- The deferred owner FK, unique business membership and unique user workspace prevent an ownerless commit or duplicate workspace. An existing disabled membership is not a reason to create another business.
- No join-existing-business, change-owner or arbitrary membership-insert command is exposed.

### 9.4 Per-table intended policies

O means the active-owner predicate above. Self means membership.user_id = auth.uid(). For tenant tables SELECT applies TO authenticated and webameen_executor. INSERT/UPDATE/DELETE entries apply **only TO webameen_executor** through named commands. INSERT uses WITH CHECK; UPDATE uses both USING and WITH CHECK. A dash means denied by absent privilege and policy.

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| businesses | O using id | Bootstrap self-creator only | O; profile/settings columns under their guards | Denied |
| business_memberships | Self | Bootstrap self-owner only | Denied to runtime; access disabling is an operator procedure | Denied |
| customers | O | O; actor equals caller | O; identity/contact/archive fields; ownership fixed | Denied; archive |
| catalog_items | O | O; actor equals caller | O; editable catalog/archive fields; ownership fixed | Denied; archive |
| quotations | O | O; valid customer and initial draft transaction | O; current pointer/updated_at through commands only | O plus never-shared initial-draft purge |
| quotation_versions | O | O; initial/revision draft only | O plus permitted draft/share/supersession transitions | O plus never-shared initial-draft purge |
| quotation_items | O | O and owning version editable | O and owning version editable | O and owning version editable; whole-quote purge allowed |
| quotation_public_links | O | O; frozen current-version share/rotation | O; write-once revocation columns only | Denied |
| quotation_responses | O | Denied to owner executor; token broker only | Denied | Denied |
| invoices | O | O; atomic approved conversion only | Denied | Denied |
| invoice_items | O | O; part of that same initial conversion only | Denied | Denied |
| payments | O | O; confirmed payment command only | Denied | Denied |
| payment_reversals | O | O; valid full-reversal command only | Denied | Denied |
| receipts | O | O; paired payment command only | Denied | Denied |
| invoice_public_links | O | O; issued invoice share/rotation command only | O; write-once revocation columns only | Denied |
| invoice_number_sequences | O | O; configure period command only | O; settings only while unused, or cursor/updated_at through allocation command | Denied |
| gst_rate_options | Global SELECT USING (true), TO authenticated and webameen_executor only | Denied to runtime | Denied to runtime | Denied to runtime |

gst_rate_options is the sole global application configuration table: its read policy intentionally has no owner/business predicate because it contains only nonsecret rate choices. Trusted operator maintenance follows section 4.20, outside owner commands; no configuration-write privileges are granted to authenticated, webameen_executor, anon or either document broker.

The public catalog migration adds the NOLOGIN/NOBYPASSRLS `webameen_catalog_reader` role. Its column grants and forced-RLS policies allow safe business identity fields and only published, unarchived catalog items. `anon` receives no direct base-table SELECT privilege; guests call only the fixed public catalog functions that join the requested stable slug to its own items and return the allow-listed projection. The functions do not expose contacts, banking, membership, user IDs, HSN/SAC or audit columns. A slug paired with another business's item returns no item.

A policy checks tenant membership and broad row eligibility; old/new immutability and multirow conditions use guards and transaction commands. The owner cannot directly insert a customer response or set approval through a generic state-update command.

auth.users keeps provider access control. The application does not create its RLS or expose an owner list of other users. Do not create default-definer reporting views; any later view must preserve caller RLS, e.g. security_invoker.

### 9.5 Isolated accountless quotation broker

anon receives no base-table privileges or policies and no owner-command execution. Public request inputs are the raw bearer token and, for a response, kind/note/optional name. They do not provide trusted business, quotation, version or customer IDs.

Use an isolated server module for public quotation routes, including PDF download. It rate-limits access, hashes the raw token, and calls only the narrow read/respond broker operations. A server-only Supabase service credential is permitted **only for invoking the isolated document brokers**, never for ordinary owner CRUD. This credential itself is broad and can bypass RLS; the application must not present it as a restricted user client or expose it.

Private broker functions are explicitly SECURITY DEFINER, owned by a separate NOLOGIN, NOBYPASSRLS non-table-owner role, webameen_quote_broker, with a fixed empty search_path and fully qualified objects. This switches effective role away from the calling service_role so broker RLS applies. Exposed entry wrappers are SECURITY INVOKER. The broker role is not granted to users or the executor and cannot call owner commands. Only service_role receives EXECUTE on the corresponding entry points/inner functions; authenticated and anon receive none. Grant service_role the required private schema USAGE, but never expose private through the Data API. Function ownership alone, without SECURITY DEFINER, would not establish this boundary.

Its narrowly specified table permissions/policies are:

| Table | Broker access | Restriction inside broker operation |
|---|---|---|
| business_memberships | SELECT only business_id/disabled_at | Check that the token's business still has an active owner; never return member identity |
| quotations | SELECT id/business_id/current_version_id/reference; UPDATE updated_at only | Token-resolved quotation only; quotation row lock serializes responses with revision/share |
| quotation_versions | SELECT frozen rows; UPDATE state only | Exact token version, shared_at nonnull; only shared -> approved/change_requested |
| quotation_items | SELECT children of frozen versions | Exact token version only; exclude internal provenance fields from output |
| quotation_public_links | SELECT for token_hash lookup and validity | Exact digest, revocation and access-cutoff checks on every request |
| quotation_responses | SELECT/INSERT only | Exact version/link; first terminal response or identical retry |
| All remaining tables | Denied | In particular, no invoices, payments, receipts, master customer/catalog data or business profile reads |

Broker RLS is role-specific and supports these frozen-row/relationship restrictions; token authorization is enforced inside the fixed functions, not by an owner-membership predicate (the customer has no auth.uid()). It must not depend on a caller-controlled session variable. Its role-scoped policies are never TO anon or PUBLIC.

Return only allow-listed frozen document particulars (including declared GSTINs, included remittance information, place of supply and reverse-charge indicator), lines/HSN/SAC, GST breakdown, totals, terms, validity and response outcome. Authorized logo/signature bytes are served through the document-bound asset path, not by exposing unrestricted storage access. A read-only revision-in-preparation indicator may be derived from the current pointer; draft content is never visible. Never return raw rows, private_note, source catalog IDs, token_hash, membership IDs or unrelated history. Normalise not-found/revoked/expired errors and constraint errors so they do not reveal other tenants. The PDF route uses this same read operation and allow-list.

### 9.6 Isolated accountless invoice read/download broker

The new invoice page has a separate token endpoint and a read-only broker. It does not reuse quotation tokens or broaden the quotation broker's table privileges. No full customer account/portal is introduced.

Use webameen_invoice_broker, a separate NOLOGIN, NOBYPASSRLS, non-table-owner execution role, with USAGE on public/private and only the required fixed helper EXECUTE grants. Its private read function is SECURITY DEFINER with fixed empty search_path and fully qualified objects. The exposed wrapper is SECURITY INVOKER; only service_role receives exact wrapper/inner EXECUTE plus necessary schema USAGE. Revoke PUBLIC/anon/authenticated execution and never grant this role to runtime users, the executor or the quotation broker. It cannot call owner write functions.

| Table | Invoice broker SELECT scope/policy | INSERT / UPDATE / DELETE |
|---|---|---|
| business_memberships | business_id/disabled_at only; verify token business has an active owner | Denied |
| invoice_public_links | Columns required for digest, invoice, revocation and expiry checks | Denied |
| invoices | Frozen invoice rows; function selects the token-resolved (business_id, invoice_id) only | Denied |
| invoice_items | Rows belonging to that token-resolved invoice under the same business | Denied |
| All other tables | Denied, including quotation links/versions/responses, payments, receipts and master data | Denied |

Role-specific RLS supplies invoice/parent restrictions; the fixed function enforces the exact token capability without auth.uid() or caller-controlled session variables. Resolve only invoice_public_links.token_hash, take the business/invoice advisory locks, then recheck expiry/revocation and business availability. The provided URL may contain a document identifier for routing, but it grants nothing and must match the token-resolved invoice.

Return only invoice number/reference, numbering-period label, invoice_date/issue/due dates, frozen seller/buyer particulars, authorized logo/signature, ordered lines/HSN/SAC, place of supply, reverse-charge indicator, GST breakdown, explicitly included bank/UPI/payment instructions, terms and total. Those frozen remittance instructions are intentionally customer-visible; transactional payment references, credentials, source approval evidence, balance history, membership IDs and token hashes remain excluded. The broker needs no read privilege on invoice_number_sequences because the issued number/date/context are already stored on the invoice. Page and PDF access both rate-limit and validate the token on every request. PDF rendering happens after the authorized read transaction, from its allow-listed snapshot; no rendering/network work holds database locks. Future requests after revocation fail, including PDF requests. No public file bucket or permanently usable download URL is created by this specification.

### 9.7 Document asset access

No media/PDF table or production storage resource is created here. Future logo/signature storage must use private immutable objects in a business-scoped namespace. Owner upload/read operations verify active membership using the ordinary user-session path and corresponding storage policies; object keys and hashes are trusted-server assignments, not arbitrary browser paths. Deny overwrites and ordinary deletion of retained objects. Changing the business profile points to a new object without touching older objects.

The customer has no bucket listing/read permission. A narrow server handler validates the quote/invoice token, resolves only that frozen document's referenced asset, checks business namespace and digest, then returns the permitted bytes. The quotation/invoice data broker remains limited to its listed database tables; storage access is a separately scoped server operation after document authorization. Expiry/revocation applies to new image/PDF requests as well as pages. Never expose unrelated profile assets, permanent public bucket URLs or signature bytes in logs. PDF rendering has no arbitrary remote fetch capability.

## 10. Index plan

Every PK and named U constraint in section 4 has its corresponding index, including U-V5 and U-T3 partial indexes. These are required for relational integrity or idempotency and also cover many parent lookups.

Only the following additional B-tree indexes are proposed:

| Label | Table / exact key | Prototype use |
|---|---|---|
| X-C1 | customers(B, display_name, id) | Tenant customer list ordered by name |
| X-K1 | catalog_items(B, name, id) | Tenant catalog list |
| X-Q1 | quotations(B, updated_at DESC, id) | Recent quotations and dashboard list |
| X-Q2 | quotations(B, customer_id, created_at DESC, id) | Customer quotation history / customer FK lookup |
| X-R1 | quotation_responses(B, quotation_id, version_id, public_link_id) | Response-to-link FK and evidence lookup |
| X-I1 | invoices(B, issued_at DESC, id) | Recent invoices |
| X-I2 | invoices(B, customer_id, issued_at DESC, id) | Customer invoice history |
| X-I3 | invoices(B, quotation_id, source_version_id) | Source-version FK lookup |
| X-N1 | invoice_items(B, source_version_id, source_quotation_item_id) | Source-line FK lookup and lineage |
| X-P1 | payments(B, received_at DESC, id) | Payments list by date |
| X-J1 | invoice_public_links(B, invoice_id, created_at DESC, id) | Owner link history, including revoked rows; full invoice FK lookup not covered by the partial active-link key |

Important coverage:

- Membership PK and UNIQUE(user_id) support owner resolution; no extra membership index.
- gst_rate_options(rate) PK supports exact selection lookup; the small global configuration needs no business_id, selectable-only or extra rate index.
- U-V3 supports version history; U-L2 and U-N1 support ordered lines.
- U-T2 supports one token lookup; U-T4 supports share/rotation retries. Do not add a second token_hash index.
- U-J1 supports invoice token lookup; U-J2 enforces one unrevoked invoice link; U-J3 supports invoice-link submission retries. No GST category/rate/state-code/GSTIN indexes are needed for this prototype's list/read paths.
- U-I2 handles invoice-by-quotation conversion checks; there is no UNIQUE(source_version_id) substitute for it. U-I4/U-I5 enforce rendered/numeric number uniqueness within business and period and cover the numbering-period FK. The invoice_number_sequences composite PK supports allocation and business-scoped period lookup; the small configuration set needs no extra date/prefix index.
- U-P1 starts with B/invoice_id and supports invoice payments; sort that small set when needed. U-P2 supports submission retries.
- U-X1 supports the reversal anti-join used for balances; U-E1 supports receipt-by-payment; U-E3 supports invoice receipt lookup.
- Do not add business_id-only indexes where a listed index already has that leading key.
- No standalone state index: quotation/invoice payment states are derived. Optional quote state filters join the current version and use the tenant/date list at prototype scale.
- No speculative full-text/trigram, per-actor, currency, note or archive-status indexes. Archived filters can use the tenant list initially. No reverse catalog-usage index is needed because deletion is unavailable and there is no "where used" screen.
- Foreign keys do not automatically create child-side indexes. The plan deliberately covers operational parent lookups above; immutable actor/source relationships with no reverse query or parent-delete operation do not each receive another index.

Validate query plans with real prototype queries before adding further indexes.

## 11. Delete and update policy

| Record/action | Prototype policy | Why |
|---|---|---|
| Customer with quotations, or unused customer | Archive/unarchive through owner command; no hard delete | Keeps contact references and a uniform small workflow |
| Product/service used on a quote, or unused catalog item | Archive/unarchive; no hard delete | Preserves provenance; quoted text/prices are independent copies |
| Global GST rate option | Trusted operator may add, retire/reactivate or remove an option under the configuration lock; change a rate by adding a new option | No snapshot/catalog FK depends on this table; historical rates remain valid |
| Master profile edits | Allowed within currency/identity rules; no propagation to frozen documents | Live directory and historical document have different purposes |
| Initial quotation that has never been shared | Explicit purge command may delete its draft items, version and quotation in one transaction | No customer-visible document/history exists |
| Revision draft with a shared predecessor | Edit it; do not delete it or restore old approval | Avoids implicit approval reinstatement and a separate discard workflow |
| Shared/approved/superseded version and its items | Never delete or edit content | Preserves exact offered/approved terms |
| Public link | Revoke or rotate, retain old row | Response evidence keeps a stable link reference |
| Invoice public link | Revoke or rotate, retain old row; never edit its target | Controls future page/PDF access without changing the issued invoice |
| Response | Never update/delete | Preserves first recorded customer decision |
| Invoice/invoice items | Never update/delete, including number, issue date, HSN/SAC, supply/charge indicators and asset references | One conversion produces a permanent issued record |
| Invoice numbering period | Configure before first use; afterward only transactional cursor advancement; never delete or reset used settings | Prevents duplicate numbers, reinterpretation or reuse of history |
| Frozen logo/signature objects | Never overwrite; retain while referenced; profile replacement uses a new key | Historical PDF content must not follow the current profile |
| Confirmed payment | Never update/delete | Reversal explains correction without erasing the original |
| Reversal | Never update/delete | Prevents reinstating an incorrect payment invisibly |
| Receipt | Never update/delete | Void/replacement is derived/linked history; reprint returns same record |
| Business/membership/auth user | No product hard-delete flow; retained FK references block cascades | Retention, account closure and anonymisation need B7 and a separate design |

Unarchiving clears the archive marker as a master-data operation; this is not deletion of financial history. The prototype does not claim a complete master-edit audit log.

The draft purge checks under the quotation lock that the quote has only its initial draft, no shared_at anywhere, no links/responses and no invoice. It deletes children before parents; the deferred current pointer is checked at commit. All other runtime parent deletions remain denied.

## 12. Migration readiness review

### READY FOR MIGRATION:

The following design elements are concrete enough to translate into a later reviewed migration, **after separate implementation authorization**:

- Seventeen application tables (sixteen tenant tables plus global gst_rate_options), plus provider auth identity. gst_rate_options is the sole additional table in this correction pass; invoice_number_sequences and invoice_public_links retain their existing responsibilities. No generic ledger, event, counter framework, asset or PDF-file table.
- Business ownership, one-owner/one-workspace constraints, actor FKs and the enumerated composite parent keys.
- Editable draft versus frozen version structure, successor/current pointer relationships and unique version ordering.
- Typed customer responses and hash-only revocable version-bound public links.
- One invoice per quotation with exact source-version and approval references.
- One invoice to many immutable payments, unique append-only reversal, one receipt per payment, same-invoice replacement chains; wrong-invoice correction uses a committed reversal followed by a new ordinary payment on the correct invoice, without cross-invoice replacement links.
- Minimal indexes, restrictive deletion, explicit role/grant/RLS contracts and transaction/guard responsibilities.
- India/INR/paise constraints and finalized three-decimal quantity validation; explicit seller/buyer particulars and conditional GSTIN capture; reusable HSN/SAC plus GST defaults; frozen document/line copies with automatic/override/final route separation.
- Basic tax-exclusive GST with replaceable current-rate options and independent exact numeric historical rates; no permanent allowed-rate enum or historical FK to the configuration. Separate CGST/SGST/IGST amounts/rates and owner-confirmed line/component half-up paise rounding retain their examples and sum invariants.
- Expired-quote approval denial; exact-version change requests; revision/reapproval before any GST change reaches an invoice; frozen quote and invoice PDF data.
- Independent invoice-token read/download boundary, revocation/rotation/retry behavior, RLS/grants and one supporting link-history index.
- Frozen logos/signatures by immutable object key/hash, explicit optional remittance fields/terms, place-of-supply fields and the display-only reverse-charge indicator.
- Invoice-only business/period numbering configuration with transactional row allocation, unique rendered/numeric numbers, retry-safe conversion and immutable issue time/local invoice date.

- Six implementation phases, each delivering its corresponding security mechanisms; setup checklists before sharing/conversion; basic server-side GSTIN validation and nonblocking prefix warnings; custom unit labels; explicit reverse-charge warning and normal-case supply suggestion.
- Field-by-field conversion checks and snapshot-structure regression tests are required during implementation, preserving the intentionally duplicated explicit columns.

**Readiness: YES for staged PostgreSQL/Supabase prototype migration implementation after separate authorization.** Required types, constraints, snapshots, quantity/GST/rounding rules, invoice numbering, date semantics and access boundaries are specified. No remaining business decision blocks this schema. This does not authorize migrations in the current milestone or claim that policies/concurrency/storage integration have already been tested. It is a prototype specification, not a full statutory GST-compliance certification.

### BLOCKED BY BUSINESS DECISION:

**None for the specified prototype database implementation.** India/INR, three-decimal quantities, GST model/defaults/overrides, rounding, expiry, sharing/PDF flow, overpayment rejection, invoice particulars, HSN/SAC, supply location, reverse-charge indicator and numbering approach are resolved.

Actual profile particulars, item classifications, the operator/accountant-approved selectable GST configuration, and each business's chosen numbering prefix/start/template/financial-year date range are setup inputs. They must be provided before the corresponding document/number can be issued; they are not unanswered schema-design questions. No exact visual number format or financial-year boundary is hard-coded. No legally current rate list is invented or seeded by this specification. Configure the approved choices before using taxable catalog defaults or sharing taxable quotations; this is an operational prerequisite, not a blocker to creating the configuration table or building earlier phases.

B7 remains an operational gate before production provisioning/real customer data: choose the permitted hosting/data region and retention/deletion policy. It does not block local migrations. Full reverse-charge accounting, special GST jurisdiction rules and other excluded features remain outside scope, not pending requirements for this milestone.

### ARCHITECTURAL QUESTIONS:

- **Resolved in this spec:** user-session reads plus a non-bypass execution role for transactional writes; all app data remains in the single PostgreSQL database and modular monolith.
- **Resolved in this spec:** quotation and invoice brokers are separate token capabilities with separate read scopes. A broad service credential remains a server-side privileged exception, and must not enter normal owner modules.
- **Reviewable technical scope choices:** one workspace per user; one terminal response per version; no revision-discard/approval-restoration flow; receipt-only reissue is excluded; missing raw links require rotation. If changed, update the associated constraints before migration.
- **Implementation verification, not business questions:** demonstrate that the selected Supabase environment supports the specified role ownership/grants, JWT identity through command wrappers, deferred cycles and constraints, and public broker isolation. Do not silently replace this design with postgres-owned generic definer functions or service-role CRUD if a setup step fails.
- **Resolved:** currently selectable GST rates are global nonsecret configuration; frozen rates are independent historical values. Changing selections needs no schema migration. Rate-validating commands take the configuration lock before business/document locks; public response and exact approved conversion do not revalidate against today's choices.
- **Resolved:** invoice number allocation uses a dedicated period/settings row and transactional lock; it cannot alter the approved document-content copy. Invoice number/date are explicit issuance metadata. No generic counter or invoice-specific GST editing is introduced.
- **Resolved:** logos/signatures use immutable private object references/hashes and token-authorized rendering. A renderer/storage adapter can be selected during implementation without a new PDF/asset table. Old quote URLs remain revoked when a revision is shared; the owner shares its new URL manually.
- **Operational setup remains:** choose storage/deployment provider configuration and confirm production region/retention before real use. This does not reopen the now-specified document particulars or add a GST-compliance engine.

### DO NOT IMPLEMENT YET:

- No migrations, Supabase tables, RLS policies, database roles/functions/triggers or changes to application code in this milestone.
- No payment/calculation/approval/conversion logic, production database, background jobs, gateways or team permissions.
- Once implementation is authorized, verification must cover three-decimal quantity rejection before coercion, HSN/SAC and asset-history preservation, conditionally required GSTIN/supply fields, reverse-charge display without unintended arithmetic changes, concurrent invoice-number allocation, allocation rollback/retries, used-period immutability, date/timezone/period boundaries, two-tenant wrong-parent attacks, direct-DML denial, disabled membership, forged owner response, frozen-item/GST mutation, concurrent share/revision/response/conversion, expiry denial, conversion retries/exact GST copying, duplicate payment keys, concurrent overpayment rejection, repeated reversal, receipt completeness/linkage, catalog-default history preservation, automatic/manual treatment, 0% versus exempt/no_gst, per-component rounding edges, quote/invoice token separation and PDF access after expiry/revocation. Also verify replacing selectable rates without a migration, retirement without historical data loss, concurrent rate retirement/share, conversion after a source rate is retired or removed, GSTIN format errors versus nonblocking state-prefix warnings, the exact reverse-charge warning, setup feedback, custom units, every frozen document/line field and source ID/position/value set, snapshot-structure drift, and wrong-invoice correction as two committed operations with null replacement references on the new ordinary payment. These are future verification requirements, delivered with their corresponding phase; no application/database test suite has been created or run in this documentation pass.

**Document consistency review completed:** selectable and historical GST rates are distinct across fields, validation, grants, locks and conversion; wrong-invoice correction is separate from same-invoice replacement chains; table inventory, policy matrix and diagram include the global configuration exception; phase order and setup/warning behavior agree with the final design. Profile/catalog fields have explicit frozen document/line counterparts; quantity precision is consistently three decimals; HSN/SAC, supply location and the reverse-charge choice remain historical; logo/signature and optional payment data never fall back to live masters; number allocation, RLS, tenant FK and lock order agree; issue metadata is distinguished from the exact approved-content copy; GST/rounding, expiry, overpayment and customer/PDF access rules remain consistent. Payment/receipt cardinalities and intentional exclusions are preserved. Only this specification is changed.

## 13. Final schema diagram

Optional lines mean zero-or-one where shown. The diagram shows business relationships; the composite-key map in section 6 is authoritative for enforcement. The quotation/current-version cycle and one-receipt completeness are checked at transaction commit. The optional catalog relationship is provenance, not live document content. GST_RATE_OPTIONS is standalone global configuration, deliberately without an FK to historical document lines or saved catalog defaults.

~~~mermaid
erDiagram
    GST_RATE_OPTIONS {
        numeric rate PK
        boolean selectable
    }
    AUTH_USERS ||--o| BUSINESS_MEMBERSHIPS : owns_one_workspace
    BUSINESSES ||--|| BUSINESS_MEMBERSHIPS : has_one_owner
    BUSINESSES ||--o{ CUSTOMERS : owns
    BUSINESSES ||--o{ CATALOG_ITEMS : owns
    BUSINESSES ||--o{ QUOTATIONS : owns
    CUSTOMERS ||--o{ QUOTATIONS : receives
    QUOTATIONS ||--|{ QUOTATION_VERSIONS : has_versions
    QUOTATIONS o|--|| QUOTATION_VERSIONS : points_to_current
    QUOTATION_VERSIONS o|--o| QUOTATION_VERSIONS : has_successor
    QUOTATION_VERSIONS ||--o{ QUOTATION_ITEMS : contains
    CATALOG_ITEMS o|--o{ QUOTATION_ITEMS : optional_source
    QUOTATION_VERSIONS ||--o{ QUOTATION_PUBLIC_LINKS : accessed_through
    QUOTATION_VERSIONS ||--o| QUOTATION_RESPONSES : receives_one_response
    QUOTATION_PUBLIC_LINKS ||--o| QUOTATION_RESPONSES : records_access_evidence
    QUOTATIONS ||--o| INVOICES : converts_once
    QUOTATION_VERSIONS ||--o| INVOICES : supplies_frozen_content
    QUOTATION_RESPONSES ||--o| INVOICES : supplies_approval
    CUSTOMERS ||--o{ INVOICES : billed
    INVOICES ||--o{ INVOICE_PUBLIC_LINKS : read_and_download
    BUSINESSES ||--o{ INVOICE_NUMBER_SEQUENCES : configures_invoice_periods
    INVOICE_NUMBER_SEQUENCES ||--o{ INVOICES : allocates_number
    INVOICES ||--|{ INVOICE_ITEMS : contains
    QUOTATION_ITEMS ||--o| INVOICE_ITEMS : copied_once
    INVOICES ||--o{ PAYMENTS : receives
    PAYMENTS ||--o| PAYMENT_REVERSALS : may_be_reversed
    PAYMENTS o|--o| PAYMENTS : may_be_replaced_by
    PAYMENTS ||--|| RECEIPTS : has_one_receipt
    RECEIPTS o|--o| RECEIPTS : may_be_replaced_by
~~~
