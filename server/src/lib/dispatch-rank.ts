import { conditionsConfig, type BedType } from "../config/index.js";
import { listHospitals } from "./hospitals.js";
import { getBedSnapshot } from "./beds.js";
import { hasAllCapabilities } from "./capabilities.js";
import { getTravelEstimate, type LatLng } from "./routing.js";
import { computePAvailable, confidenceFor, reasonSentence, scoreHospital } from "./ranking.js";
import type { Confidence, ScoreBreakdown } from "./ranking.js";

export type RankedHospital = {
  hospitalId: string;
  name: string;
  rank: number;
  lat: number;
  lng: number;
  isGovt: boolean;
  schemes: string[];
  bedType: BedType;
  availableBeds: number;
  freshness: string;
  isSimulated: boolean;
  travelMinutes: number;
  distanceKm: number;
  isTravelEstimate: boolean;
  reason: string;
  confidence: Confidence;
  pAvailable: number;
  scoreBreakdown: ScoreBreakdown;
  score: number;
};

export function resolveCondition(condition: string) {
  const entry = conditionsConfig.conditions[condition];
  if (!entry) return undefined;
  return entry;
}

export async function rankHospitalsForCondition(params: {
  condition: string;
  origin: LatLng;
  excludeHospitalIds?: string[];
}): Promise<{ bedType: BedType; ranked: RankedHospital[] } | undefined> {
  const conditionEntry = resolveCondition(params.condition);
  if (!conditionEntry) return undefined;

  const { bedType, requiredCapabilities } = conditionEntry;
  const exclude = new Set(params.excludeHospitalIds ?? []);

  const eligible = listHospitals().filter(
    (h) => !exclude.has(h.id) && hasAllCapabilities(h.id, requiredCapabilities),
  );

  const scored = await Promise.all(
    eligible.map(async (hospital) => {
      const bed = getBedSnapshot(hospital.id, bedType);
      const travel = await getTravelEstimate(params.origin, { lat: hospital.lat, lng: hospital.lng });
      const pAvailable = computePAvailable({
        effectiveFree: bed.effectiveFree,
        ageMin: bed.ageMinutes,
        unknown: bed.unknown,
      });
      const confidence = confidenceFor({
        pAvailable,
        effectiveFree: bed.effectiveFree,
        unknown: bed.unknown,
      });
      const scoreBreakdown = scoreHospital({
        travelMinutes: travel.travelMinutes,
        pAvailable,
        activeHolds: bed.activeHolds,
      });

      const row: RankedHospital = {
        hospitalId: hospital.id,
        name: hospital.name,
        rank: 0,
        lat: hospital.lat,
        lng: hospital.lng,
        isGovt: hospital.isGovt,
        schemes: hospital.schemes,
        bedType,
        availableBeds: bed.effectiveFree,
        freshness: bed.unknown ? "No data" : bed.ageMinutes < 1 ? "Just now" : `${bed.ageMinutes} min ago`,
        isSimulated: bed.source === "sim_feed",
        travelMinutes: travel.travelMinutes,
        distanceKm: travel.distanceKm,
        isTravelEstimate: travel.isEstimate,
        confidence,
        pAvailable,
        scoreBreakdown,
        score: scoreBreakdown.total,
        reason: reasonSentence({
          bedType,
          effectiveFree: bed.effectiveFree,
          ageMin: bed.ageMinutes,
          unknown: bed.unknown,
          confidence,
          travelMinutes: travel.travelMinutes,
        }),
      };
      return row;
    }),
  );

  scored.sort((a, b) => a.score - b.score);
  scored.forEach((row, idx) => {
    row.rank = idx + 1;
  });

  return { bedType, ranked: scored };
}
