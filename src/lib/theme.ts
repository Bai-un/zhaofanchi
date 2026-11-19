import { useSyncExternalStore } from "react";
import { nativeBridge } from "./native";

export type ThemePref = "system" | "light" | "dark";

const KEY = "shiji:theme";
const listeners = new Set<() => void>();

function load(): ThemePref {
  try {
    const value = localStorage.getItem(KEY);
    if (value === "light" || value === "dark" || value === "system") return value;
  } catch {
    /* 忽略 */
  }
  return "system";
}

let pref: ThemePref = load();

function isDark(): boolean {
  if (pref === "dark") return true;
  if (pref === "light") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function apply(): void {
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", isDark() ? "#161311" : "#FAF6EE");
  nativeBridge()?.setTheme?.(isDark());
}

export function initTheme(): void {
  apply();
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  media?.addEventListener?.("change", () => {
    if (pref === "system") {
      apply();
      listeners.forEach((listener) => listener());
    }
  });
}

export function setThemePref(next: ThemePref): void {
  pref = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* 忽略 */
  }
  apply();
  listeners.forEach((listener) => listener());
}

export function getThemePref(): ThemePref {
  return pref;
}

export function useThemePref(): ThemePref {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getThemePref,
    getThemePref,
  );
}

export function effectiveTheme(): "light" | "dark" {
  return isDark() ? "dark" : "light";
}
