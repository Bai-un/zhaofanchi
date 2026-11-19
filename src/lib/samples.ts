import type { Recipe } from "../types.ts";
import { newId } from "./uuid.ts";
import { syncBase } from "./recipe.ts";

function id(): string {
  return newId();
}

export function sampleRecipes(): Recipe[] {
  const now = Date.now();
  const tomato: Recipe = {
    id: id(),
    name: "番茄炒蛋",
    description: "示例菜谱：酸甜下饭，十几分钟就能上桌。",
    servings: 2,
    prepTime: 8,
    cookTime: 10,
    tags: ["示例", "家常", "快手"],
    isPinned: false,
    createdAt: now - 2000,
    updatedAt: now - 2000,
    base: { ingredientId: null, qty: null, unit: "" },
    ingredients: [
      { id: id(), name: "番茄", group: "main", qty: 2, unit: "个", scaleRule: "linear", isBase: true, amountText: "2个" },
      { id: id(), name: "鸡蛋", group: "main", qty: 3, unit: "个", scaleRule: "linear", isBase: false, amountText: "3个" },
      { id: id(), name: "小葱", group: "side", qty: 1, unit: "根", scaleRule: "linear", isBase: false, amountText: "1根" },
      { id: id(), name: "盐", group: "seasoning", qty: 2, unit: "g", scaleRule: "linear", isBase: false, amountText: "2g" },
      { id: id(), name: "白糖", group: "seasoning", qty: 3, unit: "g", scaleRule: "linear", isBase: false, amountText: "3g" },
      { id: id(), name: "食用油", group: "seasoning", qty: 15, unit: "ml", scaleRule: "linear", isBase: false, amountText: "15ml" },
    ],
    prepItems: [
      { id: id(), content: "番茄切块", durationSec: 180, timerTag: "切" },
      { id: id(), content: "鸡蛋打散", durationSec: 120, timerTag: "" },
      { id: id(), content: "小葱切末", durationSec: 60, timerTag: "切" },
    ],
    steps: [
      { id: id(), content: "热锅倒油，油热后倒入蛋液", durationSec: 60, timerTag: "炒" },
      { id: id(), content: "鸡蛋凝固后盛出备用", durationSec: 120, timerTag: "炒" },
      { id: id(), content: "下番茄翻炒出汁", durationSec: 180, timerTag: "炒" },
      { id: id(), content: "倒回鸡蛋，加盐和糖调味", durationSec: 60, timerTag: "炒" },
      { id: id(), content: "撒葱花，翻匀出锅", durationSec: 30, timerTag: "" },
    ],
    notes: [{ id: id(), content: "示例菜谱，可编辑或删除", createdAt: now - 1000 }],
  };

  const rice: Recipe = {
    id: id(),
    name: "白米饭",
    description: "示例菜谱：米 200g 配水 300ml，按主料缩放时水会一起变。",
    servings: 2,
    prepTime: 3,
    cookTime: 35,
    tags: ["示例", "主食"],
    isPinned: false,
    createdAt: now - 1000,
    updatedAt: now - 1000,
    base: { ingredientId: null, qty: null, unit: "" },
    ingredients: [
      { id: id(), name: "大米", group: "main", qty: 200, unit: "g", scaleRule: "linear", isBase: true, amountText: "200g" },
      { id: id(), name: "清水", group: "side", qty: 300, unit: "ml", scaleRule: "linear", isBase: false, amountText: "300ml" },
    ],
    prepItems: [{ id: id(), content: "淘米两遍", durationSec: 120, timerTag: "洗" }],
    steps: [
      { id: id(), content: "米和水放入电饭煲", durationSec: 60, timerTag: "" },
      { id: id(), content: "启动煮饭程序", durationSec: 1800, timerTag: "煮" },
      { id: id(), content: "煮好后焖 5 分钟再开盖", durationSec: 300, timerTag: "焖" },
    ],
    notes: [{ id: id(), content: "示例菜谱：按主料把米改成 300g，水会自动变成 450ml", createdAt: now - 500 }],
  };

  return [syncBase(tomato), syncBase(rice)];
}
