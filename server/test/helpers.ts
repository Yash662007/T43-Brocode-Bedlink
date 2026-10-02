import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Each test FILE gets its own SQLite file (node's test runner isolates
// files into separate processes), set before any module below is imported.
process.env["BEDLINK_DB_PATH"] = join(
  mkdtempSync(join(tmpdir(), "bedlink-test-")),
  `${randomUUID()}.db`,
);

export const db = (await import("../src/db/index.js")).db;
const { runMigrations } = await import("../src/db/index.js");
runMigrations();

export const { applyBedUpdate, getBedSnapshot } = await import("../src/lib/beds.js");
export const {
  createRequest,
  acceptOffer,
  rejectOffer,
  getRequestSummary,
} = await import("../src/lib/requests-engine.js");
export const { runTickOnceForTests } = await import("../src/lib/ticker.js");
export const { rankHospitalsForCondition } = await import("../src/lib/dispatch-rank.js");
export const { newId, nowIso } = await import("../src/lib/ids.js");

export function seedHospital(params: {
  id: string;
  lat?: number;
  lng?: number;
  capabilities: string[];
}) {
  db.prepare(
    `INSERT INTO hospitals (id, name, lat, lng, is_govt, schemes, created_at)
     VALUES (@id, @id, @lat, @lng, 0, '[]', @now)`,
  ).run({ id: params.id, lat: params.lat ?? 19.07, lng: params.lng ?? 72.87, now: nowIso() });

  const insertCap = db.prepare(
    `INSERT OR IGNORE INTO hospital_capabilities (hospital_id, capability) VALUES (?, ?)`,
  );
  for (const cap of params.capabilities) insertCap.run(params.id, cap);
}

export function setBedFree(hospitalId: string, bedType: string, free: number, ageMinutes = 0) {
  applyBedUpdate({
    hospitalId,
    bedType: bedType as never,
    value: free,
    source: "nurse_tap",
    eventType: "nurse_applied",
  });
  if (ageMinutes > 0) {
    db.prepare(`UPDATE bed_status SET updated_at = ? WHERE hospital_id = ? AND bed_type = ?`).run(
      new Date(Date.now() - ageMinutes * 60000).toISOString(),
      hospitalId,
      bedType,
    );
  }
}

export function expireOfferNow(offerId: string) {
  db.prepare(`UPDATE offers SET responds_by = ? WHERE id = ?`).run(
    new Date(Date.now() - 1000).toISOString(),
    offerId,
  );
}
