import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Ambulance,
  BedDouble,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Hospital,
  MapPin,
  Route as RouteIcon,
} from "lucide-react";
import { getCityGeneralInventory } from "@/lib/hospital-inventory.functions";
import en from "@/locales/en.json";
import {
  AppBar,
  BottomActionBar,
  CountdownRing,
  SimulatedBadge,
  useClinicalTheme,
} from "./clinical/shared-components";
import {
  DEFAULT_HOSPITALS,
  DispatchComparisonMap,
  DispatchStepAMap,
  type HospitalLocation,
} from "./clinical/clinical-map";

type DispatchState = "matching" | "options" | "sent" | "no-match";

const RESPOND_SECONDS = 84; // 01:24

export function DispatchScreen() {
  const [theme, toggleTheme] = useClinicalTheme();
  const [state, setState] = useState<DispatchState>("matching");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [secondsRemaining, setSecondsRemaining] = useState(RESPOND_SECONDS);

  const fetchInventory = useServerFn(getCityGeneralInventory);
  const { data: sharedInventory = [] } = useQuery({
    queryKey: ["hospital-inventory", "city-general"],
    queryFn: () => fetchInventory(),
    refetchInterval: 15000,
  });
  const cityGeneralIcu = sharedInventory.find((row) => row.bedType === "icu");

  const hospitals: HospitalLocation[] = useMemo(
    () =>
      DEFAULT_HOSPITALS.map((hospital) =>
        hospital.id === "city-general" && cityGeneralIcu
          ? { ...hospital, availableBeds: cityGeneralIcu.free, freshness: en.justNow }
          : hospital,
      ),
    [cityGeneralIcu],
  );

  const selectedHospital = hospitals[selectedIndex] ?? hospitals[0];

  // Live countdown while waiting for the hospital to respond.
  useEffect(() => {
    if (state !== "sent") return;
    setSecondsRemaining(RESPOND_SECONDS);
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [state]);

  if (!selectedHospital) {
    return null;
  }

  /* -------------------------------------------------------------------------- */
  /* 1. Matching: triage summary, crew location, review action                  */
  /* -------------------------------------------------------------------------- */
  if (state === "matching") {
    return (
      <main
        className={`min-h-screen bg-[var(--bg)] text-[var(--text)] pb-32 ${theme === "dark" ? "dark" : ""}`}
      >
        <AppBar
          title={en.appName}
          subtitle={`${en.ambulanceRole} · ${en.ambulance24}`}
          connectionState="live"
          theme={theme}
          onToggleTheme={toggleTheme}
        />

        <div className="mx-auto flex max-w-md flex-col px-4 pt-4 sm:px-6">
          <div className="flex flex-col items-center text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--danger-text)]/20 bg-[var(--danger-surface)] px-2.5 py-0.5 text-xs font-bold tracking-wider uppercase text-[var(--danger-text)]">
              {en.conditionChestPain}
            </span>
            <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text)]">
              {en.findIcuBed}
            </h1>
            <p className="mt-0.5 text-sm font-semibold text-[var(--text-2)]">{en.triageSubtitle}</p>
          </div>

          <div className="mt-4 flex items-center justify-center gap-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-clinical">
            <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
              <Ambulance className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
              {en.ambulance24}
            </span>
            <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text)] tabular-nums">
              <RouteIcon className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
              {en.arrivingIn} 8 min
            </span>
          </div>

          <div className="mt-4">
            <DispatchStepAMap />
          </div>

          <div className="mt-6 flex flex-col items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-center shadow-xs">
            <Hospital className="h-6 w-6 text-[var(--accent)]" aria-hidden="true" />
            <p className="text-base font-bold text-[var(--text)]">{en.suitableFound}</p>
            <span className="text-xs text-[var(--text-2)]">{en.checkedJustNow}</span>
          </div>
        </div>

        <BottomActionBar>
          <div className="flex w-full max-w-md flex-col gap-3">
            <button
              type="button"
              onClick={() => setState("options")}
              className="inline-flex min-h-[64px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-6 text-base font-bold text-[var(--accent-text-on)] shadow-clinical transition-transform active:scale-[0.99]"
            >
              <Check className="h-6 w-6" aria-hidden="true" strokeWidth={2.5} />
              <span>{en.reviewHospitals}</span>
            </button>
            <button
              type="button"
              onClick={() => setState("no-match")}
              className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-bold text-[var(--text)] shadow-xs hover:bg-[var(--surface-2)]"
            >
              {en.noSuitableBed}
            </button>
          </div>
        </BottomActionBar>
      </main>
    );
  }

  /* -------------------------------------------------------------------------- */
  /* 2. Options: ranked hospital comparison map + candidate details             */
  /* -------------------------------------------------------------------------- */
  if (state === "options") {
    return (
      <main
        className={`min-h-screen bg-[var(--bg)] text-[var(--text)] pb-32 ${theme === "dark" ? "dark" : ""}`}
      >
        <AppBar
          title={en.appName}
          subtitle={`${en.ambulanceRole} · ${en.ambulance24}`}
          connectionState="live"
          theme={theme}
          onToggleTheme={toggleTheme}
        />

        <div className="mx-auto flex max-w-md flex-col px-4 pt-4 sm:px-6">
          <button
            type="button"
            onClick={() => setState("matching")}
            className="inline-flex min-h-[48px] items-center gap-1.5 self-start text-sm font-semibold text-[var(--accent)] hover:underline"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            {en.backToRequest}
          </button>

          <span className="mt-1 text-xs font-bold uppercase tracking-wider text-[var(--text-2)]">
            {en.selectHospital}
          </span>

          <div className="mt-2">
            <DispatchComparisonMap
              hospitals={hospitals}
              selectedIndex={selectedIndex}
              onSelectIndex={setSelectedIndex}
            />
          </div>

          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-clinical">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold tracking-tight text-[var(--text)]">
                {selectedHospital.name}
              </h2>
              {selectedHospital.isSimulated && <SimulatedBadge />}
            </div>
            {selectedHospital.isBestMatch && (
              <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-[var(--ok-surface)] px-2.5 py-0.5 text-xs font-bold text-[var(--ok-text)]">
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                {en.bestMatch}
              </span>
            )}

            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div>
                <dt className="flex items-center justify-center gap-1 text-xs font-semibold text-[var(--text-2)]">
                  <BedDouble className="h-3.5 w-3.5" aria-hidden="true" />
                  {en.bedLabel}
                </dt>
                <dd className="mt-0.5 text-sm font-bold tabular-nums text-[var(--text)]">
                  {selectedHospital.bedType ?? "ICU"} · {selectedHospital.availableBeds ?? 0}
                </dd>
              </div>
              <div>
                <dt className="flex items-center justify-center gap-1 text-xs font-semibold text-[var(--text-2)]">
                  <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                  {en.arrivalLabel}
                </dt>
                <dd className="mt-0.5 text-sm font-bold tabular-nums text-[var(--text)]">
                  {en.aboutLabel} {8 + selectedIndex * 3} min
                </dd>
              </div>
              <div>
                <dt className="flex items-center justify-center gap-1 text-xs font-semibold text-[var(--text-2)]">
                  <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                  {en.distanceLabel}
                </dt>
                <dd className="mt-0.5 text-sm font-bold tabular-nums text-[var(--text)]">
                  {(2.4 + selectedIndex * 1.7).toFixed(1)} km
                </dd>
              </div>
            </dl>
          </div>

          <div
            className="mt-3 flex items-center justify-center gap-4"
            aria-label={`Hospital ${selectedIndex + 1} of ${hospitals.length}`}
          >
            <button
              type="button"
              onClick={() => setSelectedIndex((i) => Math.max(0, i - 1))}
              disabled={selectedIndex === 0}
              aria-label="Previous hospital"
              className="inline-flex min-h-[48px] min-w-[48px] items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] disabled:opacity-40"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <span className="text-sm font-semibold tabular-nums text-[var(--text-2)]">
              {selectedIndex + 1} / {hospitals.length}
            </span>
            <button
              type="button"
              onClick={() => setSelectedIndex((i) => Math.min(hospitals.length - 1, i + 1))}
              disabled={selectedIndex === hospitals.length - 1}
              aria-label="Next hospital"
              className="inline-flex min-h-[48px] min-w-[48px] items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] disabled:opacity-40"
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <p className="mt-4 text-center text-xs text-[var(--text-2)]">
            {en.decisionSupportFooter}
          </p>
        </div>

        <BottomActionBar>
          <div className="flex w-full max-w-md flex-col gap-2">
            <button
              type="button"
              onClick={() => setState("sent")}
              className="inline-flex min-h-[64px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-6 text-base font-bold text-[var(--accent-text-on)] shadow-clinical transition-transform active:scale-[0.99]"
            >
              <Check className="h-6 w-6" aria-hidden="true" strokeWidth={2.5} />
              <span>{en.sendBedRequest}</span>
            </button>
            <p className="text-center text-xs text-[var(--text-2)]">{en.requestDisclaimer}</p>
          </div>
        </BottomActionBar>
      </main>
    );
  }

  /* -------------------------------------------------------------------------- */
  /* 3. Sent: waiting for hospital response                                     */
  /* -------------------------------------------------------------------------- */
  if (state === "sent") {
    return (
      <main
        className={`min-h-screen bg-[var(--bg)] text-[var(--text)] ${theme === "dark" ? "dark" : ""}`}
      >
        <AppBar
          title={en.appName}
          subtitle={`${en.ambulanceRole} · ${en.ambulance24}`}
          connectionState="live"
          theme={theme}
          onToggleTheme={toggleTheme}
        />

        <div className="mx-auto flex max-w-md flex-col items-center px-4 pt-12 text-center sm:px-6">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--accent)]">
            {en.requestSentTitle}
          </span>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--text)]">
            {selectedHospital.name}
          </h1>
          <p className="mt-1 text-sm font-semibold text-[var(--text-2)]">{en.respondTimeNotice}</p>

          <div className="mt-6">
            <CountdownRing
              totalSeconds={RESPOND_SECONDS}
              remainingSeconds={secondsRemaining}
              size={140}
              strokeWidth={8}
            />
          </div>

          <div className="mt-6 flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-semibold text-[var(--text)] shadow-xs">
            <Ambulance className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
            {en.ambulance24}
          </div>

          <button
            type="button"
            onClick={() => {
              setSelectedIndex(0);
              setState("matching");
            }}
            className="mt-8 inline-flex min-h-[48px] items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-6 text-sm font-bold text-[var(--text)] shadow-xs hover:bg-[var(--surface-2)]"
          >
            {en.startNewRequest}
          </button>
        </div>
      </main>
    );
  }

  /* -------------------------------------------------------------------------- */
  /* 4. No match: return to request                                             */
  /* -------------------------------------------------------------------------- */
  return (
    <main
      className={`min-h-screen bg-[var(--bg)] text-[var(--text)] ${theme === "dark" ? "dark" : ""}`}
    >
      <AppBar
        title={en.appName}
        subtitle={`${en.ambulanceRole} · ${en.ambulance24}`}
        connectionState="live"
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <div className="mx-auto flex max-w-md flex-col items-center px-4 pt-16 text-center sm:px-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--unknown-surface)] text-[var(--unknown-text)] shadow-clinical">
          <Hospital className="h-7 w-7" strokeWidth={2} aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-xl font-bold tracking-tight text-[var(--text)]">
          {en.noMatchTitle}
        </h1>
        <p className="mt-1 text-sm text-[var(--text-2)]">{en.noMatchSubtitle}</p>
        <button
          type="button"
          onClick={() => setState("matching")}
          className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-6 text-sm font-bold text-[var(--text)] shadow-xs hover:bg-[var(--surface-2)]"
        >
          {en.backToRequest}
        </button>
      </div>
    </main>
  );
}
