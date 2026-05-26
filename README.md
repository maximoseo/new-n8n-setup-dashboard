# New n8n Setup Dashboard

Dashboard for onboarding a client website into an automated n8n blog-publishing pipeline.

## Local development

```bash
npm install
npm run dev
```

Frontend: `http://127.0.0.1:5177`

API: `http://127.0.0.1:8787`

## Production

```bash
npm run build
npm start
```

The server uses `PORT` and `HOST` environment variables and serves both `/api/*` and the built Vite app.

## Supabase setup

Phase 2 requires Supabase Auth and Postgres. Apply the migration in `supabase/migrations/001_create_tables.sql`, then set these variables in Render:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Without those variables, the app shows a setup-required screen and protected API routes return `503`.
