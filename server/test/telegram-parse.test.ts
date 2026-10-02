import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBedCountsText } from "../src/telegram/parse.js";

test("parses comma-separated shorthand", () => {
  const result = parseBedCountsText("ICU 2, vent 1");
  assert.deepEqual(result, [
    { bedType: "icu", value: 2 },
    { bedType: "ventilator", value: 1 },
  ]);
});

test("parses 'no' as zero", () => {
  const result = parseBedCountsText("burns no, oxygen 4");
  assert.deepEqual(result, [
    { bedType: "burns", value: 0 },
    { bedType: "oxygen", value: 4 },
  ]);
});

test("ignores segments without both a bed type and a count", () => {
  const result = parseBedCountsText("hello there, cardiac 3");
  assert.deepEqual(result, [{ bedType: "cardiac", value: 3 }]);
});

test("returns an empty list when nothing matches", () => {
  assert.deepEqual(parseBedCountsText("everything is fine today"), []);
});
