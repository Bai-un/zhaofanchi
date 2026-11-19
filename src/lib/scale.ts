import type { Ingredient, Recipe, ScaleTarget } from "../types.ts";

export const UNIT_OPTIONS = [
  "g",
  "kg",
  "ml",
  "l",
  "个",
  "只",
  "根",
  "片",
  "瓣",
  "颗",
  "条",
  "块",
  "把",
  "勺",
  "茶匙",
  "汤匙",
  "碗",
  "杯",
  "斤",
  "两",
];

const ALIASES: Record<string, string> = {
  克: "g",
  千克: "kg",
  公斤: "kg",
  毫升: "ml",
  公升: "l",
  升: "l",
  斤: "斤",
  两: "两",
  个: "个",
  只: "只",
  根: "根",
  片: "片",
  瓣: "瓣",
  颗: "颗",
  条: "条",
  块: "块",
  张: "张",
  枚: "枚",
  朵: "朵",
  把: "把",
  勺: "勺",
  汤匙: "勺",
  大勺: "勺",
  茶匙: "茶匙",
  小勺: "茶匙",
  碗: "碗",
  杯: "杯",
  撮: "撮",
};

const WEIGHT_UNITS = new Set(["g", "kg", "斤", "两"]);
const VOLUME_UNITS = new Set(["ml", "l"]);
const COUNT_UNITS = new Set(["个", "只", "根", "片", "瓣", "颗", "条", "块", "张", "枚", "朵"]);
const APPROX_UNITS = new Set(["勺", "茶匙", "碗", "杯", "撮", "把"]);

export type UnitKind = "weight" | "volume" | "count" | "approx" | "other";

export function normalizeUnit(unit: string): string {
  const trimmed = (unit || "").trim();
  return ALIASES[trimmed] || trimmed;
}

export function unitKind(unit: string): UnitKind {
  const u = normalizeUnit(unit);
  if (WEIGHT_UNITS.has(u)) return "weight";
  if (VOLUME_UNITS.has(u)) return "volume";
  if (COUNT_UNITS.has(u)) return "count";
  if (APPROX_UNITS.has(u)) return "approx";
  return "other";
}

export function roundSmart(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value >= 100) return Math.round(value / 5) * 5;
  if (value >= 10) return Math.round(value);
  if (value >= 1) return Math.round(value * 10) / 10;
  return Math.round(value * 100) / 100;
}

export function formatNumber(value: number): string {
  const rounded = roundSmart(value);
  return String(Number(rounded.toFixed(2)));
}

export function formatPortion(qty: number, unit: string): string {
  const kind = unitKind(unit);
  if (kind === "count") {
    const ceil = Math.ceil(qty - 1e-9);
    const prefix = Math.abs(qty - ceil) > 0.05 ? "约" : "";
    return `${prefix}${ceil}${unit}`;
  }
  if (kind === "weight" && unit === "g" && qty >= 1000) {
    return `${formatNumber(qty / 1000)}kg`;
  }
  if (kind === "volume" && unit === "ml" && qty >= 1000) {
    return `${formatNumber(qty / 1000)}l`;
  }
  if (!unit) return formatNumber(qty);
  return `${formatNumber(qty)}${unit}`;
}

const CJK_NUMBERS: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

function toNumber(raw: string): number | null {
  if (!raw) return null;
  if (/^\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  if (/^\d+\/\d+$/.test(raw)) {
    const [a, b] = raw.split("/").map(Number);
    return b ? a / b : null;
  }
  return null;
}

/**
 * 把 "200g"、"1.5勺"、"2-3个"、"半个"、"适量" 拆成数值 + 单位。
 * 拆不出数值时 qty=null，原文保留在 amountText。
 */
export function parseAmount(input: string): { qty: number | null; unit: string; amountText: string } {
  const amountText = (input || "").trim();
  const s = amountText
    .normalize("NFKC")
    .replace(/[½]/g, "0.5")
    .replace(/[¼]/g, "0.25")
    .replace(/[¾]/g, "0.75")
    .replace(/\s+/g, " ")
    .replace(/^(约|大约|大概)\s*/, "")
    .replace(/\s*(左右|上下)$/, "")
    .trim();

  if (!s || /^(适量|少许|少量|若干|按需|酌情|随意)$/.test(s)) {
    return { qty: null, unit: "", amountText };
  }

  let rest = s;
  let qty: number | null = null;
  let leadingUnit = "";

  const half = rest.match(/^半(个|只|根|片|瓣|颗|条|块|张|枚|朵|勺|茶匙|碗|杯|撮)?/);
  if (half) {
    qty = 0.5;
    leadingUnit = half[1] || "";
    rest = rest.slice(half[0].length);
  } else {
    const cjk = rest.match(/^(一|二|两|三|四|五|六|七|八|九|十)(个|只|根|片|瓣|颗|条|块|张|枚|朵|勺|茶匙|碗|杯|撮)?/);
    if (cjk) {
      qty = CJK_NUMBERS[cjk[1]] ?? null;
      leadingUnit = cjk[2] || "";
      rest = rest.slice(cjk[0].length);
    }
  }

  if (qty == null) {
    const range = rest.match(/^(\d+\/\d+|\d+(?:\.\d+)?)\s*(?:[-~至到]\s*(\d+\/\d+|\d+(?:\.\d+)?))?/);
    if (range) {
      const first = toNumber(range[1]);
      const second = range[2] ? toNumber(range[2]) : null;
      if (first != null && second != null) qty = (first + second) / 2;
      else qty = first;
      rest = rest.slice(range[0].length);
    }
  }

  if (qty == null) return { qty: null, unit: "", amountText };

  const unitMatch = rest.match(/^([^\d\s,，。;；:：()（）\[\]【】]*)/);
  let unit = leadingUnit || (unitMatch?.[1] || "").trim();
  if (unit.length > 3) unit = "";
  unit = normalizeUnit(unit);

  return { qty, unit, amountText };
}

export function scaledAmount(ing: Ingredient, ratio: number): string {
  if (ing.scaleRule === "fixed" || ing.qty == null) {
    return ing.amountText || "适量";
  }
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return ing.amountText || formatPortion(ing.qty, ing.unit);
  }
  return formatPortion(ing.qty * ratio, ing.unit);
}

export function computeRatio(recipe: Recipe, target: ScaleTarget): number {
  let ratio = 1;
  if (target.mode === "servings") {
    ratio = target.value / (recipe.servings || 1);
  } else if (recipe.base.qty && recipe.base.qty > 0) {
    ratio = target.value / recipe.base.qty;
  }
  if (!Number.isFinite(ratio) || ratio <= 0) return 1;
  return Math.min(10, Math.max(0.1, ratio));
}

export function ratioLabel(ratio: number): string {
  if (!Number.isFinite(ratio)) return "×1";
  const rounded = Math.round(ratio * 100) / 100;
  return `×${String(rounded)}`;
}

export function findBaseIngredient(recipe: Recipe): Ingredient | undefined {
  return (
    recipe.ingredients.find((i) => i.id === recipe.base.ingredientId) ||
    recipe.ingredients.find((i) => i.isBase) ||
    recipe.ingredients.find((i) => i.group === "main" && i.qty != null)
  );
}

export function describeUnit(unit: string): string {
  const kind = unitKind(unit);
  if (kind === "weight" || kind === "volume") return "称重/容量";
  if (kind === "count") return "按个数";
  return "近似单位";
}
