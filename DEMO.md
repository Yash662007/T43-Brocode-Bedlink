# BedLink — 3-minute demo script

Setup once: follow README.md's 5-command setup, then `npm run demo`. Open three browser
windows side by side at `http://localhost:8080`:

- Window A: `?screen=nurse` — **City General, nurse**
- Window B: `?screen=hospital` — **City General, hospital desk**
- Window C: `?screen=ambulance` — **Ambulance crew**

## 0:00 — Nurse screen: the ground truth

In window A, point out the bed cards (ICU, Ventilator, Oxygen, Cardiac, Burns): the count,
the freshness badge, and the status (Available / Low / None). Tap **+** on Cardiac, then
**Everything is correct**. Open **Update history** — the change is logged with your name,
timestamp, and the exact before → after count. This is the only place raw counts change.

## 0:45 — Ambulance screen: find a bed

Switch to window C. Pick a condition chip (**Chest Pain** is selected by default, which
needs a cardiac bed) and leave mode on **Ask one by one**. Tap **Review hospitals** — the
map and card show City General ranked #1 with a **Likely free** confidence tag, the
plain-language reason ("2 cardiac beds free, confirmed just now, about 2 min away"), and
the Govt/Private + scheme line. Tap **Send bed request**.

## 1:15 — Hospital screen: the pre-arrival alert

Switch to window B — within a second, the incoming-offer alert fires with the real
condition, bed type, ETA, and a server-driven countdown. Tap **Accept and hold bed**.

## 1:40 — Confirmation flows both ways

Window C flips to **Confirmed** with the hospital name, live via SSE — no polling. Window A
(nurse) shows the cardiac count already down by one effective bed, before the nurse taps
anything: that's the hold, not a mock number.

## 2:00 — Arrival and the feedback loop

In window C, tap **Arrived at Hospital**, then answer **Was a bed available?** → **Yes**.
Back in window A's history, a `crew_feedback`-sourced event lands — this is also what
reconciles the count if the answer is **No**.

## 2:25 — What makes it safe, not just fast

- Pull up two terminals and `curl -X POST http://localhost:4000/api/offers/<id>/accept`
  twice for the same last bed — exactly one succeeds, proven by `npm run server:test`
  (`last-bed-hold.test.ts`).
- In window A, tap a bed's stepper and wait: past the expiry window the freshness badge
  goes stale and the dispatch ranking marks that hospital **Unknown** confidence instead of
  pretending the old count is still true.
- Run `npm run simulate` in a terminal — a hospital's count starts moving with a **SIMULATED**
  badge next to it, clearly distinct from a real nurse update, never presented as real.

## 2:50 — Close

Everything shown is "decision support, not a guarantee of a bed" — the footer line on the
ambulance screen says it outright, and the reason sentence on every ranked hospital is there
so a crew can judge the recommendation, not just follow it blindly.
