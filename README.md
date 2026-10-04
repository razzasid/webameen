# Webameen

Webameen is a modular-monolith web application foundation for a small-business documentation workspace. This milestone contains the development shell and placeholder navigation only; it does not implement customer, quotation, invoice, payment, or approval workflows.

## Requirements

- Node.js 24
- npm 11
- Docker Desktop only if you want to run the optional local Supabase services

## Local setup

1. Install dependencies with **npm install**.
2. Copy **.env.example** to **.env.local**.
3. The app can run with both Supabase values blank. To connect a local Supabase instance later, fill in its URL and publishable key.
4. Start the web app with **npm run dev**.
5. Open http://localhost:3000.

The root page opens the dashboard placeholder. The sidebar links to Customers, Products & services, Quotations, Invoices, Payments, and Settings. Login and Sign up are visual placeholders and do not authenticate yet.

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

Local Supabase services use Docker on Windows. No production Supabase project is configured. No database migrations have been created.

## Environment

**.env.local** is ignored by Git. **.env.example** documents the public values used by the Supabase client setup:

- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

Set both values or leave both blank. Do not put a Supabase secret/service-role key in a NEXT_PUBLIC_ variable or in a browser module. The current shell does not require a Supabase project.

## Project organization

- **src/app** contains Next.js routes and shared layouts.
- **src/components** contains presentation components.
- **src/config** validates environment configuration.
- **src/lib/supabase** contains the future session-aware Supabase client factories.
- **src/server** contains server-only application modules and error types.
- **e2e** contains Playwright navigation tests.
- **supabase** contains local configuration only; the schema and migrations are intentionally empty.
- **biome.json** configures linting and formatting.

## Architecture guardrails

- Keep the product a modular monolith.
- Keep business rules in server-side application modules.
- Use server actions for first-party private UI operations and narrow route handlers only where needed.
- Keep database access behind server modules and enforce business membership and RLS when schema work begins.
- Do not add production database resources, financial workflows, calculations, roles, or integrations as part of this foundation milestone.
