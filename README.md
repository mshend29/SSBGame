# Smart Student Budget Game

Live mobile-first budgeting simulation for UNISBANK university orientation. Students join from their phones, enter **name, NIM, and faculty**, build a monthly budget, then respond to synchronized life events controlled by a host.

## Surfaces

- `/play` — student experience
- `/host` — facilitator controls
- `/screen` — projector / live results

## Stack

- Next.js 16.3.4 + React 19.3.0
- Supabase Postgres + Realtime
- Vercel-ready

## Supabase

The live project has been provisioned in **ShendD Media**:

- Project: `SSBGame`
- Project ref: `oapppoapplihyhifvvhi`
- Region: Singapore (`ap-southeast-1`)

Migrations in this repository:

1. `001_initial.sql` — game schema, RLS, seed session/events, Realtime
2. `002_performance_hardening.sql` — RLS performance hardening and FK indexes
3. `003_configure_unisbank_faculties.sql` — official UNISBANK faculty autocomplete

The live project already has these changes applied. Run the migrations in order only when bootstrapping a separate Supabase project.

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Set the live Supabase project URL and **publishable** key.
3. `npm install`
4. `npm run dev`

The seeded game session code is `SSB2026`. The live host secret is intentionally **not stored in GitHub**.

## Faculty autocomplete

Students can type their faculty, with autocomplete seeded to the current official UNISBANK faculties:

- Fakultas Teknologi Informasi dan Industri
- Fakultas Hukum dan Bahasa
- Fakultas Ekonomika dan Bisnis
- Fakultas Vokasi

## Vercel

Set these environment variables when importing the repository into Vercel:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_APP_URL` — your final Vercel/custom-domain URL

Only the Supabase publishable key is used in the browser. No service-role key is shipped to the frontend. Host control is protected by a per-session secret checked by RLS through the `x-host-secret` request header.

## Privacy notes

- NIM is stored to prevent duplicate joins per session.
- NIM is not exposed through `public_scores` and is never shown on the projector.
- Student rows are protected by a random per-device token and RLS.
- The projector receives aggregate voting data and public leaderboard fields only.
