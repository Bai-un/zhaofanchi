import test from "node:test";
import assert from "node:assert/strict";
import {
  computeRatio,
  formatPortion,
  parseAmount,
  ratioLabel,
  scaledAmount,
} from "../src/lib/scale.ts";
import type { Ingredient, Recipe } from "../src/types.ts";

function ingredient(partial: Partial<Ingredient>): Ingredient {
  return {
    id: "i1",
    name: "米",
    group: "main",
    qty: 200,
    unit: "g",
    scaleRule: "linear",
    isBase: true,
    amountText: "200g",
    ...partial,
  };
}

function recipe(partial: Partial<Recipe> = {}): Recipe {
  return {
    id: "r1",
    name: "米饭",
    description: "",
    servings: 2,
    prepTime: 0,
    cookTime: 0,
    tags: [],
    isPinned: false,
    createdAt: 0,
    updatedAt: 0,
    base: { ingredientId: "i1", qty: 200, unit: "g" },
    ingredients: [ingredient({})],
    prepItems: [],
    steps: [],
    notes: [],
    ...partial,
  };
}

test("parseAmount 拆分常见用量", () => {
  assert.deepEqual(parseAmount("200g"), { qty: 200, unit: "g", amountText: "200g" });
  assert.deepEqual(parseAmount("1.5勺"), { qty: 1.5, unit: "勺", amountText: "1.5勺" });
  assert.deepEqual(parseAmount("2-3个"), { qty: 2.5, unit: "个", amountText: "2-3个" });
  assert.deepEqual(parseAmount("半个"), { qty: 0.5, unit: "个", amountText: "半个" });
  assert.deepEqual(parseAmount("300毫升"), { qty: 300, unit: "ml", amountText: "300毫升" });
  assert.deepEqual(parseAmount("1/2个"), { qty: 0.5, unit: "个", amountText: "1/2个" });
  assert.equal(parseAmount("适量").qty, null);
  assert.equal(parseAmount("少许").qty, null);
});

test("按主料等比缩放：米 200g -> 300g", () => {
  const r = recipe();
  const ratio = computeRatio(r, { mode: "base", value: 300 });
  assert.equal(ratio, 1.5);
  assert.equal(ratioLabel(ratio), "×1.5");
  assert.equal(scaledAmount(r.ingredients[0], ratio), "300g");
});

test("按人份缩放：2 人份 -> 4 人份", () => {
  const r = recipe();
  const ratio = computeRatio(r, { mode: "servings", value: 4 });
  assert.equal(ratio, 2);
  assert.equal(scaledAmount(ingredient({ qty: 200, unit: "ml" }), ratio), "400ml");
});

test("固定用量不缩放，适量保持原文", () => {
  assert.equal(scaledAmount(ingredient({ scaleRule: "fixed", amountText: "200g" }), 2), "200g");
  assert.equal(
    scaledAmount(ingredient({ qty: null, amountText: "适量" }), 2),
    "适量",
  );
});

test("单位与取整规则", () => {
  assert.equal(formatPortion(1000, "g"), "1kg");
  assert.equal(formatPortion(1500, "ml"), "1.5l");
  assert.equal(formatPortion(3, "个"), "3个");
  assert.equal(formatPortion(2.5, "个"), "约3个");
  assert.equal(formatPortion(1.5, "斤"), "1.5斤");
  assert.equal(formatPortion(305, "g"), "305g");
  assert.equal(formatPortion(0.25, "勺"), "0.25勺");
});

test("比例限制在 0.1 - 10", () => {
  assert.equal(computeRatio(recipe(), { mode: "servings", value: 100 }), 10);
  assert.equal(computeRatio(recipe(), { mode: "servings", value: 0.01 }), 0.1);
});
