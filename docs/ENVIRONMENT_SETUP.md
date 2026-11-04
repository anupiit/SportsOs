# SportsOS — Environment Setup & Deployment

## Requirements

Node.js ≥ 20 (tested on 22), npm ≥ 10, PostgreSQL 16 (Docker or local). Redis is **not** used.

## Environment variables

### API (`apps/api/.env`, template in `.env.example`)

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `JWT_SECRET` | yes | At least 16 characters (the API refuses to boot otherwise). Use 32+ random bytes in production |
| `JWT_EXPIRES_IN` | no | Default `12h` |
| `PORT` | no | Default `4000` |
| `CORS_ORIGINS` | yes in production | Comma-separated web origins |
| `ALLOWED_EMAIL_DOMAIN` | no | Self-registration domain, default `iitism.ac.in` |
| `ANTHROPIC_API_KEY` | no | Enables Claude answers and reports. Without it the AI runs in offline retrieval mode |
| `CLAUDE_MODEL` | no | Default `claude-opus-5-5` |
| `AI_TIMEOUT_MS` | no | Claude request timeout, default `60000` (the client also retries twice) |
| `PINECONE_API_KEY` | no | Enables Pinecone. Otherwise the in-process BM25 index is used |
| `PINECONE_INDEX`, `PINECONE_NAMESPACE` | no | Defaults `sportsos-knowledge`, `iitism` |
| `SEED_FORCE_RESET` | seed only | `true` lets the DEMO seed wipe a database holding non-demo data |
| `SEED_ALLOW_PRODUCTION` | seed only | Must also be `true` for the seed to run with `NODE_ENV=production` |

Only **one** LLM provider is implemented and needed (Anthropic). No Gemini key is used. No API key is required for
SportsOS to run: AI features degrade to retrieval-only answers and templated reports.

### Web (`apps/web/.env.local`, template in `.env.example`)

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_API_URL` | API base including `/api`; baked in at build time |
| `NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS` | `false` hides the synthetic demo-account panel on the sign-in page. **Set `false` in production.** |

### Mobile (`apps/mobile/.env`)

`EXPO_PUBLIC_API_URL`: on a phone, use the API host's LAN IP.

## Local development

```bash
npm install
```

```bash
docker compose up -d postgres
```

```bash
cp apps/api/.env.example apps/api/.env
```

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

```bash
npm run dev:api
```

```bash
npm run dev:web
```

The seed creates **synthetic** accounts (`*@sportsos.demo`, password `sportsos123`), one per role, for example
`peso@sportsos.demo`, `dean.sw@sportsos.demo`, `coach.football@sportsos.demo`, `hostelsec.a@sportsos.demo`,
`club.member@sportsos.demo`, `student@sportsos.demo` and `admin@sportsos.demo`. `media@sportsos.demo` also holds a
temporary Event Committee role, to demonstrate multiple roles and the role switcher.

## Checks

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
npm test
```

```bash
npm run build
```

End-to-end suites (they need a running API on a freshly seeded, disposable database; the e2e suite writes TEST records):

```bash
SEED_FORCE_RESET=true npm run db:seed
```

```bash
npm run test:smoke
```

```bash
npm run test:e2e
```

The smoke suite signs in several accounts. Login is limited to 10 attempts per account per minute, so wait a minute between
consecutive runs.

## Production deployment

1. Provision PostgreSQL and set the API variables above, with a strong `JWT_SECRET` and the exact `CORS_ORIGINS`.
2. Build: `npm ci && npm run build`. Docker: `docker compose up -d --build` builds the `api` and `web` images.
3. Apply migrations **without** resetting: `npm run prisma:deploy -w @sportsos/api` (`prisma migrate deploy`). Never
   use `migrate dev` or `migrate reset` against production.
4. **Do not run the demo seed in production.** Instead:
   * create the first administrator once (it refuses to run if an active administrator already exists, and is audited):
     `ADMIN_EMAIL=… ADMIN_NAME="…" ADMIN_PASSWORD=… npm run bootstrap:admin -w @sportsos/api`.
     No HTTP API creates an administrator from nothing;
   * have that administrator create staff accounts (`Users → New account`) and request roles. Privileged roles need a
     second approver, so appoint at least two trusted people (for example the System Administrator and the Dean SW);
   * import institutional reference data as described in `IIT_ISM_DATA_INTEGRATION.md`.
5. Build the web app with `NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS=false`.
6. Put the API behind HTTPS. Note that the web client stores the JWT in `localStorage`; see the security limitations in
   the changelog.

## Network access needed for institutional data

Verifying or importing data from the official sites needs outbound access to `www.iitism.ac.in` and
`people.iitism.ac.in`. These were blocked in the environment where this work was done.
