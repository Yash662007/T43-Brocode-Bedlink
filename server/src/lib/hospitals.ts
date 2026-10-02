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
