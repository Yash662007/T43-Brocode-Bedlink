import type { BedType } from "@/lib/bedlink-fixtures";

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
