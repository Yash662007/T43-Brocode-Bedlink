import { db } from "../db/index.js";
import { rankingConfig } from "../config/index.js";
import { nowIso } from "./ids.js";
import { broadcast } from "./sse.js";
import { offerNextBatch } from "./requests-engine.js";

type PendingOfferRow = { id: string; request_id: string; mode: string };
type ActiveHoldRow = { id: string; request_id: string; hospital_id: string; bed_type: string };

/** Server-authoritative 1s ticker: expires timed-out offers/holds and pushes countdowns. */
export function startTicker() {
  const interval = setInterval(tick, rankingConfig.tickerIntervalSeconds * 1000);
  interval.unref?.();
  return () => clearInterval(interval);
}

function tick() {
  void expireOffers();
  expireHolds();
  expireDiversions();
  broadcastCountdowns();
}

/** Exposed for tests: runs one tick's worth of expiry work and awaits it. */
export async function runTickOnceForTests() {
  await expireOffers();
  expireHolds();
  expireDiversions();
}

export function expireDiversions() {
  const now = nowIso();
  const expired = db
    .prepare(
      `SELECT hospital_id FROM hospital_diversions WHERE is_diverted = 1 AND diverted_until IS NOT NULL AND diverted_until <= ?`,
    )
    .all(now) as Array<{ hospital_id: string }>;

  if (expired.length === 0) return;

  db.prepare(
    `UPDATE hospital_diversions SET is_diverted = 0, updated_at = ? WHERE is_diverted = 1 AND diverted_until IS NOT NULL AND diverted_until <= ?`,
  ).run(now, now);

  for (const row of expired) {
    broadcast("diversion", { hospitalId: row.hospital_id, isDiverted: false });
  }
}


export async function expireOffers() {
  const now = nowIso();
  const timedOut = db
    .prepare(
      `SELECT o.id, o.request_id, o.hospital_id, r.mode FROM offers o
       JOIN requests r ON r.id = o.request_id
       WHERE o.status = 'pending' AND o.responds_by <= ?`,
    )
    .all(now) as Array<{ id: string; request_id: string; hospital_id: string; mode: string }>;

  if (timedOut.length === 0) return;

  const update = db.prepare(
    `UPDATE offers SET status = 'expired', reject_reason = 'timeout', responded_at = ? WHERE id = ?`,
  );
  const affectedRequestIds = new Set<string>();
  for (const offer of timedOut) {
    update.run(now, offer.id);
    affectedRequestIds.add(offer.request_id);
    broadcast("offer", {
      offerId: offer.id,
      requestId: offer.request_id,
      hospitalId: offer.hospital_id,
      status: "expired",
    });
  }

  for (const requestId of affectedRequestIds) {
    const request = db.prepare(`SELECT status, mode FROM requests WHERE id = ?`).get(requestId) as
      | { status: string; mode: string }
      | undefined;
    if (!request || request.status !== "offering") continue;

    if (request.mode === "sequential") {
      await offerNextBatch(requestId);
      continue;
    }

    const pending = db
      .prepare(`SELECT COUNT(*) AS n FROM offers WHERE request_id = ? AND status = 'pending'`)
      .get(requestId) as { n: number };
    if (pending.n === 0) await offerNextBatch(requestId);
  }
}

function expireHolds() {
  const now = nowIso();
  const timedOut = db
    .prepare(`SELECT id, request_id, hospital_id, bed_type FROM holds WHERE status = 'active' AND expires_at <= ?`)
    .all(now) as ActiveHoldRow[];

  if (timedOut.length === 0) return;

  const updateHold = db.prepare(
    `UPDATE holds SET status = 'expired', released_at = ? WHERE id = ?`,
  );
  const updateRequest = db.prepare(
    `UPDATE requests SET status = 'expired', updated_at = ? WHERE id = ? AND status = 'held'`,
  );

  for (const hold of timedOut) {
    updateHold.run(now, hold.id);
    updateRequest.run(now, hold.request_id);
    broadcast("hold", { holdId: hold.id, requestId: hold.request_id, hospitalId: hold.hospital_id, status: "expired" });
    broadcast("outcome", { requestId: hold.request_id, status: "expired" });
  }
}

function broadcastCountdowns() {
  const now = Date.now();

  const offers = db
    .prepare(
      `SELECT id, request_id, hospital_id, responds_by FROM offers WHERE status = 'pending'`,
    )
    .all() as Array<{ id: string; request_id: string; hospital_id: string; responds_by: string }>;

  const holds = db
    .prepare(`SELECT id, request_id, hospital_id, expires_at FROM holds WHERE status = 'active'`)
    .all() as Array<{ id: string; request_id: string; hospital_id: string; expires_at: string }>;

  if (offers.length === 0 && holds.length === 0) return;

  broadcast("tick", {
    serverTime: new Date(now).toISOString(),
    offers: offers.map((o) => ({
      offerId: o.id,
      requestId: o.request_id,
      hospitalId: o.hospital_id,
      remainingSeconds: Math.max(0, Math.round((new Date(o.responds_by).getTime() - now) / 1000)),
    })),
    holds: holds.map((h) => ({
      holdId: h.id,
      requestId: h.request_id,
      hospitalId: h.hospital_id,
      remainingSeconds: Math.max(0, Math.round((new Date(h.expires_at).getTime() - now) / 1000)),
    })),
  });
}
