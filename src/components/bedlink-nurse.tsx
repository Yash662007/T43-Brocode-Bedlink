import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertCircle,
  BedDouble,
  Check,
  CircleAlert,
  Droplets,
  HeartPulse,
  History,
  Minus,
  PenLine,
  Plus,
  RotateCcw,
  Wind,
  X,
} from "lucide-react";
import type { BedRow, BedType } from "@/lib/bedlink-fixtures";
import { reviewBedAvailabilityNote } from "@/lib/bed-update-extraction.functions";
import {
  getBedHistory,
  getHospitals,
  proposeBedChanges,
  updateBed as apiUpdateBed,
} from "@/lib/bedlink-client";
import { bedEventToAuditEvent } from "@/lib/bedlink-nurse-adapters";
import { subscribeToBedlinkStream } from "@/lib/bedlink-stream";
import { DEMO_HOSPITAL_ID, NURSE_TOKEN } from "@/lib/bedlink-demo-config";
import type { InventoryAuditEvent } from "@/lib/hospital-inventory";
import en from "@/locales/en.json";
import {
  AppBar,
  BottomActionBar,
  ClinicalToast,
  FreshnessBadge,
  OfflineBanner,
  SimulatedBadge,
  StatusBadge,
  useClinicalTheme,
} from "./clinical/shared-components";

const bedIcons: Record<BedType, typeof BedDouble> = {
  icu: Activity,
  ventilator: Wind,
  oxygen: Droplets,
  cardiac: HeartPulse,
  burns: CircleAlert,
};

const bedNames: Record<BedType, string> = {
  icu: "ICU",
  ventilator: "Ventilator",
  oxygen: "Oxygen",
  cardiac: "Cardiac",
  burns: "Burns",
};

function bedsFromHospitalQuery(
  hospitals: Awaited<ReturnType<typeof getHospitals>>["hospitals"] | undefined,
): BedRow[] | undefined {
  const hospital = hospitals?.find((h) => h.id === DEMO_HOSPITAL_ID);
  if (!hospital) return undefined;
  return hospital.beds.map((bed) => ({
    bedType: bed.bedType,
    free: bed.free,
    updatedAt: bed.freshness,
    source: bed.source as BedRow["source"],
  }));
}

export function NurseScreen() {
  const [beds, setBeds] = useState<BedRow[] | null>(null);
  // Last counts the server confirmed — used to only send what actually changed.
  const [serverBeds, setServerBeds] = useState<BedRow[] | null>(null);
  const [simple, setSimple] = useState(false);
  const [offline, setOffline] = useState(false);
  const [theme, toggleTheme] = useClinicalTheme();
  const [nurseName, setNurseName] = useState(en.defaultNurseName);
  const [toast, setToast] = useState<string | null>(null);
  const [recentlyUpdatedBed, setRecentlyUpdatedBed] = useState<BedType | null>(null);
  const [previousBedState, setPreviousBedState] = useState<BedRow[] | null>(null);

  // Type an update sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [note, setNote] = useState("");
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [suggestedUpdates, setSuggestedUpdates] = useState<
    Array<{ bedType: BedType; free: number; availability: "available" | "unavailable" }>
  >([]);

  // History timeline view state
  const [showHistory, setShowHistory] = useState(false);
  const [historyNurseFilter, setHistoryNurseFilter] = useState("all");
  const [historySourceFilter, setHistorySourceFilter] = useState("all");
  const [historyFromDate, setHistoryFromDate] = useState("");
  const [historyToDate, setHistoryToDate] = useState("");

  const queryClient = useQueryClient();

  const {
    data: hospitalsData,
    isLoading: isBedsLoading,
    isError: isBedsError,
    refetch: refetchBeds,
  } = useQuery({
    queryKey: ["hospitals"],
    queryFn: () => getHospitals(),
  });

  // Seed local editable state from the server once per fresh load, and keep a
  // separate "last confirmed" copy so saves only send what actually changed.
  useEffect(() => {
    const loaded = bedsFromHospitalQuery(hospitalsData?.hospitals);
    if (loaded) {
      setBeds((current) => current ?? loaded);
      setServerBeds(loaded);
    }
  }, [hospitalsData]);

  // Live updates from other sources (telegram, phoned-in, simulated feed,
  // hold consumption on arrival) while this screen is open.
  useEffect(() => {
    const unsubscribe = subscribeToBedlinkStream({
      onConnectionChange: (state) => setOffline(state === "reconnecting"),
      onBedChange: (change) => {
        if (change.hospitalId !== DEMO_HOSPITAL_ID) return;
        setServerBeds((current) =>
          current?.map((row) =>
            row.bedType === change.bedType
              ? { ...row, free: change.effectiveFree, updatedAt: en.justNow }
              : row,
          ) ?? current,
        );
        setBeds((current) =>
          current?.map((row) =>
            row.bedType === change.bedType
              ? { ...row, free: change.effectiveFree, updatedAt: en.justNow }
              : row,
          ) ?? current,
        );
      },
    });
    return unsubscribe;
  }, []);

  const { data: history = [], isLoading: isHistoryLoading } = useQuery({
    queryKey: ["bed-history", DEMO_HOSPITAL_ID],
    queryFn: async () => {
      const { history: rows } = await getBedHistory(NURSE_TOKEN);
      return rows.map(bedEventToAuditEvent);
    },
  });

  const inventoryMutation = useMutation({
    mutationFn: async ({
      nextBeds,
      isRestore,
    }: {
      nextBeds: BedRow[];
      isRestore?: boolean;
    }) => {
      const baseline = serverBeds ?? [];
      const changed = nextBeds.filter((row) => {
        const previous = baseline.find((b) => b.bedType === row.bedType);
        return !previous || previous.free !== row.free;
      });
      await Promise.all(
        changed.map((row) =>
          apiUpdateBed(NURSE_TOKEN, {
            bedType: row.bedType,
            value: row.free,
            actor: nurseName.trim() || en.defaultNurseName,
            ...(isRestore ? { isRestore: true } : {}),
          }),
        ),
      );
      return nextBeds;
    },
    onSuccess: (nextBeds) => {
      setServerBeds(nextBeds);
      queryClient.invalidateQueries({ queryKey: ["bed-history", DEMO_HOSPITAL_ID] });
      setToast(en.inventoryShared);
    },
    onError: () => setToast(en.inventoryError),
  });

  const updateBed = (bedType: BedType, nextValue: number) => {
    const clamped = Math.max(0, nextValue);
    setPreviousBedState(beds);
    setRecentlyUpdatedBed(bedType);

    setBeds((current) =>
      current
        ? current.map((row) =>
            row.bedType === bedType ? { ...row, free: clamped, updatedAt: en.justNow } : row,
          )
        : current,
    );

    const text = `${bedNames[bedType]}: ${clamped} ${en.free}.`;
    setToast(text);

    setTimeout(() => {
      setRecentlyUpdatedBed(null);
    }, 600);

    navigator.vibrate?.(10);
  };

  const handleUndo = () => {
    if (previousBedState) {
      setBeds(previousBedState);
      setPreviousBedState(null);
      setToast(null);
    }
  };

  const confirmEverythingCorrect = () => {
    if (!beds) return;
    inventoryMutation.mutate({ nextBeds: beds });
  };

  const reviewNote = async () => {
    if (!note.trim() || isReviewing || !beds) return;
    setIsReviewing(true);
    setReviewError(null);
    try {
      const result = await reviewBedAvailabilityNote({ data: { note } });
      setSuggestedUpdates(result);
      const changes = result
        .map((update) => ({
          bedType: update.bedType,
          previousFree: beds.find((row) => row.bedType === update.bedType)?.free ?? 0,
          nextFree: update.free,
        }))
        .filter((change) => change.previousFree !== change.nextFree);
      if (changes.length > 0) {
        await proposeBedChanges(NURSE_TOKEN, changes);
        queryClient.invalidateQueries({ queryKey: ["bed-history", DEMO_HOSPITAL_ID] });
      }
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : en.aiReviewError);
    } finally {
      setIsReviewing(false);
    }
  };

  const applySuggestedUpdates = () => {
    if (!beds) return;
    const nextBeds = beds.map((row) => {
      const update = suggestedUpdates.find((suggestion) => suggestion.bedType === row.bedType);
      return update ? { ...row, free: update.free, updatedAt: en.justNow } : row;
    });
    setBeds(nextBeds);
    inventoryMutation.mutate({ nextBeds });
    setToast(en.aiApplied);
    setSuggestedUpdates([]);
    setNote("");
    setSheetOpen(false);
  };

  const restoreHistoryEvent = (event: InventoryAuditEvent) => {
    if (!beds) return;
    const nextBeds = beds.map((row) => {
      const change = event.changes.find((entry) => entry.bedType === row.bedType);
      return change ? { ...row, free: change.previousFree, updatedAt: en.justNow } : row;
    });
    setBeds(nextBeds);
    inventoryMutation.mutate({ nextBeds, isRestore: true });
  };

  const nurseFilterOptions = Array.from(
    new Set(
      history.map((event) => event.nurseName).filter((name): name is string => Boolean(name)),
    ),
  );

  const filteredHistory = history.filter((event) => {
    const eventDate = event.createdAt.slice(0, 10);
    const matchesNurse = historyNurseFilter === "all" || event.nurseName === historyNurseFilter;
    const matchesSource = historySourceFilter === "all" || event.source === historySourceFilter;
    const isAfterStart = !historyFromDate || eventDate >= historyFromDate;
    const isBeforeEnd = !historyToDate || eventDate <= historyToDate;
    return matchesNurse && matchesSource && isAfterStart && isBeforeEnd;
  });

  const isInitialLoading = isBedsLoading && !beds;
  const hasLoadError = isBedsError && !beds;

  return (
    <div
      className={`min-h-screen bg-[var(--bg)] text-[var(--text)] ${theme === "dark" ? "dark" : ""}`}
    >
      {/* 1. Global Clinical App Bar */}
      <AppBar
        title={en.appName}
        subtitle={`${en.hospital} · ${en.hospitalUnit}`}
        connectionState={offline ? "reconnecting" : "live"}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* Offline Alert Banner */}
      {offline && <OfflineBanner queueCount={0} />}

      {isInitialLoading && (
        <main className="mx-auto flex max-w-lg flex-col items-center px-4 pt-16 text-center sm:px-6">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
          <p className="mt-4 text-sm font-medium text-[var(--text-2)]">{en.historyLoading}</p>
        </main>
      )}

      {hasLoadError && (
        <main className="mx-auto flex max-w-lg flex-col items-center px-4 pt-16 text-center sm:px-6">
          <AlertCircle className="h-8 w-8 text-[var(--danger-text)]" aria-hidden="true" />
          <p className="mt-4 text-sm font-medium text-[var(--text)]">
            Bed counts could not be loaded.
          </p>
          <button
            type="button"
            onClick={() => refetchBeds()}
            className="mt-4 inline-flex min-h-[48px] items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-6 text-sm font-bold text-[var(--text)] shadow-xs hover:bg-[var(--surface-2)]"
          >
            Retry
          </button>
        </main>
      )}

      {beds && (
        <>
          <main className="mx-auto max-w-lg px-4 pt-4 pb-32 sm:px-6">
            {/* Screen Header & Mode Toggle */}
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">
                  {en.nurseTitle}
                </h1>
                <p className="mt-1 text-sm text-[var(--text-2)]">{en.hint}</p>
              </div>

              <div className="flex flex-col items-end gap-2">
                <button
                  type="button"
                  onClick={() => setSimple((s) => !s)}
                  className={`inline-flex min-h-[48px] items-center rounded-lg border px-3 text-sm font-semibold transition-colors ${
                    simple
                      ? "border-[var(--accent)] bg-[var(--surface-2)] text-[var(--accent)]"
                      : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-2)]"
                  }`}
                  aria-pressed={simple}
                >
                  {en.simpleCounts}
                </button>
              </div>
            </div>

            {/* Secondary: Type an update trigger (collapsed by default) */}
            <div className="mb-6">
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-semibold text-[var(--text)] shadow-clinical transition-colors hover:bg-[var(--surface-2)]"
              >
                <PenLine className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
                <span>{en.typeAnUpdate}</span>
              </button>
            </div>

            {/* 2. Structured Bed Cards */}
            <section className="flex flex-col gap-3" aria-label="Free beds by type">
              {beds.map((row) => {
                const Icon = bedIcons[row.bedType];
                const isHighlight = recentlyUpdatedBed === row.bedType;
                const statusType = row.free === 0 ? "none" : row.free <= 2 ? "low" : "available";

                return (
                  <article
                    key={row.bedType}
                    className={`flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-clinical transition-all ${
                      isHighlight ? "live-highlight" : ""
                    }`}
                  >
                    {/* Left: Acuity Icon + Label + Badges */}
                    <div className="flex flex-col gap-2 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Icon
                          className="h-5 w-5 shrink-0 text-[var(--accent)]"
                          aria-hidden="true"
                          strokeWidth={2}
                        />
                        <h2 className="text-lg font-bold text-[var(--text)] truncate">
                          {bedNames[row.bedType]}
                        </h2>
                        {row.source === "sim_feed" && <SimulatedBadge />}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <FreshnessBadge updatedAtText={row.updatedAt} />
                        <StatusBadge status={statusType} />
                      </div>
                    </div>

                    {/* Center: Count at 48px bold */}
                    <div className="flex flex-col items-center justify-center px-2">
                      <span className="text-5xl font-bold tracking-tight text-[var(--text)] tabular-nums bed-count">
                        {row.free}
                      </span>
                      <span className="text-xs font-semibold text-[var(--text-2)] uppercase">
                        {en.free}
                      </span>
                    </div>

                    {/* Right: Stepper Controls (64px minus and plus) */}
                    {simple ? (
                      <div
                        className="flex items-center gap-2"
                        aria-label={`${bedNames[row.bedType]} quick count`}
                      >
                        {[0, 1, 3].map((val) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => updateBed(row.bedType, val)}
                            className={`inline-flex min-h-[48px] min-w-[48px] items-center justify-center rounded-lg border text-base font-bold transition-all ${
                              row.free === val || (val === 3 && row.free >= 3)
                                ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-text-on)]"
                                : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-2)]"
                            }`}
                          >
                            {val === 3 ? "3+" : val === 1 ? "1–2" : "0"}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateBed(row.bedType, row.free - 1)}
                          disabled={row.free === 0}
                          aria-label={en.decrease.replace("{bed}", bedNames[row.bedType])}
                          className="inline-flex min-h-[64px] min-w-[64px] items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-xs transition-colors hover:bg-[var(--surface-2)] active:scale-95 disabled:opacity-40"
                        >
                          <Minus className="h-6 w-6" aria-hidden="true" strokeWidth={2.5} />
                        </button>
                        <button
                          type="button"
                          onClick={() => updateBed(row.bedType, row.free + 1)}
                          aria-label={en.increase.replace("{bed}", bedNames[row.bedType])}
                          className="inline-flex min-h-[64px] min-w-[64px] items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-xs transition-colors hover:bg-[var(--surface-2)] active:scale-95"
                        >
                          <Plus className="h-6 w-6" aria-hidden="true" strokeWidth={2.5} />
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </section>

            {/* 3. Secondary: Update History Link (never above bed cards) */}
            <div className="mt-8 border-t border-[var(--border)] pt-4 text-center">
              <button
                type="button"
                onClick={() => setShowHistory((h) => !h)}
                className="inline-flex min-h-[48px] items-center gap-2 text-sm font-semibold text-[var(--accent)] hover:underline"
              >
                <History className="h-4 w-4" aria-hidden="true" />
                <span>{en.historyTitle}</span>
              </button>
            </div>

            {/* Vertical History Timeline (Collapsible) */}
            {showHistory && (
              <section
                className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-clinical"
                aria-labelledby="history-title"
              >
                <h2 id="history-title" className="text-base font-bold text-[var(--text)]">
                  {en.historyTitle}
                </h2>
                <p className="mt-0.5 text-xs text-[var(--text-2)]">{en.historyHint}</p>

                {/* Filter controls */}
                {history.length > 0 && (
                  <div className="mt-4 grid grid-cols-2 gap-2 border-b border-[var(--border)] pb-4">
                    <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--text-2)]">
                      <span>{en.historyFilterNurse}</span>
                      <select
                        value={historyNurseFilter}
                        onChange={(e) => setHistoryNurseFilter(e.target.value)}
                        className="min-h-[48px] rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--text)]"
                      >
                        <option value="all">{en.historyAllNurses}</option>
                        {nurseFilterOptions.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--text-2)]">
                      <span>{en.historyFilterSource}</span>
                      <select
                        value={historySourceFilter}
                        onChange={(e) => setHistorySourceFilter(e.target.value)}
                        className="min-h-[48px] rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--text)]"
                      >
                        <option value="all">{en.historyAllSources}</option>
                        <option value="ai">{en.historySourceAi}</option>
                        <option value="manual">{en.historySourceManual}</option>
                        <option value="restore">{en.historySourceRestore}</option>
                      </select>
                    </label>
                  </div>
                )}

                {/* Timeline list */}
                {isHistoryLoading ? (
                  <p className="py-6 text-center text-sm text-[var(--text-2)]">
                    {en.historyLoading}
                  </p>
                ) : history.length === 0 ? (
                  <p className="py-6 text-center text-sm text-[var(--text-2)]">
                    {en.historyEmpty}
                  </p>
                ) : filteredHistory.length === 0 ? (
                  <p className="py-6 text-center text-sm text-[var(--text-2)]">
                    {en.historyNoResults}
                  </p>
                ) : (
                  <ol className="mt-4 flex flex-col gap-3">
                    {filteredHistory.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-start justify-between gap-4 border-b border-[var(--border)] pb-3 last:border-0"
                      >
                        <div className="flex flex-col gap-1">
                          <span className="text-sm font-bold text-[var(--text)]">
                            {item.eventType === "ai_proposed"
                              ? en.historyAiProposed
                              : item.eventType === "restored"
                                ? en.historyRestored
                                : en.historyNurseApplied}
                          </span>
                          <span className="text-xs text-[var(--text-2)] tabular-nums">
                            {new Intl.DateTimeFormat(undefined, {
                              hour: "numeric",
                              minute: "2-digit",
                              day: "numeric",
                              month: "short",
                            }).format(new Date(item.createdAt))}{" "}
                            · {item.nurseName || en.defaultNurseName}
                          </span>
                          <p className="text-xs text-[var(--text-2)] font-medium tabular-nums">
                            {item.changes
                              .map((c) => `${bedNames[c.bedType]} ${c.previousFree} → ${c.nextFree}`)
                              .join(" · ")}
                          </p>
                        </div>

                        {item.eventType !== "ai_proposed" && (
                          <button
                            type="button"
                            onClick={() => restoreHistoryEvent(item)}
                            disabled={inventoryMutation.isPending}
                            className="inline-flex min-h-[48px] items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 text-xs font-semibold text-[var(--text)] hover:bg-[var(--border)] active:scale-95"
                          >
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>{en.historyRestore}</span>
                          </button>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            )}
          </main>

          {/* 4. Type an Update Sheet / Modal */}
          {sheetOpen && (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="sheet-title"
              className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs p-0 sm:p-4"
            >
              <div className="w-full max-w-lg rounded-t-2xl sm:rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
                <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
                  <h2 id="sheet-title" className="text-lg font-bold text-[var(--text)]">
                    {en.aiUpdateTitle}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setSheetOpen(false)}
                    className="inline-flex min-h-[48px] min-w-[48px] items-center justify-center rounded-lg text-[var(--text-2)] hover:text-[var(--text)]"
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>

                <p className="mt-2 text-sm text-[var(--text-2)]">{en.aiUpdateHint}</p>

                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={en.aiUpdateExample}
                  rows={3}
                  className="mt-3 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm text-[var(--text)] placeholder:text-[var(--text-2)] focus:outline-none"
                />

                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setSheetOpen(false)}
                    className="inline-flex min-h-[48px] items-center rounded-lg border border-[var(--border)] px-4 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-2)]"
                  >
                    {en.aiCancel}
                  </button>
                  <button
                    type="button"
                    onClick={reviewNote}
                    disabled={!note.trim() || isReviewing}
                    className="inline-flex min-h-[48px] items-center rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-text-on)] transition-opacity disabled:opacity-50"
                  >
                    {isReviewing ? en.aiReviewing : en.aiReview}
                  </button>
                </div>

                {reviewError && (
                  <p className="mt-3 text-sm font-medium text-[var(--danger-text)]" role="alert">
                    {reviewError}
                  </p>
                )}

                {/* Suggested updates review preview */}
                {suggestedUpdates.length > 0 && (
                  <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                    <h3 className="text-sm font-bold text-[var(--text)]">{en.aiReviewReady}</h3>
                    <ul className="mt-2 flex flex-col gap-2">
                      {suggestedUpdates.map((update) => (
                        <li
                          key={update.bedType}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="font-semibold text-[var(--text)]">
                            {bedNames[update.bedType]}
                          </span>
                          <span className="tabular-nums text-[var(--text-2)]">
                            {update.free} {en.free} ·{" "}
                            {update.availability === "available"
                              ? en.aiAvailable
                              : en.aiUnavailable}
                          </span>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-4 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setSuggestedUpdates([])}
                        className="inline-flex min-h-[48px] items-center rounded-lg border border-[var(--border)] px-3 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface)]"
                      >
                        {en.aiCancel}
                      </button>
                      <button
                        type="button"
                        onClick={applySuggestedUpdates}
                        className="inline-flex min-h-[48px] items-center rounded-lg bg-[var(--ok-text)] px-4 text-sm font-semibold text-white shadow-xs"
                      >
                        {en.aiApply}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 5. Sticky Primary Bottom Action: "Everything is correct" (64px height) */}
          <BottomActionBar>
            <button
              type="button"
              onClick={confirmEverythingCorrect}
              disabled={inventoryMutation.isPending}
              className="inline-flex min-h-[64px] w-full max-w-md items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-6 text-base font-bold text-[var(--accent-text-on)] shadow-clinical transition-transform active:scale-[0.99] disabled:opacity-50"
            >
              <Check className="h-6 w-6" aria-hidden="true" strokeWidth={2.5} />
              <span>{inventoryMutation.isPending ? en.savingInventory : en.correct}</span>
            </button>
          </BottomActionBar>

          {/* Toast with Undo */}
          {toast && (
            <ClinicalToast
              message={toast}
              onUndo={previousBedState ? handleUndo : undefined}
              onClose={() => setToast(null)}
            />
          )}
        </>
      )}
    </div>
  );
}
