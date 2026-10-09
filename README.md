# Times Tables Tutor (working name)

A phone-first app that helps children build calm, lasting fluency with the multiplication tables, with a parent dashboard for tracking progress.

See [SPEC.md](SPEC.md) for the product spec and the learning method.

## How it's built

| Part | Where |
|---|---|
| Learning engine (fact levels, check-up, session builder, strategies, stats) | [src/engine](src/engine) — pure TypeScript, unit-tested |
| Child app (check-up, practice, fact map) | [src/child](src/child) |
| Parent dashboard | [src/parent](src/parent) |
| API (Cloudflare Worker + D1) | [worker](worker), schema in [migrations](migrations) |

Every answer is stored as an event on the phone first (IndexedDB) and synced to the Worker in the background, so the app works offline. All progress is derived from the event log.

## Running locally

```sh
npm install
npm run db:migrate:local
echo "INVITE_CODE=family-test" > .dev.vars
npm run build          # the Worker serves ./dist
npm run dev:api        # Worker + local D1 on :8787
npm run dev            # app on :5173, proxies /api to :8787
```

Open http://localhost:5173/parent to create a parent account (invite code from `.dev.vars`), add a child, and link a phone with the code shown.

## Tests

```sh
npm test                               # engine unit tests
node scripts/smoke-api.mjs             # API checks against :8787
npx playwright test                    # full parent + child journey on a phone-sized browser
```

## Deploying

```sh
npx wrangler login
npx wrangler d1 create tutor-db        # put the id in wrangler.jsonc
npm run db:migrate:remote
npx wrangler secret put INVITE_CODE
npm run deploy
```
