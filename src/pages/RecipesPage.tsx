import { useEffect, useMemo, useState } from "react";
import { Monitor, Moon, Plus, Search, Sparkles, Sun, Upload, X } from "lucide-react";
import type { Recipe } from "../types";
import { listRecipes } from "../lib/store";
import { navigate } from "../lib/router";
import { setThemePref, useThemePref } from "../lib/theme";
import { pushToast } from "../lib/notify";
import { RecipeCard } from "../components/RecipeCard";

export function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [activeTag, setActiveTag] = useState("");
  const themePref = useThemePref();

  useEffect(() => {
    let alive = true;
    listRecipes()
      .then((rows) => {
        if (alive) setRecipes(rows);
      })
      .catch(() => {
        if (alive) pushToast({ title: "读取本地菜谱失败", tone: "error" });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const tags = useMemo(() => {
    const set = new Set<string>();
    recipes.forEach((recipe) => recipe.tags.forEach((tag) => set.add(tag)));
    return Array.from(set);
  }, [recipes]);

  const filtered = useMemo(() => {
    const kw = keyword.trim();
    return recipes.filter((recipe) => {
      if (activeTag && !recipe.tags.includes(activeTag)) return false;
      if (!kw) return true;
      return (
        recipe.name.includes(kw) ||
        recipe.description.includes(kw) ||
        recipe.ingredients.some((item) => item.name.includes(kw))
      );
    });
  }, [recipes, keyword, activeTag]);

  const ThemeIcon = themePref === "system" ? Monitor : themePref === "light" ? Sun : Moon;

  const cycleTheme = () => {
    const next = themePref === "system" ? "light" : themePref === "light" ? "dark" : "system";
    setThemePref(next);
    pushToast({
      title: next === "system" ? "跟随系统主题" : next === "light" ? "浅色主题" : "深色主题",
      tone: "info",
    });
  };

  const randomPick = () => {
    const pool = filtered.length ? filtered : recipes;
    if (!pool.length) {
      pushToast({ title: "还没有菜谱", body: "先新建一道菜吧", tone: "info" });
      return;
    }
    const picked = pool[Math.floor(Math.random() * pool.length)];
    navigate(`/recipe/${picked.id}`);
  };

  return (
    <>
      <div className="page">
        <div className="brand-row">
          <div>
            <div className="brand-title">找饭吃</div>
            <div className="brand-sub">本地存储 · 备菜到出锅，一步不落</div>
          </div>
          <div className="top-actions">
            <button className="icon-btn" aria-label="粘贴导入菜谱" onClick={() => navigate("/import")}>
              <Upload size={18} />
            </button>
            <button
              className="icon-btn"
              aria-label="切换主题"
              title={themePref === "system" ? "跟随系统" : themePref === "light" ? "浅色" : "深色"}
              onClick={cycleTheme}
            >
              <ThemeIcon size={18} />
            </button>
          </div>
        </div>

        <div className="search-row">
          <div className="search-box">
            <Search size={17} className="muted" />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜菜名 / 备注 / 用料"
              aria-label="搜索菜谱"
            />
            {keyword ? (
              <button className="clear" aria-label="清空搜索" onClick={() => setKeyword("")}>
                <X size={15} />
              </button>
            ) : null}
          </div>
          <button className="icon-btn" aria-label="随机吃啥" title="随机吃啥" onClick={randomPick}>
            <Sparkles size={18} />
          </button>
        </div>

        {tags.length ? (
          <div className="chip-row" aria-label="标签筛选">
            <button className={`chip ${activeTag === "" ? "active" : ""}`} onClick={() => setActiveTag("")}>
              全部
            </button>
            {tags.map((tag) => (
              <button
                key={tag}
                className={`chip ${activeTag === tag ? "active" : ""}`}
                onClick={() => setActiveTag(activeTag === tag ? "" : tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        ) : null}

        {loading ? (
          <div className="empty">
            <span className="empty-icon">🍚</span>
            <div className="empty-title">正在打开你的菜谱…</div>
          </div>
        ) : filtered.length ? (
          <div>
            {filtered.map((recipe) => (
              <RecipeCard key={recipe.id} recipe={recipe} />
            ))}
            <div className="center tiny muted" style={{ padding: "18px 0 6px" }}>
              共 {filtered.length} 道菜 · 数据只存在这台设备
            </div>
          </div>
        ) : (
          <div className="empty">
            <span className="empty-icon">🍳</span>
            <div className="empty-title">{recipes.length ? "没有匹配的菜谱" : "还没有菜谱"}</div>
            <div className="small">
              {recipes.length
                ? "换个关键词或标签试试"
                : "点右下角 + 新建，或把抖音/小红书文案粘贴导入"}
            </div>
            {!recipes.length ? (
              <button className="btn btn-soft" style={{ marginTop: 18 }} onClick={() => navigate("/import")}>
                <Upload size={16} /> 粘贴导入
              </button>
            ) : null}
          </div>
        )}
      </div>

      <button className="fab" aria-label="新建菜谱" onClick={() => navigate("/editor/new")}>
        <Plus size={28} strokeWidth={2.4} />
      </button>
    </>
  );
}
