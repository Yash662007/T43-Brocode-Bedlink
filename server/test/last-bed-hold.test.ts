import { test } from "node:test";
import assert from "node:assert/strict";
import { db, seedHospital, setBedFree, acceptOffer, newId, nowIso } from "./helpers.js";

test("simultaneous last-bed hold: exactly one of two accepts wins", () => {
  seedHospital({ id: "h1", capabilities: ["icu_unit"] });
  setBedFree("h1", "icu", 1);

  const requestA = newId("req");
  const requestB = newId("req");
  for (const id of [requestA, requestB]) {
    db.prepare(
      `INSERT INTO requests (id, condition, bed_type, lat, lng, mode, status, created_at, updated_at)
       VALUES (?, 'sepsis', 'icu', 19.07, 72.87, 'sequential', 'offering', ?, ?)`,
    ).run(id, nowIso(), nowIso());
  }

  const offerA = newId("offer");
  const offerB = newId("offer");
  const respondsBy = new Date(Date.now() + 120000).toISOString();
  for (const [offerId, requestId] of [
    [offerA, requestA],
    [offerB, requestB],
  ] as const) {
    db.prepare(
      `INSERT INTO offers (id, request_id, hospital_id, bed_type, rank, status, eta_minutes, sent_at, responds_by)
       VALUES (?, ?, 'h1', 'icu', 1, 'pending', 5, ?, ?)`,
    ).run(offerId, requestId, nowIso(), respondsBy);
  }

  const resultA = acceptOffer(offerA);
  const resultB = acceptOffer(offerB);

  const outcomes = [resultA, resultB];
  const winners = outcomes.filter((r) => r.accepted);
  const losers = outcomes.filter((r) => !r.accepted);

  assert.equal(winners.length, 1, "exactly one accept should win");
  assert.equal(losers.length, 1, "exactly one accept should lose");

  const activeHolds = db
    .prepare(`SELECT COUNT(*) AS n FROM holds WHERE hospital_id = 'h1' AND status = 'active'`)
    .get() as { n: number };
  assert.equal(activeHolds.n, 1, "only one active hold should exist for the last bed");
});
