import { useSyncExternalStore } from "react";

export type ToastTone = "info" | "success" | "error";

export interface ToastItem {
  id: string;
  title: string;
  body?: string;
  tone: ToastTone;
  createdAt: number;
}

let toasts: ToastItem[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useToasts(): ToastItem[] {
  return useSyncExternalStore(
    subscribeToasts,
    () => toasts,
    () => toasts,
  );
}

export function pushToast(input: Omit<ToastItem, "id" | "createdAt" | "tone"> & { tone?: ToastTone }): string {
  const item: ToastItem = {
    id: `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: input.title,
    body: input.body,
    tone: input.tone || "info",
    createdAt: Date.now(),
  };
  toasts = [...toasts, item].slice(-3);
  emit();
  const timeout = item.tone === "error" ? 9000 : 7000;
  setTimeout(() => dismissToast(item.id), timeout);
  return item.id;
}

export function dismissToast(id: string): void {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

let audioContext: AudioContext | null = null;

/** 在用户点击开始时调用，解锁浏览器音频。 */
export function primeAudio(): void {
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    if (!audioContext) audioContext = new Ctor();
    if (audioContext.state === "suspended") void audioContext.resume();
  } catch {
    /* 浏览器不支持时静默降级 */
  }
}

export function playChime(): void {
  primeAudio();
  if (!audioContext) return;
  try {
    const ctx = audioContext;
    const start = ctx.currentTime + 0.01;
    [0, 0.28, 0.56].forEach((offset, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = index === 2 ? 1046.5 : 880;
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.28, start + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.24);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start + offset);
      osc.stop(start + offset + 0.26);
    });
  } catch {
    /* 忽略音频异常 */
  }
}

export function vibrate(pattern: number | number[] = [200, 100, 200, 100, 400]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* 忽略震动异常 */
  }
}

export async function requestNotificationPermission(): Promise<void> {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "default") return;
  try {
    await Notification.requestPermission();
  } catch {
    /* 用户拒绝或不支持 */
  }
}

export function sendNotification(title: string, body: string): void {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, icon: "./icon-192.png", tag: "shiji-timer" });
  } catch {
    /* 页面通知失败时仍会有提示音和横幅 */
  }
}

export function notifyTimerDone(label: string): void {
  playChime();
  vibrate();
  sendNotification("计时结束", label);
  pushToast({ title: "计时结束", body: `${label} 到时间了`, tone: "success" });
}
