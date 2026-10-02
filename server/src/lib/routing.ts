import { rankingConfig } from "../config/index.js";

export type LatLng = { lat: number; lng: number };

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type TravelEstimate = {
  distanceKm: number;
  travelMinutes: number;
  isEstimate: boolean;
};

function fallbackEstimate(from: LatLng, to: LatLng): TravelEstimate {
  const distanceKm = haversineKm(from, to);
  const travelMinutes = (distanceKm / rankingConfig.assumedSpeedKmh) * 60;
  return { distanceKm, travelMinutes, isEstimate: true };
}

const OSRM_TIMEOUT_MS = 2500;

/**
 * Travel time via OSRM's public driving-route table, falling back to a
 * straight-line haversine distance at an assumed speed when OSRM is
 * unreachable or misconfigured. Always labelled as an estimate: OSRM itself
 * is a routed ETA, not a guarantee, and the haversine path never claims to
 * be anything but an approximation.
 */
export async function getTravelEstimate(from: LatLng, to: LatLng): Promise<TravelEstimate> {
  const baseUrl = process.env["OSRM_BASE_URL"];
  if (!baseUrl) return fallbackEstimate(from, to);

  const url = `${baseUrl.replace(/\/$/, "")}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OSRM_TIMEOUT_MS);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) return fallbackEstimate(from, to);

    const data = (await response.json()) as {
      code?: string;
      routes?: Array<{ duration: number; distance: number }>;
    };
    const route = data.routes?.[0];
    if (data.code !== "Ok" || !route) return fallbackEstimate(from, to);

    return {
      distanceKm: route.distance / 1000,
      travelMinutes: route.duration / 60,
      isEstimate: true,
    };
  } catch {
    return fallbackEstimate(from, to);
  }
}
