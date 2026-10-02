import { db } from "../db/index.js";
import { capabilitiesConfig, rankingConfig } from "../config/index.js";
import { ageMinutes } from "./freshness.js";
import { nowIso } from "./ids.js";

export function getHospitalCapabilities(hospitalId: string): string[] {
  const rows = db
    .prepare(`SELECT capability FROM hospital_capabilities WHERE hospital_id = ?`)
    .all(hospitalId) as Array<{ capability: string }>;
  return rows.map((r) => r.capability);
}

function getSpecialistRow(hospitalId: string, capability: string) {
  return db
    .prepare(
      `SELECT is_on, updated_at FROM specialist_on_call WHERE hospital_id = ? AND capability = ?`,
    )
    .get(hospitalId, capability) as { is_on: number; updated_at: string } | undefined;
}

function isSpecialistFresh(hospitalId: string, capability: string): boolean {
  const row = getSpecialistRow(hospitalId, capability);
  if (!row || !row.is_on) return false;
  return ageMinutes(row.updated_at) <= rankingConfig.specialistFreshnessMinutes;
}

/** A capability that needs a specialist counts as available only if the flag is on and fresh. */
export function hasCapability(hospitalId: string, capability: string): boolean {
  const owned = getHospitalCapabilities(hospitalId);
  if (!owned.includes(capability)) return false;

  const meta = capabilitiesConfig.capabilities[capability];
  if (!meta?.needsSpecialist) return true;

  return isSpecialistFresh(hospitalId, capability);
}

export function hasAllCapabilities(hospitalId: string, required: string[]): boolean {
  return required.every((cap) => hasCapability(hospitalId, cap));
}

export type SpecialistStatus = {
  capability: string;
  label: string;
  isOn: boolean;
  isFresh: boolean;
  updatedAt: string | null;
};

/** The hospital's own specialist-gated capabilities, with current on-call status. */
export function listSpecialistStatus(hospitalId: string): SpecialistStatus[] {
  const owned = getHospitalCapabilities(hospitalId);
  return owned
    .filter((cap) => capabilitiesConfig.capabilities[cap]?.needsSpecialist)
    .map((cap) => {
      const row = getSpecialistRow(hospitalId, cap);
      const isOn = Boolean(row?.is_on);
      return {
        capability: cap,
        label: capabilitiesConfig.capabilities[cap]?.label ?? cap,
        isOn,
        isFresh: isOn && ageMinutes(row!.updated_at) <= rankingConfig.specialistFreshnessMinutes,
        updatedAt: row?.updated_at ?? null,
      };
    });
}

export function setSpecialistOnCall(params: {
  hospitalId: string;
  capability: string;
  isOn: boolean;
  source: string;
}) {
  db.prepare(
    `INSERT INTO specialist_on_call (hospital_id, capability, is_on, updated_at, source)
     VALUES (@hospitalId, @capability, @isOn, @updatedAt, @source)
     ON CONFLICT (hospital_id, capability) DO UPDATE SET
       is_on = @isOn, updated_at = @updatedAt, source = @source`,
  ).run({
    hospitalId: params.hospitalId,
    capability: params.capability,
    isOn: params.isOn ? 1 : 0,
    updatedAt: nowIso(),
    source: params.source,
  });
}
