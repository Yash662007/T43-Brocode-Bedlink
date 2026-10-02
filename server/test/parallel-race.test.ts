import { test } from "node:test";
import assert from "node:assert/strict";
import {
  seedHospital,
  setBedFree,
  createRequest,
  acceptOffer,
  getRequestSummary,
} from "./helpers.js";

test("parallel mode: first accept wins atomically, the rest are superseded", async () => {
  seedHospital({ id: "par-1", lat: 19.07, lng: 72.87, capabilities: ["icu_unit"] });
  seedHospital({ id: "par-2", lat: 19.08, lng: 72.88, capabilities: ["icu_unit"] });
  seedHospital({ id: "par-3", lat: 19.09, lng: 72.89, capabilities: ["icu_unit"] });
  setBedFree("par-1", "icu", 2);
  setBedFree("par-2", "icu", 2);
  setBedFree("par-3", "icu", 2);

  const summary = await createRequest({
    condition: "sepsis",
    lat: 19.07,
    lng: 72.87,
    mode: "parallel",
  });
  assert.equal(summary.offers.length, 3, "parallel mode offers the top 3 hospitals at once");
  assert.ok(summary.offers.every((o) => o.status === "pending"));

  const toAccept = summary.offers[1]!;
  const result = acceptOffer(toAccept.offerId);
  assert.equal(result.accepted, true);

  const after = getRequestSummary(summary.request.id);
  const accepted = after.offers.filter((o) => o.status === "accepted");
  const superseded = after.offers.filter((o) => o.status === "superseded");

  assert.equal(accepted.length, 1, "exactly one offer is accepted");
  assert.equal(accepted[0]!.offerId, toAccept.offerId);
  assert.equal(superseded.length, 2, "the other two offers become superseded");
  assert.equal(after.request.status, "held");
  assert.equal(after.holds.filter((h) => h.status === "active").length, 1);
});
