import { useSyncExternalStore } from "react";
import {
  addTimerSeconds,
  createTimer,
  loadTimers,
  pauseTimer,
  persistTimers,
  resumeTimer,
  tickTimer,
  type StartTimerInput,
  type TimerKind,
  type TimerRecord,
} from "./timer-core.ts";
import { notifyTimerDone, primeAudio, requestNotificationPermission } from "./notify.ts";

export interface TimerSnapshot {
  timers: TimerRecord[];
  now: number;
}

let snapshot: TimerSnapshot = { timers: loadTimers(), now: Date.now() };
const listeners = new Set<() => void>();
let ticker: ReturnType<typeof setInterval> | null = null;

function commit(timers: TimerRecord[]): void {
  snapshot = { timers, now: Date.now() };
  persistTimers(timers);
  listeners.forEach((listener) => listener());
}

export function subscribeTimers(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTimerSnapshot(): TimerSnapshot {
  return snapshot;
}

export function useTimerSnapshot(): TimerSnapshot {
  return useSyncExternalStore(subscribeTimers, getTimerSnapshot, getTimerSnapshot);
}

export function ensureTicker(): void {
  if (ticker) return;
  ticker = setInterval(() => {
    if (snapshot.timers.length === 0) return;
    const now = Date.now();
    const finished: TimerRecord[] = [];
    let changed = false;
    const next = snapshot.timers.map((timer) => {
      const result = tickTimer(timer, now);
      if (result.finished) {
        changed = true;
        if (!timer.notified) finished.push(result.timer);
        return result.timer;
      }
      return timer;
    });
    const finalTimers = changed
      ? next.map((timer) =>
          finished.some((f) => f.id === timer.id) ? { ...timer, notified: true } : timer,
        )
      : next;
    snapshot = { timers: finalTimers, now };
    if (changed) persistTimers(finalTimers);
    listeners.forEach((listener) => listener());
    finished.forEach((timer) => notifyTimerDone(timer.label));
  }, 1000);
}

export function stopTicker(): void {
  if (ticker) {
    clearInterval(ticker);
    ticker = null;
  }
}

export function startTimer(input: StartTimerInput): TimerRecord {
  primeAudio();
  void requestNotificationPermission();
  const timer = createTimer(input);
  commit([...snapshot.timers, timer]);
  ensureTicker();
  return timer;
}

export function pauseTimerById(id: string): void {
  commit(snapshot.timers.map((t) => (t.id === id ? pauseTimer(t) : t)));
}

export function resumeTimerById(id: string): void {
  commit(snapshot.timers.map((t) => (t.id === id ? resumeTimer(t) : t)));
}

export function addSecondsById(id: string, seconds: number): void {
  commit(snapshot.timers.map((t) => (t.id === id ? addTimerSeconds(t, seconds) : t)));
}

export function cancelTimerById(id: string): void {
  commit(snapshot.timers.filter((t) => t.id !== id));
}

export function clearDoneTimers(): void {
  commit(snapshot.timers.filter((t) => t.state !== "done"));
}

export function findTimerForRef(refId: string, kind?: TimerKind): TimerRecord | undefined {
  return snapshot.timers.find(
    (t) => t.refId === refId && t.state !== "done" && (!kind || t.kind === kind),
  );
}

export function findAnyTimerForRef(refId: string, kind?: TimerKind): TimerRecord | undefined {
  return snapshot.timers.find((t) => t.refId === refId && (!kind || t.kind === kind));
}
