import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const configDir = join(here, "..", "..", "config");

function loadJson<T>(file: string): T {
  return JSON.parse(readFileSync(join(configDir, file), "utf-8")) as T;
}

export type BedType = "icu" | "ventilator" | "oxygen" | "cardiac" | "burns";
export const BED_TYPES: BedType[] = ["icu", "ventilator", "oxygen", "cardiac", "burns"];

export type CapabilitiesConfig = {
  capabilities: Record<string, { label: string; needsSpecialist: boolean }>;
};

export type ConditionsConfig = {
  conditions: Record<string, { label: string; bedType: BedType; requiredCapabilities: string[] }>;
};

export type RankingConfig = {
  assumedSpeedKmh: number;
  bedTypeExpiryMinutes: Record<BedType, number>;
  fallbackPenaltyMinutes: number;
  loadPenaltyPerActiveHoldMinutes: number;
  loadPenaltyMaxHolds: number;
  pAvailable: {
    freshWindowMinutes: number;
    decayHalfLifeMinutes: number;
    zeroFreeBase: number;
    zeroFreeDecayHalfLifeMinutes: number;
    unknownPAvailable: number;
    likelyThreshold: number;
    uncertainThreshold: number;
    minPAvailable: number;
    maxPAvailable: number;
  };
  specialistFreshnessMinutes: number;
  holdTtlMinutes: number;
  offerResponseSeconds: number;
  parallelOfferCount: number;
  tickerIntervalSeconds: number;
};

export const capabilitiesConfig = loadJson<CapabilitiesConfig>("capabilities.json");
export const conditionsConfig = loadJson<ConditionsConfig>("conditions.json");
export const rankingConfig = loadJson<RankingConfig>("ranking.json");

export function reloadConfig() {
  Object.assign(capabilitiesConfig, loadJson<CapabilitiesConfig>("capabilities.json"));
  Object.assign(conditionsConfig, loadJson<ConditionsConfig>("conditions.json"));
  Object.assign(rankingConfig, loadJson<RankingConfig>("ranking.json"));
}
