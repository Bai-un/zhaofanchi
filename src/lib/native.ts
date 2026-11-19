export interface ShijiNativeBridge {
  saveBackup: (fileName: string, content: string) => void;
  setTheme?: (dark: boolean) => void;
}

declare global {
  interface Window {
    ShijiNative?: ShijiNativeBridge;
  }
}

export function nativeBridge(): ShijiNativeBridge | null {
  if (typeof window === "undefined") return null;
  return window.ShijiNative ?? null;
}

export function isNativeApp(): boolean {
  return nativeBridge() !== null;
}
