import { BED_TYPES, type BedType } from "../config/index.js";

const ALIASES: Record<BedType, string[]> = {
  icu: ["icu"],
  ventilator: ["vent", "ventilator", "ventilators", "vents"],
  oxygen: ["o2", "oxygen"],
  cardiac: ["cardiac", "cardio"],
  burns: ["burn", "burns"],
};

function bedTypeFromWord(word: string): BedType | undefined {
  const normalized = word.toLowerCase();
  for (const bedType of BED_TYPES) {
    if (ALIASES[bedType].includes(normalized)) return bedType;
  }
  return undefined;
}

export type ParsedBedCount = { bedType: BedType; value: number };

/**
 * Best-effort free-text parse of nurse shorthand like "ICU 2, vent 1" or
 * "2 icu beds, no ventilators". Deliberately simple and permissive — the bot
 * always shows a Confirm/Edit step before anything is written, so a bad
 * parse costs a tap, not a wrong bed count.
 */
export function parseBedCountsText(text: string): ParsedBedCount[] {
  const segments = text.split(/[,;\n]+/);
  const results: ParsedBedCount[] = [];

  for (const segment of segments) {
    const words = segment.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;

    let bedType: BedType | undefined;
    let value: number | undefined;

    for (const word of words) {
      const cleaned = word.replace(/[^a-zA-Z0-9]/g, "");
      if (bedType === undefined) {
        const match = bedTypeFromWord(cleaned);
        if (match) {
          bedType = match;
          continue;
        }
      }
      if (value === undefined && /^\d+$/.test(cleaned)) {
        value = parseInt(cleaned, 10);
      }
      if (/^no$|^none$|^zero$/i.test(cleaned) && value === undefined) {
        value = 0;
      }
    }

    if (bedType !== undefined && value !== undefined) {
      results.push({ bedType, value });
    }
  }

  return results;
}
