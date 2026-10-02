import { test } from "node:test";
import assert from "node:assert/strict";
import {
  seedHospital,
  setBedFree,
  createRequest,
  getRequestSummary,
  runTickOnceForTests,
  expireOfferNow,
} from "./helpers.js";

test("sequential mode: a timed-out offer moves to the next hospital", async () => {
  seedHospital({ id: "seq-1", lat: 19.07, lng: 72.87, capabilities: ["icu_unit"] });
  seedHospital({ id: "seq-2", lat: 19.2, lng: 72.95, capabilities: ["icu_unit"] });
  setBedFree("seq-1", "icu", 2);
  setBedFree("seq-2", "icu", 2);

  const summary = await createRequest({
    condition: "sepsis",
    lat: 19.07,
    lng: 72.87,
    mode: "sequential",
  });
  assert.equal(summary.offers.length, 1, "sequential mode starts with exactly one offer");
  const firstOffer = summary.offers[0]!;
  assert.equal(firstOffer.hospitalId, "seq-1", "the closer hospital is offered first");
  assert.equal(firstOffer.status, "pending");

  expireOfferNow(firstOffer.offerId);
  await runTickOnceForTests();

  const after = getRequestSummary(summary.request.id);
  const expired = after.offers.find((o) => o.offerId === firstOffer.offerId);
  assert.equal(expired?.status, "expired", "the timed-out offer is marked expired");

  const nextOffer = after.offers.find((o) => o.status === "pending");
  assert.equal(nextOffer?.hospitalId, "seq-2", "the next hospital is offered after timeout");
});
