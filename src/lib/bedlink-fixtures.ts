export type BedType = "icu" | "ventilator" | "oxygen" | "cardiac" | "burns";

export type BedRow = {
  bedType: BedType;
  free: number;
  updatedAt: string;
  source: "nurse_tap" | "sim_feed";
};

export const nurseBeds: BedRow[] = [
  { bedType: "icu", free: 3, updatedAt: "2 min ago", source: "nurse_tap" },
  { bedType: "ventilator", free: 1, updatedAt: "7 min ago", source: "nurse_tap" },
  { bedType: "oxygen", free: 6, updatedAt: "18 min ago", source: "sim_feed" },
  { bedType: "cardiac", free: 2, updatedAt: "32 min ago", source: "nurse_tap" },
  { bedType: "burns", free: 0, updatedAt: "No data", source: "nurse_tap" },
];
