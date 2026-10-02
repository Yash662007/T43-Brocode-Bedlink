import { writeFileSync } from "node:fs";
import { join } from "node:path";

const OVERPASS_URL = process.env["OVERPASS_URL"] ?? "https://overpass-api.de/api/interpreter";

// south,west,north,east — defaults to a box around Mumbai, matching the demo seed.
const BBOX = process.env["IMPORT_BBOX"] ?? "18.90,72.75,19.25,73.05";
const OUT_FILE = process.env["IMPORT_OUT"] ?? join(process.cwd(), "data", "osm-hospitals.json");

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

type ImportedHospital = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  osmType: string;
  osmId: number;
  tags: Record<string, string>;
};

function slugify(name: string, id: number): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base ? `${base}-${id}` : `osm-${id}`;
}

async function main() {
  const query = `[out:json][timeout:25];(node["amenity"="hospital"](${BBOX});way["amenity"="hospital"](${BBOX});relation["amenity"="hospital"](${BBOX}););out center tags;`;

  console.log(`[import-hospitals] querying Overpass for bbox ${BBOX} ...`);
  const response = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "*/*",
      "User-Agent": "bedlink-import-hospitals/1.0 (clinical demo seed tool)",
    },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!response.ok) {
    throw new Error(`Overpass request failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as { elements: OverpassElement[] };

  const hospitals: ImportedHospital[] = data.elements
    .map((el) => {
      const lat = el.lat ?? el.center?.lat;
      const lng = el.lon ?? el.center?.lon;
      const name = el.tags?.["name"];
      if (lat == null || lng == null || !name) return null;
      return {
        id: slugify(name, el.id),
        name,
        lat,
        lng,
        osmType: el.type,
        osmId: el.id,
        tags: el.tags ?? {},
      };
    })
    .filter((h): h is ImportedHospital => h !== null);

  writeFileSync(OUT_FILE, JSON.stringify(hospitals, null, 2));
  console.log(`[import-hospitals] wrote ${hospitals.length} hospitals to ${OUT_FILE}`);
  console.log(
    `[import-hospitals] next: hand-fill config/capabilities.json entries for the ones you want to seed.`,
  );
}

main().catch((error) => {
  console.error("[import-hospitals] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
