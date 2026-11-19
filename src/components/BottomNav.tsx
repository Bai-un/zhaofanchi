import type { CSSProperties } from "react";
import { BookOpen, Settings, Timer } from "lucide-react";
import { routeHref } from "../lib/router";

export type NavKey = "recipes" | "timer" | "settings";

const ITEMS: { key: NavKey; href: string; label: string; icon: typeof BookOpen }[] = [
  { key: "recipes", href: "/", label: "菜谱", icon: BookOpen },
  { key: "timer", href: "/timer", label: "计时", icon: Timer },
  { key: "settings", href: "/settings", label: "设置", icon: Settings },
];

export function BottomNav({ active }: { active: NavKey }) {
  const activeIndex = Math.max(0, ITEMS.findIndex((item) => item.key === active));
  return (
    <nav className="bottom-nav" aria-label="主导航">
      <div className="nav-inner">
        <span
          className="nav-highlight"
          style={{ "--nav-index": activeIndex } as CSSProperties}
          aria-hidden="true"
        />
        {ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <a
              key={item.key}
              className={`nav-item ${active === item.key ? "active" : ""}`}
              href={routeHref(item.href)}
              aria-current={active === item.key ? "page" : undefined}
            >
              <Icon size={21} strokeWidth={2.1} />
              <span>{item.label}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
