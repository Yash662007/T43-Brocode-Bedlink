import type { BedEventDto } from "./bedlink-client";
import type { InventoryAuditEvent } from "./hospital-inventory";

/**
 * The backend logs one audit row per bed type per update; the nurse screen's
 * history timeline was built around grouped multi-bed events. Adapting each
 * row into that single-change shape keeps the existing timeline JSX
 * (labels, filters, restore) unchanged.
 */
export function bedEventToAuditEvent(event: BedEventDto): InventoryAuditEvent {
  const eventType: InventoryAuditEvent["eventType"] =
    event.event_type === "ai_proposed" || event.event_type === "restored"
      ? event.event_type
      : "nurse_applied";

  const source: InventoryAuditEvent["source"] =
    eventType === "ai_proposed" ? "ai" : eventType === "restored" ? "restore" : "manual";

  return {
    id: String(event.id),
    eventType,
    source,
    nurseName: eventType === "ai_proposed" ? null : event.actor,
    changes: [
      {
        bedType: event.bed_type,
        previousFree: event.previous_free ?? 0,
        nextFree: event.next_free ?? 0,
      },
    ],
    createdAt: event.created_at,
  };
}
