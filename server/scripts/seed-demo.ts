import "dotenv/config";
import { db, runMigrations } from "../src/db/index.js";
import { nowIso } from "../src/lib/ids.js";
import { createToken } from "../src/lib/tokens.js";
import { setSpecialistOnCall } from "../src/lib/capabilities.js";
import { applyBedUpdate } from "../src/lib/beds.js";
import type { BedType } from "../src/config/index.js";

runMigrations();

type SeedHospital = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  isGovt: boolean;
  schemes: string[];
  capabilities: string[];
  beds: Partial<Record<BedType, number>>;
  staleBeds?: BedType[];
  specialistOn?: string[];
};

// Demo seed around a single metro area (Mumbai) so travel-time ranking has
// something meaningful to compare. Coordinates are approximate, not surveyed.
const HOSPITALS: SeedHospital[] = [
  {
    id: "city-general",
    name: "City General Hospital",
    lat: 19.076,
    lng: 72.8777,
    isGovt: false,
    schemes: ["CGHS"],
    capabilities: ["icu_unit", "ventilator_support", "oxygen_supply", "cardiac_cath_lab", "trauma_center"],
    beds: { icu: 3, ventilator: 1, oxygen: 6, cardiac: 2, burns: 0 },
    specialistOn: ["cardiac_cath_lab", "trauma_center"],
  },
  {
    id: "riverside",
    name: "Riverside Medical Centre",
    lat: 19.092,
    lng: 72.895,
    isGovt: false,
    schemes: [],
    capabilities: ["icu_unit", "ventilator_support", "oxygen_supply", "cardiac_cath_lab"],
    beds: { icu: 1, ventilator: 2, oxygen: 4, cardiac: 1, burns: 1 },
    specialistOn: ["cardiac_cath_lab"],
  },
  {
    id: "northside",
    name: "Northside Trauma Hospital",
    lat: 19.115,
    lng: 72.862,
    isGovt: true,
    schemes: ["Ayushman Bharat", "PMJAY"],
    capabilities: ["icu_unit", "ventilator_support", "oxygen_supply", "trauma_center", "neuro_stroke_unit"],
    beds: { icu: 2, ventilator: 0, oxygen: 8, cardiac: 0, burns: 0 },
    staleBeds: ["icu"],
    specialistOn: ["trauma_center", "neuro_stroke_unit"],
  },
  {
    id: "st-marys",
    name: "St. Mary's Hospital",
    lat: 19.05,
    lng: 72.84,
    isGovt: false,
    schemes: [],
    capabilities: ["icu_unit", "oxygen_supply", "burns_unit", "dialysis"],
    beds: { icu: 0, ventilator: 0, oxygen: 3, cardiac: 0, burns: 2 },
  },
  {
    id: "govt-district",
    name: "Govt. District Hospital",
    lat: 19.03,
    lng: 72.88,
    isGovt: true,
    schemes: ["Ayushman Bharat", "ESIC"],
    capabilities: ["icu_unit", "ventilator_support", "oxygen_supply", "burns_unit"],
    beds: { icu: 4, ventilator: 3, oxygen: 10, cardiac: 0, burns: 1 },
  },
  {
    id: "lakeview",
    name: "Lakeview Multispeciality",
    lat: 19.14,
    lng: 72.91,
    isGovt: false,
    schemes: ["CGHS", "Mediclaim Network"],
    capabilities: ["icu_unit", "ventilator_support", "oxygen_supply", "cardiac_cath_lab", "neuro_stroke_unit"],
    beds: { icu: 1, ventilator: 1, oxygen: 5, cardiac: 3, burns: 0 },
    specialistOn: ["cardiac_cath_lab"],
  },
];

const insertHospital = db.prepare(
  `INSERT INTO hospitals (id, name, lat, lng, is_govt, schemes, created_at)
   VALUES (@id, @name, @lat, @lng, @isGovt, @schemes, @createdAt)
   ON CONFLICT (id) DO UPDATE SET name=@name, lat=@lat, lng=@lng, is_govt=@isGovt, schemes=@schemes`,
);
const insertCapability = db.prepare(
  `INSERT OR IGNORE INTO hospital_capabilities (hospital_id, capability) VALUES (?, ?)`,
);

for (const hospital of HOSPITALS) {
  insertHospital.run({
    id: hospital.id,
    name: hospital.name,
    lat: hospital.lat,
    lng: hospital.lng,
    isGovt: hospital.isGovt ? 1 : 0,
    schemes: JSON.stringify(hospital.schemes),
    createdAt: nowIso(),
  });

  for (const capability of hospital.capabilities) {
    insertCapability.run(hospital.id, capability);
  }

  for (const [bedType, free] of Object.entries(hospital.beds) as Array<[BedType, number]>) {
    applyBedUpdate({
      hospitalId: hospital.id,
      bedType,
      value: free,
      source: "nurse_tap",
      actor: "demo-seed",
      eventType: "nurse_applied",
    });

    if (hospital.staleBeds?.includes(bedType)) {
      // Backdate this bed's timestamp well past its expiry so the demo can
      // show a real "unknown" confidence state out of the box.
      db.prepare(`UPDATE bed_status SET updated_at = ? WHERE hospital_id = ? AND bed_type = ?`).run(
        new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
        hospital.id,
        bedType,
      );
    }
  }

  for (const capability of hospital.specialistOn ?? []) {
    setSpecialistOnCall({ hospitalId: hospital.id, capability, isOn: true, source: "nurse_tap" });
  }

  // Fixed (not random) demo tokens so re-running the seed never invalidates
  // the token already sitting in the frontend's .env.
  const nurseToken = `demo-nurse-${hospital.id}`;
  const deskToken = `demo-desk-${hospital.id}`;
  const existingNurseToken = db.prepare(`SELECT token FROM hospital_tokens WHERE token = ?`).get(nurseToken);
  const existingDeskToken = db.prepare(`SELECT token FROM hospital_tokens WHERE token = ?`).get(deskToken);
  if (!existingNurseToken) {
    createToken({ hospitalId: hospital.id, role: "nurse", label: "Nurse station", token: nurseToken });
  }
  if (!existingDeskToken) {
    createToken({ hospitalId: hospital.id, role: "data_desk", label: "Data desk", token: deskToken });
  }

  console.log(`${hospital.name}:`);
  console.log(`  nurse token:      ${nurseToken}`);
  console.log(`  data-desk token:  ${deskToken}`);
}

console.log(`\nSeeded ${HOSPITALS.length} hospitals.`);
