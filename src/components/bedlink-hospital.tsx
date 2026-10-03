import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  BedDouble,
  Check,
  Clock3,
  HeartPulse,
  Siren,
  Wifi,
  Wind,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { BedType } from "@/lib/bedlink-fixtures";
import en from "@/locales/en.json";
import {
  AppBar,
  CountdownRing,
  FreshnessBadge,
  StatusBadge,
  useClinicalTheme,
} from "./clinical/shared-components";
import { HospitalIncomingMap } from "./clinical/clinical-map";
import {
  acceptOffer,
  clearHospitalDiversion,
  getHospitals,
  rejectOffer,
  releaseHold,
  setHospitalDiversion,
  type HospitalDiversionDto,
  type OfferDto,
} from "@/lib/bedlink-client";
import { subscribeToBedlinkStream } from "@/lib/bedlink-stream";
import { DEMO_CONDITIONS, DEMO_HOSPITAL_ID } from "@/lib/bedlink-demo-config";


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

function conditionLabel(conditionId: string): string {
  return DEMO_CONDITIONS.find((c) => c.id === conditionId)?.label ?? conditionId;
}

export function HospitalScreen() {
  const [theme, toggleTheme] = useClinicalTheme();
  const [state, setState] = useState<OfferState>("idle");
  const [offer, setOffer] = useState<OfferDto | null>(null);
  const [holdId, setHoldId] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [releaseConfirm, setReleaseConfirm] = useState(false);
  const [mapCollapsed, setMapCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return window.innerHeight < 750;
    }
    return true;
  });

  const [hospitalId, setHospitalId] = useState(DEMO_HOSPITAL_ID);
  const hospitalIdRef = React.useRef(hospitalId);
  hospitalIdRef.current = hospitalId;

  const [diversion, setDiversion] = useState<HospitalDiversionDto | null>(null);
  const [diversionModalOpen, setDiversionModalOpen] = useState(false);
  const [selectedDiversionReason, setSelectedDiversionReason] = useState(en.reasonOvercrowded);
  const [selectedDiversionDuration, setSelectedDiversionDuration] = useState(60);

  const { data: hospitalsData } = useQuery({
    queryKey: ["hospitals"],
    queryFn: () => getHospitals(),
    refetchInterval: 30000,
  });
  const [liveBeds, setLiveBeds] = useState<
    Array<{ bedType: BedType; free: number; updatedAt: string; isSimulated: boolean }> | null
  >(null);

  const currentHospital =
    hospitalsData?.hospitals.find((h) => h.id === hospitalId) ?? hospitalsData?.hospitals[0];

  useEffect(() => {
    if (currentHospital) {
      if (currentHospital.diversion) {
        setDiversion(currentHospital.diversion);
      } else {
        setDiversion(null);
      }
      setLiveBeds(
        currentHospital.beds.map((b) => ({
          bedType: b.bedType,
          free: b.effectiveFree,
          updatedAt: b.freshness,
          isSimulated: b.isSimulated,
        })),
      );
    }
  }, [currentHospital]);

  const offerRef = React.useRef<OfferDto | null>(null);
  offerRef.current = offer;

  // Live offer/hold events addressed to this hospital, and countdowns.
  useEffect(() => {
    const unsubscribe = subscribeToBedlinkStream({
      onDiversion: (div) => {
        if (div.hospitalId !== hospitalIdRef.current) return;
        setDiversion({
          isDiverted: div.isDiverted,
          reason: div.reason,
          divertedUntil: div.divertedUntil,
          updatedAt: new Date().toISOString(),
        });
      },
      onOffer: (incoming) => {
        if (incoming.status === "pending") {
          // Auto-select this hospital so the desk user immediately sees the incoming request
          setHospitalId(incoming.hospitalId);
          setOffer(incoming);
          setState("incoming");
          const total = Math.round(
            (new Date(incoming.respondsBy).getTime() - Date.now()) / 1000,
          );
          setRemainingSeconds(Math.max(0, total));
          return;
        }
        if (incoming.hospitalId && incoming.hospitalId !== hospitalIdRef.current) return;
        setOffer((current) => (current?.offerId === incoming.offerId ? incoming : current));

        if (incoming.offerId === offerRef.current?.offerId || !offerRef.current) {
          if (incoming.status === "superseded") setState("superseded");
          if (incoming.status === "expired") setState("expired");
        }
      },
      onHold: (hold) => {
        if (hold.hospitalId !== hospitalIdRef.current) return;
        if (hold.status === "active") {
          setState("held");
        } else if (
          hold.status === "released" ||
          hold.status === "expired" ||
          hold.status === "consumed"
        ) {
          setHoldId(null);
          setState("idle");
          setOffer(null);
        }
      },
      onOutcome: (outcome) => {
        if (offerRef.current && outcome.requestId === offerRef.current.requestId) {
          if (outcome.status === "cancelled" || outcome.status === "arrived") {
            setHoldId(null);
            setState("idle");
            setOffer(null);
          }
        }
      },
      onBedChange: (change) => {
        if (change.hospitalId !== hospitalIdRef.current) return;
        setLiveBeds((current) =>
          current?.map((row) =>
            row.bedType === change.bedType
              ? { ...row, free: change.effectiveFree, updatedAt: en.justNow }
              : row,
          ) ?? current,
        );
      },
      onTick: (tick) => {
        const currentOffer = offerRef.current;
        if (currentOffer) {
          const mine = tick.offers.find((o) => o.offerId === currentOffer.offerId);
          if (mine) setRemainingSeconds(mine.remainingSeconds);
        }
      },
    });
    return unsubscribe;
  }, []);

  const handleAccept = async () => {
    if (!offer) return;
    const result = await acceptOffer(offer.offerId);
    if (result.accepted) {
      setHoldId(result.holdId);
      setState("held");
    } else {
      setState(result.reason.toLowerCase().includes("taken") ? "superseded" : "expired");
    }
  };

  const handleDecline = async (reason?: string) => {
    if (!offer) return;
    await rejectOffer(offer.offerId, reason);
    setState("idle");
    setOffer(null);
    setReasonOpen(false);
  };

  const handleRelease = async () => {
    if (!holdId) return;
    await releaseHold(holdId);
    setReleaseConfirm(false);
    setState("idle");
    setOffer(null);
    setHoldId(null);
  };

  const handleDeclareDiversion = async () => {
    try {
      const res = await setHospitalDiversion(hospitalId, {
        isDiverted: true,
        reason: selectedDiversionReason,
        durationMinutes: selectedDiversionDuration,
      });
      setDiversion(res.diversion);
      setDiversionModalOpen(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleResumeIntake = async () => {
    try {
      const res = await clearHospitalDiversion(hospitalId);
      setDiversion(res.diversion);
    } catch (e) {
      console.error(e);
    }
  };

  const renderDiversionBanner = () => {
    if (!diversion?.isDiverted) return null;
    const untilText = diversion.divertedUntil
      ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(
          new Date(diversion.divertedUntil),
        )
      : "";
    return (
      <div className="border-b border-[var(--danger-text)]/30 bg-[var(--danger-surface)] px-4 py-2.5 text-sm text-[var(--danger-text)]">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Siren className="h-5 w-5 animate-pulse shrink-0" aria-hidden="true" />
            <div>
              <strong className="font-bold uppercase tracking-wider">{en.edDiverted}</strong>
              {diversion.reason && <span className="ml-1.5 font-medium">({diversion.reason})</span>}
              {untilText && (
                <span className="ml-1 text-xs opacity-90 tabular-nums">
                  · {en.diversionUntil.replace("{time}", untilText)}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={handleResumeIntake}
            className="inline-flex min-h-[36px] items-center rounded-lg bg-[var(--danger-text)] px-3 text-xs font-bold text-white shadow-xs hover:opacity-90 active:scale-95"
          >
            {en.resumeIntake}
          </button>
        </div>
      </div>
    );
  };

  const renderDiversionModal = () => {
    if (!diversionModalOpen) return null;
    const reasonOptions = [
      en.reasonOvercrowded,
      en.reasonCathLabDown,
      en.reasonTraumaFull,
      en.reasonCTDown,
    ];
    const durationOptions = [30, 60, 120];

    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="diversion-dialog-title"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
      >
        <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
            <div className="flex items-center gap-2">
              <Siren className="h-5 w-5 text-[var(--danger-text)]" />
              <h2 id="diversion-dialog-title" className="text-base font-bold text-[var(--text)]">
                {en.declareDiversion}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setDiversionModalOpen(false)}
              className="rounded-lg p-1 text-[var(--text-2)] hover:text-[var(--text)]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <p className="mt-3 text-xs text-[var(--text-2)]">{en.diversionActiveNotice}</p>

          <div className="mt-4 flex flex-col gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--text-2)]">
                {en.diversionReasonLabel}
              </label>
              <div className="mt-1 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {reasonOptions.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setSelectedDiversionReason(r)}
                    className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold transition-colors ${
                      selectedDiversionReason === r
                        ? "border-[var(--danger-text)] bg-[var(--danger-surface)] text-[var(--danger-text)]"
                        : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--border)]"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--text-2)]">
                {en.diversionDurationLabel}
              </label>
              <div className="mt-1 flex gap-2">
                {durationOptions.map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setSelectedDiversionDuration(mins)}
                    className={`flex-1 rounded-lg border py-2 text-center text-xs font-bold transition-colors ${
                      selectedDiversionDuration === mins
                        ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                        : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--border)]"
                    }`}
                  >
                    {en.diversionMinutes.replace("{minutes}", String(mins))}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDiversionModalOpen(false)}
              className="inline-flex min-h-[44px] items-center rounded-lg border border-[var(--border)] px-4 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-2)]"
            >
              {en.aiCancel}
            </button>
            <button
              type="button"
              onClick={handleDeclareDiversion}
              className="inline-flex min-h-[44px] items-center rounded-lg bg-[var(--danger-text)] px-4 text-xs font-bold text-white shadow-xs hover:opacity-95"
            >
              {en.declareDiversion}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderTelemetryCard = (telemetry?: OfferDto["telemetry"]) => {
    if (!telemetry) return null;
    return (
      <div className="mt-3 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3 text-left">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] pb-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text)]">
            {en.incomingTelemetryTitle}
          </span>
          {telemetry.acuity && (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                telemetry.acuity === "red"
                  ? "bg-[var(--danger-surface)] text-[var(--danger-text)]"
                  : telemetry.acuity === "yellow"
                    ? "bg-[var(--warn-surface)] text-[var(--warn-text)]"
                    : "bg-[var(--ok-surface)] text-[var(--ok-text)]"
              }`}
            >
              {telemetry.acuity === "red"
                ? en.acuityRed
                : telemetry.acuity === "yellow"
                  ? en.acuityYellow
                  : en.acuityGreen}
            </span>
          )}
        </div>

        <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {telemetry.spo2 != null && (
            <div className="flex flex-col rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1.5 text-center">
              <span className="text-[10px] font-bold text-[var(--text-2)]">{en.spo2Label}</span>
              <span
                className={`text-sm font-extrabold ${
                  telemetry.spo2 < 94 ? "text-[var(--danger-text)]" : "text-[var(--text)]"
                }`}
              >
                {telemetry.spo2}%
              </span>
            </div>
          )}
          {telemetry.heartRate != null && (
            <div className="flex flex-col rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1.5 text-center">
              <span className="text-[10px] font-bold text-[var(--text-2)]">{en.heartRateLabel}</span>
              <span className="text-sm font-extrabold text-[var(--text)]">
                {telemetry.heartRate} bpm
              </span>
            </div>
          )}
          {telemetry.bpSys != null && (
            <div className="flex flex-col rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1.5 text-center">
              <span className="text-[10px] font-bold text-[var(--text-2)]">{en.bpLabel}</span>
              <span className="text-sm font-extrabold text-[var(--text)]">
                {telemetry.bpSys}/{telemetry.bpDia ?? "-"}
              </span>
            </div>
          )}
          {telemetry.gcs != null && (
            <div className="flex flex-col rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1.5 text-center">
              <span className="text-[10px] font-bold text-[var(--text-2)]">{en.gcsLabel}</span>
              <span className="text-sm font-extrabold text-[var(--text)]">
                {telemetry.gcs}/15
              </span>
            </div>
          )}
        </div>

        {(telemetry.age != null || telemetry.gender != null) && (
          <div className="mt-1.5 text-xs text-[var(--text-2)]">
            <span className="font-semibold text-[var(--text)]">
              {[
                telemetry.age != null ? `${telemetry.age} yrs` : null,
                telemetry.gender != null
                  ? telemetry.gender === "M"
                    ? en.genderM
                    : telemetry.gender === "F"
                      ? en.genderF
                      : en.genderOther
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
        )}

        {telemetry.notes && (
          <p className="mt-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] p-2 text-xs font-medium italic text-[var(--text)]">
            "{telemetry.notes}"
          </p>
        )}
      </div>
    );
  };

  const renderHospitalHeader = () => (
    <>
      <AppBar
        title={en.appName}
        subtitle={`${en.hospital} · ${currentHospital?.name ?? en.hospitalUnit}`}
        connectionState="live"
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      <div className="border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-1.5 shadow-xs">
        <div className="mx-auto flex max-w-md items-center justify-between gap-2 text-xs">
          <span className="font-bold text-[var(--text-2)] uppercase tracking-wider text-[11px]">
            Hospital Desk:
          </span>
          <select
            value={hospitalId}
            onChange={(e) => {
              const newId = e.target.value;
              setHospitalId(newId);
              if (state !== "incoming" && state !== "held") {
                setOffer(null);
                setState("idle");
              }
            }}
            aria-label="Select active hospital desk"
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs font-bold text-[var(--text)] shadow-xs focus:outline-none"
          >
            {hospitalsData?.hospitals.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </>
  );

  /* -------------------------------------------------------------------------- */
  /* 1. Incoming Urgent Offer View (role="alert")                               */
  /* -------------------------------------------------------------------------- */
  if (state === "incoming" && offer) {
    const totalSeconds = Math.max(
      1,
      Math.round((new Date(offer.respondsBy).getTime() - new Date(offer.sentAt).getTime()) / 1000),
    );

    return (
      <main
        className={`min-h-screen bg-[var(--bg)] text-[var(--text)] pb-8 ${theme === "dark" ? "dark" : ""}`}
        role="alert"
        aria-labelledby="offer-title"
      >
        {renderHospitalHeader()}

        {renderDiversionBanner()}

        <div className="mx-auto flex max-w-md flex-col px-4 pt-2 sm:px-6">
          {/* Top: Condition & Acuity Badge */}
          <div className="flex flex-col items-center text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--danger-text)]/20 bg-[var(--danger-surface)] px-2.5 py-0.5 text-xs font-bold tracking-wider uppercase text-[var(--danger-text)]">
              {conditionLabel(offer.condition)}
            </span>

            <h1
              id="offer-title"
              className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text)]"
            >
              {en.incomingRequest}
            </h1>

            <div className="mt-0.5 flex items-center gap-2 text-sm sm:text-base font-semibold text-[var(--text-2)]">
              <BedDouble className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
              <span>{bedNames[offer.bedType]} bed required</span>
            </div>

            <p className="mt-0.5 text-xs sm:text-sm font-medium text-[var(--text-2)] tabular-nums">
              {en.arrivingIn}{" "}
              <strong className="font-bold text-[var(--text)]">
                {offer.etaMinutes != null ? Math.round(offer.etaMinutes) : "?"} min
              </strong>
            </p>

            {renderTelemetryCard(offer.telemetry)}
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
                {mapCollapsed ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronUp className="h-3 w-3" />
                )}
              </button>
            </div>
            {!mapCollapsed && (
              <HospitalIncomingMap
                etaMinutes={offer?.etaMinutes ?? undefined}
                hospitalLat={currentHospital?.lat}
                hospitalLng={currentHospital?.lng}
                hospitalName={currentHospital?.name}
              />
            )}
          </div>

          {/* Circular Countdown Progress */}
          <div className="my-2 sm:my-4 flex items-center justify-center">
            <CountdownRing
              totalSeconds={totalSeconds}
              remainingSeconds={remainingSeconds}
              size={120}
              strokeWidth={7}
            />
          </div>

          {/* Action Buttons: at least 32px apart */}
          <div className="flex flex-col gap-8 pt-1">
            {/* Primary Action: Accept & Hold (Flat Filled Green, 64px, No Glow) */}
            <button
              type="button"
              onClick={handleAccept}
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
                    { label: en.reasonNoBed, reason: "no_bed" },
                    { label: en.reasonNoSpecialist, reason: "no_specialist" },
                    { label: en.reasonOverloaded, reason: "overloaded" },
                  ].map((chip) => (
                    <button
                      key={chip.label}
                      type="button"
                      onClick={() => handleDecline(chip.reason)}
                      className="inline-flex min-h-[48px] items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--text)] transition-colors hover:bg-[var(--surface-2)] active:scale-95"
                    >
                      {chip.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => handleDecline()}
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
      <main
        className={`min-h-screen bg-[var(--bg)] text-[var(--text)] ${theme === "dark" ? "dark" : ""}`}
      >
        {renderHospitalHeader()}

        {renderDiversionBanner()}

        <div className="mx-auto flex max-w-md flex-col items-center px-4 pt-8 text-center sm:px-6">
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
            {offer?.etaMinutes != null ? `ETA ${Math.round(offer.etaMinutes)} min` : en.bedHeldMessage}
          </p>

          {renderTelemetryCard(offer?.telemetry)}

          <div className="mt-6 w-full">
            <HospitalIncomingMap
              etaMinutes={offer?.etaMinutes ?? undefined}
              hospitalLat={currentHospital?.lat}
              hospitalLng={currentHospital?.lng}
              hospitalName={currentHospital?.name}
            />
          </div>


          <div className="mt-8 w-full max-w-xs">
            {releaseConfirm ? (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-clinical">
                <p className="text-sm font-bold text-[var(--text)]">{en.releaseBedPrompt}</p>
                <div className="mt-3 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleRelease}
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
      <main
        className={`min-h-screen bg-[var(--bg)] text-[var(--text)] ${theme === "dark" ? "dark" : ""}`}
      >
        {renderHospitalHeader()}

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
            onClick={() => {
              setOffer(null);
              setState("idle");
            }}
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
      <main
        className={`min-h-screen bg-[var(--bg)] text-[var(--text)] ${theme === "dark" ? "dark" : ""}`}
      >
        {renderHospitalHeader()}

        <div className="mx-auto flex max-w-md flex-col items-center px-4 pt-16 text-center sm:px-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--warn-surface)] text-[var(--warn-text)] shadow-clinical">
            <Clock3 className="h-7 w-7" strokeWidth={2} />
          </div>

          <h1 className="mt-4 text-xl font-bold tracking-tight text-[var(--text)]">
            {en.expiredTitle}
          </h1>

          <button
            type="button"
            onClick={() => {
              setOffer(null);
              setState("idle");
            }}
            className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-6 text-sm font-bold text-[var(--text)] shadow-xs hover:bg-[var(--surface-2)]"
          >
            {en.returnToBeds}
          </button>
        </div>
      </main>
    );
  }

  /* -------------------------------------------------------------------------- */
  /* 5. Idle Content: Bed Overview, waiting for requests                        */
  /* -------------------------------------------------------------------------- */
  return (
    <main
      className={`min-h-screen bg-[var(--bg)] text-[var(--text)] ${theme === "dark" ? "dark" : ""}`}
    >
      {renderHospitalHeader()}

      {renderDiversionBanner()}
      {renderDiversionModal()}

      <div className="mx-auto max-w-lg px-4 pt-6 pb-12 sm:px-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[var(--text)]">{en.currentBeds}</h1>
            <span className="text-xs font-semibold text-[var(--text-2)]">{en.hospital}</span>
          </div>

          <div className="flex items-center gap-2">
            {diversion?.isDiverted ? (
              <button
                type="button"
                onClick={handleResumeIntake}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[var(--danger-text)]/40 bg-[var(--danger-surface)] px-3 text-xs font-bold text-[var(--danger-text)] hover:opacity-90 active:scale-95"
              >
                <Siren className="h-3.5 w-3.5 animate-pulse" />
                <span>{en.edDiverted}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setDiversionModalOpen(true)}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--text)] shadow-xs hover:bg-[var(--surface-2)] active:scale-95"
              >
                <span className="h-2 w-2 rounded-full bg-[var(--ok-text)]" />
                <span>{en.edOpen}</span>
              </button>
            )}
          </div>
        </div>


        {/* Compact Bed Overview with FreshnessBadge */}
        <div className="mt-4 flex flex-col gap-2">
          {(liveBeds ?? []).slice(0, 4).map((bed) => {
            const Icon = bedIcons[bed.bedType];
            const statusType = bed.free === 0 ? "none" : bed.free <= 2 ? "low" : "available";
            return (
              <div
                key={bed.bedType}
                className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 px-4 shadow-clinical"
              >
                <div className="flex items-center gap-3">
                  <Icon className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
                  <span className="font-bold text-sm text-[var(--text)]">
                    {bedNames[bed.bedType]}
                  </span>
                  <StatusBadge status={statusType} />
                </div>
                <div className="flex items-center gap-3">
                  <FreshnessBadge updatedAtText={bed.updatedAt} />
                  <span className="text-2xl font-bold tabular-nums text-[var(--text)]">
                    {bed.free}
                  </span>
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
      </div>
    </main>
  );
}
