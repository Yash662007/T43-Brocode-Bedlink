import { test } from "node:test";
import assert from "node:assert/strict";
import {
  seedHospital,
  setBedFree,
  newId,
  nowIso,
  db,
  rankHospitalsForCondition,
  createRequest,
  runTickOnceForTests,
} from "./helpers.js";

const { setHospitalDiversion, getHospitalDiversion } = await import("../src/lib/hospitals.js");

test("hospital diversion penalizes ranking and flags hospital", async () => {
  seedHospital({ id: "div-hosp-a", lat: 19.07, lng: 72.87, capabilities: ["icu_unit"] });
  seedHospital({ id: "div-hosp-b", lat: 19.07, lng: 72.87, capabilities: ["icu_unit"] });
  setBedFree("div-hosp-a", "icu", 5);
  setBedFree("div-hosp-b", "icu", 1);

  // Before diversion, div-hosp-a has more beds and ranks first
  let result = await rankHospitalsForCondition({ condition: "sepsis", origin: { lat: 19.07, lng: 72.87 } });
  assert.equal(result?.ranked[0]?.hospitalId, "div-hosp-a");

  // Hospital A declares ED Diversion for 60 minutes
  setHospitalDiversion({
    hospitalId: "div-hosp-a",
    isDiverted: true,
    reason: "ED Overcrowded / Code Red",
    durationMinutes: 60,
  });

  const div = getHospitalDiversion("div-hosp-a");
  assert.equal(div.isDiverted, true);
  assert.equal(div.reason, "ED Overcrowded / Code Red");

  // Now, ranking should rank hospital B above hospital A
  result = await rankHospitalsForCondition({ condition: "sepsis", origin: { lat: 19.07, lng: 72.87 } });
  const rankedA = result?.ranked.find((h) => h.hospitalId === "div-hosp-a");
  const rankedB = result?.ranked.find((h) => h.hospitalId === "div-hosp-b");

  assert.equal(rankedA?.isDiverted, true);
  assert.equal(rankedA?.confidence, "probably_full");
  assert.ok(rankedA?.reason.includes("ED Diversion"));
  assert.equal(result?.ranked[0]?.hospitalId, "div-hosp-b");
  assert.ok(rankedA && rankedB && rankedA.score > rankedB.score);

  // Simulate diversion expiry in past
  db.prepare(`UPDATE hospital_diversions SET diverted_until = ? WHERE hospital_id = 'div-hosp-a'`).run(
    new Date(Date.now() - 1000).toISOString(),
  );

  await runTickOnceForTests();

  const divAfter = getHospitalDiversion("div-hosp-a");
  assert.equal(divAfter.isDiverted, false, "ticker should automatically lift expired diversion");
});

test("pre-arrival patient telemetry is stored and transmitted with dispatch offer", async () => {
  seedHospital({ id: "telem-hosp", lat: 19.07, lng: 72.87, capabilities: ["icu_unit"] });
  setBedFree("telem-hosp", "icu", 2);

  const summary = await createRequest({
    condition: "sepsis",
    lat: 19.07,
    lng: 72.87,
    mode: "sequential",
    telemetry: {
      age: 62,
      gender: "M",
      heartRate: 110,
      bpSys: 165,
      bpDia: 98,
      spo2: 92,
      gcs: 15,
      acuity: "red",
      notes: "Anterior STEMI with ongoing crushing chest pain",
    },
  });

  assert.ok(summary.request.id);
  assert.equal(summary.request.telemetry?.age, 62);
  assert.equal(summary.request.telemetry?.gender, "M");
  assert.equal(summary.request.telemetry?.heartRate, 110);
  assert.equal(summary.request.telemetry?.bpSys, 165);
  assert.equal(summary.request.telemetry?.spo2, 92);
  assert.equal(summary.request.telemetry?.acuity, "red");
  assert.equal(summary.request.telemetry?.notes, "Anterior STEMI with ongoing crushing chest pain");

  // Verify that offers for this request carry the telemetry payload
  assert.ok(summary.offers.length > 0);
  assert.equal(summary.offers[0]?.telemetry?.spo2, 92);
  assert.equal(summary.offers[0]?.telemetry?.acuity, "red");
});
