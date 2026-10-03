import { Router } from "express";
import { db } from "../db/index.js";
import { listHospitalsWithBeds } from "../lib/hospitals.js";
import type { BedType } from "../config/index.js";

export const analyticsRouter = Router();

const BED_TYPES: BedType[] = ["icu", "ventilator", "oxygen", "cardiac", "burns"];

analyticsRouter.get("/api/analytics", (_req, res) => {
  const hospitals = listHospitalsWithBeds();

  // Active holds count per hospital
  const activeHolds = db
    .prepare(`SELECT hospital_id, bed_type, COUNT(*) as count FROM holds WHERE status = 'active' GROUP BY hospital_id, bed_type`)
    .all() as Array<{ hospital_id: string; bed_type: string; count: number }>;

  const activeHoldsByHospital = new Map<string, number>();
  for (const h of activeHolds) {
    activeHoldsByHospital.set(h.hospital_id, (activeHoldsByHospital.get(h.hospital_id) ?? 0) + h.count);
  }

  // Bed breakdown across region
  const bedBreakdown: Record<BedType, { reported: number; activeHolds: number; netAvailable: number }> = {
    icu: { reported: 0, activeHolds: 0, netAvailable: 0 },
    ventilator: { reported: 0, activeHolds: 0, netAvailable: 0 },
    oxygen: { reported: 0, activeHolds: 0, netAvailable: 0 },
    cardiac: { reported: 0, activeHolds: 0, netAvailable: 0 },
    burns: { reported: 0, activeHolds: 0, netAvailable: 0 },
  };

  let totalReported = 0;
  let totalNetAvailable = 0;
  let totalActiveHolds = 0;
  let divertedCount = 0;

  for (const hospital of hospitals) {
    if (hospital.diversion?.isDiverted) {
      divertedCount++;
    }
    for (const b of hospital.beds) {
      const type = b.bedType as BedType;
      if (bedBreakdown[type]) {
        bedBreakdown[type].reported += b.free;
        bedBreakdown[type].netAvailable += b.effectiveFree;
        totalReported += b.free;
        totalNetAvailable += b.effectiveFree;
      }
    }
  }

  for (const h of activeHolds) {
    const type = h.bed_type as BedType;
    if (bedBreakdown[type]) {
      bedBreakdown[type].activeHolds += h.count;
    }
    totalActiveHolds += h.count;
  }

  // Calculate average reliability rate
  const reliabilitySum = hospitals.reduce((acc, h) => acc + (h.reliability?.accuracyRate ?? 100), 0);
  const averageReliability = hospitals.length > 0 ? Math.round(reliabilitySum / hospitals.length) : 100;

  // Recent 20 bed events
  const recentEvents = db
    .prepare(
      `SELECT e.id, e.hospital_id, h.name as hospital_name, e.bed_type, e.event_type, e.source, e.actor, e.note, e.created_at
       FROM bed_events e
       LEFT JOIN hospitals h ON h.id = e.hospital_id
       ORDER BY e.created_at DESC
       LIMIT 25`,
    )
    .all() as Array<{
      id: number;
      hospital_id: string;
      hospital_name: string | null;
      bed_type: string;
      event_type: string;
      source: string;
      actor: string | null;
      note: string | null;
      created_at: string;
    }>;

  // Recent completed requests
  const recentArrivals = (
    db.prepare(`SELECT COUNT(*) as count FROM requests WHERE status = 'arrived'`).get() as { count: number }
  ).count;

  const hospitalsWithCounts = hospitals.map((h) => ({
    ...h,
    activeHoldsCount: activeHoldsByHospital.get(h.id) ?? 0,
  }));

  res.json({
    overview: {
      totalHospitals: hospitals.length,
      divertedHospitals: divertedCount,
      totalBedsReported: totalReported,
      totalActiveHolds,
      totalNetAvailable,
      recentArrivals,
      averageReliability,
    },
    bedBreakdown,
    hospitals: hospitalsWithCounts,
    recentEvents: recentEvents.map((e) => ({
      id: e.id,
      hospitalId: e.hospital_id,
      hospitalName: e.hospital_name ?? e.hospital_id,
      bedType: e.bed_type,
      eventType: e.event_type,
      source: e.source,
      actor: e.actor,
      note: e.note,
      createdAt: e.created_at,
    })),
  });
});
