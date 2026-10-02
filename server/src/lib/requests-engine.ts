import { db } from "../db/index.js";
import { rankingConfig, type BedType } from "../config/index.js";
import { newId, nowIso } from "./ids.js";
import { conflict, notFound } from "./errors.js";
import { broadcast } from "./sse.js";
import { rankHospitalsForCondition, resolveCondition } from "./dispatch-rank.js";
import { getBedSnapshot, applyBedUpdate } from "./beds.js";
import { getHospital } from "./hospitals.js";

export type RequestMode = "sequential" | "parallel";
export type RequestStatus = "offering" | "held" | "arrived" | "cancelled" | "no_match" | "expired";
export type OfferStatus = "pending" | "accepted" | "rejected" | "expired" | "superseded";
export type HoldStatus = "active" | "consumed" | "released" | "expired";

export type RequestRow = {
  id: string;
  condition: string;
  bed_type: BedType;
  lat: number;
  lng: number;
  mode: RequestMode;
  status: RequestStatus;
  created_at: string;
  updated_at: string;
};

export type OfferRow = {
  id: string;
  request_id: string;
  hospital_id: string;
  bed_type: BedType;
  rank: number;
  status: OfferStatus;
  eta_minutes: number | null;
  sent_at: string;
  responds_by: string;
  responded_at: string | null;
  reject_reason: string | null;
};

export type HoldRow = {
  id: string;
  request_id: string;
  offer_id: string | null;
  hospital_id: string;
  bed_type: BedType;
  status: HoldStatus;
  created_at: string;
  expires_at: string;
  released_at: string | null;
};

function getRequest(id: string): RequestRow {
  const row = db.prepare(`SELECT * FROM requests WHERE id = ?`).get(id) as RequestRow | undefined;
  if (!row) throw notFound("Request not found.");
  return row;
}

function getOffer(id: string): OfferRow {
  const row = db.prepare(`SELECT * FROM offers WHERE id = ?`).get(id) as OfferRow | undefined;
  if (!row) throw notFound("Offer not found.");
  return row;
}

function offeredHospitalIds(requestId: string): string[] {
  const rows = db
    .prepare(`SELECT DISTINCT hospital_id FROM offers WHERE request_id = ?`)
    .all(requestId) as Array<{ hospital_id: string }>;
  return rows.map((r) => r.hospital_id);
}

function offerPublicPayload(offer: OfferRow) {
  const request = getRequest(offer.request_id);
  const hospital = getHospital(offer.hospital_id);
  return {
    offerId: offer.id,
    requestId: offer.request_id,
    hospitalId: offer.hospital_id,
    hospitalName: hospital?.name ?? offer.hospital_id,
    condition: request.condition,
    bedType: offer.bed_type,
    etaMinutes: offer.eta_minutes,
    rank: offer.rank,
    status: offer.status,
    sentAt: offer.sent_at,
    respondsBy: offer.responds_by,
  };
}

/**
 * Sends the next batch of offers for a request: 1 hospital in sequential
 * mode, up to `parallelOfferCount` in parallel mode. Always excludes
 * hospitals already offered for this request, so repeated calls widen the
 * search instead of re-offering the same hospital.
 */
export async function offerNextBatch(requestId: string): Promise<void> {
  const request = getRequest(requestId);
  if (["cancelled", "arrived", "expired"].includes(request.status)) return;

  const excludeHospitalIds = offeredHospitalIds(requestId);
  const result = await rankHospitalsForCondition({
    condition: request.condition,
    origin: { lat: request.lat, lng: request.lng },
    excludeHospitalIds,
  });

  if (!result || result.ranked.length === 0) {
    db.prepare(`UPDATE requests SET status = 'no_match', updated_at = ? WHERE id = ?`).run(
      nowIso(),
      requestId,
    );
    broadcast("outcome", { requestId, status: "no_match" });
    return;
  }

  const batchSize = request.mode === "sequential" ? 1 : rankingConfig.parallelOfferCount;
  const batch = result.ranked.slice(0, batchSize);
  const sentAt = nowIso();
  const respondsBy = new Date(
    Date.now() + rankingConfig.offerResponseSeconds * 1000,
  ).toISOString();

  const insert = db.prepare(
    `INSERT INTO offers (id, request_id, hospital_id, bed_type, rank, status, eta_minutes, sent_at, responds_by)
     VALUES (@id, @requestId, @hospitalId, @bedType, @rank, 'pending', @etaMinutes, @sentAt, @respondsBy)`,
  );

  const created: OfferRow[] = [];
  const txn = db.transaction(() => {
    for (const hospital of batch) {
      const id = newId("offer");
      insert.run({
        id,
        requestId,
        hospitalId: hospital.hospitalId,
        bedType: hospital.bedType,
        rank: hospital.rank,
        etaMinutes: hospital.travelMinutes,
        sentAt,
        respondsBy,
      });
      created.push(getOffer(id));
    }
    db.prepare(`UPDATE requests SET status = 'offering', updated_at = ? WHERE id = ?`).run(
      sentAt,
      requestId,
    );
  });
  txn.immediate();

  for (const offer of created) {
    broadcast("offer", offerPublicPayload(offer));
  }
}

export async function createRequest(params: {
  condition: string;
  lat: number;
  lng: number;
  mode: RequestMode;
}) {
  const conditionEntry = resolveCondition(params.condition);
  if (!conditionEntry) throw notFound(`Unknown condition: ${params.condition}`);

  const id = newId("req");
  const now = nowIso();
  db.prepare(
    `INSERT INTO requests (id, condition, bed_type, lat, lng, mode, status, created_at, updated_at)
     VALUES (@id, @condition, @bedType, @lat, @lng, @mode, 'offering', @now, @now)`,
  ).run({
    id,
    condition: params.condition,
    bedType: conditionEntry.bedType,
    lat: params.lat,
    lng: params.lng,
    mode: params.mode,
    now,
  });

  await offerNextBatch(id);
  return getRequestSummary(id);
}

export function getRequestSummary(requestId: string) {
  const request = getRequest(requestId);
  const offers = db
    .prepare(`SELECT * FROM offers WHERE request_id = ? ORDER BY sent_at, rank`)
    .all(requestId) as OfferRow[];
  const holds = db
    .prepare(`SELECT * FROM holds WHERE request_id = ? ORDER BY created_at`)
    .all(requestId) as HoldRow[];
  return { request, offers: offers.map(offerPublicPayload), holds };
}

/** Attempts to accept a pending offer; rechecks availability and creates the hold atomically. */
type AcceptResult =
  | { accepted: true; offerId: string; holdId: string; requestId: string }
  | { accepted: false; reason: string };

export function acceptOffer(offerId: string): AcceptResult {
  const runTxn = db.transaction((): AcceptResult => {
    const offer = getOffer(offerId);
    if (offer.status !== "pending") {
      return { accepted: false, reason: "This offer is no longer open." };
    }

    const snapshot = getBedSnapshot(offer.hospital_id, offer.bed_type);
    if (snapshot.effectiveFree <= 0) {
      const now = nowIso();
      db.prepare(
        `UPDATE offers SET status = 'expired', reject_reason = 'bed_no_longer_available', responded_at = ? WHERE id = ?`,
      ).run(now, offer.id);
      return { accepted: false, reason: "That bed was just taken by another request." };
    }

    const now = nowIso();
    const holdId = newId("hold");
    const expiresAt = new Date(Date.now() + rankingConfig.holdTtlMinutes * 60000).toISOString();

    db.prepare(
      `INSERT INTO holds (id, request_id, offer_id, hospital_id, bed_type, status, created_at, expires_at)
       VALUES (@id, @requestId, @offerId, @hospitalId, @bedType, 'active', @now, @expiresAt)`,
    ).run({
      id: holdId,
      requestId: offer.request_id,
      offerId: offer.id,
      hospitalId: offer.hospital_id,
      bedType: offer.bed_type,
      now,
      expiresAt,
    });

    db.prepare(`UPDATE offers SET status = 'accepted', responded_at = ? WHERE id = ?`).run(
      now,
      offer.id,
    );
    db.prepare(`UPDATE requests SET status = 'held', updated_at = ? WHERE id = ?`).run(
      now,
      offer.request_id,
    );
    db.prepare(
      `UPDATE offers SET status = 'superseded', responded_at = ? WHERE request_id = ? AND status = 'pending' AND id != ?`,
    ).run(now, offer.request_id, offer.id);

    return { accepted: true, offerId: offer.id, holdId, requestId: offer.request_id };
  });
  const result = runTxn.immediate();

  if (result.accepted) {
    const offer = getOffer(offerId);
    broadcast("offer", offerPublicPayload(offer));
    for (const other of db
      .prepare(`SELECT * FROM offers WHERE request_id = ? AND status = 'superseded'`)
      .all(offer.request_id) as OfferRow[]) {
      broadcast("offer", offerPublicPayload(other));
    }
    broadcast("hold", { requestId: offer.request_id, hospitalId: offer.hospital_id, status: "active" });
  } else {
    const offer = getOffer(offerId);
    broadcast("offer", offerPublicPayload(offer));
    if (offer.status === "expired") {
      void followUpAfterResolution(offer.request_id);
    }
  }

  return result;
}

export function rejectOffer(offerId: string, reason?: string): void {
  const offer = getOffer(offerId);
  if (offer.status !== "pending") throw conflict("This offer is no longer open.");

  const now = nowIso();
  db.prepare(
    `UPDATE offers SET status = 'rejected', reject_reason = ?, responded_at = ? WHERE id = ?`,
  ).run(reason ?? null, now, offer.id);

  broadcast("offer", offerPublicPayload(getOffer(offerId)));
  void followUpAfterResolution(offer.request_id);
}

/** Sequential: always move to the next hospital. Parallel: widen only once the whole batch is terminal. */
async function followUpAfterResolution(requestId: string) {
  const request = getRequest(requestId);
  if (request.status !== "offering") return;

  if (request.mode === "sequential") {
    await offerNextBatch(requestId);
    return;
  }

  const pending = db
    .prepare(`SELECT COUNT(*) AS n FROM offers WHERE request_id = ? AND status = 'pending'`)
    .get(requestId) as { n: number };
  if (pending.n === 0) {
    await offerNextBatch(requestId);
  }
}

export async function cancelRequest(requestId: string): Promise<void> {
  const request = getRequest(requestId);
  const now = nowIso();

  db.prepare(`UPDATE requests SET status = 'cancelled', updated_at = ? WHERE id = ?`).run(
    now,
    requestId,
  );
  db.prepare(
    `UPDATE holds SET status = 'released', released_at = ? WHERE request_id = ? AND status = 'active'`,
  ).run(now, requestId);
  db.prepare(
    `UPDATE offers SET status = 'superseded', responded_at = ? WHERE request_id = ? AND status = 'pending'`,
  ).run(now, requestId);

  broadcast("outcome", { requestId, status: "cancelled" });
  void request;
}

export function releaseHold(holdId: string): void {
  const hold = db.prepare(`SELECT * FROM holds WHERE id = ?`).get(holdId) as HoldRow | undefined;
  if (!hold) throw notFound("Hold not found.");
  if (hold.status !== "active") throw conflict("This hold is no longer active.");

  const now = nowIso();
  db.prepare(`UPDATE holds SET status = 'released', released_at = ? WHERE id = ?`).run(
    now,
    holdId,
  );
  broadcast("hold", { requestId: hold.request_id, hospitalId: hold.hospital_id, status: "released" });

  const request = getRequest(hold.request_id);
  if (request.status === "held") {
    db.prepare(`UPDATE requests SET status = 'offering', updated_at = ? WHERE id = ?`).run(
      now,
      hold.request_id,
    );
    void offerNextBatch(hold.request_id);
  }
}

export function markArrived(requestId: string): void {
  const request = getRequest(requestId);
  const hold = db
    .prepare(`SELECT * FROM holds WHERE request_id = ? AND status = 'active'`)
    .get(requestId) as HoldRow | undefined;
  if (!hold) throw conflict("No active hold for this request.");

  const now = nowIso();
  db.prepare(`UPDATE holds SET status = 'consumed' WHERE id = ?`).run(hold.id);
  db.prepare(`UPDATE requests SET status = 'arrived', updated_at = ? WHERE id = ?`).run(
    now,
    requestId,
  );

  applyBedUpdate({
    hospitalId: hold.hospital_id,
    bedType: hold.bed_type,
    delta: -1,
    source: "crew_feedback",
    eventType: "hold_consumed",
    note: `Arrival confirmed for request ${requestId}; estimated decrement pending nurse confirmation.`,
  });

  broadcast("outcome", { requestId, status: "arrived" });
  void request;
}

export function submitFeedback(requestId: string, bedWasThere: boolean): void {
  const request = getRequest(requestId);
  const hold = db
    .prepare(`SELECT * FROM holds WHERE request_id = ? ORDER BY created_at DESC LIMIT 1`)
    .get(requestId) as HoldRow | undefined;
  if (!hold) throw notFound("No hold on record for this request.");

  db.prepare(
    `INSERT INTO bed_events (hospital_id, bed_type, event_type, previous_free, next_free, source, actor, note, created_at)
     VALUES (@hospitalId, @bedType, 'crew_feedback', NULL, NULL, 'crew_feedback', NULL, @note, @createdAt)`,
  ).run({
    hospitalId: hold.hospital_id,
    bedType: hold.bed_type,
    note: `bedWasThere=${bedWasThere}`,
    createdAt: nowIso(),
  });

  if (!bedWasThere && request.status === "arrived") {
    applyBedUpdate({
      hospitalId: hold.hospital_id,
      bedType: hold.bed_type,
      delta: 1,
      source: "crew_feedback",
      eventType: "crew_feedback",
      note: `Correcting earlier auto-decrement: crew reported no bed on arrival for request ${requestId}.`,
    });
  }
}
