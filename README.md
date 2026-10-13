# Guess the Word

A Wordle-style daily word puzzle built with **Next.js 16**, **Auth.js v5**, **MongoDB** and **Redis**.
Pick a name, get six tries to find the hidden five-letter word, and see how you rank on today's leaderboard.

[![CI](https://github.com/AmineGuitouni/wordle-clone/actions/workflows/ci.yml/badge.svg)](https://github.com/AmineGuitouni/wordle-clone/actions/workflows/ci.yml)

<table>
  <tr>
    <td><img src="docs/landing.jpg" alt="Landing page" /></td>
    <td><img src="docs/game.jpg" alt="Game board" /></td>
  </tr>
  <tr>
    <td><img src="docs/leaderboard.jpg" alt="Daily leaderboard" /></td>
    <td><img src="docs/mobile.jpg" alt="Mobile layout" height="330" /></td>
  </tr>
</table>

## Features

- **Daily puzzle** with the classic green / yellow / grey feedback, correct handling of duplicate letters, an on-screen
  keyboard that tracks letter states, and physical-keyboard support.
- **Guest accounts** — choose a display name and play; no email or password. Your browser keeps a signed device
  identity, so changing your name never gives you a fresh game.
- **Abuse protection** — a self-hosted proof-of-work challenge before a new identity is issued, escalating per-IP
  limits, and per-player rate limiting on guesses (see [Identity & abuse protection](#identity--abuse-protection)).
- **Daily leaderboard** ranked by a score that rewards fewer tries and faster solves.
- **Polished UI** — flip / pop / shake / bounce tile animations (plus a ripple while the server checks a slow guess), light and dark themes, a how-to-play dialog,
  shareable emoji results, a layout that fits the screen without scrolling from 320 px phones (portrait and landscape) to 1440p monitors, and
  `prefers-reduced-motion` support.
- **Accessible** — ARIA grid semantics for the board, labelled keys, live-region messages, visible focus states.

## Tech stack

| Area      | Choice                                                                                |
| --------- | ------------------------------------------------------------------------------------- |
| Framework | Next.js 16 (App Router, Server Components, Server Actions, `proxy.ts`), React 19      |
| Auth      | Auth.js v5 (guest credentials provider, stateless JWT sessions)                       |
| Database  | MongoDB (official driver, lazy singleton connection, index bootstrap)                 |
| Cache     | Redis via `ioredis` behind a reusable `Cache` service (retries, circuit breaker)      |
| UI        | Tailwind CSS 3, HeroUI, Framer Motion, CSS keyframe animations, `next/font`           |
| Quality   | TypeScript (strict), ESLint, Prettier, Vitest (unit + MongoDB integration), GitHub CI |

## How it works

```mermaid
sequenceDiagram
    participant C as Browser
    participant A as Server Action (submitGuess)
    participant S as Game service
    participant DB as MongoDB
    C->>C: Validate locally (length, dictionary)
    C->>A: submitGuess("CRANE")
    A->>A: Check session, normalise & re-validate input
    A->>S: submitGuess(userId, guess)
    S->>DB: Load today's word + the player's game
    S->>S: Score the guess (answer never leaves the server)
    S->>DB: Compare-and-set append (only if guess count is unchanged)
    S-->>C: tile states + status (answer only once the game is lost)
```

- **The answer never reaches the client while a game is in progress.** The page is rendered on the server and only
  receives guesses and their computed tile states. A lost game is the only time the answer is sent.
- **Rules are enforced on the server**, not just in the UI: the six-guess limit, no guesses after a win/loss, and
  dictionary validation. Server Actions are public endpoints, so input is re-validated there.
- **Concurrency-safe writes.** A guess is appended with a compare-and-set on the stored guess count, so parallel or
  replayed requests cannot exceed the attempt limit or overwrite each other. A unique index on
  `(userId, toDaysWord)` makes racing first guesses converge on one game. Both are covered by integration tests.
- **Scoring** lives in [`src/lib/game/rules.ts`](src/lib/game/rules.ts) as pure, unit-tested functions using Wordle's
  two-pass algorithm (greens first, then yellows limited by the remaining count of each letter).
- **Daily word.** The newest document in the `words` collection is today's word. A secured webhook rotates it (see
  [Daily word rotation](#daily-word-rotation)); a brand-new database is seeded automatically on first use.
- **Leaderboard score** = `1e9 / (solveTimeMs + 10 000 × tries)`; only players who solved today's word are listed.

## Identity & abuse protection

Guests have no passwords, so the server needs another way to recognise a returning player and to make bulk-creating
fake players expensive. It layers three things:

```mermaid
sequenceDiagram
    participant B as Browser
    participant I as POST /api/identity
    participant R as Redis
    participant A as Auth.js (guest provider)
    B->>I: { name }
    I->>R: per-IP request limit
    alt valid signed device cookie
        I-->>B: ok (same identity; only the display name changes)
    else new browser
        I-->>B: challenge { salt, difficulty, signed token }
        B->>B: solve proof of work in a Web Worker
        B->>I: { name, token, nonce }
        I->>I: verify signature, expiry and hash
        I->>R: mark challenge used (single use) and count the creation for this IP
        I-->>B: ok + Set-Cookie: signed device id (httpOnly, 1 year)
    end
    B->>A: signIn("guest", { name })
    A->>A: authorize: accept only a validly signed device cookie
    A-->>B: session whose user id is the device id
```

- **Device identity.** A random 128-bit id lives in a signed (HMAC-SHA256), `httpOnly`, long-lived cookie, and it _is_
  the player id. The display name is only a label, so signing out and back in under another name resolves to the same
  player, the same game and the same guess count. Only ids the server signed are accepted.
- **Proof of work.** A browser without an identity must find a nonce so that `SHA-256(salt:nonce)` starts with N zero
  bits before one is issued. Challenges are stateless (signed token with salt, difficulty and expiry), single-use
  (replay marker in Redis) and solved in a Web Worker, so no third-party captcha or account is needed. Difficulty starts at 16 bits (`POW_DIFFICULTY_BITS`, about 0.1 s on a laptop) and **doubles for every
  identity the same IP created recently** (up to 64×, about 8 s), so making identities in bulk gets expensive quickly.
- **Rate limits** (fixed windows in Redis): 30 identity requests per IP per 10 minutes, 10 new identities per IP per
  hour, and 30 guesses per player per minute. Returning devices don't count against the creation limit. A blocked
  client gets `429` with `Retry-After`.

### Redis cache service

[`src/lib/cache`](src/lib/cache) is a small, reusable layer rather than raw Redis calls scattered around the app:

- A `CacheStore` interface with a Redis driver (`ioredis`) and an in-memory driver. The app uses Redis when `REDIS_URL`
  is set and falls back to memory otherwise (fine for development; not shared between instances in production).
- `Cache` adds key namespacing, JSON values, `getOrSet` (cache-aside with in-process request coalescing), atomic
  windowed counters (a Lua script, so `INCR` + `EXPIRE` can't be split by a crash) and one-time-use markers.
- **Resilience.** Reconnects forever with capped exponential backoff and jitter, per-command timeouts, one quick retry
  for idempotent reads/writes, and a **circuit breaker** so a dead Redis costs one fast failure instead of a timeout on
  every request. Errors are logged at most once per interval.
- **Two error policies.** _Soft_ operations (`get`, `set`, `del`, `getOrSet`) degrade to cache misses, so an outage
  can't break a page. _Strict_ operations (`incr`, `setIfAbsent`) throw `CacheUnavailableError`; the rate limiter and
  challenge check catch it and **fail open** (the game stays playable; the limits just aren't enforced until Redis is
  back).
- What is cached: today's word (60 s, dropped when the word rotates) and the leaderboard ranking (15 s, dropped when a
  game is won or a player renames). Rate-limit counters and used-challenge markers live there too.

## Getting started

Requirements: Node.js 20.9+ and a MongoDB instance (local or [Atlas](https://www.mongodb.com/atlas)).

```bash
git clone https://github.com/AmineGuitouni/wordle-clone.git
cd wordle-clone
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

Open <http://localhost:3000>. A throwaway local MongoDB (and optionally Redis) is one command away:

```bash
docker run -d --name guess-the-word-mongo -p 27017:27017 mongo:7
docker run -d --name guess-the-word-redis -p 6379:6379 redis:7   # optional; then set REDIS_URL
```

### Environment variables

| Variable               | Required | Description                                                                         |
| ---------------------- | :------: | ----------------------------------------------------------------------------------- |
| `MONGODB_URI`          |    ✅    | MongoDB connection string                                                           |
| `MONGODB_DB`           |    ✅    | Database name                                                                       |
| `AUTH_SECRET`          |    ✅    | Signs session cookies. Generate with `npx auth secret` or `openssl rand -base64 33` |
| `WEBHOOK_SECRET_KEY`   |    ✅    | Authorises the daily word rotation webhook                                          |
| `REDIS_URL`            |    —     | `redis://` or `rediss://` URL. Without it a per-process in-memory cache is used     |
| `CACHE_NAMESPACE`      |    —     | Key prefix (default `gtw`); lets staging and production share one Redis             |
| `POW_DIFFICULTY_BITS`  |    —     | Base proof-of-work difficulty, 0–28 (default `16`)                                  |
| `AUTH_TRUST_HOST`      |    —     | Set to `true` for any production run outside Vercel (`npm start`, Docker, a VPS)    |
| `NEXT_PUBLIC_SITE_URL` |    —     | Public site URL for absolute link-preview (Open Graph) URLs; optional on Vercel     |

The app builds without any of these set; they are only read when a request needs them. `AUTH_SECRET` also signs device
identities and proof-of-work challenges, so rotating it signs everyone out and invalidates their device cookies.

> **Production needs a shared Redis.** With several server instances (or serverless functions) the in-memory fallback
> keeps separate counters per instance, which weakens rate limiting and replay protection. Set `REDIS_URL`.

> **Running `npm start` locally or on your own server?** Auth.js refuses unknown hosts in production, so sign-in fails
> with `UntrustedHost` unless you set `AUTH_TRUST_HOST=true`. Vercel configures this automatically.

## Scripts

| Command             | What it does                                          |
| ------------------- | ----------------------------------------------------- |
| `npm run dev`       | Start the dev server                                  |
| `npm run build`     | Production build                                      |
| `npm start`         | Serve the production build                            |
| `npm run lint`      | ESLint                                                |
| `npm run format`    | Prettier (`format:check` verifies without writing)    |
| `npm run typecheck` | Generate Next route types and run `tsc`               |
| `npm test`          | Vitest unit tests (+ integration tests if configured) |
| `npm run check`     | Lint, format check, typecheck and tests in one go     |

## Testing

Unit tests cover the game rules, scoring, validation, the dictionary, the retry helper, the cache service (including
failure modes with a fake failing backend), the rate limiter, and the identity primitives (signatures, device cookie,
proof of work, challenges, client flow).

Integration tests run against real services and are skipped unless configured:

- `TEST_MONGODB_URI` enables the game service (attempt cap, win/loss lifecycle, racing requests, seeding, leaderboard
  and cache invalidation), the `/api/identity` endpoint (challenge, replay, tampering, escalation, rate limits, "rename
  keeps your game") and the guess server action (rate limiting).
- `TEST_REDIS_URL` additionally runs the cache-store contract suite against Redis and points the integration tests at
  it instead of the in-memory cache. Use a spare database index, e.g. `/1`. Each run uses a unique key namespace.

```bash
docker run -d --name guess-the-word-test-mongo -p 27018:27017 mongo:7
docker run -d --name guess-the-word-test-redis -p 6380:6379 redis:7
TEST_MONGODB_URI=mongodb://127.0.0.1:27018 TEST_REDIS_URL=redis://127.0.0.1:6380/1 npm test
```

CI runs everything, with MongoDB and Redis service containers, on every push and pull request.

## Daily word rotation

Call the webhook once a day (cron-job.org, GitHub Actions, Vercel Cron, …) to pick a new word. Both `GET` and `POST`
are accepted, authenticated with either a `key` header or a bearer token:

```bash
curl -X POST https://your-app.example.com/api/webhooks/updatetodaysword \
  -H "key: $WEBHOOK_SECRET_KEY"
```

Vercel Cron sends `Authorization: Bearer $CRON_SECRET`, so set `CRON_SECRET` and `WEBHOOK_SECRET_KEY` to the same value
if you use it. The new word is never the same as the previous one, and everyone starts a fresh game.

## Deploying

1. Create a MongoDB Atlas cluster and allow your host's IPs.
2. Create a Redis instance (e.g. Upstash or Redis Cloud) and use its `rediss://` URL as `REDIS_URL`.
3. Import the repository into Vercel (or any Node host) and set the environment variables above.
4. Schedule the rotation webhook.

## Project structure

```
src/
├── app/                  Routes: landing, /game (+ server action), /leaderboard, auth + webhook API routes
├── components/
│   ├── game/             Board, tiles, keyboard, result panel, how-to-play dialog, useWordle hook
│   ├── landing/ layout/  Landing demo board, navbar, theme toggle
│   └── auth/ leaderboard/
├── lib/
│   ├── game/             rules · score · words (pure, tested) and service (MongoDB + cache, server-only)
│   ├── cache/            CacheStore contract, Redis + in-memory drivers, the resilient Cache service
│   ├── identity/         Device cookie, signing, proof of work, challenges, issuance logic, client flow + worker
│   ├── db.ts             Lazy MongoDB client, typed collections, index bootstrap
│   ├── rate-limit.ts     Fixed-window limiter and the app's policies
│   ├── retry.ts          Exponential backoff with jitter (also drives Redis reconnects)
│   └── validation.ts     Guest-name rules shared by the form and the server
├── auth.config.ts        Edge-safe Auth.js config shared with proxy.ts
└── proxy.ts              Route protection (Next.js 16 replacement for middleware)
```

## Known limitations & ideas

- The dictionary is small (~1 000 words) and doubles as the answer pool; separating "valid guesses" from "possible
  answers" would make the game more forgiving.
- **No anonymous scheme can truly identify a person.** The identity belongs to a browser: clearing cookies, using a
  private window or another device yields a new player. The proof of work and per-IP limits make doing that in
  bulk costly, they don't make it impossible. In particular, browser-feasible difficulty is cheap for an attacker
  running native code; the escalation per IP and the creation limit are what actually bound the damage. Real accounts
  (for example "Sign in with GitHub" for leaderboard eligibility) are the only strong fix.
- IP-based limits rely on `x-forwarded-for` / `x-real-ip`, which are only trustworthy behind a proxy that sets them
  (Vercel and similar do). Players sharing one IP (a school, an office) share the creation allowance.
- Rate limiting and replay protection **fail open** when Redis is unreachable, so the game stays playable. Use
  `consumeRateLimit(..., { failOpen: false })` where blocking is preferable.
- Streaks and long-term stats still aren't possible without real accounts.
