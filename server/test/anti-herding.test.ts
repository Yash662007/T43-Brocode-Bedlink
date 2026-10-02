import { test } from "node:test";
import assert from "node:assert/strict";
import {
  seedHospital,
  setBedFree,
  acceptOffer,
  newId,
  nowIso,
  db,
  rankHospitalsForCondition,
} from "./helpers.js";

test("a held last bed ranks behind a hospital with real availability (anti-herding)", async () => {
  seedHospital({ id: "herd-a", lat: 19.07, lng: 72.87, capabilities: ["icu_unit"] });
  seedHospital({ id: "herd-b", lat: 19.07, lng: 72.87, capabilities: ["icu_unit"] });
  setBedFree("herd-a", "icu", 1);
  setBedFree("herd-b", "icu", 1);

  // Simulate ambulance #1 already holding herd-a's only bed.
  const requestId = newId("req");
  db.prepare(
    `INSERT INTO requests (id, condition, bed_type, lat, lng, mode, status, created_at, updated_at)
     VALUES (?, 'sepsis', 'icu', 19.07, 72.87, 'sequential', 'offering', ?, ?)`,
  ).run(requestId, nowIso(), nowIso());
  const offerId = newId("offer");
  db.prepare(
    `INSERT INTO offers (id, request_id, hospital_id, bed_type, rank, status, eta_minutes, sent_at, responds_by)
     VALUES (?, ?, 'herd-a', 'icu', 1, 'pending', 5, ?, ?)`,
  ).run(offerId, requestId, nowIso(), new Date(Date.now() + 120000).toISOString());
  const accepted = acceptOffer(offerId);
  assert.equal(accepted.accepted, true);

  // Ambulance #2 ranks the same two hospitals for a new, unrelated request.
  const result = await rankHospitalsForCondition({ condition: "sepsis", origin: { lat: 19.07, lng: 72.87 } });
  const a = result?.ranked.find((h) => h.hospitalId === "herd-a");
  const b = result?.ranked.find((h) => h.hospitalId === "herd-b");

  assert.equal(a?.availableBeds, 0, "herd-a's only bed is now held, so effective free is 0");
  assert.equal(a?.confidence, "probably_full");
  assert.equal(b?.availableBeds, 1, "herd-b is untouched and still shows a free bed");
  assert.ok(a && b && a.score > b.score, "the second ambulance should rank the held-out hospital worse");
});
