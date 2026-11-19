import { useEffect } from "react";

interface WakeLockSentinelLike {
  release: () => Promise<void>;
}

export function useWakeLock(active = true): void {
  useEffect(() => {
    if (!active) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let disposed = false;

    const request = async () => {
      try {
        const wakeLock = (navigator as unknown as {
          wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
        }).wakeLock;
        if (!wakeLock) return;
        sentinel = await wakeLock.request("screen");
        if (disposed) void sentinel.release().catch(() => undefined);
      } catch {
        /* 不支持或用户拒绝时保持普通屏幕行为 */
      }
    };

    void request();
    const onVisible = () => {
      if (document.visibilityState === "visible") void request();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release().catch(() => undefined);
      sentinel = null;
    };
  }, [active]);
}
