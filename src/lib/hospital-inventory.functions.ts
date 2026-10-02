import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/integrations/supabase/types";
import { cityGeneralHospital, inventoryBedTypes, type InventoryAuditEvent, type InventoryChange, type InventoryRecord } from "./hospital-inventory";

const bedTypeSchema = z.enum(["icu", "ventilator", "oxygen", "cardiac", "burns"]);
const inventoryChangeSchema = z.object({
  bedType: bedTypeSchema,
  previousFree: z.number().int().min(0),
  nextFree: z.number().int().min(0),
});
const nurseNameSchema = z.string().trim().min(2).max(80);

function createPublicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  const url = process.env["SUPABASE_URL"];

  if (!key || !url) {
    throw new Error("The shared inventory is unavailable. Please try again.");
  }

  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

export const getCityGeneralInventory = createServerFn({ method: "GET" })
  .handler(async (): Promise<InventoryRecord[]> => {
    const client = createPublicClient();
    const { data, error } = await client
      .from("hospital_inventory")
      .select("bed_type, free_count, updated_at")
      .eq("hospital_key", cityGeneralHospital.key);

    if (error) throw new Error("The shared inventory could not be loaded.");

    return (data ?? [])
      .filter((row) => inventoryBedTypes.includes(row.bed_type as InventoryRecord["bedType"]))
      .map((row) => ({
        bedType: row.bed_type as InventoryRecord["bedType"],
        free: row.free_count,
        updatedAt: row.updated_at,
      }));
  });

export const saveCityGeneralInventory = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({
    beds: z.array(z.object({ bedType: bedTypeSchema, free: z.number().int().min(0) })).min(1),
    eventType: z.enum(["nurse_applied", "restored"]),
    nurseName: nurseNameSchema,
  }).parse(data))
  .handler(async ({ data }): Promise<InventoryRecord[]> => {
    const client = createPublicClient();
    const { data: current, error: currentError } = await client
      .from("hospital_inventory")
      .select("bed_type, free_count")
      .eq("hospital_key", cityGeneralHospital.key);

    if (currentError) throw new Error("The current bed counts could not be checked.");

    const previousCounts = new Map((current ?? []).map((row) => [row.bed_type, row.free_count]));
    const updatedAt = new Date().toISOString();
    const rows = data.beds.map((bed) => ({
      hospital_key: cityGeneralHospital.key,
      hospital_name: cityGeneralHospital.name,
      bed_type: bed.bedType,
      free_count: bed.free,
      updated_at: updatedAt,
      updated_by: data.nurseName,
    }));
    const { data: saved, error } = await client
      .from("hospital_inventory")
      .upsert(rows, { onConflict: "hospital_key,bed_type" })
      .select("bed_type, free_count, updated_at");

    if (error) throw new Error("The bed counts could not be shared. Please try again.");

    const changes: InventoryChange[] = data.beds
      .map((bed) => ({ bedType: bed.bedType, previousFree: previousCounts.get(bed.bedType) ?? 0, nextFree: bed.free }))
      .filter((change) => change.previousFree !== change.nextFree);

    if (changes.length > 0) {
      const { error: auditError } = await client.from("inventory_audit_history").insert({
        hospital_key: cityGeneralHospital.key,
        event_type: data.eventType,
        changes,
        created_by: data.nurseName,
        nurse_name: data.nurseName,
        source: data.eventType === "restored" ? "restore" : "manual",
      });
      if (auditError) throw new Error("The bed counts were shared, but the history could not be saved.");
    }

    return (saved ?? []).map((row) => ({
      bedType: row.bed_type as InventoryRecord["bedType"],
      free: row.free_count,
      updatedAt: row.updated_at,
    }));
  });

export const recordAiProposedInventoryUpdate = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ changes: z.array(inventoryChangeSchema).min(1) }).parse(data))
  .handler(async ({ data }): Promise<void> => {
    const client = createPublicClient();
    const { error } = await client.from("inventory_audit_history").insert({
      hospital_key: cityGeneralHospital.key,
      event_type: "ai_proposed",
      changes: data.changes,
      created_by: "ai-review",
      source: "ai",
      nurse_name: null,
    });
    if (error) throw new Error("The proposal could not be saved to history.");
  });

export const getCityGeneralInventoryHistory = createServerFn({ method: "GET" })
  .handler(async (): Promise<InventoryAuditEvent[]> => {
    const client = createPublicClient();
    const { data, error } = await client
      .from("inventory_audit_history")
      .select("id, event_type, source, nurse_name, changes, created_at")
      .eq("hospital_key", cityGeneralHospital.key)
      .order("created_at", { ascending: false })
      .limit(12);

    if (error) throw new Error("The update history could not be loaded.");

    return (data ?? []).map((event) => ({
      id: event.id,
      eventType: event.event_type as InventoryAuditEvent["eventType"],
      source: event.source as InventoryAuditEvent["source"],
      nurseName: event.nurse_name,
      changes: inventoryChangeSchema.array().parse(event.changes),
      createdAt: event.created_at,
    }));
  });