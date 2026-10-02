import type { BedType } from "./bedlink-fixtures";

const BASE_URL = import.meta.env["VITE_BEDLINK_API_URL"] || "http://localhost:4000";

export class BedlinkApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new BedlinkApiError(0, "Can't reach the BedLink server. Check your connection.");
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new BedlinkApiError(response.status, body.error ?? "Something went wrong.");
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export type BedSnapshotDto = {
  bedType: BedType;
  free: number;
  effectiveFree: number;
  updatedAt: string | null;
  freshness: string;
  ageMinutes: number | null;
  unknown: boolean;
  source: string;
  isSimulated: boolean;
};

export type HospitalDto = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  isGovt: boolean;
  schemes: string[];
  capabilities: string[];
  beds: BedSnapshotDto[];
};

export function getHospitals() {
  return request<{ hospitals: HospitalDto[] }>("/api/hospitals");
}

export type BedUpdateBody =
  | { bedType: BedType; delta: number; actor?: string; isRestore?: boolean }
  | { bedType: BedType; value: number; actor?: string; isRestore?: boolean }
  | { bedType: BedType; stillCorrect: true; actor?: string };

export function updateBed(hospitalToken: string, body: BedUpdateBody) {
  return request<{ bed: BedSnapshotDto }>(`/api/beds/${hospitalToken}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function proposeBedChanges(
  hospitalToken: string,
  changes: Array<{ bedType: BedType; previousFree: number; nextFree: number }>,
) {
  return request<{ ok: true }>(`/api/beds/${hospitalToken}/propose`, {
    method: "POST",
    body: JSON.stringify({ changes }),
  });
}

export type BedEventDto = {
  id: number;
  hospital_id: string;
  bed_type: BedType;
  event_type: string;
  previous_free: number | null;
  next_free: number | null;
  source: string;
  actor: string | null;
  note: string | null;
  created_at: string;
};

export function getBedHistory(hospitalToken: string, limit = 50) {
  return request<{ history: BedEventDto[] }>(`/api/beds/${hospitalToken}/history?limit=${limit}`);
}

export type ConditionDto = { id: string; label: string; bedType: BedType };

export function listConditions() {
  return request<{ conditions: ConditionDto[] }>("/api/conditions");
}

export type Confidence = "likely" | "uncertain" | "probably_full" | "unknown";

export type RankedHospitalDto = {
  hospitalId: string;
  name: string;
  rank: number;
  lat: number;
  lng: number;
  isGovt: boolean;
  schemes: string[];
  bedType: BedType;
  availableBeds: number;
  freshness: string;
  isSimulated: boolean;
  travelMinutes: number;
  distanceKm: number;
  isTravelEstimate: boolean;
  reason: string;
  confidence: Confidence;
  pAvailable: number;
  scoreBreakdown: { travelMin: number; availabilityPenalty: number; loadPenalty: number };
  score: number;
};

export function rankDispatch(body: { condition: string; lat: number; lng: number }) {
  return request<{ bedType: BedType; hospitals: RankedHospitalDto[] }>("/api/dispatch/rank", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export type RequestMode = "sequential" | "parallel";
export type RequestStatus = "offering" | "held" | "arrived" | "cancelled" | "no_match" | "expired";
export type OfferStatus = "pending" | "accepted" | "rejected" | "expired" | "superseded";
export type HoldStatus = "active" | "consumed" | "released" | "expired";

export type OfferDto = {
  offerId: string;
  requestId: string;
  hospitalId: string;
  hospitalName: string;
  condition: string;
  bedType: BedType;
  etaMinutes: number | null;
  rank: number;
  status: OfferStatus;
  sentAt: string;
  respondsBy: string;
};

export type HoldDto = {
  id: string;
  request_id: string;
  offer_id: string | null;
  hospital_id: string;
  bed_type: BedType;
  status: HoldStatus;
  created_at: string;
  expires_at: string;
  released_at: string | null;
};

export type RequestSummaryDto = {
  request: {
    id: string;
    condition: string;
    bed_type: BedType;
    lat: number;
    lng: number;
    mode: RequestMode;
    status: RequestStatus;
    created_at: string;
    updated_at: string;
  };
  offers: OfferDto[];
  holds: HoldDto[];
};

export function createRequest(body: {
  condition: string;
  lat: number;
  lng: number;
  mode: RequestMode;
}) {
  return request<RequestSummaryDto>("/api/requests", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getRequestSummary(requestId: string) {
  return request<RequestSummaryDto>(`/api/requests/${requestId}`);
}

export function cancelRequest(requestId: string) {
  return request<RequestSummaryDto>(`/api/requests/${requestId}/cancel`, { method: "POST" });
}

export function markArrived(requestId: string) {
  return request<RequestSummaryDto>(`/api/requests/${requestId}/arrived`, { method: "POST" });
}

export function submitFeedback(requestId: string, bedWasThere: boolean) {
  return request<{ ok: true }>(`/api/requests/${requestId}/feedback`, {
    method: "POST",
    body: JSON.stringify({ bedWasThere }),
  });
}

export type AcceptOfferResult =
  | { accepted: true; offerId: string; holdId: string; requestId: string; request: RequestSummaryDto }
  | { accepted: false; reason: string; request?: RequestSummaryDto };

export function acceptOffer(offerId: string) {
  return request<AcceptOfferResult>(`/api/offers/${offerId}/accept`, { method: "POST" });
}

export function rejectOffer(offerId: string, reason?: string) {
  return request<{ request: RequestSummaryDto }>(`/api/offers/${offerId}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function releaseHold(holdId: string) {
  return request<{ ok: true }>(`/api/holds/${holdId}/release`, { method: "POST" });
}
