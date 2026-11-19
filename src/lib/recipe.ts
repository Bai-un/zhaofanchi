import type { Ingredient, IngredientGroup, Note, PrepItem, Recipe, Step } from "../types.ts";
import { newId } from "./uuid.ts";
import { formatPortion, scaledAmount } from "./scale.ts";
import { formatClock, formatDuration, formatMinutes } from "./time.ts";

export { formatClock, formatDuration, formatMinutes } from "./time.ts";

export const GROUP_ORDER: IngredientGroup[] = ["main", "side", "seasoning"];

export function emptyIngredient(group: IngredientGroup = "main"): Ingredient {
  return {
    id: newId(),
    name: "",
    group,
    qty: null,
    unit: "",
    scaleRule: "linear",
    isBase: false,
    amountText: "",
  };
}

export function emptyPrep(): PrepItem {
  return { id: newId(), content: "", durationSec: 0, timerTag: "" };
}

export function emptyStep(): Step {
  return { id: newId(), content: "", durationSec: 0, timerTag: "" };
}

export function createEmptyRecipe(): Recipe {
  const now = Date.now();
  return {
    id: newId(),
    name: "",
    description: "",
    servings: 2,
    prepTime: 0,
    cookTime: 0,
    tags: [],
    isPinned: false,
    createdAt: now,
    updatedAt: now,
    base: { ingredientId: null, qty: null, unit: "" },
    ingredients: [emptyIngredient("main"), emptyIngredient("side"), emptyIngredient("seasoning")],
    prepItems: [emptyPrep()],
    steps: [emptyStep()],
    notes: [],
  };
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function parseTagList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((x) => String(x).trim().replace(/^#+|#+$/g, ""))
          .filter(Boolean),
      ),
    );
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parseTagList(parsed);
    } catch {
      /* 普通文本 */
    }
    return Array.from(
      new Set(
        value
          .split(/[,，、\s]+/)
          .map((x) => x.trim().replace(/^#+|#+$/g, ""))
          .filter(Boolean),
      ),
    );
  }
  return [];
}

function normalizeGroup(value: unknown): IngredientGroup {
  return value === "side" || value === "seasoning" ? value : "main";
}

function normalizeIngredient(raw: Partial<Ingredient> | Record<string, unknown>): Ingredient {
  const item = raw as Partial<Ingredient> & { amount?: string };
  const qty = toNumber(item.qty);
  const unit = typeof item.unit === "string" ? item.unit : "";
  return {
    id: typeof item.id === "string" && item.id ? item.id : newId(),
    name: typeof item.name === "string" ? item.name : "",
    group: normalizeGroup(item.group),
    qty,
    unit,
    scaleRule: item.scaleRule === "fixed" ? "fixed" : "linear",
    isBase: Boolean(item.isBase),
    amountText:
      typeof item.amountText === "string" && item.amountText
        ? item.amountText
        : qty != null
          ? formatPortion(qty, unit)
          : typeof item.amount === "string"
            ? item.amount
            : "",
  };
}

function normalizePrep(raw: Partial<PrepItem> | Record<string, unknown>): PrepItem {
  const item = raw as Partial<PrepItem> & { duration?: number };
  const sec =
    toNumber(item.durationSec) ??
    (toNumber(item.duration) != null ? (toNumber(item.duration) as number) * 60 : 0);
  return {
    id: typeof item.id === "string" && item.id ? item.id : newId(),
    content: typeof item.content === "string" ? item.content : "",
    durationSec: Math.max(0, Math.round(sec)),
    timerTag: typeof item.timerTag === "string" ? item.timerTag : "",
  };
}

function normalizeStep(raw: Partial<Step> | Record<string, unknown>): Step {
  const item = raw as Partial<Step> & { duration?: number };
  const sec =
    toNumber(item.durationSec) ??
    (toNumber(item.duration) != null ? (toNumber(item.duration) as number) * 60 : 0);
  return {
    id: typeof item.id === "string" && item.id ? item.id : newId(),
    content: typeof item.content === "string" ? item.content : "",
    durationSec: Math.max(0, Math.round(sec)),
    timerTag: typeof item.timerTag === "string" ? item.timerTag : "",
  };
}

function normalizeNote(raw: Partial<Note> | Record<string, unknown>): Note {
  const item = raw as Partial<Note>;
  return {
    id: typeof item.id === "string" && item.id ? item.id : newId(),
    content: typeof item.content === "string" ? item.content : "",
    createdAt: toNumber(item.createdAt) ?? Date.now(),
  };
}

export function normalizeRecipe(raw: Partial<Recipe> | Record<string, unknown>): Recipe {
  const item = raw as Partial<Recipe> & {
    prep_time?: number;
    cook_time?: number;
    is_pinned?: number | boolean;
    created_at?: number;
    updated_at?: number;
  };
  const ingredients = Array.isArray(item.ingredients) ? item.ingredients.map(normalizeIngredient) : [];
  const prepItems = Array.isArray(item.prepItems) ? item.prepItems.map(normalizePrep) : [];
  const steps = Array.isArray(item.steps) ? item.steps.map(normalizeStep) : [];
  const notes = Array.isArray(item.notes) ? item.notes.map(normalizeNote) : [];
  const baseRaw = (item.base || {}) as Partial<Recipe["base"]>;
  const createdAt = toNumber(item.createdAt) ?? toNumber(item.created_at) ?? Date.now();
  const updatedAt = toNumber(item.updatedAt) ?? toNumber(item.updated_at) ?? createdAt;

  const recipe: Recipe = {
    id: typeof item.id === "string" && item.id ? item.id : newId(),
    name: typeof item.name === "string" ? item.name : "",
    description: typeof item.description === "string" ? item.description : "",
    servings: Math.max(1, Math.round(toNumber(item.servings) ?? 2)),
    prepTime: Math.max(0, Math.round(toNumber(item.prepTime) ?? toNumber(item.prep_time) ?? 0)),
    cookTime: Math.max(0, Math.round(toNumber(item.cookTime) ?? toNumber(item.cook_time) ?? 0)),
    tags: parseTagList(item.tags),
    isPinned: Boolean(item.isPinned ?? item.is_pinned),
    createdAt,
    updatedAt,
    base: {
      ingredientId: typeof baseRaw.ingredientId === "string" ? baseRaw.ingredientId : null,
      qty: toNumber(baseRaw.qty),
      unit: typeof baseRaw.unit === "string" ? baseRaw.unit : "",
    },
    ingredients,
    prepItems,
    steps,
    notes,
  };
  return syncBase(recipe);
}

/** 保证只有一个主料基准，并把基准同步到 recipe.base。 */
export function syncBase(recipe: Recipe): Recipe {
  const preferred =
    recipe.ingredients.find((i) => i.id === recipe.base.ingredientId && i.qty != null) ||
    recipe.ingredients.find((i) => i.isBase && i.qty != null) ||
    recipe.ingredients.find((i) => i.group === "main" && i.qty != null) ||
    recipe.ingredients.find((i) => i.qty != null);
  recipe.ingredients.forEach((i) => {
    i.isBase = preferred ? i.id === preferred.id : false;
  });
  recipe.base = preferred
    ? { ingredientId: preferred.id, qty: preferred.qty, unit: preferred.unit }
    : { ingredientId: null, qty: null, unit: "" };
  return recipe;
}

export function totalMinutes(recipe: Recipe): number {
  return (recipe.prepTime || 0) + (recipe.cookTime || 0);
}

export function groupIngredients(recipe: Recipe): { group: IngredientGroup; items: Ingredient[] }[] {
  return GROUP_ORDER.map((group) => ({
    group,
    items: recipe.ingredients.filter((i) => i.group === group),
  })).filter((g) => g.items.length > 0);
}

export function recipeToText(recipe: Recipe, ratio = 1, targetLabel = ""): string {
  const lines: string[] = [`【${recipe.name || "未命名菜谱"}】`];
  if (recipe.description) lines.push(recipe.description);
  const meta: string[] = [`${recipe.servings}人份`];
  if (recipe.prepTime) meta.push(`备菜${formatMinutes(recipe.prepTime)}`);
  if (recipe.cookTime) meta.push(`烹饪${formatMinutes(recipe.cookTime)}`);
  const total = totalMinutes(recipe);
  if (total) meta.push(`共${formatMinutes(total)}`);
  if (ratio !== 1 && targetLabel) meta.push(targetLabel);
  lines.push(meta.join(" · "));
  if (recipe.tags.length) lines.push(`标签：${recipe.tags.join("、")}`);

  for (const { group, items } of groupIngredients(recipe)) {
    lines.push("");
    lines.push(`${group === "main" ? "主料" : group === "side" ? "辅料" : "调料"}：`);
    items.forEach((i) => lines.push(`· ${i.name} ${scaledAmount(i, ratio)}`));
  }
  if (recipe.prepItems.length) {
    lines.push("");
    lines.push("备菜：");
    recipe.prepItems.forEach((p, idx) => {
      const dur = p.durationSec ? `（${formatDuration(p.durationSec)}）` : "";
      lines.push(`${idx + 1}. ${p.content}${dur}`);
    });
  }
  if (recipe.steps.length) {
    lines.push("");
    lines.push("步骤：");
    recipe.steps.forEach((s, idx) => {
      const dur = s.durationSec ? `（${formatDuration(s.durationSec)}）` : "";
      lines.push(`${idx + 1}. ${s.content}${dur}`);
    });
  }
  lines.push("");
  lines.push("—— 来自「找饭吃」");
  return lines.join("\n");
}

export function splitTags(text: string): string[] {
  return parseTagList(text);
}
