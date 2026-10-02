import React, { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  HelpCircle,
  Moon,
  RotateCcw,
  Sun,
  Wifi,
  WifiOff,
} from "lucide-react";
import en from "@/locales/en.json";

export type ConnectionState = "live" | "reconnecting" | "offline";

/* -------------------------------------------------------------------------- */
/* 1. AppBar                                                                  */
/* -------------------------------------------------------------------------- */
export interface AppBarProps {
  title: string;
  subtitle?: string;
  connectionState?: ConnectionState;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  // Demo mode switcher
  isDemoMode?: boolean;
  activeRole?: "nurse" | "hospital" | "ambulance" | "admin";
  onRoleChange?: (role: "nurse" | "hospital" | "ambulance" | "admin") => void;
}

export function AppBar({
  title,
  subtitle,
  connectionState = "live",
  theme,
  onToggleTheme,
  isDemoMode = false,
  activeRole,
  onRoleChange,
}: AppBarProps) {
  return (
    <header className="sticky top-0 z-30 w-full border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-xs">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        {/* Left: Branding & Unit */}
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight text-[var(--text)]">
              {title}
            </span>
            {/* Status dot + word */}
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                connectionState === "live"
                  ? "bg-[var(--ok-surface)] text-[var(--ok-text)]"
                  : connectionState === "reconnecting"
                  ? "bg-[var(--warn-surface)] text-[var(--warn-text)]"
                  : "bg-[var(--danger-surface)] text-[var(--danger-text)]"
              }`}
              role="status"
              aria-label={`Connection status: ${connectionState}`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  connectionState === "live"
                    ? "bg-[var(--ok-text)]"
                    : connectionState === "reconnecting"
                    ? "bg-[var(--warn-text)]"
                    : "bg-[var(--danger-text)]"
                }`}
                aria-hidden="true"
              />
              <span className="font-medium">
                {connectionState === "live"
                  ? en.live
                  : connectionState === "reconnecting"
                  ? en.reconnecting
                  : en.offline}
              </span>
            </span>
          </div>
          {subtitle && (
            <span className="text-sm font-medium text-[var(--text-2)]">
              {subtitle}
            </span>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Demo-only role switcher */}
          {isDemoMode && onRoleChange && (
            <div className="hidden sm:flex items-center rounded-lg bg-[var(--surface-2)] p-1 border border-[var(--border)]">
              {(["nurse", "hospital", "ambulance", "admin"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => onRoleChange(r)}
                  className={`min-h-[36px] px-3 text-xs font-semibold rounded-md transition-colors ${
                    activeRole === r
                      ? "bg-[var(--surface)] text-[var(--accent)] shadow-xs"
                      : "text-[var(--text-2)] hover:text-[var(--text)]"
                  }`}
                  aria-pressed={activeRole === r}
                >
                  {r === "nurse"
                    ? en.nurseRole
                    : r === "hospital"
                    ? en.hospitalRole
                    : r === "ambulance"
                    ? en.ambulanceRole
                    : en.adminRole}
                </button>
              ))}
            </div>
          )}

          {/* Theme Switcher (≥48px touch target) */}
          <button
            type="button"
            onClick={onToggleTheme}
            className="inline-flex min-h-[48px] min-w-[48px] items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] transition-colors hover:bg-[var(--surface-2)]"
            aria-label={`${en.theme}: ${theme === "light" ? en.dark : en.light}`}
          >
            {theme === "light" ? (
              <Moon className="h-5 w-5" aria-hidden="true" strokeWidth={2} />
            ) : (
              <Sun className="h-5 w-5" aria-hidden="true" strokeWidth={2} />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/* 2. StatusBadge                                                             */
/* -------------------------------------------------------------------------- */
export type BedAvailabilityStatus = "available" | "low" | "none";

export function StatusBadge({ status }: { status: BedAvailabilityStatus }) {
  const config = {
    available: {
      text: en.statusAvailable,
      bg: "bg-[var(--ok-surface)]",
      textColor: "text-[var(--ok-text)]",
      Icon: CheckCircle2,
    },
    low: {
      text: en.statusLow,
      bg: "bg-[var(--warn-surface)]",
      textColor: "text-[var(--warn-text)]",
      Icon: AlertTriangle,
    },
    none: {
      text: en.statusNone,
      bg: "bg-[var(--danger-surface)]",
      textColor: "text-[var(--danger-text)]",
      Icon: AlertCircle,
    },
  }[status];

  const IconComponent = config.Icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold ${config.bg} ${config.textColor}`}
    >
      <IconComponent className="h-4 w-4 shrink-0" aria-hidden="true" strokeWidth={2} />
      <span>{config.text}</span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* 3. FreshnessBadge                                                          */
/* -------------------------------------------------------------------------- */
export interface FreshnessBadgeProps {
  updatedAtText: string;
}

export function FreshnessBadge({ updatedAtText }: FreshnessBadgeProps) {
  const isNoData = !updatedAtText || updatedAtText === "No data" || updatedAtText === en.noData;
  const isJustNow = updatedAtText.toLowerCase().includes("just now") || updatedAtText === en.justNow;

  let ageMinutes = 0;
  if (!isNoData && !isJustNow) {
    const parsed = parseInt(updatedAtText, 10);
    if (!isNaN(parsed)) {
      ageMinutes = parsed;
    }
  }

  let tone: "ok" | "warn" | "danger" | "unknown" = "ok";
  let label = `${en.updated} ${updatedAtText}`;

  if (isNoData) {
    tone = "unknown";
    label = en.noData;
  } else if (isJustNow) {
    tone = "ok";
    label = `${en.updated} ${en.justNow}`;
  } else if (ageMinutes < 15) {
    tone = "ok";
    label = `${en.updated} ${ageMinutes} ${en.minutesAgo}`;
  } else if (ageMinutes <= 45) {
    tone = "warn";
    label = `${en.updated} ${ageMinutes} ${en.minutesAgo}`;
  } else {
    tone = "danger";
    label = `${en.stale}, ${ageMinutes} ${en.minutesAgo}`;
  }

  const toneClasses = {
    ok: "bg-[var(--ok-surface)] text-[var(--ok-text)]",
    warn: "bg-[var(--warn-surface)] text-[var(--warn-text)]",
    danger: "bg-[var(--danger-surface)] text-[var(--danger-text)]",
    unknown: "bg-[var(--unknown-surface)] text-[var(--unknown-text)]",
  }[tone];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${toneClasses}`}
    >
      <Clock3 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" strokeWidth={2} />
      <span>{label}</span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* 4. ConfidenceTag                                                           */
/* -------------------------------------------------------------------------- */
export type ConfidenceLevel = "likely_free" | "uncertain" | "probably_full" | "unknown";

export function ConfidenceTag({ level }: { level: ConfidenceLevel }) {
  const config = {
    likely_free: {
      label: en.confidenceLikelyFree,
      cls: "bg-[var(--ok-surface)] text-[var(--ok-text)]",
      Icon: CheckCircle2,
    },
    uncertain: {
      label: en.confidenceUncertain,
      cls: "bg-[var(--warn-surface)] text-[var(--warn-text)]",
      Icon: AlertTriangle,
    },
    probably_full: {
      label: en.confidenceProbablyFull,
      cls: "bg-[var(--danger-surface)] text-[var(--danger-text)]",
      Icon: AlertCircle,
    },
    unknown: {
      label: en.confidenceUnknown,
      cls: "bg-[var(--unknown-surface)] text-[var(--unknown-text)]",
      Icon: HelpCircle,
    },
  }[level];

  const IconComp = config.Icon;

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${config.cls}`}>
      <IconComp className="h-3.5 w-3.5 shrink-0" aria-hidden="true" strokeWidth={2} />
      <span>{config.label}</span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* 5. SimulatedBadge                                                          */
/* -------------------------------------------------------------------------- */
export function SimulatedBadge() {
  return (
    <span
      className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-0.5 text-xs font-bold tracking-wider text-[var(--text-2)]"
      title="Simulated test feed"
    >
      {en.simulated}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* 6. CountdownRing                                                           */
/* -------------------------------------------------------------------------- */
export interface CountdownRingProps {
  totalSeconds: number;
  remainingSeconds: number;
  size?: number;
  strokeWidth?: number;
}

export function CountdownRing({
  totalSeconds,
  remainingSeconds,
  size = 180,
  strokeWidth = 10,
}: CountdownRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, remainingSeconds / totalSeconds));
  const strokeDashoffset = circumference - progress * circumference;

  const isWarn = remainingSeconds <= 30 && remainingSeconds > 10;
  const isDanger = remainingSeconds <= 10;

  const color = isDanger
    ? "var(--danger-text)"
    : isWarn
    ? "var(--warn-text)"
    : "var(--accent)";

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const formattedTime = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  // Aria-live announcement at 60s, 30s, 10s only
  const shouldAnnounce = remainingSeconds === 60 || remainingSeconds === 30 || remainingSeconds === 10;

  return (
    <div className="relative inline-flex flex-col items-center justify-center">
      <svg
        width={size}
        height={size}
        className="-rotate-90 transform"
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="var(--surface-2)"
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="transparent"
          className="transition-all duration-500 ease-linear"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span
          className="text-4xl font-bold tracking-tight text-[var(--text)] tabular-nums"
          aria-label={`${remainingSeconds} seconds remaining`}
        >
          {formattedTime}
        </span>
        <span className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider">
          {en.toRespond}
        </span>
      </div>

      {shouldAnnounce && (
        <span className="sr-only" role="status" aria-live="polite">
          {remainingSeconds} seconds remaining to respond
        </span>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 7. BottomActionBar                                                         */
/* -------------------------------------------------------------------------- */
export interface BottomActionBarProps {
  children: React.ReactNode;
}

export function BottomActionBar({ children }: BottomActionBarProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-[var(--border)] bg-[var(--surface)]/95 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-clinical backdrop-blur-xs">
      <div className="mx-auto flex max-w-lg items-center justify-center">
        {children}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 8. Toast with Undo                                                         */
/* -------------------------------------------------------------------------- */
export interface ClinicalToastProps {
  message: string;
  onUndo?: () => void;
  onClose: () => void;
}

export function ClinicalToast({ message, onUndo, onClose }: ClinicalToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-24 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 px-4 text-sm font-medium text-[var(--text)] shadow-clinical"
    >
      <span className="tabular-nums">{message}</span>
      {onUndo && (
        <button
          type="button"
          onClick={onUndo}
          className="inline-flex min-h-[48px] items-center gap-1.5 px-3 font-semibold text-[var(--accent)] hover:underline"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          <span>{en.undo}</span>
        </button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 9. OfflineBanner                                                           */
/* -------------------------------------------------------------------------- */
export function OfflineBanner({ queueCount = 0 }: { queueCount?: number }) {
  return (
    <div
      role="alert"
      className="flex min-h-[48px] items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--warn-surface)] px-4 py-2.5 text-sm font-medium text-[var(--warn-text)]"
    >
      <div className="flex items-center gap-2">
        <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{en.offlineMessage}</span>
      </div>
      {queueCount > 0 && (
        <span className="shrink-0 font-semibold tabular-nums">
          {en.waiting}: {queueCount}
        </span>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 10. SegmentedControl                                                       */
/* -------------------------------------------------------------------------- */
export interface SegmentedControlOption<T extends string> {
  id: T;
  label: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (val: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="grid w-full grid-flow-col auto-cols-fr gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-1.5"
    >
      {options.map((opt) => {
        const isSelected = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange(opt.id)}
            className={`min-h-[48px] rounded-lg px-3 py-2 text-sm font-semibold transition-all ${
              isSelected
                ? "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-xs"
                : "text-[var(--text-2)] hover:text-[var(--text)]"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
