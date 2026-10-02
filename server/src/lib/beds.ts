import { db } from "../db/index.js";
import { BED_TYPES, type BedType } from "../config/index.js";
import { ageMinutes, isExpired } from "./freshness.js";
import { nowIso } from "./ids.js";
import { broadcast } from "./sse.js";

export type BedStatusRow = {
  hospital_id: string;
  bed_type: BedType;
  free_reported: number;
  updated_at: string;
  source: string;
};

export type BedSnapshot = {
  bedType: BedType;
  freeReported: number;
  effectiveFree: number;
  activeHolds: number;
  updatedAt: string;
  ageMinutes: number;
  unknown: boolean;
  source: string;
};

export function countActiveHolds(hospitalId: string, bedType: BedType): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM holds WHERE hospital_id = ? AND bed_type = ? AND status = 'active'`,
    )
    .get(hospitalId, bedType) as { n: number };
  return row.n;
}

export function getBedSnapshot(hospitalId: string, bedType: BedType): BedSnapshot {
  const row = db
    .prepare(`SELECT * FROM bed_status WHERE hospital_id = ? AND bed_type = ?`)
    .get(hospitalId, bedType) as BedStatusRow | undefined;

  const activeHolds = countActiveHolds(hospitalId, bedType);

  if (!row) {
    return {
      bedType,
      freeReported: 0,
      effectiveFree: 0,
      activeHolds,
      updatedAt: "",
      ageMinutes: Number.POSITIVE_INFINITY,
      unknown: true,
      source: "estimate",
    };
  }

  const ageMin = ageMinutes(row.updated_at);
  const unknown = isExpired(bedType, ageMin);
  const effectiveFree = Math.max(0, row.free_reported - activeHolds);

  return {
    bedType,
    freeReported: row.free_reported,
    effectiveFree,
    activeHolds,
    updatedAt: row.updated_at,
    ageMinutes: ageMin,
    unknown,
    source: row.source,
  };
}

export function listBedSnapshots(hospitalId: string): BedSnapshot[] {
  return BED_TYPES.map((bedType) => getBedSnapshot(hospitalId, bedType));
}

export type ApplyBedUpdateInput = {
  hospitalId: string;
  bedType: BedType;
  delta?: number;
  value?: number;
  stillCorrect?: boolean;
  source: string;
  actor?: string;
  eventType: string;
  note?: string;
};

/** Atomically applies a bed count change and appends an audit event. */
export function applyBedUpdate(input: ApplyBedUpdateInput): BedSnapshot {
  const txn = db.transaction(() => {
    const current = db
      .prepare(`SELECT free_reported FROM bed_status WHERE hospital_id = ? AND bed_type = ?`)
      .get(input.hospitalId, input.bedType) as { free_reported: number } | undefined;

    const previousFree = current?.free_reported ?? 0;
    let nextFree = previousFree;
    if (input.stillCorrect) {
      nextFree = previousFree;
    } else if (typeof input.value === "number") {
      nextFree = input.value;
    } else if (typeof input.delta === "number") {
      nextFree = previousFree + input.delta;
    }
    nextFree = Math.max(0, Math.round(nextFree));

    const updatedAt = nowIso();
    db.prepare(
      `INSERT INTO bed_status (hospital_id, bed_type, free_reported, updated_at, source)
       VALUES (@hospitalId, @bedType, @nextFree, @updatedAt, @source)
       ON CONFLICT (hospital_id, bed_type) DO UPDATE SET
         free_reported = @nextFree, updated_at = @updatedAt, source = @source`,
    ).run({
      hospitalId: input.hospitalId,
      bedType: input.bedType,
      nextFree,
      updatedAt,
      source: input.source,
    });

    db.prepare(
      `INSERT INTO bed_events (hospital_id, bed_type, event_type, previous_free, next_free, source, actor, note, created_at)
       VALUES (@hospitalId, @bedType, @eventType, @previousFree, @nextFree, @source, @actor, @note, @createdAt)`,
    ).run({
      hospitalId: input.hospitalId,
      bedType: input.bedType,
      eventType: input.eventType,
      previousFree,
      nextFree,
      source: input.source,
      actor: input.actor ?? null,
      note: input.note ?? null,
      createdAt: updatedAt,
    });
  });

  txn();

  const snapshot = getBedSnapshot(input.hospitalId, input.bedType);
  broadcast("bed-change", { hospitalId: input.hospitalId, ...snapshot });
  return snapshot;
}

/** Logs an audit-only event (e.g. an AI-proposed suggestion) without touching bed_status. */
export function logBedEvent(input: {
  hospitalId: string;
  bedType: BedType;
  eventType: string;
  previousFree?: number | null;
  nextFree?: number | null;
  source: string;
  actor?: string | null;
  note?: string | null;
}) {
  db.prepare(
    `INSERT INTO bed_events (hospital_id, bed_type, event_type, previous_free, next_free, source, actor, note, created_at)
     VALUES (@hospitalId, @bedType, @eventType, @previousFree, @nextFree, @source, @actor, @note, @createdAt)`,
  ).run({
    hospitalId: input.hospitalId,
    bedType: input.bedType,
    eventType: input.eventType,
    previousFree: input.previousFree ?? null,
    nextFree: input.nextFree ?? null,
    source: input.source,
    actor: input.actor ?? null,
    note: input.note ?? null,
    createdAt: nowIso(),
  });
}

export function listBedEvents(hospitalId: string, limit = 50) {
  return db
    .prepare(
      `SELECT * FROM bed_events WHERE hospital_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`,
    )
    .all(hospitalId, limit);
}
