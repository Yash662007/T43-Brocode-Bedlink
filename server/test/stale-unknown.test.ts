import { test } from "node:test";
import assert from "node:assert/strict";
import { seedHospital, setBedFree, getBedSnapshot, rankHospitalsForCondition } from "./helpers.js";

test("a bed count past its expiry window becomes unknown", () => {
  seedHospital({ id: "stale-1", capabilities: ["icu_unit"] });
  // bedTypeExpiryMinutes.icu is 60 in config/ranking.json; 90 minutes is well past it.
  setBedFree("stale-1", "icu", 3, 90);

  const snapshot = getBedSnapshot("stale-1", "icu" as never);
  assert.equal(snapshot.unknown, true, "a count older than the expiry window is unknown");
});

test("a ranked hospital with stale data is marked unknown confidence", async () => {
  seedHospital({ id: "stale-2", capabilities: ["icu_unit"] });
  setBedFree("stale-2", "icu", 4, 120);

  const result = await rankHospitalsForCondition({
    condition: "sepsis",
    origin: { lat: 19.07, lng: 72.87 },
  });
  const row = result?.ranked.find((h) => h.hospitalId === "stale-2");
  assert.equal(row?.confidence, "unknown");
});
