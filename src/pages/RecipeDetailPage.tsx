import { useEffect, useMemo, useState } from "react";
import { ChefHat, Copy, Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import type { Recipe } from "../types";
import { deleteRecipe, getRecipe, saveRecipe } from "../lib/store";
import { computeRatio, scaledAmount } from "../lib/scale";
import { formatDuration, formatMinutes, recipeToText, totalMinutes } from "../lib/recipe";
import { newId } from "../lib/uuid";
import { navigate } from "../lib/router";
import { pushToast } from "../lib/notify";
import { PageHeader } from "../components/PageHeader";
import { ScaleBar, type ScaleMode } from "../components/ScaleBar";
import { GroupedIngredients } from "../components/GroupedIngredients";

export function RecipeDetailPage({ id }: { id: string }) {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<ScaleMode>("servings");
  const [servings, setServings] = useState(2);
  const [baseValue, setBaseValue] = useState<number | null>(null);
  const [prepChecked, setPrepChecked] = useState<boolean[]>([]);
  const [noteText, setNoteText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getRecipe(id)
      .then((found) => {
        if (!alive) return;
        if (!found) {
          setRecipe(null);
          return;
        }
        setRecipe(found);
        setServings(found.servings || 2);
        setBaseValue(found.base.qty ?? null);
        setPrepChecked(found.prepItems.map(() => false));
      })
      .catch(() => {
        if (alive) pushToast({ title: "读取菜谱失败", tone: "error" });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id]);

  const ratio = useMemo(() => {
    if (!recipe) return 1;
    if (mode === "servings") return computeRatio(recipe, { mode: "servings", value: servings });
    return computeRatio(recipe, { mode: "base", value: baseValue ?? recipe.base.qty ?? 0 });
  }, [recipe, mode, servings, baseValue]);

  if (loading) {
    return (
      <div className="page">
        <PageHeader title="菜谱" />
        <div className="empty">
          <span className="empty-icon">🍲</span>
          <div className="empty-title">正在打开菜谱…</div>
        </div>
      </div>
    );
  }

  if (!recipe) {
    return (
      <div className="page">
        <PageHeader title="菜谱" />
        <div className="empty">
          <span className="empty-icon">🥣</span>
          <div className="empty-title">没有找到这道菜</div>
          <div className="small">它可能已被删除</div>
          <button className="btn btn-soft" style={{ marginTop: 18 }} onClick={() => navigate("/")}>
            回到菜谱
          </button>
        </div>
      </div>
    );
  }

  const total = totalMinutes(recipe);

  const updateRecipe = async (next: Recipe, successMessage?: string) => {
    setBusy(true);
    try {
      const saved = await saveRecipe(next);
      setRecipe(saved);
      if (successMessage) pushToast({ title: successMessage, tone: "success" });
    } catch {
      pushToast({ title: "保存失败，请重试", tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const togglePin = () => {
    void updateRecipe({ ...recipe, isPinned: !recipe.isPinned }, recipe.isPinned ? "已取消置顶" : "已置顶");
  };

  const submitNote = () => {
    const content = noteText.trim();
    if (!content) return;
    const note = { id: newId(), content, createdAt: Date.now() };
    void updateRecipe({ ...recipe, notes: [note, ...recipe.notes] }, "笔记已保存");
    setNoteText("");
  };

  const removeNote = (noteId: string) => {
    void updateRecipe({ ...recipe, notes: recipe.notes.filter((n) => n.id !== noteId) }, "笔记已删除");
  };

  const copyText = async () => {
    const label =
      ratio !== 1
        ? mode === "servings"
          ? `按 ${servings} 人份换算`
          : `按主料 ${baseValue ?? recipe.base.qty}${recipe.base.unit} 换算`
        : "";
    const text = recipeToText(recipe, ratio, label);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    pushToast({ title: "已复制", body: ratio !== 1 ? "当前换算后的用量也在里面" : "可以粘贴分享给朋友", tone: "success" });
  };

  const removeRecipe = () => {
    if (!window.confirm(`确定删除「${recipe.name}」吗？删除后无法恢复。`)) return;
    setBusy(true);
    deleteRecipe(recipe.id)
      .then(() => {
        pushToast({ title: "已删除", tone: "success" });
        navigate("/");
      })
      .catch(() => pushToast({ title: "删除失败", tone: "error" }))
      .finally(() => setBusy(false));
  };

  const startCook = () => {
    const value = mode === "servings" ? servings : baseValue ?? recipe.base.qty ?? recipe.servings;
    navigate(`/cook/${recipe.id}?${mode}=${value}`);
  };

  return (
    <div className="page">
      <PageHeader
        title="菜谱"
        actions={
          <button className="icon-btn" aria-label={recipe.isPinned ? "取消置顶" : "置顶"} onClick={togglePin} disabled={busy}>
            {recipe.isPinned ? <Pin size={18} fill="currentColor" /> : <PinOff size={18} />}
          </button>
        }
      />

      <div className="card">
        <div className="hstack" style={{ alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: "calc(26px * var(--site-type))", fontWeight: 850, lineHeight: 1.25 }}>
              {recipe.name}
            </h2>
            {recipe.description ? <div className="muted small" style={{ marginTop: 5 }}>{recipe.description}</div> : null}
          </div>
        </div>

        <div className="recipe-meta" style={{ marginTop: 10 }}>
          <span className="badge">{recipe.servings} 人份基准</span>
          {recipe.prepTime ? <span>备菜 {formatMinutes(recipe.prepTime)}</span> : null}
          {recipe.cookTime ? <span>烹饪 {formatMinutes(recipe.cookTime)}</span> : null}
          {total ? <span>共 {formatMinutes(total)}</span> : null}
        </div>

        {recipe.tags.length ? (
          <div className="recipe-tags">
            {recipe.tags.map((tag) => (
              <span className="tag" key={tag}>{tag}</span>
            ))}
          </div>
        ) : null}

        <button className="btn btn-primary btn-lg btn-block" style={{ marginTop: 16 }} onClick={startCook}>
          <ChefHat size={19} /> 开始做菜
        </button>
      </div>

      <ScaleBar
        recipe={recipe}
        mode={mode}
        onModeChange={setMode}
        servings={servings}
        onServingsChange={setServings}
        baseValue={baseValue}
        onBaseValueChange={setBaseValue}
        ratio={ratio}
      />

      <div className="card section">
        <div className="section-head">
          <div className="section-title">用料</div>
          <span className="section-note">按当前份量换算</span>
        </div>
        <GroupedIngredients recipe={recipe} ratio={ratio} />
      </div>

      {recipe.prepItems.length ? (
        <div className="card section">
          <div className="section-head">
            <div className="section-title">备菜</div>
            <span className="section-note">做之前逐项打勾</span>
          </div>
          {recipe.prepItems.map((item, index) => (
            <button
              className="check-row"
              key={item.id}
              style={{ width: "100%", border: 0, background: "transparent", textAlign: "left" }}
              onClick={() =>
                setPrepChecked((prev) => prev.map((value, i) => (i === index ? !value : value)))
              }
            >
              <span className={`check ${prepChecked[index] ? "on" : ""}`}>
                {prepChecked[index] ? "✓" : ""}
              </span>
              <span className="check-body">
                <span className={`check-text ${prepChecked[index] ? "done" : ""}`}>{item.content}</span>
                {item.durationSec ? (
                  <span className="step-dur" style={{ display: "flex" }}>
                    {item.timerTag ? `${item.timerTag} ` : ""}
                    {formatDuration(item.durationSec)}
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="card section">
        <div className="section-head">
          <div className="section-title">步骤</div>
          <span className="section-note">{recipe.steps.length} 步</span>
        </div>
        {recipe.steps.length ? (
          recipe.steps.map((step, index) => (
            <div className="step-row" key={step.id}>
              <div className="step-no">{index + 1}</div>
              <div className="step-body">
                <div className="step-text">{step.content}</div>
                {step.durationSec ? (
                  <div className="step-dur">
                    {step.timerTag ? `${step.timerTag} · ` : ""}
                    {formatDuration(step.durationSec)}
                  </div>
                ) : null}
              </div>
            </div>
          ))
        ) : (
          <div className="muted small">还没有步骤</div>
        )}
      </div>

      <div className="card section">
        <div className="section-head">
          <div className="section-title">做菜笔记</div>
          <span className="section-note">{recipe.notes.length} 条</span>
        </div>
        {recipe.notes.length ? (
          recipe.notes.map((note) => (
            <div className="list-row" key={note.id}>
              <div className="list-main">
                <div className="list-title" style={{ fontWeight: 500 }}>{note.content}</div>
                <div className="list-sub">{new Date(note.createdAt).toLocaleString("zh-CN")}</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => removeNote(note.id)} aria-label="删除笔记">
                <Trash2 size={14} />
              </button>
            </div>
          ))
        ) : (
          <div className="muted small" style={{ marginBottom: 10 }}>
            做完记一句调整，比如“这次多放了盐”，下次更稳。
          </div>
        )}
        <div className="row" style={{ marginTop: 8 }}>
          <input
            className="input"
            value={noteText}
            onChange={(event) => setNoteText(event.target.value)}
            placeholder="记一笔这次的调整…"
            onKeyDown={(event) => {
              if (event.key === "Enter") submitNote();
            }}
          />
          <button className="btn btn-soft" onClick={submitNote}>记一笔</button>
        </div>
      </div>

      <div className="section" style={{ display: "flex", gap: 10, flexWrap: "wrap", paddingBottom: 24 }}>
        <button className="btn" style={{ flex: 1 }} onClick={() => navigate(`/editor/${recipe.id}`)}>
          <Pencil size={16} /> 编辑
        </button>
        <button className="btn" style={{ flex: 1 }} onClick={copyText}>
          <Copy size={16} /> 复制
        </button>
        <button className="btn btn-danger" style={{ flex: 1 }} onClick={removeRecipe} disabled={busy}>
          <Trash2 size={16} /> 删除
        </button>
      </div>
    </div>
  );
}
