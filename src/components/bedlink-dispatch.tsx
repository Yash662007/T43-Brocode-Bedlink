import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Ambulance, BedDouble, Check, ChevronLeft, ChevronRight, Clock3, Hospital, Languages, MapPin, Moon, Route as RouteIcon, Sun, Wifi } from "lucide-react";
import { getCityGeneralInventory } from "@/lib/hospital-inventory.functions";
import type { BedType } from "@/lib/bedlink-fixtures";

type Theme = "light" | "dark";
type DispatchState = "matching" | "options" | "sent" | "no-match";

const baseCandidates = [
  { name: "City General Hospital", bed: "ICU", bedType: "icu" as BedType, availability: "3 beds free", time: "8 min", distance: "2.4 km", status: "Best match" },
  { name: "Riverside Medical Centre", bed: "ICU", bedType: "icu" as BedType, availability: "1 bed free", time: "11 min", distance: "4.1 km", status: "Available" },
  { name: "Northside Trauma Hospital", bed: "ICU", bedType: "icu" as BedType, availability: "2 beds free", time: "14 min", distance: "5.8 km", status: "Available" },
];

export function DispatchScreen() {
  const [theme, setTheme] = useState<Theme>("light");
  const [state, setState] = useState<DispatchState>("matching");
  const [activeIndex, setActiveIndex] = useState(0);
  const fetchInventory = useServerFn(getCityGeneralInventory);
  const { data: sharedInventory = [] } = useQuery({
    queryKey: ["hospital-inventory", "city-general"],
    queryFn: () => fetchInventory(),
    refetchInterval: 15000,
  });
  const cityGeneralIcu = sharedInventory.find((row) => row.bedType === "icu");
  const candidates = baseCandidates.map((candidate) => candidate.name === "City General Hospital" && cityGeneralIcu
    ? { ...candidate, availability: `${cityGeneralIcu.free} ${cityGeneralIcu.free === 1 ? "bed" : "beds"} free` }
    : candidate);
  const activeCandidate = candidates[activeIndex] ?? candidates[0];

  if (!activeCandidate) {
    return null;
  }

  return (
    <main className={`dispatch-page${theme === "dark" ? " dark" : ""}`}>
      <DispatchBar theme={theme} onTheme={() => setTheme((current) => current === "light" ? "dark" : "light")} />
      {state === "matching" && <MatchingView onReview={() => setState("options")} onNoMatch={() => setState("no-match")} />}
      {state === "options" && <OptionsView candidate={activeCandidate} activeIndex={activeIndex} candidateCount={candidates.length} onPrevious={() => setActiveIndex((index) => Math.max(0, index - 1))} onNext={() => setActiveIndex((index) => Math.min(candidates.length - 1, index + 1))} onSend={() => setState("sent")} onBack={() => setState("matching")} />}
      {state === "sent" && <SentView candidate={activeCandidate} onNewRequest={() => { setActiveIndex(0); setState("matching"); }} />}
      {state === "no-match" && <NoMatchView onReturn={() => setState("matching")} />}
    </main>
  );
}

function DispatchBar({ theme, onTheme }: { theme: Theme; onTheme: () => void }) {
  return <header className="app-bar"><div className="app-id"><BedDouble aria-hidden="true" /><span>BedLink</span></div><div className="app-tools"><span className="connection-status"><Wifi aria-hidden="true" />Live</span><button type="button" className="tool-button" aria-label="Language"><Languages aria-hidden="true" /></button><button type="button" className="tool-button" aria-label="Switch theme" onClick={onTheme}>{theme === "light" ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}</button></div></header>;
}

function MatchingView({ onReview, onNoMatch }: { onReview: () => void; onNoMatch: () => void }) {
  return <section className="dispatch-workspace" aria-labelledby="dispatch-title">
    <div className="dispatch-heading"><p className="eyebrow">AMBULANCE 24</p><h1 id="dispatch-title">Find an ICU bed</h1><p>Chest pain · ICU required</p></div>
    <div className="dispatch-summary" aria-label="Ambulance details"><span><Ambulance aria-hidden="true" />Ambulance 24</span><span><RouteIcon aria-hidden="true" />ETA 8 min</span></div>
    <div className="match-status"><div className="match-symbol"><Hospital aria-hidden="true" /></div><p>3 suitable hospitals found</p><span>Availability checked just now</span></div>
    <div className="dispatch-actions"><button type="button" className="dispatch-primary" onClick={onReview}>Review hospitals</button><button type="button" className="dispatch-secondary" onClick={onNoMatch}>No suitable bed</button></div>
  </section>;
}

function OptionsView({ candidate, activeIndex, candidateCount, onPrevious, onNext, onSend, onBack }: { candidate: typeof baseCandidates[number]; activeIndex: number; candidateCount: number; onPrevious: () => void; onNext: () => void; onSend: () => void; onBack: () => void }) {
  return <section className="dispatch-workspace dispatch-options" aria-labelledby="candidate-title">
    <button type="button" className="back-button" onClick={onBack}><ChevronLeft aria-hidden="true" />Back to request</button>
    <div className="dispatch-heading"><p className="eyebrow">SELECT A HOSPITAL</p><h1 id="candidate-title">{candidate.name}</h1></div>
    <div className="candidate-status"><Check aria-hidden="true" />{candidate.status}</div>
    <dl className="candidate-details"><div><dt><BedDouble aria-hidden="true" />Bed</dt><dd>{candidate.bed} · {candidate.availability}</dd></div><div><dt><Clock3 aria-hidden="true" />Arrival</dt><dd>About {candidate.time}</dd></div><div><dt><MapPin aria-hidden="true" />Distance</dt><dd>{candidate.distance}</dd></div></dl>
    <div className="option-pager" aria-label={`Hospital ${activeIndex + 1} of ${candidateCount}`}><button type="button" className="pager-button" aria-label="Previous hospital" onClick={onPrevious} disabled={activeIndex === 0}><ChevronLeft aria-hidden="true" /></button><span>{activeIndex + 1} of {candidateCount}</span><button type="button" className="pager-button" aria-label="Next hospital" onClick={onNext} disabled={activeIndex === candidateCount - 1}><ChevronRight aria-hidden="true" /></button></div>
    <div className="dispatch-actions"><button type="button" className="dispatch-primary" onClick={onSend}>Send bed request</button><p className="dispatch-note">This asks the hospital to hold a bed. It is not a guarantee.</p></div>
  </section>;
}

function SentView({ candidate, onNewRequest }: { candidate: typeof baseCandidates[number]; onNewRequest: () => void }) {
  return <section className="dispatch-state" aria-labelledby="sent-title"><div className="dispatch-state-icon"><Check aria-hidden="true" /></div><p className="eyebrow">REQUEST SENT</p><h1 id="sent-title">Waiting for {candidate.name}</h1><p>They have 1 min 24 sec to respond.</p><div className="dispatch-state-detail"><Ambulance aria-hidden="true" /><span>Ambulance 24 · ETA {candidate.time}</span></div><button type="button" className="dispatch-secondary" onClick={onNewRequest}>Start new request</button></section>;
}

function NoMatchView({ onReturn }: { onReturn: () => void }) {
  return <section className="dispatch-state" aria-labelledby="no-match-title"><div className="dispatch-neutral-icon"><Hospital aria-hidden="true" /></div><p className="eyebrow">NO MATCH FOUND</p><h1 id="no-match-title">No ICU bed is suitable right now.</h1><p>Keep monitoring availability or contact hospitals directly.</p><button type="button" className="dispatch-secondary" onClick={onReturn}>Return to request</button></section>;
}