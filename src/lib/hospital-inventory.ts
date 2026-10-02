import type { BedRow, BedType } from "@/lib/bedlink-fixtures";

export const cityGeneralHospital = {
  key: "city-general",
  name: "City General Hospital",
} as const;

export type InventoryRecord = {
  bedType: BedType;
  free: number;
  updatedAt: string;
};

export type InventoryChange = {
  bedType: BedType;
  previousFree: number;
  nextFree: number;
};

export type InventoryAuditEvent = {
  id: string;
  eventType: "ai_proposed" | "nurse_applied" | "restored";
  source: "ai" | "manual" | "restore";
  nurseName: string | null;
  changes: InventoryChange[];
  createdAt: string;
};

export const inventoryBedTypes: BedType[] = ["icu", "ventilator", "oxygen", "cardiac", "burns"];

export function toInventoryRecord(row: BedRow): InventoryRecord {
  return {
    bedType: row.bedType,
    free: row.free,
    updatedAt: new Date().toISOString(),
  };
}