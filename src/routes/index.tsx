import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DispatchScreen } from "@/components/bedlink-dispatch";
import { HospitalScreen } from "@/components/bedlink-hospital";
import { NurseScreen } from "@/components/bedlink-nurse";
import { CommandScreen } from "@/components/bedlink-command";
import en from "@/locales/en.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BedLink — Hospital Bed Availability & Dispatch" },
      {
        name: "description",
        content:
          "A high-reliability clinical bed availability and ambulance dispatch coordination console.",
      },
      { property: "og:title", content: "BedLink — Clinical Decision Support" },
      {
        property: "og:description",
        content: "Real-time bed availability and ambulance dispatch coordination.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type ScreenRole = "nurse" | "hospital" | "ambulance" | "command";

function Index() {
  const [activeScreen, setActiveScreen] = useState<ScreenRole>("nurse");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const role = params.get("role") || params.get("screen");
      if (role === "nurse" || role === "hospital" || role === "ambulance" || role === "command") {
        setActiveScreen(role);
      }

      const themeParam = params.get("theme");
      if (themeParam === "dark") {
        document.documentElement.classList.add("dark");
        document.documentElement.classList.remove("light");
      } else if (themeParam === "light") {
        document.documentElement.classList.remove("dark");
        document.documentElement.classList.add("light");
      }
    }
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      {/* Review role selector for previewing workflows (≥48px touch targets, clean tokens) */}
      <nav
        className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-2 shadow-xs"
        aria-label="Choose BedLink workspace"
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-2)]">
            {en.viewAs}
          </span>
          <div className="grid grid-flow-col auto-cols-fr gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-1">
            <button
              type="button"
              onClick={() => setActiveScreen("nurse")}
              aria-pressed={activeScreen === "nurse"}
              className={`inline-flex min-h-[48px] items-center justify-center rounded-lg px-4 text-sm font-bold transition-all ${
                activeScreen === "nurse"
                  ? "border border-[var(--border)] bg-[var(--surface)] text-[var(--accent)] shadow-xs"
                  : "text-[var(--text-2)] hover:text-[var(--text)]"
              }`}
            >
              {en.nurseRole}
            </button>
            <button
              type="button"
              onClick={() => setActiveScreen("hospital")}
              aria-pressed={activeScreen === "hospital"}
              className={`inline-flex min-h-[48px] items-center justify-center rounded-lg px-4 text-sm font-bold transition-all ${
                activeScreen === "hospital"
                  ? "border border-[var(--border)] bg-[var(--surface)] text-[var(--accent)] shadow-xs"
                  : "text-[var(--text-2)] hover:text-[var(--text)]"
              }`}
            >
              {en.hospitalRole}
            </button>
            <button
              type="button"
              onClick={() => setActiveScreen("ambulance")}
              aria-pressed={activeScreen === "ambulance"}
              className={`inline-flex min-h-[48px] items-center justify-center rounded-lg px-4 text-sm font-bold transition-all ${
                activeScreen === "ambulance"
                  ? "border border-[var(--border)] bg-[var(--surface)] text-[var(--accent)] shadow-xs"
                  : "text-[var(--text-2)] hover:text-[var(--text)]"
              }`}
            >
              {en.ambulanceRole}
            </button>
            <button
              type="button"
              onClick={() => setActiveScreen("command")}
              aria-pressed={activeScreen === "command"}
              className={`inline-flex min-h-[48px] items-center justify-center rounded-lg px-4 text-sm font-bold transition-all ${
                activeScreen === "command"
                  ? "border border-[var(--border)] bg-[var(--surface)] text-[var(--accent)] shadow-xs"
                  : "text-[var(--text-2)] hover:text-[var(--text)]"
              }`}
            >
              {en.commandRole}
            </button>
          </div>
        </div>
      </nav>

      {/* Role Workspace Components — stay mounted when switching tabs so an
          in-flight request/offer/hold (and its SSE subscription) survives
          navigating to another role and back; only visibility toggles. */}
      <div className={activeScreen === "nurse" ? "" : "hidden"}>
        <NurseScreen />
      </div>
      <div className={activeScreen === "hospital" ? "" : "hidden"}>
        <HospitalScreen />
      </div>
      <div className={activeScreen === "ambulance" ? "" : "hidden"}>
        <DispatchScreen />
      </div>
      <div className={activeScreen === "command" ? "" : "hidden"}>
        <CommandScreen />
      </div>
    </div>
  );
}

