import test from "node:test";
import assert from "node:assert/strict";
import { convertBackup } from "../src/lib/legacy.ts";

test("转换旧食记 v1 备份", () => {
  const backup = {
    app: "食记",
    version: 1,
    recipes: [
      {
        id: "r1",
        name: "番茄炒蛋",
        description: "家常",
        servings: 2,
        prep_time: 5,
        cook_time: 10,
        tags: '["家常"]',
        is_pinned: 0,
        created_at: 1000,
        updated_at: 2000,
      },
    ],
    ingredients: [
      { id: "i1", recipe_id: "r1", name: "番茄", amount: "2个", sort: 0 },
      { id: "i2", recipe_id: "r1", name: "鸡蛋", amount: "3个", sort: 1 },
      { id: "i3", recipe_id: "r1", name: "盐", amount: "2g", sort: 2 },
    ],
    prepItems: [{ id: "p1", recipe_id: "r1", content: "番茄切块", sort: 0 }],
    steps: [{ id: "s1", recipe_id: "r1", content: "炒5分钟", duration: 5, sort: 0 }],
    notes: [{ id: "n1", recipe_id: "r1", content: "好吃", created_at: 3000 }],
  };
  const result = convertBackup(backup);
  assert.equal(result.recipes.length, 1);
  const recipe = result.recipes[0];
  assert.equal(recipe.name, "番茄炒蛋");
  assert.equal(recipe.servings, 2);
  assert.equal(recipe.ingredients.length, 3);
  const tomato = recipe.ingredients.find((i) => i.name === "番茄");
  assert.equal(tomato?.qty, 2);
  assert.equal(tomato?.unit, "个");
  assert.equal(tomato?.group, "main");
  assert.equal(recipe.base.qty, 2);
  assert.equal(recipe.steps[0].durationSec, 300);
  assert.equal(recipe.prepItems[0].content, "番茄切块");
  assert.equal(recipe.notes[0].content, "好吃");
});

test("新格式备份直接归一化", () => {
  const backup = {
    app: "食记",
    version: 2,
    recipes: [
      {
        id: "r2",
        name: "白米饭",
        servings: 2,
        ingredients: [{ id: "i1", name: "大米", group: "main", qty: 200, unit: "g" }],
        steps: [{ id: "s1", content: "煮饭", durationSec: 1800 }],
      },
    ],
  };
  const result = convertBackup(backup);
  assert.equal(result.recipes[0].name, "白米饭");
  assert.equal(result.recipes[0].steps[0].durationSec, 1800);
  assert.equal(result.recipes[0].base.qty, 200);
});
