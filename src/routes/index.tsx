import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DispatchScreen } from "@/components/bedlink-dispatch";
import { HospitalScreen } from "@/components/bedlink-hospital";
import { NurseScreen } from "@/components/bedlink-nurse";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BedLink — Dispatch request" },
      { name: "description", content: "A fast, clear hospital matching screen for ambulance dispatch teams." },
      { property: "og:title", content: "BedLink — Dispatch request" },
      { property: "og:description", content: "A fast, clear hospital matching screen for ambulance dispatch teams." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const [activeScreen, setActiveScreen] = useState<"nurse" | "hospital" | "ambulance">("ambulance");

  return (
    <div className="bedlink-preview">
      <nav className="screen-selector" aria-label="Choose BedLink workspace">
        <span className="screen-selector-label">View as</span>
        <div className="screen-selector-options">
          <button type="button" onClick={() => setActiveScreen("nurse")} aria-pressed={activeScreen === "nurse"}>Nurse</button>
          <button type="button" onClick={() => setActiveScreen("hospital")} aria-pressed={activeScreen === "hospital"}>Hospital</button>
          <button type="button" onClick={() => setActiveScreen("ambulance")} aria-pressed={activeScreen === "ambulance"}>Ambulance</button>
        </div>
      </nav>
      {activeScreen === "nurse" && <NurseScreen />}
      {activeScreen === "hospital" && <HospitalScreen />}
      {activeScreen === "ambulance" && <DispatchScreen />}
    </div>
  );
}
