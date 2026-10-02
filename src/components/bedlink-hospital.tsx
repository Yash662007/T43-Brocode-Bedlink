import { useState } from "react";
import { Activity, BedDouble, Check, Clock3, HeartPulse, Languages, Moon, Sun, Wind, Wifi, X } from "lucide-react";
import { nurseBeds, type BedType } from "@/lib/bedlink-fixtures";

type Theme = "light" | "dark";
type OfferState = "idle" | "incoming" | "held" | "superseded" | "expired";

const icons: Record<BedType, typeof BedDouble> = { icu: Activity, ventilator: Wind, oxygen: Activity, cardiac: HeartPulse, burns: Activity };
const names: Record<BedType, string> = { icu: "ICU", ventilator: "Ventilator", oxygen: "Oxygen", cardiac: "Cardiac", burns: "Burns" };

export function HospitalScreen() {
  const [theme, setTheme] = useState<Theme>("light");
  const [state, setState] = useState<OfferState>("incoming");
  const [reasonOpen, setReasonOpen] = useState(false);
  const [releaseConfirm, setReleaseConfirm] = useState(false);

  if (state === "incoming") {
    return <main className={`hospital-page offer-page${theme === "dark" ? " dark" : ""}`}>
      <HospitalBar theme={theme} onTheme={() => setTheme((v) => v === "light" ? "dark" : "light")} />
      <section className="offer-takeover" role="alert" aria-labelledby="offer-title">
        <p className="offer-kicker">INCOMING REQUEST</p>
        <h1 id="offer-title">Chest pain</h1>
        <p className="offer-detail"><BedDouble aria-hidden="true" />ICU bed required</p>
        <p className="offer-eta">Arriving in about <strong>8 min</strong></p>
        <div className="countdown-wrap"><div className="countdown-ring" aria-label="1 minute 24 seconds remaining"><span>01:24</span><small>to respond</small></div></div>
        <div className="offer-actions">
          <button type="button" className="accept-button" onClick={() => setState("held")}><Check aria-hidden="true" />Accept and hold bed</button>
          <button type="button" className="reject-button" onClick={() => setReasonOpen((value) => !value)}><X aria-hidden="true" />Reject</button>
          {reasonOpen && <div className="reason-row" aria-label="Optional rejection reason"><button type="button" onClick={() => setState("idle")}>No bed</button><button type="button" onClick={() => setState("idle")}>No specialist</button><button type="button" onClick={() => setState("idle")}>Overloaded</button><button type="button" className="skip-reason" onClick={() => setState("idle")}>Skip</button></div>}
        </div>
      </section>
    </main>;
  }

  return <main className={`hospital-page${theme === "dark" ? " dark" : ""}`}>
    <HospitalBar theme={theme} onTheme={() => setTheme((v) => v === "light" ? "dark" : "light")} />
    {state === "held" ? <section className="hospital-state held-state"><div className="state-icon"><Check aria-hidden="true" /></div><p className="offer-kicker">CONFIRMED</p><h1>Bed held for ambulance.</h1><p>ETA 8 min</p>{releaseConfirm ? <div className="release-confirm"><p>Release this bed?</p><button type="button" className="reject-button" onClick={() => setState("idle")}>Release bed</button><button type="button" className="text-button" onClick={() => setReleaseConfirm(false)}>Keep bed</button></div> : <button type="button" className="secondary-action" onClick={() => setReleaseConfirm(true)}>Release bed</button>}</section> : state === "superseded" ? <section className="hospital-state"><Clock3 aria-hidden="true" /><h1>Taken by another hospital.</h1><p>No action needed.</p><button type="button" className="secondary-action" onClick={() => setState("idle")}>Return to beds</button></section> : state === "expired" ? <section className="hospital-state"><Clock3 aria-hidden="true" /><h1>This request expired.</h1><button type="button" className="secondary-action" onClick={() => setState("idle")}>Return to beds</button></section> : <IdleContent onOffer={() => setState("incoming")} onSuperseded={() => setState("superseded")} onExpired={() => setState("expired")} />}
  </main>;
}

function HospitalBar({ theme, onTheme }: { theme: Theme; onTheme: () => void }) {
  return <header className="app-bar"><div className="app-id"><BedDouble aria-hidden="true" /><span>BedLink</span></div><div className="app-tools"><span className="connection-status"><Wifi aria-hidden="true" />Live</span><button type="button" className="tool-button" aria-label="Language"><Languages aria-hidden="true" /></button><button type="button" className="tool-button" aria-label="Theme" onClick={onTheme}>{theme === "light" ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}</button></div></header>;
}

function IdleContent({ onOffer, onSuperseded, onExpired }: { onOffer: () => void; onSuperseded: () => void; onExpired: () => void }) {
  return <section className="hospital-idle"><p className="eyebrow">City General Hospital</p><h1>Current beds</h1><div className="hospital-bed-list">{nurseBeds.slice(0, 4).map((bed) => { const Icon = icons[bed.bedType]; return <div className="hospital-bed" key={bed.bedType}><span><Icon aria-hidden="true" />{names[bed.bedType]}</span><strong>{bed.free}</strong><small>Updated {bed.updatedAt}</small></div>; })}</div><div className="waiting-state"><Wifi aria-hidden="true" /><p>Waiting for requests</p><span>Connection is live</span></div><div className="demo-controls"><button type="button" onClick={onOffer}>Preview incoming request</button><button type="button" onClick={onSuperseded}>Superseded state</button><button type="button" onClick={onExpired}>Expired state</button></div></section>;
}
