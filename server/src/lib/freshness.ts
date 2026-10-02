import { rankingConfig, type BedType } from "../config/index.js";

export function ageMinutes(updatedAtIso: string, now = new Date()): number {
  const updated = new Date(updatedAtIso).getTime();
  return Math.max(0, Math.round((now.getTime() - updated) / 60000));
}

export function isExpired(bedType: BedType, ageMin: number): boolean {
  const expiry = rankingConfig.bedTypeExpiryMinutes[bedType];
  return ageMin > expiry;
}

// Matches the display-string convention the frontend's FreshnessBadge already
// parses ("Just now" / "No data" / "<n> min ago") so no UI change is needed.
export function formatFreshness(ageMin: number, unknown: boolean): string {
  if (unknown) return "No data";
  if (ageMin < 1) return "Just now";
  return `${ageMin} min ago`;
}
