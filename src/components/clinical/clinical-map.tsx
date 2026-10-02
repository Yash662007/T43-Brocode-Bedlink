import React, { useEffect, useRef, useState } from "react";
import type * as LeafletTypes from "leaflet";
import "leaflet/dist/leaflet.css";
import { AlertCircle, Ambulance, Hospital, MapPin, RefreshCw, WifiOff } from "lucide-react";
import en from "@/locales/en.json";

// Shared Hospital & Ambulance coordinates
export interface HospitalLocation {
  id: string;
  name: string;
  rank?: number;
  isBestMatch?: boolean;
  lat: number;
  lng: number;
  availableBeds?: number;
  bedType?: string;
  freshness?: string;
  isSimulated?: boolean;
}

export const DEFAULT_HOSPITALS: [HospitalLocation, ...HospitalLocation[]] = [
  {
    id: "city-general",
    name: "City General Hospital",
    rank: 1,
    isBestMatch: true,
    lat: 19.076,
    lng: 72.8777,
    availableBeds: 3,
    bedType: "ICU",
    freshness: "2 min ago",
  },
  {
    id: "riverside",
    name: "Riverside Medical Centre",
    rank: 2,
    lat: 19.092,
    lng: 72.895,
    availableBeds: 1,
    bedType: "ICU",
    freshness: "7 min ago",
  },
  {
    id: "northside",
    name: "Northside Trauma Hospital",
    rank: 3,
    lat: 19.115,
    lng: 72.862,
    availableBeds: 2,
    bedType: "ICU",
    freshness: "18 min ago",
    isSimulated: true,
  },
];

export const DEFAULT_AMBULANCE_POS = {
  lat: 19.062,
  lng: 72.865,
  accuracyMeters: 15,
};

// Leaflet touches `window` at module-eval time, so it must never be imported
// during SSR. Loading it lazily, only from inside client-only effects, keeps
// it out of the server render's module graph entirely.
async function loadLeaflet(): Promise<typeof LeafletTypes> {
  const mod: unknown = await import("leaflet");
  return ((mod as { default?: typeof LeafletTypes }).default ?? mod) as typeof LeafletTypes;
}

function createSvgIcon(L: typeof LeafletTypes, html: string, className = "", size = 48) {
  return L.divIcon({
    html: `<div class="flex items-center justify-center w-[${size}px] h-[${size}px] ${className}">${html}</div>`,
    className: "leaflet-clinical-marker",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/* -------------------------------------------------------------------------- */
/* Hospital Screen Incoming Map                                               */
/* Small preview showing the ambulance position and hospital                  */
/* -------------------------------------------------------------------------- */
export interface HospitalIncomingMapProps {
  ambulanceLat?: number;
  ambulanceLng?: number;
  hospitalLat?: number;
  hospitalLng?: number;
  hospitalName?: string;
  etaMinutes?: number | undefined;
}

export function HospitalIncomingMap({
  ambulanceLat = DEFAULT_AMBULANCE_POS.lat,
  ambulanceLng = DEFAULT_AMBULANCE_POS.lng,
  hospitalLat = DEFAULT_HOSPITALS[0].lat,
  hospitalLng = DEFAULT_HOSPITALS[0].lng,
  hospitalName = DEFAULT_HOSPITALS[0].name,
  etaMinutes,
}: HospitalIncomingMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletTypes.Map | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;

    loadLeaflet().then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;

      try {
        const map = L.map(containerRef.current, {
          zoomControl: false,
          attributionControl: true,
          dragging: false,
          touchZoom: false,
          scrollWheelZoom: false,
          doubleClickZoom: false,
        });

        mapRef.current = map;

        const tileLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        });

        tileLayer.on("tileerror", () => setError(true));
        tileLayer.addTo(map);

        // Ambulance Marker (≥48px touch target)
        const ambulanceIcon = createSvgIcon(
          L,
          `<div class="flex items-center justify-center w-10 h-10 rounded-full border-2 border-white bg-[var(--danger-text)] text-white shadow-clinical">
           <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10 10H6"/><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.28a1 1 0 0 0-.684-.948l-1.923-.641a1 1 0 0 1-.578-.502l-1.539-2.564A1 1 0 0 0 16.422 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>
         </div>`,
          "cursor-default",
        );

        // Hospital Marker
        const hospitalIcon = createSvgIcon(
          L,
          `<div class="flex items-center justify-center w-10 h-10 rounded-full border-2 border-white bg-[var(--accent)] text-white shadow-clinical">
           <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 6v12"/><path d="M6 12h12"/></svg>
         </div>`,
          "cursor-default",
        );

        L.marker([ambulanceLat, ambulanceLng], {
          icon: ambulanceIcon,
          title: en.ambulance24,
        }).addTo(map);
        L.marker([hospitalLat, hospitalLng], { icon: hospitalIcon, title: hospitalName }).addTo(
          map,
        );

        // Connecting trajectory line (dashed estimate)
        L.polyline(
          [
            [ambulanceLat, ambulanceLng],
            [hospitalLat, hospitalLng],
          ],
          {
            color: "var(--accent)",
            weight: 3,
            dashArray: "6, 8",
            opacity: 0.8,
          },
        ).addTo(map);

        // Fit bounds with padding
        const bounds = L.latLngBounds([
          [ambulanceLat, ambulanceLng],
          [hospitalLat, hospitalLng],
        ]);
        map.fitBounds(bounds, { padding: [30, 30] });

        setLoading(false);
      } catch {
        setError(true);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch {
          // Map teardown can throw if the container was never fully laid out
          // (e.g. unmounted mid-load); the component is going away regardless.
        }
        mapRef.current = null;
      }
    };
  }, [ambulanceLat, ambulanceLng, hospitalLat, hospitalLng, hospitalName]);

  if (error) {
    return (
      <div className="flex h-36 w-full items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-xs font-medium text-[var(--text-2)]">
        <WifiOff className="mr-2 h-4 w-4 shrink-0 text-[var(--warn-text)]" />
        <span>Map preview unavailable offline</span>
      </div>
    );
  }

  return (
    <div className="relative h-36 w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)] shadow-xs">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--surface-2)]">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
        </div>
      )}
      <div ref={containerRef} className="h-full w-full leaflet-clinical-container" />
      <div className="absolute top-2 left-2 z-10 rounded-md border border-[var(--border)] bg-[var(--surface)]/90 px-2 py-1 text-xs font-semibold text-[var(--text)] shadow-xs backdrop-blur-xs">
        Arrival trajectory: ETA {etaMinutes != null ? `${Math.round(etaMinutes)} min` : "estimate"}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Dispatch Step A GPS & Pin Drop Map                                         */
/* -------------------------------------------------------------------------- */
export interface DispatchStepAMapProps {
  onLocationSelect?: (lat: number, lng: number) => void;
}

export function DispatchStepAMap({ onLocationSelect }: DispatchStepAMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletTypes.Map | null>(null);
  const markerRef = useRef<LeafletTypes.Marker | null>(null);
  const [pos, setPos] = useState(DEFAULT_AMBULANCE_POS);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;

    loadLeaflet().then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;

      try {
        const map = L.map(containerRef.current, {
          center: [pos.lat, pos.lng],
          zoom: 14,
          zoomControl: true,
          attributionControl: true,
        });
        mapRef.current = map;

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map);

        const ambulanceIcon = createSvgIcon(
          L,
          `<div class="flex items-center justify-center w-11 h-11 rounded-full border-2 border-white bg-[var(--accent)] text-white shadow-clinical">
         <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M2 12h2"/><path d="M20 12h2"/></svg>
       </div>`,
          "cursor-pointer",
        );

        const marker = L.marker([pos.lat, pos.lng], { icon: ambulanceIcon, draggable: true }).addTo(
          map,
        );
        markerRef.current = marker;

        // Accuracy circle
        const circle = L.circle([pos.lat, pos.lng], {
          radius: pos.accuracyMeters,
          color: "var(--accent)",
          fillColor: "var(--accent)",
          fillOpacity: 0.15,
          weight: 1,
        }).addTo(map);

        map.on("click", (e) => {
          marker.setLatLng(e.latlng);
          circle.setLatLng(e.latlng);
          setPos((prev) => ({ ...prev, lat: e.latlng.lat, lng: e.latlng.lng }));
          onLocationSelect?.(e.latlng.lat, e.latlng.lng);
        });

        marker.on("dragend", () => {
          const ll = marker.getLatLng();
          circle.setLatLng(ll);
          setPos((prev) => ({ ...prev, lat: ll.lat, lng: ll.lng }));
          onLocationSelect?.(ll.lat, ll.lng);
        });

        // Attempt GPS locate
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (p) => {
              if (cancelled) return;
              const newPos = {
                lat: p.coords.latitude,
                lng: p.coords.longitude,
                accuracyMeters: Math.round(p.coords.accuracy),
              };
              setPos(newPos);
              map.setView([newPos.lat, newPos.lng], 15);
              marker.setLatLng([newPos.lat, newPos.lng]);
              circle.setLatLng([newPos.lat, newPos.lng]);
              circle.setRadius(newPos.accuracyMeters);
            },
            () => {
              if (cancelled) return;
              setError("GPS access denied or unavailable. Tap map to place crew pin.");
            },
            { enableHighAccuracy: true, timeout: 5000 },
          );
        }
      } catch {
        if (!cancelled) {
          setError("Map preview unavailable. Tap map to place crew pin.");
        }
      }
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch {
          // Map teardown can throw if the container was never fully laid out
          // (e.g. unmounted mid-load); the component is going away regardless.
        }
        mapRef.current = null;
      }
    };
    // One-time map init: intentionally only reads the initial position, guarded above by mapRef.current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onLocationSelect]);

  return (
    <div className="flex flex-col gap-2">
      <div className="relative h-48 w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)] shadow-clinical">
        <div ref={containerRef} className="h-full w-full leaflet-clinical-container" />
        <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)]/95 px-2.5 py-1 text-xs font-semibold text-[var(--text)] shadow-xs backdrop-blur-xs">
          <MapPin className="h-3.5 w-3.5 text-[var(--accent)]" />
          <span>GPS Accuracy: ~{pos.accuracyMeters}m (Tap to drop pin)</span>
        </div>
      </div>
      {error && (
        <div className="flex items-center gap-2 text-xs font-medium text-[var(--warn-text)]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Dispatch Step B Comparison Map                                             */
/* Shows candidate hospitals ranked 1, 2, 3 with interactive highlight        */
/* -------------------------------------------------------------------------- */
export interface DispatchComparisonMapProps {
  hospitals: HospitalLocation[];
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
}

export function DispatchComparisonMap({
  hospitals,
  selectedIndex,
  onSelectIndex,
}: DispatchComparisonMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletTypes.Map | null>(null);
  const routeLineRef = useRef<LeafletTypes.Polyline | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;

    loadLeaflet().then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;

      try {
        const map = L.map(containerRef.current, {
          zoomControl: true,
          attributionControl: true,
        });
        mapRef.current = map;

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map);

        // Ambulance marker
        const ambIcon = createSvgIcon(
          L,
          `<div class="flex items-center justify-center w-11 h-11 rounded-full border-2 border-white bg-[var(--danger-text)] text-white shadow-clinical">
         <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10 10H6"/><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>
       </div>`,
          "cursor-default",
        );
        L.marker([DEFAULT_AMBULANCE_POS.lat, DEFAULT_AMBULANCE_POS.lng], {
          icon: ambIcon,
          title: en.ambulance24,
        }).addTo(map);

        // Numbered Hospital Markers
        hospitals.forEach((h, idx) => {
          const isSelected = selectedIndex === idx;
          const isBest = Boolean(h.isBestMatch);

          const markerHtml = `
        <div class="flex items-center justify-center w-11 h-11 rounded-full border-2 ${
          isSelected ? "border-[var(--text)] ring-4 ring-[var(--accent)]/30" : "border-white"
        } ${
          isBest ? "bg-[var(--accent)] text-white" : "bg-[var(--surface)] text-[var(--text)]"
        } shadow-clinical font-bold text-base tabular-nums">
          #${h.rank ?? idx + 1}
        </div>
      `;

          const hIcon = createSvgIcon(L, markerHtml, "cursor-pointer");
          const m = L.marker([h.lat, h.lng], { icon: hIcon, title: h.name }).addTo(map);

          m.on("click", () => {
            onSelectIndex(idx);
          });
        });

        // Connecting route estimate
        const selHospital = hospitals[selectedIndex] || hospitals[0];
        if (selHospital) {
          routeLineRef.current = L.polyline(
            [
              [DEFAULT_AMBULANCE_POS.lat, DEFAULT_AMBULANCE_POS.lng],
              [selHospital.lat, selHospital.lng],
            ],
            {
              color: "var(--accent)",
              weight: 4,
              dashArray: "8, 8",
              opacity: 0.9,
            },
          ).addTo(map);
        }

        const allPoints: LeafletTypes.LatLngExpression[] = [
          [DEFAULT_AMBULANCE_POS.lat, DEFAULT_AMBULANCE_POS.lng],
          ...hospitals.map((h): LeafletTypes.LatLngExpression => [h.lat, h.lng]),
        ];
        map.fitBounds(L.latLngBounds(allPoints), { padding: [40, 40] });
      } catch {
        // Map setup can fail in degraded environments; fail silently rather
        // than crash the screen. The pager controls below still work without it.
      }
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch {
          // Map teardown can throw if the container was never fully laid out
          // (e.g. unmounted mid-load); the component is going away regardless.
        }
        mapRef.current = null;
      }
    };
  }, [hospitals, onSelectIndex, selectedIndex]);

  // Update line when selection changes
  useEffect(() => {
    if (!mapRef.current || !routeLineRef.current) return;
    const target = hospitals[selectedIndex];
    if (target) {
      routeLineRef.current.setLatLngs([
        [DEFAULT_AMBULANCE_POS.lat, DEFAULT_AMBULANCE_POS.lng],
        [target.lat, target.lng],
      ]);
    }
  }, [hospitals, selectedIndex]);

  return (
    <div className="relative h-[220px] sm:h-[260px] w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)] shadow-clinical">
      <div ref={containerRef} className="h-full w-full leaflet-clinical-container" />
      <div className="absolute top-2 left-2 z-10 flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)]/95 px-3 py-1.5 text-xs font-semibold text-[var(--text)] shadow-xs backdrop-blur-xs">
        <span>
          Route to selected: <strong className="text-[var(--accent)] font-bold">estimate</strong>
        </span>
      </div>
    </div>
  );
}
