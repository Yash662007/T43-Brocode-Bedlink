import "dotenv/config";
import { db, runMigrations } from "../src/db/index.js";
import { nowIso } from "../src/lib/ids.js";
import { createToken } from "../src/lib/tokens.js";
import { setSpecialistOnCall } from "../src/lib/capabilities.js";
import { applyBedUpdate } from "../src/lib/beds.js";
import type { BedType } from "../src/config/index.js";

runMigrations();

console.log("Cleaning existing demo data...");
db.exec(`
  DELETE FROM request_telemetry;
  DELETE FROM holds;
  DELETE FROM offers;
  DELETE FROM requests;
  DELETE FROM bed_events;
  DELETE FROM bed_status;
  DELETE FROM specialist_on_call;
  DELETE FROM hospital_capabilities;
  DELETE FROM hospital_diversions;
  DELETE FROM telegram_links;
  DELETE FROM hospital_tokens;
  DELETE FROM hospitals;
`);

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

// Realistic Mumbai Metropolitan emergency network
const HOSPITALS: SeedHospital[] = [
  {
    id: "city-general",
    name: "City General Hospital",
    lat: 19.076,
    lng: 72.8777,
    isGovt: false,
    schemes: ["CGHS", "PMJAY", "Tata Memorial Network"],
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
    schemes: ["Corporate TPA", "Mediclaim Network"],
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
    schemes: ["Ayushman Bharat", "PMJAY", "MJPJAY"],
    capabilities: ["icu_unit", "ventilator_support", "oxygen_supply", "trauma_center", "neuro_stroke_unit"],
    beds: { icu: 2, ventilator: 0, oxygen: 8, cardiac: 0, burns: 0 },
    staleBeds: ["icu"], // Updated 4 hours ago for Feature 1 (unknown confidence state)
    specialistOn: ["trauma_center", "neuro_stroke_unit"],
  },
  {
    id: "lakeview",
    name: "Lakeview Multispeciality",
    lat: 19.14,
    lng: 72.91,
    isGovt: false,
    schemes: ["CGHS", "PMJAY", "HDFC ERGO TPA"],
    capabilities: ["icu_unit", "ventilator_support", "oxygen_supply", "cardiac_cath_lab", "neuro_stroke_unit"],
    beds: { icu: 2, ventilator: 1, oxygen: 5, cardiac: 3, burns: 0 },
    specialistOn: ["cardiac_cath_lab", "neuro_stroke_unit"],
  },
  {
    id: "govt-district",
    name: "Govt. District Hospital",
    lat: 19.03,
    lng: 72.88,
    isGovt: true,
    schemes: ["Ayushman Bharat", "MJPJAY", "ESIC"],
    capabilities: ["icu_unit", "ventilator_support", "oxygen_supply", "burns_unit", "trauma_center"],
    beds: { icu: 4, ventilator: 3, oxygen: 10, cardiac: 0, burns: 1 },
    specialistOn: ["trauma_center"],
  },
  {
    id: "st-marys",
    name: "St. Mary's Hospital",
    lat: 19.05,
    lng: 72.84,
    isGovt: false,
    schemes: ["Holy Family Trust", "Charity Desk"],
    capabilities: ["icu_unit", "oxygen_supply", "burns_unit", "dialysis"],
    beds: { icu: 0, ventilator: 0, oxygen: 3, cardiac: 0, burns: 2 },
    specialistOn: [],
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

const nowMs = Date.now();
const minutesAgo = (mins: number) => new Date(nowMs - mins * 60 * 1000).toISOString();
const hoursAgo = (hrs: number) => new Date(nowMs - hrs * 3600 * 1000).toISOString();

for (const hospital of HOSPITALS) {
  insertHospital.run({
    id: hospital.id,
    name: hospital.name,
    lat: hospital.lat,
    lng: hospital.lng,
    isGovt: hospital.isGovt ? 1 : 0,
    schemes: JSON.stringify(hospital.schemes),
    createdAt: hoursAgo(24),
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
      // Backdate this bed's timestamp well past its expiry (4 hours ago) so the demo shows
      // an authentic "unknown" confidence state out of the box.
      db.prepare(`UPDATE bed_status SET updated_at = ? WHERE hospital_id = ? AND bed_type = ?`).run(
        hoursAgo(4),
        hospital.id,
        bedType,
      );
    }
  }

  for (const capability of hospital.specialistOn ?? []) {
    setSpecialistOnCall({ hospitalId: hospital.id, capability, isOn: true, source: "nurse_tap" });
  }

  const nurseToken = `demo-nurse-${hospital.id}`;
  const deskToken = `demo-desk-${hospital.id}`;
  createToken({ hospitalId: hospital.id, role: "nurse", label: "Nurse station", token: nurseToken });
  createToken({ hospitalId: hospital.id, role: "data_desk", label: "Data desk", token: deskToken });

  console.log(`Seeded hospital: ${hospital.name}`);
}

// Remove raw initialization audit rows so the audit trail consists exclusively of
// authentic clinical nurse logs, AI reviews, and handover records.
db.prepare(`DELETE FROM bed_events WHERE actor = 'demo-seed'`).run();

// ---------------------------------------------------------------------------
// 1. Feature 3 Demo: Active Hospital Diversion on Northside Trauma Hospital
// ---------------------------------------------------------------------------
db.prepare(
  `INSERT INTO hospital_diversions (hospital_id, is_diverted, reason, diverted_until, updated_at)
   VALUES (?, 1, ?, ?, ?)`,
).run(
  "northside",
  "CT Scanner failure & ED Resuscitation Bay capacity reached",
  new Date(nowMs + 45 * 60 * 1000).toISOString(),
  minutesAgo(15),
);
console.log("Seeded active ED Diversion on Northside Trauma Hospital.");

// ---------------------------------------------------------------------------
// 2. Feature 4 Demo: Historical Crew Feedback (Bed Verification Accuracy)
// ---------------------------------------------------------------------------
const insertFeedback = db.prepare(
  `INSERT INTO bed_events (hospital_id, bed_type, event_type, previous_free, next_free, source, actor, note, created_at)
   VALUES (@hospitalId, @bedType, 'crew_feedback', NULL, NULL, 'crew_feedback', NULL, @note, @createdAt)`,
);

const feedbackData: Array<{ hospitalId: string; bedType: BedType; confirmed: number; denied: number }> = [
  { hospitalId: "city-general", bedType: "icu", confirmed: 14, denied: 1 }, // 93% verified
  { hospitalId: "riverside", bedType: "cardiac", confirmed: 8, denied: 1 }, // 89% verified
  { hospitalId: "northside", bedType: "icu", confirmed: 4, denied: 2 }, // 67% verified (triggers amber alert)
  { hospitalId: "lakeview", bedType: "cardiac", confirmed: 7, denied: 0 }, // 100% verified
  { hospitalId: "govt-district", bedType: "icu", confirmed: 8, denied: 2 }, // 80% verified
  { hospitalId: "st-marys", bedType: "burns", confirmed: 5, denied: 0 }, // 100% verified
];

for (const fb of feedbackData) {
  for (let i = 0; i < fb.confirmed; i++) {
    insertFeedback.run({
      hospitalId: fb.hospitalId,
      bedType: fb.bedType,
      note: "bedWasThere=true",
      createdAt: hoursAgo(1 + i * 2.5),
    });
  }
  for (let j = 0; j < fb.denied; j++) {
    insertFeedback.run({
      hospitalId: fb.hospitalId,
      bedType: fb.bedType,
      note: "bedWasThere=false",
      createdAt: hoursAgo(2 + j * 5),
    });
  }
}
console.log("Seeded historical crew arrival feedback for reliability metrics.");

// ---------------------------------------------------------------------------
// 3. Nurse Audit History: Rich clinical events for City General
// ---------------------------------------------------------------------------
const insertAudit = db.prepare(
  `INSERT INTO bed_events (hospital_id, bed_type, event_type, previous_free, next_free, source, actor, note, created_at)
   VALUES (@hospitalId, @bedType, @eventType, @previousFree, @nextFree, @source, @actor, @note, @createdAt)`,
);

const cityGeneralEvents = [
  {
    bedType: "icu",
    eventType: "nurse_applied",
    previousFree: 4,
    nextFree: 3,
    source: "nurse_tap",
    actor: "Priya Sharma, RN (MICU Charge)",
    note: "Morning shift audit reconciliation: Bed 4 occupied by emergency admission from Trauma bay.",
    createdAt: hoursAgo(11.5),
  },
  {
    bedType: "oxygen",
    eventType: "nurse_applied",
    previousFree: 5,
    nextFree: 6,
    source: "nurse_tap",
    actor: "Anjali Deshmukh, RN (Shift Lead)",
    note: "Central oxygen manifold refill completed; Bed 12 in ward annex brought online.",
    createdAt: hoursAgo(10.2),
  },
  {
    bedType: "ventilator",
    eventType: "ai_proposed",
    previousFree: 2,
    nextFree: 1,
    source: "estimate",
    actor: "ai-review",
    note: "AI transcript parsed: 'Extubated patient in Bed 2 moved to Step-down, 1 vent operational'",
    createdAt: hoursAgo(9.5),
  },
  {
    bedType: "ventilator",
    eventType: "nurse_applied",
    previousFree: 2,
    nextFree: 1,
    source: "nurse_tap",
    actor: "David Miller, RN (Triage Desk)",
    note: "Confirmed extubation note: Ventilator 02 sterilized and placed on maintenance cycle.",
    createdAt: hoursAgo(9.2),
  },
  {
    bedType: "cardiac",
    eventType: "nurse_applied",
    previousFree: 3,
    nextFree: 2,
    source: "nurse_tap",
    actor: "Sunita Patel, Staff RN",
    note: "Emergency arrival from 108 Ambulance Unit MH-02-AK-1402 (STEMI). Transferred directly to Cath Lab.",
    createdAt: hoursAgo(8.4),
  },
  {
    bedType: "icu",
    eventType: "phoned_in",
    previousFree: 3,
    nextFree: 2,
    source: "phoned_in",
    actor: "Desk Officer Verma (Regional Dispatch)",
    note: "Phoned-in reservation: Code Blue step-down from OT 3 requiring isolation ICU bed.",
    createdAt: hoursAgo(7.5),
  },
  {
    bedType: "icu",
    eventType: "restored",
    previousFree: 2,
    nextFree: 3,
    source: "restore",
    actor: "Priya Sharma, RN (MICU Charge)",
    note: "Restored earlier count: OT 3 transfer redirected to Surgical ICU Annex, Bed 03 remains free.",
    createdAt: hoursAgo(6.8),
  },
  {
    bedType: "cardiac",
    eventType: "nurse_applied",
    previousFree: 2,
    nextFree: 1,
    source: "nurse_tap",
    actor: "Kavita Rao, Charge Nurse",
    note: "Unstable angina patient admitted under Dr. Sen (Interventional Cardiology).",
    createdAt: hoursAgo(5.9),
  },
  {
    bedType: "cardiac",
    eventType: "ai_proposed",
    previousFree: 1,
    nextFree: 2,
    source: "estimate",
    actor: "ai-review",
    note: "AI voice transcript: 'Post-angioplasty patient transferred to step-down telemetry; cardiac bed available.'",
    createdAt: hoursAgo(4.7),
  },
  {
    bedType: "cardiac",
    eventType: "nurse_applied",
    previousFree: 1,
    nextFree: 2,
    source: "nurse_tap",
    actor: "Anjali Deshmukh, RN (Shift Lead)",
    note: "Confirmed post-PCI transfer to Step-Down ward; Cardiac Bed 02 prepped for intake.",
    createdAt: hoursAgo(4.3),
  },
  {
    bedType: "icu",
    eventType: "hold_consumed",
    previousFree: 3,
    nextFree: 2,
    source: "crew_feedback",
    actor: "108 Paramedic Deshmukh (Unit MH-02-ER-991)",
    note: "Arrival confirmed for dispatch request req_trauma_103; patient admitted to Resuscitation Bay 1.",
    createdAt: hoursAgo(3.5),
  },
  {
    bedType: "icu",
    eventType: "nurse_applied",
    previousFree: 2,
    nextFree: 3,
    source: "nurse_tap",
    actor: "David Miller, RN (Triage Desk)",
    note: "Trauma observation cleared; patient mobilized to orthopedic step-down; ICU Bed 1 returned to service.",
    createdAt: hoursAgo(2.6),
  },
  {
    bedType: "oxygen",
    eventType: "ai_proposed",
    previousFree: 6,
    nextFree: 7,
    source: "estimate",
    actor: "ai-review",
    note: "AI transcript proposal: 'Discharge orders signed for Bed 08 in Respiratory Isolation Wing.'",
    createdAt: hoursAgo(1.8),
  },
  {
    bedType: "ventilator",
    eventType: "nurse_applied",
    previousFree: 1,
    nextFree: 0,
    source: "nurse_tap",
    actor: "Sunita Patel, Staff RN",
    note: "Emergency intubation in ED Bay 2 for severe acute bronchospasm; Ventilator 1 deployed.",
    createdAt: minutesAgo(50),
  },
  {
    bedType: "ventilator",
    eventType: "restored",
    previousFree: 0,
    nextFree: 1,
    source: "restore",
    actor: "Priya Sharma, RN (MICU Charge)",
    note: "Restored ventilator count: Transport Hamilton ventilator utilized; stationary ICU Ventilator 01 free.",
    createdAt: minutesAgo(32),
  },
  {
    bedType: "icu",
    eventType: "nurse_confirmed",
    previousFree: 3,
    nextFree: 3,
    source: "nurse_tap",
    actor: "Anjali Deshmukh, RN (Shift Lead)",
    note: "Afternoon shift census check: All 3 ICU beds staffed, monitored, and verified available.",
    createdAt: minutesAgo(18),
  },
  {
    bedType: "oxygen",
    eventType: "nurse_confirmed",
    previousFree: 6,
    nextFree: 6,
    source: "nurse_tap",
    actor: "Priya Sharma, RN (MICU Charge)",
    note: "Central O2 pressure regular at 4.2 bar; all 6 oxygen points verified operational.",
    createdAt: minutesAgo(6),
  },
];

for (const ev of cityGeneralEvents) {
  insertAudit.run({
    hospitalId: "city-general",
    bedType: ev.bedType,
    eventType: ev.eventType,
    previousFree: ev.previousFree,
    nextFree: ev.nextFree,
    source: ev.source,
    actor: ev.actor,
    note: ev.note,
    createdAt: ev.createdAt,
  });
}

// Regional events for other hospitals
const regionalEvents = [
  {
    hospitalId: "riverside",
    bedType: "ventilator",
    eventType: "nurse_applied",
    previousFree: 1,
    nextFree: 2,
    source: "nurse_tap",
    actor: "Dr. Cyrus Mistry (ED Chief)",
    note: "Ventilator 2 online after biomedical sensor recalibration and sterile filter replacement.",
    createdAt: hoursAgo(2.1),
  },
  {
    hospitalId: "riverside",
    bedType: "cardiac",
    eventType: "nurse_applied",
    previousFree: 0,
    nextFree: 1,
    source: "nurse_tap",
    actor: "Rita Sen, RN",
    note: "Cath lab observation patient discharged home; Cardiac Bed 01 released.",
    createdAt: hoursAgo(1.2),
  },
  {
    hospitalId: "northside",
    bedType: "icu",
    eventType: "nurse_applied",
    previousFree: 3,
    nextFree: 2,
    source: "nurse_tap",
    actor: "Kiran More, Charge Nurse",
    note: "Trauma resuscitation bay capacity reached; ED diversion status activated.",
    createdAt: minutesAgo(40),
  },
  {
    hospitalId: "lakeview",
    bedType: "cardiac",
    eventType: "nurse_applied",
    previousFree: 2,
    nextFree: 3,
    source: "nurse_tap",
    actor: "Dr. Neha Kapoor (Cardiology)",
    note: "Elective stenting patient moved to day care; telemetry bed available.",
    createdAt: hoursAgo(3.1),
  },
  {
    hospitalId: "govt-district",
    bedType: "burns",
    eventType: "nurse_applied",
    previousFree: 0,
    nextFree: 1,
    source: "nurse_tap",
    actor: "Sunil Jadhav, Staff Nurse",
    note: "Burns isolation unit Bed 1 terminal cleaning completed, sterile dressing kit prepped.",
    createdAt: hoursAgo(1.5),
  },
];

for (const ev of regionalEvents) {
  insertAudit.run({
    hospitalId: ev.hospitalId,
    bedType: ev.bedType,
    eventType: ev.eventType,
    previousFree: ev.previousFree,
    nextFree: ev.nextFree,
    source: ev.source,
    actor: ev.actor,
    note: ev.note,
    createdAt: ev.createdAt,
  });
}
console.log("Seeded rich clinical bed audit trail for City General and regional centers.");

// ---------------------------------------------------------------------------
// 4. Completed Emergency Requests with Telemetry, Offers, and Holds
// ---------------------------------------------------------------------------
const insertRequest = db.prepare(
  `INSERT INTO requests (id, condition, bed_type, lat, lng, mode, status, created_at, updated_at)
   VALUES (@id, @condition, @bedType, @lat, @lng, @mode, @status, @createdAt, @updatedAt)`,
);
const insertTelemetry = db.prepare(
  `INSERT INTO request_telemetry (request_id, age, gender, heart_rate, bp_sys, bp_dia, spo2, gcs, acuity, notes, created_at)
   VALUES (@requestId, @age, @gender, @heartRate, @bpSys, @bpDia, @spo2, @gcs, @acuity, @notes, @createdAt)`,
);
const insertOffer = db.prepare(
  `INSERT INTO offers (id, request_id, hospital_id, bed_type, rank, status, eta_minutes, sent_at, responds_by, responded_at, reject_reason)
   VALUES (@id, @requestId, @hospitalId, @bedType, @rank, @status, @etaMinutes, @sentAt, @respondsBy, @respondedAt, @rejectReason)`,
);
const insertHold = db.prepare(
  `INSERT INTO holds (id, request_id, offer_id, hospital_id, bed_type, status, created_at, expires_at, released_at)
   VALUES (@id, @requestId, @offerId, @hospitalId, @bedType, @status, @createdAt, @expiresAt, @releasedAt)`,
);

const completedRequests = [
  {
    id: "req-cardiac-101",
    condition: "chest_pain",
    bedType: "cardiac",
    lat: 19.068,
    lng: 72.855,
    mode: "sequential",
    status: "arrived",
    createdAt: hoursAgo(3.8),
    updatedAt: hoursAgo(3.3),
    hospitalId: "city-general",
    telemetry: {
      age: 58,
      gender: "M",
      heartRate: 114,
      bpSys: 152,
      bpDia: 96,
      spo2: 95,
      gcs: 15,
      acuity: "red",
      notes: "Acute crushing retrosternal chest pain radiating to left jaw x 45 min. ECG shows marked 3.5mm ST elevations in V1-V4 with reciprocal lead II/III depressions. Dual antiplatelets loaded en route. Primary PCI team alerted.",
    },
    offers: [
      {
        id: "off-cardiac-101-1",
        hospitalId: "city-general",
        rank: 1,
        status: "accepted",
        etaMinutes: 8.5,
        sentAt: hoursAgo(3.8),
        respondsBy: hoursAgo(3.76),
        respondedAt: hoursAgo(3.77),
        rejectReason: null,
      },
    ],
    hold: {
      id: "hld-cardiac-101",
      offerId: "off-cardiac-101-1",
      hospitalId: "city-general",
      bedType: "cardiac",
      status: "consumed",
      createdAt: hoursAgo(3.77),
      expiresAt: hoursAgo(3.27),
      releasedAt: null,
    },
  },
  {
    id: "req-stroke-102",
    condition: "stroke",
    bedType: "icu",
    lat: 19.13,
    lng: 72.9,
    mode: "sequential",
    status: "arrived",
    createdAt: hoursAgo(2.9),
    updatedAt: hoursAgo(2.4),
    hospitalId: "lakeview",
    telemetry: {
      age: 66,
      gender: "F",
      heartRate: 84,
      bpSys: 182,
      bpDia: 104,
      spo2: 97,
      gcs: 12,
      acuity: "red",
      notes: "Sudden onset right facial droop, right arm hemiplegia, expressive dysphasia. Last Known Well 40 minutes prior to dispatch. Rapid Blood Sugar: 118 mg/dL. Code Stroke team on hot standby for IV thrombolysis.",
    },
    offers: [
      {
        id: "off-stroke-102-1",
        hospitalId: "lakeview",
        rank: 1,
        status: "accepted",
        etaMinutes: 6.2,
        sentAt: hoursAgo(2.9),
        respondsBy: hoursAgo(2.86),
        respondedAt: hoursAgo(2.87),
        rejectReason: null,
      },
    ],
    hold: {
      id: "hld-stroke-102",
      offerId: "off-stroke-102-1",
      hospitalId: "lakeview",
      bedType: "icu",
      status: "consumed",
      createdAt: hoursAgo(2.87),
      expiresAt: hoursAgo(2.37),
      releasedAt: null,
    },
  },
  {
    id: "req-trauma-103",
    condition: "major_trauma",
    bedType: "icu",
    lat: 19.08,
    lng: 72.865,
    mode: "sequential",
    status: "arrived",
    createdAt: hoursAgo(2.3),
    updatedAt: hoursAgo(1.8),
    hospitalId: "city-general",
    telemetry: {
      age: 26,
      gender: "M",
      heartRate: 132,
      bpSys: 88,
      bpDia: 54,
      spo2: 91,
      gcs: 10,
      acuity: "red",
      notes: "Two-wheeler vs heavy truck on SCLR flyover. Unresponsive at scene. Bilateral open femur fractures, massive pelvic instability, blunt abdominal trauma FAST positive. Rapid infuser & 2 units O-negative blood on deck.",
    },
    // Demonstrates escalation history! First offer to Northside declined due to diversion, escalated to City General.
    offers: [
      {
        id: "off-trauma-103-1",
        hospitalId: "northside",
        rank: 1,
        status: "declined",
        etaMinutes: 6.0,
        sentAt: hoursAgo(2.3),
        respondsBy: hoursAgo(2.26),
        respondedAt: hoursAgo(2.28),
        rejectReason: "Resuscitation bays full; trauma diversion active",
      },
      {
        id: "off-trauma-103-2",
        hospitalId: "city-general",
        rank: 2,
        status: "accepted",
        etaMinutes: 9.0,
        sentAt: hoursAgo(2.27),
        respondsBy: hoursAgo(2.23),
        respondedAt: hoursAgo(2.25),
        rejectReason: null,
      },
    ],
    hold: {
      id: "hld-trauma-103",
      offerId: "off-trauma-103-2",
      hospitalId: "city-general",
      bedType: "icu",
      status: "consumed",
      createdAt: hoursAgo(2.25),
      expiresAt: hoursAgo(1.75),
      releasedAt: null,
    },
  },
  {
    id: "req-resp-104",
    condition: "respiratory_distress",
    bedType: "ventilator",
    lat: 19.098,
    lng: 72.888,
    mode: "sequential",
    status: "arrived",
    createdAt: hoursAgo(1.6),
    updatedAt: hoursAgo(1.2),
    hospitalId: "riverside",
    telemetry: {
      age: 49,
      gender: "F",
      heartRate: 128,
      bpSys: 142,
      bpDia: 90,
      spo2: 84,
      gcs: 14,
      acuity: "red",
      notes: "Known COPD exacerbation. Severe respiratory fatigue, biphasic wheezing, central cyanosis. 15L non-rebreather mask attached. 3 cycles Combivent nebulized. RSI kit prepped by flight paramedic.",
    },
    offers: [
      {
        id: "off-resp-104-1",
        hospitalId: "riverside",
        rank: 1,
        status: "accepted",
        etaMinutes: 7.0,
        sentAt: hoursAgo(1.6),
        respondsBy: hoursAgo(1.56),
        respondedAt: hoursAgo(1.57),
        rejectReason: null,
      },
    ],
    hold: {
      id: "hld-resp-104",
      offerId: "off-resp-104-1",
      hospitalId: "riverside",
      bedType: "ventilator",
      status: "consumed",
      createdAt: hoursAgo(1.57),
      expiresAt: hoursAgo(1.07),
      releasedAt: null,
    },
  },
  {
    id: "req-sepsis-105",
    condition: "sepsis",
    bedType: "icu",
    lat: 19.035,
    lng: 72.875,
    mode: "sequential",
    status: "arrived",
    createdAt: hoursAgo(1.1),
    updatedAt: minutesAgo(45),
    hospitalId: "govt-district",
    telemetry: {
      age: 73,
      gender: "M",
      heartRate: 126,
      bpSys: 80,
      bpDia: 44,
      spo2: 92,
      gcs: 11,
      acuity: "red",
      notes: "Severe urosepsis with septic shock. Rigors, core temp 39.8°C, serum lactate estimated >4 mmol/L. Vasopressor infusion initiated en route via 18G peripheral line. Broad-spectrum empiric antibiotics prepped.",
    },
    offers: [
      {
        id: "off-sepsis-105-1",
        hospitalId: "govt-district",
        rank: 1,
        status: "accepted",
        etaMinutes: 5.5,
        sentAt: hoursAgo(1.1),
        respondsBy: hoursAgo(1.06),
        respondedAt: hoursAgo(1.07),
        rejectReason: null,
      },
    ],
    hold: {
      id: "hld-sepsis-105",
      offerId: "off-sepsis-105-1",
      hospitalId: "govt-district",
      bedType: "icu",
      status: "consumed",
      createdAt: hoursAgo(1.07),
      expiresAt: minutesAgo(37),
      releasedAt: null,
    },
  },
  {
    id: "req-burns-106",
    condition: "severe_burns",
    bedType: "burns",
    lat: 19.055,
    lng: 72.835,
    mode: "sequential",
    status: "arrived",
    createdAt: minutesAgo(50),
    updatedAt: minutesAgo(20),
    hospitalId: "st-marys",
    telemetry: {
      age: 31,
      gender: "M",
      heartRate: 110,
      bpSys: 118,
      bpDia: 78,
      spo2: 99,
      gcs: 15,
      acuity: "yellow",
      notes: "Flash electrical burn at commercial workshop. Second-degree burns to bilateral forearms and chest (~18% TBSA). Clean sterile saline dressings applied. Pain managed with IV Fentanyl 50 mcg.",
    },
    offers: [
      {
        id: "off-burns-106-1",
        hospitalId: "st-marys",
        rank: 1,
        status: "accepted",
        etaMinutes: 4.8,
        sentAt: minutesAgo(50),
        respondsBy: minutesAgo(46),
        respondedAt: minutesAgo(47),
        rejectReason: null,
      },
    ],
    hold: {
      id: "hld-burns-106",
      offerId: "off-burns-106-1",
      hospitalId: "st-marys",
      bedType: "burns",
      status: "consumed",
      createdAt: minutesAgo(47),
      expiresAt: minutesAgo(17),
      releasedAt: null,
    },
  },
];

for (const req of completedRequests) {
  insertRequest.run({
    id: req.id,
    condition: req.condition,
    bedType: req.bedType,
    lat: req.lat,
    lng: req.lng,
    mode: req.mode,
    status: req.status,
    createdAt: req.createdAt,
    updatedAt: req.updatedAt,
  });

  insertTelemetry.run({
    requestId: req.id,
    age: req.telemetry.age,
    gender: req.telemetry.gender,
    heartRate: req.telemetry.heartRate,
    bpSys: req.telemetry.bpSys,
    bpDia: req.telemetry.bpDia,
    spo2: req.telemetry.spo2,
    gcs: req.telemetry.gcs,
    acuity: req.telemetry.acuity,
    notes: req.telemetry.notes,
    createdAt: req.createdAt,
  });

  for (const off of req.offers) {
    insertOffer.run({
      id: off.id,
      requestId: req.id,
      hospitalId: off.hospitalId,
      bedType: req.bedType,
      rank: off.rank,
      status: off.status,
      etaMinutes: off.etaMinutes,
      sentAt: off.sentAt,
      respondsBy: off.respondsBy,
      respondedAt: off.respondedAt,
      rejectReason: off.rejectReason,
    });
  }

  insertHold.run({
    id: req.hold.id,
    requestId: req.id,
    offerId: req.hold.offerId,
    hospitalId: req.hold.hospitalId,
    bedType: req.hold.bedType,
    status: req.hold.status,
    createdAt: req.hold.createdAt,
    expiresAt: req.hold.expiresAt,
    releasedAt: null,
  });
}
console.log(`Seeded ${completedRequests.length} completed clinical emergency requests with vitals telemetry.`);

console.log("\n========================================================");
console.log("BedLink realistic emergency clinical seed complete!");
console.log("6 hospitals, active ED diversion, audit log, vitals & feedback.");
console.log("========================================================\n");
