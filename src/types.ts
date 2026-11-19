export type IngredientGroup = "main" | "side" | "seasoning";
export type ScaleRule = "linear" | "fixed";

export interface Ingredient {
  id: string;
  name: string;
  group: IngredientGroup;
  qty: number | null;
  unit: string;
  scaleRule: ScaleRule;
  isBase: boolean;
  amountText: string;
}

export interface PrepItem {
  id: string;
  content: string;
  durationSec: number;
  timerTag: string;
}

export interface Step {
  id: string;
  content: string;
  durationSec: number;
  timerTag: string;
}

export interface Note {
  id: string;
  content: string;
  createdAt: number;
}

export interface BaseRef {
  ingredientId: string | null;
  qty: number | null;
  unit: string;
}

export interface Recipe {
  id: string;
  name: string;
  description: string;
  servings: number;
  prepTime: number;
  cookTime: number;
  tags: string[];
  isPinned: boolean;
  createdAt: number;
  updatedAt: number;
  base: BaseRef;
  ingredients: Ingredient[];
  prepItems: PrepItem[];
  steps: Step[];
  notes: Note[];
}

export interface ParsedRecipe {
  name: string;
  description: string;
  servings: number;
  prepTime: number;
  cookTime: number;
  tags: string[];
  ingredients: Omit<Ingredient, "id" | "isBase">[];
  prepItems: Omit<PrepItem, "id">[];
  steps: Omit<Step, "id">[];
  warnings: string[];
}

export interface ScaleTarget {
  mode: "servings" | "base";
  value: number;
}

export const GROUP_META: Record<IngredientGroup, { label: string; short: string }> = {
  main: { label: "主料", short: "主" },
  side: { label: "辅料", short: "辅" },
  seasoning: { label: "调料", short: "调" },
};
