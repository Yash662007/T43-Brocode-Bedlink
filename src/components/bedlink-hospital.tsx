import React, { useEffect, useState } from "react";
import {
  Activity,
  BedDouble,
  Check,
  Clock3,
  HeartPulse,
  RotateCcw,
  Wifi,
  Wind,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { nurseBeds, type BedType } from "@/lib/bedlink-fixtures";
import en from "@/locales/en.json";
import {
  AppBar,
  CountdownRing,
  FreshnessBadge,
  StatusBadge,
} from "./clinical/shared-components";
import { HospitalIncomingMap } from "./clinical/clinical-map";

type Theme = "light" | "dark";
type OfferState = "idle" | "incoming" | "held" | "superseded" | "expired";

const bedIcons: Record<BedType, typeof BedDouble> = {
  icu: Activity,
  ventilator: Wind,
  oxygen: Activity,
  cardiac: HeartPulse,
  burns: Activity,
};

const bedNames: Record<BedType, string> = {
  icu: "ICU",
  ventilator: "Ventilator",
  oxygen: "Oxygen",
  cardiac: "Cardiac",
  burns: "Burns",
};

export function HospitalScreen() {
  const [theme, setTheme] = useState<Theme>("light");
  const [state, setState] = useState<OfferState>("incoming");
  const [secondsRemaining, setSecondsRemaining] = useState(84); // 01:24
  const [reasonOpen, setReasonOpen] = useState(false);
  const [releaseConfirm, setReleaseConfirm] = useState(false);
  const [mapCollapsed, setMapCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return window.innerHeight < 750;
    }
    return true;
  });

  // Live Countdown Timer
  useEffect(() => {
    if (state !== "incoming") return;
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          setState("expired");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [state]);

  const toggleTheme = () => setTheme((t) => (t === "light" ? "dark" : "light"));

  /* -------------------------------------------------------------------------- */
  /* 1. Incoming Urgent Offer View (role="alert")                               */
  /* -------------------------------------------------------------------------- */
  if (state === "incoming") {
    return (
      <main
        className={`min-h-screen bg-[var(--bg)] text-[var(--text)] pb-8 ${theme === "dark" ? "dark" : ""}`}
        role="alert"
        aria-labelledby="offer-title"
      >
        <AppBar
          title={en.appName}
          subtitle={`${en.hospital} · ${en.hospitalUnit}`}
          connectionState="live"
          theme={theme}
          onToggleTheme={toggleTheme}
        />

        <div className="mx-auto flex max-w-md flex-col px-4 pt-2 sm:px-6">
          {/* Top: Condition & Acuity Badge */}
          <div className="flex flex-col items-center text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--danger-text)]/20 bg-[var(--danger-surface)] px-2.5 py-0.5 text-xs font-bold tracking-wider uppercase text-[var(--danger-text)]">
              {en.incomingCondition}
            </span>

            <h1 id="offer-title" className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text)]">
              {en.incomingRequest}
            </h1>

            <div className="mt-0.5 flex items-center gap-2 text-sm sm:text-base font-semibold text-[var(--text-2)]">
              <BedDouble className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
              <span>{en.icuBedRequired}</span>
            </div>

            <p className="mt-0.5 text-xs sm:text-sm font-medium text-[var(--text-2)] tabular-nums">
              {en.arrivingIn} <strong className="font-bold text-[var(--text)]">8 min</strong>
            </p>
          </div>

          {/* Collapsible Arrival Map Preview */}
          <div className="mt-2">
            <div className="flex items-center justify-between py-0.5">
              <span className="text-xs font-bold text-[var(--text-2)] uppercase tracking-wider">
                Ambulance En Route
              </span>
              <button
                type="button"
                onClick={() => setMapCollapsed((c) => !c)}
                className="inline-flex min-h-[32px] items-center gap-1 text-xs font-semibold text-[var(--accent)] hover:underline"
              >
                <span>{mapCollapsed ? "Show map" : "Hide map"}</span>
                {mapCollapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
              </button>
            </div>
            {!mapCollapsed && <HospitalIncomingMap />}
          </div>

          {/* Circular Countdown Progress */}
          <div className="my-2 sm:my-4 flex items-center justify-center">
            <CountdownRing
              totalSeconds={84}
              remainingSeconds={secondsRemaining}
              size={120}
              strokeWidth={7}
            />
          </div>

          {/* Action Buttons: at least 32px apart */}
          <div className="flex flex-col gap-8 pt-1">
            {/* Primary Action: Accept & Hold (Flat Filled Green, 64px, No Glow) */}
            <button
              type="button"
              onClick={() => setState("held")}
              className="inline-flex min-h-[64px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--ok-text)] px-6 text-base font-bold text-white shadow-clinical transition-transform active:scale-[0.99]"
            >
              <Check className="h-6 w-6" aria-hidden="true" strokeWidth={2.5} />
              <span>{en.acceptAndHold}</span>
            </button>

            {/* Secondary Action: Decline (Outlined, 56px) */}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setReasonOpen((o) => !o)}
                className="inline-flex min-h-[56px] w-full items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-bold text-[var(--text)] shadow-xs transition-colors hover:bg-[var(--surface-2)]"
              >
                <X className="h-5 w-5" aria-hidden="true" />
                <span>{en.decline}</span>
              </button>

              {/* Optional Skippable Reason Chips */}
              {reasonOpen && (
                <div
                  className="flex flex-wrap items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3"
                  aria-label="Optional rejection reasons"
                >
                  {[
                    { label: en.reasonNoBed },
                    { label: en.reasonNoSpecialist },
                    { label: en.reasonOverloaded },
                  ].map((chip) => (
                    <button
                      key={chip.label}
                      type="button"
                      onClick={() => setState("idle")}
                      className="inline-flex min-h-[48px] items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--text)] transition-colors hover:bg-[var(--surface-2)] active:scale-95"
                    >
                      {chip.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setState("idle")}
                    className="inline-flex min-h-[48px] items-center px-3 text-xs font-semibold text-[var(--accent)] hover:underline"
                  >
                    {en.reasonSkip}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    );
  }

  /* -------------------------------------------------------------------------- */
  /* 2. Accepted / Held State                                                   */
  /* -------------------------------------------------------------------------- */
  if (state === "held") {
    return (
      <main className={`min-h-screen bg-[var(--bg)] text-[var(--text)] ${theme === "dark" ? "dark" : ""}`}>
        <AppBar
          title={en.appName}
          subtitle={`${en.hospital} · ${en.hospitalUnit}`}
          connectionState="live"
          theme={theme}
          onToggleTheme={toggleTheme}
        />

        <div className="mx-auto flex max-w-md flex-col items-center px-4 pt-12 text-center sm:px-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--ok-surface)] text-[var(--ok-text)] shadow-clinical">
            <Check className="h-8 w-8" strokeWidth={3} />
          </div>

          <span className="mt-4 text-xs font-bold uppercase tracking-wider text-[var(--ok-text)]">
            CONFIRMED
          </span>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--text)]">
            {en.confirmedTitle}
          </h1>
          <p className="mt-1 text-base font-semibold text-[var(--text-2)] tabular-nums">
            {en.bedHeldMessage}
          </p>

          <div className="mt-6 w-full">
            <HospitalIncomingMap />
          </div>

          <div className="mt-8 w-full max-w-xs">
            {releaseConfirm ? (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-clinical">
                <p className="text-sm font-bold text-[var(--text)]">{en.releaseBedPrompt}</p>
                <div className="mt-3 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setReleaseConfirm(false);
                      setState("idle");
                    }}
                    className="inline-flex min-h-[48px] items-center justify-center rounded-lg bg-[var(--danger-text)] px-4 text-sm font-bold text-white shadow-xs"
                  >
                    {en.releaseBed}
                  </button>
                  <button
                    type="button"
                    onClick={() => setReleaseConfirm(false)}
                    className="inline-flex min-h-[48px] items-center justify-center text-sm font-semibold text-[var(--text-2)] hover:underline"
                  >
                    {en.keepBed}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setReleaseConfirm(true)}
                className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-bold text-[var(--text)] shadow-xs hover:bg-[var(--surface-2)]"
              >
                {en.releaseBed}
              </button>
            )}
          </div>
        </div>
      </main>
    );
  }

  /* -------------------------------------------------------------------------- */
  /* 3. Superseded State (Neutral Grey)                                         */
  /* -------------------------------------------------------------------------- */
  if (state === "superseded") {
    return (
      <main className={`min-h-screen bg-[var(--bg)] text-[var(--text)] ${theme === "dark" ? "dark" : ""}`}>
        <AppBar
          title={en.appName}
          subtitle={`${en.hospital} · ${en.hospitalUnit}`}
          connectionState="live"
          theme={theme}
          onToggleTheme={toggleTheme}
        />

        <div className="mx-auto flex max-w-md flex-col items-center px-4 pt-16 text-center sm:px-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--unknown-surface)] text-[var(--unknown-text)] shadow-clinical">
            <Clock3 className="h-7 w-7" strokeWidth={2} />
          </div>

          <h1 className="mt-4 text-xl font-bold tracking-tight text-[var(--text)]">
            {en.takenByAnotherTitle}
          </h1>
          <p className="mt-1 text-sm text-[var(--text-2)]">{en.takenByAnotherMessage}</p>

          <button
            type="button"
            onClick={() => setState("idle")}
            className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-6 text-sm font-bold text-[var(--text)] shadow-xs hover:bg-[var(--surface-2)]"
          >
            {en.returnToBeds}
          </button>
        </div>
      </main>
    );
  }

  /* -------------------------------------------------------------------------- */
  /* 4. Expired State                                                           */
  /* -------------------------------------------------------------------------- */
  if (state === "expired") {
    return (
      <main className={`min-h-screen bg-[var(--bg)] text-[var(--text)] ${theme === "dark" ? "dark" : ""}`}>
        <AppBar
          title={en.appName}
          subtitle={`${en.hospital} · ${en.hospitalUnit}`}
          connectionState="live"
          theme={theme}
          onToggleTheme={toggleTheme}
        />

        <div className="mx-auto flex max-w-md flex-col items-center px-4 pt-16 text-center sm:px-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--warn-surface)] text-[var(--warn-text)] shadow-clinical">
            <Clock3 className="h-7 w-7" strokeWidth={2} />
          </div>

          <h1 className="mt-4 text-xl font-bold tracking-tight text-[var(--text)]">
            {en.expiredTitle}
          </h1>

          <button
            type="button"
            onClick={() => setState("idle")}
            className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-6 text-sm font-bold text-[var(--text)] shadow-xs hover:bg-[var(--surface-2)]"
          >
            {en.returnToBeds}
          </button>
        </div>
      </main>
    );
  }

  /* -------------------------------------------------------------------------- */
  /* 5. Idle Content: Bed Overview & Simulation Preview Controls                 */
  /* -------------------------------------------------------------------------- */
  return (
    <main className={`min-h-screen bg-[var(--bg)] text-[var(--text)] ${theme === "dark" ? "dark" : ""}`}>
      <AppBar
        title={en.appName}
        subtitle={`${en.hospital} · ${en.hospitalUnit}`}
        connectionState="live"
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <div className="mx-auto max-w-lg px-4 pt-6 pb-12 sm:px-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight text-[var(--text)]">
            {en.currentBeds}
          </h1>
          <span className="text-xs font-semibold text-[var(--text-2)]">{en.hospital}</span>
        </div>

        {/* Compact Bed Overview with FreshnessBadge */}
        <div className="mt-4 flex flex-col gap-2">
          {nurseBeds.slice(0, 4).map((bed) => {
            const Icon = bedIcons[bed.bedType];
            const statusType = bed.free === 0 ? "none" : bed.free <= 2 ? "low" : "available";
            return (
              <div
                key={bed.bedType}
                className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 px-4 shadow-clinical"
              >
                <div className="flex items-center gap-3">
                  <Icon className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
                  <span className="font-bold text-sm text-[var(--text)]">{bedNames[bed.bedType]}</span>
                  <StatusBadge status={statusType} />
                </div>
                <div className="flex items-center gap-3">
                  <FreshnessBadge updatedAtText={bed.updatedAt} />
                  <span className="text-2xl font-bold tabular-nums text-[var(--text)]">{bed.free}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Waiting Status */}
        <div className="mt-8 flex flex-col items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-6 text-center shadow-xs">
          <Wifi className="h-6 w-6 text-[var(--ok-text)]" aria-hidden="true" />
          <p className="mt-2 text-base font-bold text-[var(--text)]">{en.waitingForRequests}</p>
          <span className="text-xs text-[var(--text-2)]">{en.connectionLive}</span>
        </div>

        {/* Simulation Preview Controls */}
        <div className="mt-8 border-t border-[var(--border)] pt-4">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-2)]">
            Simulation State Previews
          </span>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setSecondsRemaining(84);
                setState("incoming");
              }}
              className="inline-flex min-h-[48px] items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-2)]"
            >
              {en.previewRequest}
            </button>
            <button
              type="button"
              onClick={() => setState("superseded")}
              className="inline-flex min-h-[48px] items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-2)]"
            >
              {en.previewSuperseded}
            </button>
            <button
              type="button"
              onClick={() => setState("expired")}
              className="inline-flex min-h-[48px] items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-2)]"
            >
              {en.previewExpired}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
