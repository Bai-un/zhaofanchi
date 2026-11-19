import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Save, Trash2 } from "lucide-react";
import type { Ingredient, IngredientGroup, PrepItem, Recipe, Step } from "../types";
import { GROUP_META } from "../types";
import {
  createEmptyRecipe,
  emptyIngredient,
  emptyPrep,
  emptyStep,
  normalizeRecipe,
  splitTags,
  syncBase,
} from "../lib/recipe";
import { formatPortion, UNIT_OPTIONS } from "../lib/scale";
import { getRecipe, saveRecipe } from "../lib/store";
import { navigate } from "../lib/router";
import { pushToast } from "../lib/notify";
import { PageHeader } from "../components/PageHeader";

function DurationInput({ seconds, onChange }: { seconds: number; onChange: (value: number) => void }) {
  const safe = Math.max(0, Math.round(seconds || 0));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return (
    <div className="row" style={{ gap: 6 }}>
      <input
        className="input mini-input"
        type="number"
        min={0}
        value={minutes}
        aria-label="分钟"
        onChange={(event) => {
          const nextMinutes = Math.max(0, Number(event.target.value) || 0);
          onChange(nextMinutes * 60 + rest);
        }}
      />
      <span className="tiny muted">分</span>
      <input
        className="input mini-input"
        type="number"
        min={0}
        max={59}
        value={rest}
        aria-label="秒"
        onChange={(event) => {
          const nextSeconds = Math.min(59, Math.max(0, Number(event.target.value) || 0));
          onChange(minutes * 60 + nextSeconds);
        }}
      />
      <span className="tiny muted">秒</span>
    </div>
  );
}

export function EditorPage({ id, draft }: { id?: string; draft?: boolean }) {
  const [form, setForm] = useState<Recipe>(() => createEmptyRecipe());
  const [tagsText, setTagsText] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        if (id) {
          const found = await getRecipe(id);
          if (!found) {
            if (alive) {
              pushToast({ title: "菜谱不存在", tone: "error" });
              navigate("/");
            }
            return;
          }
          if (!alive) return;
          const normalized = syncBase(normalizeRecipe(found));
          setForm(normalized);
          setTagsText(normalized.tags.join("，"));
        } else if (draft) {
          const raw = sessionStorage.getItem("shiji:draft");
          if (!raw) return;
          const parsed = syncBase(normalizeRecipe(JSON.parse(raw)));
          if (!alive) return;
          setForm(parsed);
          setTagsText(parsed.tags.join("，"));
          setDirty(true);
          sessionStorage.removeItem("shiji:draft");
        }
      } catch {
        if (alive) pushToast({ title: "读取草稿失败", tone: "error" });
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, [id, draft]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const change = (updater: (prev: Recipe) => Recipe) => {
    setForm((prev) => updater(prev));
    setDirty(true);
  };

  const updateIngredient = (index: number, patch: Partial<Ingredient>) => {
    change((prev) => {
      const ingredients = prev.ingredients.map((item, i) => (i === index ? { ...item, ...patch } : item));
      const target = ingredients[index];
      const base =
        prev.base.ingredientId === target.id
          ? { ...prev.base, qty: target.qty, unit: target.unit }
          : prev.base;
      return { ...prev, ingredients, base };
    });
  };

  const markBase = (index: number) => {
    change((prev) => {
      const target = prev.ingredients[index];
      if (!target || target.qty == null) return prev;
      return {
        ...prev,
        base: { ingredientId: target.id, qty: target.qty, unit: target.unit },
        ingredients: prev.ingredients.map((item, i) => ({ ...item, isBase: i === index })),
      };
    });
  };

  const toggleTaste = (index: number) => {
    const item = form.ingredients[index];
    if (!item) return;
    if (item.qty != null) {
      updateIngredient(index, { qty: null, unit: "", amountText: "适量", scaleRule: "fixed", isBase: false });
    } else {
      updateIngredient(index, { amountText: "", scaleRule: "linear" });
    }
  };

  const addIngredient = (group: IngredientGroup) => {
    change((prev) => ({ ...prev, ingredients: [...prev.ingredients, emptyIngredient(group)] }));
  };

  const removeIngredient = (index: number) => {
    change((prev) => {
      const ingredients = prev.ingredients.filter((_, i) => i !== index);
      return { ...prev, ingredients: ingredients.length ? ingredients : [emptyIngredient("main")] };
    });
  };

  const updatePrep = (index: number, patch: Partial<PrepItem>) => {
    change((prev) => ({
      ...prev,
      prepItems: prev.prepItems.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));
  };

  const updateStep = (index: number, patch: Partial<Step>) => {
    change((prev) => ({
      ...prev,
      steps: prev.steps.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= form.steps.length) return;
    change((prev) => {
      const steps = prev.steps.slice();
      [steps[index], steps[target]] = [steps[target], steps[index]];
      return { ...prev, steps };
    });
  };

  const leave = () => {
    if (dirty && !window.confirm("还有未保存的修改，确定离开吗？")) return;
    navigate(id ? `/recipe/${id}` : "/");
  };

  const save = async () => {
    if (busy) return;
    const name = form.name.trim();
    if (!name) {
      pushToast({ title: "给这道菜起个名字", tone: "error" });
      return;
    }
    const ingredients = form.ingredients
      .map((item) => {
        const itemName = item.name.trim();
        if (!itemName) return null;
        const qty = item.qty != null && Number.isFinite(item.qty) ? item.qty : null;
        const unit = item.unit.trim();
        const amountText = qty != null ? formatPortion(qty, unit) : item.amountText.trim() || "适量";
        return {
          ...item,
          name: itemName,
          qty,
          unit,
          amountText,
          scaleRule: qty == null ? ("fixed" as const) : item.scaleRule,
        };
      })
      .filter((item): item is Ingredient => Boolean(item));
    if (!ingredients.length) {
      pushToast({ title: "至少写一种用料", tone: "error" });
      return;
    }
    const prepItems = form.prepItems
      .map((item) => ({ ...item, content: item.content.trim() }))
      .filter((item) => item.content);
    const steps = form.steps
      .map((item) => ({ ...item, content: item.content.trim() }))
      .filter((item) => item.content);
    if (!steps.length) {
      pushToast({ title: "至少写一个步骤", tone: "error" });
      return;
    }

    const prepTime = form.prepTime || Math.round(prepItems.reduce((sum, item) => sum + item.durationSec, 0) / 60);
    const cookTime = form.cookTime || Math.round(steps.reduce((sum, item) => sum + item.durationSec, 0) / 60);
    const next = syncBase({
      ...form,
      name,
      description: form.description.trim(),
      servings: Math.max(1, Math.round(form.servings || 1)),
      prepTime,
      cookTime,
      tags: splitTags(tagsText),
      ingredients,
      prepItems,
      steps,
      updatedAt: Date.now(),
    });

    setBusy(true);
    try {
      const saved = await saveRecipe(next);
      sessionStorage.removeItem("shiji:draft");
      setDirty(false);
      pushToast({ title: id ? "已保存" : "已创建", tone: "success" });
      navigate(`/recipe/${saved.id}`);
    } catch {
      pushToast({ title: "保存失败，内容还在，请重试", tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <PageHeader title={id ? "编辑菜谱" : "新建菜谱"} />
        <div className="empty">
          <span className="empty-icon">🥄</span>
          <div className="empty-title">正在准备表单…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="page plain">
      <PageHeader title={id ? "编辑菜谱" : "新建菜谱"} onBack={leave} />

      <div className="card">
        <div className="section-head">
          <div className="section-title">基本信息</div>
          <span className="section-note">带 * 为必填</span>
        </div>
        <div className="field">
          <label className="label" htmlFor="recipe-name">菜名 *</label>
          <input
            id="recipe-name"
            className="input"
            value={form.name}
            placeholder="例如：番茄炒蛋"
            onChange={(event) => change((prev) => ({ ...prev, name: event.target.value }))}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="recipe-desc">一句话备注</label>
          <textarea
            id="recipe-desc"
            className="textarea"
            value={form.description}
            placeholder="选填，例如：微辣、下饭、孩子爱吃"
            onChange={(event) => change((prev) => ({ ...prev, description: event.target.value }))}
          />
        </div>
        <div className="grid-3">
          <div className="field">
            <label className="label" htmlFor="recipe-servings">基准人份</label>
            <input
              id="recipe-servings"
              className="input"
              type="number"
              min={1}
              value={form.servings}
              onChange={(event) =>
                change((prev) => ({ ...prev, servings: Math.max(1, Number(event.target.value) || 1) }))
              }
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="recipe-prep">备菜（分钟）</label>
            <input
              id="recipe-prep"
              className="input"
              type="number"
              min={0}
              value={form.prepTime}
              onChange={(event) =>
                change((prev) => ({ ...prev, prepTime: Math.max(0, Number(event.target.value) || 0) }))
              }
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="recipe-cook">烹饪（分钟）</label>
            <input
              id="recipe-cook"
              className="input"
              type="number"
              min={0}
              value={form.cookTime}
              onChange={(event) =>
                change((prev) => ({ ...prev, cookTime: Math.max(0, Number(event.target.value) || 0) }))
              }
            />
          </div>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="label" htmlFor="recipe-tags">标签</label>
          <input
            id="recipe-tags"
            className="input"
            value={tagsText}
            placeholder="逗号分隔，例如：家常，快手，下饭"
            onChange={(event) => {
              setTagsText(event.target.value);
              setDirty(true);
            }}
          />
        </div>
      </div>

      <div className="card section">
        <div className="section-head">
          <div className="section-title">用料</div>
          <span className="section-note">主料 / 辅料 / 调料</span>
        </div>
        {form.ingredients.map((item, index) => (
          <div className="ing-edit" key={item.id}>
            <div className="ing-edit-top">
              <select
                className="ghost-select"
                value={item.group}
                aria-label="用料分组"
                onChange={(event) => updateIngredient(index, { group: event.target.value as IngredientGroup })}
              >
                {(["main", "side", "seasoning"] as IngredientGroup[]).map((group) => (
                  <option key={group} value={group}>{GROUP_META[group].label}</option>
                ))}
              </select>
              <input
                className="input"
                value={item.name}
                placeholder="食材名称"
                onChange={(event) => updateIngredient(index, { name: event.target.value })}
              />
              <button
                className="btn btn-ghost btn-round"
                aria-label="删除这条用料"
                onClick={() => removeIngredient(index)}
              >
                <Trash2 size={15} />
              </button>
            </div>
            <div className="ing-edit-bottom">
              <input
                className="input mini-input"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={item.qty ?? ""}
                placeholder="数值"
                aria-label="用量数值"
                onChange={(event) => {
                  const value = event.target.value === "" ? null : Number(event.target.value);
                  updateIngredient(index, { qty: Number.isFinite(value as number) ? (value as number) : null });
                }}
              />
              <input
                className="input"
                style={{ width: 92 }}
                list="unit-options"
                value={item.unit}
                placeholder="单位"
                aria-label="单位"
                onChange={(event) => updateIngredient(index, { unit: event.target.value })}
              />
              <button
                type="button"
                className={`toggle ${item.isBase ? "on" : ""}`}
                disabled={item.qty == null}
                title={item.qty == null ? "先填数值才能设为主料" : "作为按主料缩放的基准"}
                onClick={() => markBase(index)}
              >
                设为主料
              </button>
              <button
                type="button"
                className={`toggle ${item.scaleRule === "fixed" ? "on" : ""}`}
                onClick={() =>
                  updateIngredient(index, { scaleRule: item.scaleRule === "fixed" ? "linear" : "fixed" })
                }
              >
                不缩放
              </button>
              <button
                type="button"
                className={`toggle ${item.qty == null ? "on" : ""}`}
                onClick={() => toggleTaste(index)}
              >
                适量
              </button>
            </div>
            {item.qty == null ? (
              <input
                className="input"
                style={{ marginTop: 8 }}
                value={item.amountText}
                placeholder="用量文字，例如：适量、少许、半把"
                onChange={(event) => updateIngredient(index, { amountText: event.target.value })}
              />
            ) : (
              <div className="tiny muted" style={{ marginTop: 6 }}>
                显示为 {formatPortion(item.qty, item.unit)}
              </div>
            )}
          </div>
        ))}
        <div className="row wrap" style={{ gap: 8 }}>
          {(["main", "side", "seasoning"] as IngredientGroup[]).map((group) => (
            <button key={group} className="btn btn-sm btn-soft" onClick={() => addIngredient(group)}>
              <Plus size={14} /> {GROUP_META[group].label}
            </button>
          ))}
        </div>
        <div className="tiny muted" style={{ marginTop: 10 }}>
          标「设为主料」的那一项用于按主料缩放；「不缩放」适合焯水、油炸等固定用量。
        </div>
        <datalist id="unit-options">
          {UNIT_OPTIONS.map((unit) => (
            <option key={unit} value={unit} />
          ))}
        </datalist>
      </div>

      <div className="card section">
        <div className="section-head">
          <div className="section-title">备菜</div>
          <span className="section-note">腌、泡、洗、切都可以设计时</span>
        </div>
        {form.prepItems.map((item, index) => (
          <div className="edit-block" key={item.id}>
            <div className="edit-block-head">
              <input
                className="input"
                value={item.content}
                placeholder="例如：腌肉、泡米、番茄切块"
                onChange={(event) => updatePrep(index, { content: event.target.value })}
              />
              <button
                className="btn btn-ghost btn-round"
                aria-label="删除这条备菜"
                onClick={() =>
                  change((prev) => ({
                    ...prev,
                    prepItems: prev.prepItems.filter((_, i) => i !== index),
                  }))
                }
              >
                <Trash2 size={15} />
              </button>
            </div>
            <div className="row wrap" style={{ gap: 8 }}>
              <DurationInput seconds={item.durationSec} onChange={(value) => updatePrep(index, { durationSec: value })} />
              <input
                className="input"
                style={{ width: 104 }}
                value={item.timerTag}
                placeholder="标签，如 腌"
                onChange={(event) => updatePrep(index, { timerTag: event.target.value })}
              />
            </div>
          </div>
        ))}
        <button
          className="btn btn-sm btn-soft"
          onClick={() => change((prev) => ({ ...prev, prepItems: [...prev.prepItems, emptyPrep()] }))}
        >
          <Plus size={14} /> 添加备菜
        </button>
      </div>

      <div className="card section">
        <div className="section-head">
          <div className="section-title">步骤</div>
          <span className="section-note">每一步都可以设计时</span>
        </div>
        {form.steps.map((item, index) => (
          <div className="edit-block" key={item.id}>
            <div className="edit-block-head">
              <span className="step-no">{index + 1}</span>
              <span className="spacer" />
              <button className="btn btn-ghost btn-round" aria-label="上移" disabled={index === 0} onClick={() => moveStep(index, -1)}>
                <ChevronUp size={15} />
              </button>
              <button
                className="btn btn-ghost btn-round"
                aria-label="下移"
                disabled={index === form.steps.length - 1}
                onClick={() => moveStep(index, 1)}
              >
                <ChevronDown size={15} />
              </button>
              <button
                className="btn btn-ghost btn-round"
                aria-label="删除这条步骤"
                onClick={() =>
                  change((prev) => ({
                    ...prev,
                    steps: prev.steps.filter((_, i) => i !== index).length
                      ? prev.steps.filter((_, i) => i !== index)
                      : [emptyStep()],
                  }))
                }
              >
                <Trash2 size={15} />
              </button>
            </div>
            <textarea
              className="textarea"
              value={item.content}
              placeholder="这一步做什么，例如：小火焖 20 分钟"
              onChange={(event) => updateStep(index, { content: event.target.value })}
            />
            <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
              <DurationInput seconds={item.durationSec} onChange={(value) => updateStep(index, { durationSec: value })} />
              <input
                className="input"
                style={{ width: 104 }}
                value={item.timerTag}
                placeholder="标签，如 焖"
                onChange={(event) => updateStep(index, { timerTag: event.target.value })}
              />
            </div>
          </div>
        ))}
        <button
          className="btn btn-sm btn-soft"
          onClick={() => change((prev) => ({ ...prev, steps: [...prev.steps, emptyStep()] }))}
        >
          <Plus size={14} /> 添加步骤
        </button>
      </div>

      <div className="save-bar">
        <button className="btn btn-primary btn-lg btn-block" onClick={save} disabled={busy}>
          <Save size={18} /> {busy ? "保存中…" : "保存菜谱"}
        </button>
      </div>
    </div>
  );
}
