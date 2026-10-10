# Ashra (عشرة)

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
echo "EMAIL_LOG_LINKS=1" >> .dev.vars   # local only: shows password-reset links on screen
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
npm run test:reset-limits              # clears local login rate limits if back-to-back runs trip them
```

Development-only previews (dev server only): `/dev/guide?a=7&b=8` (add `&missing=a&intro=1` for a missing-number guide), `/dev/turnaround?a=3&b=7`, `/dev/lesson?id=groups`, `/dev/words?n=56&lang=ar&digits=eastern`.

Text lives in [src/locales](src/locales) (`en.json`, `ar.json`); a unit test checks they have the same keys.

## Deploying

```sh
npx wrangler login
npx wrangler d1 create tutor-db        # put the id in wrangler.jsonc
npm run db:migrate:remote
npx wrangler secret put INVITE_CODE
npm run deploy
```

### Password-reset email (optional)

No email service is set up, so "Forgot password?" says it can't send emails. To turn it on, create an account with an email API (the code supports [Resend](https://resend.com) out of the box; see [worker/email.ts](worker/email.ts) to add another), verify your sending domain there, then:

```sh
npx wrangler secret put EMAIL_PROVIDER    # resend
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put EMAIL_FROM        # e.g. Ashra <noreply@your-domain>
```

Never set `EMAIL_LOG_LINKS` on the live Worker.
