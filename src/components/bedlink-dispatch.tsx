import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Ambulance,
  BedDouble,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  HeartPulse,
  Hospital,
  MapPin,
  Route as RouteIcon,
  Siren,
} from "lucide-react";

import en from "@/locales/en.json";
import {
  AppBar,
  BottomActionBar,
  ClinicalToast,
  ConfidenceTag,
  CountdownRing,
  SegmentedControl,
  SimulatedBadge,
  useClinicalTheme,
} from "./clinical/shared-components";
import {
  DEFAULT_AMBULANCE_POS,
  DispatchComparisonMap,
  DispatchStepAMap,
  type HospitalLocation,
} from "./clinical/clinical-map";
import {
  cancelRequest,
  createRequest,
  markArrived,
  rankDispatch,
  submitFeedback,
  type RankedHospitalDto,
  type RequestSummaryDto,
} from "@/lib/bedlink-client";
import { subscribeToBedlinkStream } from "@/lib/bedlink-stream";
import { DEMO_CONDITIONS } from "@/lib/bedlink-demo-config";

type DispatchState = "matching" | "options" | "sent" | "confirmed" | "feedback" | "no-match";
type Mode = "sequential" | "parallel";

const CONFIDENCE_MAP: Record<RankedHospitalDto["confidence"], "likely_free" | "uncertain" | "probably_full" | "unknown"> = {
  likely: "likely_free",
  uncertain: "uncertain",
  probably_full: "probably_full",
  unknown: "unknown",
};

function toHospitalLocations(ranked: RankedHospitalDto[]): HospitalLocation[] {
  return ranked.map((h) => ({
    id: h.hospitalId,
    name: h.name,
    rank: h.rank,
    isBestMatch: h.rank === 1,
    lat: h.lat,
    lng: h.lng,
    availableBeds: h.availableBeds,
    bedType: h.bedType.toUpperCase(),
    freshness: h.freshness,
    isSimulated: h.isSimulated,
  }));
}

export function DispatchScreen() {
  const [theme, toggleTheme] = useClinicalTheme();
  const [state, setState] = useState<DispatchState>("matching");
  const [condition, setCondition] = useState(DEMO_CONDITIONS[0]!.id);
  const [mode, setMode] = useState<Mode>("sequential");
  const [crewLocation, setCrewLocation] = useState({
    lat: DEFAULT_AMBULANCE_POS.lat,
    lng: DEFAULT_AMBULANCE_POS.lng,
  });

  const [isRanking, setIsRanking] = useState(false);
  const [rankError, setRankError] = useState<string | null>(null);
  const [rankedHospitals, setRankedHospitals] = useState<RankedHospitalDto[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [requestSummary, setRequestSummary] = useState<RequestSummaryDto | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  // Pre-arrival telemetry fields
  const [telemetryOpen, setTelemetryOpen] = useState(false);
  const [acuity, setAcuity] = useState<"red" | "yellow" | "green">("yellow");
  const [spo2, setSpo2] = useState("");
  const [heartRate, setHeartRate] = useState("");
  const [bpSys, setBpSys] = useState("");
  const [bpDia, setBpDia] = useState("");
  const [gcs, setGcs] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [patientGender, setPatientGender] = useState<"M" | "F" | "Other">("M");
  const [telemetryNotes, setTelemetryNotes] = useState("");

  const hospitals: HospitalLocation[] = useMemo(
    () => toHospitalLocations(rankedHospitals),
    [rankedHospitals],
  );
  const selectedHospital = rankedHospitals[selectedIndex];

  const requestId = requestSummary?.request.id;
  const pendingOffer = requestSummary?.offers.find((o) => o.status === "pending");
  const activeHold = requestSummary?.holds.find((h) => h.status === "active");

  // Live updates for the in-flight request: offer sent/expired, hold
  // accepted, or a terminal outcome — all server-driven, this just displays it.
  useEffect(() => {
    if (!requestId) return;
    const unsubscribe = subscribeToBedlinkStream({
      onOffer: (offer) => {
        if (offer.requestId !== requestId) return;
        setRequestSummary((current) => {
          if (!current) return current;
          const others = current.offers.filter((o) => o.offerId !== offer.offerId);
          return { ...current, offers: [...others, offer] };
        });
      },
      onHold: (hold) => {
        if (hold.requestId !== requestId) return;
        if (hold.status === "active") {
          setState("confirmed");
          void getRequestSummary(requestId)
            .then((summary) => setRequestSummary(summary))
            .catch(() => {});
        }
      },
      onOutcome: (outcome) => {
        if (outcome.requestId !== requestId) return;
        if (outcome.status === "no_match" || outcome.status === "expired") {
          setState("no-match");
        } else if (outcome.status === "cancelled") {
          setState("matching");
        }
      },
      onTick: (tick) => {
        const mine = tick.offers.find((o) => o.requestId === requestId);
        if (mine) setRemainingSeconds(mine.remainingSeconds);
      },
    });
    return unsubscribe;
  }, [requestId]);

  // Seed the countdown immediately from the offer's own window, before the
  // first server tick arrives.
  useEffect(() => {
    if (!pendingOffer) return;
    const total = Math.round(
      (new Date(pendingOffer.respondsBy).getTime() - new Date(pendingOffer.sentAt).getTime()) /
        1000,
    );
    const remaining = Math.round((new Date(pendingOffer.respondsBy).getTime() - Date.now()) / 1000);
    setRemainingSeconds(Math.max(0, remaining || total));
  }, [pendingOffer?.offerId]);

  const startRanking = async () => {
    setIsRanking(true);
    setRankError(null);
    try {
      const result = await rankDispatch({ condition, lat: crewLocation.lat, lng: crewLocation.lng });
      setRankedHospitals(result.hospitals);
      setSelectedIndex(0);
      setState(result.hospitals.length === 0 ? "no-match" : "options");
    } catch (error) {
      setRankError(error instanceof Error ? error.message : "Could not check hospitals.");
    } finally {
      setIsRanking(false);
    }
  };

  const sendRequest = async () => {
    setIsSending(true);
    setSendError(null);
    try {
      const hasTelemetry = Boolean(
        spo2 || heartRate || bpSys || gcs || telemetryNotes || patientAge,
      );
      const telemetryPayload = hasTelemetry
        ? {
            acuity,
            spo2: spo2 ? parseInt(spo2, 10) : undefined,
            heartRate: heartRate ? parseInt(heartRate, 10) : undefined,
            bpSys: bpSys ? parseInt(bpSys, 10) : undefined,
            bpDia: bpDia ? parseInt(bpDia, 10) : undefined,
            gcs: gcs ? parseInt(gcs, 10) : undefined,
            age: patientAge ? parseInt(patientAge, 10) : undefined,
            gender: patientGender,
            notes: telemetryNotes.trim() || undefined,
          }
        : undefined;

      const summary = await createRequest({
        condition,
        lat: crewLocation.lat,
        lng: crewLocation.lng,
        mode,
        telemetry: telemetryPayload,
        preferredHospitalId: selectedHospital?.hospitalId,
      });
      setRequestSummary(summary);
      setState("sent");
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Could not send the request.");
    } finally {
      setIsSending(false);
    }
  };


  const resetToTriage = () => {
    setState("matching");
    setRequestSummary(null);
    setRankedHospitals([]);
    setSelectedIndex(0);
    setRankError(null);
    setSendError(null);
  };

  const handleArrived = async () => {
    if (!requestId) return;
    await markArrived(requestId);
    setState("feedback");
  };

  const handleFeedback = async (bedWasThere: boolean) => {
    if (!requestId) return;
    await submitFeedback(requestId, bedWasThere);
    setToast(bedWasThere ? "Thanks — glad it was ready." : "Thanks — this has been flagged.");
    resetToTriage();
  };

  const handleCancel = async () => {
    if (requestId) await cancelRequest(requestId);
    resetToTriage();
  };

  /* -------------------------------------------------------------------------- */
  /* 1. Matching: condition + mode + crew location, review action               */
  /* -------------------------------------------------------------------------- */
  if (state === "matching") {
    return (
      <main
        className={`min-h-screen bg-[var(--bg)] text-[var(--text)] pb-48 ${theme === "dark" ? "dark" : ""}`}
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
            <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text)]">
              {en.findIcuBed}
            </h1>
            <p className="mt-0.5 text-sm font-semibold text-[var(--text-2)]">{en.triageSubtitle}</p>
          </div>

          <div className="mt-4">
            <SegmentedControl
              ariaLabel="Condition"
              options={DEMO_CONDITIONS}
              value={condition}
              onChange={setCondition}
            />
          </div>

          <div className="mt-2">
            <SegmentedControl
              ariaLabel="Offer mode"
              options={[
                { id: "sequential", label: en.askOneByOne },
                { id: "parallel", label: en.askTop3 },
              ]}
              value={mode}
              onChange={(v) => setMode(v as Mode)}
            />
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

          {/* Patient Telemetry Collapsible Form */}
          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-clinical">
            <button
              type="button"
              onClick={() => setTelemetryOpen((o) => !o)}
              className="flex w-full items-center justify-between text-left"
            >
              <div className="flex items-center gap-2">
                <HeartPulse className="h-4 w-4 text-[var(--accent)]" />
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--text)]">
                  {en.telemetryTitle}
                </span>
              </div>
              <span className="text-xs font-semibold text-[var(--accent)] hover:underline">
                {telemetryOpen ? "Hide" : "+ Add vitals"}
              </span>
            </button>

            {telemetryOpen && (
              <div className="mt-3 flex flex-col gap-3 border-t border-[var(--border)] pt-3">
                {/* Acuity Selector */}
                <div>
                  <span className="text-[11px] font-bold text-[var(--text-2)]">{en.acuityLabel}</span>
                  <div className="mt-1 grid grid-cols-3 gap-1.5">
                    {[
                      {
                        id: "red",
                        label: "Red (Immed.)",
                        color:
                          "border-[var(--danger-text)] bg-[var(--danger-surface)] text-[var(--danger-text)]",
                      },
                      {
                        id: "yellow",
                        label: "Yellow (Emerg.)",
                        color:
                          "border-[var(--warn-text)] bg-[var(--warn-surface)] text-[var(--warn-text)]",
                      },
                      {
                        id: "green",
                        label: "Green (Urgent)",
                        color: "border-[var(--ok-text)] bg-[var(--ok-surface)] text-[var(--ok-text)]",
                      },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setAcuity(opt.id as any)}
                        className={`rounded-lg border px-2 py-1.5 text-center text-xs font-bold transition-all ${
                          acuity === opt.id
                            ? opt.color
                            : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-2)]"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Vitals Grid */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div>
                    <label className="text-[11px] font-semibold text-[var(--text-2)]">
                      {en.spo2Label}
                    </label>
                    <input
                      type="number"
                      placeholder="e.g. 96"
                      value={spo2}
                      onChange={(e) => setSpo2(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2 text-xs font-bold text-[var(--text)] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[var(--text-2)]">
                      {en.heartRateLabel}
                    </label>
                    <input
                      type="number"
                      placeholder="e.g. 88"
                      value={heartRate}
                      onChange={(e) => setHeartRate(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2 text-xs font-bold text-[var(--text)] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[var(--text-2)]">
                      {en.bpLabel}
                    </label>
                    <div className="mt-1 flex items-center gap-1">
                      <input
                        type="number"
                        placeholder="120"
                        value={bpSys}
                        onChange={(e) => setBpSys(e.target.value)}
                        className="w-1/2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2 text-xs font-bold text-[var(--text)] focus:outline-none"
                      />
                      <span>/</span>
                      <input
                        type="number"
                        placeholder="80"
                        value={bpDia}
                        onChange={(e) => setBpDia(e.target.value)}
                        className="w-1/2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2 text-xs font-bold text-[var(--text)] focus:outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[var(--text-2)]">
                      {en.gcsLabel}
                    </label>
                    <input
                      type="number"
                      placeholder="15"
                      min={3}
                      max={15}
                      value={gcs}
                      onChange={(e) => setGcs(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2 text-xs font-bold text-[var(--text)] focus:outline-none"
                    />
                  </div>
                </div>

                {/* Age & Gender */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-semibold text-[var(--text-2)]">
                      {en.patientAge}
                    </label>
                    <input
                      type="number"
                      placeholder="e.g. 58"
                      value={patientAge}
                      onChange={(e) => setPatientAge(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2 text-xs font-bold text-[var(--text)] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[var(--text-2)]">
                      {en.patientGender}
                    </label>
                    <select
                      value={patientGender}
                      onChange={(e) => setPatientGender(e.target.value as any)}
                      className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2 text-xs font-bold text-[var(--text)] focus:outline-none"
                    >
                      <option value="M">{en.genderM}</option>
                      <option value="F">{en.genderF}</option>
                      <option value="Other">{en.genderOther}</option>
                    </select>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="text-[11px] font-semibold text-[var(--text-2)]">
                    {en.telemetryNotes}
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 12-lead anterior STEMI, Aspirin 325mg given"
                    value={telemetryNotes}
                    onChange={(e) => setTelemetryNotes(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2 text-xs text-[var(--text)] focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="mt-4">
            <DispatchStepAMap
              onLocationSelect={(lat, lng) => setCrewLocation({ lat, lng })}
            />
          </div>


          {rankError && (
            <p className="mt-3 text-sm font-medium text-[var(--danger-text)]" role="alert">
              {rankError}
            </p>
          )}
        </div>

        <BottomActionBar>
          <div className="flex w-full max-w-md flex-col gap-3">
            <button
              type="button"
              onClick={startRanking}
              disabled={isRanking}
              className="inline-flex min-h-[64px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-6 text-base font-bold text-[var(--accent-text-on)] shadow-clinical transition-transform active:scale-[0.99] disabled:opacity-50"
            >
              <Check className="h-6 w-6" aria-hidden="true" strokeWidth={2.5} />
              <span>{isRanking ? en.checkedJustNow : en.reviewHospitals}</span>
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

        {toast && <ClinicalToast message={toast} onClose={() => setToast(null)} />}
      </main>
    );
  }

  /* -------------------------------------------------------------------------- */
  /* 2. Options: ranked hospital comparison map + candidate details             */
  /* -------------------------------------------------------------------------- */
  if (state === "options" && selectedHospital) {
    return (
      <main
        className={`min-h-screen bg-[var(--bg)] text-[var(--text)] pb-48 ${theme === "dark" ? "dark" : ""}`}
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
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {selectedHospital.rank === 1 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ok-surface)] px-2.5 py-0.5 text-xs font-bold text-[var(--ok-text)]">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  {en.bestMatch}
                </span>
              )}
              <ConfidenceTag level={CONFIDENCE_MAP[selectedHospital.confidence]} />
              {selectedHospital.isDiverted && (
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--danger-text)]/30 bg-[var(--danger-surface)] px-2.5 py-0.5 text-xs font-bold text-[var(--danger-text)]">
                  <Siren className="h-3.5 w-3.5 animate-pulse" />
                  {en.divertedBadge}
                </span>
              )}
              {selectedHospital.reliability && selectedHospital.reliability.totalFeedback >= 2 && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                    selectedHospital.reliability.accuracyRate >= 80
                      ? "bg-[var(--ok-surface)] text-[var(--ok-text)]"
                      : "bg-[var(--warn-surface)] text-[var(--warn-text)]"
                  }`}
                >
                  {selectedHospital.reliability.accuracyRate}% {en.arrivalAccuracy}
                </span>
              )}
            </div>
            {selectedHospital.isDiverted && (
              <div className="mt-2.5 rounded-lg border border-[var(--danger-text)]/30 bg-[var(--danger-surface)] p-2 text-xs font-semibold text-[var(--danger-text)]">
                ⚠️ {en.diversionActiveNotice}
              </div>
            )}
            {(selectedHospital.isGovt || selectedHospital.schemes.length > 0) && (
              <p className="mt-1.5 text-xs font-semibold text-[var(--text-2)]">
                {selectedHospital.isGovt ? "Govt" : "Private"}
                {selectedHospital.schemes.length > 0 ? ` · ${selectedHospital.schemes.join(", ")}` : ""}
              </p>
            )}


            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div>
                <dt className="flex items-center justify-center gap-1 text-xs font-semibold text-[var(--text-2)]">
                  <BedDouble className="h-3.5 w-3.5" aria-hidden="true" />
                  {en.bedLabel}
                </dt>
                <dd className="mt-0.5 text-sm font-bold tabular-nums text-[var(--text)]">
                  {selectedHospital.bedType.toUpperCase()} · {selectedHospital.availableBeds}
                </dd>
              </div>
              <div>
                <dt className="flex items-center justify-center gap-1 text-xs font-semibold text-[var(--text-2)]">
                  <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                  {en.arrivalLabel}
                </dt>
                <dd className="mt-0.5 text-sm font-bold tabular-nums text-[var(--text)]">
                  {en.aboutLabel} {Math.round(selectedHospital.travelMinutes)} min
                </dd>
              </div>
              <div>
                <dt className="flex items-center justify-center gap-1 text-xs font-semibold text-[var(--text-2)]">
                  <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                  {en.distanceLabel}
                </dt>
                <dd className="mt-0.5 text-sm font-bold tabular-nums text-[var(--text)]">
                  {selectedHospital.distanceKm.toFixed(1)} km
                </dd>
              </div>
            </dl>

            <p className="mt-3 text-xs font-medium text-[var(--text-2)]">{selectedHospital.reason}</p>
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

          {sendError && (
            <p className="mt-3 text-center text-sm font-medium text-[var(--danger-text)]" role="alert">
              {sendError}
            </p>
          )}
        </div>

        <BottomActionBar>
          <div className="flex w-full max-w-md flex-col gap-2">
            <button
              type="button"
              onClick={sendRequest}
              disabled={isSending}
              className="inline-flex min-h-[64px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-6 text-base font-bold text-[var(--accent-text-on)] shadow-clinical transition-transform active:scale-[0.99] disabled:opacity-50"
            >
              <Check className="h-6 w-6" aria-hidden="true" strokeWidth={2.5} />
              <span className="truncate">{en.sendBedRequest} · {selectedHospital.name}</span>
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
    const rejectedOffers =
      requestSummary?.offers.filter((o) => o.status === "rejected" || o.status === "expired") ?? [];
    const waitingFor =
      pendingOffer?.hospitalName ??
      requestSummary?.offers[requestSummary.offers.length - 1]?.hospitalName ??
      "";
    const total = pendingOffer
      ? Math.round(
          (new Date(pendingOffer.respondsBy).getTime() - new Date(pendingOffer.sentAt).getTime()) /
            1000,
        )
      : 120;

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
            {waitingFor}
          </h1>
          <p className="mt-1 text-sm font-semibold text-[var(--text-2)]">
            They have {Math.floor(total / 60)} min {total % 60} sec to respond.
          </p>

          {/* Offer Escalation Status Card (shows if earlier hospital rejected or expired) */}
          {rejectedOffers.length > 0 && (
            <div className="mt-4 w-full rounded-xl border border-[var(--warn-text)]/30 bg-[var(--warn-surface)] p-3 text-left shadow-xs">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--warn-text)]">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Offer Escalation History</span>
              </div>
              <div className="mt-2 flex flex-col gap-1.5 text-xs">
                {rejectedOffers.map((ro) => (
                  <div
                    key={ro.offerId}
                    className="flex items-center justify-between border-b border-[var(--border)]/40 pb-1 last:border-0 last:pb-0"
                  >
                    <span className="font-medium text-[var(--text-2)] line-through">
                      {ro.hospitalName}
                    </span>
                    <span className="font-bold text-[var(--danger-text)]">
                      {ro.status === "rejected"
                        ? ro.rejectReason
                          ? `Declined (${ro.rejectReason.replace(/_/g, " ")})`
                          : "Declined"
                        : "Timed out"}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-2.5 text-xs font-semibold text-[var(--text)]">
                ➡️ Request now routed to <strong className="font-bold text-[var(--accent)]">{waitingFor}</strong>. Waiting for hospital response.
              </p>
            </div>
          )}

          <div className="mt-6">
            <CountdownRing
              totalSeconds={total}
              remainingSeconds={remainingSeconds}
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
            onClick={handleCancel}
            className="mt-8 inline-flex min-h-[48px] items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-6 text-sm font-bold text-[var(--text)] shadow-xs hover:bg-[var(--surface-2)]"
          >
            {en.startNewRequest}
          </button>
        </div>
      </main>
    );
  }

  /* -------------------------------------------------------------------------- */
  /* 4. Confirmed: hospital accepted and is holding a bed                       */
  /* -------------------------------------------------------------------------- */
  if (state === "confirmed") {
    const hospitalName =
      requestSummary?.offers.find((o) => o.status === "accepted")?.hospitalName ??
      requestSummary?.offers[0]?.hospitalName ??
      selectedHospital?.name ??
      "";

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
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--ok-surface)] text-[var(--ok-text)] shadow-clinical">
            <Check className="h-8 w-8" strokeWidth={3} />
          </div>
          <span className="mt-4 text-xs font-bold uppercase tracking-wider text-[var(--ok-text)]">
            CONFIRMED
          </span>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--text)]">
            {hospitalName}
          </h1>
          <p className="mt-1 text-base font-semibold text-[var(--text-2)]">
            {en.decisionSupportFooter}
          </p>
        </div>

        <BottomActionBar>
          <div className="flex w-full max-w-md flex-col gap-2">
            <button
              type="button"
              onClick={handleArrived}
              className="inline-flex min-h-[64px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-6 text-base font-bold text-[var(--accent-text-on)] shadow-clinical transition-transform active:scale-[0.99]"
            >
              <Check className="h-6 w-6" aria-hidden="true" strokeWidth={2.5} />
              <span>{en.arrived}</span>
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-bold text-[var(--text)] shadow-xs hover:bg-[var(--surface-2)]"
            >
              {en.startNewRequest}
            </button>
          </div>
        </BottomActionBar>
      </main>
    );
  }

  /* -------------------------------------------------------------------------- */
  /* 5. Feedback: was a bed actually available on arrival                       */
  /* -------------------------------------------------------------------------- */
  if (state === "feedback") {
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
          <h1 className="text-xl font-bold tracking-tight text-[var(--text)]">
            {en.wasBedAvailable}
          </h1>
          <div className="mt-6 flex w-full max-w-xs gap-3">
            <button
              type="button"
              onClick={() => handleFeedback(true)}
              className="inline-flex min-h-[56px] flex-1 items-center justify-center rounded-xl bg-[var(--ok-text)] px-4 text-base font-bold text-white shadow-clinical active:scale-[0.99]"
            >
              {en.yes}
            </button>
            <button
              type="button"
              onClick={() => handleFeedback(false)}
              className="inline-flex min-h-[56px] flex-1 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-base font-bold text-[var(--text)] shadow-xs active:scale-[0.99]"
            >
              {en.no}
            </button>
          </div>
        </div>
      </main>
    );
  }

  /* -------------------------------------------------------------------------- */
  /* 6. No match: return to request                                             */
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
          onClick={resetToTriage}
          className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-6 text-sm font-bold text-[var(--text)] shadow-xs hover:bg-[var(--surface-2)]"
        >
          {en.backToRequest}
        </button>
      </div>
    </main>
  );
}
