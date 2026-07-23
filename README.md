# Word World MVP

A small writing-motivation web app for children: write on paper, scan it, get positive rewards, unlock tools, and level up.

## Stack

- Node.js + Express
- Postgres persistence
- Static frontend served by the backend
- OpenAI vision analysis via the Responses API
- Docker-ready for Railway

## Local Development

```bash
npm install
cp .env.example .env
docker compose up db
npm run dev
```

Open `http://localhost:3000`.

For local UI testing without OpenAI calls, keep `AI_MOCK=true`.

## Railway

1. Create a Railway project.
2. Add a Postgres database.
3. Add this repo as a service.
4. Set environment variables:

```txt
DATABASE_URL=<Railway Postgres connection string>
OPENAI_API_KEY=<your key>
OPENAI_MODEL=gpt-5
AI_MOCK=false
ADMIN_TOKEN=<a private admin token for criteria edits>
```

Railway will build from the `Dockerfile`. The app creates and seeds its tables on startup.

## Configurable Scan Criteria

Scan checks are seeded into Postgres as editable records. The current defaults are:

- Capital Letter
- Full Stop
- Complete Sentence
- Finger Spaces
- Vocabulary Gem
- Connector Key

The backend generates the AI prompt from active criteria, so adding future checks does not require changing the scan engine.

Admin criteria writes use the `x-admin-token` header:

```bash
curl -X PATCH https://your-app.up.railway.app/api/criteria/<id> \
  -H "Content-Type: application/json" \
  -H "x-admin-token: $ADMIN_TOKEN" \
  -d '{"xpReward":20,"active":true}'
```
