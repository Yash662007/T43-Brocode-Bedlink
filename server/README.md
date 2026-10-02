# BedLink server

Node + TypeScript + Express + SQLite (`better-sqlite3`). Decision support for ambulance
dispatch: ranks hospitals, runs the hold/offer state machine, and streams live updates —
never a guarantee of a bed.

## Setup

```sh
npm install
cp .env.example .env
npm run seed      # deterministic demo tokens + 6 seeded hospitals
npm run dev        # http://localhost:4000
```

`npm run seed` is safe to re-run any time — it resets bed counts to the demo baseline and
reuses the same tokens (`demo-nurse-<hospital-id>` / `demo-desk-<hospital-id>`) instead of
generating new ones, so the frontend's `.env` never goes stale.

## Data model (SQLite)

`hospitals`, `hospital_capabilities`, `bed_status` (current count per bed type),
`bed_events` (append-only audit trail, every source), `requests`, `offers`, `holds`,
`hospital_tokens`, `specialist_on_call`, `telegram_links`. See `src/db/schema.sql`.

Sources tagged on every write: `nurse_tap`, `telegram`, `phoned_in`, `sim_feed`,
`crew_feedback`, `estimate`. Simulated data (`sim_feed`) is always labelled as such in the
API (`isSimulated`) — the frontend shows a SIMULATED badge and never presents it as real.

## Key logic

- **Effective availability** = `free_reported` − active holds for that bed type.
- **Freshness**: a bed type's count becomes `unknown` after its configured expiry
  (`config/ranking.json: bedTypeExpiryMinutes`, default 60 min for ICU) and ranks lower.
- **Capability match**: `config/conditions.json` maps a condition to a bed type and
  required capabilities (`config/capabilities.json`); hospitals missing one are excluded.
  Both files are marked "needs clinical review" — the mappings are a placeholder set for
  this demo, not a validated protocol.
- **Ranking**: `travel_min + (1 − p_available) * fallback_penalty_min + load_penalty`, with
  every constant in `config/ranking.json` and labelled as an assumption. `p_available`
  falls as data ages and when effective free hits 0. Each ranked hospital returns a
  plain-language `reason`, a `confidence` (`likely | uncertain | probably_full | unknown`),
  `pAvailable`, and the `scoreBreakdown`.
- **Holds**: accepting an offer rechecks availability and inserts the hold inside one
  `BEGIN IMMEDIATE` transaction, so two simultaneous accepts for the last bed can only
  produce one winner. Active holds count against effective availability, which is what
  keeps a second ambulance from being routed to a bed someone else already has (anti-herding).
- **Offer modes**: sequential offers one hospital at a time, 120s to respond
  (`offerResponseSeconds`) before moving to the next; parallel offers the top 3 at once —
  first accept wins atomically, the rest become `superseded`, and the search widens to the
  next 3 only once the whole batch is terminal. A server-side 1s ticker enforces every
  timeout and expiry; clients only display the countdown it sends.
- **Specialist gating**: a capability flagged `needsSpecialist` in `capabilities.json`
  counts as available only while `specialist_on_call` is both on and fresh
  (`specialistFreshnessMinutes`).

## API

See the route files under `src/routes/` — `hospitals.ts`, `beds.ts`, `events.ts`,
`dispatch.ts`, `requests.ts`, `offers.ts`, `holds.ts`, `specialists.ts`, `stream.ts`
(SSE: `bed-change`, `offer`, `hold`, `outcome`, `tick`).

## Telegram bot

```sh
# .env: TELEGRAM_BOT_TOKEN=<token from @BotFather>
npm run bot
```

`/start <token>` links a chat to a hospital (any seeded nurse/data-desk token works). Then
send free text like `ICU 2, vent 1` for a Confirm/Edit prompt, `/shiftchange` for a
Same/Change prompt with the last known counts, or `/specialist` to toggle on-call
specialists. Without a token set, the bot is simply disabled — everything else still works.

## Simulated feed

```sh
npm run simulate
# SIMULATE_INTERVAL_MS=4000 SIMULATE_COUNT=20 npm run simulate   # finite run
```

Plays random admit/discharge events into `POST /api/events` with `source=sim_feed` against
a running server.

## Importing real hospitals (optional)

```sh
IMPORT_BBOX="18.90,72.75,19.25,73.05" npm run import-hospitals
```

Pulls hospitals in a bounding box from the public OpenStreetMap Overpass API into
`data/osm-hospitals.json`. The public instance can be slow or rate-limited; point
`OVERPASS_URL` at a mirror if needed. Capabilities still need to be hand-filled into
`config/capabilities.json` / seeded — this only gets you names and coordinates.

## Tests

```sh
npm test
```

Covers: a simultaneous last-bed hold (exactly one winner), sequential timeout moving to the
next hospital, a parallel race (one winner, the rest superseded), stale data becoming
`unknown`, anti-herding (a second ambulance ranks a just-held hospital behind one with real
availability), and the Telegram free-text parser.
