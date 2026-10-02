import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

const bedTypes = ["icu", "ventilator", "oxygen", "cardiac", "burns"] as const;
type BedType = typeof bedTypes[number];

type ExtractedUpdate = {
  bedType: BedType;
  free: number;
  availability: "available" | "unavailable";
};

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? text;
  const object = candidate.match(/\{[\s\S]*\}/)?.[0];
  return JSON.parse(object ?? candidate);
}

function validateUpdates(value: unknown): ExtractedUpdate[] {
  if (!value || typeof value !== "object" || !("updates" in value) || !Array.isArray(value.updates)) {
    throw new Error("The AI could not identify any bed updates. Please try different wording.");
  }

  const updates: ExtractedUpdate[] = [];
  for (const item of value.updates) {
    if (!item || typeof item !== "object") continue;
    const { bedType, free, availability } = item as Record<string, unknown>;
    if (!bedTypes.includes(bedType as BedType) || typeof free !== "number" || !Number.isInteger(free) || free < 0 || (availability !== "available" && availability !== "unavailable")) continue;
    updates.push({ bedType: bedType as BedType, free, availability });
  }

  if (updates.length === 0) throw new Error("The AI could not identify a supported bed type and count.");
  return updates;
}

export async function extractBedAvailabilityUpdate(text: string) {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) throw new Error("AI update review is not configured.");

  const provider = createOpenAI({
    apiKey,
  });

  const result = streamText({
    model: provider("gpt-4o"), // replacing hypothetical model
    prompt: `Extract bed availability changes from this nurse note. Supported bedType values are icu, ventilator, oxygen, cardiac, burns. Return only JSON in this exact shape: {"updates":[{"bedType":"icu","free":0,"availability":"available"}]}. free must be the current free count, never a delta. availability is unavailable only if free is 0; otherwise available. Ignore unsupported details and do not invent updates. Nurse note: ${text}`,
  });

  const output = await result.text;
  if (!output.trim()) throw new Error("The AI returned no reviewable update. Please try again.");
  return validateUpdates(extractJson(output));
}
