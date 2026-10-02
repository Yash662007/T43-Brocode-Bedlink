import "dotenv/config";

const BASE_URL = process.env["BEDLINK_API_URL"] ?? "http://localhost:4000";
const INTERVAL_MS = Number(process.env["SIMULATE_INTERVAL_MS"] ?? 4000);
const COUNT = Number(process.env["SIMULATE_COUNT"] ?? Infinity);

type HospitalBed = { bedType: string; free: number };
type Hospital = { id: string; name: string; beds: HospitalBed[] };

async function fetchHospitals(): Promise<Hospital[]> {
  const res = await fetch(`${BASE_URL}/api/hospitals`);
  if (!res.ok) throw new Error(`GET /api/hospitals failed: ${res.status}`);
  const data = (await res.json()) as { hospitals: Hospital[] };
  return data.hospitals;
}

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

/** Plays random admit/discharge events into POST /api/events, always tagged source=sim_feed. */
async function playOneEvent(hospitals: Hospital[]) {
  const hospital = pick(hospitals);
  if (hospital.beds.length === 0) return;
  const bed = pick(hospital.beds);

  const isDischarge = Math.random() < 0.5;
  const delta = isDischarge ? 1 : -1;
  if (!isDischarge && bed.free <= 0) return; // nothing to admit from

  const res = await fetch(`${BASE_URL}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      hospitalId: hospital.id,
      bedType: bed.bedType,
      delta,
      source: "sim_feed",
      note: isDischarge ? "simulated discharge" : "simulated admission",
    }),
  });

  if (!res.ok) {
    console.error(`[simulate] event failed (${res.status}):`, await res.text());
    return;
  }

  console.log(
    `[simulate] ${hospital.name}: ${bed.bedType} ${isDischarge ? "discharge (+1)" : "admit (-1)"}`,
  );
}

async function main() {
  console.log(`[simulate] playing simulated bed events into ${BASE_URL} every ${INTERVAL_MS}ms`);
  let played = 0;
  while (played < COUNT) {
    try {
      const hospitals = await fetchHospitals();
      await playOneEvent(hospitals);
    } catch (error) {
      console.error("[simulate] error:", error instanceof Error ? error.message : error);
    }
    played += 1;
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
  }
}

main();
