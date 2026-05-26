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
