import type { Ingredient, IngredientGroup, Recipe } from "../types.ts";
import { normalizeRecipe, syncBase } from "./recipe.ts";
import { parseAmount } from "./scale.ts";
import { newId } from "./uuid.ts";

const SEASONING_RE =
  /(盐|糖|酱油|生抽|老抽|蚝油|料酒|黄酒|醋|胡椒|花椒|辣椒粉|淀粉|生粉|鸡精|味精|豆瓣酱|甜面酱|香油|食用油|橄榄油|五香粉|孜然|咖喱|蜂蜜|芝麻|辣椒油|八角|桂皮|香叶|干辣椒|豆豉|腐乳|鱼露|椒盐|十三香)/;
const MAIN_RE =
  /(米|饭|面|粉|肉|牛|猪|羊|鸡|鸭|鱼|虾|蟹|蛋|豆腐|土豆|排骨|鸡翅|鸡腿|培根|香肠|青菜|白菜|菠菜|西兰花|番茄|西红柿|茄子|黄瓜|胡萝卜|玉米|青椒|洋葱|南瓜|冬瓜|莲藕|豆角|蘑菇|香菇)/;

interface LegacyIngredient {
  id?: string;
  recipe_id?: string;
  name?: string;
  amount?: string;
  sort?: number;
}

interface LegacyPrep {
  id?: string;
  recipe_id?: string;
  content?: string;
  sort?: number;
}

interface LegacyStep {
  id?: string;
  recipe_id?: string;
  content?: string;
  duration?: number;
  sort?: number;
}

interface LegacyNote {
  id?: string;
  recipe_id?: string;
  content?: string;
  created_at?: number;
}

interface LegacyRecipe {
  id?: string;
  name?: string;
  description?: string;
  servings?: number;
  prep_time?: number;
  cook_time?: number;
  tags?: string;
  is_pinned?: number;
  created_at?: number;
  updated_at?: number;
}

export interface ConvertedBackup {
  recipes: Recipe[];
  warnings: string[];
  version: number;
}

function inferGroup(name: string): IngredientGroup {
  if (SEASONING_RE.test(name)) return "seasoning";
  if (MAIN_RE.test(name)) return "main";
  return "side";
}

function legacyToRecipe(
  recipe: LegacyRecipe,
  ingredients: LegacyIngredient[],
  prepItems: LegacyPrep[],
  steps: LegacyStep[],
  notes: LegacyNote[],
): Recipe {
  const id = recipe.id || newId();
  const mappedIngredients: Ingredient[] = ingredients
    .slice()
    .sort((a, b) => (a.sort || 0) - (b.sort || 0))
    .map((item, index) => {
      const name = (item.name || "").trim();
      const parsed = parseAmount(item.amount || "");
      const group = inferGroup(name);
      return {
        id: item.id || newId(),
        name,
        group: group === "main" && index > 1 ? "side" : group,
        qty: parsed.qty,
        unit: parsed.unit,
        scaleRule: (parsed.qty == null ? "fixed" : "linear") as "fixed" | "linear",
        isBase: false,
        amountText: parsed.amountText || "适量",
      };
    })
    .filter((item) => item.name);

  const base = mappedIngredients.find((i) => i.group === "main" && i.qty != null) || mappedIngredients.find((i) => i.qty != null);

  return syncBase({
    id,
    name: (recipe.name || "未命名菜谱").trim(),
    description: recipe.description || "",
    servings: Math.max(1, Math.round(recipe.servings || 2)),
    prepTime: Math.max(0, Math.round(recipe.prep_time || 0)),
    cookTime: Math.max(0, Math.round(recipe.cook_time || 0)),
    tags: (() => {
      try {
        const parsed = JSON.parse(recipe.tags || "[]");
        return Array.isArray(parsed) ? parsed.map(String) : [];
      } catch {
        return [];
      }
    })(),
    isPinned: Boolean(recipe.is_pinned),
    createdAt: recipe.created_at || Date.now(),
    updatedAt: recipe.updated_at || recipe.created_at || Date.now(),
    base: base
      ? { ingredientId: base.id, qty: base.qty, unit: base.unit }
      : { ingredientId: null, qty: null, unit: "" },
    ingredients: mappedIngredients,
    prepItems: prepItems
      .slice()
      .sort((a, b) => (a.sort || 0) - (b.sort || 0))
      .map((p) => ({
        id: p.id || newId(),
        content: (p.content || "").trim(),
        durationSec: 0,
        timerTag: "",
      }))
      .filter((p) => p.content),
    steps: steps
      .slice()
      .sort((a, b) => (a.sort || 0) - (b.sort || 0))
      .map((s) => ({
        id: s.id || newId(),
        content: (s.content || "").trim(),
        durationSec: Math.max(0, Math.round((s.duration || 0) * 60)),
        timerTag: "",
      }))
      .filter((s) => s.content),
    notes: notes
      .slice()
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
      .map((n) => ({
        id: n.id || newId(),
        content: (n.content || "").trim(),
        createdAt: n.created_at || Date.now(),
      }))
      .filter((n) => n.content),
  } satisfies Recipe);
}

/**
 * 兼容两种输入：
 * 1. 旧「食记」v1 备份：顶层 recipes + ingredients/prepItems/steps/notes（带 recipe_id）
 * 2. 新格式：每条 recipe 内嵌 ingredients/prepItems/steps/notes
 */
export function convertBackup(raw: unknown): ConvertedBackup {
  const warnings: string[] = [];
  if (!raw || typeof raw !== "object") {
    throw new Error("备份文件不是有效的 JSON 对象");
  }
  const data = raw as Record<string, unknown>;
  const recipesRaw = Array.isArray(data.recipes) ? (data.recipes as Record<string, unknown>[]) : null;
  if (!recipesRaw) {
    throw new Error("备份文件里没有找到 recipes");
  }

  const version = typeof data.version === "number" ? data.version : 1;

  // 新格式：recipe 内部已经有 ingredients 数组
  if (recipesRaw.some((r) => Array.isArray(r.ingredients))) {
    const recipes = recipesRaw.map((r) => normalizeRecipe(r));
    return { recipes, warnings, version };
  }

  // 旧格式：顶层子表按 recipe_id 关联
  const ingredients = Array.isArray(data.ingredients) ? (data.ingredients as LegacyIngredient[]) : [];
  const prepItems = Array.isArray(data.prepItems)
    ? (data.prepItems as LegacyPrep[])
    : Array.isArray(data.prep_items)
      ? (data.prep_items as LegacyPrep[])
      : [];
  const steps = Array.isArray(data.steps) ? (data.steps as LegacyStep[]) : [];
  const notes = Array.isArray(data.notes) ? (data.notes as LegacyNote[]) : [];

  const recipes = recipesRaw.map((r) => {
    const legacy = r as LegacyRecipe;
    const recipeId = legacy.id;
    const ownIngredients = ingredients.filter((i) => i.recipe_id === recipeId);
    const ownPrep = prepItems.filter((p) => p.recipe_id === recipeId);
    const ownSteps = steps.filter((s) => s.recipe_id === recipeId);
    const ownNotes = notes.filter((n) => n.recipe_id === recipeId);
    return legacyToRecipe(legacy, ownIngredients, ownPrep, ownSteps, ownNotes);
  });

  const unpacked = recipes.filter((r) =>
    r.ingredients.some((i) => i.qty == null && Boolean(i.amountText) && !/^适量|少许|少量|若干|按需$/.test(i.amountText)),
  );
  if (unpacked.length) {
    warnings.push("部分旧用量文本没能拆成数字+单位，已保留原文，可在编辑页修正");
  }
  return { recipes, warnings, version };
}
