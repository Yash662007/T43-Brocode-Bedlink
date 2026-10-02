# BedLink

Decision support for ambulance crews finding a hospital bed before they arrive — not a
guarantee of a bed. Three screens (Nurse, Hospital, Ambulance) share one live backend:
ranking, holds, offers, and bed counts all flow through `/server`.

## Setup (5 commands)

```sh
npm install
npm run server:install
cp .env.example .env
cp server/.env.example server/.env
npm run server:seed
```

Then:

```sh
npm run demo
```

This reseeds the demo database, starts the backend at `http://localhost:4000`, and the
frontend at `http://localhost:8080`. Open `http://localhost:8080` and use the **View
workspace** switcher (or `?screen=nurse` / `?screen=hospital` / `?screen=ambulance`) to
preview each role. `npm run server:seed` prints each hospital's nurse/data-desk tokens —
`.env.example` is already wired to City General's.

## Architecture

- **Frontend**: TanStack Start (React 19, Vite, TanStack Router), `src/components/bedlink-*.tsx`
  for the three role screens. Talks to the backend over plain `fetch` (`src/lib/bedlink-client.ts`)
  and Server-Sent Events (`src/lib/bedlink-stream.ts`) — no server-side rendering dependency on it.
- **Backend** (`/server`): Node + TypeScript + Express + `better-sqlite3`. See
  [`server/README.md`](server/README.md) for the data model, ranking formula, API contract,
  and the Telegram bot / simulated feed.
- **AI note review** (`src/lib/bed-update-extraction.*`) is a separate, already-working feature
  (OpenAI parses a nurse's free-text note into structured bed updates) — unrelated to the
  SQLite backend above, needs `OPENAI_API_KEY` to work, and degrades gracefully without it.

## Tests

```sh
npm run server:test   # hold/offer state machine: races, timeouts, stale data, anti-herding
npm test               # frontend
```

## Built with

- TanStack Start, React, TypeScript, Tailwind CSS
- Express, better-sqlite3, grammy (Telegram), Server-Sent Events
