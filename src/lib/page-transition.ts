const BASE_DURATION = 300;
let activeLayer: HTMLElement | null = null;
let activeAnimation: Animation | null = null;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function motionDuration(): number {
  try {
    const value = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--site-motion"),
    );
    return BASE_DURATION * (Number.isFinite(value) && value > 0 ? value : 1);
  } catch {
    return BASE_DURATION;
  }
}

function cleanup(): void {
  activeAnimation?.cancel();
  activeAnimation = null;
  activeLayer?.remove();
  activeLayer = null;
}

/**
 * 路由切换前调用：把当前页面克隆成一层固定覆盖物淡出，
 * 底栏与背景保持实时可见，新页面由 App 淡入。
 */
export function beginPageFadeOut(): void {
  if (typeof document === "undefined" || prefersReducedMotion()) return;
  const shell = document.querySelector<HTMLElement>(".app-shell");
  if (!shell) return;

  cleanup();
  const startOpacity = Number.parseFloat(getComputedStyle(shell).opacity) || 1;
  const scrollY = window.scrollY;

  const layer = document.createElement("div");
  layer.className = "page-fade-layer";
  layer.setAttribute("aria-hidden", "true");

  const clone = shell.cloneNode(true) as HTMLElement;
  clone.removeAttribute("id");
  clone.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
  clone.style.setProperty("--page-fade-offset", `-${scrollY}px`);
  layer.appendChild(clone);
  document.body.appendChild(layer);

  const animation = layer.animate([{ opacity: startOpacity }, { opacity: 0 }], {
    duration: motionDuration(),
    easing: "ease",
  });
  activeLayer = layer;
  activeAnimation = animation;
  animation.onfinish = () => {
    if (activeLayer === layer) {
      layer.remove();
      activeLayer = null;
      activeAnimation = null;
    }
  };
}
