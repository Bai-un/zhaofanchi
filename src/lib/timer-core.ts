export type TimerKind = "prep" | "step" | "quick";
export type TimerState = "running" | "paused" | "done";

export interface TimerRecord {
  id: string;
  label: string;
  durationSec: number;
  endAt: number;
  pausedRemaining: number | null;
  state: TimerState;
  createdAt: number;
  notified: boolean;
  kind: TimerKind;
  recipeId?: string;
  refId?: string;
}

export interface StartTimerInput {
  label: string;
  seconds: number;
  kind: TimerKind;
  recipeId?: string;
  refId?: string;
}

export interface TimerPreset {
  id: string;
  label: string;
  seconds: number;
}

const TIMER_KEY = "shiji:timers:v1";
const PRESET_KEY = "shiji:timer-presets:v1";

export const DEFAULT_PRESETS: TimerPreset[] = [
  { id: "preset-rice", label: "煮饭", seconds: 30 * 60 },
  { id: "preset-egg", label: "蒸蛋", seconds: 10 * 60 },
  { id: "preset-noodle", label: "煮面", seconds: 5 * 60 },
  { id: "preset-stew", label: "炖肉", seconds: 60 * 60 },
];

export function createTimer(input: StartTimerInput, now = Date.now()): TimerRecord {
  const seconds = Math.max(1, Math.round(input.seconds));
  return {
    id: `timer-${now}-${Math.random().toString(16).slice(2, 8)}`,
    label: input.label.trim() || "计时",
    durationSec: seconds,
    endAt: now + seconds * 1000,
    pausedRemaining: null,
    state: "running",
    createdAt: now,
    notified: false,
    kind: input.kind,
    recipeId: input.recipeId,
    refId: input.refId,
  };
}

export function remainingSec(timer: TimerRecord, now = Date.now()): number {
  if (timer.state === "paused") return Math.max(0, Math.ceil(timer.pausedRemaining || 0));
  if (timer.state === "done") return 0;
  return Math.max(0, Math.ceil((timer.endAt - now) / 1000));
}

export function timerProgress(timer: TimerRecord, now = Date.now()): number {
  if (!timer.durationSec) return 0;
  const remaining = remainingSec(timer, now);
  return Math.min(1, Math.max(0, 1 - remaining / timer.durationSec));
}

export function pauseTimer(timer: TimerRecord, now = Date.now()): TimerRecord {
  if (timer.state !== "running") return timer;
  return {
    ...timer,
    state: "paused",
    pausedRemaining: remainingSec(timer, now),
  };
}

export function resumeTimer(timer: TimerRecord, now = Date.now()): TimerRecord {
  if (timer.state !== "paused") return timer;
  return {
    ...timer,
    state: "running",
    endAt: now + Math.max(1, timer.pausedRemaining || 1) * 1000,
    pausedRemaining: null,
  };
}

export function addTimerSeconds(timer: TimerRecord, seconds: number, now = Date.now()): TimerRecord {
  const add = Math.max(1, Math.round(seconds));
  if (timer.state === "paused") {
    return {
      ...timer,
      pausedRemaining: (timer.pausedRemaining || 0) + add,
      durationSec: timer.durationSec + add,
    };
  }
  if (timer.state === "done") {
    return {
      ...timer,
      state: "running",
      endAt: now + add * 1000,
      pausedRemaining: null,
      durationSec: Math.max(1, add),
      notified: false,
    };
  }
  return {
    ...timer,
    endAt: timer.endAt + add * 1000,
    durationSec: timer.durationSec + add,
  };
}

export function tickTimer(timer: TimerRecord, now = Date.now()): { timer: TimerRecord; finished: boolean } {
  if (timer.state === "running" && timer.endAt <= now) {
    return { timer: { ...timer, state: "done", pausedRemaining: 0 }, finished: true };
  }
  return { timer, finished: false };
}

export function loadTimers(): TimerRecord[] {
  try {
    const raw = localStorage.getItem(TIMER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TimerRecord[];
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed
      .filter((t) => t && typeof t.id === "string" && typeof t.endAt === "number")
      .map((t) => {
        if (t.state === "running" && t.endAt <= now) {
          return { ...t, state: "done" as TimerState, pausedRemaining: 0, notified: true };
        }
        return {
          ...t,
          kind: t.kind === "prep" || t.kind === "step" ? t.kind : "quick",
          notified: Boolean(t.notified),
          pausedRemaining: typeof t.pausedRemaining === "number" ? t.pausedRemaining : null,
        };
      });
  } catch {
    return [];
  }
}

export function persistTimers(timers: TimerRecord[]): void {
  try {
    localStorage.setItem(TIMER_KEY, JSON.stringify(timers));
  } catch {
    /* 存储已满或隐私模式时忽略 */
  }
}

export function loadPresets(): TimerPreset[] {
  try {
    const raw = localStorage.getItem(PRESET_KEY);
    if (!raw) return DEFAULT_PRESETS.slice();
    const parsed = JSON.parse(raw) as TimerPreset[];
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_PRESETS.slice();
    return parsed
      .filter((p) => p && typeof p.label === "string" && Number.isFinite(p.seconds) && p.seconds > 0)
      .map((p) => ({
        id: p.id || `preset-${Math.random().toString(16).slice(2, 8)}`,
        label: p.label,
        seconds: Math.round(p.seconds),
      }));
  } catch {
    return DEFAULT_PRESETS.slice();
  }
}

export function savePresets(presets: TimerPreset[]): void {
  try {
    localStorage.setItem(PRESET_KEY, JSON.stringify(presets));
  } catch {
    /* 忽略 */
  }
}
