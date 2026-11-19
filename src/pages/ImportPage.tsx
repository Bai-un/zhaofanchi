import { useState } from "react";
import { ChevronRight, Sparkles, Upload } from "lucide-react";
import type { ParsedRecipe, Recipe } from "../types";
import { GROUP_META } from "../types";
import { parseRecipeText } from "../lib/parse";
import { createEmptyRecipe, formatDuration, syncBase } from "../lib/recipe";
import { formatPortion } from "../lib/scale";
import { newId } from "../lib/uuid";
import { navigate } from "../lib/router";
import { PageHeader } from "../components/PageHeader";

const SAMPLE = `🔥番茄炒蛋｜10分钟快手菜 #家常菜# #下饭#
2人份
食材：
番茄 2个
鸡蛋 3个
小葱 1根
盐 2g
白糖 3g
做法：
1. 番茄切块，鸡蛋打散
2. 热锅倒油，炒熟鸡蛋盛出
3. 下番茄翻炒出汁
4. 倒回鸡蛋，加盐和糖调味，撒葱花出锅`;

function parsedToRecipe(parsed: ParsedRecipe): Recipe {
  const ingredients = parsed.ingredients.map((item) => ({
    ...item,
    id: newId(),
    isBase: false,
  }));
  const baseIngredient =
    ingredients.find((item) => item.group === "main" && item.qty != null) ||
    ingredients.find((item) => item.qty != null);
  ingredients.forEach((item) => {
    item.isBase = Boolean(baseIngredient && item.id === baseIngredient.id);
  });
  const base = createEmptyRecipe();
  return syncBase({
    ...base,
    name: parsed.name,
    description: parsed.description,
    servings: parsed.servings,
    prepTime: parsed.prepTime,
    cookTime: parsed.cookTime,
    tags: parsed.tags,
    base: baseIngredient
      ? { ingredientId: baseIngredient.id, qty: baseIngredient.qty, unit: baseIngredient.unit }
      : { ingredientId: null, qty: null, unit: "" },
    ingredients,
    prepItems: parsed.prepItems.map((item) => ({ ...item, id: newId() })),
    steps: parsed.steps.map((item) => ({ ...item, id: newId() })),
    notes: [],
  });
}

export function ImportPage() {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedRecipe | null>(null);
  const [error, setError] = useState("");

  const runParse = () => {
    if (!text.trim()) {
      setError("先粘贴一段菜谱文字");
      setParsed(null);
      return;
    }
    try {
      const result = parseRecipeText(text);
      setParsed(result);
      setError("");
    } catch {
      setError("解析失败，请检查文本后重试");
      setParsed(null);
    }
  };

  const goEdit = () => {
    if (!parsed) return;
    const recipe = parsedToRecipe(parsed);
    sessionStorage.setItem("shiji:draft", JSON.stringify(recipe));
    navigate("/editor/new?draft=1");
  };

  return (
    <div className="page plain">
      <PageHeader title="粘贴导入" backTo="/" />

      <div className="banner">
        <Upload size={17} style={{ flex: "0 0 auto", marginTop: 2 }} />
        <div>
          从抖音、小红书或菜谱网站复制文案，粘贴到这里。解析全部在本机完成，不会上传。
        </div>
      </div>

      <div className="card section">
        <div className="section-head">
          <div className="section-title">菜谱文字</div>
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => {
              setText(SAMPLE);
              setParsed(null);
              setError("");
            }}
          >
            <Sparkles size={14} /> 填入示例
          </button>
        </div>
        <textarea
          className="textarea"
          style={{ minHeight: 220 }}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={`粘贴示例：\n\n番茄炒蛋\n2人份\n用料：\n番茄 2个\n鸡蛋 3个\n盐 2g\n做法：\n1. 番茄切块\n2. 鸡蛋打散\n3. 炒5分钟`}
        />
        {error ? <div className="banner warn" style={{ marginTop: 10 }}>{error}</div> : null}
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={runParse}>
            解析文字
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              setText("");
              setParsed(null);
              setError("");
            }}
          >
            清空
          </button>
        </div>
      </div>

      {parsed ? (
        <div className="card section">
          <div className="section-head">
            <div className="section-title">解析结果</div>
            <span className="section-note">
              {parsed.ingredients.length} 种用料 · {parsed.steps.length} 步
            </span>
          </div>

          <div className="hstack" style={{ alignItems: "baseline", gap: 8 }}>
            <h3 style={{ fontSize: "calc(20px * var(--site-type))", fontWeight: 800 }}>
              {parsed.name || "未命名菜谱"}
            </h3>
            <span className="badge">{parsed.servings} 人份</span>
          </div>
          {parsed.description ? <div className="muted small" style={{ marginTop: 4 }}>{parsed.description}</div> : null}
          {parsed.tags.length ? (
            <div className="recipe-tags">
              {parsed.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}
            </div>
          ) : null}

          {parsed.warnings.length ? (
            <div className="banner warn" style={{ marginTop: 12 }}>
              <ul>
                {parsed.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </div>
          ) : null}

          <div className="ing-group">
            <div className="ing-group-head">用料预览</div>
            {(["main", "side", "seasoning"] as const).map((group) => {
              const items = parsed.ingredients.filter((item) => item.group === group);
              if (!items.length) return null;
              return (
                <div key={group}>
                  <div className="tiny muted" style={{ marginTop: 8 }}>{GROUP_META[group].label}</div>
                  {items.map((item, index) => (
                    <div className="ing-row" key={`${group}-${index}`}>
                      <span className="ing-name">{item.name}</span>
                      <span className="ing-amount">
                        {item.qty != null ? formatPortion(item.qty, item.unit) : item.amountText || "适量"}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {parsed.prepItems.length ? (
            <div className="section" style={{ marginTop: 14 }}>
              <div className="ing-group-head">备菜预览</div>
              {parsed.prepItems.map((item, index) => (
                <div className="step-row" key={`prep-${index}`}>
                  <div className="step-no">备</div>
                  <div className="step-body">
                    <div className="step-text">{item.content}</div>
                    {item.durationSec ? <div className="step-dur">{formatDuration(item.durationSec)}</div> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="section" style={{ marginTop: 14 }}>
            <div className="ing-group-head">步骤预览</div>
            {parsed.steps.map((item, index) => (
              <div className="step-row" key={`step-${index}`}>
                <div className="step-no">{index + 1}</div>
                <div className="step-body">
                  <div className="step-text">{item.content}</div>
                  {item.durationSec ? (
                    <div className="step-dur">
                      {item.timerTag ? `${item.timerTag} · ` : ""}
                      {formatDuration(item.durationSec)}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          <button className="btn btn-primary btn-lg btn-block" style={{ marginTop: 16 }} onClick={goEdit}>
            去编辑并保存 <ChevronRight size={18} />
          </button>
          <div className="tiny muted center" style={{ marginTop: 8 }}>
            解析结果只是初稿，保存前可以改菜名、分组、用量和步骤。
          </div>
        </div>
      ) : null}

      {!parsed && text && !error ? (
        <div className="center tiny muted section" style={{ marginTop: 18 }}>
          粘好后点上面的「解析文字」
        </div>
      ) : null}

      {!text && !parsed ? (
        <div className="card section">
          <div className="section-title" style={{ marginBottom: 8 }}>能识别什么</div>
          <ul className="small muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
            <li>菜名、几人份、标签话题</li>
            <li>用料名称、数值和单位（g、ml、个、勺等）</li>
            <li>步骤编号、煮/炖/焖等时长</li>
            <li>「适量、少许」会保留为不缩放</li>
          </ul>
          <div className="tiny muted" style={{ marginTop: 10 }}>
            识别不准也没关系，下一步可以手动改。
          </div>
        </div>
      ) : null}
    </div>
  );
}
