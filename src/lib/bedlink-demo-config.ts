import en from "@/locales/en.json";

// Single-hospital demo wiring: this build represents one incident at one
// hospital ("City General"), matching the seeded demo data in /server.
// Override via .env for a different hospital/token without code changes.

export const DEMO_HOSPITAL_ID = import.meta.env["VITE_BEDLINK_HOSPITAL_ID"] || "city-general";
export const NURSE_TOKEN =
  import.meta.env["VITE_BEDLINK_NURSE_TOKEN"] || "demo-nurse-city-general";

// Condition picker options shown on the ambulance screen. Ids must match
// config/conditions.json keys on the server; labels reuse locale strings
// already reserved for this (conditionChestPain/Trauma/Stroke/Respiratory).
export const DEMO_CONDITIONS: Array<{ id: string; label: string }> = [
  { id: "chest_pain", label: en.conditionChestPain },
  { id: "major_trauma", label: en.conditionTrauma },
  { id: "stroke", label: en.conditionStroke },
  { id: "respiratory_distress", label: en.conditionRespiratory },
];
