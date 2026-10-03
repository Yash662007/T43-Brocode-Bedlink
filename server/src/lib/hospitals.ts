import { db } from "../db/index.js";
import { getHospitalCapabilities, listSpecialistStatus } from "./capabilities.js";
import { listBedSnapshots } from "./beds.js";
import { formatFreshness } from "./freshness.js";

export type HospitalRow = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  is_govt: number;
  schemes: string;
  created_at: string;
};

export type Hospital = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  isGovt: boolean;
  schemes: string[];
  capabilities: string[];
};

export function listHospitals(): Hospital[] {
  const rows = db.prepare(`SELECT * FROM hospitals ORDER BY name`).all() as HospitalRow[];
  return rows.map(toHospital);
}

export function getHospital(id: string): Hospital | undefined {
  const row = db.prepare(`SELECT * FROM hospitals WHERE id = ?`).get(id) as
    | HospitalRow
    | undefined;
  return row ? toHospital(row) : undefined;
}

function toHospital(row: HospitalRow): Hospital {
  return {
    id: row.id,
    name: row.name,
    lat: row.lat,
    lng: row.lng,
    isGovt: Boolean(row.is_govt),
    schemes: JSON.parse(row.schemes) as string[],
    capabilities: getHospitalCapabilities(row.id),
  };
}

export function listHospitalsWithBeds() {
  return listHospitals().map((hospital) => ({
    ...hospital,
    diversion: getHospitalDiversion(hospital.id),
    reliability: getHospitalReliability(hospital.id),
    beds: listBedSnapshots(hospital.id).map((bed) => ({
      bedType: bed.bedType,
      free: bed.freeReported,
      effectiveFree: bed.effectiveFree,
      updatedAt: bed.updatedAt || null,
      freshness: formatFreshness(bed.ageMinutes, bed.unknown),
      ageMinutes: Number.isFinite(bed.ageMinutes) ? bed.ageMinutes : null,
      unknown: bed.unknown,
      source: bed.source,
      isSimulated: bed.source === "sim_feed",
    })),
    specialists: listSpecialistStatus(hospital.id),
  }));
}

export type HospitalDiversion = {
  isDiverted: boolean;
  reason?: string;
  divertedUntil?: string;
  updatedAt: string;
};

export function getHospitalDiversion(hospitalId: string): HospitalDiversion {
  const row = db
    .prepare(
      `SELECT is_diverted, reason, diverted_until, updated_at FROM hospital_diversions WHERE hospital_id = ?`,
    )
    .get(hospitalId) as
    | { is_diverted: number; reason: string | null; diverted_until: string | null; updated_at: string }
    | undefined;

  if (!row) {
    return { isDiverted: false, updatedAt: new Date(0).toISOString() };
  }

  const now = new Date().toISOString();
  const isActive = Boolean(row.is_diverted) && (!row.diverted_until || row.diverted_until > now);
  return {
    isDiverted: isActive,
    reason: row.reason ?? undefined,
    divertedUntil: row.diverted_until ?? undefined,
    updatedAt: row.updated_at,
  };
}

export function setHospitalDiversion(params: {
  hospitalId: string;
  isDiverted: boolean;
  reason?: string;
  durationMinutes?: number;
}): HospitalDiversion {
  const now = new Date().toISOString();
  let divertedUntil: string | null = null;
  if (params.isDiverted && params.durationMinutes && params.durationMinutes > 0) {
    divertedUntil = new Date(Date.now() + params.durationMinutes * 60000).toISOString();
  }

  db.prepare(
    `INSERT INTO hospital_diversions (hospital_id, is_diverted, reason, diverted_until, updated_at)
     VALUES (@hospitalId, @isDiverted, @reason, @divertedUntil, @updatedAt)
     ON CONFLICT(hospital_id) DO UPDATE SET
       is_diverted = @isDiverted,
       reason = @reason,
       diverted_until = @divertedUntil,
       updated_at = @updatedAt`,
  ).run({
    hospitalId: params.hospitalId,
    isDiverted: params.isDiverted ? 1 : 0,
    reason: params.reason ?? null,
    divertedUntil,
    updatedAt: now,
  });

  return getHospitalDiversion(params.hospitalId);
}

export type HospitalReliability = {
  totalFeedback: number;
  confirmedCount: number;
  accuracyRate: number;
};

export function getHospitalReliability(hospitalId: string): HospitalReliability {
  const rows = db
    .prepare(`SELECT note FROM bed_events WHERE hospital_id = ? AND event_type = 'crew_feedback'`)
    .all(hospitalId) as Array<{ note: string | null }>;

  const totalFeedback = rows.length;
  if (totalFeedback === 0) {
    return { totalFeedback: 0, confirmedCount: 0, accuracyRate: 100 };
  }

  const confirmedCount = rows.filter((r) => r.note && r.note.includes("bedWasThere=true")).length;
  const accuracyRate = Math.round((confirmedCount / totalFeedback) * 100);
  return { totalFeedback, confirmedCount, accuracyRate };
}

