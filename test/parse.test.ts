import test from "node:test";
import assert from "node:assert/strict";
import { extractDurationSec, parseRecipeText } from "../src/lib/parse.ts";

test("解析带分区和编号的常规菜谱", () => {
  const parsed = parseRecipeText(`番茄炒蛋
2人份
用料：
番茄 2个
鸡蛋 3个
盐 2g
做法：
1. 番茄切块
2. 鸡蛋打散
3. 热锅倒油，炒5分钟`);
  assert.equal(parsed.name, "番茄炒蛋");
  assert.equal(parsed.servings, 2);
  assert.equal(parsed.ingredients.length, 3);
  const tomato = parsed.ingredients.find((i) => i.name.includes("番茄"));
  assert.equal(tomato?.qty, 2);
  assert.equal(tomato?.unit, "个");
  assert.equal(tomato?.group, "main");
  const salt = parsed.ingredients.find((i) => i.name === "盐");
  assert.equal(salt?.group, "seasoning");
  assert.equal(salt?.qty, 2);
  assert.equal(parsed.steps.length, 3);
  assert.equal(parsed.steps[2].durationSec, 300);
});

test("解析带 emoji、话题和中文冒号的社媒文案", () => {
  const parsed = parseRecipeText(`🔥番茄炒蛋｜10分钟快手菜 #家常菜# #下饭#
2人份
食材：
- 番茄：2个
- 鸡蛋：3个
- 盐：适量
做法：
① 番茄切块
② 鸡蛋打散
③ 大火炒3分钟`);
  assert.equal(parsed.name, "番茄炒蛋");
  assert.deepEqual(parsed.tags.sort(), ["下饭", "家常菜"].sort());
  assert.equal(parsed.ingredients.length, 3);
  assert.equal(parsed.ingredients.find((i) => i.name === "盐")?.qty, null);
  assert.equal(parsed.steps.length, 3);
  assert.equal(parsed.steps[2].durationSec, 180);
});

test("一行多料会拆开", () => {
  const parsed = parseRecipeText("米饭 200g 水 300ml");
  assert.equal(parsed.ingredients.length, 2);
  const rice = parsed.ingredients.find((i) => i.name.includes("米饭"));
  const water = parsed.ingredients.find((i) => i.name.includes("水"));
  assert.equal(rice?.qty, 200);
  assert.equal(rice?.unit, "g");
  assert.equal(water?.qty, 300);
  assert.equal(water?.unit, "ml");
});

test("解析备菜区与备菜时长", () => {
  const parsed = parseRecipeText(`红烧肉
3人份
备菜：
1. 五花肉切块
2. 腌肉20分钟
用料：
五花肉 500g
生抽 2勺
做法：
1. 下锅煸炒
2. 小火炖40分钟`);
  assert.equal(parsed.prepItems.length, 2);
  assert.equal(parsed.prepItems[1].durationSec, 1200);
  assert.equal(parsed.steps[1].durationSec, 2400);
  const pork = parsed.ingredients.find((i) => i.name === "五花肉");
  assert.equal(pork?.group, "main");
  const soy = parsed.ingredients.find((i) => i.name === "生抽");
  assert.equal(soy?.group, "seasoning");
  assert.equal(soy?.qty, 2);
});

test("时长提取支持小时和范围", () => {
  assert.equal(extractDurationSec("小火炖1小时"), 3600);
  assert.equal(extractDurationSec("焖20-25分钟"), 1500);
  assert.equal(extractDurationSec("蒸10分钟"), 600);
  assert.equal(extractDurationSec("没有时长"), 0);
});

test("无结构文本兜底成一条步骤并给出警告", () => {
  const parsed = parseRecipeText("今天随便做点好吃的，冰箱里有什么就放什么。");
  assert.equal(parsed.name, "未命名菜谱");
  assert.equal(parsed.steps.length, 1);
  assert.ok(parsed.warnings.length > 0);
});
