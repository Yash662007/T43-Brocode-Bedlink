import type {
  HoldStatus,
  OfferDto,
  OfferStatus,
  RequestStatus,
  SpecialistStatusDto,
} from "./bedlink-client";

const BASE_URL = import.meta.env["VITE_BEDLINK_API_URL"] || "http://localhost:4000";

export type BedChangeEvent = {
  hospitalId: string;
  bedType: string;
  freeReported: number;
  effectiveFree: number;
  updatedAt: string;
  unknown: boolean;
};

export type HoldEvent = {
  requestId: string;
  hospitalId: string;
  status: HoldStatus;
  holdId?: string;
};

export type OutcomeEvent = { requestId: string; status: RequestStatus };

export type SpecialistEvent = { hospitalId: string; specialists: SpecialistStatusDto[] };

export type TickEvent = {
  serverTime: string;
  offers: Array<{ offerId: string; requestId: string; hospitalId: string; remainingSeconds: number }>;
  holds: Array<{ holdId: string; requestId: string; hospitalId: string; remainingSeconds: number }>;
};

export type StreamHandlers = {
  onBedChange?: (data: BedChangeEvent) => void;
  onOffer?: (data: OfferDto & { status: OfferStatus }) => void;
  onHold?: (data: HoldEvent) => void;
  onOutcome?: (data: OutcomeEvent) => void;
  onTick?: (data: TickEvent) => void;
  onSpecialist?: (data: SpecialistEvent) => void;
  onConnectionChange?: (state: "live" | "reconnecting") => void;
};

/** Subscribes to the BedLink SSE stream. Returns an unsubscribe function. */
export function subscribeToBedlinkStream(handlers: StreamHandlers): () => void {
  const source = new EventSource(`${BASE_URL}/api/stream`);

  source.onopen = () => handlers.onConnectionChange?.("live");
  source.onerror = () => handlers.onConnectionChange?.("reconnecting");

  const listen = <T>(event: string, handler?: (data: T) => void) => {
    if (!handler) return;
    source.addEventListener(event, (e) => {
      try {
        handler(JSON.parse((e as MessageEvent).data) as T);
      } catch {
        // Malformed event payload — ignore rather than crash the UI.
      }
    });
  };

  listen("bed-change", handlers.onBedChange);
  listen("offer", handlers.onOffer);
  listen("hold", handlers.onHold);
  listen("outcome", handlers.onOutcome);
  listen("tick", handlers.onTick);
  listen("specialist", handlers.onSpecialist);

  return () => source.close();
}
