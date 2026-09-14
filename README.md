# Smart Student Budget Game

Live mobile-first budgeting simulation for university orientation. Students join from their phones, enter **name, NIM, and faculty**, build a monthly budget, then respond to synchronized life events controlled by a host.

## Surfaces

- `/play` — student experience
- `/host` — facilitator controls
- `/screen` — projector / live results

## Stack

- Next.js 16.3.4 + React 19.3.0
- Supabase Postgres + Realtime
- Vercel-ready

## Local setup

1. Create a Supabase project.
2. Run `supabase/migrations/001_initial.sql` in the SQL editor.
3. Copy `.env.example` to `.env.local` and set the project URL + publishable key.
4. `npm install`
5. `npm run dev`

The seeded demo session is `SSB2026` and the seeded host secret is `CHANGE_ME`. Change the host secret hash before any real event:

```sql
update public.game_sessions
set host_secret_hash = encode(digest('YOUR-NEW-SECRET', 'sha256'), 'hex')
where code = 'SSB2026';
```

## Faculty autocomplete

Students can type any faculty name. For cleaner analytics/autocomplete, add official faculty names:

```sql
insert into public.faculties (name) values
  ('Fakultas Ekonomi dan Bisnis'),
  ('Fakultas Teknik');
```

## Vercel

Only these public environment variables are needed by the current MVP:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_APP_URL` (optional)

No Supabase secret/service-role key is shipped to the browser. Host control is protected by a per-session secret checked by RLS through the `x-host-secret` request header. Rotate the host secret for each real event.

## Privacy notes

- NIM is stored to prevent duplicate joins per session.
- NIM is not exposed through `public_scores` and is never shown on the projector.
- Student rows are protected by a random per-device token and RLS.
