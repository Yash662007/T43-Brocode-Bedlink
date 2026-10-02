import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  BedDouble,
  Check,
  CircleAlert,
  Droplets,
  HeartPulse,
  Languages,
  Minus,
  Moon,
  Plus,
  History,
  RotateCcw,
  RefreshCw,
  Sun,
  Wind,
  Wifi,
  WifiOff,
  Sparkles,
} from "lucide-react";
import { nurseBeds, type BedRow, type BedType } from "@/lib/bedlink-fixtures";
import { reviewBedAvailabilityNote } from "@/lib/bed-update-extraction.functions";
import { getCityGeneralInventoryHistory, recordAiProposedInventoryUpdate, saveCityGeneralInventory } from "@/lib/hospital-inventory.functions";
import type { InventoryAuditEvent } from "@/lib/hospital-inventory";
import en from "@/locales/en.json";

type Theme = "light" | "dark";

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

function FreshnessBadge({ row }: { row: BedRow }) {
  const noData = row.updatedAt === "No data";
  const age = Number.parseInt(row.updatedAt, 10);
  const tone = noData ? "unknown" : age < 15 ? "ok" : age <= 45 ? "warn" : "danger";
  const label = noData ? en.noData : age > 45 ? `${en.stale}, ${row.updatedAt}` : `${en.updated} ${row.updatedAt}`;
  return <span className={`freshness freshness-${tone}`}><span aria-hidden="true">{tone === "ok" ? "●" : tone === "warn" ? "▲" : "!"}</span>{label}</span>;
}

function StatusButton({ label, children, onClick, active }: { label: string; children: React.ReactNode; onClick: () => void; active?: boolean }) {
  return <button type="button" aria-label={label} onClick={onClick} className={`tool-button${active ? " tool-button-active" : ""}`}>{children}</button>;
}

export function NurseScreen() {
  const [beds, setBeds] = useState(nurseBeds);
  const [simple, setSimple] = useState(false);
  const [offline, setOffline] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");
  const [nurseName, setNurseName] = useState("Nurse Patel");
  const [toast, setToast] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [suggestedUpdates, setSuggestedUpdates] = useState<Array<{ bedType: BedType; free: number; availability: "available" | "unavailable" }>>([]);
  const [historyNurseFilter, setHistoryNurseFilter] = useState("all");
  const [historySourceFilter, setHistorySourceFilter] = useState("all");
  const [historyFromDate, setHistoryFromDate] = useState("");
  const [historyToDate, setHistoryToDate] = useState("");
  const queryClient = useQueryClient();
  const saveInventory = useServerFn(saveCityGeneralInventory);
  const recordProposal = useServerFn(recordAiProposedInventoryUpdate);
  const loadHistory = useServerFn(getCityGeneralInventoryHistory);
  const { data: history = [], isLoading: isHistoryLoading } = useQuery({
    queryKey: ["inventory-history", "city-general"],
    queryFn: () => loadHistory(),
  });
  const inventoryMutation = useMutation({
    mutationFn: ({ nextBeds, eventType }: { nextBeds: BedRow[]; eventType: "nurse_applied" | "restored" }) => saveInventory({ data: { beds: nextBeds.map((row) => ({ bedType: row.bedType, free: row.free })), eventType, nurseName: nurseName.trim() || en.defaultNurseName } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hospital-inventory", "city-general"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-history", "city-general"] });
      setLastUpdate(en.inventoryShared);
      window.setTimeout(() => setLastUpdate(null), 4000);
    },
    onError: () => setToast(en.inventoryError),
  });

  const updateBed = (bedType: BedType, nextValue: number) => {
    setBeds((current) => current.map((row) => row.bedType === bedType ? { ...row, free: Math.max(0, nextValue), updatedAt: "Just now" } : row));
    const text = `${bedNames[bedType]}: ${Math.max(0, nextValue)} ${en.free}.`;
    setToast(text);
    window.setTimeout(() => setToast(null), 5000);
    navigator.vibrate?.(10);
  };

  const confirm = () => {
    inventoryMutation.mutate({ nextBeds: beds, eventType: "nurse_applied" });
  };

  const reviewNote = async () => {
    if (!note.trim() || isReviewing) return;
    setIsReviewing(true);
    setReviewError(null);
    try {
      const result = await reviewBedAvailabilityNote({ data: { note } });
      setSuggestedUpdates(result);
      const changes = result.map((update) => ({
        bedType: update.bedType,
        previousFree: beds.find((row) => row.bedType === update.bedType)?.free ?? 0,
        nextFree: update.free,
      })).filter((change) => change.previousFree !== change.nextFree);
      if (changes.length > 0) {
        await recordProposal({ data: { changes } });
        queryClient.invalidateQueries({ queryKey: ["inventory-history", "city-general"] });
      }
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : en.aiReviewError);
    } finally {
      setIsReviewing(false);
    }
  };

  const applySuggestedUpdates = () => {
    const nextBeds = beds.map((row) => {
      const update = suggestedUpdates.find((suggestion) => suggestion.bedType === row.bedType);
      return update ? { ...row, free: update.free, updatedAt: "Just now" } : row;
    });
    setBeds(nextBeds);
    inventoryMutation.mutate({ nextBeds, eventType: "nurse_applied" });
    setToast(en.aiApplied);
    setSuggestedUpdates([]);
    setNote("");
  };

  const restoreHistoryEvent = (event: InventoryAuditEvent) => {
    const nextBeds = beds.map((row) => {
      const change = event.changes.find((entry) => entry.bedType === row.bedType);
      return change ? { ...row, free: change.previousFree, updatedAt: "Just now" } : row;
    });
    setBeds(nextBeds);
    inventoryMutation.mutate({ nextBeds, eventType: "restored" });
  };

  const nurseFilterOptions = Array.from(new Set(history.map((event) => event.nurseName).filter((name): name is string => Boolean(name))));
  const filteredHistory = history.filter((event) => {
    const eventDate = event.createdAt.slice(0, 10);
    const matchesNurse = historyNurseFilter === "all" || event.nurseName === historyNurseFilter;
    const matchesSource = historySourceFilter === "all" || event.source === historySourceFilter;
    const isAfterStart = !historyFromDate || eventDate >= historyFromDate;
    const isBeforeEnd = !historyToDate || eventDate <= historyToDate;
    return matchesNurse && matchesSource && isAfterStart && isBeforeEnd;
  });
  const clearHistoryFilters = () => {
    setHistoryNurseFilter("all");
    setHistorySourceFilter("all");
    setHistoryFromDate("");
    setHistoryToDate("");
  };

  return (
    <main className={`nurse-page${theme === "dark" ? " dark" : ""}`}>
      <header className="app-bar">
        <div className="app-id"><BedDouble aria-hidden="true" /><span>{en.appName}</span></div>
        <div className="app-tools">
          <StatusButton label="Toggle connection status" onClick={() => setOffline((value) => !value)} active={offline}>
            {offline ? <WifiOff aria-hidden="true" /> : <Wifi aria-hidden="true" />}<span className="connection-label">{offline ? en.offline : en.live}</span>
          </StatusButton>
          <StatusButton label={en.language} onClick={() => undefined}><Languages aria-hidden="true" /></StatusButton>
          <StatusButton label={en.theme} onClick={() => setTheme((current) => current === "light" ? "dark" : "light")}>{theme === "light" ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}</StatusButton>
        </div>
      </header>

      {offline && <div className="offline-banner" role="status"><WifiOff aria-hidden="true" />{en.offlineMessage}<span>{en.waiting}: 2</span></div>}

      <section className="nurse-heading" aria-labelledby="screen-title">
        <p className="eyebrow">{en.hospital}</p>
        <div className="heading-line"><h1 id="screen-title">{en.nurseTitle}</h1><button type="button" className={`mode-switch${simple ? " mode-switch-on" : ""}`} onClick={() => setSimple((value) => !value)} aria-pressed={simple}><span aria-hidden="true" />{en.simpleCounts}</button></div>
        <p className="hint-text">{en.hint} {en.hintConfirm}</p>
        <label className="nurse-name-field"><span>{en.nurseNameLabel}</span><input value={nurseName} onChange={(event) => setNurseName(event.target.value)} maxLength={80} /></label>
      </section>

      <section className="ai-update" aria-labelledby="ai-update-title">
        <div className="ai-update-heading"><Sparkles aria-hidden="true" /><div><h2 id="ai-update-title">{en.aiUpdateTitle}</h2><p>{en.aiUpdateHint}</p></div></div>
        <label className="sr-only" htmlFor="bed-update-note">{en.aiUpdateTitle}</label>
        <textarea id="bed-update-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder={en.aiUpdateExample} rows={3} />
        <button type="button" className="ai-review-button" onClick={reviewNote} disabled={!note.trim() || isReviewing}>{isReviewing ? en.aiReviewing : en.aiReview}</button>
        {reviewError && <p className="ai-review-error" role="alert">{reviewError}</p>}
        {suggestedUpdates.length > 0 && <div className="ai-review-result" aria-live="polite"><p>{en.aiReviewReady}</p><ul>{suggestedUpdates.map((update) => <li key={update.bedType}><strong>{bedNames[update.bedType]}</strong><span>{update.free} {en.free} · {update.availability === "available" ? en.aiAvailable : en.aiUnavailable}</span></li>)}</ul><div><button type="button" className="ai-cancel-button" onClick={() => setSuggestedUpdates([])}>{en.aiCancel}</button><button type="button" className="ai-apply-button" onClick={applySuggestedUpdates}>{en.aiApply}</button></div></div>}
      </section>

      <section className="bed-list" aria-label="Free beds by type">
        {beds.map((row) => {
          const Icon = bedIcons[row.bedType];
          return <article className="bed-row" key={row.bedType}>
            <div className="bed-label"><Icon aria-hidden="true" /><div><h2>{bedNames[row.bedType]}</h2><FreshnessBadge row={row} />{row.source === "sim_feed" && <span className="simulated">{en.simulated}</span>}</div></div>
            {simple ? <div className="simple-controls" aria-label={`${bedNames[row.bedType]} quick count`}>
              {[0, 1, 3].map((value) => <button type="button" key={value} onClick={() => updateBed(row.bedType, value)} className={row.free === value || (value === 3 && row.free >= 3) ? "simple-selected" : ""}>{value === 3 ? "3+" : value === 1 ? "1–2" : "0"}</button>)}
            </div> : <div className="stepper"><StatusButton label={en.decrease.replace("{bed}", bedNames[row.bedType])} onClick={() => updateBed(row.bedType, row.free - 1)}><Minus aria-hidden="true" /></StatusButton><p className="bed-count" aria-label={`${row.free} ${en.free}`}>{row.free}<span>{en.free}</span></p><StatusButton label={en.increase.replace("{bed}", bedNames[row.bedType])} onClick={() => updateBed(row.bedType, row.free + 1)}><Plus aria-hidden="true" /></StatusButton></div>}
          </article>;
        })}
      </section>

      <section className="inventory-history" aria-labelledby="inventory-history-title">
        <div className="inventory-history-heading"><History aria-hidden="true" /><div><h2 id="inventory-history-title">{en.historyTitle}</h2><p>{en.historyHint}</p></div></div>
        {history.length > 0 && <div className="history-filters" aria-label={en.historyFiltersLabel}>
          <div className="history-filter-fields">
            <label><span>{en.historyFilterNurse}</span><select value={historyNurseFilter} onChange={(event) => setHistoryNurseFilter(event.target.value)}><option value="all">{en.historyAllNurses}</option>{nurseFilterOptions.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
            <label><span>{en.historyFilterSource}</span><select value={historySourceFilter} onChange={(event) => setHistorySourceFilter(event.target.value)}><option value="all">{en.historyAllSources}</option><option value="ai">{en.historySourceAi}</option><option value="manual">{en.historySourceManual}</option><option value="restore">{en.historySourceRestore}</option></select></label>
            <label><span>{en.historyFilterFrom}</span><input type="date" value={historyFromDate} onChange={(event) => setHistoryFromDate(event.target.value)} max={historyToDate || undefined} /></label>
            <label><span>{en.historyFilterTo}</span><input type="date" value={historyToDate} onChange={(event) => setHistoryToDate(event.target.value)} min={historyFromDate || undefined} /></label>
          </div>
          {(historyNurseFilter !== "all" || historySourceFilter !== "all" || historyFromDate || historyToDate) && <button type="button" className="history-clear-filters" onClick={clearHistoryFilters}>{en.historyClearFilters}</button>}
        </div>}
        {isHistoryLoading ? <p className="history-empty">{en.historyLoading}</p> : history.length === 0 ? <p className="history-empty">{en.historyEmpty}</p> : filteredHistory.length === 0 ? <p className="history-empty">{en.historyNoResults}</p> : <ol className="history-list">{filteredHistory.map((event) => <li key={event.id}><div><strong>{event.eventType === "ai_proposed" ? en.historyAiProposed : event.eventType === "restored" ? en.historyRestored : en.historyNurseApplied}</strong><span>{new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", day: "numeric", month: "short" }).format(new Date(event.createdAt))} · {event.source === "ai" ? en.historySourceAi : event.source === "restore" ? en.historySourceRestore : en.historySourceManual}</span><p>{event.source === "ai" ? en.historyActorAi : `${en.historyChangedBy} ${event.nurseName ?? en.defaultNurseName}`}</p><p>{event.changes.map((change) => `${bedNames[change.bedType]} ${change.previousFree} → ${change.nextFree}`).join(" · ")}</p></div>{event.eventType !== "ai_proposed" && <button type="button" className="history-restore" disabled={inventoryMutation.isPending} onClick={() => restoreHistoryEvent(event)}><RotateCcw aria-hidden="true" />{en.historyRestore}</button>}</li>)}</ol>}
      </section>

      <div className="bottom-action"><button type="button" onClick={confirm} className="confirm-button" disabled={inventoryMutation.isPending}><Check aria-hidden="true" />{inventoryMutation.isPending ? en.savingInventory : en.correct}</button></div>
      {toast && <div className="toast" role="status"><span>{toast}</span><button type="button" onClick={() => setToast(null)}>{en.undo}</button></div>}
      {lastUpdate && <div className="toast" role="status"><RefreshCw aria-hidden="true" /><span>{lastUpdate}</span></div>}
    </main>
  );
}
