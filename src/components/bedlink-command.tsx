import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Ambulance,
  BedDouble,
  Building2,
  CheckCircle2,
  Clock,
  Droplets,
  HeartPulse,
  RefreshCw,
  ShieldCheck,
  Siren,
  Wind,
  XCircle,
} from "lucide-react";
import en from "@/locales/en.json";
import {
  AppBar,
  FreshnessBadge,
  StatusBadge,
  useClinicalTheme,
} from "./clinical/shared-components";
import {
  clearHospitalDiversion,
  getRegionalAnalytics,
  setHospitalDiversion,
  type BedType,
  type RegionalAnalyticsDto,
} from "@/lib/bedlink-client";
import { subscribeToBedlinkStream } from "@/lib/bedlink-stream";

const bedIcons: Record<BedType, typeof BedDouble> = {
  icu: Activity,
  ventilator: Wind,
  oxygen: Droplets,
  cardiac: HeartPulse,
  burns: AlertTriangle,
};

const bedNames: Record<BedType, string> = {
  icu: "ICU",
  ventilator: "Ventilator",
  oxygen: "Oxygen",
  cardiac: "Cardiac",
  burns: "Burns",
};

export function CommandScreen() {
  const [theme, toggleTheme] = useClinicalTheme();

  const {
    data: analytics,
    refetch,
    isLoading,
  } = useQuery<RegionalAnalyticsDto>({
    queryKey: ["regional-analytics"],
    queryFn: () => getRegionalAnalytics(),
    refetchInterval: 15000,
  });

  // Listen to live stream events to trigger instant refetch
  useEffect(() => {
    const unsubscribe = subscribeToBedlinkStream({
      onBedChange: () => void refetch(),
      onHold: () => void refetch(),
      onOutcome: () => void refetch(),
      onDiversion: () => void refetch(),
    });
    return unsubscribe;
  }, [refetch]);

  const handleToggleHospitalDiversion = async (hospitalId: string, currentlyDiverted: boolean) => {
    try {
      if (currentlyDiverted) {
        await clearHospitalDiversion(hospitalId);
      } else {
        await setHospitalDiversion(hospitalId, {
          isDiverted: true,
          reason: en.reasonOvercrowded,
          durationMinutes: 60,
        });
      }
      void refetch();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <main
      className={`min-h-screen bg-[var(--bg)] text-[var(--text)] pb-24 ${theme === "dark" ? "dark" : ""}`}
    >
      <AppBar
        title={en.appName}
        subtitle={`${en.commandTitle} · ${en.commandRole}`}
        connectionState="live"
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
        {/* Header & Subtitle */}
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">
              {en.commandTitle}
            </h1>
            <p className="text-xs sm:text-sm font-semibold text-[var(--text-2)]">
              {en.commandSubtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-2 sm:mt-0 inline-flex min-h-[40px] items-center gap-1.5 self-start rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--text)] shadow-xs hover:bg-[var(--surface-2)]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span>{en.live}</span>
          </button>
        </div>

        {/* 1. Regional KPI Summary Cards */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {/* Card 1: Hospitals Monitored */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-clinical">
            <div className="flex items-center justify-between text-[var(--text-2)]">
              <span className="text-xs font-bold uppercase tracking-wider">{en.totalHospitals}</span>
              <Building2 className="h-4 w-4" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold tabular-nums text-[var(--text)]">
                {analytics?.overview.totalHospitals ?? 6}
              </span>
              <span className="text-xs text-[var(--text-2)] font-semibold">centers</span>
            </div>
            <p className="mt-1 text-[11px] font-medium text-[var(--text-2)]">
              {analytics?.overview.divertedHospitals ?? 0 > 0 ? (
                <span className="text-[var(--danger-text)] font-bold">
                  {analytics?.overview.divertedHospitals} on diversion
                </span>
              ) : (
                <span className="text-[var(--ok-text)] font-semibold">All centers accepting</span>
              )}
            </p>
          </div>

          {/* Card 2: Net Available Beds */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-clinical">
            <div className="flex items-center justify-between text-[var(--text-2)]">
              <span className="text-xs font-bold uppercase tracking-wider">{en.netAvailable}</span>
              <BedDouble className="h-4 w-4 text-[var(--accent)]" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold tabular-nums text-[var(--text)]">
                {analytics?.overview.totalNetAvailable ?? 0}
              </span>
              <span className="text-xs text-[var(--text-2)] font-semibold">
                / {analytics?.overview.totalBedsReported ?? 0} free
              </span>
            </div>
            <p className="mt-1 text-[11px] text-[var(--text-2)] font-medium">
              After active ambulance holds
            </p>
          </div>

          {/* Card 3: Active Holds */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-clinical">
            <div className="flex items-center justify-between text-[var(--text-2)]">
              <span className="text-xs font-bold uppercase tracking-wider">{en.activeHoldsTitle}</span>
              <Ambulance className="h-4 w-4 text-[var(--accent)]" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold tabular-nums text-[var(--accent)]">
                {analytics?.overview.totalActiveHolds ?? 0}
              </span>
              <span className="text-xs text-[var(--text-2)] font-semibold">in route</span>
            </div>
            <p className="mt-1 text-[11px] text-[var(--text-2)] font-medium">
              Anti-herding atomic locks
            </p>
          </div>

          {/* Card 4: Bed Verification Accuracy */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-clinical">
            <div className="flex items-center justify-between text-[var(--text-2)]">
              <span className="text-xs font-bold uppercase tracking-wider">{en.verifiedAccuracy}</span>
              <ShieldCheck className="h-4 w-4 text-[var(--ok-text)]" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold tabular-nums text-[var(--ok-text)]">
                {analytics?.overview.averageReliability ?? 100}%
              </span>
              <span className="text-xs text-[var(--text-2)] font-semibold">audit score</span>
            </div>
            <p className="mt-1 text-[11px] text-[var(--text-2)] font-medium">
              Post-arrival crew feedback
            </p>
          </div>
        </div>

        {/* 2. Regional Capacity by Bed Type */}
        <section className="mt-8">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-2)]">
            {en.regionalCapacity}
          </h2>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-5">
            {(["icu", "ventilator", "oxygen", "cardiac", "burns"] as BedType[]).map((type) => {
              const Icon = bedIcons[type];
              const item = analytics?.bedBreakdown[type] ?? {
                reported: 0,
                activeHolds: 0,
                netAvailable: 0,
              };
              return (
                <div
                  key={type}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[var(--text)] uppercase tracking-wider">
                      {bedNames[type]}
                    </span>
                    <Icon className="h-4 w-4 text-[var(--accent)]" />
                  </div>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-2xl font-bold tabular-nums text-[var(--text)]">
                      {item.netAvailable}
                    </span>
                    <span className="text-xs text-[var(--text-2)] tabular-nums">
                      {item.activeHolds > 0 ? `${item.activeHolds} held` : "0 held"}
                    </span>
                  </div>
                  {/* Capacity bar */}
                  <div className="mt-2 h-1.5 w-full rounded-full bg-[var(--surface-2)] overflow-hidden">
                    <div
                      className={`h-full rounded-full ${item.netAvailable > 0 ? "bg-[var(--accent)]" : "bg-[var(--danger-text)]"}`}
                      style={{
                        width: `${Math.min(100, Math.max(10, item.reported * 12))}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 3. Regional Hospital Directory & Live Controls */}
        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-2)]">
              {en.hospitalInventoryTable}
            </h2>
            <span className="text-xs text-[var(--text-2)] font-semibold">
              Live capacity & diversion control
            </span>
          </div>

          <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-xs">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--surface-2)] text-xs font-bold uppercase tracking-wider text-[var(--text-2)]">
                <tr>
                  <th className="px-4 py-3">{en.hospital}</th>
                  <th className="px-4 py-3">{en.edStatus}</th>
                  <th className="px-4 py-3">ICU</th>
                  <th className="px-4 py-3">Ventilator</th>
                  <th className="px-4 py-3">Oxygen</th>
                  <th className="px-4 py-3">{en.activeHolds}</th>
                  <th className="px-4 py-3">{en.verifiedAccuracy}</th>
                  <th className="px-4 py-3 text-right">{en.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {(analytics?.hospitals ?? []).map((h) => {
                  const isDiverted = Boolean(h.diversion?.isDiverted);
                  const icuBed = h.beds.find((b) => b.bedType === "icu");
                  const ventBed = h.beds.find((b) => b.bedType === "ventilator");
                  const oxyBed = h.beds.find((b) => b.bedType === "oxygen");

                  return (
                    <tr key={h.id} className="hover:bg-[var(--surface-2)]/50 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-[var(--text)]">{h.name}</div>
                        <div className="text-xs text-[var(--text-2)] font-medium">
                          {h.isGovt ? "Govt Facility" : "Private"}
                          {h.schemes.length > 0 ? ` · ${h.schemes.join(", ")}` : ""}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        {isDiverted ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--danger-text)]/40 bg-[var(--danger-surface)] px-2.5 py-0.5 text-xs font-bold text-[var(--danger-text)]">
                            <Siren className="h-3 w-3 animate-pulse" />
                            <span>{en.edDiverted}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--ok-surface)] px-2.5 py-0.5 text-xs font-bold text-[var(--ok-text)]">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>{en.edOpen}</span>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 tabular-nums">
                        <span className="font-bold text-[var(--text)]">
                          {icuBed?.effectiveFree ?? 0}
                        </span>
                        <span className="text-xs text-[var(--text-2)]">
                          {" "}({icuBed?.free ?? 0})
                        </span>
                      </td>
                      <td className="px-4 py-3.5 tabular-nums">
                        <span className="font-bold text-[var(--text)]">
                          {ventBed?.effectiveFree ?? 0}
                        </span>
                        <span className="text-xs text-[var(--text-2)]">
                          {" "}({ventBed?.free ?? 0})
                        </span>
                      </td>
                      <td className="px-4 py-3.5 tabular-nums">
                        <span className="font-bold text-[var(--text)]">
                          {oxyBed?.effectiveFree ?? 0}
                        </span>
                        <span className="text-xs text-[var(--text-2)]">
                          {" "}({oxyBed?.free ?? 0})
                        </span>
                      </td>
                      <td className="px-4 py-3.5 tabular-nums font-bold text-[var(--accent)]">
                        {h.activeHoldsCount}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${
                            (h.reliability?.accuracyRate ?? 100) >= 80
                              ? "bg-[var(--ok-surface)] text-[var(--ok-text)]"
                              : "bg-[var(--warn-surface)] text-[var(--warn-text)]"
                          }`}
                        >
                          {h.reliability?.accuracyRate ?? 100}%
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleToggleHospitalDiversion(h.id, isDiverted)}
                          className={`inline-flex min-h-[36px] items-center rounded-lg px-3 text-xs font-bold transition-all ${
                            isDiverted
                              ? "bg-[var(--ok-surface)] text-[var(--ok-text)] hover:opacity-90"
                              : "border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--danger-surface)] hover:text-[var(--danger-text)]"
                          }`}
                        >
                          {isDiverted ? en.resumeIntake : en.declareDiversion}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* 4. Live Regional Audit & Dispatch Activity Feed */}
        <section className="mt-8">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-2)]">
            {en.recentActivity}
          </h2>

          <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xs">
            {(analytics?.recentEvents ?? []).length === 0 ? (
              <p className="py-6 text-center text-xs text-[var(--text-2)]">No recent events.</p>
            ) : (
              <div className="flex flex-col divide-y divide-[var(--border)]">
                {(analytics?.recentEvents ?? []).slice(0, 10).map((ev) => (
                  <div key={ev.id} className="flex items-center justify-between py-2.5">
                    <div className="flex items-center gap-3">
                      <Clock className="h-4 w-4 text-[var(--text-2)] shrink-0" />
                      <div>
                        <span className="font-bold text-xs text-[var(--text)]">
                          {ev.hospitalName}
                        </span>
                        <span className="text-xs text-[var(--text-2)]">
                          {" "}· {bedNames[ev.bedType as BedType] ?? ev.bedType} ({ev.eventType})
                        </span>
                        {ev.note && (
                          <p className="text-[11px] text-[var(--text-2)] italic mt-0.5">
                            {ev.note}
                          </p>
                        )}
                      </div>
                    </div>
                    <span className="text-[11px] text-[var(--text-2)] tabular-nums shrink-0">
                      {new Intl.DateTimeFormat(undefined, {
                        hour: "numeric",
                        minute: "2-digit",
                      }).format(new Date(ev.createdAt))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
