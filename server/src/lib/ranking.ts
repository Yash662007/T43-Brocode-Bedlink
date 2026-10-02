import { rankingConfig, type BedType } from "../config/index.js";

export type Confidence = "likely" | "uncertain" | "probably_full" | "unknown";

/**
 * p_available is a deliberately simple heuristic (not a statistical model):
 * it starts near 1 when effective free beds are > 0 and the count is fresh,
 * decays exponentially as the count ages, and is capped low when the
 * reported free count is already 0. All half-lives/bases are assumptions
 * from config/ranking.json, not measured data.
 */
export function computePAvailable(params: {
  effectiveFree: number;
  ageMin: number;
  unknown: boolean;
}): number {
  const cfg = rankingConfig.pAvailable;
  if (params.unknown) return cfg.unknownPAvailable;

  if (params.effectiveFree <= 0) {
    const decay = Math.pow(0.5, params.ageMin / cfg.zeroFreeDecayHalfLifeMinutes);
    return clamp(cfg.zeroFreeBase * decay, cfg);
  }

  const agePastFresh = Math.max(0, params.ageMin - cfg.freshWindowMinutes);
  const ageFactor = Math.pow(0.5, agePastFresh / cfg.decayHalfLifeMinutes);
  return clamp(ageFactor, cfg);
}

function clamp(value: number, cfg: { minPAvailable: number; maxPAvailable: number }): number {
  return Math.min(cfg.maxPAvailable, Math.max(cfg.minPAvailable, value));
}

export function confidenceFor(params: {
  pAvailable: number;
  effectiveFree: number;
  unknown: boolean;
}): Confidence {
  const cfg = rankingConfig.pAvailable;
  if (params.unknown) return "unknown";
  if (params.effectiveFree <= 0) return "probably_full";
  if (params.pAvailable >= cfg.likelyThreshold) return "likely";
  return "uncertain";
}

export type ScoreBreakdown = {
  travelMin: number;
  availabilityPenalty: number;
  loadPenalty: number;
};

export function scoreHospital(params: {
  travelMinutes: number;
  pAvailable: number;
  activeHolds: number;
}): ScoreBreakdown & { total: number } {
  const availabilityPenalty = (1 - params.pAvailable) * rankingConfig.fallbackPenaltyMinutes;
  const loadPenalty =
    Math.min(params.activeHolds, rankingConfig.loadPenaltyMaxHolds) *
    rankingConfig.loadPenaltyPerActiveHoldMinutes;
  return {
    travelMin: params.travelMinutes,
    availabilityPenalty,
    loadPenalty,
    total: params.travelMinutes + availabilityPenalty + loadPenalty,
  };
}

export function reasonSentence(params: {
  bedType: BedType;
  effectiveFree: number;
  ageMin: number;
  unknown: boolean;
  confidence: Confidence;
  travelMinutes: number;
}): string {
  const bedLabel = bedTypeLabel(params.bedType);
  const travel = Math.round(params.travelMinutes);

  if (params.unknown) {
    return `${bedLabel} availability hasn't been confirmed recently, so this is a rougher guess — about ${travel} min away.`;
  }
  if (params.confidence === "probably_full") {
    return `No ${bedLabel} beds currently free (as of ${formatAge(params.ageMin)}) — ranked lower until one opens up.`;
  }
  const bedWord = params.effectiveFree === 1 ? "bed" : "beds";
  return `${params.effectiveFree} ${bedLabel} ${bedWord} free, confirmed ${formatAge(params.ageMin)}, about ${travel} min away.`;
}

function formatAge(ageMin: number): string {
  if (ageMin < 1) return "just now";
  return `${ageMin} min ago`;
}

function bedTypeLabel(bedType: BedType): string {
  const labels: Record<BedType, string> = {
    icu: "ICU",
    ventilator: "ventilator",
    oxygen: "oxygen",
    cardiac: "cardiac",
    burns: "burns",
  };
  return labels[bedType];
}
