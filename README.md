# Webameen

Webameen is a modular-monolith workspace for small businesses. Owners use Supabase authentication to manage a business, customers, products/services, and quotation drafts. Owners can share immutable quotation versions with accountless customers, and manage revisions and links. Invoice, payment, and receipt workflows are later phases; check the [project roadmap](docs/PROJECT_ROADMAP.md) for verified status and implementation order. The [database specification](docs/16-prototype-database-spec.md) describes the approved database and document contracts.

## Requirements

- Node.js 24
- npm 11
- Docker Desktop only if you want to run the optional local Supabase services

## Local setup

1. Install dependencies with **npm ci**.
2. Copy **.env.example** to **.env.local**.
3. Start local Supabase with **npm run db:start**.
4. Run **npm run db:status** and copy the local API URL and publishable key into **.env.local**. The public quotation page also needs the local **SECRET_KEY** value under `SUPABASE_QUOTE_BROKER_KEY`.
5. Start the web app with **npm run dev**.
6. Open http://127.0.0.1:3000 and create an account, then set up your business.

The root page redirects to the protected dashboard. Login and sign-up use Supabase Auth. A signed-in user without a business is sent to `/onboarding/business`. Setup creates one business and its owner membership in one database transaction. Owners can create, search, view and edit customers and catalog items. Published items appear on the business's public catalog page, which guests can open without logging in. Local Supabase email confirmation is disabled for convenient development; hosted deployments should configure confirmation and allow `APP_URL/auth/callback` as a redirect URL.

## Useful commands

| Command | Purpose |
|---|---|
| npm run dev | Start the development server |
| npm run build | Create a production build |
| npm run start | Serve a production build |
| npm run typecheck | Run TypeScript without emitting files |
| npm run lint | Run Biome lint and formatting checks |
| npm run format | Format supported project files |
| npm test | Run the Vitest unit tests |
| npm run test:e2e | Run Playwright browser tests |
| npm run test:all | Run unit and browser tests |
| npm run db:start | Start local Supabase services |
| npm run db:stop | Stop local Supabase services |
| npm run db:status | Show local Supabase service status |

Local Supabase services use Docker on Windows. No production Supabase project is configured. Schema changes are tracked in `supabase/migrations`; invoice, payment, and receipt workflows remain later phases. Quotation response submission is still incomplete; see the roadmap for the database-trigger blocker.

## Environment

**.env.local** is ignored by Git. **.env.example** documents these values:

- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
- APP_URL
- SUPABASE_QUOTE_BROKER_KEY (server-only, needed for public quotation links)

Set the URL and publishable key together. APP_URL is the application origin used to build the confirmation callback; set it to the production HTTPS origin for hosted deployments. For local development, the local Supabase status output includes `SECRET_KEY`; put it in `SUPABASE_QUOTE_BROKER_KEY`. Hosted deployments should use a server-side Supabase secret key for this value. It is used only by the isolated quotation token broker; never put it in a `NEXT_PUBLIC_` variable, browser module, or ordinary owner data-access client.

## Project organization

- **src/app** contains Next.js routes and shared layouts.
- **src/components** contains presentation components.
- **src/config** validates environment configuration.
- **src/lib/supabase** contains the reusable SSR clients and Next.js session refresh.
- **src/server/modules/identity** contains auth actions, input validation and verified user lookup.
- **src/server/modules/business** contains onboarding validation, state choices, the creation action and owner-scoped business lookup.
- **src/server** contains server-only application modules and error types.
- **e2e** contains Playwright browser tests; `src/**/*.test.ts` contains unit tests.
- **supabase/migrations** contains schema and database commands; **supabase/tests** contains SQL security and behavior checks.
- **docs/PROJECT_ROADMAP.md** tracks current and future implementation status.
- **biome.json** configures linting and formatting.

## Architecture guardrails

- Keep the product a modular monolith.
- Keep business rules in server-side application modules.
- Use server actions for first-party private UI operations and narrow route handlers only where needed.
- Keep database access behind server modules and enforce business membership and RLS.
- Do not expose owner/customer private data through public catalog reads.
- Do not treat local GST-rate fixtures as production configuration or legal advice.

## Business setup verification

With local Supabase running, execute the database checks against the disposable local database:

```powershell
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -v ON_ERROR_STOP=1 -f supabase/tests/foundation.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -v ON_ERROR_STOP=1 -f supabase/tests/business_bootstrap.sql
npm test
npm run test:e2e
npm run typecheck
npm run lint
```

The SQL suites roll back their fixtures. Business creation uses the signed-in user's JWT through a fixed Supabase RPC, an internal executor subject to RLS, and an unexposed helper that reads only the current provider account's email-confirmation field. No service-role key is needed.
