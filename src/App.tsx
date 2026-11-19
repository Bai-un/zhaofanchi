import { useEffect, useLayoutEffect, useState } from "react";
import { useRoute } from "./lib/router";
import { ensureTicker } from "./lib/timer-store";
import { seedSamplesIfEmpty } from "./lib/store";
import { ToastStack } from "./components/ToastStack";
import { BottomNav } from "./components/BottomNav";
import { RecipesPage } from "./pages/RecipesPage";
import { RecipeDetailPage } from "./pages/RecipeDetailPage";
import { EditorPage } from "./pages/EditorPage";
import { ImportPage } from "./pages/ImportPage";
import { CookPage } from "./pages/CookPage";
import { TimerPage } from "./pages/TimerPage";
import { SettingsPage } from "./pages/SettingsPage";

export default function App() {
  const route = useRoute();
  const page = route.segments[0] || "";
  const param = route.segments[1] || "";
  const showNav = page === "" || page === "timer" || page === "settings";
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    seedSamplesIfEmpty()
      .catch(() => undefined)
      .finally(() => {
        if (alive) setReady(true);
      });
    ensureTicker();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    const titles: Record<string, string> = {
      "": "找饭吃",
      recipe: "菜谱",
      editor: "编辑菜谱",
      import: "粘贴导入",
      cook: "做菜中",
      timer: "计时",
      settings: "设置",
    };
    document.title = titles[page] || "找饭吃";
  }, [page, param]);

  useLayoutEffect(() => {
    document
      .querySelector(".app-shell")
      ?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: "ease" });
  }, [page, param]);

  if (!ready) {
    return (
      <div className="app-shell">
        <div className="empty" style={{ paddingTop: 120 }}>
          <span className="empty-icon">🍚</span>
          <div className="empty-title">正在准备你的厨房…</div>
          <div className="small">首次打开会放两道示例菜谱</div>
        </div>
      </div>
    );
  }

  let content = <RecipesPage />;
  if (page === "recipe" && param) {
    content = <RecipeDetailPage id={param} />;
  } else if (page === "editor") {
    content = (
      <EditorPage
        id={param && param !== "new" ? param : undefined}
        draft={route.query.get("draft") === "1"}
      />
    );
  } else if (page === "import") {
    content = <ImportPage />;
  } else if (page === "cook" && param) {
    content = <CookPage id={param} query={route.query} />;
  } else if (page === "timer") {
    content = <TimerPage />;
  } else if (page === "settings") {
    content = <SettingsPage />;
  }

  return (
    <>
      <div className={`app-shell ${showNav ? "" : "no-nav"}`}>{content}</div>
      {showNav ? (
        <BottomNav active={page === "timer" ? "timer" : page === "settings" ? "settings" : "recipes"} />
      ) : null}
      <ToastStack />
    </>
  );
}
